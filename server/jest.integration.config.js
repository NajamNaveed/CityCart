// Real-MongoDB integration tests. Run with: npm run test:integration
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
  testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
  testTimeout: 120000, // first run downloads a mongod binary
  maxWorkers: 1, // one in-memory server at a time
};