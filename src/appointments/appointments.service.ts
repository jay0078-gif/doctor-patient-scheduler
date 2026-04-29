import { Injectable } from '@nestjs/common';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Injectable()
export class AppointmentsService {
  async bookAppointment(_dto: CreateAppointmentDto) {
    return { message: 'Appointment booked successfully' };
  }
}
