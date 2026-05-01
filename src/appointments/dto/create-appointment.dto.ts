// import { ApiProperty } from '@nestjs/swagger';

// export class CreateAppointmentDto {
//   @ApiProperty({ example: 'Amit Patel' })
//   patientName: string;

//   @ApiProperty({ example: '9000000001' })
//   patientMobile: string;
// }

import { ApiProperty } from '@nestjs/swagger';

export class CreateAppointmentDto {
  @ApiProperty({ example: 'Amit Patel' })
  patientName: string;

  @ApiProperty({ example: '9000000001' })
  patientMobile: string;
}
