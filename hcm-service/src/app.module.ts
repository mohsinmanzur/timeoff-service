import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalanceModule } from './modules/balance/balance.module';
import { AdminModule } from './modules/admin/admin.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'sqlite',
        database: process.env.NODE_ENV === 'test' ? ':memory:' : configService.get<string>('DB_PATH', './data/hcm.db'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true, // auto-create tables for this simple exercise
      }),
      inject: [ConfigService],
    }),
    BalanceModule,
    AdminModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
