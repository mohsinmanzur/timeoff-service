import { IsString, IsNumber, Min, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeductBalanceDto {
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
  @Min(0.01)
  days: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  requestId: string;
}
