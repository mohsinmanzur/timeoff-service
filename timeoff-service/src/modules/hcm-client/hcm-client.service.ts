import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { HcmBalanceDto, HcmDeductResponseDto, HcmBatchPayloadDto } from './dto/hcm.dto';
import { HcmApiException, HcmInsufficientBalanceException, HcmInvalidDimensionException } from './exceptions/hcm.exceptions';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveBalance } from '../leave/entities';

@Injectable()
export class HcmClientService {
  private readonly logger = new Logger(HcmClientService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectRepository(LeaveBalance)
    private readonly leaveBalanceRepo: Repository<LeaveBalance>,
  ) {
    this.baseUrl = this.configService.get<string>('HCM_BASE_URL', '');
    
    // Axios interceptors for logging
    const axios = this.httpService.axiosRef;
    axios.interceptors.request.use((config) => {
      this.logger.debug(`Outbound Request: ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });
    
    axios.interceptors.response.use(
      (response) => {
        this.logger.debug(`Inbound Response: ${response.status} from ${response.config.url}`);
        return response;
      },
      (error: AxiosError) => {
        this.logger.debug(`Inbound Error: ${error.response?.status || error.message} from ${error.config?.url}`);
        return Promise.reject(error);
      }
    );
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.configService.get<string>('HCM_API_KEY')}`,
    };
  }

  private async requestWithRetry<T>(requestFn: () => Promise<T>): Promise<T> {
    const maxRetries = 3;
    let attempt = 0;
    while (true) {
      try {
        return await requestFn();
      } catch (error) {
        attempt++;
        if (this.isNetworkError(error) && attempt <= maxRetries) {
          const delay = Math.pow(2, attempt) * 500; // Exponential backoff
          this.logger.debug(`Network error. Retrying attempt ${attempt} in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
  }

  private isNetworkError(error: any): boolean {
    return (error instanceof AxiosError) && (!error.response || error.response.status >= 500);
  }

  async getBalance(employeeId: string, locationId: string): Promise<HcmBalanceDto> {
    try {
      return await this.requestWithRetry(async () => {
        const response = await lastValueFrom(
          this.httpService.get<HcmBalanceDto>(`${this.baseUrl}/balances`, {
            headers: this.headers,
            params: { employeeId, locationId },
          })
        );
        return response.data;
      });
    } catch (error) {
      this.handleHcmError(error);
    }
  }

  async deductBalance(employeeId: string, locationId: string, days: number, requestId: string): Promise<HcmDeductResponseDto> {
    try {
      return await this.requestWithRetry(async () => {
        const response = await lastValueFrom(
          this.httpService.post<HcmDeductResponseDto>(
            `${this.baseUrl}/balances/deduct`,
            { employeeId, locationId, days, requestId },
            { headers: this.headers }
          )
        );
        return response.data;
      });
    } catch (error) {
      this.handleHcmError(error);
    }
  }

  async restoreBalance(employeeId: string, locationId: string, days: number, requestId: string): Promise<void> {
    try {
      await this.requestWithRetry(async () => {
        await lastValueFrom(
          this.httpService.post(
            `${this.baseUrl}/balances/restore`,
            { employeeId, locationId, days, requestId },
            { headers: this.headers }
          )
        );
      });
    } catch (error) {
      this.handleHcmError(error);
    }
  }

  async ingestBatch(payload: HcmBatchPayloadDto[]): Promise<void> {
    for (const record of payload) {
      const balance = await this.leaveBalanceRepo.findOne({
        where: { employeeId: record.employeeId, locationId: record.locationId }
      }) || this.leaveBalanceRepo.create({
        employeeId: record.employeeId,
        locationId: record.locationId,
      });

      balance.totalDays = record.availableDays + record.usedDays;
      balance.usedDays = record.usedDays;
      balance.lastSyncedAt = new Date();
      await this.leaveBalanceRepo.save(balance);
    }
  }

  private handleHcmError(error: any): never {
    const response = (error instanceof AxiosError) ? error.response : null;
    if (response && response.status >= 400 && response.status < 500) {
      const errorCode = response.data?.code || response.data?.error;
      if (errorCode === 'INSUFFICIENT_BALANCE') {
        throw new HcmInsufficientBalanceException(response.data?.message || 'Insufficient balance');
      }
      if (errorCode === 'INVALID_DIMENSION') {
        throw new HcmInvalidDimensionException(response.data?.message || 'Invalid dimension');
      }
      throw new HcmApiException(error.message, response.status, response.data);
    }
    throw error;
  }
}
