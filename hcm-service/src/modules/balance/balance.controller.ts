import { Controller, Get, Post, Body, Query, Headers, NotFoundException, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiHeader, ApiBody } from '@nestjs/swagger';
import { BalanceService } from './balance.service';
import { DeductBalanceDto } from './dto/deduct-balance.dto';
import { RestoreBalanceDto } from './dto/restore-balance.dto';

@ApiTags('balances')
@Controller('balances')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get('all')
  @ApiOperation({ summary: 'List all HCM leave balances across all employees and locations' })
  @ApiResponse({ status: 200, description: 'Full balance list returned' })
  async getAllBalances() {
    return this.balanceService.getAllBalances();
  }

  @Get()
  @ApiOperation({ summary: 'Get leave balance for an employee + location' })
  @ApiQuery({ name: 'employeeId', required: true, example: 'EMP-001' })
  @ApiQuery({ name: 'locationId', required: true, example: 'LOC-NYC' })
  @ApiResponse({ status: 200, description: 'Balance returned successfully' })
  @ApiResponse({ status: 404, description: 'Balance not found' })
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
  @ApiOperation({ summary: 'Deduct days from an employee leave balance' })
  @ApiHeader({ name: 'X-Simulate-Error', required: false, description: 'Set to "true" to simulate an HCM error response' })
  @ApiBody({ type: DeductBalanceDto })
  @ApiResponse({ status: 200, description: 'Balance deducted successfully' })
  @ApiResponse({ status: 422, description: 'Insufficient balance' })
  async deductBalance(
    @Body() dto: DeductBalanceDto,
    @Headers('X-Simulate-Error') simulateError?: string,
  ) {
    return this.balanceService.deductBalance(dto, simulateError === 'true');
  }

  @Post('restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restore previously deducted days (on rejection or cancellation)' })
  @ApiHeader({ name: 'X-Simulate-Error', required: false, description: 'Set to "true" to simulate an HCM error response' })
  @ApiBody({ type: RestoreBalanceDto })
  @ApiResponse({ status: 200, description: 'Balance restored successfully' })
  @ApiResponse({ status: 404, description: 'Balance not found' })
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
  @ApiOperation({ summary: 'Simulate a nightly HCM batch push — pushes all current balances to timeoff-service' })
  @ApiResponse({ status: 200, description: 'Batch pushed successfully' })
  @ApiResponse({ status: 502, description: 'Failed to reach timeoff-service webhook' })
  async batchPush() {
    return this.balanceService.batchPush();
  }
}

