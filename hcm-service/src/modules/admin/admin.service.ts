import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HcmBalance } from '../balance/entities/hcm-balance.entity';
import { SeedBalanceDto } from './dto/seed-balance.dto';
import { AnniversaryBonusDto } from './dto/anniversary-bonus.dto';
import { YearRefreshDto } from './dto/year-refresh.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(HcmBalance)
    private readonly balanceRepository: Repository<HcmBalance>,
  ) {}

  async seed(dto: SeedBalanceDto): Promise<HcmBalance> {
    let balance = await this.balanceRepository.findOne({
      where: { employeeId: dto.employeeId, locationId: dto.locationId },
    });

    if (balance) {
      balance.totalDays = dto.totalDays;
      if (dto.usedDays !== undefined) {
        balance.usedDays = dto.usedDays;
      }
    } else {
      balance = this.balanceRepository.create({
        employeeId: dto.employeeId,
        locationId: dto.locationId,
        totalDays: dto.totalDays,
        usedDays: dto.usedDays ?? 0,
      });
    }

    return this.balanceRepository.save(balance);
  }

  async anniversaryBonus(dto: AnniversaryBonusDto): Promise<HcmBalance> {
    const balance = await this.balanceRepository.findOne({
      where: { employeeId: dto.employeeId, locationId: dto.locationId },
    });

    if (!balance) {
      throw new NotFoundException('Balance not found');
    }

    balance.totalDays += dto.bonusDays;
    return this.balanceRepository.save(balance);
  }

  async yearRefresh(dto: YearRefreshDto): Promise<{ updated: number }> {
    const result = await this.balanceRepository.createQueryBuilder()
      .update(HcmBalance)
      .set({ totalDays: () => `totalDays + ${dto.bonusDays}` })
      .execute();

    return { updated: result.affected ?? 0 };
  }

  async getState(): Promise<{ count: number; balances: HcmBalance[] }> {
    const [balances, count] = await this.balanceRepository.findAndCount();
    return { count, balances };
  }

  async reset(): Promise<{ deleted: number }> {
    const result = await this.balanceRepository.find();
    const count = result.length;
    await this.balanceRepository.clear();
    return { deleted: count };
  }
}
