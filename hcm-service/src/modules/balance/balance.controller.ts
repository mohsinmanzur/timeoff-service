import { Controller, Get, Post, Body, Query, Headers, NotFoundException, HttpCode } from '@nestjs/common';
import { BalanceService } from './balance.service';
import { DeductBalanceDto } from './dto/deduct-balance.dto';
import { RestoreBalanceDto } from './dto/restore-balance.dto';

@Controller('balances')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get()
  async getBalance(
    @Query('employeeId') employeeId: string,
    @Query('locationId') locationId: string,
  ) {
    const balance = await this.balanceService.getBalance(employeeId, locationId);
    return {
      employeeId: balance.employeeId,
      locationId: balance.locationId,
      totalDays: balance.totalDays,
      usedDays: balance.usedDays,
      availableDays: balance.availableDays,
    };
  }

  @Post('deduct')
  @HttpCode(200)
  async deductBalance(
    @Body() dto: DeductBalanceDto,
    @Headers('X-Simulate-Error') simulateError?: string,
  ) {
    return this.balanceService.deductBalance(dto, simulateError === 'true');
  }

  @Post('restore')
  @HttpCode(200)
  async restoreBalance(
    @Body() dto: RestoreBalanceDto,
    @Headers('X-Simulate-Error') simulateError?: string,
  ) {
    const result = await this.balanceService.restoreBalance(dto, simulateError === 'true');
    if (!result) {
      throw new NotFoundException('Balance not found');
    }
    return result;
  }

  @Post('batch-push')
  @HttpCode(200)
  async batchPush() {
    return this.balanceService.batchPush();
  }
}
