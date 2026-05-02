# ERD

## Scope

This is a **textual ERD** for the primary ZenJO system:

- Frontend: Angular 18
- Backend: .NET 9
- Database: MySQL

Primary schema sources:

- [Entities.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Models/Entities.cs:5)
- [AppDbContext.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Data/AppDbContext.cs:9)

Legend:

- `1 -> many`
- `1 -> 1`
- `(optional)` means nullable/conditional relation

---

## 1. Platform / Tenant Layer

```text
Company
  1 -> many Department
  1 -> many JobTitle
  1 -> many Employee
  1 -> many User
  1 -> many PayrollRun
  1 -> many SalaryAdvance
  1 -> many Asset
  1 -> many Document
  1 -> many Resignation
  1 -> many ClearanceRecord
  1 -> many PublicHoliday
  1 -> many FormRecord
  1 -> many SystemConfiguration
  1 -> many ActivityLog
  1 -> many Notification
  1 -> many Shift
  1 -> many ShiftAssignment
  1 -> many ShiftRotation
  1 -> many ShiftException
  1 -> many WorkLocation
  1 -> many LeavePolicy
  1 -> many OvertimeRule
  1 -> many ProbationEvaluation

Company
  1 -> many CompanySubscription

CompanyRegistration
  independent pre-approval entity
```

---

## 2. Organization and Identity

```text
Department
  many -> 1 Company
  many -> 1 Department (ParentDepartment) (optional)
  1 -> many Employee
  1 -> many ShiftAssignment (optional department-targeted assignment)
  1 -> many PublicHolidayDepartment

JobTitle
  many -> 1 Company
  1 -> many Employee

Bank
  1 -> many Employee (optional)

Governorate
  1 -> many City

City
  many -> 1 Governorate

Employee
  many -> 1 Company
  many -> 1 Department (optional)
  many -> 1 JobTitle (optional)
  many -> 1 Bank (optional)
  many -> 1 Employee (DirectManager) (optional)

User
  many -> 1 Company (optional in some system contexts)
  many -> 1 Employee (optional)
```

---

## 3. Attendance and Shift Domain

```text
Shift
  many -> 1 Company
  1 -> many AttendanceRecord (optional shift link)
  1 -> many OvertimeRecord (optional shift link)
  1 -> many ShiftAssignment
  1 -> many ShiftException (as CustomShift) (optional)

Employee
  1 -> many AttendanceRecord
  1 -> many AttendanceRequest
  1 -> many OvertimeRecord
  1 -> many OvertimeRequest
  1 -> many ShiftAssignment
  1 -> many ShiftException

AttendanceRecord
  many -> 1 Employee
  many -> 1 Shift (optional)

AttendanceRequest
  many -> 1 Employee

WorkLocation
  many -> 1 Company

ShiftAssignment
  many -> 1 Company
  many -> 1 Shift
  many -> 1 Employee (optional)
  many -> 1 Department (optional)

ShiftRotation
  many -> 1 Company

ShiftException
  many -> 1 Company
  many -> 1 Employee
  many -> 1 Shift (CustomShift) (optional)
```

---

## 4. Leave Domain

```text
LeaveType
  1 -> many LeavePolicy
  1 -> many LeaveBalance
  1 -> many LeaveRequest

LeavePolicy
  many -> 1 Company
  many -> 1 LeaveType

Employee
  1 -> many LeaveBalance
  1 -> many LeaveRequest

LeaveBalance
  many -> 1 Employee
  many -> 1 LeaveType

LeaveRequest
  many -> 1 Employee
  many -> 1 LeaveType
```

---

## 5. Overtime Domain

```text
Employee
  1 -> many OvertimeRequest
  1 -> many OvertimeRecord

OvertimeRequest
  many -> 1 Employee
  many -> 1 Company

OvertimeRecord
  many -> 1 Employee
  many -> 1 Shift (optional)
  many -> 1 Company

OvertimeRule
  many -> 1 Company
```

---

## 6. Payroll and Compensation

```text
PayrollRun
  many -> 1 Company
  1 -> many Payslip

Payslip
  many -> 1 PayrollRun
  many -> 1 Employee

SalaryAdvance
  many -> 1 Company
  many -> 1 Employee
  approvedById -> User/actor semantics at application layer
```

---

## 7. Recruitment, Probation, Onboarding

```text
PreEmploymentRecord
  many -> 1 Company
  many -> 1 Employee (optional if converted/hired)

ProbationEvaluation
  many -> 1 Company
  many -> 1 Employee
```

---

## 8. Discipline Domain

```text
ViolationType
  many -> 1 Company
  1 -> many DisciplinaryAction

Employee
  1 -> many DisciplinaryAction

DisciplinaryAction
  many -> 1 Company
  many -> 1 Employee
  many -> 1 ViolationType
  1 -> 1 DisciplinaryInvestigation

DisciplinaryInvestigation
  1 -> 1 DisciplinaryAction
```

---

## 9. Resignation and Exit Domain

```text
Employee
  1 -> many Resignation
  1 -> many ClearanceRecord

Resignation
  many -> 1 Company
  many -> 1 Employee
  1 -> many ResignationApproval
  1 -> many ExitInterview

ResignationApproval
  many -> 1 Resignation

ExitInterview
  many -> 1 Resignation

ClearanceRecord
  many -> 1 Company
  many -> 1 Employee
```

---

## 10. Assets, Documents, Compliance

```text
AssetCategory
  1 -> many Asset

Asset
  many -> 1 Company
  many -> 1 AssetCategory
  many -> 1 Employee (AssignedToEmployee) (optional)

DocumentType
  1 -> many Document

Document
  many -> 1 Company
  many -> 1 Employee
  many -> 1 DocumentType

EmployeeComplianceStatus
  many -> 1 Employee
  many -> 1 Company
```

---

## 11. Holidays

```text
PublicHoliday
  many -> 1 Company
  1 -> many PublicHolidayDepartment

PublicHolidayDepartment
  many -> 1 PublicHoliday
  many -> 1 Department
```

---

## 12. Forms, Configuration, Notifications, Audit

```text
FormRecord
  many -> 1 Company
  many -> 1 Employee (optional, depending on form type)

SystemConfiguration
  many -> 1 Company

Notification
  many -> 1 Company
  many -> 1 User/Employee semantics handled by app logic

ActivityLog
  many -> 1 Company (logical tenant ownership)
  many -> 1 User (logical actor ownership)
  many -> 1 Employee (optional related subject)
```

---

## 13. Core Hub View

If you want the shortest possible mental model, the system is centered on three hubs:

```text
Company
  -> tenant boundary

Employee
  -> HR/person/workforce boundary

User
  -> login/role/security boundary
```

Most business records are one of these patterns:

```text
Company -> Transaction
Employee -> Transaction
User -> Action / Audit / Approval
```

Examples:

- `Employee -> LeaveRequest`
- `Employee -> AttendanceRecord`
- `Employee -> SalaryAdvance`
- `PayrollRun -> Payslip -> Employee`
- `Resignation -> Employee`
- `DisciplinaryAction -> Employee`

---

## 14. Recommended Next Step

If you want the ERD expanded further, the best next artifact is:

- field-level schema catalog
- Mermaid ER diagram
- diagram grouped by module instead of one full graph
