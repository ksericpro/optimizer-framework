# Frontend Deployment Guide

This guide explains how to deploy the complete frontend stack using nginx as a unified gateway.

## Architecture

The frontend deployment uses a **two-tier architecture**:

### 1. Nginx Gateway (`optimizer_gateway`)
- **Port**: 80 (configurable via `GATEWAY_PORT`)
- **Purpose**: Single entry point for all frontend traffic
- **Routes**:
  - `/` → Next.js Dashboard (proxied to `optimizer_frontend:3000`)
  - `/driver` → Driver Mobile App (static HTML served directly)
  - `/api/*` → Backend API (proxied to `optimizer_api:8000`)
  - `/ws/*` → WebSocket connections (proxied to `optimizer_api:8000`)

### 2. Next.js Application (`optimizer_frontend`)
- **Internal Port**: 3000 (not exposed externally)
- **Mode**: Standalone production build
- **Purpose**: Serves the main dashboard application
- **API Calls**: Uses relative path `/api` (routed through nginx)

### Why This Architecture?

- **Unified Gateway**: Single port (80) for dashboard, driver app, API, and WebSocket
- **Clean URLs**: No CORS issues, all requests go through same origin
- **Production Ready**: Nginx handles SSL termination, caching, and load balancing
- **Separation of Concerns**: Static driver app served directly, dynamic dashboard via Next.js
- **Easy Scaling**: Can add more Next.js instances behind nginx

## Quick Start

### 1. Ensure Backend Network Exists

The frontend needs to connect to the `optimizer_network` where your backend services run:

```bash
# Check if network exists
docker network ls | grep optimizer_network

# If not, create it
docker network create optimizer_network
```

### 2. Configure Environment Variables

Copy and customize the environment file:

```bash
cp .env.frontend .env.frontend.local
```

Edit `.env.frontend.local`:
```env
FRONTEND_PORT=80
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

### 3. Start the Frontend

```bash
# Build and start the frontend
docker-compose -f docker-compose.frontend.yml --env-file .env.frontend.local up -d

# View logs
docker-compose -f docker-compose.frontend.yml logs -f

# Stop the frontend
docker-compose -f docker-compose.frontend.yml down
```

### 4. Access the Application

Open your browser and navigate to:
- **Dashboard**: http://localhost (or http://localhost:GATEWAY_PORT)
- **Driver App**: http://localhost/driver
- **API**: http://localhost/api (proxied to backend)
- **WebSocket**: ws://localhost/ws (proxied to backend)

## Running with Backend

To run the complete stack (backend + frontend):

```bash
# Start backend services first
docker-compose up -d

# Start frontend
docker-compose -f docker-compose.frontend.yml --env-file .env.frontend.local up -d
```

## Production Deployment

### Environment Configuration

For production, update your `.env.frontend.local`:

```env
FRONTEND_PORT=80
NEXT_PUBLIC_API_BASE=https://api.yourdomain.com
```

### SSL/HTTPS Setup

To add HTTPS support, you can:

1. **Use a reverse proxy** (recommended):
   - Place Nginx or Traefik in front
   - Handle SSL termination there
   - Forward to this container

2. **Modify the Dockerfile**:
   - Add SSL certificates
   - Update nginx.conf to listen on 443
   - Configure SSL settings

### Scaling

To run multiple frontend instances:

```bash
docker-compose -f docker-compose.frontend.yml up -d --scale optimizer_frontend=3
```

## Troubleshooting

### Container won't start

Check logs:
```bash
docker-compose -f docker-compose.frontend.yml logs
```

### Can't connect to backend API

1. Verify backend is running:
   ```bash
   docker ps | grep optimizer_api
   ```

2. Check network connectivity:
   ```bash
   docker network inspect optimizer_network
   ```

3. Verify environment variable:
   ```bash
   docker exec optimizer_frontend_nginx env | grep NEXT_PUBLIC_API_BASE
   ```

### Static assets not loading

Check nginx configuration:
```bash
docker exec optimizer_frontend_nginx cat /etc/nginx/conf.d/nginx.conf
```

## File Structure

```
optimizer-framework/
├── optimizer-ui/
│   ├── Dockerfile.nginx          # Production build with Nginx
│   ├── nginx.conf                # Nginx configuration
│   └── ...                       # Next.js source files
├── docker-compose.frontend.yml   # Frontend-only compose file
└── .env.frontend                 # Frontend environment template
```

## Health Checks

The container includes a health check endpoint at `/health`. Docker will automatically monitor this and restart the container if it becomes unhealthy.

Check health status:
```bash
docker inspect optimizer_frontend_nginx | grep -A 10 Health
```

## Monitoring

View real-time logs:
```bash
# All logs
docker-compose -f docker-compose.frontend.yml logs -f

# Last 100 lines
docker-compose -f docker-compose.frontend.yml logs --tail=100
```

## Cleanup

Remove the frontend container and images:

```bash
# Stop and remove containers
docker-compose -f docker-compose.frontend.yml down

# Remove images
docker-compose -f docker-compose.frontend.yml down --rmi all

# Remove volumes (if any)
docker-compose -f docker-compose.frontend.yml down -v
```
