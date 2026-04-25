/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { ValidationPipe } from '@nestjs/common';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import express from 'express';
import { Server } from 'http';
import { DataSource } from 'typeorm';
import { LeaveBalance } from '../src/modules/leave/entities';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let mockServer: Server;
  let dataSource: DataSource;
  let mockBalances: Record<
    string,
    {
      employeeId: string;
      locationId: string;
      totalDays: number;
      usedDays: number;
    }
  > = {};
  let mockRequests: string[] = [];

  beforeAll((done) => {
    const mockApp = express();
    mockApp.use(express.json());

    mockApp.post('/admin/reset', (req, res) => {
      mockBalances = {
        'EMP-001_LOC-1': {
          employeeId: 'EMP-001',
          locationId: 'LOC-1',
          totalDays: 20,
          usedDays: 5,
        },
        'EMP-002_LOC-1': {
          employeeId: 'EMP-002',
          locationId: 'LOC-1',
          totalDays: 10,
          usedDays: 0,
        },
        'EMP-NO-BAL_LOC-1': {
          employeeId: 'EMP-NO-BAL',
          locationId: 'LOC-1',
          totalDays: 10,
          usedDays: 0,
        },
      };
      mockRequests = [];
      forcedErrors = {};
      res.status(200).send({ success: true });
    });

    mockApp.post('/admin/anniversary-bonus', (req, res) => {
      const { employeeId, locationId, bonusDays } = req.body;
      const key = `${employeeId}_${locationId}`;
      if (mockBalances[key]) {
        mockBalances[key].totalDays += bonusDays;
      }
      res.status(200).send({ success: true });
    });

    mockApp.get('/admin/state', (req, res) => {
      res.json(mockBalances);
    });

    let forcedErrors: Record<
      string,
      { status?: number; code?: string; type?: string }
    > = {};
    mockApp.post('/admin/set-hcm-error', (req, res) => {
      const { employeeId, locationId, status, code, type } = req.body;
      forcedErrors[`${employeeId}_${locationId}_${type || 'DEDUCT'}`] = {
        status,
        code,
      };
      res.sendStatus(200);
    });

    mockApp.get('/balances', (req, res) => {
      const employeeId = req.query.employeeId as string;
      const locationId = req.query.locationId as string;
      const error = forcedErrors[`${employeeId}_${locationId}_GET`];
      if (error) {
        return res
          .status(error.status || 400)
          .send({ code: error.code, message: 'Forced error' });
      }

      if (
        req.headers['simulate_error'] ||
        req.query.locationId === 'LOC-ERROR'
      ) {
        return res.status(502).send({ message: 'Bad Gateway' });
      }
      const key = `${employeeId}_${locationId}`;
      const balance = mockBalances[key] || {
        employeeId,
        locationId,
        totalDays: 0,
        usedDays: 0,
      };
      res.json(balance);
    });

    mockApp.post('/balances/deduct', (req, res) => {
      const { employeeId, locationId, days, requestId } = req.body;
      const errorKey = `${employeeId}_${locationId}_DEDUCT`;
      const error = forcedErrors[errorKey];
      if (error) {
        return res
          .status(error.status || 400)
          .send({ code: error.code, message: 'Forced error' });
      }

      if (req.headers['simulate_error']) {
        return res.status(502).send({ message: 'Bad Gateway' });
      }
      const key = `${employeeId}_${locationId}`;
      const balance = mockBalances[key] || {
        employeeId,
        locationId,
        totalDays: 100,
        usedDays: 0,
      };
      if (balance.totalDays - balance.usedDays < days) {
        return res.status(400).send({
          code: 'INSUFFICIENT_BALANCE',
          message: 'Insufficient balance',
        });
      }
      balance.usedDays += days;
      mockRequests.push(requestId);
      res.json({ success: true, hcmReference: `HCM-${requestId}` });
    });

    mockApp.post('/balances/restore', (req, res) => {
      const { employeeId, locationId, days } = req.body;
      const error = forcedErrors[`${employeeId}_${locationId}_RESTORE`];
      if (error) {
        return res
          .status(error.status || 500)
          .send({ message: 'Forced error' });
      }

      if (req.headers['simulate_error']) {
        return res.status(502).send({ message: 'Bad Gateway' });
      }
      const key = `${employeeId}_${locationId}`;
      if (mockBalances[key]) {
        mockBalances[key].usedDays -= days;
      }
      res.json({ success: true });
    });

    mockServer = mockApp.listen(4001, () => {
      done();
    });
  });

  afterAll((done) => {
    mockServer.close(done);
  });

  beforeEach(async () => {
    process.env.HCM_BASE_URL = 'http://localhost:4001';
    process.env.HCM_API_KEY = 'test-key';
    process.env.NODE_ENV = 'test'; // Ensures in-memory DB

    // Call /admin/reset before each test to clear mock HCM state
    await request(mockServer).post('/admin/reset').send();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());

    await app.init();

    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  it('1. Full happy path: create request -> approve -> verify balance deducted', async () => {
    // 1. Create request
    const createRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId: 'EMP-001',
        locationId: 'LOC-1',
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        daysRequested: 5,
        requestedBy: 'EMP-001',
      })
      .expect(201);

    const reqId = createRes.body.id;
    expect(createRes.body.status).toBe('PENDING');

    // 2. Approve request
    await request(app.getHttpServer())
      .patch(`/leave/requests/${reqId}/approve`)
      .send({ managerId: 'MGR-1' })
      .expect(200);

    // 3. Verify balance deducted
    const balRes = await request(app.getHttpServer())
      .get('/leave/balances')
      .query({ employeeId: 'EMP-001', locationId: 'LOC-1' })
      .expect(200);

    // total 20, used initially 5. We requested 5. So used should be 10.
    // available should be 20 - 10 - 0 = 10
    expect(balRes.body.usedDays).toBe(10);
    expect(balRes.body.pendingDays).toBe(0);
    expect(balRes.body.availableDays).toBe(10);
  });

  it('2. Rejection path: create request -> reject -> verify balance restored', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId: 'EMP-001',
        locationId: 'LOC-1',
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        daysRequested: 5,
        requestedBy: 'EMP-001',
      })
      .expect(201);

    const reqId = createRes.body.id;

    await request(app.getHttpServer())
      .patch(`/leave/requests/${reqId}/reject`)
      .send({ managerId: 'MGR-1' })
      .expect(200);

    // Verify balance restored locally
    const balRes = await request(app.getHttpServer())
      .get('/leave/balances')
      .query({ employeeId: 'EMP-001', locationId: 'LOC-1' })
      .expect(200);

    expect(balRes.body.usedDays).toBe(5);
    expect(balRes.body.pendingDays).toBe(0);
    expect(balRes.body.availableDays).toBe(15);

    // Check mock admin state
    const mockStateRes = await request(mockServer).get('/admin/state');
    expect(mockStateRes.body['EMP-001_LOC-1'].usedDays).toBe(5);
  });

  it('3. Cancellation path: create request -> cancel -> verify pendingDays = 0', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId: 'EMP-001',
        locationId: 'LOC-1',
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        daysRequested: 5,
        requestedBy: 'EMP-001',
      })
      .expect(201);

    const reqId = createRes.body.id;

    await request(app.getHttpServer())
      .delete(`/leave/requests/${reqId}`)
      .send({ employeeId: 'EMP-001' })
      .expect(200);

    const balRes = await request(app.getHttpServer())
      .get('/leave/balances')
      .query({ employeeId: 'EMP-001', locationId: 'LOC-1' })
      .expect(200);

    expect(balRes.body.pendingDays).toBe(0);
    expect(balRes.body.usedDays).toBe(5);
  });

  it('4. Double-spend prevention: create two requests that together exceed balance; second returns 422', async () => {
    // EMP-002 has total 10, used 0. Available 10.
    await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId: 'EMP-002',
        locationId: 'LOC-1',
        startDate: '2026-10-01',
        endDate: '2026-10-06',
        daysRequested: 6,
        requestedBy: 'EMP-002',
      })
      .expect(201);

    // Second request asks for 5, exceeding remaining 4
    await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId: 'EMP-002',
        locationId: 'LOC-1',
        startDate: '2026-11-01',
        endDate: '2026-11-05',
        daysRequested: 5,
        requestedBy: 'EMP-002',
      })
      .expect(422); // Unprocessable Entity - Insufficient Balance
  });

  it('5. Work anniversary sync: trigger POST /admin/anniversary-bonus on mock -> call POST /leave/balances/sync -> verify local totalDays updated', async () => {
    // Check initial local balance (forces sync from mock which is 20)
    let balRes = await request(app.getHttpServer())
      .get('/leave/balances')
      .query({ employeeId: 'EMP-001', locationId: 'LOC-1' })
      .expect(200);
    expect(balRes.body.totalDays).toBe(20);

    // Give bonus
    await request(mockServer)
      .post('/admin/anniversary-bonus')
      .send({ employeeId: 'EMP-001', locationId: 'LOC-1', bonusDays: 5 })
      .expect(200);

    // Sync
    await request(app.getHttpServer())
      .post('/leave/balances/sync')
      .send({ employeeId: 'EMP-001', locationId: 'LOC-1' })
      .expect(201); // Post returns 201 by default in NestJS

    // Check again
    balRes = await request(app.getHttpServer())
      .get('/leave/balances')
      .query({ employeeId: 'EMP-001', locationId: 'LOC-1' })
      .expect(200);
    expect(balRes.body.totalDays).toBe(25);
  });

  it('6. Batch sync: call POST /leave/balances/batch with updated balances -> verify local DB', async () => {
    await request(app.getHttpServer())
      .post('/leave/balances/batch')
      .send({
        items: [
          {
            employeeId: 'EMP-001',
            locationId: 'LOC-1',
            totalDays: 30,
            usedDays: 10,
          },
          {
            employeeId: 'EMP-002',
            locationId: 'LOC-1',
            totalDays: 15,
            usedDays: 2,
          },
        ],
      })
      .expect(201);

    const bal1 = await request(app.getHttpServer())
      .get('/leave/balances')
      .query({ employeeId: 'EMP-001', locationId: 'LOC-1' })
      .expect(200);
    expect(bal1.body.totalDays).toBe(30);
    expect(bal1.body.usedDays).toBe(10);

    const bal2 = await request(app.getHttpServer())
      .get('/leave/balances')
      .query({ employeeId: 'EMP-002', locationId: 'LOC-1' })
      .expect(200);
    expect(bal2.body.totalDays).toBe(15);
    expect(bal2.body.usedDays).toBe(2);
  });

  it('7. HCM chaos: start request with SIMULATE_ERROR header set on mock -> verify request stays PENDING and no balance rollback occurs', async () => {
    const res = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('SIMULATE_ERROR', 'true')
      .send({
        employeeId: 'EMP-001',
        locationId: 'LOC-1',
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        daysRequested: 5,
        requestedBy: 'EMP-001',
      })
      .expect(201);

    expect(res.body.status).toBe('PENDING');

    const balRes = await request(app.getHttpServer())
      .get('/leave/balances')
      .query({ employeeId: 'EMP-001', locationId: 'LOC-1' })
      .expect(200);

    // pendingDays should be 5, not rolled back
    expect(balRes.body.pendingDays).toBe(5);
  });

  it('8. Invalid date range: startDate > endDate returns 400', async () => {
    await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId: 'EMP-001',
        locationId: 'LOC-1',
        startDate: '2026-10-10',
        endDate: '2026-10-05', // End before start
        daysRequested: 5,
        requestedBy: 'EMP-001',
      })
      .expect(400);
  });

  it('9. List requests: GET /leave/requests?employeeId=X returns only that employee`s requests', async () => {
    await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId: 'EMP-001',
        locationId: 'LOC-1',
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        daysRequested: 2,
        requestedBy: 'EMP-001',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId: 'EMP-002',
        locationId: 'LOC-1',
        startDate: '2026-11-01',
        endDate: '2026-11-02',
        daysRequested: 2,
        requestedBy: 'EMP-002',
      })
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get('/leave/requests')
      .query({ employeeId: 'EMP-001' })
      .expect(200);

    expect(listRes.body.length).toBe(1);
    expect(listRes.body[0].employeeId).toBe('EMP-001');
  });

  it("10. Health check: GET /health returns 200 { status: 'ok' }", async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  it('11. Invalid status transition: approve an already approved request', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId: 'EMP-001',
        locationId: 'LOC-1',
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        daysRequested: 2,
        requestedBy: 'EMP-001',
      })
      .expect(201);

    const reqId = createRes.body.id;

    await request(app.getHttpServer())
      .patch(`/leave/requests/${reqId}/approve`)
      .send({ managerId: 'MGR-1' })
      .expect(200);

    // Try to approve again
    await request(app.getHttpServer())
      .patch(`/leave/requests/${reqId}/approve`)
      .send({ managerId: 'MGR-1' })
      .expect(409); // Conflict - InvalidStatusTransitionException
  });

  it('12. Unauthorized cancellation: cancel a request from different employee', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId: 'EMP-001',
        locationId: 'LOC-1',
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        daysRequested: 2,
        requestedBy: 'EMP-001',
      })
      .expect(201);

    const reqId = createRes.body.id;

    await request(app.getHttpServer())
      .delete(`/leave/requests/${reqId}`)
      .send({ employeeId: 'EMP-WRONG' })
      .expect(403); // Forbidden
  });

  it('13. Get request by ID: GET /leave/requests/:id', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId: 'EMP-001',
        locationId: 'LOC-1',
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        daysRequested: 2,
        requestedBy: 'EMP-001',
      })
      .expect(201);

    const reqId = createRes.body.id;

    const res = await request(app.getHttpServer())
      .get(`/leave/requests/${reqId}`)
      .expect(200);

    expect(res.body.id).toBe(reqId);
  });

  it('14. Request not found: GET /leave/requests/:id with non-existent ID', async () => {
    await request(app.getHttpServer())
      .get('/leave/requests/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });

  it('15. HCM service error on sync triggers 502', async () => {
    await request(app.getHttpServer())
      .post('/leave/balances/sync')
      .send({ employeeId: 'EMP-001', locationId: 'LOC-ERROR' })
      .expect(502); // Bad Gateway mapped by global exception filter
  }, 10000);

  it('16. Edge case: HCM available days drops to 0 after request creation but before approval', async () => {
    // 1. Create a request (EMP-001 initially has 20 total, 5 used. Available = 15)
    // We request 2 days.
    const createRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId: 'EMP-001',
        locationId: 'LOC-1',
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        daysRequested: 2,
        requestedBy: 'EMP-001',
      })
      .expect(201);

    const reqId = createRes.body.id;

    // The mock HCM now has total 20, used 7 (5 initial + 2 deducted). Available = 13.
    // 2. We update HCM to make available off-days = 0.
    // We can do this by subtracting 13 from totalDays.
    await request(mockServer)
      .post('/admin/anniversary-bonus')
      .send({ employeeId: 'EMP-001', locationId: 'LOC-1', bonusDays: -13 })
      .expect(200);

    // Verify mock HCM available is 0
    const mockStateRes = await request(mockServer).get('/admin/state');
    const hcmState = mockStateRes.body['EMP-001_LOC-1'];
    expect(hcmState.totalDays - hcmState.usedDays).toBe(0);

    // 3. Approve the request
    // Even though HCM available is 0, the approval should succeed because the days
    // for this specific request were already deducted from HCM during creation.
    await request(app.getHttpServer())
      .patch(`/leave/requests/${reqId}/approve`)
      .send({ managerId: 'MGR-1' })
      .expect(200);

    // 4. Verify local balance reflects the approval
    const balRes = await request(app.getHttpServer())
      .get('/leave/balances')
      .query({ employeeId: 'EMP-001', locationId: 'LOC-1' })
      .expect(200);

    expect(balRes.body.pendingDays).toBe(0);
    // Note: Local usedDays will be 7 (5 initial + 2 approved)
    expect(balRes.body.usedDays).toBe(7);
  });

  it('17. Invalid days requested: daysRequested <= 0 returns 400', async () => {
    await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId: 'EMP-001',
        locationId: 'LOC-1',
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        daysRequested: 0,
        requestedBy: 'EMP-001',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId: 'EMP-001',
        locationId: 'LOC-1',
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        daysRequested: -5,
        requestedBy: 'EMP-001',
      })
      .expect(400);
  });

  it('18. Conflict: Reject an already rejected request', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId: 'EMP-001',
        locationId: 'LOC-1',
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        daysRequested: 1,
        requestedBy: 'EMP-001',
      })
      .expect(201);
    const reqId = createRes.body.id;

    await request(app.getHttpServer())
      .patch(`/leave/requests/${reqId}/reject`)
      .send({ managerId: 'MGR-1' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/leave/requests/${reqId}/reject`)
      .send({ managerId: 'MGR-1' })
      .expect(409);
  });

  it('19. Conflict: Cancel an already approved request', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId: 'EMP-001',
        locationId: 'LOC-1',
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        daysRequested: 1,
        requestedBy: 'EMP-001',
      })
      .expect(201);
    const reqId = createRes.body.id;

    await request(app.getHttpServer())
      .patch(`/leave/requests/${reqId}/approve`)
      .send({ managerId: 'MGR-1' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/leave/requests/${reqId}`)
      .send({ employeeId: 'EMP-001' })
      .expect(409);
  });

  it('20. HCM Error: Invalid dimension (400)', async () => {
    const employeeId = 'EMP-DIM-ERROR';
    const locationId = 'LOC-1';

    // Seed balance locally
    await request(app.getHttpServer())
      .post('/leave/balances/batch')
      .send({ items: [{ employeeId, locationId, totalDays: 10, usedDays: 0 }] })
      .expect(201);

    // Set HCM error to INVALID_DIMENSION
    await request(mockServer)
      .post('/admin/set-hcm-error')
      .send({
        employeeId,
        locationId,
        code: 'INVALID_DIMENSION',
        type: 'DEDUCT',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId: 'EMP-DIM-ERROR',
        locationId: 'LOC-1',
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        daysRequested: 1,
        requestedBy: 'EMP-DIM-ERROR',
      })
      .expect(400);
  });

  it('22. HCM Error: Insufficient Balance from HCM during deduct', async () => {
    // Seed balance locally
    await request(app.getHttpServer())
      .post('/leave/balances/batch')
      .send({
        items: [
          {
            employeeId: 'EMP-HCM-INS',
            locationId: 'LOC-1',
            totalDays: 10,
            usedDays: 0,
          },
        ],
      })
      .expect(201);

    // Make mock return INSUFFICIENT_BALANCE for this employee
    await request(mockServer)
      .post('/admin/set-hcm-error')
      .send({
        employeeId: 'EMP-HCM-INS',
        locationId: 'LOC-1',
        code: 'INSUFFICIENT_BALANCE',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId: 'EMP-HCM-INS',
        locationId: 'LOC-1',
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        daysRequested: 1,
        requestedBy: 'EMP-HCM-INS',
      })
      .expect(422); // Mapped to InsufficientBalanceException
  });

  it('23. HCM Error: Generic API Error (403)', async () => {
    await request(app.getHttpServer())
      .post('/leave/balances/batch')
      .send({
        items: [
          {
            employeeId: 'EMP-403',
            locationId: 'LOC-1',
            totalDays: 10,
            usedDays: 0,
          },
        ],
      })
      .expect(201);

    await request(mockServer)
      .post('/admin/set-hcm-error')
      .send({ employeeId: 'EMP-403', locationId: 'LOC-1', status: 403 })
      .expect(200);

    await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId: 'EMP-403',
        locationId: 'LOC-1',
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        daysRequested: 1,
        requestedBy: 'EMP-403',
      })
      .expect(400); // Mapped from HcmApiException (status < 500)
  });

  it('24. Background sync failure coverage', async () => {
    const employeeId = 'EMP-SYNC-FAIL';
    const locationId = 'LOC-1';

    // 1. Seed balance with old date
    await request(app.getHttpServer())
      .post('/leave/balances/batch')
      .send({ items: [{ employeeId, locationId, totalDays: 10, usedDays: 0 }] })
      .expect(201);

    // Manually set lastSyncedAt to 1 hour ago
    await dataSource
      .getRepository(LeaveBalance)
      .update(
        { employeeId, locationId },
        { lastSyncedAt: new Date(Date.now() - 3600000) },
      );

    // Make mock fail for this employee
    await request(mockServer)
      .post('/admin/set-hcm-error')
      .send({ employeeId, locationId, status: 500, type: 'GET' })
      .expect(200);

    // Call getBalance - should trigger background sync which fails (swallowed but logged)
    await request(app.getHttpServer())
      .get('/leave/balances')
      .query({ employeeId, locationId })
      .expect(200);

    // Small delay to let background task finish
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('25. Restore balance failure coverage in reject/cancel', async () => {
    const employeeId = 'EMP-RESTORE-FAIL';
    const locationId = 'LOC-1';

    // Seed balance locally
    await request(app.getHttpServer())
      .post('/leave/balances/batch')
      .send({ items: [{ employeeId, locationId, totalDays: 10, usedDays: 0 }] })
      .expect(201);

    const createRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId,
        locationId,
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        daysRequested: 1,
        requestedBy: employeeId,
      })
      .expect(201);
    const reqId = createRes.body.id;

    // Make restore fail
    await request(mockServer)
      .post('/admin/set-hcm-error')
      .send({ employeeId, locationId, status: 500, type: 'RESTORE' })
      .expect(200);

    // Reject - should log error but return success
    await request(app.getHttpServer())
      .patch(`/leave/requests/${reqId}/reject`)
      .send({ managerId: 'MGR-1' })
      .expect(200);
  }, 10000);

  it('26. Sync balance for non-existent local employee (init from HCM)', async () => {
    const employeeId = 'EMP-NEVER-SEEN';
    const locationId = 'LOC-1';

    // Seed mock ONLY
    mockBalances[`${employeeId}_${locationId}`] = {
      employeeId,
      locationId,
      totalDays: 30,
      usedDays: 5,
    };

    await request(app.getHttpServer())
      .get('/leave/balances')
      .query({ employeeId, locationId })
      .expect(200); // Should call sync and create local record
  });

  it('27. HcmApiException branch: status 400 with generic message', async () => {
    const employeeId = 'EMP-GENERIC-400';
    const locationId = 'LOC-1';
    await request(app.getHttpServer())
      .post('/leave/balances/batch')
      .send({ items: [{ employeeId, locationId, totalDays: 10, usedDays: 0 }] })
      .expect(201);

    await request(mockServer)
      .post('/admin/set-hcm-error')
      .send({ employeeId, locationId, status: 400, code: 'SOME_OTHER_ERROR' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId,
        locationId,
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        daysRequested: 1,
        requestedBy: employeeId,
      })
      .expect(400);
  });

  it('28. Restore balance failure coverage in cancel', async () => {
    const employeeId = 'EMP-CANCEL-RESTORE-FAIL';
    const locationId = 'LOC-1';

    await request(app.getHttpServer())
      .post('/leave/balances/batch')
      .send({ items: [{ employeeId, locationId, totalDays: 10, usedDays: 0 }] })
      .expect(201);

    const createRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId,
        locationId,
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        daysRequested: 1,
        requestedBy: employeeId,
      })
      .expect(201);
    const reqId = createRes.body.id;

    await request(mockServer)
      .post('/admin/set-hcm-error')
      .send({ employeeId, locationId, status: 500, type: 'RESTORE' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/leave/requests/${reqId}`)
      .send({ employeeId })
      .expect(200);
  }, 10000);

  it('29. Coverage: Global exception filter raw error', async () => {
    await request(app.getHttpServer()).get('/health?error=1').expect(500);

    await request(app.getHttpServer()).get('/health?error=2').expect(500);
  });

  it('30. LeaveService coverage: getBalance fail during requestTimeOff', async () => {
    const employeeId = 'EMP-GET-FAIL';
    const locationId = 'LOC-1';

    // Mock GET balance fails
    await request(mockServer)
      .post('/admin/set-hcm-error')
      .send({ employeeId, locationId, status: 500, type: 'GET' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId,
        locationId,
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        daysRequested: 1,
        requestedBy: employeeId,
      })
      .expect(422); // Balance init to 0, then 1 > 0 fails
  }, 10000);

  it('31. Coverage: Duplicate batch sync update', async () => {
    const employeeId = 'EMP-DUP-BATCH';
    const locationId = 'LOC-1';

    // First batch
    await request(app.getHttpServer())
      .post('/leave/balances/batch')
      .send({ items: [{ employeeId, locationId, totalDays: 10, usedDays: 0 }] })
      .expect(201);

    // Second batch for same employee
    await request(app.getHttpServer())
      .post('/leave/balances/batch')
      .send({ items: [{ employeeId, locationId, totalDays: 20, usedDays: 5 }] })
      .expect(201);

    const balRes = await request(app.getHttpServer())
      .get('/leave/balances')
      .query({ employeeId, locationId })
      .expect(200);
    expect(balRes.body.totalDays).toBe(20);
    expect(balRes.body.usedDays).toBe(5);
  });

  it('32. Coverage: approve request when local balance has been deleted', async () => {
    const employeeId = 'EMP-NO-BAL';
    const locationId = 'LOC-1';

    // 1. Create a request
    const resp = await request(app.getHttpServer())
      .post('/leave/requests')
      .send({
        employeeId,
        locationId,
        startDate: '2026-01-01',
        endDate: '2026-01-02',
        daysRequested: 1,
        requestedBy: employeeId,
      })
      .expect(201);

    const reqId = resp.body.id;

    // 2. Delete the balance from DB manually
    await dataSource
      .getRepository(LeaveBalance)
      .delete({ employeeId, locationId });

    // 3. Approve the request
    await request(app.getHttpServer())
      .patch(`/leave/requests/${reqId}/approve`)
      .send({ managerId: 'MGR-1' })
      .expect(200);

    const updatedReq = await request(app.getHttpServer())
      .get(`/leave/requests/${reqId}`)
      .expect(200);
    expect(updatedReq.body.status).toBe('APPROVED');
  });
});
