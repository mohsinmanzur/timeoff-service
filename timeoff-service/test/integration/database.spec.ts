import { DataSource, Repository, QueryRunner } from 'typeorm';
import { LeaveBalance } from '../../src/modules/leave/entities/leave-balance.entity';
import { TimeOffRequest, RequestStatus } from '../../src/modules/leave/entities/time-off-request.entity';

// ─── Test DataSource ──────────────────────────────────────────────────────────

async function createTestDataSource(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'sqlite',
    database: ':memory:',
    synchronize: true,
    entities: [LeaveBalance, TimeOffRequest],
    logging: false,
  });
  await ds.initialize();
  return ds;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seedBalance(
  repo: Repository<LeaveBalance>,
  overrides: Partial<LeaveBalance> = {},
): Promise<LeaveBalance> {
  const balance = repo.create({
    employeeId: 'EMP-001',
    locationId: 'LOC-NYC',
    totalDays: 20,
    usedDays: 5,
    pendingDays: 0,
    lastSyncedAt: new Date(),
    ...overrides,
  });
  return repo.save(balance);
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Database Layer — Integration Tests', () => {
  let ds: DataSource;
  let balanceRepo: Repository<LeaveBalance>;
  let requestRepo: Repository<TimeOffRequest>;

  beforeAll(async () => {
    ds = await createTestDataSource();
    balanceRepo = ds.getRepository(LeaveBalance);
    requestRepo = ds.getRepository(TimeOffRequest);
  });

  afterAll(async () => {
    await ds.destroy();
  });

  beforeEach(async () => {
    // Clean slate before every test (clear() issues DELETE FROM without criteria)
    await requestRepo.clear();
    await balanceRepo.clear();
  });

  // ─── 1. Unique constraint ──────────────────────────────────────────────────

  describe('LeaveBalance unique constraint', () => {
    it('throws when inserting a duplicate (employeeId, locationId)', async () => {
      await seedBalance(balanceRepo);

      await expect(
        seedBalance(balanceRepo, { employeeId: 'EMP-001', locationId: 'LOC-NYC' }),
      ).rejects.toThrow(); // SQLITE_CONSTRAINT
    });

    it('allows the same employeeId with a different locationId', async () => {
      await seedBalance(balanceRepo, { locationId: 'LOC-NYC' });
      const second = await seedBalance(balanceRepo, { locationId: 'LOC-LA' });
      expect(second.id).toBeDefined();
    });
  });

  // ─── 2. TimeOffRequest CRUD ───────────────────────────────────────────────

  describe('TimeOffRequest CRUD', () => {
    it('creates, reads, updates status, and deletes a request', async () => {
      // CREATE
      const req = requestRepo.create({
        employeeId: 'EMP-001',
        locationId: 'LOC-NYC',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        daysRequested: 5,
        status: RequestStatus.PENDING,
        requestedBy: 'EMP-001',
      });
      const saved = await requestRepo.save(req);
      expect(saved.id).toBeDefined();
      expect(saved.status).toBe(RequestStatus.PENDING);

      // READ
      const found = await requestRepo.findOne({ where: { id: saved.id } });
      expect(found).not.toBeNull();
      expect(found!.daysRequested).toBe(5);

      // UPDATE status
      found!.status = RequestStatus.APPROVED;
      const updated = await requestRepo.save(found!);
      expect(updated.status).toBe(RequestStatus.APPROVED);

      // Verify persisted
      const reRead = await requestRepo.findOne({ where: { id: saved.id } });
      expect(reRead!.status).toBe(RequestStatus.APPROVED);

      // DELETE
      await requestRepo.delete({ id: saved.id });
      const deleted = await requestRepo.findOne({ where: { id: saved.id } });
      expect(deleted).toBeNull();
    });
  });

  // ─── 3. availableDays calculation ─────────────────────────────────────────

  describe('availableDays calculation', () => {
    it('equals totalDays - usedDays - pendingDays', async () => {
      const balance = await seedBalance(balanceRepo, {
        totalDays: 20,
        usedDays: 5,
        pendingDays: 3,
      });

      const fresh = await balanceRepo.findOne({ where: { id: balance.id } });
      const availableDays = fresh!.totalDays - fresh!.usedDays - fresh!.pendingDays;
      expect(availableDays).toBe(12);
    });

    it('availableDays is 0 when fully consumed', async () => {
      const balance = await seedBalance(balanceRepo, {
        totalDays: 10,
        usedDays: 7,
        pendingDays: 3,
      });

      const fresh = await balanceRepo.findOne({ where: { id: balance.id } });
      const availableDays = fresh!.totalDays - fresh!.usedDays - fresh!.pendingDays;
      expect(availableDays).toBe(0);
    });
  });

  // ─── 4. Sequential pending updates (no over-commit) ───────────────────────

  describe('Concurrent pending updates (simulated sequential)', () => {
    it('two sequential requestTimeOff calls do not over-commit', async () => {
      await seedBalance(balanceRepo, { totalDays: 10, usedDays: 0, pendingDays: 0 });

      // Simulate first request: attempt to reserve 7 days
      const transaction1 = async (): Promise<void> => {
        const qr: QueryRunner = ds.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();
        try {
          const b = await qr.manager.findOne(LeaveBalance, {
            where: { employeeId: 'EMP-001', locationId: 'LOC-NYC' },
          });
          const available = b!.totalDays - b!.usedDays - b!.pendingDays;
          if (available >= 7) {
            b!.pendingDays += 7;
            await qr.manager.save(b!);
          }
          await qr.commitTransaction();
        } finally {
          await qr.release();
        }
      };

      // Simulate second request: attempt to reserve 5 days — would over-commit
      const transaction2 = async (): Promise<string> => {
        const qr: QueryRunner = ds.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();
        let outcome = 'rejected';
        try {
          const b = await qr.manager.findOne(LeaveBalance, {
            where: { employeeId: 'EMP-001', locationId: 'LOC-NYC' },
          });
          const available = b!.totalDays - b!.usedDays - b!.pendingDays;
          if (available >= 5) {
            b!.pendingDays += 5;
            await qr.manager.save(b!);
            outcome = 'committed';
          }
          await qr.commitTransaction();
        } finally {
          await qr.release();
        }
        return outcome;
      };

      await transaction1(); // commits pendingDays = 7
      const result = await transaction2(); // only 3 remain — should be rejected

      expect(result).toBe('rejected');

      const final = await balanceRepo.findOne({
        where: { employeeId: 'EMP-001', locationId: 'LOC-NYC' },
      });
      // pendingDays must not exceed totalDays
      expect(final!.pendingDays).toBeLessThanOrEqual(final!.totalDays);
      expect(final!.pendingDays).toBe(7);
    });
  });

  // ─── 5. Batch ingest ──────────────────────────────────────────────────────

  describe('Batch ingest', () => {
    it('updates all 3 LeaveBalance records from a batch payload', async () => {
      // Pre-seed 3 employees
      await Promise.all([
        seedBalance(balanceRepo, { employeeId: 'EMP-A', locationId: 'LOC-NYC', totalDays: 10, usedDays: 0, pendingDays: 0 }),
        seedBalance(balanceRepo, { employeeId: 'EMP-B', locationId: 'LOC-NYC', totalDays: 10, usedDays: 0, pendingDays: 0 }),
        seedBalance(balanceRepo, { employeeId: 'EMP-C', locationId: 'LOC-NYC', totalDays: 10, usedDays: 0, pendingDays: 0 }),
      ]);

      const batchPayload = [
        { employeeId: 'EMP-A', locationId: 'LOC-NYC', availableDays: 18, usedDays: 2 },
        { employeeId: 'EMP-B', locationId: 'LOC-NYC', availableDays: 15, usedDays: 5 },
        { employeeId: 'EMP-C', locationId: 'LOC-NYC', availableDays: 12, usedDays: 8 },
      ];

      // Simulate ingestBatch logic directly on the DB
      for (const item of batchPayload) {
        const balance = await balanceRepo.findOne({
          where: { employeeId: item.employeeId, locationId: item.locationId },
        });
        balance!.totalDays = item.availableDays + item.usedDays;
        balance!.usedDays = item.usedDays;
        balance!.lastSyncedAt = new Date();
        await balanceRepo.save(balance!);
      }

      const [a, b, c] = await Promise.all([
        balanceRepo.findOne({ where: { employeeId: 'EMP-A', locationId: 'LOC-NYC' } }),
        balanceRepo.findOne({ where: { employeeId: 'EMP-B', locationId: 'LOC-NYC' } }),
        balanceRepo.findOne({ where: { employeeId: 'EMP-C', locationId: 'LOC-NYC' } }),
      ]);

      expect(a!.totalDays).toBe(20);
      expect(a!.usedDays).toBe(2);

      expect(b!.totalDays).toBe(20);
      expect(b!.usedDays).toBe(5);

      expect(c!.totalDays).toBe(20);
      expect(c!.usedDays).toBe(8);

      // All 3 have a fresh lastSyncedAt
      expect(a!.lastSyncedAt).toBeInstanceOf(Date);
      expect(b!.lastSyncedAt).toBeInstanceOf(Date);
      expect(c!.lastSyncedAt).toBeInstanceOf(Date);
    });

    it('creates a new row for an unknown employee in the batch', async () => {
      const batchPayload = [
        { employeeId: 'EMP-NEW', locationId: 'LOC-NYC', availableDays: 25, usedDays: 0 },
      ];

      for (const item of batchPayload) {
        let balance = await balanceRepo.findOne({
          where: { employeeId: item.employeeId, locationId: item.locationId },
        });
        if (!balance) {
          balance = balanceRepo.create({
            employeeId: item.employeeId,
            locationId: item.locationId,
            totalDays: item.availableDays + item.usedDays,
            usedDays: item.usedDays,
            pendingDays: 0,
          });
        } else {
          balance.totalDays = item.availableDays + item.usedDays;
          balance.usedDays = item.usedDays;
        }
        balance.lastSyncedAt = new Date();
        await balanceRepo.save(balance);
      }

      const newRecord = await balanceRepo.findOne({
        where: { employeeId: 'EMP-NEW', locationId: 'LOC-NYC' },
      });
      expect(newRecord).not.toBeNull();
      expect(newRecord!.totalDays).toBe(25);
      expect(newRecord!.lastSyncedAt).toBeInstanceOf(Date);
    });
  });

  // ─── 6. lastSyncedAt ──────────────────────────────────────────────────────

  describe('lastSyncedAt', () => {
    it('is set correctly when HCM sync updates the balance', async () => {
      const before = new Date(Date.now() - 6 * 60 * 1000); // 6 min ago
      const balance = await seedBalance(balanceRepo, { lastSyncedAt: before });

      // Simulate syncBalanceFromHcm updating the record
      const syncedAt = new Date();
      balance.totalDays = 25;
      balance.lastSyncedAt = syncedAt;
      await balanceRepo.save(balance);

      const updated = await balanceRepo.findOne({ where: { id: balance.id } });
      expect(updated!.lastSyncedAt.getTime()).toBeGreaterThanOrEqual(syncedAt.getTime() - 100);
      expect(updated!.totalDays).toBe(25);
    });

    it('lastSyncedAt is null when a balance is created locally without HCM sync', async () => {
      const balance = balanceRepo.create({
        employeeId: 'EMP-NO-SYNC',
        locationId: 'LOC-NYC',
        totalDays: 20,
        usedDays: 0,
        pendingDays: 0,
      });
      // Do NOT set lastSyncedAt
      const saved = await balanceRepo.save(balance);

      const found = await balanceRepo.findOne({ where: { id: saved.id } });
      expect(found!.lastSyncedAt).toBeNull();
    });
  });
});
