# Time-Off Management System

## Project Overview
This repository contains the **Time-Off Service**, a microservice designed to handle employee leave requests. To support its development and testing, a secondary **HCM Service** is included as a placeholder/mock server to simulate a real Human Capital Management system.

### Primary Service: Time-Off Service (`timeoff-service`)
The core of this project is the `timeoff-service`. It is responsible for:
- Managing the full lifecycle of employee time-off requests (Creation, Approval, Rejection, Cancellation).
- Orchestrating communication with the HCM system to ensure data consistency and balance validation.
- [Detailed documentation for Time-Off Service](./timeoff-service/README.md)

### Support Service: HCM Service (`hcm-service`)
The `hcm-service` is a **placeholder service** created specifically to act as the Human Capital Management system for development and integration testing.
- It provides a mock source of truth for employee records and leave balances.
- It is NOT intended for production use but serves to demonstrate the `timeoff-service`'s ability to integrate with external systems.
- [Detailed documentation for HCM Service](./hcm-service/README.md)

---

## Setup and Running the Project

### Prerequisites
- **Node.js**: v18.x or higher
- **npm**: v9.x or higher

### Initial Setup
From the root directory, install all dependencies for the workspace:
```bash
npm install
```

### Running the System
To see the full system in action, you should run both services:

```bash
# From the root directory
npm run start:all
```

This will start:
- **Time-Off Service** on port `3000`
- **HCM Service (Placeholder)** on port `4001`

### API Documentation (Swagger)
Once the services are running, you can access the interactive Swagger documentation at the following URLs:
- **Time-Off Service API**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
- **HCM Service API**: [http://localhost:4001/api/docs](http://localhost:4001/api/docs)

### Running the Time-Off Service (Main)
If you wish to run the main service individually:

1. **Navigate to the service directory**:
   ```bash
   cd timeoff-service
   ```
2. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   ```
3. **Start the Service**:
   ```bash
   npm run start:dev
   ```

---

## Testing
Comprehensive tests are available for the main logic:
```bash
# Run all tests in the workspace
npm run test:all
```
For specific integration tests that utilize the mock HCM service, refer to the `timeoff-service` documentation.
