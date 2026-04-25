import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { BalanceService } from './balance.service';
import { AdminService } from '../admin/admin.service';
import { HcmBalance } from './entities/hcm-balance.entity';
import { InsufficientBalanceException } from '../../common/exceptions/insufficient-balance.exception';
import { InternalServerErrorException } from '@nestjs/common';
import { of } from 'rxjs';
import { AxiosResponse } from 'axios';

describe('BalanceService', () => {
  let balanceService: BalanceService;
  let adminService: AdminService;
  let httpService: HttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.example', // using example so it has values
        }),
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [HcmBalance],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([HcmBalance]),
        HttpModule,
      ],
      providers: [BalanceService, AdminService],
    }).compile();

    balanceService = module.get<BalanceService>(BalanceService);
    adminService = module.get<AdminService>(AdminService);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(async () => {
    await adminService.reset();
  });

  describe('1. getBalance', () => {
    it('auto-seeds if not found', async () => {
      const balance = await balanceService.getBalance('emp1', 'loc1');
      expect(balance).toBeDefined();
      expect(balance.totalDays).toBe(20);
      expect(balance.usedDays).toBe(0);
      expect(balance.availableDays).toBe(20);
    });
  });

  describe('2. deductBalance', () => {
    it('happy path: deducts, returns hcmReference', async () => {
      await adminService.seed({ employeeId: 'emp2', locationId: 'loc2', totalDays: 20, usedDays: 5 });
      const res = await balanceService.deductBalance({
        employeeId: 'emp2',
        locationId: 'loc2',
        days: 3,
        requestId: 'req1',
      });
      expect(res.success).toBe(true);
      expect(res.hcmReference).toMatch(/^HCM-/);
      expect(res.remainingBalance).toBe(12); // 20 - (5 + 3)

      const balance = await balanceService.getBalance('emp2', 'loc2');
      expect(balance.usedDays).toBe(8);
    });
  });

  describe('3. deductBalance - insufficient balance', () => {
    it('returns 422, does NOT mutate DB', async () => {
      await adminService.seed({ employeeId: 'emp3', locationId: 'loc3', totalDays: 10, usedDays: 9 });
      
      await expect(balanceService.deductBalance({
        employeeId: 'emp3',
        locationId: 'loc3',
        days: 2,
        requestId: 'req2',
      })).rejects.toThrow(InsufficientBalanceException);

      const balance = await balanceService.getBalance('emp3', 'loc3');
      expect(balance.usedDays).toBe(9); // unchanged
    });
  });

  describe('4. deductBalance - X-Simulate-Error', () => {
    it('returns 500, does NOT mutate DB', async () => {
      await adminService.seed({ employeeId: 'emp4', locationId: 'loc4', totalDays: 20, usedDays: 0 });

      await expect(balanceService.deductBalance({
        employeeId: 'emp4',
        locationId: 'loc4',
        days: 5,
        requestId: 'req3',
      }, true)).rejects.toThrow(InternalServerErrorException);

      const balance = await balanceService.getBalance('emp4', 'loc4');
      expect(balance.usedDays).toBe(0); // unchanged
    });
  });

  describe('5. restoreBalance', () => {
    it('happy path: reduces usedDays', async () => {
      await adminService.seed({ employeeId: 'emp5', locationId: 'loc5', totalDays: 20, usedDays: 10 });
      const res = await balanceService.restoreBalance({
        employeeId: 'emp5',
        locationId: 'loc5',
        days: 4,
        requestId: 'req4',
      });
      expect(res.success).toBe(true);
      expect(res.newUsedDays).toBe(6);

      const balance = await balanceService.getBalance('emp5', 'loc5');
      expect(balance.usedDays).toBe(6);
    });
  });

  describe('6. restoreBalance - never goes below 0', () => {
    it('floor at 0', async () => {
      await adminService.seed({ employeeId: 'emp6', locationId: 'loc6', totalDays: 20, usedDays: 2 });
      const res = await balanceService.restoreBalance({
        employeeId: 'emp6',
        locationId: 'loc6',
        days: 5,
        requestId: 'req5',
      });
      expect(res.success).toBe(true);
      expect(res.newUsedDays).toBe(0);

      const balance = await balanceService.getBalance('emp6', 'loc6');
      expect(balance.usedDays).toBe(0);
    });
  });

  describe('7. anniversaryBonus', () => {
    it('increments totalDays only, usedDays unchanged', async () => {
      await adminService.seed({ employeeId: 'emp7', locationId: 'loc7', totalDays: 20, usedDays: 5 });
      await adminService.anniversaryBonus({ employeeId: 'emp7', locationId: 'loc7', bonusDays: 2 });

      const balance = await balanceService.getBalance('emp7', 'loc7');
      expect(balance.totalDays).toBe(22);
      expect(balance.usedDays).toBe(5);
    });
  });

  describe('8. batchPush', () => {
    it('calls timeoff-service webhook with correct payload', async () => {
      await adminService.seed({ employeeId: 'emp8', locationId: 'loc8', totalDays: 20, usedDays: 5 });
      
      const response: AxiosResponse<any> = {
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: undefined as any },
      };
      
      jest.spyOn(httpService, 'post').mockReturnValue(of(response));

      const res = await balanceService.batchPush();
      expect(res.pushed).toBe(1);
      expect(res.status).toBe('ok');
      expect(httpService.post).toHaveBeenCalled();
      
      const callArgs = (httpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toContain('/leave/balances/batch');
      expect(callArgs[1]).toEqual([{
        employeeId: 'emp8',
        locationId: 'loc8',
        totalDays: 20,
        usedDays: 5,
      }]);
    });
  });

  describe('9. reset', () => {
    it('clears all records', async () => {
      await adminService.seed({ employeeId: 'emp9', locationId: 'loc9', totalDays: 20, usedDays: 5 });
      const stateBefore = await adminService.getState();
      expect(stateBefore.count).toBe(1);

      await adminService.reset();
      
      const stateAfter = await adminService.getState();
      expect(stateAfter.count).toBe(0);
    });
  });
});
