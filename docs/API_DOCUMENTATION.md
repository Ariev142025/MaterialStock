# API Documentation - Material Stock Monitoring System

Base URL: `http://localhost:3001/api` (atau `https://your_domain.com/api` untuk production)

## Authentication

### Login
```
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}

Response 200:
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "John Doe",
    "role": "SPV"
  }
}
```

### Register
```
POST /auth/register
Content-Type: application/json

{
  "email": "newuser@example.com",
  "password": "password",
  "full_name": "Jane Doe",
  "role": "SPV"
}

Response 201:
{
  "success": true,
  "message": "User registered successfully",
  "userId": "uuid"
}
```

---

## Projects

### Get All Projects
```
GET /projects
Authorization: Bearer TOKEN

Response 200:
{
  "success": true,
  "count": 5,
  "data": [
    {
      "id": "uuid",
      "project_code": "PRJ-001",
      "project_name": "Residential Complex A",
      "location": "Jakarta",
      "status": "ACTIVE",
      "start_date": "2024-01-01",
      "end_date": "2025-12-31"
    }
  ]
}
```

### Get Project Details
```
GET /projects/:projectId
Authorization: Bearer TOKEN

Response 200:
{
  "success": true,
  "data": {
    "id": "uuid",
    "project_code": "PRJ-001",
    "project_name": "Residential Complex A",
    "description": "Commercial building project",
    "location": "Jakarta",
    "client_name": "PT. ABC",
    "total_budget": 500000000,
    "status": "ACTIVE",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

### Create Project
```
POST /projects
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "project_code": "PRJ-002",
  "project_name": "Office Building B",
  "description": "Modern office building",
  "location": "Surabaya",
  "client_name": "PT. XYZ",
  "total_budget": 750000000,
  "start_date": "2024-03-01",
  "end_date": "2026-06-30"
}

Response 201:
{
  "success": true,
  "message": "Project created",
  "projectId": "uuid"
}
```

---

## Materials

### Get All Materials
```
GET /materials?category=STRUCTURAL
Authorization: Bearer TOKEN

Query Parameters:
- category: Filter by category
- is_active: true/false

Response 200:
{
  "success": true,
  "count": 25,
  "data": [
    {
      "id": "uuid",
      "material_code": "MAT-001",
      "material_name": "Portland Cement",
      "unit_of_measure": "Bag",
      "category": "STRUCTURAL",
      "unit_price": 75000
    }
  ]
}
```

### Create Material
```
POST /materials
Authorization: Bearer TOKEN (ADMIN only)
Content-Type: application/json

{
  "material_code": "MAT-002",
  "material_name": "Steel Rebar",
  "description": "Steel reinforcement bars",
  "unit_of_measure": "Ton",
  "category": "STRUCTURAL",
  "unit_price": 8500000
}

Response 201:
{
  "success": true,
  "materialId": "uuid"
}
```

---

## Budget Management

### Set Material Quota
```
POST /materials-budgets/:projectId
Authorization: Bearer TOKEN (QS only)
Content-Type: application/json

{
  "materialId": "uuid",
  "budget_plafon": 10000000,
  "initial_qty": 100
}

Response 201:
{
  "success": true,
  "message": "Budget quota set",
  "budgetId": "uuid"
}
```

### Get Budget Status
```
GET /materials-budgets/:projectId
Authorization: Bearer TOKEN

Response 200:
{
  "success": true,
  "data": [
    {
      "material_id": "uuid",
      "material_name": "Portland Cement",
      "budget_plafon": 10000000,
      "initial_qty": 100,
      "remaining_qty": 75,
      "used_qty": 25,
      "usage_percentage": 25
    }
  ]
}
```

---

## Material Requests

### Create Request
```
POST /requests
Authorization: Bearer TOKEN (QS, SPV)
Content-Type: application/json

{
  "projectId": "uuid",
  "items": [
    {
      "materialId": "uuid",
      "requestedQty": 50
    },
    {
      "materialId": "uuid",
      "requestedQty": 100
    }
  ],
  "notes": "Urgent untuk pekerjaan fondasi"
}

Response 201:
{
  "success": true,
  "message": "Material request created",
  "requestId": "uuid"
}

Error 400:
{
  "error": "Insufficient budget quota for Portland Cement",
  "material": "Portland Cement",
  "requested": 150,
  "available": 75
}
```

### Get Project Requests
```
GET /requests?projectId=uuid&status=PENDING
Authorization: Bearer TOKEN

Query Parameters:
- status: PENDING, VERIFIED, PROCESSING, RECEIVING, CLOSED
- stage: QS, PM, PURCHASING, SITE, CLOSED

Response 200:
{
  "success": true,
  "count": 8,
  "data": [
    {
      "id": "uuid",
      "request_no": "REQ-PRJ001-20240115",
      "status": "PENDING",
      "current_stage": "QS",
      "requested_by_name": "John Doe",
      "item_count": 3,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Get Request Details
```
GET /requests/:requestId
Authorization: Bearer TOKEN

Response 200:
{
  "success": true,
  "request": {
    "id": "uuid",
    "request_no": "REQ-PRJ001-20240115",
    "status": "PENDING",
    "current_stage": "QS"
  },
  "items": [
    {
      "id": "uuid",
      "material_name": "Portland Cement",
      "requested_qty": 50,
      "received_qty": 0,
      "rejection_status": "NONE"
    }
  ]
}
```

### Verify Request (PM)
```
PUT /requests/:requestId/verify
Authorization: Bearer TOKEN (PM only)
Content-Type: application/json

{}

Response 200:
{
  "success": true,
  "message": "Request verified",
  "request": {
    "status": "VERIFIED",
    "current_stage": "PM"
  }
}
```

### Receive Request (SPV - Site Checklist)
```
POST /requests/:requestId/receive
Authorization: Bearer TOKEN (SPV only)
Content-Type: application/json

{
  "items": [
    {
      "itemId": "uuid",
      "receivedQty": 48,
      "rejectionStatus": "PARTIAL",
      "siteComment": "2 bags rusak selama pengiriman"
    }
  ]
}

Response 200:
{
  "success": true,
  "message": "Materials received and checklist completed"
}
```

### Close Request (PURCHASING - ACID Transaction)
```
PUT /requests/:requestId/close
Authorization: Bearer TOKEN (PURCHASING only)
Content-Type: application/json

{}

Response 200:
{
  "success": true,
  "message": "Request closed - Budget quota and on-site stock updated"
}
```

ATOMIC OPERATIONS:
- Budget quota dikurangi
- On-site stock ditambahkan
- Material IN transaction dicatat
- Audit log dibuat
- All or nothing - tidak ada partial update

### Reject Request
```
PUT /requests/:requestId/reject
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "reason": "Spesifikasi material tidak sesuai dengan PO"
}

Response 200:
{
  "success": true,
  "message": "Request rejected"
}
```

---

## Inventory Management

### Get Project Inventory
```
GET /inventory/:projectId
Authorization: Bearer TOKEN

Response 200:
{
  "success": true,
  "count": 12,
  "data": [
    {
      "id": "uuid",
      "material_name": "Portland Cement",
      "unit_of_measure": "Bag",
      "current_qty": 250,
      "min_stock": 50,
      "on_site_stock": 250,
      "budget_remaining_percentage": 75,
      "stock_status": "NORMAL"
    },
    {
      "material_name": "Steel Rebar",
      "current_qty": 5,
      "stock_status": "CRITICAL"
    }
  ]
}
```

### Record Material Out
```
POST /inventory/:projectId/out
Authorization: Bearer TOKEN (SPV, FOREMAN)
Content-Type: application/json

{
  "materialId": "uuid",
  "quantity": 25,
  "workPackage": "Basement Foundation - Unit A",
  "purpose": "Concrete pouring untuk pondasi utama",
  "notes": "Sesua dengan drawing REV-2"
}

Response 201:
{
  "success": true,
  "message": "Material out recorded successfully",
  "data": {
    "quantity": 25,
    "workPackage": "Basement Foundation - Unit A",
    "newStock": 225
  }
}

Error 400:
{
  "error": "Insufficient stock for material out",
  "requested": 100,
  "available": 50
}
```

### Get Stock Transactions (Audit Trail)
```
GET /inventory/:projectId/transactions?type=OUT&startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer TOKEN

Query Parameters:
- type: IN, OUT
- startDate: ISO date format
- endDate: ISO date format

Response 200:
{
  "success": true,
  "count": 45,
  "data": [
    {
      "id": "uuid",
      "material_name": "Portland Cement",
      "type": "OUT",
      "qty_change": -25,
      "reference_work_package": "Basement Foundation - Unit A",
      "purpose": "Concrete pouring",
      "performed_by_name": "Ahmad Rizki",
      "created_at": "2024-01-20T14:30:00Z",
      "current_stock_level": 225
    }
  ]
}
```

### Get Material Distribution Report
```
GET /inventory/:projectId/distribution?workPackage=Basement&startDate=2024-01-01
Authorization: Bearer TOKEN

Response 200:
{
  "success": true,
  "count": 8,
  "data": [
    {
      "work_package": "Basement Foundation - Unit A",
      "material_name": "Portland Cement",
      "unit_of_measure": "Bag",
      "total_qty_distributed": 150,
      "transaction_count": 6,
      "purposes": "Concrete pouring; Floor screed",
      "last_distribution": "2024-01-25T10:00:00Z"
    }
  ]
}
```

---

## Reports & Export

### Export Request Summary (PDF/Excel)
```
GET /reports/requests/:projectId?format=pdf&startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer TOKEN

Query Parameters:
- format: pdf, excel (default: pdf)
- startDate: ISO date
- endDate: ISO date

Response: File download (PDF or XLSX)
```

### Export Inventory Report
```
GET /reports/inventory/:projectId?format=excel
Authorization: Bearer TOKEN

Query Parameters:
- format: pdf, excel

Response: File with columns:
- Material Name
- Planned Qty
- On-Site Qty
- Used Qty
- Usage %
```

### Export Distribution Report
```
GET /reports/distribution/:projectId?format=excel&startDate=2024-01-01
Authorization: Bearer TOKEN

Response: File with:
- Work Package
- Material Name
- Qty Distributed
- Purpose
- Last Distribution Date
```

---

## User Management

### Get All Users
```
GET /users?role=SPV
Authorization: Bearer TOKEN (ADMIN only)

Query Parameters:
- role: ADMIN, QS, SPV, PM, PURCHASING, FOREMAN

Response 200:
{
  "success": true,
  "count": 15,
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "full_name": "John Doe",
      "role": "SPV",
      "position": "Site Supervisor",
      "department": "Operations",
      "is_active": true,
      "last_login": "2024-01-20T08:00:00Z"
    }
  ]
}
```

### Update User
```
PUT /users/:userId
Authorization: Bearer TOKEN (ADMIN only)
Content-Type: application/json

{
  "full_name": "Jane Doe",
  "position": "Senior Site Supervisor",
  "is_active": true
}

Response 200:
{
  "success": true,
  "user": { ... }
}
```

---

## Error Handling

Semua errors mengikuti format ini:

```json
{
  "error": "Error message description",
  "field": "fieldName (jika ada)",
  "statusCode": 400
}
```

### Common Error Codes

| Code | Message |
|------|---------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Token missing/invalid |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Duplicate entry/Invalid state |
| 500 | Internal Server Error |

---

## WebSocket Events (Real-Time)

Connect to: `ws://localhost:3001/socket.io`

### Server Events (Listen)

```javascript
// Material request created
socket.on('request:created', (data) => {
  console.log('New request:', data);
});

// Request verified
socket.on('request:verified', (data) => {
  console.log('Request verified:', data);
});

// Materials received
socket.on('request:received', (data) => {
  console.log('Materials received:', data);
});

// Stock updated
socket.on('inventory:updated', (data) => {
  console.log('Stock updated:', data);
});

// Notifications
socket.on('notification:new', (data) => {
  console.log('New notification:', data.message);
});
```

### Client Events (Emit)

```javascript
// Join project room
socket.emit('join:project', { projectId: 'uuid' });

// Leave project
socket.emit('leave:project', { projectId: 'uuid' });
```

---

## Rate Limiting

- API Requests: 100 per 15 minutes per IP
- WebSocket Connections: 5 concurrent connections per user

## Authentication Headers

Semua requests (kecuali login/register) memerlukan:

```
Authorization: Bearer <JWT_TOKEN>
```

Token expires dalam 24 jam. Gunakan refresh token untuk mendapatkan token baru.

---

**API Version**: 1.0.0  
**Last Updated**: 2024
