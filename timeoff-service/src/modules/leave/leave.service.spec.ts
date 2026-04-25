import { LeaveService } from './leave.service';
import { LeaveBalance, TimeOffRequest, RequestStatus } from './entities';
import {
  InsufficientBalanceException,
  InvalidStatusTransitionException,
  RequestNotFoundException,
  UnauthorizedCancellationException,
} from './exceptions/leave.exceptions';
import {
  HcmInsufficientBalanceException,
  HcmApiException,
} from '../hcm-client/exceptions/hcm.exceptions';

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeBalance = (overrides: Partial<LeaveBalance> = {}): LeaveBalance =>
  Object.assign(new LeaveBalance(), {
    id: 'bal-1',
    employeeId: 'EMP-001',
    locationId: 'LOC-NYC',
    totalDays: 20,
    usedDays: 5,
    pendingDays: 0,
    lastSyncedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

const makeRequest = (overrides: Partial<TimeOffRequest> = {}): TimeOffRequest =>
  Object.assign(new TimeOffRequest(), {
    id: 'req-1',
    employeeId: 'EMP-001',
    locationId: 'LOC-NYC',
    startDate: '2026-08-01',
    endDate: '2026-08-05',
    daysRequested: 5,
    status: RequestStatus.PENDING,
    requestedBy: 'EMP-001',
    reviewedBy: null,
    reviewedAt: null,
    hcmReference: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

// ─── QueryRunner factory ─────────────────────────────────────────────────────

function buildQueryRunner(
  findOneResponses: Array<TimeOffRequest | LeaveBalance | null> = [],
) {
  let callCount = 0;
  const manager = {
    findOne: jest.fn().mockImplementation(() =>
      Promise.resolve(findOneResponses[callCount++] ?? null),
    ),
    create: jest.fn().mockImplementation((_entity, data) => ({ ...data })),
    save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
  };

  return {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager,
  };
}

// ─── DataSource factory ──────────────────────────────────────────────────────

function buildDataSource(
  qr: ReturnType<typeof buildQueryRunner>,
  {
    managerFindOne = jest.fn().mockResolvedValue(null),
    managerFind = jest.fn().mockResolvedValue([]),
    transactionFn,
  }: {
    managerFindOne?: jest.Mock;
    managerFind?: jest.Mock;
    transactionFn?: jest.Mock;
  } = {},
) {
  return {
    createQueryRunner: jest.fn().mockReturnValue(qr),
    manager: {
      findOne: managerFindOne,
      find: managerFind,
    },
    transaction: transactionFn ?? jest.fn(),
  } as any;
}

// ─── HcmClientService mock ───────────────────────────────────────────────────

function buildHcm() {
  return {
    getBalance: jest.fn(),
    deductBalance: jest.fn(),
    restoreBalance: jest.fn().mockResolvedValue(undefined),
    ingestBatch: jest.fn().mockResolvedValue(undefined),
  } as any;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('LeaveService', () => {
  const dto = {
    employeeId: 'EMP-001',
    locationId: 'LOC-NYC',
    startDate: '2026-08-01',
    endDate: '2026-08-05',
    daysRequested: 5,
    requestedBy: 'EMP-001',
  };

  // ── requestTimeOff ────────────────────────────────────────────────────────

  describe('requestTimeOff', () => {
    it('happy path: creates request, increments pendingDays, calls HCM deduct', async () => {
      const balance = makeBalance({ totalDays: 20, usedDays: 5, pendingDays: 0 });
      const qr = buildQueryRunner([balance]);
      const hcm = buildHcm();
      hcm.deductBalance.mockResolvedValue({ success: true, remainingBalance: 10, hcmReference: 'HCM-REF-1' });

      const savedRequest = makeRequest({ id: 'req-new' });
      qr.manager.create.mockReturnValue(savedRequest);
      qr.manager.save.mockResolvedValue(savedRequest);

      const ds = buildDataSource(qr);
      const service = new LeaveService(ds, hcm);

      const result = await service.requestTimeOff(dto);

      expect(result.status).toBe(RequestStatus.PENDING);
      expect(qr.manager.save).toHaveBeenCalled();
      expect(hcm.deductBalance).toHaveBeenCalledWith('EMP-001', 'LOC-NYC', 5, savedRequest.id);
      expect(qr.commitTransaction).toHaveBeenCalled();
      expect(qr.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('insufficient local balance: throws InsufficientBalanceException, no HCM call', async () => {
      const balance = makeBalance({ totalDays: 3, usedDays: 0, pendingDays: 0 });
      const qr = buildQueryRunner([balance]);
      const hcm = buildHcm();
      const ds = buildDataSource(qr);
      const service = new LeaveService(ds, hcm);

      await expect(service.requestTimeOff({ ...dto, daysRequested: 5 })).rejects.toThrow(
        InsufficientBalanceException,
      );
      expect(hcm.deductBalance).not.toHaveBeenCalled();
      expect(qr.rollbackTransaction).toHaveBeenCalled();
    });

    it('HCM returns INSUFFICIENT_BALANCE: rolls back, throws InsufficientBalanceException', async () => {
      const balance = makeBalance({ totalDays: 20, usedDays: 0, pendingDays: 0 });
      const qr = buildQueryRunner([balance]);
      const hcm = buildHcm();
      hcm.deductBalance.mockRejectedValue(new HcmInsufficientBalanceException('HCM insufficient'));

      const savedRequest = makeRequest({ id: 'req-new' });
      qr.manager.create.mockReturnValue(savedRequest);
      qr.manager.save.mockResolvedValue(savedRequest);

      const ds = buildDataSource(qr);
      const service = new LeaveService(ds, hcm);

      await expect(service.requestTimeOff(dto)).rejects.toThrow(InsufficientBalanceException);
      expect(qr.rollbackTransaction).toHaveBeenCalled();
      expect(qr.commitTransaction).not.toHaveBeenCalled();
    });

    it('HCM network error: request stays PENDING, no rollback, logs warning', async () => {
      const balance = makeBalance({ totalDays: 20, usedDays: 0, pendingDays: 0 });
      const qr = buildQueryRunner([balance]);
      const hcm = buildHcm();
      hcm.deductBalance.mockRejectedValue(new Error('Network timeout'));

      const savedRequest = makeRequest({ id: 'req-new' });
      qr.manager.create.mockReturnValue(savedRequest);
      qr.manager.save.mockResolvedValue(savedRequest);

      const ds = buildDataSource(qr);
      const service = new LeaveService(ds, hcm);
      const warnSpy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});

      const result = await service.requestTimeOff(dto);

      expect(result.status).toBe(RequestStatus.PENDING);
      expect(qr.commitTransaction).toHaveBeenCalled();
      expect(qr.rollbackTransaction).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('stays PENDING'));
    });

    it('validation: endDate before startDate throws InvalidRequestException', async () => {
      const qr = buildQueryRunner([]);
      const hcm = buildHcm();
      const ds = buildDataSource(qr);
      const service = new LeaveService(ds, hcm);

      await expect(
        service.requestTimeOff({ ...dto, startDate: '2026-08-10', endDate: '2026-08-01' }),
      ).rejects.toThrow('endDate must be on or after startDate');
    });
  });

  // ── approveRequest ────────────────────────────────────────────────────────

  describe('approveRequest', () => {
    it('happy path: moves pendingDays to usedDays, sets status APPROVED', async () => {
      const req = makeRequest({ status: RequestStatus.PENDING, daysRequested: 5 });
      const balance = makeBalance({ pendingDays: 5, usedDays: 5 });
      const qr = buildQueryRunner([req, balance]);
      const hcm = buildHcm();
      const ds = buildDataSource(qr);
      const service = new LeaveService(ds, hcm);

      const result = await service.approveRequest('req-1', 'MGR-007');

      expect(result.status).toBe(RequestStatus.APPROVED);
      expect(result.reviewedBy).toBe('MGR-007');

      const savedBalance = qr.manager.save.mock.calls.find(
        ([arg]) => 'pendingDays' in arg,
      )?.[0];
      expect(savedBalance?.pendingDays).toBe(0);
      expect(savedBalance?.usedDays).toBe(10);
      expect(qr.commitTransaction).toHaveBeenCalled();
    });

    it('request not found: throws RequestNotFoundException', async () => {
      const qr = buildQueryRunner([null]);
      const hcm = buildHcm();
      const ds = buildDataSource(qr);
      const service = new LeaveService(ds, hcm);

      await expect(service.approveRequest('missing-id', 'MGR-007')).rejects.toThrow(
        RequestNotFoundException,
      );
      expect(qr.rollbackTransaction).toHaveBeenCalled();
    });

    it('request already APPROVED: throws InvalidStatusTransitionException', async () => {
      const req = makeRequest({ status: RequestStatus.APPROVED });
      const qr = buildQueryRunner([req]);
      const hcm = buildHcm();
      const ds = buildDataSource(qr);
      const service = new LeaveService(ds, hcm);

      await expect(service.approveRequest('req-1', 'MGR-007')).rejects.toThrow(
        InvalidStatusTransitionException,
      );
      expect(qr.rollbackTransaction).toHaveBeenCalled();
    });
  });

  // ── rejectRequest ─────────────────────────────────────────────────────────

  describe('rejectRequest', () => {
    it('happy path: decrements pendingDays, calls restoreBalance, status = REJECTED', async () => {
      const req = makeRequest({ status: RequestStatus.PENDING, daysRequested: 5 });
      const balance = makeBalance({ pendingDays: 5 });
      const qr = buildQueryRunner([req, balance]);
      const hcm = buildHcm();
      const ds = buildDataSource(qr);
      const service = new LeaveService(ds, hcm);

      const result = await service.rejectRequest('req-1', 'MGR-007');

      expect(result.status).toBe(RequestStatus.REJECTED);
      expect(result.reviewedBy).toBe('MGR-007');
      expect(hcm.restoreBalance).toHaveBeenCalledWith('EMP-001', 'LOC-NYC', 5, 'req-1');

      const savedBalance = qr.manager.save.mock.calls.find(
        ([arg]) => 'pendingDays' in arg,
      )?.[0];
      expect(savedBalance?.pendingDays).toBe(0);
    });
  });

  // ── cancelRequest ─────────────────────────────────────────────────────────

  describe('cancelRequest', () => {
    it('non-owner tries to cancel: throws UnauthorizedCancellationException', async () => {
      const req = makeRequest({ requestedBy: 'EMP-001', status: RequestStatus.PENDING });
      const qr = buildQueryRunner([req]);
      const hcm = buildHcm();
      const ds = buildDataSource(qr);
      const service = new LeaveService(ds, hcm);

      await expect(service.cancelRequest('req-1', 'DIFFERENT-EMP')).rejects.toThrow(
        UnauthorizedCancellationException,
      );
      expect(qr.rollbackTransaction).toHaveBeenCalled();
    });

    it('APPROVED request cancel attempt: throws InvalidStatusTransitionException', async () => {
      const req = makeRequest({ requestedBy: 'EMP-001', status: RequestStatus.APPROVED });
      const qr = buildQueryRunner([req]);
      const hcm = buildHcm();
      const ds = buildDataSource(qr);
      const service = new LeaveService(ds, hcm);

      await expect(service.cancelRequest('req-1', 'EMP-001')).rejects.toThrow(
        InvalidStatusTransitionException,
      );
      expect(qr.rollbackTransaction).toHaveBeenCalled();
    });

    it('happy path: decrements pendingDays, calls restoreBalance, status = CANCELLED', async () => {
      const req = makeRequest({ requestedBy: 'EMP-001', status: RequestStatus.PENDING, daysRequested: 5 });
      const balance = makeBalance({ pendingDays: 5 });
      const qr = buildQueryRunner([req, balance]);
      const hcm = buildHcm();
      const ds = buildDataSource(qr);
      const service = new LeaveService(ds, hcm);

      const result = await service.cancelRequest('req-1', 'EMP-001');

      expect(result.status).toBe(RequestStatus.CANCELLED);
      expect(hcm.restoreBalance).toHaveBeenCalledWith('EMP-001', 'LOC-NYC', 5, 'req-1');

      const savedBalance = qr.manager.save.mock.calls.find(
        ([arg]) => 'pendingDays' in arg,
      )?.[0];
      expect(savedBalance?.pendingDays).toBe(0);
    });
  });

  // ── getBalance ────────────────────────────────────────────────────────────

  describe('getBalance', () => {
    it('balance is fresh (< 5 min): returns local data, does NOT trigger HCM sync', async () => {
      const balance = makeBalance({
        totalDays: 20,
        usedDays: 5,
        pendingDays: 2,
        lastSyncedAt: new Date(), // just now
      });
      const managerFindOne = jest.fn().mockResolvedValue(balance);
      const qr = buildQueryRunner([]);
      const hcm = buildHcm();
      const ds = buildDataSource(qr, { managerFindOne });
      const service = new LeaveService(ds, hcm);
      const syncSpy = jest.spyOn(service, 'syncBalanceFromHcm');

      const result = await service.getBalance('EMP-001', 'LOC-NYC');

      expect(result.availableDays).toBe(13);
      expect(syncSpy).not.toHaveBeenCalled();
    });

    it('balance is stale (> 5 min): returns local data and triggers background HCM sync', async () => {
      const staleDate = new Date(Date.now() - 6 * 60 * 1000);
      const balance = makeBalance({ lastSyncedAt: staleDate, totalDays: 20, usedDays: 5, pendingDays: 0 });
      const managerFindOne = jest.fn().mockResolvedValue(balance);
      const qr = buildQueryRunner([]);
      const hcm = buildHcm();
      const ds = buildDataSource(qr, { managerFindOne });
      const service = new LeaveService(ds, hcm);
      const syncSpy = jest.spyOn(service, 'syncBalanceFromHcm').mockResolvedValue(balance);

      const result = await service.getBalance('EMP-001', 'LOC-NYC');

      expect(result.availableDays).toBe(15);
      // Background sync is fire-and-forget; give microtasks a tick to queue
      await Promise.resolve();
      expect(syncSpy).toHaveBeenCalledWith('EMP-001', 'LOC-NYC');
    });

    it('no local balance: calls syncBalanceFromHcm and returns the synced balance', async () => {
      const syncedBalance = makeBalance({ totalDays: 25, usedDays: 0, pendingDays: 0 });
      const managerFindOne = jest.fn().mockResolvedValue(null);
      const qr = buildQueryRunner([]);
      const hcm = buildHcm();
      const ds = buildDataSource(qr, { managerFindOne });
      const service = new LeaveService(ds, hcm);
      jest.spyOn(service, 'syncBalanceFromHcm').mockResolvedValue(syncedBalance);

      const result = await service.getBalance('EMP-001', 'LOC-NYC');

      expect(result.totalDays).toBe(25);
      expect(result.availableDays).toBe(25);
    });
  });

  // ── syncBalanceFromHcm ────────────────────────────────────────────────────

  describe('syncBalanceFromHcm', () => {
    it('creates a new LeaveBalance when none exists', async () => {
      const hcmData = { employeeId: 'EMP-001', locationId: 'LOC-NYC', totalDays: 30, usedDays: 2 };
      const hcm = buildHcm();
      hcm.getBalance.mockResolvedValue(hcmData);

      const createdBalance = makeBalance({ totalDays: 30, usedDays: 2 });
      const txManager = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue(createdBalance),
        save: jest.fn().mockResolvedValue({ ...createdBalance, lastSyncedAt: new Date() }),
      };

      const qr = buildQueryRunner([]);
      const ds = buildDataSource(qr);
      ds.transaction = jest.fn().mockImplementation((fn: (em: any) => Promise<any>) => fn(txManager));
      const service = new LeaveService(ds, hcm);

      const result = await service.syncBalanceFromHcm('EMP-001', 'LOC-NYC');

      expect(txManager.create).toHaveBeenCalledWith(
        LeaveBalance,
        expect.objectContaining({ totalDays: 30, usedDays: 2 }),
      );
      expect(result.lastSyncedAt).toBeDefined();
    });

    it('updates existing LeaveBalance totalDays and sets lastSyncedAt', async () => {
      const existingBalance = makeBalance({ totalDays: 20, usedDays: 5 });
      const hcmData = { employeeId: 'EMP-001', locationId: 'LOC-NYC', totalDays: 30, usedDays: 7 };
      const hcm = buildHcm();
      hcm.getBalance.mockResolvedValue(hcmData);

      const txManager = {
        findOne: jest.fn().mockResolvedValue(existingBalance),
        create: jest.fn(),
        save: jest.fn().mockImplementation((b) => Promise.resolve(b)),
      };

      const qr = buildQueryRunner([]);
      const ds = buildDataSource(qr);
      ds.transaction = jest.fn().mockImplementation((fn: (em: any) => Promise<any>) => fn(txManager));
      const service = new LeaveService(ds, hcm);

      const result = await service.syncBalanceFromHcm('EMP-001', 'LOC-NYC');

      expect(txManager.create).not.toHaveBeenCalled();
      expect(result.totalDays).toBe(30);
      expect(result.usedDays).toBe(7);
      expect(result.lastSyncedAt).toBeInstanceOf(Date);
    });
  });
});
