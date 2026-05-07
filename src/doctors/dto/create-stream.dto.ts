import { ApiProperty } from '@nestjs/swagger';

export class CreateStreamDto {
  @ApiProperty({ example: ['MONDAY', 'TUESDAY', 'THURSDAY'] })
  days: string[];

  @ApiProperty({ example: '10:00' })
  start_time: string;

  @ApiProperty({ example: '12:00' })
  end_time: string;

  @ApiProperty({ example: 30 })
  slot_duration: number;

  @ApiProperty({ example: 9 })
  max_patients: number;
}
