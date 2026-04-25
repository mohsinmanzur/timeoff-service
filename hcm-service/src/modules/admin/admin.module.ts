import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { HcmBalance } from '../balance/entities/hcm-balance.entity';

@Module({
  imports: [TypeOrmModule.forFeature([HcmBalance])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
