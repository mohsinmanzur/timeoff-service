# HCM Placeholder Service

> [!IMPORTANT]
> This service is a **placeholder/mock server** created to support the development and testing of the `timeoff-service`. It is not intended for standalone production use.

## Description
The `hcm-service` simulates a Human Capital Management (HCM) system. In a real-world scenario, this would be an external enterprise system (like Workday or BambooHR). For this project, it provides the necessary API endpoints for the `timeoff-service` to:
- Query employee leave balances.
- Update balances when a time-off request is approved.
- Provide a mock source of truth for employee data.

## Key Features (Mock)
- **Balance Management**: Simple tracking of employee leave balances in a local SQLite database.
- **Administrative API**: Basic endpoints for manually setting up test data and adjusting balances.

## Setup for Development

### Installation
```bash
$ npm install
```

### Environment Configuration
```bash
$ cp .env.example .env
```
Default port: `4001`

## Running the Mock Service
```bash
# watch mode
$ npm run start:dev
```

## Tech Stack
- **Framework**: NestJS
- **Database**: SQLite (local dev data only)
