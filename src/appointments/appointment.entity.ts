import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export enum AppointmentStatus {
  BOOKED = 'BOOKED',
  CANCELLED = 'CANCELLED',
}

@Entity('appointments')
export class Appointment {

  @PrimaryGeneratedColumn()
  appointments_id: number;

  @Column()
  slot_number: number;

  @Column({
    type: 'enum',
    enum: AppointmentStatus,
  })
  status: AppointmentStatus;

  @Column()
  doctor_id: number;

  @Column()
  patient_id: number;

  @Column({
    type: 'date',
  })
  appointment_date: Date;
}