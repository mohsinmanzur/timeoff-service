import { IsString, IsNumber, IsOptional, Min, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SeedBalanceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  locationId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  totalDays: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  usedDays?: number;
}
