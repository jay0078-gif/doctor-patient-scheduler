// appointment.entity.ts

import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export enum AppointmentStatus {
  BOOKED = 'BOOKED',
  CANCELLED = 'CANCELLED',
  PENDING = 'PENDING',
}

@Entity('appointments')
export class Appointment {
  @PrimaryGeneratedColumn()
  appointments_id: number;

  @Column()
  doctor_id: number;

  @Column()
  patient_id: number;

  @Column({ type: 'date' })
  appointment_date: string; // ← change Date to string

  @Column({ type: 'int' })
  slot_number: number;

  @Column({ type: 'enum', enum: AppointmentStatus })
  status: AppointmentStatus;
}
