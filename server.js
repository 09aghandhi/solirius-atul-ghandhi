const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const pLimit = require('p-limit');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { Readable } = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const uploadStatus = new Map();

const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      const error = new Error('Only CSV files are allowed');
      error.code = 'INVALID_FILE_TYPE';
      cb(error, false);
    }
  }
});

const uploadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: {
    error: 'Too many upload requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

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
    }, 100 + Math.random() * 200);
  });
};

const limit = pLimit(5);

const parseCSVFile = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    const errors = [];

    fs.createReadStream(filePath)
        .pipe(csv({
          mapHeaders: ({ header }) => header.trim().toLowerCase()
        }))
        .on('data', (data) => {
          if (!data.name || !data.email) {
            errors.push({
              row: results.length + errors.length + 1,
              error: 'Missing required fields (name, email)'
            });
            return;
          }

          results.push({
            name: data.name.trim(),
            email: data.email.trim()
          });
        })
        .on('end', () => {
          if (errors.length > 0) {
            reject(new Error(`CSV parsing errors: ${JSON.stringify(errors)}`));
          } else {
            resolve(results);
          }
        })
        .on('error', reject);
  });
};

const processEmailValidations = async (records, uploadId) => {
  const totalRecords = records.length;
  let processedCount = 0;
  const failedRecords = [];
  const successfulRecords = [];

  uploadStatus.set(uploadId, {
    status: 'processing',
    totalRecords,
    processedRecords: 0,
    failedRecords: 0,
    progress: '0%',
    details: []
  });

  try {
    const validationPromises = records.map((record, index) =>
        limit(async () => {
          try {
            logger.info(`Validating email: ${record.email}`, { uploadId, recordIndex: index });

            const result = await mockValidateEmail(record.email);

            if (result.valid) {
              successfulRecords.push(record);
              logger.info(`Email validation successful: ${record.email}`, { uploadId });
            } else {
              const failedRecord = {
                name: record.name,
                email: record.email,
                error: 'Invalid email format'
              };
              failedRecords.push(failedRecord);
              logger.warn(`Email validation failed: ${record.email}`, { uploadId });
            }

            processedCount++;

            const progress = Math.round((processedCount / totalRecords) * 100);
            uploadStatus.set(uploadId, {
              status: 'processing',
              totalRecords,
              processedRecords: processedCount,
              failedRecords: failedRecords.length,
              progress: `${progress}%`,
              details: failedRecords
            });

          } catch (error) {
            logger.error(`Email validation error for ${record.email}: ${error.message}`, { uploadId });

            const failedRecord = {
              name: record.name,
              email: record.email,
              error: error.message
            };
            failedRecords.push(failedRecord);
            processedCount++;

            const progress = Math.round((processedCount / totalRecords) * 100);
            uploadStatus.set(uploadId, {
              status: 'processing',
              totalRecords,
              processedRecords: processedCount,
              failedRecords: failedRecords.length,
              progress: `${progress}%`,
              details: failedRecords
            });
          }
        })
    );

    await Promise.all(validationPromises);

    const finalResult = {
      status: 'completed',
      totalRecords,
      processedRecords: successfulRecords.length,
      failedRecords: failedRecords.length,
      progress: '100%',
      details: failedRecords,
      completedAt: new Date().toISOString()
    };

    uploadStatus.set(uploadId, finalResult);
    logger.info(`Upload processing completed: ${uploadId}`, finalResult);

    return finalResult;

  } catch (error) {
    logger.error(`Processing failed for upload ${uploadId}: ${error.message}`);

    uploadStatus.set(uploadId, {
      status: 'failed',
      error: error.message,
      totalRecords,
      processedRecords: processedCount,
      failedRecords: failedRecords.length,
      progress: `${Math.round((processedCount / totalRecords) * 100)}%`,
      details: failedRecords
    });

    throw error;
  }
};

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({
    message: 'File Upload API with Email Validation',
    version: '1.0.0',
    status: 'Running',
    endpoints: {
      health: 'GET /health',
      upload: 'POST /upload (requires CSV file)',
      status: 'GET /status/:uploadId'
    },
    documentation: 'See README.md for usage instructions',
    testEndpoint: 'Try visiting /health'
  });
});

app.post('/upload', uploadLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded. Please upload a CSV file.'
      });
    }

    const uploadId = uuidv4();
    const filePath = req.file.path;

    logger.info(`File upload started: ${uploadId}`, {
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

    let records;
    try {
      records = await parseCSVFile(filePath);
    } catch (error) {
      fs.unlink(filePath, (unlinkError) => {
        if (unlinkError) {
          logger.error(`Failed to delete uploaded file: ${unlinkError.message}`);
        }
      });

      return res.status(400).json({
        error: 'Invalid CSV file format',
        details: error.message
      });
    }

    if (records.length === 0) {
      fs.unlink(filePath, (unlinkError) => {
        if (unlinkError) {
          logger.error(`Failed to delete uploaded file: ${unlinkError.message}`);
        }
      });

      return res.status(400).json({
        error: 'CSV file contains no valid records'
      });
    }

    res.json({
      uploadId,
      message: 'File uploaded successfully. Processing started.',
      totalRecords: records.length
    });

    processEmailValidations(records, uploadId)
        .catch(error => {
          logger.error(`Async processing failed for ${uploadId}: ${error.message}`);
        })
        .finally(() => {
          fs.unlink(filePath, (unlinkError) => {
            if (unlinkError) {
              logger.error(`Failed to delete uploaded file: ${unlinkError.message}`);
            }
          });
        });

  } catch (error) {
    logger.error(`Upload endpoint error: ${error.message}`);

    if (req.file) {
      fs.unlink(req.file.path, (unlinkError) => {
        if (unlinkError) {
          logger.error(`Failed to delete uploaded file: ${unlinkError.message}`);
        }
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while processing your upload'
    });
  }
});

app.get('/status/:uploadId', (req, res) => {
  const { uploadId } = req.params;

  if (!uploadStatus.has(uploadId)) {
    return res.status(404).json({
      error: 'Upload ID not found'
    });
  }

  const status = uploadStatus.get(uploadId);
  res.json({
    uploadId,
    ...status
  });
});

app.use((error, req, res, next) => {
  logger.error(`Unhandled error: ${error.message}`, { stack: error.stack });

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large. Maximum size is 10MB.'
      });
    }
    return res.status(400).json({
      error: 'File upload error',
      details: error.message
    });
  }

  if (error.code === 'INVALID_FILE_TYPE') {
    return res.status(400).json({
      error: error.message
    });
  }

  res.status(500).json({
    error: 'Internal server error'
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found'
  });
});

let cleanupInterval;
if (process.env.NODE_ENV !== 'test') {
  cleanupInterval = setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);

    for (const [uploadId, status] of uploadStatus.entries()) {
      const statusTime = status.completedAt ?
          new Date(status.completedAt).getTime() :
          Date.now() - (2 * 60 * 60 * 1000);

      if (statusTime < oneHourAgo) {
        uploadStatus.delete(uploadId);
        logger.info(`Cleaned up old upload status: ${uploadId}`);
      }
    }
  }, 60 * 60 * 1000);
}

if (require.main === module) {
  const server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    console.log(`Server running on http://localhost:${PORT}`);
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    if (cleanupInterval) clearInterval(cleanupInterval);
    server.close(() => {
      logger.info('HTTP server closed');
    });
  });
}

module.exports = app;