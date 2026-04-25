import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { LeaveModule } from './modules/leave/leave.module';
import { HcmClientModule } from './modules/hcm-client/hcm-client.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    LeaveModule,
    HcmClientModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
