import { ApiProperty } from '@nestjs/swagger';

export class CreateAppointmentDto {
  @ApiProperty({ example: 'Amit Patel' })
  patientName: string;

  @ApiProperty({ example: '9000000001' })
  patientMobile: string;

  @ApiProperty({ example: '2026-05-02' })
  date: string;

  @ApiProperty({ example: '09:00' })
  time: string;
}
