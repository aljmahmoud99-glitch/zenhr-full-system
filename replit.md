# ZenJO HRMS — Replit Agent Guide

## Overview

ZenJO is an enterprise-grade, multi-tenant Human Resources Management System (HRMS) built specifically for Jordanian companies. It enforces Jordanian Labour Law No. 8/1996, SSC (Social Security Corporation) regulations, and Jordanian Income Tax Law.

The system is **bilingual** (Arabic primary, RTL + English LTR) and supports the full employee lifecycle: onboarding, attendance, leave, overtime, payroll, compliance, documents, disciplinary, resignations, clearance, and self-service.

**Two stacks exist in this repository:**

1. **Primary active stack** (use this for all new work):
   - Frontend: Angular 18 standalone components — `ZenHR-Full-System/frontend/`
   - Backend: Node.js/Express API — `ZenHR-Full-System/artifacts/api-server/`
   - Database: PostgreSQL via Drizzle ORM — `ZenHR-Full-System/lib/db/`

2. **Legacy/reference stack** (do NOT build new features here):
   - Angular 18 — `ZenHR-Full-System/artifacts/zenjo-ng/`
   - .NET 9 Web API — `ZenHR-Full-System/artifacts/zenjo-api/`
   - MySQL 8 with EF Core

The Replit runtime uses the **Node.js/Express + PostgreSQL** stack. The `.NET/MySQL` system exists as documentation and reference only in this environment.

---

## User Preferences

Preferred communication style: Simple, everyday language.

---

## System Architecture

### Frontend (Angular 18)

- **Location:** `ZenHR-Full-System/frontend/`
- **Pattern:** Standalone components, lazy-loaded routes, no NgModules
- **Routing:** Hash-based routing (`withHashLocation()`), route guards enforce RBAC at the route level
- **State:** RxJS signals and services; no NgRx
- **i18n:** `@ngx-translate/core` with JSON translation files at `frontend/src/assets/i18n/ar.json` and `en.json`
- **Styling:** Tailwind CSS + custom CSS variables; RTL/LTR direction toggled at the `<html>` level
- **Icons:** Lucide Angular + Google Material Icons
- **Auth flow:** JWT stored in localStorage; `authInterceptor` attaches `Bearer` token to all API calls; `loadingInterceptor` manages global loading state
- **Role access:** Centralized in `role-access.service.ts` via `SCREEN_ACCESS` and `ACTION_ACCESS` maps — the single source of truth for which roles see which routes/actions
- **Layout:** Shared shell with sidebar (collapsible), topbar, RTL-aware layout; role-specific nav groups built dynamically

### Backend (Node.js/Express)

- **Location:** `ZenHR-Full-System/artifacts/api-server/`
- **Entry point:** `src/index.ts`
- **Auth:** JWT (60min access + 7-day refresh); passwords hashed with SHA-256 + salt (see `src/auth.ts`). `authMiddleware` validates Bearer tokens and attaches `req.user`
- **Multi-tenancy:** Every query filters by `companyId` extracted from the JWT claim — no hardcoded company IDs
- **API shape:** All responses follow `{ success: boolean, data: any, message?: string }`
- **Base path:** `/api/*`
- **Package manager:** pnpm (workspace)

### Database

- **Engine:** PostgreSQL (Replit built-in, accessed via `DATABASE_URL` env var)
- **ORM:** Drizzle ORM — schema defined in `ZenHR-Full-System/lib/db/src/schema/`
- **Dialect config:** `drizzle.config.ts` uses `dialect: "postgresql"`
- **Key tables:** `usersTable`, `employeesTable`, `departmentsTable`, `jobTitlesTable`, `leaveRequestsTable`, `leavePoliciesTable`, `leaveBalancesTable`, `payrollRunsTable`, `payslipsTable`, `attendanceRecordsTable`, `documentsTable`, `assetsTable`, `companiesTable`, `systemConfigurationsTable`, `overtimeRequestsTable`, and lookup tables (nationalities, cities, banks, etc.)
- **Soft delete:** `isDeleted` flag on all major tables
- **Tenant isolation:** `companyId` column on all business tables
- **Seeding:** `ZenHR-Full-System/lib/db/src/seed.ts` — run with `pnpm --filter db seed`

### Authentication & Authorization

- **Mechanism:** JWT Bearer tokens
- **Token content:** `{ userId, username, role, companyId, employeeId }`
- **Frontend enforcement:** Route guards (`authGuard`, `guestGuard`, `roleGuard`) + `SCREEN_ACCESS` map
- **Backend enforcement:** `authMiddleware` on all protected routes; role checks inline in route handlers
- **Roles (5 active):** `superadmin`, `hradmin`, `payrolladmin`, `manager`, `employee`
- **Data scoping rules:**
  - `employee` → own data only
  - `manager` → direct reports only
  - `hradmin` → all company data
  - `superadmin` → platform-level only (companies, users, config); NOT operational HR screens
  - `payrolladmin` → payroll-specific data

### API Code Generation

- **Tool:** Orval (`ZenHR-Full-System/lib/api-spec/`)
- **OpenAPI spec:** `lib/api-spec/openapi.yaml`
- **Outputs:**
  - `lib/api-client-react/src/generated/` — React Query hooks (used by legacy React stack)
  - `lib/api-zod/src/generated/` — Zod validation schemas
- **Custom fetch:** `lib/api-client-react/src/custom-fetch.ts` — configurable base URL and auth token getter

### Workspace Structure

```
ZenHR-Full-System/
  frontend/              Angular 18 SPA (active frontend)
  artifacts/
    api-server/          Node.js/Express API (active backend)
    zenjo-ng/            Legacy Angular reference (do not modify)
    zenjo-api/           .NET 9 reference (do not modify)
  lib/
    db/                  Drizzle ORM schema + seed (PostgreSQL)
    api-client-react/    Generated React Query hooks
    api-zod/             Generated Zod schemas
    api-spec/            OpenAPI spec + Orval config
  scripts/               Utility scripts
```

### Key Business Rules

- Currency: JOD, always 3 decimal places
- Working week: Sunday–Thursday; Friday–Saturday = weekend
- Timezone: Asia/Amman
- All compliance values (SSC rates, tax brackets, leave days, overtime rates) are stored in `systemConfigurationsTable` — never hardcoded
- Document checklists are auto-generated per employee on creation
- Compliance status is calculated from document states, not manually set

### Startup Commands

```bash
# Install all dependencies
cd ZenHR-Full-System && pnpm install

# Push DB schema
cd ZenHR-Full-System && pnpm --filter db push

# Seed DB
cd ZenHR-Full-System && pnpm --filter db seed

# Start API (port 3001)
cd ZenHR-Full-System && pnpm --filter zenjo-api-server dev

# Start Angular frontend (port 5000 via Replit proxy)
cd ZenHR-Full-System/frontend && npm start
```

### Dev Proxy

Angular dev server proxies `/api/*` to `http://localhost:3001` via `frontend/proxy.conf.json`.

---

## External Dependencies

### Runtime Services

| Service | Purpose | Config |
|---|---|---|
| PostgreSQL | Primary database | `DATABASE_URL` env var (Replit built-in) |
| JWT | Auth tokens | `JWT_SECRET` env var (defaults to hardcoded dev key) |

### Key npm Packages (Frontend)

| Package | Purpose |
|---|---|
| `@angular/core` v18 | Framework |
| `@ngx-translate/core` | i18n (AR/EN) |
| `lucide-angular` | Icons |
| `tailwindcss` | Styling |
| `rxjs` | Reactive state |

### Key npm Packages (Backend)

| Package | Purpose |
|---|---|
| `express` v4 | HTTP server |
| `drizzle-orm` | ORM |
| `pg` | PostgreSQL driver |
| `jsonwebtoken` | JWT auth |
| `zod` | Validation |
| `cors` | CORS middleware |

### Code Generation

| Tool | Purpose |
|---|---|
| `orval` | Generates React Query hooks + Zod schemas from OpenAPI spec |
| `drizzle-kit` | DB schema push and migrations |

### Fonts & External CDN

- Google Fonts: Noto Kufi Arabic (Arabic, weights 400/500/600/700) + DM Sans (English) + Material Symbols Rounded (icons)
- Loaded via `@import` in `styles.scss`

### Phase 1 — Org Structure & Dynamic Permissions (COMPLETE)

**New DB tables (schema in `lib/db/src/schema/`):**
- `org_nodes` — self-referencing tree: Company → Branch → Department → Section → Unit. Seeded from existing 6 departments. Indexes on `company_id`, `parent_id`, `(company_id, node_type)`.
- `roles` — company-scoped role records (6 system roles seeded per company: superadmin, hradmin, payrolladmin, manager, employee, recruiter).
- `permissions` — global 108 entries: 18 screens × 6 actions (view/create/update/delete/approve/export).
- `role_permissions` — maps roleId → permissionId with a `data_scope` (own/department/org_node/branch/company).
- Added `employees.org_node_id` (nullable, alongside existing `department_id` — NOT dropped).
- Added `users.role_id` (nullable FK to roles, alongside existing `role` varchar — NOT dropped).
- Seed script: `lib/db/src/seed-phase1.ts` — safe to re-run; verifies employee count before/after.

**New backend (`artifacts/api-server/src/`):**
- `permission-service.ts` — `getPermissionMap(req)`, `hasPermission()`, `getDataScope()`, `getDescendantNodeIds()`, `getEmployeeScopeConditions()`. Cached per-request via `WeakMap`.
- `GET /api/org-nodes` — flat list for current company
- `GET /api/org-nodes/flat` — alias
- `GET /api/org-nodes/tree` — nested tree (built in-memory)
- `GET /api/org-nodes/:id/descendants` — recursive descendant IDs (CTE)
- `POST /api/org-nodes` — create [hradmin only]
- `PUT /api/org-nodes/:id` — update [hradmin only]
- `DELETE /api/org-nodes/:id` — soft delete, blocked if has employees or children
- `GET /api/permissions/my` — full permission map `{ screens: {...}, dataScope: string }`
- `GET /api/permissions/check?screen=&action=` — single boolean check
- `GET /api/employees` — now applies data scoping: employee→own, manager→department, hradmin→company

**New frontend (`frontend/src/app/core/`):**
- `directives/can-do.directive.ts` — `*canDo="'employees:create'"` structural directive. Removes element if user lacks permission. No HTTP call — reads from cached BehaviorSubject.
- `services/role-access.service.ts` — updated: fetches `/api/permissions/my` on login (via Angular `effect()` on `currentUser` signal), stores in `_permissionMap` BehaviorSubject, exposes `canDoSync()` for directive, `canDo()` now uses cache first.

**Data scope verification (confirmed by manual API test):**
- `employee` → sees only own record (total=1) ✓
- `manager` → sees only department (total=2) ✓
- `hradmin` → sees all company employees ✓
- Employee count before seeding = after seeding = 6 ✓ (zero data loss)

### Arabic / RTL Support

The app is fully bilingual AR/EN with RTL layout:
- `I18nService` manages current language via Angular signals; persists to `localStorage`
- `applyDocumentLanguage()` sets `html[dir]`, `html[lang]`, `body.rtl`/`body.ltr`
- CSS uses `[dir='rtl']` overrides for letter-spacing, text-transform, and negative translateX
- Font selection: `[lang='ar'] *` → Noto Kufi Arabic; `[lang='en'] *` → DM Sans
- Translation files: `frontend/src/assets/i18n/ar.json` and `en.json`
- `t(ar, en)` helper in component templates uses Arabic string as first arg, English as second
- Mojibake recovery: files corrupted by cp1256 re-encoding were fixed with the pair-map algorithm (each garbled cp1256 char pair → original UTF-8 byte → correct Arabic char)

### Demo Accounts (seeded)

| Username | Password | Role |
|---|---|---|
| admin | Admin@1234 | superadmin |
| hr | Hr@1234 | hradmin |
| payroll | Payroll@1234 | payrolladmin |
| manager | Manager@1234 | manager |
| employee | Employee@1234 | employee |