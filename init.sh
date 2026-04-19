#!/bin/bash

# PoE Knowledge Assistant - Development Environment Setup
# This script initializes the development environment

set -e  # Exit on error

echo "=== PoE Knowledge Assistant - Dev Environment Setup ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f ".task_breakdown.json" ]; then
    echo -e "${RED}Error: .task_breakdown.json not found. Please run from project root.${NC}"
    exit 1
fi

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Backend setup
print_status "Setting up backend..."
if [ -d "backend" ]; then
    print_status "Backend directory exists"
else
    print_warning "Backend directory not found. Creating structure..."
    mkdir -p backend/{api,models,services,config,utils}
    touch backend/__init__.py
    touch backend/api/__init__.py
    touch backend/models/__init__.py
    touch backend/services/__init__.py
    touch backend/config/__init__.py
    touch backend/utils/__init__.py
    print_status "Backend structure created"
fi

# Check if requirements.txt exists
if [ ! -f "backend/requirements.txt" ]; then
    print_warning "backend/requirements.txt not found. You'll need to create it."
fi

# Check if .env.example exists
if [ ! -f "backend/.env.example" ]; then
    print_warning "backend/.env.example not found. You'll need to create it."
fi

# Frontend setup
print_status "Setting up frontend..."
if [ -d "frontend" ]; then
    print_status "Frontend directory exists"

    # Check if node_modules exists, if not run npm install
    if [ ! -d "frontend/node_modules" ]; then
        print_warning "Frontend dependencies not installed. Run 'cd frontend && npm install'"
    fi
else
    print_warning "Frontend directory not found. You'll need to create it with Vite + React + TypeScript."
fi

# Start backend server
echo ""
print_status "Starting backend development server..."
if [ -f "backend/src/main.py" ]; then
    cd backend
    # Check if uvicorn is installed
    if command -v uvicorn &> /dev/null; then
        uvicorn src.main:app --reload --host 0.0.0.0 --port 8460
    else
        print_warning "uvicorn not found. Install with: pip install -r requirements.txt"
    fi
else
    print_warning "backend/src/main.py not found. Skipping backend start."
fi

echo ""
print_status "Setup complete!"
echo ""
echo "To start the frontend (in another terminal):"
echo "  cd frontend && npm run dev"
echo ""
echo "Backend will be available at: http://localhost:8460"
echo "API docs at: http://localhost:8460/docs"
echo "Frontend will be available at: http://localhost:9460"
