import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('patients')
export class Patient {
  @PrimaryGeneratedColumn()
  patient_id: number;

  @Column()
  first_name: string;

  @Column()
  last_name: string;

  @Column({ unique: true, nullable: true })
  phone: string;

  @Column({ type: 'text', nullable: true })
  problem: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;
}
