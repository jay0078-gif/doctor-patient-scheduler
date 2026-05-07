import { ApiProperty } from '@nestjs/swagger';

export class SignupDoctorDto {
  @ApiProperty({ example: 'John' })
  first_name: string;

  @ApiProperty({ example: 'Doe' })
  last_name: string;

  @ApiProperty({ example: 'Cardiology' })
  specialty: string;

  @ApiProperty({ example: 'doctor@example.com' })
  email: string;

  @ApiProperty({ example: 'password123' })
  password: string;

  @ApiProperty({ example: '09:00' })
  start_time: string;

  @ApiProperty({ example: '17:00' })
  end_time: string;

  @ApiProperty({ example: 30 })
  slot_duration: number;

  @ApiProperty({ example: 10 })
  max_patients: number;
}
