import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HcmClientService } from './hcm-client.service';
import { LeaveBalance } from '../leave/entities';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        timeout: configService.get<number>('HCM_TIMEOUT', 5000),
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([LeaveBalance]),
  ],
  providers: [HcmClientService],
  exports: [HcmClientService],
})
export class HcmClientModule {}
