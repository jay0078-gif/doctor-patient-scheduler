// import { Module } from '@nestjs/common';
// import { DoctorsController } from './doctors.controller';
// import { DoctorsService } from './doctors.service';
// import { Doctor } from './doctor.entity';

// @Module({
//   controllers: [DoctorsController],
//   providers: [DoctorsService]
// })
// export class DoctorsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Doctor } from './doctor.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Doctor])],
  exports: [TypeOrmModule], // important if other modules need Doctor
})
export class DoctorsModule {}
