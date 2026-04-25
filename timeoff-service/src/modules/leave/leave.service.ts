import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { LeaveBalance, TimeOffRequest, RequestStatus } from './entities';
import { CreateTimeOffRequestDto, LeaveBalanceDto } from './dto/leave.dto';
import { 
  InsufficientBalanceException, 
  InvalidRequestException, 
  RequestNotFoundException,
  InvalidStatusTransitionException,
  UnauthorizedCancellationException
} from './exceptions/leave.exceptions';
import { HcmClientService } from '../hcm-client/hcm-client.service';
import { HcmInsufficientBalanceException, HcmApiException } from '../hcm-client/exceptions/hcm.exceptions';

@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly hcmClientService: HcmClientService,
  ) {}

  async requestTimeOff(dto: CreateTimeOffRequestDto): Promise<TimeOffRequest> {
    if (new Date(dto.endDate) < new Date(dto.startDate)) {
      throw new InvalidRequestException('endDate must be on or after startDate');
    }
    if (dto.daysRequested <= 0) {
      throw new InvalidRequestException('daysRequested must be > 0');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let request: TimeOffRequest;

    try {
      let balance = await queryRunner.manager.findOne(LeaveBalance, {
        where: { employeeId: dto.employeeId, locationId: dto.locationId },
      });

      if (!balance) {
        try {
          const hcmBalance = await this.hcmClientService.getBalance(dto.employeeId, dto.locationId);
          balance = queryRunner.manager.create(LeaveBalance, {
            employeeId: dto.employeeId,
            locationId: dto.locationId,
            totalDays: hcmBalance.totalDays,
            usedDays: hcmBalance.usedDays,
            pendingDays: 0,
            lastSyncedAt: new Date(),
          });
          await queryRunner.manager.save(balance);
        } catch (error) {
          balance = queryRunner.manager.create(LeaveBalance, {
            employeeId: dto.employeeId,
            locationId: dto.locationId,
            totalDays: 0,
            usedDays: 0,
            pendingDays: 0,
            lastSyncedAt: new Date(),
          });
        }
      }

      const availableDays = balance.totalDays - balance.usedDays - balance.pendingDays;
      if (availableDays < dto.daysRequested) {
        throw new InsufficientBalanceException(`Only ${availableDays} days available`);
      }

      balance.pendingDays += dto.daysRequested;
      await queryRunner.manager.save(balance);

      request = queryRunner.manager.create(TimeOffRequest, {
        ...dto,
        status: RequestStatus.PENDING,
      });
      await queryRunner.manager.save(request);

      try {
        const deductResponse = await this.hcmClientService.deductBalance(
          dto.employeeId,
          dto.locationId,
          dto.daysRequested,
          request.id,
        );
        request.hcmReference = deductResponse.hcmReference;
        await queryRunner.manager.save(request);
      } catch (error) {
        if (error instanceof HcmInsufficientBalanceException) {
          throw new InsufficientBalanceException('HCM rejected: Insufficient balance');
        } else if (error instanceof HcmApiException) {
          throw new InvalidRequestException(`HCM rejected request: ${error.message}`);
        }
        this.logger.warn(`HCM unreachable during deduct, request ${request.id} stays PENDING for reconciliation. Error: ${error.message}`);
      }

      await queryRunner.commitTransaction();
      return request;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async approveRequest(requestId: string, managerId: string): Promise<TimeOffRequest> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const request = await queryRunner.manager.findOne(TimeOffRequest, {
        where: { id: requestId },
      });

      if (!request) throw new RequestNotFoundException();
      if (request.status !== RequestStatus.PENDING) {
        throw new InvalidStatusTransitionException(`Cannot approve request in ${request.status} status`);
      }

      const balance = await queryRunner.manager.findOne(LeaveBalance, {
        where: { employeeId: request.employeeId, locationId: request.locationId },
      });

      if (balance) {
        balance.pendingDays = Math.max(0, balance.pendingDays - request.daysRequested);
        balance.usedDays += request.daysRequested;
        await queryRunner.manager.save(balance);
      }

      request.status = RequestStatus.APPROVED;
      request.reviewedBy = managerId;
      request.reviewedAt = new Date();
      await queryRunner.manager.save(request);

      await queryRunner.commitTransaction();
      return request;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async rejectRequest(requestId: string, managerId: string): Promise<TimeOffRequest> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let request: TimeOffRequest | null = null;
    try {
      request = await queryRunner.manager.findOne(TimeOffRequest, {
        where: { id: requestId },
      });

      if (!request) throw new RequestNotFoundException();
      if (request.status !== RequestStatus.PENDING) {
        throw new InvalidStatusTransitionException(`Cannot reject request in ${request.status} status`);
      }

      const balance = await queryRunner.manager.findOne(LeaveBalance, {
        where: { employeeId: request.employeeId, locationId: request.locationId },
      });

      if (balance) {
        balance.pendingDays = Math.max(0, balance.pendingDays - request.daysRequested);
        await queryRunner.manager.save(balance);
      }

      request.status = RequestStatus.REJECTED;
      request.reviewedBy = managerId;
      request.reviewedAt = new Date();
      await queryRunner.manager.save(request);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    if (request) {
      try {
        await this.hcmClientService.restoreBalance(request.employeeId, request.locationId, request.daysRequested, request.id);
      } catch (error) {
        this.logger.error(`Failed to restore balance to HCM for rejected request ${request.id}: ${error.message}`);
      }
    }

    return request!;
  }

  async cancelRequest(requestId: string, employeeId: string): Promise<TimeOffRequest> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let request: TimeOffRequest | null = null;
    try {
      request = await queryRunner.manager.findOne(TimeOffRequest, {
        where: { id: requestId },
      });

      if (!request) throw new RequestNotFoundException();
      if (request.requestedBy !== employeeId) {
        throw new UnauthorizedCancellationException();
      }
      if (request.status !== RequestStatus.PENDING) {
        throw new InvalidStatusTransitionException('Only PENDING requests can be cancelled');
      }

      const balance = await queryRunner.manager.findOne(LeaveBalance, {
        where: { employeeId: request.employeeId, locationId: request.locationId },
      });

      if (balance) {
        balance.pendingDays = Math.max(0, balance.pendingDays - request.daysRequested);
        await queryRunner.manager.save(balance);
      }

      request.status = RequestStatus.CANCELLED;
      await queryRunner.manager.save(request);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    if (request) {
      try {
        await this.hcmClientService.restoreBalance(request.employeeId, request.locationId, request.daysRequested, request.id);
      } catch (error) {
        this.logger.error(`Failed to restore balance to HCM for cancelled request ${request.id}: ${error.message}`);
      }
    }

    return request!;
  }

  async getBalance(employeeId: string, locationId: string): Promise<LeaveBalanceDto> {
    let balance = await this.dataSource.manager.findOne(LeaveBalance, {
      where: { employeeId, locationId }
    });

    if (!balance) {
      balance = await this.syncBalanceFromHcm(employeeId, locationId);
    } else {
      const isOlderThan5Min = !balance.lastSyncedAt || (new Date().getTime() - balance.lastSyncedAt.getTime() > 5 * 60 * 1000);
      if (isOlderThan5Min) {
        this.syncBalanceFromHcm(employeeId, locationId).catch(err => {
          this.logger.error(`Background sync failed for ${employeeId}: ${err.message}`);
        });
      }
    }

    const availableDays = balance.totalDays - balance.usedDays - balance.pendingDays;

    return {
      employeeId: balance.employeeId,
      locationId: balance.locationId,
      totalDays: balance.totalDays,
      usedDays: balance.usedDays,
      pendingDays: balance.pendingDays,
      availableDays,
    };
  }

  async syncBalanceFromHcm(employeeId: string, locationId: string): Promise<LeaveBalance> {
    const hcmBalance = await this.hcmClientService.getBalance(employeeId, locationId);
    
    return this.dataSource.transaction(async (manager) => {
      let balance: LeaveBalance | null = await manager.findOne(LeaveBalance, {
        where: { employeeId, locationId },
      });

      if (!balance) {
        balance = manager.create(LeaveBalance, {
          employeeId,
          locationId,
          totalDays: hcmBalance.totalDays,
          usedDays: hcmBalance.usedDays,
          pendingDays: 0,
        });
      } else {
        balance.totalDays = hcmBalance.totalDays;
        balance.usedDays = hcmBalance.usedDays;
      }
      
      balance.lastSyncedAt = new Date();
      return await manager.save(balance);
    });
  }
  async listRequests(employeeId: string): Promise<TimeOffRequest[]> {
    return this.dataSource.manager.find(TimeOffRequest, {
      where: { employeeId },
      order: { createdAt: 'DESC' },
    });
  }

  async getRequest(requestId: string): Promise<TimeOffRequest> {
    const request = await this.dataSource.manager.findOne(TimeOffRequest, {
      where: { id: requestId },
    });
    if (!request) throw new RequestNotFoundException();
    return request;
  }
}
