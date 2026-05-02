# ZenJO — Jordanian HR Management System (HRMS)

## Overview
Enterprise-grade HRMS built for Jordanian companies. Full bilingual (Arabic/English) with RTL-first design, Jordanian labor law compliance, and strict role-based product architecture (6 distinct experience layers).

## Architecture
- **Frontend**: Angular 18 (`ZenHR-Full-System/frontend/`) — port 5000 (webview)
- **Backend**: Node.js/Express API (`ZenHR-Full-System/artifacts/api-server/`) — port 3001 (console)
- **Database**: PostgreSQL (Replit built-in via `DATABASE_URL`)
- **ORM**: Drizzle ORM (`ZenHR-Full-System/lib/db/`)
- **Package Manager**: pnpm workspace for backend; npm for Angular frontend

## Workflows
- `Start application` — Angular 18 dev server on port 5000 (webview, auto-start)
- `ZenJO API` — Node.js/Express API on port 3001 (console, auto-start)

## Setup
1. Backend pnpm deps: `cd ZenHR-Full-System && pnpm install`
2. Frontend npm deps: `cd ZenHR-Full-System/frontend && npm install`
3. DB schema push: `cd ZenHR-Full-System && pnpm --filter db push`
4. DB seed: `cd ZenHR-Full-System && pnpm --filter db seed`

## Demo Accounts
| Username | Password | Role |
|----------|----------|------|
| admin | Admin@1234 | superadmin |
| hr | Hr@1234 | hradmin |
| payroll | Payroll@1234 | payrolladmin |
| manager | Manager@1234 | manager |
| employee | Employee@1234 | employee |
| recruiter | Recruiter@1234 | recruiter |

## API Endpoints (all under /api prefix, proxied by Angular dev server)
- `GET /api/healthz` — Health check
- `POST /api/auth/login` — Login (returns JWT)
- `GET /api/auth/context` — Tenant/org context for current user (company + branch/dept names)
- `GET/POST /api/employees` — Employee management (enriched: branch, breadcrumb, manager name; supports `?branchId=` filter)
- `GET/POST /api/departments` — Departments
- `GET/POST /api/job-titles` — Job titles
- `GET/POST /api/leave/requests` — Leave requests
- `GET/POST /api/leave/policies` — Leave policies
- `GET/POST /api/payroll/runs` — Payroll runs
- `GET /api/payroll/slips` — Payslips
- `GET/POST /api/attendance` — Attendance records
- `GET/POST /api/documents` — Documents
- `GET/POST /api/assets` — Assets
- `GET /api/lookups/*` — Reference data (nationalities, cities, banks, etc.)
- `GET /api/dashboard/*` — Dashboard stats

## Key Files
- `ZenHR-Full-System/artifacts/api-server/src/index.ts` — Main Express API server
- `ZenHR-Full-System/artifacts/api-server/src/auth.ts` — JWT auth & middleware
- `ZenHR-Full-System/frontend/src/app/app.routes.ts` — Angular routes
- `ZenHR-Full-System/frontend/src/app/core/services/auth.service.ts` — Auth service
- `ZenHR-Full-System/frontend/src/app/core/services/role-access.service.ts` — RBAC
- `ZenHR-Full-System/frontend/src/app/core/services/tenant-context.service.ts` — Tenant/org context service (Phase UI-1)
- `ZenHR-Full-System/lib/db/src/schema/` — Drizzle ORM schema definitions
- `ZenHR-Full-System/lib/db/src/seed.ts` — Demo data seeder
- `ZenHR-Full-System/frontend/proxy.conf.json` — Proxies /api → localhost:3001

## Phase UI-1 — Tenant/Org Context Visibility (Completed)
- **Layout header**: Shows company name (and branch/dept for manager/employee) as a green pill badge next to the role label in every page header
- **Employees screen**: Branch filter dropdown added; Branch column shows branch badge; Org Unit column now shows node name + full breadcrumb; filtering uses descendant traversal (branch filter matches all sub-units)
- **Employee profile / Employment tab**: Shows Company, Branch (if assigned), Department, and Manager Name (resolved from ID) instead of raw IDs
- **Manager dashboard**: Scope banner below the hero shows Company › Branch › Department with a note that data is scoped to the manager's org context
- **Backend enrichment**: `GET /api/employees` and `GET /api/employees/:id` return virtual fields: `branchId/NameAr/NameEn`, `orgBreadcrumb`, `directManagerName/Ar`; `GET /api/auth/context` returns full company + org context for the current user

## JWT Config
- Key: `ZenJO-HRMS-2024-Secure-Secret-Key-Minimum32Characters!`
- Access token: 60 minutes; Refresh token: 7 days
- Password hash: SHA-256 with salt `zenjo_salt`

## Role-Based Access (RBAC)
- **superadmin**: Platform controls, company management
- **hradmin**: Full HR operations, all employees
- **payrolladmin**: Payroll + advances + reports
- **manager**: Team attendance/leave/overtime
- **employee**: Own data (ESS portal)
- **recruiter**: Pre-employment + own ESS

## Jordan-Specific Rules
- SSC: insurable salary = MIN(basic, 3000 JOD). Employee 7.5% + Employer 14.25%
- EOSB: resignation <3yr = 0, ≥3yr = basic×years/12. Termination = basic×years
- Income tax: 5 brackets per Jordanian law

## Database Schema (PostgreSQL)
- companies, users, employees, departments, job_titles
- leave_requests, leave_policies, leave_balances, leave_types
- payroll_runs, payslips
- attendance_records
- documents, document_types
- assets, asset_categories
- nationalities, cities, banks
- activity_logs, system_configurations, overtime_requests
