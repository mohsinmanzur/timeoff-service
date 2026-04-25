import { Controller, Get, Post, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { SeedBalanceDto } from './dto/seed-balance.dto';
import { AnniversaryBonusDto } from './dto/anniversary-bonus.dto';
import { YearRefreshDto } from './dto/year-refresh.dto';

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('seed')
  @HttpCode(200)
  @ApiOperation({ summary: 'Seed or upsert a leave balance record for an employee' })
  @ApiBody({ type: SeedBalanceDto })
  @ApiResponse({ status: 200, description: 'Balance seeded successfully' })
  async seed(@Body() dto: SeedBalanceDto) {
    return this.adminService.seed(dto);
  }

  @Post('anniversary-bonus')
  @HttpCode(200)
  @ApiOperation({ summary: 'Grant an anniversary bonus to an employee' })
  @ApiBody({ type: AnniversaryBonusDto })
  @ApiResponse({ status: 200, description: 'Bonus applied successfully' })
  @ApiResponse({ status: 404, description: 'Balance not found' })
  async anniversaryBonus(@Body() dto: AnniversaryBonusDto) {
    return this.adminService.anniversaryBonus(dto);
  }

  @Post('year-refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset all employee balances at the start of a new year' })
  @ApiBody({ type: YearRefreshDto })
  @ApiResponse({ status: 200, description: 'All balances refreshed' })
  async yearRefresh(@Body() dto: YearRefreshDto) {
    return this.adminService.yearRefresh(dto);
  }

  @Get('state')
  @ApiOperation({ summary: 'Dump current state of all HCM balance records (debug)' })
  @ApiResponse({ status: 200, description: 'Current HCM state returned' })
  async getState() {
    return this.adminService.getState();
  }

  @Post('reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Wipe all HCM balance records (debug/test reset)' })
  @ApiResponse({ status: 200, description: 'All records deleted' })
  async reset() {
    return this.adminService.reset();
  }
}

