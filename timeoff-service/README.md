# timeoff-service

ExampleHR TimeOff Microservice.

## Description
This is a NestJS microservice responsible for the full lifecycle of employee time-off requests within the ExampleHR platform. It acts as an orchestration layer between employee-facing product surfaces and an authoritative external Human Capital Management (HCM) system.

## How to run locally
1. Install dependencies: `npm install`
2. Create `.env` from `.env.example`
3. Run the application: `npm run start:dev`

## How to run tests
- Unit tests: `npm run test`
- E2E tests: `npm run test:e2e`

## Environment Variables
- `DB_PATH`: Path to the SQLite database file (default: `./data/timeoff.db`)
- `HCM_BASE_URL`: Base URL for the HCM API
- `HCM_API_KEY`: API key for the HCM API
- `PORT`: Port the service listens on (default: 3000)
