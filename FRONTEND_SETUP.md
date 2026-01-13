# Frontend Setup Summary

## What Was Created

I've set up a **production-ready frontend deployment** using nginx as a unified gateway. Here's what you now have:

### Files Created/Modified

1. **`docker-compose.frontend.yml`** - Separate compose file for frontend stack
2. **`nginx.conf`** - Updated to proxy dashboard to Next.js (was serving static files)
3. **`.env.frontend`** - Environment configuration for the gateway
4. **`FRONTEND_DEPLOYMENT.md`** - Complete deployment guide
5. **`frontend.ps1`** - PowerShell script for easy management

### Architecture Overview

```
                                    ┌─────────────────────┐
                                    │   Nginx Gateway     │
                                    │   (Port 80)         │
                                    └──────────┬──────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
                    ▼                          ▼                          ▼
        ┌───────────────────┐      ┌───────────────────┐      ┌──────────────────┐
        │  Next.js Dashboard│      │   Driver App      │      │   Backend API    │
        │  (Port 3000)      │      │   (Static HTML)   │      │   (Port 8000)    │
        │  optimizer_frontend│      │   /driver         │      │   optimizer_api  │
        └───────────────────┘      └───────────────────┘      └──────────────────┘
```

### How It Works

**Nginx Gateway** acts as the single entry point:
- **`/`** → Proxies to Next.js dashboard running on port 3000
- **`/driver`** → Serves static driver.html directly
- **`/api/*`** → Proxies to backend API (optimizer_api:8000)
- **`/ws/*`** → Proxies WebSocket connections to backend

### Why This Setup?

✅ **Single Port**: Everything accessible through port 80
✅ **No CORS**: All requests from same origin
✅ **Production Ready**: Nginx handles caching, SSL, load balancing
✅ **Flexible**: Can serve both dynamic (Next.js) and static (driver) apps
✅ **Scalable**: Easy to add more Next.js instances

## Quick Start

### 1. Start the Frontend Stack

```powershell
# Using the management script
.\frontend.ps1 start

# Or manually
docker-compose -f docker-compose.frontend.yml up -d
```

### 2. Access Your Applications

- **Dashboard**: http://localhost
- **Driver App**: http://localhost/driver

### 3. Start with Backend

To run the complete system:

```powershell
# Start backend services
docker-compose up -d

# Start frontend gateway
.\frontend.ps1 start
```

## Important Notes

### Driver App Files
The nginx.conf expects driver app files in `./driver` directory. If you don't have this yet, you can:
- Remove the driver volume mount from docker-compose.frontend.yml
- Or create a simple driver.html in the driver folder

### API Base URL
The Next.js app is configured to use `/api` as the base URL (relative path). This works because nginx proxies `/api/*` to the backend. No need to configure full URLs!

### Network Requirement
The frontend connects to `optimizer_network` (external). Make sure this network exists:

```powershell
docker network create optimizer_network
```

## Management Commands

```powershell
.\frontend.ps1 start    # Start the frontend stack
.\frontend.ps1 stop     # Stop the frontend stack
.\frontend.ps1 restart  # Restart the frontend stack
.\frontend.ps1 logs     # View logs
.\frontend.ps1 build    # Rebuild images
.\frontend.ps1 clean    # Remove containers and images
.\frontend.ps1 status   # Check status
```

## Next Steps

1. **Test the setup**: Start the frontend and verify all routes work
2. **Add driver app**: Create driver.html or remove the driver volume mount
3. **Configure SSL**: Add SSL certificates for HTTPS in production
4. **Scale**: Add more Next.js instances if needed

See `FRONTEND_DEPLOYMENT.md` for detailed documentation!
