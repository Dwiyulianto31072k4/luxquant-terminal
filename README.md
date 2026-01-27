# LuxQuant Terminal

Premium Crypto Trading Signals Terminal with real-time market data.

## Tech Stack

- **Frontend**: React + Vite + TailwindCSS
- **Backend**: FastAPI (Python)
- **Database**: PostgreSQL
- **Cache**: Redis
- **Deployment**: Docker

## Project Structure

```
luxquant-fullstack/
├── frontend/          # React application
├── backend/           # FastAPI application
├── database/          # SQL scripts
├── nginx/             # Reverse proxy config
└── docker-compose.yml # Orchestration
```

## Quick Start

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Start all services
docker-compose up -d

# 3. Access
# Frontend: http://localhost:3000
# Backend:  http://localhost:8000/docs
```

## Development

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## API Documentation

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

