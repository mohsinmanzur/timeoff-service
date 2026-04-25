import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { BalanceController } from './balance.controller';
import { BalanceService } from './balance.service';
import { HcmBalance } from './entities/hcm-balance.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([HcmBalance]),
    HttpModule,
  ],
  controllers: [BalanceController],
  providers: [BalanceService],
})
export class BalanceModule {}
