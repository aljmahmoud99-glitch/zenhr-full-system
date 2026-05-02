# ZenJO HRMS — Codex Master Prompt v5
## نظام ZenJO HRMS — Prompt رئيسي محسّن لـ Codex / Copilot Workspace

---

## 0. Mission

You are working on **ZenJO HRMS**, a production-style HR and payroll system for Jordan.

Your mission is to improve, extend, and correct the system with:

1. Real business workflows
2. Real API integration
3. Real database persistence
4. Clean, professional enterprise UI
5. Strict permission alignment across all layers
6. No fake data unless explicitly allowed for transitional UI only

This prompt is optimized for:

- Codex
- GitHub Copilot Workspace
- agentic implementation inside the real repository

---

## 1. Repository Truth

### 1.1 Primary stack

Treat this as the active production target:

- Frontend: `Angular 18`
  - `artifacts/zenjo-ng`
- Backend: `.NET 9 Web API`
  - `artifacts/zenjo-api`
- Database: `MySQL 8`

### 1.2 Legacy stack

This repository also contains an older React/Express/Postgres workspace.

That stack is:

- reference-only
- legacy
- not the default implementation target

Do **not** build new features in the legacy stack unless explicitly asked.

### 1.3 Source of truth files

Use these files as primary truth:

- Frontend routes:
  - `artifacts/zenjo-ng/src/app/app.routes.ts`
- Frontend role access:
  - `artifacts/zenjo-ng/src/app/core/services/role-access.service.ts`
- Backend startup:
  - `artifacts/zenjo-api/Program.cs`
- Backend data model:
  - `artifacts/zenjo-api/Models/Entities.cs`
- Backend EF config:
  - `artifacts/zenjo-api/Data/AppDbContext.cs`
- Seed data:
  - `artifacts/zenjo-api/Data/DbSeeder.cs`

---

## 2. Core Operating Rules

### 2.1 Work on the real system

Every change must prefer:

- real API calls
- real database tables
- real seeded users
- real workflow states

Avoid:

- hardcoded fake arrays
- “demo-only” placeholders
- duplicated frontend-only state that diverges from backend truth

### 2.2 Respect existing architecture

Do not introduce a parallel architecture.

Stay inside:

- Angular standalone components
- existing service/guard/access-control patterns
- ASP.NET controller-based REST style
- EF Core + existing entity model

### 2.3 Do not break RTL/LTR

All UI must support:

- Arabic RTL
- English LTR

Always use logical CSS properties where possible:

- `margin-inline-start`
- `margin-inline-end`
- `padding-inline-start`
- `padding-inline-end`
- `border-inline-start`
- `border-inline-end`

### 2.4 Real permissions only

A permission is not finished unless it is aligned in all relevant layers:

1. Angular route visibility
2. Angular nav visibility
3. Angular button/action visibility
4. Backend `[Authorize]` rules
5. Backend data scoping

If one layer differs, fix it or explicitly document why.

---

## 3. Delivery Standard

Every implementation must aim for:

- professional enterprise visual quality
- clear workflows
- minimal ambiguity
- maintainable code
- consistent naming
- low duplication

Do not stop at cosmetic changes if the workflow remains fake or broken.

Do not stop at backend endpoints if the UI still behaves like mock UI.

Do not stop at route guards if backend authorization still disagrees.

---

## 4. UI Design Direction

### 4.1 Design language

Use:

- precise enterprise layout
- high readability
- strong hierarchy
- calm confidence
- Arabic-first polish

Visual direction:

- structured, premium, professional
- no generic template feel
- no random color swaps
- no “AI slop” layout

### 4.2 Design principles

Every screen should include:

- strong page header
- clear primary action
- meaningful card hierarchy
- good empty states
- loading states
- error states
- responsive behavior

### 4.3 Styling strategy

Prefer a proper design-system layer:

- global variables/tokens
- reusable card styles
- reusable tables
- reusable badges
- reusable buttons
- reusable form styles
- reusable loading skeletons

Do not keep reinventing one-off styles in every feature.

### 4.4 Typography

Arabic:

- `Noto Kufi Arabic`

English:

- `DM Sans`

The UI must feel native in both languages, not just translated.

### 4.5 Motion

Use subtle motion only where it adds value:

- page entry
- card stagger
- badge pulse for pending states
- loading skeleton shimmer

Do not overanimate.

---

## 5. Layout System

### 5.1 Sidebar

The sidebar must be:

- role-aware
- collapse-capable
- RTL-safe
- visually premium
- stable on mobile

Expected behavior:

- expanded and collapsed modes
- active route state
- grouped navigation
- pending badges where relevant
- user mini profile area
- language toggle and logout area

### 5.2 Topbar

The topbar should include:

- breadcrumb
- page title
- global search if supported
- language toggle
- notification bell
- profile dropdown

### 5.3 Page shell

Use a consistent page structure:

- page header
- summary row
- main content grid
- detail panels / forms / tables

Do not make each screen feel like a separate product.

---

## 6. Data and API Rules

### 6.1 API integration

Every data-driven screen must pull from the backend through the established Angular API service.

Use:

- real HTTP requests
- actual DTO-compatible payloads
- real loading and error handling

### 6.2 Database writes

When the UI submits:

- a request
- an approval
- a rejection
- a setting change
- a payroll action

the backend must persist it into actual MySQL tables.

### 6.3 No silent fake fallback

If the API fails:

- show clear UI feedback
- do not silently substitute fake data

### 6.4 Tenant scope

All business data must respect tenant/company scope.

Whenever a feature is built or fixed, verify:

- controller filters by current company
- role sees only permitted subset
- manager sees team-scoped data where required
- employee sees self-scoped data where required

---

## 7. Roles and Experience Model

The system must support distinct experiences for:

- `hradmin`
- `payrolladmin`
- `manager`
- `employee`

Also preserve platform/admin roles where present:

- `superadmin`
- `recruiter`

### 7.1 HR Admin

Primary owner of:

- employee management
- attendance oversight
- leave approvals
- overtime approvals
- salary advances approvals
- compliance
- documents
- assets
- resignations
- clearance
- discipline

### 7.2 Payroll Admin

Primary owner of:

- payroll runs
- payslips
- financial reporting
- payroll-related views of employee data
- finance-side visibility on advances

Payroll admin is **not automatically HR admin**.

### 7.3 Manager

Manager owns:

- team visibility
- team attendance
- team leave decisions
- team overtime decisions
- team workflow visibility

Manager must not be turned into an HR superuser.

### 7.4 Employee

Employee experience must be strong and self-service focused:

- my attendance
- my leave
- my overtime
- my payslips
- my documents
- my advances
- forms

---

## 8. Permission Alignment Contract

### 8.1 Mandatory alignment

When implementing any permission-sensitive module, update all applicable files:

- `app.routes.ts`
- `role-access.service.ts`
- affected Angular components
- backend controller `[Authorize]`
- backend scoping logic

### 8.2 Permission design rules

Use these principles:

- page access can be broader than action access
- action access must never be broader than backend authorization
- backend authorization is the final source of enforcement
- frontend must not misleadingly expose actions that backend will reject

### 8.3 Sensitive data masking

Sensitive fields such as salary, bank data, tax identifiers, or SSC-sensitive information must be masked where the role is not entitled to them.

This masking must happen in backend mapping/response shaping, not only in frontend hiding.

### 8.4 Scoped data rules

Manager:

- see team-scoped data
- typically by `DirectManagerId` or equivalent team logic

Employee:

- see own data only

Payroll admin:

- see finance-relevant data
- do not inherit full HR editing power unless explicitly intended

---

## 9. Payroll Rules

Payroll is critical and must be treated as a real financial module.

### 9.1 Required behavior

Payroll must calculate from:

- employee salary components
- approved overtime
- leave/absence impacts where applicable
- salary advances deductions
- SSC
- income tax
- net salary

### 9.2 Jordan-specific correctness

When applying Jordan payroll rules:

- prefer configuration-driven values
- do not hardcode legal assumptions deep inside UI
- keep formulas testable
- keep tax and SSC logic readable and traceable

### 9.3 Payroll run ownership

Payroll run creation belongs to payroll operations, not generic HR, unless the business explicitly says otherwise.

---

## 10. Workflow Rules

The system is workflow-heavy. Each workflow must be real and stateful.

### 10.1 Leave

Must support:

- request creation
- approvals/rejections
- correct scoping by role
- real balance effects

### 10.2 Overtime

Must support:

- request submission
- approval flow
- payroll linkage where payment-based

### 10.3 Salary Advances

Must support:

- employee request submission
- HR review
- approval/rejection
- repayment method/plan
- deduction linkage in payroll where applicable

### 10.4 Discipline

Must support:

- case creation
- investigation
- decisions
- history visibility

### 10.5 Resignation and Clearance

Must support:

- resignation record
- notice flow
- clearance
- EOSB/settlement logic where implemented

### 10.6 Compliance

Must support:

- work permit validity
- SSC state
- health/residency/passport tracking
- warning/expiry visibility

---

## 11. Feature Build Rules

For every feature you implement or rebuild:

### 11.1 Frontend must include

- route integration
- sidebar visibility if relevant
- header and summary UX
- real API integration
- loading state
- empty state
- error handling
- translated Arabic and English labels
- RTL-safe layout

### 11.2 Backend must include

- correct authorization
- correct tenant scoping
- correct role scoping
- correct validation
- correct persistence
- correct response shaping

### 11.3 Documentation must include

When substantial changes happen, update or create:

- endpoint docs
- role matrix
- permissions fix notes
- module docs if workflow changed materially

---

## 12. Implementation Standards for Angular

Use:

- standalone components
- Angular Signals where they improve clarity
- existing service pattern for HTTP
- readable state transitions

Prefer:

- component-specific SCSS only for local overrides
- shared/global style system for reusable patterns

Avoid:

- giant hardcoded mock arrays
- duplicated permission logic scattered randomly
- ad hoc component-specific design systems

### 12.1 UX standards

Loading:

- skeletons preferred over plain spinners

Errors:

- toast + inline feedback when needed

Tables:

- readable header
- clear row actions
- responsive fallback

Forms:

- validation
- helper text
- disabled submit while posting

---

## 13. Implementation Standards for Backend

Use:

- clear controller endpoints
- role attributes
- EF queries that reflect tenant and role rules
- small DTOs or shaped responses when needed

Avoid:

- leaking unrestricted entities directly if role masking is needed
- inconsistent authorization patterns between similar endpoints
- silent broadening of access via missing `[Authorize]`

### 13.1 Validation

Validate:

- ownership
- tenant scope
- business state transitions
- required fields
- invalid transitions

### 13.2 Auditability

For important actions, keep audit/history considerations in mind:

- login
- approvals
- rejections
- payroll runs
- user management
- disciplinary decisions

---

## 14. Required Output Behavior from the Agent

When executing this prompt, the agent must:

1. Inspect existing code first
2. Reuse existing architecture where sensible
3. Fix mismatches instead of adding parallel behavior
4. Implement end-to-end, not half-UI / half-backend
5. Verify with build/tests when possible
6. Clearly report:
   - files changed
   - real behavior added/fixed
   - remaining risks

### 14.1 Never claim completion if

- frontend still uses mock data
- backend endpoint is missing
- permissions are still mismatched
- feature is not wired to route/nav
- workflow state does not persist

---

## 15. Priority Order

Build or improve in this order unless task-specific priorities override it:

### Phase 1 — Foundation

1. Design system
2. Sidebar
3. Topbar
4. Shared UI primitives

### Phase 2 — Permission Integrity

5. Route guards and page access
6. Nav visibility
7. Action visibility
8. Backend authorization
9. Data masking and scoping

### Phase 3 — Role Dashboards

10. HR dashboard
11. Payroll dashboard
12. Manager dashboard
13. Employee dashboard

### Phase 4 — Core Business Workflows

14. Payroll
15. Leave
16. Overtime
17. Salary advances
18. Attendance

### Phase 5 — Broader HR Modules

19. Employees
20. Settings
21. Reports
22. Users
23. Compliance
24. Documents
25. Assets
26. Discipline
27. Resignations
28. Clearance

### Phase 6 — Polish

29. Mobile
30. Print views
31. Animation polish
32. Notifications
33. Documentation refresh

---

## 16. Acceptance Checklist

A task is only complete if all relevant items below are true:

- UI is professional and coherent
- API is real
- DB writes are real
- route exists
- nav entry exists if needed
- permissions are aligned
- data is correctly scoped
- Arabic and English both work
- RTL and LTR both work
- loading/empty/error states exist
- build passes

If any of these are false, the task is not fully done.

---

## 17. Special Notes for This Repository

Use the current repository reality, not assumptions from generic prompts:

- salary advances are already partially integrated and must stay real
- employee advances navigation now exists and must be preserved
- backend launcher is customized for local Windows/MySQL startup
- some Angular style budget warnings exist but should not block valid feature work
- some EF warnings exist around query filters and required relations; do not confuse those with permission bugs

---

## 18. Final Instruction

Do not produce “UI-only” work.

Do not produce “backend-only” work.

Do not produce “permission docs only” work if actual permission code is wrong.

Treat ZenJO as a real enterprise system:

- exact
- consistent
- auditable
- role-aware
- Arabic-first
- operationally usable

If you change a module, leave it measurably better across:

- design
- logic
- permissions
- workflow integrity
- maintainability

---

*ZenJO HRMS Master Prompt v5*
*Primary stack: Angular 18 + .NET 9 + MySQL*
*Jordan-focused · Role-aware · Real workflows · Real data · Enterprise UI*
