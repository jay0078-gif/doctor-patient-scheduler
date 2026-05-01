import { ApiProperty } from '@nestjs/swagger';

export class SignupPatientDto {
  @ApiProperty({ example: 'Amit' })
  first_name: string;

  @ApiProperty({ example: 'Patel' })
  last_name: string;

  @ApiProperty({ example: 'Chest pain' })
  problem: string;

  @ApiProperty({ example: 'amit@patient.com' })
  email: string;

  @ApiProperty({ example: 'patient123' })
  password: string;
}
