// Runs before every test file (see "jest.setupFiles" in package.json),
// i.e. BEFORE src/config/env.js is first required. This makes the suite
// pass in a clean checkout / CI with no server/.env file present.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-production';
