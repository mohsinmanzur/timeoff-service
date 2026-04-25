import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { HcmBalance } from './entities/hcm-balance.entity';
import { DeductBalanceDto } from './dto/deduct-balance.dto';
import { RestoreBalanceDto } from './dto/restore-balance.dto';
import { InsufficientBalanceException } from '../../common/exceptions/insufficient-balance.exception';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class BalanceService {
  constructor(
    @InjectRepository(HcmBalance)
    private readonly balanceRepository: Repository<HcmBalance>,
    private readonly dataSource: DataSource,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async getBalance(employeeId: string, locationId: string): Promise<HcmBalance> {
    let balance = await this.balanceRepository.findOne({ where: { employeeId, locationId } });
    if (!balance) {
      balance = this.balanceRepository.create({
        employeeId,
        locationId,
        totalDays: 20,
        usedDays: 0,
      });
      await this.balanceRepository.save(balance);
    }
    return balance;
  }

  async deductBalance(dto: DeductBalanceDto, simulateError = false): Promise<{ success: boolean; remainingBalance: number; hcmReference: string }> {
    if (simulateError) {
      throw new InternalServerErrorException({ code: 'HCM_INTERNAL_ERROR', message: 'Simulated failure' });
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let balance = await queryRunner.manager.findOne(HcmBalance, {
        where: { employeeId: dto.employeeId, locationId: dto.locationId },
      });

      if (!balance) {
        balance = queryRunner.manager.create(HcmBalance, {
          employeeId: dto.employeeId,
          locationId: dto.locationId,
          totalDays: 20,
          usedDays: 0,
        });
        await queryRunner.manager.save(balance);
      }

      const availableDays = balance.totalDays - balance.usedDays;

      if (availableDays < dto.days) {
        throw new InsufficientBalanceException(availableDays);
      }

      balance.usedDays += dto.days;
      await queryRunner.manager.save(balance);
      await queryRunner.commitTransaction();

      return {
        success: true,
        remainingBalance: balance.totalDays - balance.usedDays,
        hcmReference: `HCM-${uuidv4()}`,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async restoreBalance(dto: RestoreBalanceDto, simulateError = false): Promise<{ success: boolean; newUsedDays: number } | null> {
    if (simulateError) {
      throw new InternalServerErrorException({ code: 'HCM_INTERNAL_ERROR', message: 'Simulated failure' });
    }

    const balance = await this.balanceRepository.findOne({
      where: { employeeId: dto.employeeId, locationId: dto.locationId },
    });

    if (!balance) {
      return null;
    }

    balance.usedDays = Math.max(0, balance.usedDays - dto.days);
    await this.balanceRepository.save(balance);

    return {
      success: true,
      newUsedDays: balance.usedDays,
    };
  }

  async batchPush(): Promise<{ pushed: number; status: string }> {
    const balances = await this.balanceRepository.find();
    const payload = balances.map((b) => ({
      employeeId: b.employeeId,
      locationId: b.locationId,
      totalDays: b.totalDays,
      usedDays: b.usedDays,
    }));

    const timeoffWebhookUrl = this.configService.get<string>('TIMEOFF_WEBHOOK_URL');
    
    try {
      await lastValueFrom(
        this.httpService.post(`${timeoffWebhookUrl}/leave/balances/batch`, payload),
      );
      return { pushed: balances.length, status: 'ok' };
    } catch (error) {
      throw new InternalServerErrorException('timeoff-service unreachable');
    }
  }
}
