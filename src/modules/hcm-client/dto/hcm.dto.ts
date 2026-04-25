export interface HcmBalanceDto {
  employeeId: string;
  locationId: string;
  totalDays: number;
  usedDays: number;
}

export interface HcmDeductResponseDto {
  success: boolean;
  remainingBalance: number;
  hcmReference: string;
}

export interface HcmBatchPayloadDto {
  employeeId: string;
  locationId: string;
  availableDays: number;
  usedDays: number;
}
