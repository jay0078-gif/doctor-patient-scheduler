import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment, AppointmentStatus } from './appointment.entity';
import { Doctor } from '../doctors/doctor.entity';
import {
  DoctorAvailability,
  DayOfWeek,
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

  // ✅ FIX 1: Guard against undefined/null time strings
  private toMinutes(time: string): number {
    if (!time) throw new Error(`toMinutes received invalid value: "${time}"`);
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // ✅ Returns null for Sunday (index 0), DayOfWeek for Mon–Sat
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

  // ✅ Normalize date — TypeORM sometimes returns Date objects, sometimes strings
  private toDateStr(value: string | Date): string {
    if (value instanceof Date) return value.toISOString().split('T')[0];
    return value.split('T')[0]; // handles "2026-05-05T00:00:00.000Z" too
  }

  private getTotalSlots(availability: DoctorAvailability): number {
    return Math.floor(
      (this.toMinutes(availability.end_time) -
        this.toMinutes(availability.start_time)) /
        availability.slot_duration,
    );
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
        const h = Math.floor(minutes / 60).toString().padStart(2, '0');
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
    const dayOfWeek = this.getDayOfWeek(dateStr);
    if (!dayOfWeek) return 'N/A';

    const availability = await this.availabilityRepository.findOne({
      where: { doctor_id: doctorId, day_of_week: dayOfWeek },
    });
    if (!availability) return 'N/A';

    const startMinutes = this.toMinutes(availability.start_time);
    const reportingMinutes =
      startMinutes + (slotNumber - 1) * availability.slot_duration;
    const h = Math.floor(reportingMinutes / 60).toString().padStart(2, '0');
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
      day: a.day_of_week,
      start_time: a.start_time,
      end_time: a.end_time,
      slot_duration_minutes: a.slot_duration,
    }));

    const availability = dayOfWeek
      ? await this.availabilityRepository.findOne({
          where: { doctor_id: doctorId, day_of_week: dayOfWeek, is_available: true },
        })
      : null;

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

    const availableSlots = totalSlots - bookedCount;
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
        start_time: availability.start_time,
        end_time: availability.end_time,
        slot_duration_minutes: availability.slot_duration,
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
    // Step 1 — Validate doctor exists
    const doctor = await this.doctorRepository.findOne({
      where: { doctor_id: doctorId },
    });
    if (!doctor) return { message: 'Doctor not found' };

    // Step 2 — Validate date is not Sunday
    const requestedDate = dto.date;
    const dayOfWeek = this.getDayOfWeek(requestedDate);
    if (!dayOfWeek) {
      return { message: 'Appointments are not available on Sundays' };
    }

    // ✅ FIX 2: Enforce max 5 days ahead from today
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

    // Step 3 — Check doctor availability for that day
    const availability = await this.availabilityRepository.findOne({
      where: { doctor_id: doctorId, day_of_week: dayOfWeek, is_available: true },
    });
    if (!availability) {
      return { message: `Doctor is not available on ${dayOfWeek}` };
    }

    // Step 4 — Check if patient already has a booking with this doctor on this date
    const existingAppointments = await this.appointmentRepository.find({
      where: {
        doctor_id: doctorId,
        appointment_date: requestedDate,
        status: AppointmentStatus.BOOKED,
      },
    });

    // ✅ FIX 3: Compare patient_name since there's no patient_id column in DB
    // If your appointments table has patient_id, use that instead
    const alreadyBooked = existingAppointments.find(
      (a) => a.patient_name === dto.patientName,
    );
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

    // Step 5 — Calculate total slots & check if fully booked
    const totalSlots = this.getTotalSlots(availability);
    const bookedSlotNumbers = existingAppointments.map((a) => a.slot_number);
    const todayFullyBooked = bookedSlotNumbers.length >= totalSlots;

    // Step 6 — If fully booked, find next available dates
    if (todayFullyBooked) {
      return await this.findNextAvailableDates(doctorId, requestedDate);
    }

    // ✅ FIX 4: Auto-assign next available slot (removed dto.time dependency)
    // Find the first slot number not yet taken
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

    // Step 7 — Calculate reporting time
    const reportingTime = await this.getReportingTime(
      doctorId,
      requestedDate,
      nextSlot,
    );

    // Step 8 — Save appointment
    const appointment = this.appointmentRepository.create({
      doctor_id: doctorId,
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
      token: nextSlot,
      reportingTime,
      appointmentId: saved.appointments_id,
    };
  }

  // ─────────────────────────────────────────────
  // HELPER: Find next available dates
  // ─────────────────────────────────────────────
  private async findNextAvailableDates(doctorId: number, fromDate: string) {
    const nextAvailableDates: { date: string; availableTimeSlots: string[] }[] = [];
    const startFrom = new Date(fromDate);

    for (let i = 1; i <= MAX_DAYS_AHEAD && nextAvailableDates.length < 3; i++) {
      const next = new Date(startFrom);
      next.setDate(startFrom.getDate() + i);
      const nextDateStr = next.toISOString().split('T')[0];
      const nextDay = this.getDayOfWeek(nextDateStr);

      if (!nextDay) continue; // skip Sunday

      const nextAvailability = await this.availabilityRepository.findOne({
        where: { doctor_id: doctorId, day_of_week: nextDay, is_available: true },
      });
      if (!nextAvailability) continue;

      const nextTotal = this.getTotalSlots(nextAvailability);
      const nextBookedCount = await this.appointmentRepository.count({
        where: {
          doctor_id: doctorId,
          appointment_date: nextDateStr,
          status: AppointmentStatus.BOOKED,
        },
      });

      if (nextBookedCount < nextTotal) {
        const slots = await this.getAvailableTimeSlots(
          doctorId,
          nextDateStr,
          nextAvailability,
        );
        nextAvailableDates.push({ date: nextDateStr, availableTimeSlots: slots });
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

    // Only trigger reschedule offer if cancelled appointment was for today
    if (appointmentDateStr !== today) {
      return { message: 'Appointment cancelled successfully.' };
    }

    const todayDayOfWeek = this.getDayOfWeek(today);
    if (!todayDayOfWeek) return { message: 'Appointment cancelled successfully.' };

    const todayAvailability = await this.availabilityRepository.findOne({
      where: { doctor_id: appointment.doctor_id, day_of_week: todayDayOfWeek, is_available: true },
    });
    if (!todayAvailability) return { message: 'Appointment cancelled successfully.' };

    const totalSlots = this.getTotalSlots(todayAvailability);
    const todayBooked = await this.appointmentRepository.count({
      where: {
        doctor_id: appointment.doctor_id,
        appointment_date: today,
        status: AppointmentStatus.BOOKED,
      },
    });

    // If a slot opened up, offer it to tomorrow's first patient
    if (todayBooked < totalSlots) {
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
            message: 'A slot opened today! Would you like to reschedule to today?',
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
      // Offer to next patient in tomorrow's queue
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
            message: 'A slot opened today! Would you like to reschedule to today?',
            action: `PATCH /appointments/${nextPatient.appointments_id}/reschedule`,
            body: '{ "accept": true } or { "accept": false }',
          },
        };
      }

      return { message: 'Reschedule declined. Original appointment kept.' };
    }

    // Accept — move to today
    const today = this.getTodayStr();
    const todayDayOfWeek = this.getDayOfWeek(today);
    if (!todayDayOfWeek) {
      return { message: 'Cannot reschedule. Today is a non-working day (Sunday).' };
    }

    const todayAvailability = await this.availabilityRepository.findOne({
      where: { doctor_id: appointment.doctor_id, day_of_week: todayDayOfWeek, is_available: true },
    });
    if (!todayAvailability) {
      return { message: 'Cannot reschedule. Doctor not available today.' };
    }

    const totalSlots = this.getTotalSlots(todayAvailability);
    const todayBooked = await this.appointmentRepository.count({
      where: {
        doctor_id: appointment.doctor_id,
        appointment_date: today,
        status: AppointmentStatus.BOOKED,
      },
    });

    if (todayBooked >= totalSlots) {
      return { message: 'Sorry, today is fully booked. Original appointment kept.' };
    }

    // Find next free slot today
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
