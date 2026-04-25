import {
  Controller, Post, Get, Patch, Delete,
  Param, Query, Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';
import { LeaveService } from './leave.service';
import { HcmClientService } from '../hcm-client/hcm-client.service';
import {
  CreateTimeOffRequestDto,
  ApproveRejectDto,
  CancelDto,
  HcmBatchItemDto,
  SyncBalanceDto,
} from './dto/leave.dto';
import { HcmBatchPayloadDto } from '../hcm-client/dto/hcm.dto';

@ApiTags('leave')
@Controller('leave')
export class LeaveController {
  constructor(
    private readonly leaveService: LeaveService,
    private readonly hcmClientService: HcmClientService,
  ) {}

  // ─── Time-Off Requests ────────────────────────────────────────────────────

  @Post('requests')
  @ApiOperation({ summary: 'Submit a new time-off request' })
  @ApiResponse({ status: 201, description: 'Request created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or date range' })
  @ApiResponse({ status: 422, description: 'Insufficient balance' })
  @ApiBody({ type: CreateTimeOffRequestDto })
  async createRequest(@Body() dto: CreateTimeOffRequestDto) {
    return this.leaveService.requestTimeOff(dto);
  }

  @Get('requests')
  @ApiOperation({ summary: 'List time-off requests for an employee' })
  @ApiQuery({ name: 'employeeId', required: true, example: 'EMP-001' })
  @ApiResponse({ status: 200, description: 'List of requests' })
  async listRequests(@Query('employeeId') employeeId: string) {
    return this.leaveService.listRequests(employeeId);
  }

  @Get('requests/:id')
  @ApiOperation({ summary: 'Get a single time-off request by ID' })
  @ApiParam({ name: 'id', description: 'Request UUID' })
  @ApiResponse({ status: 200, description: 'Request found' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  async getRequest(@Param('id') id: string) {
    return this.leaveService.getRequest(id);
  }

  @Patch('requests/:id/approve')
  @ApiOperation({ summary: 'Approve a PENDING request' })
  @ApiParam({ name: 'id', description: 'Request UUID' })
  @ApiResponse({ status: 200, description: 'Request approved' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiResponse({ status: 409, description: 'Request is not in PENDING state' })
  @ApiBody({ type: ApproveRejectDto })
  async approveRequest(@Param('id') id: string, @Body() dto: ApproveRejectDto) {
    return this.leaveService.approveRequest(id, dto.managerId);
  }

  @Patch('requests/:id/reject')
  @ApiOperation({ summary: 'Reject a PENDING request' })
  @ApiParam({ name: 'id', description: 'Request UUID' })
  @ApiResponse({ status: 200, description: 'Request rejected' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiResponse({ status: 409, description: 'Request is not in PENDING state' })
  @ApiBody({ type: ApproveRejectDto })
  async rejectRequest(@Param('id') id: string, @Body() dto: ApproveRejectDto) {
    return this.leaveService.rejectRequest(id, dto.managerId);
  }

  @Delete('requests/:id')
  @ApiOperation({ summary: 'Cancel own PENDING request' })
  @ApiParam({ name: 'id', description: 'Request UUID' })
  @ApiResponse({ status: 200, description: 'Request cancelled' })
  @ApiResponse({ status: 403, description: 'Not the original requester' })
  @ApiResponse({ status: 409, description: 'Request is not cancellable' })
  @ApiBody({ type: CancelDto })
  async cancelRequest(@Param('id') id: string, @Body() dto: CancelDto) {
    return this.leaveService.cancelRequest(id, dto.employeeId);
  }

  // ─── Balances ─────────────────────────────────────────────────────────────

  @Get('balances')
  @ApiOperation({ summary: 'Get leave balance for an employee + location' })
  @ApiQuery({ name: 'employeeId', required: true, example: 'EMP-001' })
  @ApiQuery({ name: 'locationId', required: true, example: 'LOC-NYC' })
  @ApiResponse({ status: 200, description: 'Balance data (served from local cache)' })
  async getBalance(
    @Query('employeeId') employeeId: string,
    @Query('locationId') locationId: string,
  ) {
    return this.leaveService.getBalance(employeeId, locationId);
  }

  @Post('balances/sync')
  @ApiOperation({ summary: 'Force an HCM sync for one employee + location' })
  @ApiResponse({ status: 200, description: 'Balance synced from HCM' })
  @ApiResponse({ status: 502, description: 'HCM service error' })
  @ApiBody({ type: SyncBalanceDto })
  async syncBalance(@Body() dto: SyncBalanceDto) {
    return this.leaveService.syncBalanceFromHcm(dto.employeeId, dto.locationId);
  }

  @Post('balances/batch')
  @ApiOperation({ summary: 'Ingest a batch balance payload from HCM' })
  @ApiResponse({ status: 200, description: 'Batch ingested successfully' })
  async ingestBatch(@Body() dto: { items: HcmBatchItemDto[] }) {
    const payload: HcmBatchPayloadDto[] = dto.items.map(item => ({
      employeeId: item.employeeId,
      locationId: item.locationId,
      availableDays: item.totalDays - item.usedDays,
      usedDays: item.usedDays,
    }));
    await this.hcmClientService.ingestBatch(payload);
    return { success: true, processed: payload.length };
  }
}
