# Reivilo B2B Portal - Production Deployment Guide

## Architecture Overview

```
Customer → Cloudflare Pages (Frontend) → Cloud Run (Backend) → Supabase (Database)
                                     ↓
                                   Cin7 Core (ERP)
                                     ↓
                            Cloud Scheduler (Sync Jobs)
```

## Deployment Steps

### 1. GitHub Repository Setup
```bash
git remote add origin https://github.com/your-org/reivilo-b2b-portal.git
git push -u origin main
```

### 2. Google Cloud Platform Setup
```bash
# Create new project
gcloud projects create reivilo-b2b-prod --name="Reivilo B2B Portal"

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable cloudscheduler.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

### 3. Supabase Database Setup
1. Create new Supabase project
2. Run the schema migration: `psql [SUPABASE_URL] -f supabase-schema.sql`
3. Configure Row Level Security policies
4. Copy connection details for environment variables

### 4. Cloud Run Deployment
```bash
# Build and deploy backend
gcloud run deploy reivilo-b2b-api \
  --source . \
  --region africa-south1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1
```

### 5. Cloudflare Pages Setup
1. Connect GitHub repository to Cloudflare Pages
2. Use build command: `npm run build:frontend`
3. Set environment variables from `cloudflare-pages.json`
4. Configure custom domain: `portal.reiviloindustrial.co.za`

### 6. Cloud Scheduler Jobs
Create scheduled jobs for data synchronization:

```bash
# Product availability sync (every 5 minutes)
gcloud scheduler jobs create http availability-sync \
  --schedule="*/5 * * * *" \
  --uri="https://reivilo-b2b-api.a.run.app/api/sync/availability" \
  --http-method=POST \
  --headers="x-sync-token=[SYNC_TOKEN]"

# Products and customers sync (hourly)
gcloud scheduler jobs create http hourly-sync \
  --schedule="0 * * * *" \
  --uri="https://reivilo-b2b-api.a.run.app/api/sync/products" \
  --http-method=POST \
  --headers="x-sync-token=[SYNC_TOKEN]"

# Full system sync (nightly at 2 AM)
gcloud scheduler jobs create http nightly-sync \
  --schedule="0 2 * * *" \
  --uri="https://reivilo-b2b-api.a.run.app/api/sync/full" \
  --http-method=POST \
  --headers="x-sync-token=[SYNC_TOKEN]"
```

### 7. Environment Variables & Secrets
Configure these in Cloud Run environment:

**Required Secrets:**
- `DATABASE_URL` (Supabase connection string)
- `CIN7_ACCOUNT_ID` (Your Cin7 account)
- `CIN7_APP_KEY` (Your Cin7 API key)
- `SENDGRID_API_KEY` (SendGrid API key)
- `SESSION_SECRET` (Random 32-character string)
- `SYNC_TOKEN` (Random token for scheduler authentication)

**Environment Variables:**
- `NODE_ENV=production`
- `PORT=8080`
- `FROM_EMAIL=noreply@reiviloindustrial.co.za`
- `SUPPORT_EMAIL=support@reiviloindustrial.co.za`

### 8. UptimeRobot Monitoring
Configure monitoring for these endpoints:
- `https://portal.reiviloindustrial.co.za/` (Frontend)
- `https://reivilo-b2b-api.a.run.app/healthz` (Backend)
- `https://reivilo-b2b-api.a.run.app/api/health` (API Health)

## Data Flow

1. **Frontend (Cloudflare Pages)**
   - Serves React application globally via CDN
   - Proxies API calls to Cloud Run backend

2. **Backend (Cloud Run - Johannesburg)**
   - Handles authentication and business logic
   - Serves cached data from Supabase
   - Creates quotes in Cin7 on order placement

3. **Database (Supabase)**
   - Caches product catalog, customers, and availability
   - Stores user sessions and order history
   - Provides fast data access for UI

4. **Synchronization (Cloud Scheduler)**
   - Availability: Every 5 minutes
   - Products/Customers: Hourly  
   - Full refresh: Nightly

5. **Email (SendGrid)**
   - Quote confirmations to customers
   - Admin notifications for new orders

## Performance Features

- **Global CDN**: Cloudflare Pages for fast worldwide access
- **Regional Backend**: Cloud Run in Johannesburg for low latency to Cin7
- **Data Caching**: Supabase cache reduces API calls and improves speed
- **Auto-scaling**: Cloud Run scales from 0 to 10 instances based on traffic
- **Rate Limiting**: API protection against excessive requests

## Security Features

- **Row Level Security**: Database-level access control
- **Token-based Sync**: Secure scheduler endpoints
- **HTTPS Everywhere**: TLS encryption for all connections
- **Session Management**: Secure user authentication
- **Role-based Access**: Admin vs customer permissions

## Monitoring & Alerts

- **Health Checks**: Multiple endpoint monitoring
- **Error Tracking**: Comprehensive logging
- **Performance Metrics**: Cloud Run monitoring dashboard
- **Uptime Alerts**: Immediate notification of issues