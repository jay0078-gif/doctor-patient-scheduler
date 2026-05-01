import { ApiProperty } from '@nestjs/swagger';

export class RescheduleDto {
  @ApiProperty({ example: true })
  accept: boolean;
}
