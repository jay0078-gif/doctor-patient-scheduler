import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

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

  @Column({ nullable: true })
  patient_id: number;

  @Column()
  patient_name: string;

  @Column()
  patient_mobile: string;

  @Column({ type: 'date' })
  appointment_date: string;

  @Column({ type: 'int' })
  slot_number: number;

  @Column({ type: 'enum', enum: AppointmentStatus })
  status: AppointmentStatus;

  @CreateDateColumn()
  created_at: Date;
}
