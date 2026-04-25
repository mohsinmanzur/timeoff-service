import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum RequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

@Entity('time_off_request')
export class TimeOffRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  employeeId: string;

  @Column({ type: 'varchar' })
  locationId: string;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({ type: 'float' })
  daysRequested: number;

  @Column({ type: 'varchar', default: RequestStatus.PENDING })
  status: RequestStatus;

  @Column({ type: 'varchar' })
  requestedBy: string;

  @Column({ type: 'varchar', nullable: true })
  reviewedBy: string;

  @Column({ type: 'datetime', nullable: true })
  reviewedAt: Date;

  @Column({ type: 'varchar', nullable: true })
  hcmReference: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
