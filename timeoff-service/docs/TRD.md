# Technical Requirements Document (TRD) - Time-Off Service

## 1. Overview
The **Time-Off Service** is a microservice responsible for managing employee leave requests and balances. It acts as a middleware between the user-facing application and the **Human Capital Management (HCM)** system, which remains the source of truth for all leave balances.

## 2. Core Features

### 2.1 Balance Management
- **Local Cache**: Employee balances are cached locally in a SQLite database to ensure high performance and availability.
- **HCM Integration**: Every leave request must be validated against the HCM system.
- **Deduction Strategy**: 
  - When a request is submitted, the service first checks the local cache.
  - If sufficient, it calls the HCM `/balances/deduct` endpoint.
  - If HCM returns success, the request is marked as `PENDING` (local) and balance is temporarily "held".
- **Restoration**: If a request is `REJECTED` by a manager or `CANCELLED` by the employee, the service calls HCM `/balances/restore` to return the days.

### 2.2 Resiliency & Fault Tolerance
- **Transaction Integrity**: Local database operations and HCM calls are wrapped in transactions where possible.
- **HCM Failures**:
  - **4xx Errors**: Mapped to local exceptions (e.g., `422 Insufficient Balance`, `400 Invalid Request`).
  - **5xx/Network Errors**: If HCM is unreachable during deduction, the local request is still created and kept in `PENDING` state. This prevents data loss and allows for later reconciliation.
- **Retry Logic**: Outbound calls to HCM implement exponential backoff retries for transient network errors.

### 2.3 Synchronization
- **On-Demand Sync**: Triggered when a local balance is missing or older than 5 minutes.
- **Batch Ingestion**: Supports high-volume updates from HCM via a `/leave/balances/batch` endpoint.
- **Background Sync**: Occasionally refreshes stale local data during `GET /balances` calls without blocking the user.

## 3. API Endpoints

### Time-Off Requests
- `POST /leave/requests`: Submit a new request.
- `GET /leave/requests`: List requests (filterable by `employeeId`).
- `GET /leave/requests/:id`: Get detailed status.
- `PATCH /leave/requests/:id/approve`: Approve a pending request.
- `PATCH /leave/requests/:id/reject`: Reject a pending request (restores HCM balance).
- `DELETE /leave/requests/:id`: Cancel own pending request (restores HCM balance).

### Balances
- `GET /leave/balances`: Get current local balance (triggers sync if stale).
- `POST /leave/balances/sync`: Force immediate HCM sync.
- `POST /leave/balances/batch`: Ingest bulk updates from HCM.

### Monitoring
- `GET /health`: System health and dependency status.

## 4. Technical Stack
- **Framework**: NestJS (TypeScript)
- **Database**: TypeORM + SQLite
- **Communication**: Axios (@nestjs/axios) with custom retry interceptors.
- **Testing**: Jest + Supertest (E2E with programmatic Mock HCM).

## 5. Security
- **API Keys**: All communication with HCM is secured via an API Key passed in headers.
- **Ownership**: Cancellation of requests is restricted to the original requester.
