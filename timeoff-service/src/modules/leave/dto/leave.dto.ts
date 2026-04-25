import { IsString, IsNotEmpty, IsDateString, IsNumber, IsPositive, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTimeOffRequestDto {
  @ApiProperty({ example: 'EMP-001' })
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @ApiProperty({ example: 'LOC-NYC' })
  @IsString()
  @IsNotEmpty()
  locationId: string;

  @ApiProperty({ example: '2026-08-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-08-05' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ example: 5 })
  @IsNumber()
  @IsPositive()
  daysRequested: number;

  @ApiProperty({ example: 'EMP-001' })
  @IsString()
  @IsNotEmpty()
  requestedBy: string;
}

export class ApproveRejectDto {
  @ApiProperty({ example: 'MGR-007' })
  @IsString()
  @IsNotEmpty()
  managerId: string;
}

export class CancelDto {
  @ApiProperty({ example: 'EMP-001' })
  @IsString()
  @IsNotEmpty()
  employeeId: string;
}

export class HcmBatchItemDto {
  @ApiProperty({ example: 'EMP-001' })
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @ApiProperty({ example: 'LOC-NYC' })
  @IsString()
  @IsNotEmpty()
  locationId: string;

  @ApiProperty({ example: 20 })
  @IsNumber()
  totalDays: number;

  @ApiProperty({ example: 5 })
  @IsNumber()
  usedDays: number;
}

export class SyncBalanceDto {
  @ApiProperty({ example: 'EMP-001' })
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @ApiProperty({ example: 'LOC-NYC' })
  @IsString()
  @IsNotEmpty()
  locationId: string;
}

export class LeaveBalanceDto {
  employeeId: string;
  locationId: string;
  totalDays: number;
  usedDays: number;
  pendingDays: number;
  availableDays: number;
}
