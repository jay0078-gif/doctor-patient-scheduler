import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DoctorAvailability,
  DayOfWeek,
  AvailabilityType,
} from './doctor-availability.entity';
import { CreateWaveRecurringDto } from './dto/create-wave-recurring.dto';
import { CreateWaveNonRecurringDto } from './dto/create-wave-non-recurring.dto';
import { CreateStreamDto } from './dto/create-stream.dto';

@Injectable()
export class DoctorsService {
  constructor(
    @InjectRepository(DoctorAvailability)
    private availabilityRepository: Repository<DoctorAvailability>,
  ) {}

  async setWaveRecurring(doctorId: number, dto: CreateWaveRecurringDto) {
    // Delete existing WAVE_RECURRING for this doctor
    await this.availabilityRepository.delete({
      doctor_id: doctorId,
      type: AvailabilityType.WAVE_RECURRING,
    });

    // Create new WAVE_RECURRING for each day
    for (const day of dto.days) {
      if (!Object.values(DayOfWeek).includes(day as DayOfWeek)) {
        throw new BadRequestException(`Invalid day: ${day}`);
      }
      await this.availabilityRepository.save({
        doctor_id: doctorId,
        type: AvailabilityType.WAVE_RECURRING,
        day_of_week: day as DayOfWeek,
        specific_date: null,
        start_time: dto.start_time,
        end_time: dto.end_time,
        slot_duration: dto.slot_duration,
        max_patients: dto.max_patients,
        is_available: true,
      });
    }

    return { message: 'Wave recurring availability set successfully' };
  }

  async setWaveNonRecurring(doctorId: number, dto: CreateWaveNonRecurringDto) {
    // Delete existing WAVE_NON_RECURRING for this doctor on this date
    await this.availabilityRepository.delete({
      doctor_id: doctorId,
      type: AvailabilityType.WAVE_NON_RECURRING,
      specific_date: dto.specific_date,
    });

    await this.availabilityRepository.save({
      doctor_id: doctorId,
      type: AvailabilityType.WAVE_NON_RECURRING,
      day_of_week: null,
      specific_date: dto.specific_date,
      start_time: dto.start_time,
      end_time: dto.end_time,
      slot_duration: dto.slot_duration,
      max_patients: dto.max_patients,
      is_available: true,
    });

    return { message: 'Wave non-recurring availability set successfully' };
  }

  async setStream(doctorId: number, dto: CreateStreamDto) {
    // Delete existing STREAM for this doctor
    await this.availabilityRepository.delete({
      doctor_id: doctorId,
      type: AvailabilityType.STREAM,
    });

    // Create new STREAM for each day
    for (const day of dto.days) {
      if (!Object.values(DayOfWeek).includes(day as DayOfWeek)) {
        throw new BadRequestException(`Invalid day: ${day}`);
      }
      await this.availabilityRepository.save({
        doctor_id: doctorId,
        type: AvailabilityType.STREAM,
        day_of_week: day as DayOfWeek,
        specific_date: null,
        start_time: dto.start_time,
        end_time: dto.end_time,
        slot_duration: dto.slot_duration ?? 30,
        max_patients: dto.max_patients,
        is_available: true,
      });
    }

    return { message: 'Stream availability set successfully' };
  }
}
