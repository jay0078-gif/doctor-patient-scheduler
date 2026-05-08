import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Doctor } from './doctor.entity';
import { DoctorAvailability } from './doctor-availability.entity';
import { DoctorsController } from './doctors.controller';
import { DoctorsService } from './doctors.service';

@Module({
  imports: [TypeOrmModule.forFeature([Doctor, DoctorAvailability])],
  controllers: [DoctorsController],
  providers: [DoctorsService],
  exports: [TypeOrmModule],
})
export class DoctorsModule {}
