import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('leave_balance')
@Unique(['employeeId', 'locationId'])
export class LeaveBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  employeeId: string;

  @Column({ type: 'varchar' })
  locationId: string;

  @Column({ type: 'float' })
  totalDays: number;

  @Column({ type: 'float', default: 0 })
  usedDays: number;

  @Column({ type: 'float', default: 0 })
  pendingDays: number;

  @Column({ type: 'datetime', nullable: true })
  lastSyncedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
