import { Controller, Get, Query } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  healthCheck(@Query('error') error?: string) {
    if (error === '1') {
      throw new Error('Test error');
    }
    if (error === '2') {
      throw 'String error';
    }
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
