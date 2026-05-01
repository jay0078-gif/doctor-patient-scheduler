import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'rajesh@doctor.com' })
  email: string;

  @ApiProperty({ example: 'doctor123' })
  password: string;
}
