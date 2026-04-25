# Time-Off Service

A NestJS microservice for managing employee leave requests with a local SQLite cache and seamless HCM integration.

## 🚀 Getting Started

### 1. Run the Full Stack
To run the service along with a mock HCM "Source of Truth" server:
```bash
npm run start:all
```
This will start:
- **App**: http://localhost:3000
- **HCM Mock**: http://localhost:4001
- **Swagger Docs**: http://localhost:3000/api

### 2. Individual Components
- **Start App Only**: `npm run start:dev`
- **Start HCM Mock Only**: `npm run start:hcm`

## 🧪 Testing

The project includes a comprehensive E2E test suite that validates the entire lifecycle of leave requests, including HCM connectivity, retries, and chaos scenarios.

### Run All Tests with Coverage
```bash
npm run test:cov
```

### Run Tests Individually
- **E2E Tests**: `npm run test:e2e`
- **Integration Tests**: `npm run test:integration`
- **Unit Tests**: `npm run test`

## 📊 Test Coverage Summary

The following coverage was achieved using the E2E test suite:

| File Type | Stmts | Branch | Funcs | Lines |
|-----------|-------|--------|-------|-------|
| **All Files** | **97.93%** | **80.85%** | **97.61%** | **98.89%** |
| `src/modules/leave` | 98.31% | 79.51% | 100% | 100% |
| `src/modules/hcm-client` | 100% | 82.50% | 100% | 100% |
| `src/common/filters` | 91.30% | 80.00% | 100% | 90.47% |

## 📖 Documentation
- **Technical Requirements Document (TRD)**: [TRD.md](../TRD.md)
- **API Specification**: Available at `/api` when the service is running.

## 🛠 Features
- **Local SQLite Cache**: High-performance balance lookups.
- **Atomic Transactions**: Ensures data consistency between local DB and HCM.
- **Fault Tolerance**: Programmatic retries with exponential backoff for HCM calls.
- **Reconciliation**: Automatically handles 5xx/network errors by keeping requests PENDING for later sync.
- **Batch Processing**: Rapidly ingest balance updates from external systems.
