import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Doctor } from './doctor.entity';
import { DoctorAvailability } from './doctor-availability.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Doctor, DoctorAvailability])],
  exports: [TypeOrmModule], // important if other modules need Doctor
})
export class DoctorsModule {}
