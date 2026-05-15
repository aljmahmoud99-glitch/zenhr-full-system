# ZenJO Deployment Guide

## Overview

This guide describes the production-ready deployment shape for the stabilized ZenJO HRMS platform. It preserves the canonical business flows from Cleanup Sprints 1-8 and the reliability foundation from Phase 9.

## Required Runtime

- Node.js 22 LTS
- pnpm through Corepack
- PostgreSQL 16+
- Reverse proxy or container ingress with HTTPS termination
- Persistent storage for uploads and generated exports
- Optional future Redis for distributed queue/rate-limit/metrics adapters

## Environment

Start from `.env.production.example` and configure secrets in the deployment platform, not in Git.

Required production values:

- `NODE_ENV=production`
- `APP_VERSION`
- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGINS`
- `TRUST_PROXY=true`
- `UPLOADS_DIR`
- `EXPORTS_DIR`

The API validates environment safety at startup. Production startup fails if critical values are missing or unsafe.

## Containers

Local production-like deployment:

```powershell
docker compose up --build
```

Services:

- `postgres`: PostgreSQL database
- `api`: Express API on port `3001`
- `frontend`: Angular static build served by Nginx on port `8080`

Persistent volumes:

- `postgres-data`
- `uploads-data`
- `exports-data`

## Health Checks

- API health: `/api/healthz`
- API readiness: `/api/readiness`
- API version: `/api/version`
- Operational metrics: `/api/ops/metrics`
- Environment report: `/api/ops/environment`

## Runtime Store Adapter

Phase 10 keeps `RUNTIME_STORE_ADAPTER=memory` as the default. This is valid for a single API instance. For multi-instance production, move queue, rate-limit, and metrics state to Redis or another shared store.

Prepared config:

```env
RUNTIME_STORE_ADAPTER=redis
REDIS_URL=redis://redis:6379/0
```

Redis support is prepared as an adapter target but not required for this local deployment.

## Deployment Sequence

1. Build frontend and API image.
2. Run database migrations manually in order.
3. Validate environment with `/api/ops/environment`.
4. Start API.
5. Confirm `/api/healthz` and `/api/readiness`.
6. Start frontend.
7. Run `scripts/ci-check.ps1`.
8. Verify browser login and exports.

## Storage

Uploads and exports must be mounted on persistent storage. Do not use ephemeral container filesystem storage for production documents.

Recommended:

- Local persistent volume for single-server deployments.
- S3-compatible object storage adapter as a future enhancement for multi-region deployments.

## SaaS Module Readiness

The API reads existing `company_modules`, `company_subscriptions`, and `platform_plans` tables.

Behavior:

- If a module is explicitly disabled for a company, matching API families return 403.
- If no module row exists, compatibility defaults allow access to preserve old tenants.
- `/api/tenant/modules/status` exposes enabled module state.
- `/api/tenant/usage` exposes current employee/user/document/payroll usage against plan limits.

Billing/payment is intentionally not implemented.
