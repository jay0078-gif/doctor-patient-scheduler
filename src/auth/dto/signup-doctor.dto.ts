import { ApiProperty } from '@nestjs/swagger';

export class SignupDoctorDto {
  @ApiProperty({ example: 'Rajesh' })
  first_name: string;

  @ApiProperty({ example: 'Sharma' })
  last_name: string;

  @ApiProperty({ example: 'Cardiology' })
  specialty: string;

  @ApiProperty({ example: 'rajesh@doctor.com' })
  email: string;

  @ApiProperty({ example: 'doctor123' })
  password: string;

  @ApiProperty({ example: '09:00' })
  start_time: string;

  @ApiProperty({ example: '17:00' })
  end_time: string;

  @ApiProperty({ example: 16 })
  slot_duration: number;
}
