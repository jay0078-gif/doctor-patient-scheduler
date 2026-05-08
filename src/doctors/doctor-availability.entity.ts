import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum DayOfWeek {
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
}

export enum AvailabilityType {
  WAVE_RECURRING = 'WAVE_RECURRING',
  WAVE_NON_RECURRING = 'WAVE_NON_RECURRING',
  STREAM = 'STREAM',
}

@Entity('doctor_availability')
export class DoctorAvailability {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  doctor_id: number;

  @Column({
    type: 'enum',
    enum: AvailabilityType,
    default: AvailabilityType.WAVE_RECURRING,
  })
  type: AvailabilityType;

  @Column({ type: 'enum', enum: DayOfWeek, nullable: true })
  day_of_week: DayOfWeek | null; // ← | null added

  @Column({ type: 'date', nullable: true })
  specific_date: string | null; // ← | null added

  @Column({ type: 'time' })
  start_time: string;

  @Column({ type: 'time' })
  end_time: string;

  @Column({ type: 'int' })
  slot_duration: number;

  @Column({ type: 'int', default: 1 })
  max_patients: number;

  @Column({ default: true })
  is_available: boolean;
}