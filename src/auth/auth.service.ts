import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Doctor } from '../doctors/doctor.entity';
import { Patient } from '../patients/patient.entity';
import { SignupDoctorDto } from './dto/signup-doctor.dto';
import { SignupPatientDto } from './dto/signup-patient.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Doctor)
    private doctorRepository: Repository<Doctor>,
    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
    private jwtService: JwtService,
  ) {}

  async signupDoctor(dto: SignupDoctorDto) {
    const exists = await this.doctorRepository.findOne({
      where: { email: dto.email },
    });
    if (exists) throw new ConflictException('Email already registered');

    const hashed = await bcrypt.hash(dto.password, 10);
    const doctor = this.doctorRepository.create({ ...dto, password: hashed });
    await this.doctorRepository.save(doctor);
    return { message: 'Doctor registered successfully' };
  }

  async signupPatient(dto: SignupPatientDto) {
    const exists = await this.patientRepository.findOne({
      where: { email: dto.email },
    });
    if (exists) throw new ConflictException('Email already registered');

    const hashed = await bcrypt.hash(dto.password, 10);
    const patient = this.patientRepository.create({ ...dto, password: hashed });
    await this.patientRepository.save(patient);
    return { message: 'Patient registered successfully' };
  }

  async loginDoctor(dto: LoginDto) {
    const doctor = await this.doctorRepository.findOne({
      where: { email: dto.email },
    });
    if (!doctor) throw new UnauthorizedException('Invalid credentials');

    const match = await bcrypt.compare(dto.password, doctor.password);
    if (!match) throw new UnauthorizedException('Invalid credentials');

    const token = this.jwtService.sign({
      sub: doctor.doctor_id,
      email: doctor.email,
      role: 'doctor',
    });
    return { access_token: token };
  }

  async loginPatient(dto: LoginDto) {
    const patient = await this.patientRepository.findOne({
      where: { email: dto.email },
    });
    if (!patient) throw new UnauthorizedException('Invalid credentials');

    const match = await bcrypt.compare(dto.password, patient.password);
    if (!match) throw new UnauthorizedException('Invalid credentials');

    const token = this.jwtService.sign({
      sub: patient.patient_id,
      email: patient.email,
      role: 'patient',
    });
    return { access_token: token };
  }
}
