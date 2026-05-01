import { Controller, Post, Patch, Param, Body }
from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { RescheduleDto } from './dto/reschedule.dto';

@ApiTags('Appointments')
@Controller()
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

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
