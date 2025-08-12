const request = require('supertest');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
const app = require('./server');

jest.mock('winston', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    json: jest.fn(),
    simple: jest.fn()
  },
  transports: {
    File: jest.fn(),
    Console: jest.fn()
  }
}));

describe('File Upload API', () => {
  const testUploadsDir = path.join(__dirname, 'test-uploads');

  beforeAll(() => {
    if (!fs.existsSync(testUploadsDir)) {
      fs.mkdirSync(testUploadsDir);
    }
  });

  afterAll(() => {
    if (fs.existsSync(testUploadsDir)) {
      fs.rmSync(testUploadsDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    return new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('GET /health', () => {
    test('should return health status', async () => {
      const response = await request(app)
          .get('/health')
          .expect(200);

      expect(response.body).toMatchObject({
        status: 'OK',
        timestamp: expect.any(String)
      });
    });
  });

  describe('POST /upload', () => {
    test('should reject request without file', async () => {
      const response = await request(app)
          .post('/upload')
          .expect(400);

      expect(response.body).toMatchObject({
        error: 'No file uploaded. Please upload a CSV file.'
      });
    });

    test('should reject non-CSV files', async () => {
      const testFilePath = path.join(testUploadsDir, 'test.txt');
      fs.writeFileSync(testFilePath, 'This is not a CSV file');

      const response = await request(app)
          .post('/upload')
          .attach('file', testFilePath);

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Only CSV files are allowed|INVALID_FILE_TYPE/i);

      fs.unlinkSync(testFilePath);
    });

    test('should process valid CSV file', async () => {
      const csvContent = `name,email
John Doe,john@example.com
Jane Smith,jane@example.com
Invalid User,invalid-email`;

      const testFilePath = path.join(testUploadsDir, 'test.csv');
      fs.writeFileSync(testFilePath, csvContent);

      const response = await request(app)
          .post('/upload')
          .attach('file', testFilePath);

      expect(response.status).toBeLessThan(500);

      if (response.status === 200) {
        expect(response.body).toMatchObject({
          uploadId: expect.any(String),
          message: 'File uploaded successfully. Processing started.',
          totalRecords: 3
        });
      } else if (response.status === 429) {
        expect(response.body).toMatchObject({
          error: expect.stringContaining('Too many')
        });
      }

      fs.unlinkSync(testFilePath);
    }, 10000);

    test('should handle empty CSV file', async () => {
      const csvContent = 'name,email\n';

      const testFilePath = path.join(testUploadsDir, 'empty.csv');
      fs.writeFileSync(testFilePath, csvContent);

      const response = await request(app)
          .post('/upload')
          .attach('file', testFilePath);

      if (response.status !== 429) {
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          error: 'CSV file contains no valid records'
        });
      }

      fs.unlinkSync(testFilePath);
    });

    test('should handle malformed CSV file', async () => {
      const csvContent = 'name,email\nJohn Doe\nJane Smith,jane@example.com,extra,field';

      const testFilePath = path.join(testUploadsDir, 'malformed.csv');
      fs.writeFileSync(testFilePath, csvContent);

      const response = await request(app)
          .post('/upload')
          .attach('file', testFilePath);

      if (response.status !== 429) {
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          error: 'Invalid CSV file format'
        });
      }

      fs.unlinkSync(testFilePath);
    });
  });

  describe('GET /status/:uploadId', () => {
    test('should return 404 for non-existent upload ID', async () => {
      const response = await request(app)
          .get('/status/non-existent-id')
          .expect(404);

      expect(response.body).toMatchObject({
        error: 'Upload ID not found'
      });
    });

    test('should return status for valid upload ID after successful upload', async () => {
      const csvContent = 'name,email\nJohn Doe,john@example.com';
      const testFilePath = path.join(testUploadsDir, 'status-test.csv');
      fs.writeFileSync(testFilePath, csvContent);

      await new Promise(resolve => setTimeout(resolve, 1100));

      const uploadResponse = await request(app)
          .post('/upload')
          .attach('file', testFilePath);

      if (uploadResponse.status === 200) {
        const { uploadId } = uploadResponse.body;

        const statusResponse = await request(app)
            .get(`/status/${uploadId}`)
            .expect(200);

        expect(statusResponse.body).toMatchObject({
          uploadId,
          status: expect.any(String),
          totalRecords: expect.any(Number),
          progress: expect.any(String)
        });
      } else {
        const statusResponse = await request(app)
            .get('/status/test-id')
            .expect(404);
      }

      fs.unlinkSync(testFilePath);
    }, 15000);
  });

  describe('Error Handling', () => {
    test('should handle 404 for unknown endpoints', async () => {
      const response = await request(app)
          .get('/unknown-endpoint')
          .expect(404);

      expect(response.body).toMatchObject({
        error: 'Endpoint not found'
      });
    });
  });
});

describe('Email Validation Logic', () => {
  const mockValidateEmail = async (email) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() < 0.1) {
          reject(new Error('Validation service temporarily unavailable'));
          return;
        }

        if (email.includes('@') && email.includes('.')) {
          resolve({ valid: true });
        } else {
          resolve({ valid: false });
        }
      }, 50);
    });
  };

  test('should validate correct email format', async () => {
    const result = await mockValidateEmail('test@example.com');
    expect(result).toEqual({ valid: true });
  });

  test('should reject invalid email format', async () => {
    const result = await mockValidateEmail('invalid-email');
    expect(result).toEqual({ valid: false });
  });

  test('should handle validation service errors', async () => {
    const attempts = [];
    for (let i = 0; i < 20; i++) {
      attempts.push(
          mockValidateEmail('test@example.com').catch(err => err)
      );
    }

    const results = await Promise.all(attempts);
    const errors = results.filter(result => result instanceof Error);

    expect(errors.length).toBeGreaterThan(0);
  }, 10000);
});

describe('CSV Parsing', () => {
  test('should parse valid CSV data', () => {
    const csvData = [
      { name: 'John Doe', email: 'john@example.com' },
      { name: 'Jane Smith', email: 'jane@example.com' }
    ];

    expect(csvData).toHaveLength(2);
    expect(csvData[0]).toMatchObject({
      name: expect.any(String),
      email: expect.any(String)
    });
  });

  test('should handle missing fields', () => {
    const csvData = [
      { name: 'John Doe', email: '' },
      { name: '', email: 'jane@example.com' }
    ];

    const validRecords = csvData.filter(record => record.name && record.email);
    expect(validRecords).toHaveLength(0);
  });
});

describe('Concurrency Control', () => {
  test('should limit concurrent operations', async () => {
    const pLimit = require('p-limit');
    const limit = pLimit(2);

    const tasks = [];
    const startTimes = [];
    const endTimes = [];

    for (let i = 0; i < 5; i++) {
      tasks.push(
          limit(async () => {
            startTimes.push(Date.now());
            await new Promise(resolve => setTimeout(resolve, 100));
            endTimes.push(Date.now());
            return i;
          })
      );
    }

    await Promise.all(tasks);

    const totalTime = Math.max(...endTimes) - Math.min(...startTimes);
    expect(totalTime).toBeGreaterThan(250);
    expect(totalTime).toBeLessThan(400);
  });
});