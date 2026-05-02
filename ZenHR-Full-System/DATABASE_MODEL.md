# Database Model

## Scope

This document describes the **primary database model** used by the Angular/.NET/MySQL ZenJO system.

Primary sources:

- [Entities.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Models/Entities.cs:5)
- [AppDbContext.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Data/AppDbContext.cs:9)

Database engine:

- MySQL

ORM:

- Entity Framework Core

Design characteristics:

- Tenant-aware via `CompanyId`
- Soft-delete patterns in several entities
- Lookup/reference tables for reusable values
- Rich HR lifecycle domain coverage

---

## 1. High-Level Domain Groups

The model is organized around these business areas:

1. Platform and tenant management
2. Organization and employee master data
3. Attendance and shifts
4. Leave and overtime
5. Payroll and salary advances
6. Recruitment and probation
7. Discipline, resignation, clearance
8. Compliance, documents, assets
9. Forms, notifications, configuration, logging

---

## 2. Platform and Tenant Entities

### Company

Class:

- `Company`

Purpose:

- Root tenant entity
- Represents an organization using the platform

Common attributes:

- Arabic and English names
- plan information
- activation status
- limits such as employee caps
- contact and registration metadata

Relationships:

- One company has many employees
- One company has many departments
- One company has many users
- One company has many operational records

### CompanySubscription

Class:

- `CompanySubscription`

Purpose:

- Tracks subscription/plan state of tenant

Relationship:

- Many subscriptions or subscription records can point to one company

Configured relation:

- `CompanySubscription -> Company`

### CompanyRegistration

Class:

- `CompanyRegistration`

Purpose:

- Stores public/company signup requests before approval

---

## 3. Organization and Employee Master Data

### Department

Class:

- `Department`

Purpose:

- Organizational department structure

Key relationships:

- Belongs to one `Company`
- Can reference a parent department through `ParentDepartmentId`
- Can be used by employees, holidays, and shift assignments

### JobTitle

Class:

- `JobTitle`

Purpose:

- Job catalog / designation definitions

Key relationships:

- Belongs to one company
- Used by employees

### Employee

Class:

- `Employee`

Purpose:

- Core HR master record

Typical data areas:

- identity and employee code
- Arabic and English names
- gender, date of birth, nationality
- contact details
- address/governorate
- department/job title
- manager reference
- employment status and hire dates
- salary components
- SSC / compliance fields
- work permit / residency / passport / health certificate
- banking details
- profile photo

Relationships:

- belongs to one `Company`
- belongs to one `Department`
- belongs to one `JobTitle`
- may belong to one `Bank`
- may reference another `Employee` as direct manager
- is referenced by most transactional entities

This is the central business entity of the system.

### User

Class:

- `User`

Purpose:

- Login and authorization account

Key characteristics:

- role-based access
- linked optionally to employee
- linked to company
- stores auth/security fields such as password hash and refresh token data

Relationship:

- may map to one employee
- belongs to one company

### Reference Entities

Classes:

- `Bank`
- `Nationality`
- `Governorate`
- `City`

Purpose:

- Shared lookup/reference values

Notable relation:

- `City -> Governorate`

---

## 4. Attendance and Shifts

### AttendanceRecord

Class:

- `AttendanceRecord`

Purpose:

- Stores actual check-in/check-out and derived attendance information

Relationships:

- belongs to one employee
- may reference one shift

### AttendanceRequest

Class:

- `AttendanceRequest`

Purpose:

- Employee requests to correct/adjust attendance entries

Relationship:

- belongs to one employee

### WorkLocation

Class:

- `WorkLocation`

Purpose:

- Approved attendance locations / geofencing-like records

### Shift

Class:

- `Shift`

Purpose:

- Shift template or working schedule definition

### ShiftAssignment

Class:

- `ShiftAssignment`

Purpose:

- Assign shift to employee or department

Relationships:

- belongs to one shift
- may belong to one employee
- may belong to one department

### ShiftRotation

Class:

- `ShiftRotation`

Purpose:

- Rotating shift pattern setup

### ShiftException

Class:

- `ShiftException`

Purpose:

- Date-specific override for an employee’s shift

Relationships:

- belongs to one employee
- may reference one custom shift

---

## 5. Leave Domain

### LeaveType

Class:

- `LeaveType`

Purpose:

- Defines kinds of leave

Examples:

- annual
- sick
- unpaid
- maternity

### LeavePolicy

Class:

- `LeavePolicy`

Purpose:

- Policy settings per leave type

Relationship:

- belongs to one leave type

### LeaveBalance

Class:

- `LeaveBalance`

Purpose:

- Stores per-employee balance state for a leave type and year

Relationships:

- belongs to one employee
- belongs to one leave type

### LeaveRequest

Class:

- `LeaveRequest`

Purpose:

- Actual leave application/request

Relationships:

- belongs to one employee
- belongs to one leave type

---

## 6. Overtime Domain

### OvertimeRequest

Class:

- `OvertimeRequest`

Purpose:

- Employee/manager submitted overtime request

Relationship:

- belongs to one employee

### OvertimeRecord

Class:

- `OvertimeRecord`

Purpose:

- Processed/calculated overtime result

Relationships:

- belongs to one employee
- may reference one shift

### OvertimeRule

Class:

- `OvertimeRule`

Purpose:

- Defines overtime calculation rules and compensation logic

---

## 7. Payroll and Compensation

### PayrollRun

Class:

- `PayrollRun`

Purpose:

- Monthly/period payroll processing batch

Key relation:

- one payroll run has many payslips

### Payslip

Class:

- `Payslip`

Purpose:

- Per-employee payroll result for one run

Key data areas:

- salary components
- deductions
- net salary
- attendance-derived values
- payment status

Relationships:

- belongs to one employee
- belongs to one payroll run

### SalaryAdvance

Class:

- `SalaryAdvance`

Purpose:

- Employee financial advance request

Core fields:

- employee reference
- amount
- reason
- request date
- status
- notes
- approver

Relationship:

- belongs to one employee

Implementation note:

- extra metadata such as repayment method/plan and approved amount is currently serialized into `Notes` JSON in the API layer

---

## 8. Recruitment, Probation, Onboarding

### PreEmploymentRecord

Class:

- `PreEmploymentRecord`

Purpose:

- Tracks candidate/pre-hire onboarding workflow

Relationship:

- may link to employee

### ProbationEvaluation

Class:

- `ProbationEvaluation`

Purpose:

- Stores probation stage evaluations and recommendations

Key content:

- evaluation stage
- multiple category scores
- recommendations
- evaluator comments

---

## 9. Resignation and Exit

### Resignation

Class:

- `Resignation`

Purpose:

- Resignation workflow root record

Relationship:

- belongs to one employee

### ClearanceRecord

Class:

- `ClearanceRecord`

Purpose:

- Clearance checklist / settlement record

Relationship:

- belongs to one employee

### ResignationApproval

Class:

- `ResignationApproval`

Purpose:

- Approval steps attached to resignation

Relationship:

- belongs to one resignation

### ExitInterview

Class:

- `ExitInterview`

Purpose:

- Exit interview data

Relationship:

- belongs to one resignation

---

## 10. Discipline

### ViolationType

Class:

- `ViolationType`

Purpose:

- Lookup of disciplinary violation categories

### DisciplinaryAction

Class:

- `DisciplinaryAction`

Purpose:

- Disciplinary case / action against employee

Relationships:

- belongs to one employee
- belongs to one violation type
- has one investigation

### DisciplinaryInvestigation

Class:

- `DisciplinaryInvestigation`

Purpose:

- Investigation details linked to disciplinary case

Relationship:

- one-to-one with disciplinary action

---

## 11. Documents, Assets, Compliance

### AssetCategory

Class:

- `AssetCategory`

Purpose:

- Asset taxonomy

### Asset

Class:

- `Asset`

Purpose:

- Physical/digital company asset

Relationships:

- belongs to one asset category
- may be assigned to one employee

### DocumentType

Class:

- `DocumentType`

Purpose:

- Type definition for uploaded/stored documents

### Document

Class:

- `Document`

Purpose:

- Employee or company document metadata

Relationships:

- belongs to one employee
- belongs to one document type

### EmployeeComplianceStatus

Class:

- `EmployeeComplianceStatus`

Purpose:

- Stores structured compliance state per employee

Relationship:

- belongs to one employee

---

## 12. Holidays

### PublicHoliday

Class:

- `PublicHoliday`

Purpose:

- Public holiday record

Relationship:

- one holiday can have many department applicability rows

### PublicHolidayDepartment

Class:

- `PublicHolidayDepartment`

Purpose:

- Links holiday to a department

Relationship:

- belongs to one holiday
- belongs to one department

---

## 13. Forms, Notifications, System Data

### FormRecord

Class:

- `FormRecord`

Purpose:

- Stores generated/completed HR form records

### Notification

Class:

- `Notification`

Purpose:

- User/system notifications

### SystemConfiguration

Class:

- `SystemConfiguration`

Purpose:

- Tenant/system config key-value storage

### ActivityLog

Class:

- `ActivityLog`

Purpose:

- Audit/activity trail

Typical usage:

- login tracking
- action history
- entity operation logging

---

## 14. Core Relationship Summary

These are the most important foreign key directions in the system:

- `Department -> Company`
- `JobTitle -> Company`
- `Employee -> Company`
- `Employee -> Department`
- `Employee -> JobTitle`
- `Employee -> Bank`
- `Employee -> Employee (DirectManager)`
- `User -> Employee`
- `User -> Company`

- `AttendanceRecord -> Employee`
- `AttendanceRecord -> Shift`
- `AttendanceRequest -> Employee`

- `LeavePolicy -> LeaveType`
- `LeaveBalance -> Employee`
- `LeaveBalance -> LeaveType`
- `LeaveRequest -> Employee`
- `LeaveRequest -> LeaveType`

- `OvertimeRequest -> Employee`
- `OvertimeRecord -> Employee`
- `OvertimeRecord -> Shift`

- `Payslip -> Employee`
- `Payslip -> PayrollRun`
- `SalaryAdvance -> Employee`

- `PreEmploymentRecord -> Employee`
- `Resignation -> Employee`
- `ClearanceRecord -> Employee`
- `ResignationApproval -> Resignation`
- `ExitInterview -> Resignation`

- `DisciplinaryAction -> Employee`
- `DisciplinaryAction -> ViolationType`
- `DisciplinaryInvestigation -> DisciplinaryAction`

- `Asset -> AssetCategory`
- `Asset -> Employee (AssignedToEmployee)`
- `Document -> Employee`
- `Document -> DocumentType`
- `EmployeeComplianceStatus -> Employee`

- `PublicHolidayDepartment -> PublicHoliday`
- `PublicHolidayDepartment -> Department`

- `ShiftAssignment -> Shift`
- `ShiftAssignment -> Employee`
- `ShiftAssignment -> Department`
- `ShiftException -> Employee`
- `ShiftException -> Shift (CustomShift)`

---

## 15. Delete Behavior Patterns

The model uses a mixture of delete behaviors:

- `Restrict`
  - for most core business master-data links
  - protects historical records

- `Cascade`
  - for child/detail records that should disappear with parent
  - examples:
    - resignation approvals
    - exit interviews
    - some shift-related child records

- `SetNull`
  - used where a nullable reference is acceptable
  - examples:
    - attendance/overtime to shift
    - shift exception to custom shift

This is consistent with an HR system where employee history should generally remain intact.

---

## 16. Tenant Design Pattern

Most operational entities implicitly or explicitly live inside a tenant/company scope.

Common pattern:

- `CompanyId` stored directly on root business entities
- controller/service filters by current tenant
- users and employees are linked back to company

This makes `Company` the logical root partition key of the application.

---

## 17. Important Modeling Notes

1. `Employee` is the central business anchor.
2. `User` is the security/account anchor.
3. `Company` is the tenant anchor.
4. Many HR transactional records depend on `Employee`.
5. The current implementation emits EF warnings because `Employee` and some other parents use global query filters while still being required on relationships.

This warning does not mean the schema is broken, but it does mean filtered parents can produce surprising query behavior.

---

## 18. Recommended Follow-Up Schema Documentation

If you want a deeper level after this file, the next useful docs would be:

- exact field-by-field table catalog
- ER diagram
- index and uniqueness catalog
- audit trail matrix
- tenant-key coverage audit
