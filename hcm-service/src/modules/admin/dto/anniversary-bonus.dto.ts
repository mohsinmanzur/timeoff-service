import { IsString, IsNumber, Min, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AnniversaryBonusDto {
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
  bonusDays: number;
}
