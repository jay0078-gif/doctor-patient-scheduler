import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DoctorsService } from './doctors.service';
import { CreateWaveRecurringDto } from './dto/create-wave-recurring.dto';
import { CreateWaveNonRecurringDto } from './dto/create-wave-non-recurring.dto';
import { CreateStreamDto } from './dto/create-stream.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Doctor Availability')
@Controller('doctor')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Post(':doctorId/availability/wave/recurring')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  setWaveRecurring(
    @Param('doctorId') doctorId: number,
    @Body() dto: CreateWaveRecurringDto,
  ) {
    return this.doctorsService.setWaveRecurring(doctorId, dto);
  }

  @Post(':doctorId/availability/wave/non-recurring')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  setWaveNonRecurring(
    @Param('doctorId') doctorId: number,
    @Body() dto: CreateWaveNonRecurringDto,
  ) {
    return this.doctorsService.setWaveNonRecurring(doctorId, dto);
  }

  @Post(':doctorId/availability/stream')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  setStream(
    @Param('doctorId') doctorId: number,
    @Body() dto: CreateStreamDto,
  ) {
    return this.doctorsService.setStream(doctorId, dto);
  }
}