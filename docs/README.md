# Material Stock Monitoring System

Enterprise-grade Material Stock Monitoring & Budget Management System untuk kontraktor proyek konstruksi.

## 🎯 Features

✅ **Multi-Project Management** - Kelola multiple proyek dengan data terpisah per project  
✅ **RBAC (Role-Based Access Control)** - 6 roles: Admin, QS, SPV, PM, Purchasing, Foreman  
✅ **Budget & Quota Management** - Tracking budget vs actual usage  
✅ **Material Request Workflow** - QS → PM → Purchasing → SPV → Closing  
✅ **Dual Inventory Sync** - Automatic budget & stock updates  
✅ **Material In/Out Tracking** - Complete audit trail dengan distribusi detail  
✅ **Real-time Notifications** - WebSocket updates untuk live collaboration  
✅ **Professional Reports** - Export PDF/Excel dengan template resmi  
✅ **ACID Transactions** - Data integrity untuk critical operations  
✅ **Responsive SaaS UI** - Navy/Slate theme, production-ready design  

## 🏗️ Architecture

```
Material Stock Monitoring System
├── Frontend (Next.js 14 + React 18)
│   ├── Dashboard
│   ├── Project Management
│   ├── Material Requests
│   ├── Inventory Management
│   └── Reports & Export
├── Backend (Node.js + Express)
│   ├── REST API
│   ├── WebSocket Server
│   ├── ACID Transactions
│   └── PDF/Excel Generation
├── Database (PostgreSQL)
│   ├── Multi-tenant Schema
│   ├── ACID Compliance
│   └── Full Audit Trail
└── Deployment (Docker + Nginx)
    ├── Container Orchestration
    ├── Reverse Proxy
    └── SSL/TLS Support
```

## 📋 Requirements

### System Requirements
- **OS**: Ubuntu 20.04 LTS atau lebih baru
- **RAM**: Minimum 4GB (recommended 8GB)
- **Storage**: Minimum 20GB
- **CPU**: 2 cores minimum

### Software Requirements
- Docker & Docker Compose 2.0+
- Git
- SSL Certificate (untuk production)

## 🚀 Quick Start

### 1. Prerequisites Setup

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version
```

### 2. Clone & Setup Project

```bash
# Clone repository
git clone https://github.com/yourusername/material-stock-monitoring.git
cd material-stock-monitoring

# Create environment files
cp .env.backend backend/.env
cp .env.frontend frontend/.env.local

# Update environment variables
nano backend/.env       # Edit database credentials, JWT secret
nano frontend/.env.local # Edit API URL
```

### 3. Configuration

**Backend (.env)**
```
DB_USER=postgres
DB_PASSWORD=your_secure_password_here
DB_NAME=material_stock_monitoring
JWT_SECRET=your_very_long_random_secret_key_here
FRONTEND_URL=http://your_domain.com
```

**Frontend (.env.local)**
```
NEXT_PUBLIC_API_URL=http://your_domain.com/api
NEXT_PUBLIC_WS_URL=ws://your_domain.com/socket.io
```

### 4. Deploy dengan Docker Compose

```bash
# Build images
docker-compose build

# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

### 5. Initialize Database

```bash
# Access backend container
docker-compose exec backend sh

# Run seed script (optional - untuk dummy data)
node src/scripts/seed.js

exit
```

### 6. Access Application

```
Frontend:   http://localhost:3000
Backend API: http://localhost:3001
Admin URL:  http://localhost
```

## 👤 Default Admin Account

```
Email: admin@materialsystem.com
Password: AdminPassword123!
```

**⚠️ IMPORTANT: Change password setelah login pertama kali**

## 📚 User Roles & Permissions

| Role | Permissions |
|------|-------------|
| **ADMIN** | Full access, User management, System configuration |
| **QS** | Create budget/quota, Submit requests, View reports |
| **SPV** | Submit requests, Receive materials, Record stock out |
| **PM** | Verify requests, Approve/reject submissions |
| **PURCHASING** | Process requests, Print list, Close requests |
| **FOREMAN** | Distribute materials, Record usage, View inventory |

## 🔑 User Management

### Add New User (via Admin Panel)

```bash
# Atau via API
curl -X POST http://localhost:3001/api/users \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "full_name": "John Doe",
    "role": "SPV",
    "phone": "0812345678"
  }'
```

## 📊 API Documentation

### Authentication
```bash
# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@materialsystem.com",
    "password": "AdminPassword123!"
  }'

# Response
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "admin@materialsystem.com",
    "role": "ADMIN"
  }
}
```

### Create Material Request
```bash
curl -X POST http://localhost:3001/api/requests \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "project-uuid",
    "items": [
      {
        "materialId": "material-uuid",
        "requestedQty": 100
      }
    ],
    "notes": "Urgent - untuk pekerjaan basement"
  }'
```

### Material Out (Stock Distribution)
```bash
curl -X POST http://localhost:3001/api/inventory/out \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "project-uuid",
    "materialId": "material-uuid",
    "quantity": 50,
    "workPackage": "Basement Foundation - Unit A",
    "purpose": "Concrete pouring foundation",
    "notes": ""
  }'
```

### Export Report
```bash
# PDF Export
curl -X GET "http://localhost:3001/api/reports/inventory?projectId=uuid&format=pdf" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o inventory-report.pdf

# Excel Export
curl -X GET "http://localhost:3001/api/reports/inventory?projectId=uuid&format=excel" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o inventory-report.xlsx
```

## 🔐 SSL/TLS Setup (Production)

```bash
# Generate self-signed certificate (for testing)
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/letsencrypt/live/your_domain/privkey.pem \
  -out /etc/letsencrypt/live/your_domain/fullchain.pem

# Or use Let's Encrypt for free
sudo apt-get install certbot
sudo certbot certonly --standalone -d your_domain.com

# Update nginx.conf dengan path SSL
# Uncomment SSL server block dan update paths

# Restart nginx
docker-compose restart nginx
```

## 📈 Monitoring & Logs

```bash
# View all logs
docker-compose logs -f

# View specific service
docker-compose logs -f backend

# Real-time monitoring
docker stats

# Database backup
docker exec material-stock-postgres pg_dump -U postgres material_stock_monitoring > backup.sql

# Database restore
docker exec -i material-stock-postgres psql -U postgres material_stock_monitoring < backup.sql
```

## 🛠️ Troubleshooting

### Port Already in Use
```bash
# Find and kill process
sudo lsof -i :3000
sudo kill -9 <PID>

# Or change port in docker-compose.yml
```

### Database Connection Error
```bash
# Check PostgreSQL container
docker-compose logs postgres

# Verify credentials in .env
# Reset database
docker-compose down -v
docker-compose up -d
```

### Frontend Can't Connect to API
```bash
# Check backend is running
curl http://localhost:3001/api/health

# Check CORS settings in backend
# Verify NEXT_PUBLIC_API_URL in frontend .env.local
```

## 📦 Database Schema

Database schema mencakup:

- **users** - User accounts & roles
- **projects** - Project management
- **materials** - Material catalog
- **material_budgets** - Budget allocation per project
- **project_stocks** - On-site inventory
- **material_requests** - Request workflow
- **request_items** - Request line items
- **stock_transactions** - Complete audit trail
- **audit_logs** - User activity logging
- **project_users** - Multi-tenant access control

## 🔄 Backup Strategy

### Automated Daily Backup

```bash
#!/bin/bash
# backup.sh
BACKUP_DIR="/backups/database"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

docker exec material-stock-postgres pg_dump -U postgres material_stock_monitoring \
  | gzip > $BACKUP_DIR/backup_$TIMESTAMP.sql.gz

# Keep only last 30 days
find $BACKUP_DIR -type f -mtime +30 -delete
```

Tambahkan ke crontab:
```bash
sudo crontab -e
# Add: 0 2 * * * /path/to/backup.sh
```

## 🚀 Performance Optimization

### Database Optimization
```sql
-- Create indexes untuk frequently queried columns
CREATE INDEX idx_material_requests_project_status ON material_requests(project_id, status);
CREATE INDEX idx_stock_transactions_project_type ON stock_transactions(project_stock_id, type);

-- Vacuum database regularly
VACUUM ANALYZE;
```

### Application Optimization
- Enable gzip compression (done in nginx.conf)
- Database connection pooling (configured)
- Frontend code splitting (Next.js automatic)
- Image optimization (Next.js Image component)

## 📞 Support & Documentation

- **API Docs**: See `API_DOCUMENTATION.md`
- **Database Schema**: See `DATABASE_SCHEMA.md`
- **Deployment Guide**: See `DEPLOYMENT.md`
- **Troubleshooting**: See `TROUBLESHOOTING.md`

## 📄 License

Proprietary - All Rights Reserved

## 👥 Team

- Backend Development: Node.js/Express
- Frontend Development: Next.js/React
- Database: PostgreSQL
- DevOps: Docker/Nginx

---

**Version**: 1.0.0  
**Last Updated**: 2024  
**Status**: Production Ready ✅
