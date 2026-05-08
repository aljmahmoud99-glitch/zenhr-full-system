# Manual UI Screens Tested

Generated: 2026-05-06

## Important Scope Note

These screens were not manually clicked in a browser. The check below is route-shell reachability only: each URL returned HTTP 200 from `http://localhost:5000` and served Angular shell markup.

Real browser UAT remains required.

## Route Shells Reached

| Area | Route | HTTP | Angular Shell |
|---|---|---:|---|
| Auth | `/login` | 200 | Yes |
| Superadmin | `/admin/companies` | 200 | Yes |
| Superadmin | `/admin/roles-permissions` | 200 | Yes |
| Superadmin | `/admin/company-settings` | 200 | Yes |
| Superadmin | `/admin/plans-subscriptions` | 200 | Yes |
| Superadmin | `/admin/analytics` | 200 | Yes |
| Superadmin | `/admin/audit-logs` | 200 | Yes |
| Superadmin | `/admin/automation` | 200 | Yes |
| App | `/app/dashboard` | 200 | Yes |
| HR | `/app/employees` | 200 | Yes |
| HR | `/app/job-descriptions` | 200 | Yes |
| Attendance | `/app/attendance` | 200 | Yes |
| Leave | `/app/leave` | 200 | Yes |
| Overtime | `/app/overtime` | 200 | Yes |
| Payroll | `/app/payroll` | 200 | Yes |
| Workflows | `/app/workflows` | 200 | Yes |
| Documents | `/app/documents` | 200 | Yes |
| Assets | `/app/assets` | 200 | Yes |
| Compliance | `/app/compliance` | 200 | Yes |
| Forms | `/app/forms` | 200 | Yes |

## Static Wiring Confirmed

Frontend route and menu wiring exists for:

- Admin V1: roles/permissions, company settings, plans/subscriptions, analytics, audit logs.
- Admin V2: automation, workflows, notifications dropdown.
- HR flows: employees, job descriptions, employee action screens, attendance, leave, overtime, compliance, forms.
- Payroll flows: payroll runs, payslips, salary components.
- Documents/assets/file-related pages.

## Not Actually Browser-Tested

- Login/logout/session persistence.
- Role-based sidebar rendering after login.
- Forbidden page UX.
- Dialog open/close behavior.
- Form validation and submission behavior.
- Toast messages.
- Tables rendering with live data.
- Loaders stopping after real requests.
- Browser console and network failures.
- Screenshots.
