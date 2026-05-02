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

  private toMinutes(time: string): number {
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

  private async getTotalSlots(
    availability: DoctorAvailability,
  ): Promise<number> {
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
    const totalSlots = await this.getTotalSlots(availability);

    const allExisting = await this.appointmentRepository.find({
      where: {
        doctor_id: doctorId,
        appointment_date: dateStr,
      },
      select: ['slot_number'],
    });

    const takenSlots = allExisting.map((a) => a.slot_number);
    const startMinutes = this.toMinutes(availability.start_time);
    const endMinutes = this.toMinutes(availability.end_time);
    const timeSlots: string[] = [];

    for (let slot = 1; slot <= totalSlots; slot++) {
      const minutes = startMinutes + (slot - 1) * availability.slot_duration;

      // Stop if beyond end time
      if (minutes >= endMinutes) break;

      if (!takenSlots.includes(slot)) {
        const hours = Math.floor(minutes / 60)
          .toString()
          .padStart(2, '0');
        const mins = (minutes % 60).toString().padStart(2, '0');
        timeSlots.push(`${hours}:${mins}`);
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
    const hours = Math.floor(reportingMinutes / 60)
      .toString()
      .padStart(2, '0');
    const mins = (reportingMinutes % 60).toString().padStart(2, '0');
    return `${hours}:${mins}`;
  }

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
          where: {
            doctor_id: doctorId,
            day_of_week: dayOfWeek,
            is_available: true,
          },
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

    const totalSlots = await this.getTotalSlots(availability);

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

  async bookAppointment(doctorId: number, dto: CreateAppointmentDto) {
    // Step 1 - Fetch doctor
    const doctor = await this.doctorRepository.findOne({
      where: { doctor_id: doctorId },
    });
    if (!doctor) return { message: 'Doctor not found' };

    // Step 2 - Check requested date
    const requestedDate = dto.date;
    const dayOfWeek = this.getDayOfWeek(requestedDate);

    if (!dayOfWeek) {
      return { message: 'Appointments are not available on Sundays' };
    }

    // Step 3 - Check doctor availability for that day
    const availability = await this.availabilityRepository.findOne({
      where: {
        doctor_id: doctorId,
        day_of_week: dayOfWeek,
        is_available: true,
      },
    });

    if (!availability) {
      return { message: 'Doctor is not available on this day' };
    }

    // Step 4 - Calculate total slots
    const totalSlots = await this.getTotalSlots(availability);

    // Step 5 - Check if requested time is within working hours
    const requestedTimeMinutes = this.toMinutes(dto.time);
    const startMinutes = this.toMinutes(availability.start_time);
    const endMinutes = this.toMinutes(availability.end_time);

    if (
      requestedTimeMinutes < startMinutes ||
      requestedTimeMinutes >= endMinutes
    ) {
      return {
        message: `Requested time is outside doctor's working hours (${availability.start_time} - ${availability.end_time})`,
      };
    }

    // Step 6 - Calculate slot number from requested time
    const requestedSlot =
      Math.floor(
        (requestedTimeMinutes - startMinutes) / availability.slot_duration,
      ) + 1;

    // Step 7 - Get ALL existing slots for this date (booked + cancelled)
    const allExistingSlots = await this.appointmentRepository.find({
      where: {
        doctor_id: doctorId,
        appointment_date: requestedDate,
      },
      select: ['slot_number', 'status'],
    });

    const allTakenSlotNumbers = allExistingSlots.map((a) => a.slot_number);
    const bookedSlotNumbers = allExistingSlots
      .filter((a) => a.status === AppointmentStatus.BOOKED)
      .map((a) => a.slot_number);

    // Step 8 - Check if requested slot is available
    const requestedSlotTaken = allTakenSlotNumbers.includes(requestedSlot);
    const todayFullyBooked = bookedSlotNumbers.length >= totalSlots;

    // Step 9 - If slot taken or day full, find next available dates
    if (requestedSlotTaken || todayFullyBooked) {
      const nextAvailableDates: {
        date: string;
        availableTimeSlots: string[];
      }[] = [];

      const startFrom = new Date(requestedDate);

      for (
        let i = 1;
        i <= MAX_DAYS_AHEAD && nextAvailableDates.length < 3;
        i++
      ) {
        const next = new Date(startFrom);
        next.setDate(startFrom.getDate() + i);
        const nextDateStr = next.toISOString().split('T')[0];
        const nextDay = this.getDayOfWeek(nextDateStr);

        if (!nextDay) continue;

        const nextAvailability = await this.availabilityRepository.findOne({
          where: {
            doctor_id: doctorId,
            day_of_week: nextDay,
            is_available: true,
          },
        });

        if (!nextAvailability) continue;

        const nextTotal = await this.getTotalSlots(nextAvailability);

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
          nextAvailableDates.push({
            date: nextDateStr,
            availableTimeSlots: slots,
          });
        }
      }

      if (nextAvailableDates.length === 0) {
        return {
          message: `No appointments available in the next ${MAX_DAYS_AHEAD} days. Please try after sometime.`,
        };
      }

      return {
        message: requestedSlotTaken
          ? `Slot at ${dto.time} on ${requestedDate} is already taken. Here are the next available slots:`
          : `No slots available on ${requestedDate}. Here are the next available slots:`,
        nextAvailableDates,
      };
    }

    // Step 10 - Book the requested slot
    const reportingTime = await this.getReportingTime(
      doctorId,
      requestedDate,
      requestedSlot,
    );

    const appointment = this.appointmentRepository.create({
      doctor_id: doctorId,
      patient_name: dto.patientName,
      patient_mobile: dto.patientMobile,
      appointment_date: requestedDate,
      slot_number: requestedSlot,
      status: AppointmentStatus.BOOKED,
    });

    const saved = await this.appointmentRepository.save(appointment);

    return {
      message: 'Appointment booked successfully!',
      bookedFor: requestedDate,
      token: requestedSlot,
      reportingTime,
      appointment: saved,
    };
  }

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
    if (appointment.appointment_date !== today) {
      return { message: 'Appointment cancelled successfully.' };
    }

    const todayAvailability = await this.availabilityRepository.findOne({
      where: {
        doctor_id: appointment.doctor_id,
        day_of_week: this.getDayOfWeek(today)!,
        is_available: true,
      },
    });

    if (!todayAvailability) {
      return { message: 'Appointment cancelled successfully.' };
    }

    const totalSlots = await this.getTotalSlots(todayAvailability);

    const todayBooked = await this.appointmentRepository.count({
      where: {
        doctor_id: appointment.doctor_id,
        appointment_date: today,
        status: AppointmentStatus.BOOKED,
      },
    });

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

  async rescheduleAppointment(id: number, accept: boolean) {
    const appointment = await this.appointmentRepository.findOne({
      where: { appointments_id: id },
    });
    if (!appointment) return { message: 'Appointment not found' };

    if (!accept) {
      const nextPatient = await this.appointmentRepository.findOne({
        where: {
          doctor_id: appointment.doctor_id,
          appointment_date: appointment.appointment_date,
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

      return {
        message: 'Reschedule declined. Your original appointment is kept.',
      };
    }

    const today = this.getTodayStr();
    const todayDayOfWeek = this.getDayOfWeek(today);

    if (!todayDayOfWeek) {
      return { message: 'Cannot reschedule. Today is a non-working day.' };
    }

    const todayAvailability = await this.availabilityRepository.findOne({
      where: {
        doctor_id: appointment.doctor_id,
        day_of_week: todayDayOfWeek,
        is_available: true,
      },
    });

    if (!todayAvailability) {
      return { message: 'Cannot reschedule. Doctor not available today.' };
    }

    const totalSlots = await this.getTotalSlots(todayAvailability);

    const todayBooked = await this.appointmentRepository.count({
      where: {
        doctor_id: appointment.doctor_id,
        appointment_date: today,
        status: AppointmentStatus.BOOKED,
      },
    });

    if (todayBooked >= totalSlots) {
      return {
        message:
          'Sorry, today is now fully booked. Your original appointment is kept.',
      };
    }

    const allTodaySlots = await this.appointmentRepository.find({
      where: {
        doctor_id: appointment.doctor_id,
        appointment_date: today,
      },
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
