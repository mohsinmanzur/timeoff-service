# Time-Off Service (Primary Application)

## Description
The **Time-Off Service** is the main application in this repository. It manages the full lifecycle of employee time-off requests, serving as the central orchestration layer for leave management.

## Key Features
- **Leave Lifecycle Management**: Handles creation, approval, rejection, and cancellation of requests.
- **External Integration**: Programmatically synchronizes with a Human Capital Management (HCM) system.
- **Strict Validation**: Enforces business rules, such as preventing requests that exceed available leave balances.
- **Atomic Operations**: Ensures data consistency between the local service and the external HCM system.

## How it works
The service maintains its own record of time-off requests while treating an external HCM system (simulated by the `hcm-service` in this repo) as the authoritative source of truth for leave balances. When a request is processed, the service performs a two-way synchronization to ensure both systems remain in sync.

## Project Setup

### Installation
```bash
$ npm install
```

### Environment Configuration
Create a `.env` file from `.env.example`:
```bash
$ cp .env.example .env
```
Default configuration:
- `DB_PATH`: `./data/timeoff.db`
- `HCM_BASE_URL`: `http://localhost:3001` (Points to the placeholder HCM service)
- `PORT`: `3000`

## Running the App

```bash
# development mode with hot-reload
$ npm run start:dev
```

## Running Tests
This project includes extensive test coverage to ensure the reliability of the leave management logic.

```bash
# unit tests
$ npm run test

# integration tests (Requires hcm-service)
$ npm run test:integration

# e2e tests
$ npm run test:e2e
```

## Tech Stack
- **Framework**: [NestJS](https://nestjs.com/)
- **ORM**: [TypeORM](https://typeorm.io/)
- **Database**: [SQLite](https://www.sqlite.org/)
- **API Documentation**: Swagger (available at `/api`)
