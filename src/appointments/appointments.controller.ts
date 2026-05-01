import {
  Controller,
  Post,
  Patch,
  Param,
  Body,
  // UseGuards,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post('doctor/:doctorId/appointment')
  // @UseGuards(JwtAuthGuard)
  bookAppointment(
    @Param('doctorId') doctorId: number,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointmentsService.bookAppointment(doctorId, dto);
  }

  @Patch('appointments/:id/cancel')
  // @UseGuards(JwtAuthGuard)
  cancelAppointment(@Param('id') id: number) {
    return this.appointmentsService.cancelAppointment(id);
  }

  @Patch('appointments/:id/reschedule')
  // @UseGuards(JwtAuthGuard)
  rescheduleAppointment(
    @Param('id') id: number,
    @Body() body: { accept: boolean },
  ) {
    return this.appointmentsService.rescheduleAppointment(id, body.accept);
  }
}
