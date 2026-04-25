import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveBalance, TimeOffRequest } from './entities';

@Module({
  imports: [TypeOrmModule.forFeature([LeaveBalance, TimeOffRequest])],
  controllers: [],
  providers: [],
})
export class LeaveModule {}
