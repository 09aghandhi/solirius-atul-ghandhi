
jest.setTimeout(30000);

afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 1000));
});

global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};