import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });

  async sendRescheduleEmail(
    to: string,
    patientName: string,
    nextDates: string[],
  ): Promise<void> {
    await this.transporter.sendMail({
      from: process.env.MAIL_USER,
      to,
      subject: 'Appointment Unavailable – Next Available Dates',
      text: `Dear ${patientName},

The date you requested is fully booked.

Here are the next 3 available dates:
1. ${nextDates[0]}
2. ${nextDates[1]}
3. ${nextDates[2]}

Please book one of the above dates.

Regards,
Doctor Appointment System`,
    });
  }
}
