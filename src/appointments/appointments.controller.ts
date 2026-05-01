import {
  Controller,
  Post,
  Patch,
  Get,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { RescheduleDto } from './dto/reschedule.dto';

@ApiTags('Appointments')
@Controller()
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get('doctor/:doctorId/availability')
  @ApiQuery({ name: 'date', required: false, example: '2026-05-02' })
  getDoctorAvailability(
    @Param('doctorId') doctorId: number,
    @Query('date') date?: string,
  ) {
    return this.appointmentsService.getDoctorAvailability(doctorId, date);
  }

  @Post('doctor/:doctorId/appointment')
  bookAppointment(
    @Param('doctorId') doctorId: number,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointmentsService.bookAppointment(doctorId, dto);
  }

  @Patch('appointments/:id/cancel')
  cancelAppointment(@Param('id') id: number) {
    return this.appointmentsService.cancelAppointment(id);
  }

  @Patch('appointments/:id/reschedule')
  rescheduleAppointment(@Param('id') id: number, @Body() body: RescheduleDto) {
    return this.appointmentsService.rescheduleAppointment(id, body.accept);
  }
}
