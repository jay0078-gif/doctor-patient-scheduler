import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment, AppointmentStatus } from './appointment.entity';
import { Doctor } from '../doctors/doctor.entity';
import {
  DoctorAvailability,
  DayOfWeek,
  AvailabilityType,
} from '../doctors/doctor-availability.entity';
import { MailService } from '../mail/mail.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

const MAX_DAYS_AHEAD = 5;

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment)
    private appointmentRepository: Repository<Appointment>,
    @InjectRepository(Doctor)
    private doctorRepository: Repository<Doctor>,
    @InjectRepository(DoctorAvailability)
    private availabilityRepository: Repository<DoctorAvailability>,
    private mailService: MailService,
  ) {}

  private toMinutes(time: string): number {
    if (!time) throw new Error(`toMinutes received invalid value: "${time}"`);
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private getDayOfWeek(dateStr: string): DayOfWeek | null {
    const days = [
      null,
      DayOfWeek.MONDAY,
      DayOfWeek.TUESDAY,
      DayOfWeek.WEDNESDAY,
      DayOfWeek.THURSDAY,
      DayOfWeek.FRIDAY,
      DayOfWeek.SATURDAY,
    ];
    return days[new Date(dateStr).getDay()];
  }

  private getTodayStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  // ✅ null/undefined guard
  private toDateStr(value: string | Date | null | undefined): string {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString().split('T')[0];
    return value.split('T')[0];
  }

  private getTotalSlots(availability: DoctorAvailability): number {
    return Math.floor(
      (this.toMinutes(availability.end_time) -
        this.toMinutes(availability.start_time)) /
        availability.slot_duration,
    );
  }

  // ─────────────────────────────────────────────
  // KEY METHOD: Get effective availability for a date
  // Priority: STREAM > WAVE_NON_RECURRING > WAVE_RECURRING
  // ─────────────────────────────────────────────
  private async getEffectiveAvailability(
    doctorId: number,
    dateStr: string,
  ): Promise<DoctorAvailability | null> {
    const dayOfWeek = this.getDayOfWeek(dateStr);

    // Priority 1 — Check STREAM for this day of week
    if (dayOfWeek) {
      const stream = await this.availabilityRepository.findOne({
        where: {
          doctor_id: doctorId,
          type: AvailabilityType.STREAM,
          day_of_week: dayOfWeek,
          is_available: true,
        },
      });
      if (stream) return stream;
    }

    // Priority 2 — Check WAVE_NON_RECURRING for this specific date
    // ✅ FIX: null check on specific_date before calling toDateStr
    const allNonRecurring = await this.availabilityRepository.find({
      where: {
        doctor_id: doctorId,
        type: AvailabilityType.WAVE_NON_RECURRING,
        is_available: true,
      },
    });

    const nonRecurring = allNonRecurring.find(
      (a) =>
        a.specific_date != null && this.toDateStr(a.specific_date) === dateStr,
    );
    if (nonRecurring) return nonRecurring;

    // Priority 3 — Fall back to WAVE_RECURRING for this day of week
    if (dayOfWeek) {
      const recurring = await this.availabilityRepository.findOne({
        where: {
          doctor_id: doctorId,
          type: AvailabilityType.WAVE_RECURRING,
          day_of_week: dayOfWeek,
          is_available: true,
        },
      });
      if (recurring) return recurring;
    }

    return null;
  }

  private async getAvailableTimeSlots(
    doctorId: number,
    dateStr: string,
    availability: DoctorAvailability,
  ): Promise<string[]> {
    const totalSlots = this.getTotalSlots(availability);

    const allExisting = await this.appointmentRepository.find({
      where: { doctor_id: doctorId, appointment_date: dateStr },
      select: ['slot_number'],
    });

    const takenSlots = allExisting.map((a) => a.slot_number);
    const startMinutes = this.toMinutes(availability.start_time);
    const endMinutes = this.toMinutes(availability.end_time);
    const timeSlots: string[] = [];

    for (let slot = 1; slot <= totalSlots; slot++) {
      const minutes = startMinutes + (slot - 1) * availability.slot_duration;
      if (minutes >= endMinutes) break;
      if (!takenSlots.includes(slot)) {
        const h = Math.floor(minutes / 60)
          .toString()
          .padStart(2, '0');
        const m = (minutes % 60).toString().padStart(2, '0');
        timeSlots.push(`${h}:${m}`);
      }
    }

    return timeSlots;
  }

  private async getReportingTime(
    doctorId: number,
    dateStr: string,
    slotNumber: number,
  ): Promise<string> {
    const availability = await this.getEffectiveAvailability(doctorId, dateStr);
    if (!availability) return 'N/A';

    const startMinutes = this.toMinutes(availability.start_time);
    const reportingMinutes =
      startMinutes + (slotNumber - 1) * availability.slot_duration;
    const h = Math.floor(reportingMinutes / 60)
      .toString()
      .padStart(2, '0');
    const m = (reportingMinutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  // ─────────────────────────────────────────────
  // GET DOCTOR AVAILABILITY
  // ─────────────────────────────────────────────
  async getDoctorAvailability(doctorId: number, date?: string) {
    const doctor = await this.doctorRepository.findOne({
      where: { doctor_id: doctorId },
    });
    if (!doctor) return { message: 'Doctor not found' };

    const checkDate = date ?? this.getTodayStr();
    const dayOfWeek = this.getDayOfWeek(checkDate);

    const allAvailability = await this.availabilityRepository.find({
      where: { doctor_id: doctorId, is_available: true },
    });

    const workingDays = allAvailability.map((a) => ({
      type: a.type,
      day: a.day_of_week,
      specific_date: a.specific_date,
      start_time: a.start_time,
      end_time: a.end_time,
      slot_duration_minutes: a.slot_duration,
      max_patients: a.max_patients,
    }));

    const availability = await this.getEffectiveAvailability(
      doctorId,
      checkDate,
    );

    if (!availability) {
      return {
        doctor: {
          id: doctor.doctor_id,
          name: `${doctor.first_name} ${doctor.last_name}`,
          specialty: doctor.specialty,
        },
        workingDays,
        requestedDate: {
          date: checkDate,
          message: 'Doctor is not available on this day',
        },
      };
    }

    const totalSlots = this.getTotalSlots(availability);
    const bookedCount = await this.appointmentRepository.count({
      where: {
        doctor_id: doctorId,
        appointment_date: checkDate,
        status: AppointmentStatus.BOOKED,
      },
    });

    const effectiveMax =
      availability.max_patients > 0 ? availability.max_patients : totalSlots;

    const availableSlots = effectiveMax - bookedCount;
    const availableTimeSlots = await this.getAvailableTimeSlots(
      doctorId,
      checkDate,
      availability,
    );

    return {
      doctor: {
        id: doctor.doctor_id,
        name: `${doctor.first_name} ${doctor.last_name}`,
        specialty: doctor.specialty,
      },
      workingDays,
      requestedDate: {
        date: checkDate,
        day: dayOfWeek,
        availabilityType: availability.type,
        start_time: availability.start_time,
        end_time: availability.end_time,
        slot_duration_minutes: availability.slot_duration,
        max_patients_per_day: effectiveMax,
        totalSlots,
        bookedSlots: bookedCount,
        availableSlots,
        status: availableSlots > 0 ? 'Available' : 'Fully Booked',
        availableTimeSlots,
      },
    };
  }

  // ─────────────────────────────────────────────
  // BOOK APPOINTMENT
  // ─────────────────────────────────────────────
  async bookAppointment(
    doctorId: number,
    patientId: number,
    dto: CreateAppointmentDto,
  ) {
    const doctor = await this.doctorRepository.findOne({
      where: { doctor_id: doctorId },
    });
    if (!doctor) return { message: 'Doctor not found' };

    const requestedDate = dto.date;
    const dayOfWeek = this.getDayOfWeek(requestedDate);
    if (!dayOfWeek) {
      return { message: 'Appointments are not available on Sundays' };
    }

    const today = this.getTodayStr();
    const todayDate = new Date(today + 'T00:00:00Z');
    const reqDate = new Date(requestedDate + 'T00:00:00Z');
    const diffDays = Math.floor(
      (reqDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays < 0) {
      return { message: 'Cannot book appointments in the past' };
    }
    if (diffDays > MAX_DAYS_AHEAD) {
      return {
        message: `Appointments can only be booked up to ${MAX_DAYS_AHEAD} days in advance`,
      };
    }

    const availability = await this.getEffectiveAvailability(
      doctorId,
      requestedDate,
    );
    if (!availability) {
      return { message: `Doctor is not available on ${requestedDate}` };
    }

    const alreadyBooked = await this.appointmentRepository.findOne({
      where: {
        doctor_id: doctorId,
        patient_id: patientId,
        appointment_date: requestedDate,
        status: AppointmentStatus.BOOKED,
      },
    });
    if (alreadyBooked) {
      const reportingTime = await this.getReportingTime(
        doctorId,
        requestedDate,
        alreadyBooked.slot_number,
      );
      return {
        message: `You already have an appointment on ${requestedDate}. Token #${alreadyBooked.slot_number}, reporting time: ${reportingTime}`,
      };
    }

    const bookedCount = await this.appointmentRepository.count({
      where: {
        doctor_id: doctorId,
        appointment_date: requestedDate,
        status: AppointmentStatus.BOOKED,
      },
    });

    const totalSlots = this.getTotalSlots(availability);
    const effectiveMax =
      availability.max_patients > 0 ? availability.max_patients : totalSlots;

    if (bookedCount >= effectiveMax) {
      return await this.findNextAvailableDates(doctorId, requestedDate);
    }

    const allSlotNums = await this.appointmentRepository.find({
      where: { doctor_id: doctorId, appointment_date: requestedDate },
      select: ['slot_number'],
    });
    const takenSlots = allSlotNums.map((a) => a.slot_number);
    let nextSlot = 1;
    while (takenSlots.includes(nextSlot) && nextSlot <= totalSlots) nextSlot++;

    if (nextSlot > totalSlots) {
      return await this.findNextAvailableDates(doctorId, requestedDate);
    }

    const reportingTime = await this.getReportingTime(
      doctorId,
      requestedDate,
      nextSlot,
    );

    const appointment = this.appointmentRepository.create({
      doctor_id: doctorId,
      patient_id: patientId,
      patient_name: dto.patientName,
      patient_mobile: dto.patientMobile,
      appointment_date: requestedDate,
      slot_number: nextSlot,
      status: AppointmentStatus.BOOKED,
    });

    const saved = await this.appointmentRepository.save(appointment);

    return {
      message: 'Appointment booked successfully!',
      bookedFor: requestedDate,
      day: dayOfWeek,
      availabilityType: availability.type,
      token: nextSlot,
      reportingTime,
      appointmentId: saved.appointments_id,
    };
  }

  // ─────────────────────────────────────────────
  // HELPER: Find next available dates
  // ─────────────────────────────────────────────
  private async findNextAvailableDates(doctorId: number, fromDate: string) {
    const nextAvailableDates: { date: string; availableTimeSlots: string[] }[] =
      [];
    const startFrom = new Date(fromDate);

    for (let i = 1; i <= MAX_DAYS_AHEAD && nextAvailableDates.length < 3; i++) {
      const next = new Date(startFrom);
      next.setDate(startFrom.getDate() + i);
      const nextDateStr = next.toISOString().split('T')[0];

      const nextAvailability = await this.getEffectiveAvailability(
        doctorId,
        nextDateStr,
      );
      if (!nextAvailability) continue;

      const nextTotal = this.getTotalSlots(nextAvailability);
      const effectiveMax =
        nextAvailability.max_patients > 0
          ? nextAvailability.max_patients
          : nextTotal;

      const nextBookedCount = await this.appointmentRepository.count({
        where: {
          doctor_id: doctorId,
          appointment_date: nextDateStr,
          status: AppointmentStatus.BOOKED,
        },
      });

      if (nextBookedCount < effectiveMax) {
        const slots = await this.getAvailableTimeSlots(
          doctorId,
          nextDateStr,
          nextAvailability,
        );
        nextAvailableDates.push({
          date: nextDateStr,
          availableTimeSlots: slots,
        });
      }
    }

    if (nextAvailableDates.length === 0) {
      return {
        message: `No appointments available in the next ${MAX_DAYS_AHEAD} days. Please try again later.`,
      };
    }

    return {
      message: `No slots available on ${fromDate}. Here are the next available slots:`,
      nextAvailableDates,
    };
  }

  // ─────────────────────────────────────────────
  // CANCEL APPOINTMENT
  // ─────────────────────────────────────────────
  async cancelAppointment(id: number) {
    const appointment = await this.appointmentRepository.findOne({
      where: { appointments_id: id },
    });
    if (!appointment) return { message: 'Appointment not found' };
    if (appointment.status === AppointmentStatus.CANCELLED) {
      return { message: 'Appointment already cancelled' };
    }

    appointment.status = AppointmentStatus.CANCELLED;
    await this.appointmentRepository.save(appointment);

    const today = this.getTodayStr();
    const appointmentDateStr = this.toDateStr(appointment.appointment_date);

    if (appointmentDateStr !== today) {
      return { message: 'Appointment cancelled successfully.' };
    }

    const todayAvailability = await this.getEffectiveAvailability(
      appointment.doctor_id,
      today,
    );
    if (!todayAvailability)
      return { message: 'Appointment cancelled successfully.' };

    const totalSlots = this.getTotalSlots(todayAvailability);
    const effectiveMax =
      todayAvailability.max_patients > 0
        ? todayAvailability.max_patients
        : totalSlots;

    const todayBooked = await this.appointmentRepository.count({
      where: {
        doctor_id: appointment.doctor_id,
        appointment_date: today,
        status: AppointmentStatus.BOOKED,
      },
    });

    if (todayBooked < effectiveMax) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const firstTomorrowPatient = await this.appointmentRepository.findOne({
        where: {
          doctor_id: appointment.doctor_id,
          appointment_date: tomorrowStr,
          status: AppointmentStatus.BOOKED,
        },
        order: { slot_number: 'ASC' },
      });

      if (firstTomorrowPatient) {
        return {
          message: 'Appointment cancelled successfully.',
          rescheduleOffer: {
            appointmentId: firstTomorrowPatient.appointments_id,
            patientName: firstTomorrowPatient.patient_name,
            patientMobile: firstTomorrowPatient.patient_mobile,
            message:
              'A slot opened today! Would you like to reschedule to today?',
            action: `PATCH /appointments/${firstTomorrowPatient.appointments_id}/reschedule`,
            body: '{ "accept": true } or { "accept": false }',
          },
        };
      }
    }

    return { message: 'Appointment cancelled successfully.' };
  }

  // ─────────────────────────────────────────────
  // RESCHEDULE APPOINTMENT
  // ─────────────────────────────────────────────
  async rescheduleAppointment(id: number, accept: boolean) {
    const appointment = await this.appointmentRepository.findOne({
      where: { appointments_id: id },
    });
    if (!appointment) return { message: 'Appointment not found' };

    if (!accept) {
      const appointmentDateStr = this.toDateStr(appointment.appointment_date);
      const nextPatient = await this.appointmentRepository.findOne({
        where: {
          doctor_id: appointment.doctor_id,
          appointment_date: appointmentDateStr,
          status: AppointmentStatus.BOOKED,
        },
        order: { slot_number: 'ASC' },
      });

      if (nextPatient && nextPatient.appointments_id !== id) {
        return {
          message: 'Reschedule declined. Offering to next patient in queue.',
          nextOffer: {
            appointmentId: nextPatient.appointments_id,
            patientName: nextPatient.patient_name,
            patientMobile: nextPatient.patient_mobile,
            message:
              'A slot opened today! Would you like to reschedule to today?',
            action: `PATCH /appointments/${nextPatient.appointments_id}/reschedule`,
            body: '{ "accept": true } or { "accept": false }',
          },
        };
      }

      return { message: 'Reschedule declined. Original appointment kept.' };
    }

    const today = this.getTodayStr();
    const todayAvailability = await this.getEffectiveAvailability(
      appointment.doctor_id,
      today,
    );
    if (!todayAvailability) {
      return { message: 'Cannot reschedule. Doctor not available today.' };
    }

    const totalSlots = this.getTotalSlots(todayAvailability);
    const effectiveMax =
      todayAvailability.max_patients > 0
        ? todayAvailability.max_patients
        : totalSlots;

    const todayBooked = await this.appointmentRepository.count({
      where: {
        doctor_id: appointment.doctor_id,
        appointment_date: today,
        status: AppointmentStatus.BOOKED,
      },
    });

    if (todayBooked >= effectiveMax) {
      return {
        message: 'Sorry, today is fully booked. Original appointment kept.',
      };
    }

    const allTodaySlots = await this.appointmentRepository.find({
      where: { doctor_id: appointment.doctor_id, appointment_date: today },
      select: ['slot_number'],
    });

    const takenSlots = allTodaySlots.map((a) => a.slot_number);
    let nextSlot = 1;
    while (takenSlots.includes(nextSlot)) nextSlot++;

    const reportingTime = await this.getReportingTime(
      appointment.doctor_id,
      today,
      nextSlot,
    );

    await this.appointmentRepository.update(
      { appointments_id: id },
      { appointment_date: today, slot_number: nextSlot },
    );

    return {
      message: 'Appointment rescheduled to today!',
      newDate: today,
      token: nextSlot,
      reportingTime,
    };
  }
}
