import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Doctor } from '../doctors/doctor.entity';
import { Patient } from '../patients/patient.entity';
import { DoctorAvailability } from '../doctors/doctor-availability.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Doctor, Patient, DoctorAvailability]),
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'fallback_secret',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
