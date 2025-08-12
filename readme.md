# File Upload API with Asynchronous Email Validation

A robust Express.js API that processes CSV file uploads containing user data and performs asynchronous email validation for each record.

## Features

### Core Functionality
- **File Upload**: Accept CSV files via `/upload` endpoint
- **CSV Parsing**: Stream-based parsing for memory efficiency
- **Email Validation**: Asynchronous validation with mock external service
- **Concurrency Control**: Limit simultaneous validations to 5 at a time
- **Status Tracking**: Real-time progress tracking via `/status/:uploadId`

### Advanced Features
- **Rate Limiting**: 10 requests per minute per IP
- **Error Handling**: Comprehensive error handling with proper HTTP status codes
- **Logging**: Structured logging with Winston
- **Unit Tests**: Comprehensive test suite with Jest
- **Memory Management**: Stream-based file processing for large files

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd file-upload-api
```

2. Install dependencies:
```bash
npm install
```

3. Create necessary directories:
```bash
mkdir uploads
mkdir logs
```

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in the `PORT` environment variable).

## API Endpoints

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### File Upload
```http
POST /upload
```

**Request:**
- Content-Type: `multipart/form-data`
- Body: CSV file with `name` and `email` columns

**CSV Format:**
```csv
name,email
John Doe,john@example.com
Jane Smith,jane@example.com
Bob Wilson,invalid-email
```

**Response (Immediate):**
```json
{
  "uploadId": "abc123-def456-ghi789",
  "message": "File uploaded successfully. Processing started.",
  "totalRecords": 3
}
```

### Status Tracking
```http
GET /status/:uploadId
```

**Response (Processing):**
```json
{
  "uploadId": "abc123-def456-ghi789",
  "status": "processing",
  "totalRecords": 10,
  "processedRecords": 7,
  "failedRecords": 1,
  "progress": "70%",
  "details": [
    {
      "name": "Bob Wilson",
      "email": "invalid-email",
      "error": "Invalid email format"
    }
  ]
}
```

**Response (Completed):**
```json
{
  "uploadId": "abc123-def456-ghi789",
  "status": "completed",
  "totalRecords": 10,
  "processedRecords": 9,
  "failedRecords": 1,
  "progress": "100%",
  "details": [
    {
      "name": "Bob Wilson",
      "email": "invalid-email",
      "error": "Invalid email format"
    }
  ],
  "completedAt": "2024-01-01T12:05:30.000Z"
}
```

## Testing

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Generate Coverage Report
```bash
npm run test:coverage
```

## Test Examples

### Using cURL

1. **Upload a CSV file:**
```bash
curl -X POST http://localhost:3000/upload \
  -F "file=@sample.csv" \
  -H "Content-Type: multipart/form-data"
```

2. **Check upload status:**
```bash
curl http://localhost:3000/status/abc123-def456-ghi789
```

### Using Postman

1. Create a new POST request to `http://localhost:3000/upload`
2. In the Body tab, select `form-data`
3. Add a key `file` with type `File` and select your CSV file
4. Send the request
5. Use the returned `uploadId` to check status at `http://localhost:3000/status/{uploadId}`

## Sample CSV Files

### Valid CSV
```csv
name,email
John Doe,john@example.com
Jane Smith,jane@test.org
Alice Johnson,alice@company.co.uk
```

### CSV with Mixed Valid/Invalid Emails
```csv
name,email
John Doe,john@example.com
Jane Smith,invalid-email
Bob Wilson,bob@test
Alice Johnson,alice@company.com
Charlie Brown,charlie.brown@email
```

## Configuration

### Environment Variables

- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment mode (development/production)

### Rate Limiting

- Upload endpoint: 10 requests per minute per IP
- Configurable in `server.js`

### Concurrency Control

- Maximum 5 simultaneous email validations
- Configurable via `p-limit` settings

## Architecture

### Key Components

1. **Express.js Server**: Main HTTP server with middleware
2. **Multer**: File upload handling
3. **CSV Parser**: Stream-based CSV processing
4. **p-limit**: Concurrency control for email validations
5. **Winston**: Structured logging
6. **In-Memory Storage**: Upload status tracking

### Data Flow

1. Client uploads CSV file via POST /upload
2. Server validates file format and parses CSV
3. Server returns immediate response with uploadId
4. Asynchronous processing begins:
   - Email validations run with concurrency limit
   - Progress updates stored in memory
   - Results accumulated
5. Client can poll /status/:uploadId for progress
6. Processing completes and final results are stored

### Error Handling

- **File Validation**: Invalid file types, missing files
- **CSV Parsing**: Malformed CSV, missing required fields
- **Email Validation**: Service timeouts, validation failures
- **Rate Limiting**: Too many requests
- **Server Errors**: Unexpected errors with proper logging

## Performance Considerations

### Memory Efficiency
- Stream-based CSV parsing to handle large files
- Cleanup of uploaded files after processing
- Periodic cleanup of old upload statuses

### Scalability
- Concurrency limiting prevents overwhelming external services
- Rate limiting protects against abuse
- Stateless design (except for in-memory status tracking)

## Logging

Logs are written to:
- `error.log`: Error-level messages only
- `combined.log`: All log messages
- Console: Development-friendly formatted output

Log levels used:
- `info`: Normal operations, processing updates
- `warn`: Invalid data, validation failures
- `error`: System errors, exceptions

## Security Considerations

- File type validation (CSV only)
- File size limits (10MB)
- Rate limiting to prevent abuse
- Input validation and sanitization
- Error message sanitization

## Future Enhancements

- Database integration for persistent status storage
- Authentication and authorization
- Email validation with real external services
- Webhook notifications for completion
- File encryption for sensitive data
- Horizontal scaling support

## Troubleshooting

### Common Issues

1. **"Only CSV files are allowed"**
   - Ensure file has .csv extension
   - Check MIME type is text/csv

2. **"CSV file contains no valid records"**
   - Verify CSV has proper headers: name,email
   - Ensure data rows are present
   - Check for required fields

3. **Rate limiting errors**
   - Wait before retrying
   - Reduce request frequency

4. **Processing stuck**
   - Check server logs for errors
   - Verify file format is correct
   - Restart server if necessary

### Debug Mode

Enable debug logging by setting environment variable:
```bash
DEBUG=* npm start
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details