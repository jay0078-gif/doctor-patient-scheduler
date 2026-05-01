import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { Appointment } from './appointment.entity';
import { DoctorsModule } from '../doctors/doctors.module';
import { Doctor } from '../doctors/doctor.entity';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module'; // ← add this
import { Patient } from '../patients/patient.entity';
import { DoctorAvailability } from 'src/doctors/doctor-availability.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, Doctor, Patient]),
    DoctorsModule,
    DoctorAvailability,
    AuthModule,
    MailModule, // ← add this
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
