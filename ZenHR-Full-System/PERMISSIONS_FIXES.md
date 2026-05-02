# Permissions Fixes

## Purpose

This document records **real permission fixes applied in code**, not just documentation findings.

Primary goal:

- reduce mismatch between Angular visibility rules and .NET authorization rules

---

## 1. Issue Fixed: Salary Advances Approval Mismatch

### Problem Before

The salary advances module had inconsistent permission logic:

Frontend route/page access:

- `advances`
  - `hradmin`
  - `payrolladmin`
  - `employee`

Frontend action map:

- `advance:approve`
  - `hradmin`
  - `payrolladmin`

Frontend component behavior:

- `canManageAdvances`
  - `superadmin`
  - `hradmin`

Backend approval endpoints:

- `PUT /api/salary-advances/{id}/approve`
  - `superadmin`
  - `hradmin`

- `PUT /api/salary-advances/{id}/reject`
  - `superadmin`
  - `hradmin`

### Why This Was a Problem

It created multiple mismatches:

1. `payrolladmin` looked allowed from the frontend action map, but backend would reject approval.
2. `superadmin` looked allowed inside component logic, but frontend route/navigation did not expose the screen.
3. The user experience could become confusing and inconsistent depending on entry point.

---

## 2. Actual Fix Applied

### Frontend component

File:

- [advances.component.ts](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-ng/src/app/features/advances/advances.component.ts:76)

Change:

- `canManageAdvances` is now:
  - `hradmin` only

Result:

- Only HR can see approve/reject management actions in the salary advances screen.

### Frontend action access map

File:

- [role-access.service.ts](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-ng/src/app/core/services/role-access.service.ts:250)

Change:

- `advance:approve` is now:
  - `hradmin` only

Result:

- Shared access layer no longer advertises approval capability to payroll.

### Backend authorization

File:

- [SalaryAdvancesController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/SalaryAdvancesController.cs:137)

Changes:

- `PUT /api/salary-advances/{id}/approve`
  - changed to `[Authorize(Roles = "hradmin")]`

- `PUT /api/salary-advances/{id}/reject`
  - changed to `[Authorize(Roles = "hradmin")]`

Result:

- Backend authorization now matches actual frontend management role.

---

## 3. Final Unified Rule for Salary Advances

### Page access

Allowed roles:

- `hradmin`
- `payrolladmin`
- `employee`

Meaning:

- `employee`
  - submit and track own requests
- `payrolladmin`
  - view finance-related advances page/data
- `hradmin`
  - full management

### Approval and rejection

Allowed role:

- `hradmin` only

This is now aligned in:

1. frontend component behavior
2. frontend action access map
3. backend controller authorization

---

## 4. Issue Fixed Earlier: Employee Advances Tab Missing

### Problem

Employees could access the route, but the sidebar did not include the advances tab.

### Fix

File:

- [role-access.service.ts](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-ng/src/app/core/services/role-access.service.ts:201)

Added:

- `My Advances / سلفي`
  - path: `/app/advances`

### Result

Employees now see the advances tab in self-service navigation.

---

## 5. Startup/Runtime Fixes Related to Stable Permissions Testing

These are not role changes, but they were necessary to verify behavior reliably.

### Backend launcher improvements

File:

- [run-backend.bat](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/run-backend.bat)

Applied fixes:

- stop older process already using the backend port
- build to isolated output folder:
  - `build/zenjo-api-run`
- run the DLL instead of locked apphost EXE
- use `127.0.0.1` for MySQL connection default

### Why it matters

Stable startup is required before permission testing can be trusted, especially for login, role-based navigation, and approval workflows.

---

## 6. Remaining Permission Risks to Review Later

The following areas may still need a fuller audit:

### Employees page

- Route allows:
  - `hradmin`
  - `payrolladmin`

- Actions are intentionally split:
  - HR can create/edit/deactivate
  - Payroll can view salary/bank/SSC

This may be correct, but it should remain explicitly intentional.

### Managers

Managers have page access to several workflow screens, but not always matching action rights.

Examples:

- disciplinary
- shifts
- leave
- overtime

This may be by design, but it should be reviewed screen-by-screen.

### Superadmin

Some backend actions may still technically allow `superadmin` while frontend route exposure is intentionally limited.

This is not necessarily wrong, but it should be governed deliberately.

---

## 7. Recommended Policy Going Forward

For every new module, define permissions in this order:

1. page access
2. navigation visibility
3. action/button visibility
4. backend endpoint authorization

And keep all four consistent before considering the module complete.

---

## 8. Current Outcome

The salary advances module is now aligned in practice:

- Employee sees the tab and can submit a request
- Payroll can access the advances page but not approve/reject
- HR can review and approve/reject
- Backend enforcement matches the frontend management rule
