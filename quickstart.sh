#!/bin/bash
# Quick start script untuk Material Stock Monitoring System

set -e

echo "🚀 Material Stock Monitoring System - Quick Start"
echo "=================================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Check prerequisites
echo ""
echo "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed"
    echo "Please install Docker from https://docs.docker.com/get-docker/"
    exit 1
fi
print_status "Docker installed"

if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed"
    echo "Please install Docker Compose from https://docs.docker.com/compose/install/"
    exit 1
fi
print_status "Docker Compose installed"

if ! command -v git &> /dev/null; then
    print_error "Git is not installed"
    exit 1
fi
print_status "Git installed"

# Create directory structure
echo ""
echo "Setting up directory structure..."

mkdir -p backend/src/{controllers,routes,middleware,database,websocket,scripts}
mkdir -p frontend/src/{components,pages,lib,store,styles}
mkdir -p nginx
mkdir -p backups/database

print_status "Directory structure created"

# Create environment files
echo ""
echo "Creating environment files..."

if [ ! -f backend/.env ]; then
    cat > backend/.env << 'EOF'
# Development Environment
NODE_ENV=development
PORT=3001

# Database
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=material_stock_monitoring

# JWT
JWT_SECRET=your_dev_secret_key_change_in_production
JWT_EXPIRY=24h

# URLs
FRONTEND_URL=http://localhost:3000

# Logging
LOG_LEVEL=debug
EOF
    print_status "Backend .env created"
else
    print_info "Backend .env already exists"
fi

if [ ! -f frontend/.env.local ]; then
    cat > frontend/.env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
EOF
    print_status "Frontend .env.local created"
else
    print_info "Frontend .env.local already exists"
fi

# Build Docker images
echo ""
echo "Building Docker images..."
echo "(This may take a few minutes...)"
echo ""

docker-compose build

print_status "Docker images built"

# Start services
echo ""
echo "Starting services..."
echo ""

docker-compose up -d

print_status "Services started"

# Wait for services to be healthy
echo ""
echo "Waiting for services to be ready..."

max_attempts=30
attempt=1

while [ $attempt -le $max_attempts ]; do
    if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
        print_status "Backend is ready"
        break
    fi
    
    if [ $attempt -eq $max_attempts ]; then
        print_error "Backend failed to start"
        docker-compose logs backend
        exit 1
    fi
    
    echo -n "."
    sleep 2
    ((attempt++))
done

sleep 5

# Check all services
echo ""
echo "Service Status:"
echo "==============="
docker-compose ps

# Print access information
echo ""
echo "🎉 Deployment Complete!"
echo "======================="
echo ""
print_info "Frontend:   http://localhost:3000"
print_info "Backend API: http://localhost:3001"
print_info "Admin Panel: http://localhost"
echo ""
echo "Default Admin Account:"
echo "  Email:    admin@materialsystem.com"
echo "  Password: AdminPassword123!"
echo ""
echo "⚠️  IMPORTANT: Change admin password after first login!"
echo ""

# Show next steps
echo "Next Steps:"
echo "==========="
echo "1. Open http://localhost:3000 in your browser"
echo "2. Login with admin credentials"
echo "3. Create a project"
echo "4. Add materials and set budgets"
echo "5. Start managing material requests"
echo ""

# Show useful commands
echo "Useful Commands:"
echo "==============="
echo "# View logs"
echo "  docker-compose logs -f backend"
echo "  docker-compose logs -f frontend"
echo ""
echo "# Stop all services"
echo "  docker-compose down"
echo ""
echo "# Restart a service"
echo "  docker-compose restart backend"
echo ""
echo "# Run migrations"
echo "  docker-compose exec backend node src/scripts/seed.js"
echo ""
echo "# Database access"
echo "  docker-compose exec postgres psql -U postgres material_stock_monitoring"
echo ""
echo "For more information, see README.md and DEPLOYMENT_CHECKLIST.md"
echo ""
print_status "Setup complete!"
