import { Controller, Post, Body } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  async bookAppointment(@Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.bookAppointment(dto);
  }
}