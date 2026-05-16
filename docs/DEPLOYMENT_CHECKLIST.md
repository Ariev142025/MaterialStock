# 🚀 Deployment Checklist - Material Stock Monitoring System

## Pre-Deployment Checklist

### Infrastructure Preparation
- [ ] VPS Ubuntu 20.04 LTS or newer provisioned
- [ ] Minimum 4GB RAM, 2 cores CPU
- [ ] 20GB+ storage available
- [ ] Root or sudo access available
- [ ] Static IP address assigned
- [ ] Domain name registered and DNS configured
- [ ] SSL certificate obtained (Let's Encrypt or commercial)

### Security Preparation
- [ ] SSH key-based authentication configured
- [ ] Firewall rules configured (UFW or cloud provider)
- [ ] Backup strategy planned
- [ ] Database encryption at rest planned
- [ ] HTTPS enforced
- [ ] Database password changed from default
- [ ] JWT secret generated (min 32 characters)
- [ ] Environment variables secured (not in git)

### Application Preparation
- [ ] All code pushed to Git repository
- [ ] Dependencies locked (package-lock.json)
- [ ] Environment files prepared (.env files)
- [ ] Database schema reviewed
- [ ] API endpoints tested locally
- [ ] Frontend build tested
- [ ] PDF/Excel export tested
- [ ] Real-time WebSocket tested

---

## Server Setup (Ubuntu 20.04)

### Step 1: System Updates
```bash
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y curl wget git build-essential
```

### Step 2: Install Docker
```bash
# Add Docker repository
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"

# Install Docker
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io

# Add current user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
```

### Step 3: Install Docker Compose
```bash
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
docker-compose --version
```

### Step 4: Install SSL Certificate (Let's Encrypt)
```bash
sudo apt-get install -y certbot python3-certbot-nginx

# Generate certificate
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Verify certificate
sudo certbot renew --dry-run

# Auto-renewal is automatic (timer enabled by default)
sudo systemctl status certbot.timer
```

### Step 5: Configure Firewall
```bash
sudo ufw enable
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 5432/tcp  # PostgreSQL (jika external)
sudo ufw status

# If on AWS/GCP: Configure security groups in cloud console
```

---

## Application Deployment

### Step 1: Clone Repository
```bash
cd /opt
sudo git clone https://github.com/yourusername/material-stock-monitoring.git
cd material-stock-monitoring
```

### Step 2: Prepare Environment Files
```bash
# Backend environment
sudo nano backend/.env
# ⬇️ Update these values:
NODE_ENV=production
DB_PASSWORD=your_very_secure_password
JWT_SECRET=your_long_random_secret_key_at_least_32_chars
FRONTEND_URL=https://yourdomain.com
SMTP_PASSWORD=your_app_specific_password

# Frontend environment
sudo nano frontend/.env.local
# ⬇️ Update:
NEXT_PUBLIC_API_URL=https://yourdomain.com/api
NEXT_PUBLIC_WS_URL=wss://yourdomain.com/socket.io

# Database backup location
sudo mkdir -p /backups/database
sudo chmod 755 /backups/database
```

### Step 3: Update Nginx Configuration
```bash
# Update nginx.conf dengan domain Anda
sudo nano nginx.conf

# Replace:
# - your_domain.com dengan domain aktual
# - Path SSL certificates
```

### Step 4: Build and Deploy
```bash
# Build Docker images
docker-compose build

# Start all services
docker-compose up -d

# Verify all services running
docker-compose ps

# Check logs
docker-compose logs -f
```

### Step 5: Initialize Database
```bash
# Wait for database to be healthy
sleep 30

# Check database connection
docker-compose exec backend node -e "require('./src/database/connection').initializeDatabase()"

# If seed needed
docker-compose exec backend node src/scripts/seed.js
```

### Step 6: Verify Deployment
```bash
# Health checks
curl http://localhost/health
curl http://localhost/api/health
curl https://yourdomain.com/health
curl https://yourdomain.com/api/health

# Test frontend
curl https://yourdomain.com | grep -i "material stock"

# Test API
curl -X POST https://yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@materialsystem.com","password":"AdminPassword123!"}'
```

---

## Post-Deployment Configuration

### Step 1: Update Admin Credentials
```bash
# Access backend
docker-compose exec backend sh

# Run script untuk change password
node src/scripts/change-admin-password.js

# Follow prompts untuk set password baru
```

### Step 2: Add Users
Login ke admin panel di https://yourdomain.com dan add users dengan role yang sesuai

### Step 3: Configure Materials
Add material catalog:
- Material codes
- Units of measure
- Categories
- Unit prices

### Step 4: Create Initial Projects
Setup first project untuk testing dan training

---

## Monitoring & Maintenance

### Daily Tasks
```bash
# Check disk space
df -h

# Check memory usage
free -h

# Check container status
docker-compose ps

# Check logs untuk errors
docker-compose logs --tail 100
```

### Weekly Tasks
```bash
# Backup database
./backup.sh

# Review audit logs
docker-compose exec backend node -e "SELECT COUNT(*) FROM audit_logs;"

# Check certificate expiry
sudo certbot status
```

### Monthly Tasks
```bash
# Update system packages
sudo apt-get update && sudo apt-get upgrade -y

# Rebuild Docker images
docker-compose build --no-cache

# Restart all services
docker-compose restart

# Prune unused Docker resources
docker system prune -a
```

---

## Backup & Recovery

### Automated Database Backup
```bash
#!/bin/bash
# /usr/local/bin/backup-material-stock.sh

BACKUP_DIR="/backups/database"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql.gz"

# Create backup
docker exec material-stock-postgres pg_dump \
  -U postgres \
  material_stock_monitoring \
  | gzip > $BACKUP_FILE

# Compress size
du -h $BACKUP_FILE

# Keep only last 30 days
find $BACKUP_DIR -type f -mtime +30 -delete

# Log
echo "Backup completed: $BACKUP_FILE" >> /var/log/backups.log
```

Setup cron job:
```bash
sudo crontab -e

# Add:
# 2:00 AM daily backup
0 2 * * * /usr/local/bin/backup-material-stock.sh

# Sunday full backup with gzip compression
0 3 * * 0 /usr/local/bin/backup-material-stock.sh && gzip -9 /backups/database/backup_full_*.sql
```

### Restore from Backup
```bash
# Find backup file
ls -lh /backups/database/backup_*.sql.gz

# Restore
gunzip -c /backups/database/backup_20240120_020000.sql.gz | \
  docker exec -i material-stock-postgres \
  psql -U postgres material_stock_monitoring

# Verify
docker-compose exec postgres psql -U postgres material_stock_monitoring -c "SELECT COUNT(*) FROM material_requests;"
```

---

## Performance Optimization

### Database Optimization
```sql
-- Connect to database
docker-compose exec postgres psql -U postgres material_stock_monitoring

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM material_requests WHERE project_id = 'uuid';

-- Vacuum database
VACUUM ANALYZE;

-- Check index usage
SELECT schemaname, tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public';

-- Add missing indexes if needed
CREATE INDEX idx_material_requests_verified_at ON material_requests(verified_at);
```

### Application Optimization
```bash
# Monitor real-time performance
docker stats

# Check memory usage
docker-compose exec backend node -e "console.log(process.memoryUsage())"

# Database connection pool
# Already optimized in connection.js (pool: 20, timeout: 30s)
```

---

## Security Hardening

### 1. SSL/TLS Configuration
```bash
# Verify SSL certificate
sudo openssl x509 -in /etc/letsencrypt/live/yourdomain.com/fullchain.pem -text -noout

# Redirect HTTP to HTTPS (uncomment in nginx.conf)
# Test
curl -I http://yourdomain.com
# Should redirect to https://yourdomain.com
```

### 2. Database Security
```sql
-- Change default postgres password
ALTER USER postgres WITH PASSWORD 'your_very_secure_password';

-- Create separate user for application
CREATE USER app_user WITH PASSWORD 'app_password';
GRANT CONNECT ON DATABASE material_stock_monitoring TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
```

### 3. API Security
- JWT validation enabled ✅
- Rate limiting configured (100 req/15min) ✅
- CORS restricted ✅
- Helmet.js security headers ✅
- Input validation with Joi ✅

### 4. Environment Security
```bash
# Ensure .env files are not in git
cat .gitignore
# Should contain: .env, .env.local, .env.*.local

# Set restrictive permissions
chmod 600 backend/.env
chmod 600 frontend/.env.local

# Never log sensitive data
# Check logs
docker-compose logs | grep -i password  # Should be empty
```

---

## Troubleshooting

### Issue: Database Connection Failed
```bash
# Check PostgreSQL container
docker-compose logs postgres

# Verify credentials
docker-compose exec postgres psql -U postgres -c "\l"

# Check network connectivity
docker-compose exec backend ping postgres

# If needed, reset database
docker-compose down -v
docker-compose up -d postgres
sleep 15
docker-compose up -d
```

### Issue: Frontend Can't Reach API
```bash
# Check CORS in backend
curl -v http://localhost:3001/api/health

# Verify API_URL in frontend
docker-compose exec frontend cat .env.local

# Check WebSocket connection
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  http://localhost:3001/socket.io
```

### Issue: High Memory Usage
```bash
# Identify process
docker stats

# Check database queries
docker-compose exec postgres psql -U postgres material_stock_monitoring -c "SELECT * FROM pg_stat_activity;"

# Restart service
docker-compose restart backend
```

### Issue: Slow Performance
```bash
# Check database indexes
docker-compose exec postgres psql -U postgres material_stock_monitoring -c "\d material_requests"

# Analyze slow queries
docker-compose logs backend | grep "slow\|duration"

# Rebuild indexes if needed
docker-compose exec postgres psql -U postgres material_stock_monitoring -c "REINDEX DATABASE material_stock_monitoring;"
```

---

## Rollback Procedures

### Rollback to Previous Version
```bash
# Stop current services
docker-compose down

# Checkout previous commit
git checkout <previous_commit_hash>

# Rebuild and deploy
docker-compose build
docker-compose up -d

# Verify
docker-compose ps
```

### Database Rollback
```bash
# Restore from backup
gunzip -c /backups/database/backup_20240120_020000.sql.gz | \
  docker exec -i material-stock-postgres \
  psql -U postgres material_stock_monitoring

# Verify data integrity
docker-compose exec postgres psql -U postgres material_stock_monitoring -c "SELECT COUNT(*) FROM material_requests;"
```

---

## Monitoring & Alerting

### Enable Prometheus Monitoring (Optional)
```yaml
# Add to docker-compose.yml
prometheus:
  image: prom/prometheus
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml
  ports:
    - "9090:9090"
```

### Enable ELK Stack (Optional)
```bash
# For centralized logging
# Elasticsearch, Logstash, Kibana
```

---

## Performance Benchmarks

Target metrics untuk production:

| Metric | Target |
|--------|--------|
| API Response Time | < 200ms |
| Page Load Time | < 2s |
| Database Query Time | < 500ms |
| WebSocket Latency | < 100ms |
| Uptime | > 99.5% |
| CPU Usage | < 70% |
| Memory Usage | < 80% |

---

## Support & Escalation

- **Level 1**: Check logs, restart services
- **Level 2**: Database optimization, performance tuning
- **Level 3**: Infrastructure upgrade, architecture changes

---

**Deployment Status**: Ready ✅  
**Last Updated**: 2024
