// jest.setup.js
// Global test setup and teardown

// Increase default timeout for integration tests
jest.setTimeout(30000);

// Clean up any test artifacts
afterAll(async () => {
  // Close any open handles
  await new Promise(resolve => setTimeout(resolve, 1000));
});

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};