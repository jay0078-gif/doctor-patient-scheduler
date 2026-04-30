import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDoctorDto } from './dto/signup-doctor.dto';
import { SignupPatientDto } from './dto/signup-patient.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup/doctor')
  signupDoctor(@Body() dto: SignupDoctorDto) {
    return this.authService.signupDoctor(dto);
  }

  @Post('signup/patient')
  signupPatient(@Body() dto: SignupPatientDto) {
    return this.authService.signupPatient(dto);
  }

  @Post('login/doctor')
  loginDoctor(@Body() dto: LoginDto) {
    return this.authService.loginDoctor(dto);
  }

  @Post('login/patient')
  loginPatient(@Body() dto: LoginDto) {
    return this.authService.loginPatient(dto);
  }
}
