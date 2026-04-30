import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment, AppointmentStatus } from './appointment.entity';
import { Doctor } from '../doctors/doctor.entity';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment)
    private appointmentRepository: Repository<Appointment>,
    @InjectRepository(Doctor)
    private doctorRepository: Repository<Doctor>,
  ) {}

  private toMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private async getNextAvailableDates(
    doctorId: number,
    fromDate: string,
    totalSlots: number,
  ): Promise<string[]> {
    const results: string[] = [];
    const current = new Date(fromDate);

    while (results.length < 3) {
      current.setDate(current.getDate() + 1);
      if (current.getDay() === 0) continue;

      const dateStr = current.toISOString().split('T')[0];
      const count = await this.appointmentRepository.count({
        where: {
          doctor_id: doctorId,
          appointment_date: dateStr,
          status: AppointmentStatus.BOOKED,
        },
      });

      if (count < totalSlots) results.push(dateStr);
    }

    return results;
  }

  async bookAppointment(dto: CreateAppointmentDto) {
    // Step 1 - Sunday check
    const date = new Date(dto.date);
    if (date.getDay() === 0) {
      return { message: 'Appointments are not available on Sundays' };
    }

    // Step 2 - Fetch doctor
    const doctor = await this.doctorRepository.findOne({
      where: { doctor_id: dto.doctorId },
    });
    if (!doctor) {
      return { message: 'Doctor not found' };
    }

    // Step 3 - Calculate total slots
    const totalSlots =
      (this.toMinutes(doctor.end_time) - this.toMinutes(doctor.start_time)) /
      doctor.slot_duration;

    // Step 4 - Count booked appointments for this date
    const bookedCount = await this.appointmentRepository.count({
      where: {
        doctor_id: dto.doctorId,
        appointment_date: dto.date,
        status: AppointmentStatus.BOOKED,
      },
    });

    // Step 5 - If fully booked, return next 3 available dates
    if (bookedCount >= totalSlots) {
      const nextDates = await this.getNextAvailableDates(
        dto.doctorId,
        dto.date,
        totalSlots,
      );
      return {
        message:
          'No slots available on this date. Here are the next available dates:',
        nextAvailableDates: nextDates,
      };
    }

    // Step 6 - Find next available slot number
    const bookedSlots = await this.appointmentRepository.find({
      where: {
        doctor_id: dto.doctorId,
        appointment_date: dto.date,
        status: AppointmentStatus.BOOKED,
      },
      select: ['slot_number'],
    });

    const takenSlotNumbers = bookedSlots.map((a) => a.slot_number);
    let nextSlot = 1;
    while (takenSlotNumbers.includes(nextSlot)) nextSlot++;

    // Step 7 - Calculate reporting time
    const startMinutes = this.toMinutes(doctor.start_time);
    const reportingMinutes =
      startMinutes + (nextSlot - 1) * doctor.slot_duration;
    const hours = Math.floor(reportingMinutes / 60)
      .toString()
      .padStart(2, '0');
    const mins = (reportingMinutes % 60)
      .toString()

      .padStart(2, '0');
    const reportingTime = `${hours}:${mins}`;

    // Step 8 - Save appointment
    const appointment = this.appointmentRepository.create({
      doctor_id: dto.doctorId,
      patient_id: dto.patientId,
      appointment_date: dto.date,
      slot_number: nextSlot,
      status: AppointmentStatus.BOOKED,
    });

    const saved = await this.appointmentRepository.save(appointment);

    return {
      message: 'Appointment booked successfully!',
      token: nextSlot,
      reportingTime,
      appointment: saved,
    };
  }
}
