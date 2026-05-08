import { ApiProperty } from '@nestjs/swagger';

export class CreateWaveNonRecurringDto {
  @ApiProperty({ example: '2026-05-10' })
  specific_date: string;

  @ApiProperty({ example: '10:00' })
  start_time: string;

  @ApiProperty({ example: '12:00' })
  end_time: string;

  @ApiProperty({ example: 30 })
  slot_duration: number;

  @ApiProperty({ example: 4 })
  max_patients: number;
}
