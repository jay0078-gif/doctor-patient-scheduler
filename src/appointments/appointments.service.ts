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

const MAX_SLOTS_PER_DAY = 30;
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

  private async findAvailableDate(doctorId: number): Promise<string | null> {
    const today = new Date();

    for (let i = 0; i < MAX_DAYS_AHEAD; i++) {
      const current = new Date(today);
      current.setDate(today.getDate() + i);
      const dateStr = current.toISOString().split('T')[0];

      const dayOfWeek = this.getDayOfWeek(dateStr);
      if (!dayOfWeek) continue;

      const availability = await this.availabilityRepository.findOne({
        where: {
          doctor_id: doctorId,
          day_of_week: dayOfWeek,
          is_available: true,
        },
      });
      if (!availability) continue;

      const bookedCount = await this.appointmentRepository.count({
        where: {
          doctor_id: doctorId,
          appointment_date: dateStr,
          status: AppointmentStatus.BOOKED,
        },
      });

      if (bookedCount < MAX_SLOTS_PER_DAY) return dateStr;
    }

    return null;
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

  async getDoctorAvailability(doctorId: number) {
    // Step 1 - Fetch doctor
    const doctor = await this.doctorRepository.findOne({
      where: { doctor_id: doctorId },
    });
    if (!doctor) return { message: 'Doctor not found' };

    // Step 2 - Get today
    const todayStr = this.getTodayStr();
    const dayOfWeek = this.getDayOfWeek(todayStr);

    // Step 3 - Get all working days for this doctor
    const allAvailability = await this.availabilityRepository.find({
      where: { doctor_id: doctorId, is_available: true },
    });

    const workingDays = allAvailability.map((a) => ({
      day: a.day_of_week,
      start_time: a.start_time,
      end_time: a.end_time,
      slot_duration_minutes: a.slot_duration,
    }));

    // Step 4 - Get today's availability
    const todayAvailability = dayOfWeek
      ? await this.availabilityRepository.findOne({
          where: {
            doctor_id: doctorId,
            day_of_week: dayOfWeek,
            is_available: true,
          },
        })
      : null;

    if (!todayAvailability) {
      return {
        doctor: {
          id: doctor.doctor_id,
          name: `${doctor.first_name} ${doctor.last_name}`,
          specialty: doctor.specialty,
        },
        workingDays,
        today: {
          date: todayStr,
          message: 'Doctor is not available today',
        },
      };
    }

    // Step 5 - Count booked and available slots
    const bookedCount = await this.appointmentRepository.count({
      where: {
        doctor_id: doctorId,
        appointment_date: todayStr,
        status: AppointmentStatus.BOOKED,
      },
    });

    const availableSlots = MAX_SLOTS_PER_DAY - bookedCount;

    // Step 6 - Generate available time slots list
    const bookedSlotNumbers = await this.appointmentRepository.find({
      where: {
        doctor_id: doctorId,
        appointment_date: todayStr,
        status: AppointmentStatus.BOOKED,
      },
      select: ['slot_number'],
    });

    const takenSlots = bookedSlotNumbers.map((a) => a.slot_number);
    const startMinutes = this.toMinutes(todayAvailability.start_time);
    const availableTimeSlots: string[] = [];

    for (let slot = 1; slot <= MAX_SLOTS_PER_DAY; slot++) {
      if (!takenSlots.includes(slot)) {
        const minutes =
          startMinutes + (slot - 1) * todayAvailability.slot_duration;
        const hours = Math.floor(minutes / 60)
          .toString()
          .padStart(2, '0');
        const mins = (minutes % 60).toString().padStart(2, '0');
        availableTimeSlots.push(`${hours}:${mins}`);
      }
    }

    return {
      doctor: {
        id: doctor.doctor_id,
        name: `${doctor.first_name} ${doctor.last_name}`,
        specialty: doctor.specialty,
      },
      workingDays,
      today: {
        date: todayStr,
        day: dayOfWeek,
        start_time: todayAvailability.start_time,
        end_time: todayAvailability.end_time,
        slot_duration_minutes: todayAvailability.slot_duration,
        totalSlots: MAX_SLOTS_PER_DAY,
        bookedSlots: bookedCount,
        availableSlots,
        status: availableSlots > 0 ? 'Available' : 'Fully Booked',
        availableTimeSlots,
      },
    };
  }

  async bookAppointment(doctorId: number, dto: CreateAppointmentDto) {
    const doctor = await this.doctorRepository.findOne({
      where: { doctor_id: doctorId },
    });
    if (!doctor) return { message: 'Doctor not found' };

    const availableDate = await this.findAvailableDate(doctorId);
    if (!availableDate) {
      return {
        message: `No appointments available in the next ${MAX_DAYS_AHEAD} days. Please try after sometime.`,
      };
    }

    const bookedSlots = await this.appointmentRepository.find({
      where: {
        doctor_id: doctorId,
        appointment_date: availableDate,
      },
      select: ['slot_number'],
    });

    const takenSlots = bookedSlots.map((a) => a.slot_number);
    let nextSlot = 1;
    while (takenSlots.includes(nextSlot)) nextSlot++;

    const reportingTime = await this.getReportingTime(
      doctorId,
      availableDate,
      nextSlot,
    );

    const appointment = this.appointmentRepository.create({
      doctor_id: doctorId,
      patient_name: dto.patientName,
      patient_mobile: dto.patientMobile,
      appointment_date: availableDate,
      slot_number: nextSlot,
      status: AppointmentStatus.BOOKED,
    });

    const saved = await this.appointmentRepository.save(appointment);
    const isToday = availableDate === this.getTodayStr();

    return {
      message: 'Appointment booked successfully!',
      bookedFor: isToday ? 'Today' : availableDate,
      token: nextSlot,
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

    const todayBooked = await this.appointmentRepository.count({
      where: {
        doctor_id: appointment.doctor_id,
        appointment_date: today,
        status: AppointmentStatus.BOOKED,
      },
    });

    if (todayBooked < MAX_SLOTS_PER_DAY) {
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

    const todayBooked = await this.appointmentRepository.count({
      where: {
        doctor_id: appointment.doctor_id,
        appointment_date: today,
        status: AppointmentStatus.BOOKED,
      },
    });

    if (todayBooked >= MAX_SLOTS_PER_DAY) {
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
