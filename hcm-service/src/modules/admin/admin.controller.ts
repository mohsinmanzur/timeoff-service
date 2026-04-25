import { Controller, Get, Post, Body, HttpCode } from '@nestjs/common';
import { AdminService } from './admin.service';
import { SeedBalanceDto } from './dto/seed-balance.dto';
import { AnniversaryBonusDto } from './dto/anniversary-bonus.dto';
import { YearRefreshDto } from './dto/year-refresh.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('seed')
  @HttpCode(200)
  async seed(@Body() dto: SeedBalanceDto) {
    return this.adminService.seed(dto);
  }

  @Post('anniversary-bonus')
  @HttpCode(200)
  async anniversaryBonus(@Body() dto: AnniversaryBonusDto) {
    return this.adminService.anniversaryBonus(dto);
  }

  @Post('year-refresh')
  @HttpCode(200)
  async yearRefresh(@Body() dto: YearRefreshDto) {
    return this.adminService.yearRefresh(dto);
  }

  @Get('state')
  async getState() {
    return this.adminService.getState();
  }

  @Post('reset')
  @HttpCode(200)
  async reset() {
    return this.adminService.reset();
  }
}
