# File Upload API

An Express.js API that takes an input of CSV file uploads containing user data and does email validation for each record.

## 1. Install & Run

```bash
git clone <repo>
cd file-upload-api
npm install
npm run dev   # dev mode
# or
npm start     # prod mode
```

Server: `http://localhost:3000` (override with `PORT`)

---

## 2. Upload CSV

**POST** `/upload`

* Body: `multipart/form-data` with key `file` (CSV)
* CSV must have:

```csv
name,email
John Doe,john@example.com
Jane Smith,jane@test.org
```

**Response:**

```json
{
  "uploadId": "abc123",
  "message": "Processing started",
  "totalRecords": 3
}
```

---

## 3. Check Status

**GET** `/status/:uploadId`

Example while running:

```json
{
  "status": "processing",
  "processedRecords": 7,
  "failedRecords": 1,
  "progress": "70%"
}
```

Example when done:

```json
{
  "status": "completed",
  "progress": "100%",
  "details": [
    { "email": "invalid-email", "error": "Invalid email format" }
  ]
}
```

---

## Notes

* CSV only
* 10 requests/min per IP
* Email checks run 5 at a time

---