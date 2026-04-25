import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';

@Entity('hcm_balances')
@Unique(['employeeId', 'locationId'])
export class HcmBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: false })
  employeeId: string;

  @Column({ type: 'varchar', nullable: false })
  locationId: string;

  @Column({ type: 'float', nullable: false })
  totalDays: number;

  @Column({ type: 'float', nullable: false, default: 0 })
  usedDays: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get availableDays(): number {
    return this.totalDays - this.usedDays;
  }
}
