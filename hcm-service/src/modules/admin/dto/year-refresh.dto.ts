import { IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class YearRefreshDto {
  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  bonusDays: number;
}
