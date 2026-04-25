import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveBalance, TimeOffRequest } from './entities';
import { LeaveService } from './leave.service';
import { LeaveController } from './leave.controller';
import { HcmClientModule } from '../hcm-client/hcm-client.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeaveBalance, TimeOffRequest]),
    HcmClientModule,
  ],
  controllers: [LeaveController],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule {}

