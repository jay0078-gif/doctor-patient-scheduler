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

  async bookAppointment(doctorId: number, dto: CreateAppointmentDto) {
    // Step 1 - Fetch doctor
    const doctor = await this.doctorRepository.findOne({
      where: { doctor_id: doctorId },
    });
    if (!doctor) return { message: 'Doctor not found' };

    // Step 2 - Find next available date within 5 days
    const availableDate = await this.findAvailableDate(doctorId);
    if (!availableDate) {
      return {
        message: `No appointments available in the next ${MAX_DAYS_AHEAD} days. Please try after sometime.`,
      };
    }

    // Step 3 - Find next available slot number
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

    // Step 4 - Calculate reporting time
    const reportingTime = await this.getReportingTime(
      doctorId,
      availableDate,
      nextSlot,
    );

    // Step 5 - Save appointment
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

    // Cancel it
    appointment.status = AppointmentStatus.CANCELLED;
    await this.appointmentRepository.save(appointment);

    // Check if today now has a free slot
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

    // Accept — move to today
    const today = this.getTodayStr();

    // Check today still has a free slot
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

    // Find next FREE slot today — ALL rows regardless of status
    // because cancelled slots still occupy the unique constraint
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
