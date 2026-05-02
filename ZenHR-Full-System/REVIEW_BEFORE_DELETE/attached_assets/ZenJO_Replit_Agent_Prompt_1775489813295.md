# 🚀 ZenJO — Jordanian HRMS System
## Replit Agent Master Prompt — Ultra Detailed

---

> **Copy everything below this line and paste it directly into Replit Agent.**

---

## ═══════════════════════════════════════════════════
## REPLIT AGENT PROMPT — START
## ═══════════════════════════════════════════════════

```
Build a complete, production-ready Human Resources Management System (HRMS) called "ZenJO"
fully compliant with Jordanian Labor Law No. 8 of 1996 and Social Security Corporation (SSC) regulations.

This is a REAL enterprise system — not a demo. Build it with production-quality code, 
proper architecture, security, and all business logic implemented correctly.

═══════════════════════════════════════════════════════════════
TECH STACK — MANDATORY, DO NOT CHANGE
═══════════════════════════════════════════════════════════════

Backend:
  - .NET 9 Web API (ASP.NET Core 9)
  - C# with clean architecture (Controller → Service → Repository → Entity)
  - Entity Framework Core 9 with MySQL provider (Pomelo.EntityFrameworkCore.MySql)
  - JWT Authentication (System.IdentityModel.Tokens.Jwt)
  - AutoMapper for DTO mapping
  - FluentValidation for input validation
  - Serilog for structured logging
  - Swagger/OpenAPI documentation
  - BCrypt for password hashing

Frontend:
  - Angular 18+ (standalone components)
  - Angular Material UI
  - RxJS for reactive state
  - Angular Reactive Forms
  - Chart.js via ng2-charts for dashboards
  - ngx-translate for Arabic/English i18n
  - date-fns for date calculations

Database:
  - MySQL 8.0+
  - All tables with Arabic-friendly utf8mb4_unicode_ci collation
  - Proper indexes on all foreign keys and search columns
  - Soft delete pattern (IsDeleted, DeletedAt) on all tables

API:
  - RESTful API design
  - Versioned API: /api/v1/...
  - Standard response wrapper: { success, data, message, errors, pagination }
  - Global exception handling middleware
  - Request/Response logging middleware

═══════════════════════════════════════════════════════════════
PROJECT STRUCTURE
═══════════════════════════════════════════════════════════════

/ZenJO
├── /backend
│   ├── ZenJO.API               (ASP.NET Core Web API)
│   │   ├── Controllers/
│   │   ├── Middleware/
│   │   └── Program.cs
│   ├── ZenJO.Application       (Business Logic / Services)
│   │   ├── Services/
│   │   ├── DTOs/
│   │   ├── Validators/
│   │   └── Mappings/
│   ├── ZenJO.Domain            (Entities / Business Rules)
│   │   ├── Entities/
│   │   ├── Enums/
│   │   └── Interfaces/
│   └── ZenJO.Infrastructure    (EF Core / Repositories / MySQL)
│       ├── Data/
│       ├── Repositories/
│       └── Migrations/
└── /frontend
    └── zenjo-ui                (Angular 18 App)
        ├── src/app/
        │   ├── core/           (guards, interceptors, services)
        │   ├── shared/         (components, pipes, directives)
        │   ├── features/       (each module = one feature folder)
        │   └── layouts/        (main-layout, auth-layout)
        └── src/assets/
            └── i18n/           (ar.json, en.json)

═══════════════════════════════════════════════════════════════
DATABASE SCHEMA — ALL TABLES (MySQL)
═══════════════════════════════════════════════════════════════

ALL tables must have these base columns:
  Id INT AUTO_INCREMENT PRIMARY KEY,
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT,
  UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0,
  DeletedAt DATETIME NULL

--- TABLE 1: Companies ---
CREATE TABLE Companies (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  NameAr VARCHAR(200) NOT NULL COMMENT 'اسم الشركة بالعربي',
  NameEn VARCHAR(200) NOT NULL,
  CommercialRegNo VARCHAR(50) UNIQUE,
  TaxNumber VARCHAR(50),
  SSCNumber VARCHAR(50) COMMENT 'رقم مؤسسة الضمان الاجتماعي',
  LaborMinistryNo VARCHAR(50) COMMENT 'رقم وزارة العمل',
  AddressAr TEXT,
  AddressEn TEXT,
  City VARCHAR(100),
  Phone VARCHAR(20),
  Email VARCHAR(150),
  Website VARCHAR(200),
  Logo VARCHAR(500),
  IndustryType ENUM('technology','manufacturing','retail','healthcare','education','government','finance','hospitality','other'),
  EmployeeCount INT DEFAULT 0,
  FiscalYearStart TINYINT DEFAULT 1 COMMENT '1=January',
  WorkWeekStart TINYINT DEFAULT 1 COMMENT '1=Sunday (Jordan standard)',
  WorkWeekEnd TINYINT DEFAULT 5 COMMENT '5=Thursday',
  Currency VARCHAR(10) DEFAULT 'JOD',
  IsActive TINYINT(1) DEFAULT 1,
  -- base columns
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT,
  UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0,
  DeletedAt DATETIME NULL
);

--- TABLE 2: Departments ---
CREATE TABLE Departments (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  CompanyId INT NOT NULL,
  NameAr VARCHAR(200) NOT NULL,
  NameEn VARCHAR(200) NOT NULL,
  Code VARCHAR(20),
  ParentDepartmentId INT NULL COMMENT 'For sub-departments',
  ManagerEmployeeId INT NULL,
  CostCenterCode VARCHAR(50),
  IsActive TINYINT(1) DEFAULT 1,
  -- base columns
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (CompanyId) REFERENCES Companies(Id),
  FOREIGN KEY (ParentDepartmentId) REFERENCES Departments(Id)
);

--- TABLE 3: JobTitles ---
CREATE TABLE JobTitles (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  CompanyId INT NOT NULL,
  TitleAr VARCHAR(200) NOT NULL,
  TitleEn VARCHAR(200) NOT NULL,
  JobGrade VARCHAR(10) COMMENT 'A1, A2, B1, etc.',
  MinSalary DECIMAL(12,3),
  MaxSalary DECIMAL(12,3),
  IsActive TINYINT(1) DEFAULT 1,
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (CompanyId) REFERENCES Companies(Id)
);

--- TABLE 4: Employees (CORE TABLE) ---
CREATE TABLE Employees (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  CompanyId INT NOT NULL,
  EmployeeCode VARCHAR(30) UNIQUE NOT NULL COMMENT 'Auto-generated: EMP-0001',
  
  -- Personal Info
  FirstNameAr VARCHAR(100) NOT NULL,
  MiddleNameAr VARCHAR(100),
  LastNameAr VARCHAR(100) NOT NULL,
  FirstNameEn VARCHAR(100) NOT NULL,
  MiddleNameEn VARCHAR(100),
  LastNameEn VARCHAR(100) NOT NULL,
  FullNameAr VARCHAR(300) GENERATED ALWAYS AS (CONCAT(FirstNameAr,' ',IFNULL(MiddleNameAr,''),' ',LastNameAr)) STORED,
  FullNameEn VARCHAR(300) GENERATED ALWAYS AS (CONCAT(FirstNameEn,' ',IFNULL(MiddleNameEn,''),' ',LastNameEn)) STORED,
  
  Gender ENUM('male','female') NOT NULL,
  DateOfBirth DATE NOT NULL,
  NationalId VARCHAR(20) UNIQUE COMMENT 'الرقم الوطني الأردني',
  Nationality VARCHAR(100) DEFAULT 'أردني',
  Religion ENUM('muslim','christian','other'),
  MaritalStatus ENUM('single','married','divorced','widowed'),
  NumberOfDependents TINYINT DEFAULT 0,
  
  -- Contact
  PersonalEmail VARCHAR(150),
  WorkEmail VARCHAR(150) UNIQUE,
  PersonalPhone VARCHAR(20),
  WorkPhone VARCHAR(20),
  EmergencyContactName VARCHAR(200),
  EmergencyContactPhone VARCHAR(20),
  EmergencyContactRelation VARCHAR(100),
  
  -- Address
  AddressAr TEXT,
  City VARCHAR(100),
  
  -- Employment Info
  DepartmentId INT,
  JobTitleId INT,
  DirectManagerId INT NULL,
  EmploymentType ENUM('fulltime','parttime','contract','probation') DEFAULT 'fulltime',
  HireDate DATE NOT NULL,
  ProbationEndDate DATE,
  ContractType ENUM('permanent','fixed') DEFAULT 'permanent',
  ContractEndDate DATE NULL,
  EmploymentStatus ENUM('active','suspended','terminated','resigned','retired') DEFAULT 'active',
  TerminationDate DATE NULL,
  TerminationReason TEXT NULL,
  
  -- Salary
  BasicSalary DECIMAL(12,3) NOT NULL,
  HousingAllowance DECIMAL(12,3) DEFAULT 0,
  TransportAllowance DECIMAL(12,3) DEFAULT 0,
  MobileAllowance DECIMAL(12,3) DEFAULT 0,
  MealAllowance DECIMAL(12,3) DEFAULT 0,
  OtherAllowances DECIMAL(12,3) DEFAULT 0,
  TotalSalary DECIMAL(12,3) GENERATED ALWAYS AS (BasicSalary + HousingAllowance + TransportAllowance + MobileAllowance + MealAllowance + OtherAllowances) STORED,
  
  -- Social Security (Jordanian SSC)
  SSCNumber VARCHAR(20) COMMENT 'رقم الضمان الاجتماعي',
  SSCEnrollmentDate DATE,
  IsSSCExempt TINYINT(1) DEFAULT 0,
  
  -- Tax
  IncomeTaxNumber VARCHAR(30),
  TaxExemptionAmount DECIMAL(12,3) DEFAULT 0,
  
  -- Bank Info
  BankName VARCHAR(200),
  BankAccountNumber VARCHAR(50),
  IBAN VARCHAR(34),
  
  -- Document Info
  PassportNumber VARCHAR(30),
  PassportExpiry DATE,
  WorkPermitNumber VARCHAR(30),
  WorkPermitExpiry DATE,
  ResidencyNumber VARCHAR(30),
  ResidencyExpiry DATE,
  
  -- System
  UserId INT NULL COMMENT 'Link to Users table for login',
  ProfilePhoto VARCHAR(500),
  Notes TEXT,
  
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  
  FOREIGN KEY (CompanyId) REFERENCES Companies(Id),
  FOREIGN KEY (DepartmentId) REFERENCES Departments(Id),
  FOREIGN KEY (JobTitleId) REFERENCES JobTitles(Id),
  FOREIGN KEY (DirectManagerId) REFERENCES Employees(Id),
  
  INDEX idx_company (CompanyId),
  INDEX idx_department (DepartmentId),
  INDEX idx_status (EmploymentStatus),
  INDEX idx_national_id (NationalId)
);

--- TABLE 5: Users (Authentication) ---
CREATE TABLE Users (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  EmployeeId INT NULL,
  CompanyId INT NOT NULL,
  Username VARCHAR(100) UNIQUE NOT NULL,
  PasswordHash VARCHAR(255) NOT NULL,
  Email VARCHAR(150) UNIQUE NOT NULL,
  Role ENUM('superadmin','hradmin','payrolladmin','manager','employee','recruiter') NOT NULL,
  IsActive TINYINT(1) DEFAULT 1,
  LastLoginAt DATETIME,
  PasswordChangedAt DATETIME,
  MustChangePassword TINYINT(1) DEFAULT 0,
  RefreshToken VARCHAR(500),
  RefreshTokenExpiry DATETIME,
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (EmployeeId) REFERENCES Employees(Id),
  FOREIGN KEY (CompanyId) REFERENCES Companies(Id)
);

--- TABLE 6: LeavePolicies ---
CREATE TABLE LeavePolicies (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  CompanyId INT NOT NULL,
  LeaveType ENUM('annual','sick','maternity','paternity','unpaid','emergency','hajj','study','death') NOT NULL,
  NameAr VARCHAR(100) NOT NULL,
  NameEn VARCHAR(100) NOT NULL,
  DaysPerYear DECIMAL(5,2) NOT NULL,
  MaxCarryForwardDays DECIMAL(5,2) DEFAULT 0,
  MinServiceMonths TINYINT DEFAULT 0 COMMENT 'Min months to be eligible',
  RequiresMedicalCertificate TINYINT(1) DEFAULT 0,
  IsPaid TINYINT(1) DEFAULT 1,
  CanBeNegative TINYINT(1) DEFAULT 0,
  Gender ENUM('all','male','female') DEFAULT 'all',
  IsActive TINYINT(1) DEFAULT 1,
  Notes TEXT,
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (CompanyId) REFERENCES Companies(Id)
);

--- TABLE 7: EmployeeLeaveBalances ---
CREATE TABLE EmployeeLeaveBalances (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  EmployeeId INT NOT NULL,
  LeavePolicyId INT NOT NULL,
  Year YEAR NOT NULL,
  EntitledDays DECIMAL(5,2) DEFAULT 0,
  UsedDays DECIMAL(5,2) DEFAULT 0,
  PendingDays DECIMAL(5,2) DEFAULT 0,
  CarriedForwardDays DECIMAL(5,2) DEFAULT 0,
  RemainingDays DECIMAL(5,2) GENERATED ALWAYS AS (EntitledDays + CarriedForwardDays - UsedDays - PendingDays) STORED,
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (EmployeeId) REFERENCES Employees(Id),
  FOREIGN KEY (LeavePolicyId) REFERENCES LeavePolicies(Id),
  UNIQUE KEY uq_emp_policy_year (EmployeeId, LeavePolicyId, Year)
);

--- TABLE 8: LeaveRequests ---
CREATE TABLE LeaveRequests (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  EmployeeId INT NOT NULL,
  LeavePolicyId INT NOT NULL,
  RequestDate DATE NOT NULL,
  StartDate DATE NOT NULL,
  EndDate DATE NOT NULL,
  TotalDays DECIMAL(5,2) NOT NULL,
  Reason TEXT,
  AttachmentPath VARCHAR(500),
  Status ENUM('pending','approved','rejected','cancelled') DEFAULT 'pending',
  ApproverId INT NULL,
  ApproverComment TEXT,
  ApprovedAt DATETIME,
  CancelReason TEXT,
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (EmployeeId) REFERENCES Employees(Id),
  FOREIGN KEY (LeavePolicyId) REFERENCES LeavePolicies(Id),
  FOREIGN KEY (ApproverId) REFERENCES Employees(Id),
  INDEX idx_employee_status (EmployeeId, Status),
  INDEX idx_dates (StartDate, EndDate)
);

--- TABLE 9: Shifts ---
CREATE TABLE Shifts (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  CompanyId INT NOT NULL,
  NameAr VARCHAR(100) NOT NULL,
  NameEn VARCHAR(100) NOT NULL,
  ShiftType ENUM('fixed','flexible','roster','overnight') DEFAULT 'fixed',
  StartTime TIME NOT NULL,
  EndTime TIME NOT NULL,
  BreakMinutes TINYINT DEFAULT 60,
  GraceMinutesLate TINYINT DEFAULT 15 COMMENT 'Minutes grace before marking late',
  GraceMinutesEarly TINYINT DEFAULT 15 COMMENT 'Minutes grace for early checkout',
  WorkingHours DECIMAL(4,2),
  IsNightShift TINYINT(1) DEFAULT 0,
  SundayWork TINYINT(1) DEFAULT 1,
  MondayWork TINYINT(1) DEFAULT 1,
  TuesdayWork TINYINT(1) DEFAULT 1,
  WednesdayWork TINYINT(1) DEFAULT 1,
  ThursdayWork TINYINT(1) DEFAULT 1,
  FridayWork TINYINT(1) DEFAULT 0,
  SaturdayWork TINYINT(1) DEFAULT 0,
  IsActive TINYINT(1) DEFAULT 1,
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (CompanyId) REFERENCES Companies(Id)
);

--- TABLE 10: EmployeeShifts ---
CREATE TABLE EmployeeShifts (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  EmployeeId INT NOT NULL,
  ShiftId INT NOT NULL,
  EffectiveFrom DATE NOT NULL,
  EffectiveTo DATE NULL,
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (EmployeeId) REFERENCES Employees(Id),
  FOREIGN KEY (ShiftId) REFERENCES Shifts(Id)
);

--- TABLE 11: Attendance ---
CREATE TABLE Attendance (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  EmployeeId INT NOT NULL,
  AttendanceDate DATE NOT NULL,
  CheckInTime DATETIME,
  CheckOutTime DATETIME,
  CheckInMethod ENUM('mobile','qr','biometric','web','manual') DEFAULT 'mobile',
  CheckOutMethod ENUM('mobile','qr','biometric','web','manual'),
  CheckInLatitude DECIMAL(10,8),
  CheckInLongitude DECIMAL(11,8),
  CheckOutLatitude DECIMAL(10,8),
  CheckOutLongitude DECIMAL(11,8),
  WorkedMinutes INT DEFAULT 0,
  LateMinutes INT DEFAULT 0 COMMENT 'Minutes late from shift start',
  EarlyLeaveMinutes INT DEFAULT 0,
  OvertimeMinutes INT DEFAULT 0,
  Status ENUM('present','absent','late','half_day','on_leave','holiday','weekend') DEFAULT 'present',
  IsManualEntry TINYINT(1) DEFAULT 0,
  ManualEntryReason TEXT,
  ApprovedBy INT NULL,
  Notes TEXT,
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (EmployeeId) REFERENCES Employees(Id),
  UNIQUE KEY uq_emp_date (EmployeeId, AttendanceDate),
  INDEX idx_date (AttendanceDate),
  INDEX idx_status (Status)
);

--- TABLE 12: OvertimeRequests ---
CREATE TABLE OvertimeRequests (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  EmployeeId INT NOT NULL,
  AttendanceId INT NULL,
  OvertimeDate DATE NOT NULL,
  StartTime TIME NOT NULL,
  EndTime TIME NOT NULL,
  TotalMinutes INT NOT NULL,
  OvertimeType ENUM('weekday','weekend','holiday') DEFAULT 'weekday',
  CompensationType ENUM('cash','leave') DEFAULT 'cash',
  Reason TEXT,
  Status ENUM('pending','approved','rejected') DEFAULT 'pending',
  ApproverId INT NULL,
  ApproverComment TEXT,
  ApprovedAt DATETIME,
  -- Jordanian Law: weekday=1.25x, weekend/holiday=1.5x
  MultiplierRate DECIMAL(4,2) DEFAULT 1.25,
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (EmployeeId) REFERENCES Employees(Id),
  FOREIGN KEY (ApproverId) REFERENCES Employees(Id)
);

--- TABLE 13: PublicHolidays ---
CREATE TABLE PublicHolidays (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  CompanyId INT NOT NULL,
  NameAr VARCHAR(200) NOT NULL,
  NameEn VARCHAR(200) NOT NULL,
  HolidayDate DATE NOT NULL,
  Year YEAR NOT NULL,
  Type ENUM('national','religious','company') DEFAULT 'national',
  IsRecurring TINYINT(1) DEFAULT 0,
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (CompanyId) REFERENCES Companies(Id)
);

--- TABLE 14: PayrollRules (Jordan-specific) ---
CREATE TABLE PayrollRules (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  CompanyId INT NOT NULL,
  Year YEAR NOT NULL,
  
  -- Social Security Corporation (SSC) - Jordan
  -- Employee contribution: 7.5% of basic salary
  -- Employer contribution: 14.25% of basic salary
  -- Total: 21.75%
  SSCEmployeeRate DECIMAL(5,4) DEFAULT 0.0750 COMMENT '7.5% employee',
  SSCEmployerRate DECIMAL(5,4) DEFAULT 0.1425 COMMENT '14.25% employer',
  SSCMinSalary DECIMAL(12,3) DEFAULT 230 COMMENT 'Min salary for SSC (JOD)',
  SSCMaxSalary DECIMAL(12,3) DEFAULT 3416 COMMENT 'Max ceiling for SSC (JOD)',
  
  -- Income Tax - Jordan (progressive rates per ISTD)
  -- 0 - 5,000 JOD: 5%
  -- 5,001 - 10,000 JOD: 10%
  -- 10,001 - 20,000 JOD: 15%
  -- 20,001 - 1,000,000 JOD: 20%
  -- > 1,000,000 JOD: 25% (solidarity tax for high income)
  TaxBracket1Limit DECIMAL(12,3) DEFAULT 5000,
  TaxBracket1Rate DECIMAL(5,4) DEFAULT 0.05,
  TaxBracket2Limit DECIMAL(12,3) DEFAULT 10000,
  TaxBracket2Rate DECIMAL(5,4) DEFAULT 0.10,
  TaxBracket3Limit DECIMAL(12,3) DEFAULT 20000,
  TaxBracket3Rate DECIMAL(5,4) DEFAULT 0.15,
  TaxBracket4Limit DECIMAL(12,3) DEFAULT 1000000,
  TaxBracket4Rate DECIMAL(5,4) DEFAULT 0.20,
  TaxBracket5Rate DECIMAL(5,4) DEFAULT 0.25,
  
  -- Personal Exemption
  PersonalExemptionSingle DECIMAL(12,3) DEFAULT 9000 COMMENT 'JOD per year',
  PersonalExemptionMarried DECIMAL(12,3) DEFAULT 18000 COMMENT 'JOD per year',
  DependentExemption DECIMAL(12,3) DEFAULT 1000 COMMENT 'Per dependent per year',
  
  -- Overtime Rates (Jordanian Labor Law)
  OvertimeWeekdayRate DECIMAL(4,2) DEFAULT 1.25 COMMENT '125% for weekday overtime',
  OvertimeWeekendRate DECIMAL(4,2) DEFAULT 1.50 COMMENT '150% for weekend/holiday',
  
  -- Working Hours (Jordan: max 48 hrs/week, 8 hrs/day)
  MaxDailyHours TINYINT DEFAULT 8,
  MaxWeeklyHours TINYINT DEFAULT 48,
  
  -- Late deduction
  LateDeductionEnabled TINYINT(1) DEFAULT 1,
  LateDeductionMinutes TINYINT DEFAULT 30 COMMENT 'Deduct if late more than X min',
  
  IsActive TINYINT(1) DEFAULT 1,
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (CompanyId) REFERENCES Companies(Id),
  UNIQUE KEY uq_company_year (CompanyId, Year)
);

--- TABLE 15: EmployeeLoans ---
CREATE TABLE EmployeeLoans (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  EmployeeId INT NOT NULL,
  LoanAmount DECIMAL(12,3) NOT NULL,
  RequestDate DATE NOT NULL,
  ApprovedDate DATE,
  DisbursedDate DATE,
  NumberOfInstallments TINYINT NOT NULL,
  InstallmentAmount DECIMAL(12,3) NOT NULL,
  PaidInstallments TINYINT DEFAULT 0,
  RemainingAmount DECIMAL(12,3),
  Reason TEXT,
  Status ENUM('pending','approved','rejected','active','completed','cancelled') DEFAULT 'pending',
  ApproverId INT NULL,
  Notes TEXT,
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (EmployeeId) REFERENCES Employees(Id)
);

--- TABLE 16: PayrollRuns ---
CREATE TABLE PayrollRuns (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  CompanyId INT NOT NULL,
  PayrollMonth TINYINT NOT NULL COMMENT '1-12',
  PayrollYear YEAR NOT NULL,
  Status ENUM('draft','review','approved','finalized','cancelled') DEFAULT 'draft',
  ProcessedAt DATETIME,
  ApprovedAt DATETIME,
  FinalizedAt DATETIME,
  ApprovedBy INT NULL,
  FinalizedBy INT NULL,
  TotalGrossSalary DECIMAL(15,3) DEFAULT 0,
  TotalNetSalary DECIMAL(15,3) DEFAULT 0,
  TotalSSCEmployee DECIMAL(15,3) DEFAULT 0,
  TotalSSCEmployer DECIMAL(15,3) DEFAULT 0,
  TotalIncomeTax DECIMAL(15,3) DEFAULT 0,
  TotalDeductions DECIMAL(15,3) DEFAULT 0,
  TotalAllowances DECIMAL(15,3) DEFAULT 0,
  EmployeeCount INT DEFAULT 0,
  Notes TEXT,
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (CompanyId) REFERENCES Companies(Id),
  UNIQUE KEY uq_company_month_year (CompanyId, PayrollMonth, PayrollYear)
);

--- TABLE 17: PayrollDetails (Per Employee Per Month) ---
CREATE TABLE PayrollDetails (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  PayrollRunId INT NOT NULL,
  EmployeeId INT NOT NULL,
  
  -- Earnings
  BasicSalary DECIMAL(12,3) NOT NULL,
  HousingAllowance DECIMAL(12,3) DEFAULT 0,
  TransportAllowance DECIMAL(12,3) DEFAULT 0,
  MobileAllowance DECIMAL(12,3) DEFAULT 0,
  MealAllowance DECIMAL(12,3) DEFAULT 0,
  OtherAllowances DECIMAL(12,3) DEFAULT 0,
  OvertimePay DECIMAL(12,3) DEFAULT 0,
  OvertimeHours DECIMAL(5,2) DEFAULT 0,
  Bonus DECIMAL(12,3) DEFAULT 0,
  GrossEarnings DECIMAL(12,3) NOT NULL,
  
  -- Deductions
  SSCEmployeeDeduction DECIMAL(12,3) DEFAULT 0 COMMENT '7.5% of basic',
  IncomeTaxDeduction DECIMAL(12,3) DEFAULT 0,
  LoanDeduction DECIMAL(12,3) DEFAULT 0,
  AbsenceDeduction DECIMAL(12,3) DEFAULT 0,
  LateDeduction DECIMAL(12,3) DEFAULT 0,
  AdvanceDeduction DECIMAL(12,3) DEFAULT 0,
  OtherDeductions DECIMAL(12,3) DEFAULT 0,
  TotalDeductions DECIMAL(12,3) NOT NULL,
  
  -- Employer Cost
  SSCEmployerContribution DECIMAL(12,3) DEFAULT 0 COMMENT '14.25% of basic',
  
  -- Net
  NetSalary DECIMAL(12,3) NOT NULL,
  
  -- Attendance Summary
  WorkingDaysInMonth TINYINT,
  ActualWorkingDays TINYINT,
  AbsentDays DECIMAL(5,2) DEFAULT 0,
  LateDays TINYINT DEFAULT 0,
  LeaveDaysUsed DECIMAL(5,2) DEFAULT 0,
  
  -- Tax Calculation Details (stored for audit)
  AnnualGrossSalary DECIMAL(12,3),
  PersonalExemption DECIMAL(12,3),
  TaxableIncome DECIMAL(12,3),
  MonthlyIncomeTax DECIMAL(12,3),
  
  PaymentStatus ENUM('pending','paid','failed') DEFAULT 'pending',
  PaymentDate DATE,
  Notes TEXT,
  
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (PayrollRunId) REFERENCES PayrollRuns(Id),
  FOREIGN KEY (EmployeeId) REFERENCES Employees(Id),
  UNIQUE KEY uq_run_employee (PayrollRunId, EmployeeId)
);

--- TABLE 18: PerformanceCycles ---
CREATE TABLE PerformanceCycles (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  CompanyId INT NOT NULL,
  NameAr VARCHAR(200) NOT NULL,
  NameEn VARCHAR(200) NOT NULL,
  CycleType ENUM('annual','semi_annual','quarterly','probation') DEFAULT 'annual',
  StartDate DATE NOT NULL,
  EndDate DATE NOT NULL,
  SelfReviewDeadline DATE,
  ManagerReviewDeadline DATE,
  Status ENUM('draft','active','self_review','manager_review','calibration','closed') DEFAULT 'draft',
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (CompanyId) REFERENCES Companies(Id)
);

--- TABLE 19: PerformanceGoals ---
CREATE TABLE PerformanceGoals (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  CycleId INT NOT NULL,
  EmployeeId INT NOT NULL,
  GoalAr TEXT NOT NULL,
  GoalEn TEXT,
  KPI VARCHAR(500),
  TargetValue VARCHAR(200),
  ActualValue VARCHAR(200),
  Weight DECIMAL(5,2) DEFAULT 100 COMMENT 'Percentage weight of goal',
  Status ENUM('not_started','in_progress','achieved','not_achieved') DEFAULT 'not_started',
  SetBy INT COMMENT 'EmployeeId who set the goal',
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (CycleId) REFERENCES PerformanceCycles(Id),
  FOREIGN KEY (EmployeeId) REFERENCES Employees(Id)
);

--- TABLE 20: PerformanceReviews ---
CREATE TABLE PerformanceReviews (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  CycleId INT NOT NULL,
  EmployeeId INT NOT NULL,
  ReviewerId INT NOT NULL COMMENT 'Manager doing the review',
  
  -- Self Assessment
  SelfRating DECIMAL(3,1),
  SelfComments TEXT,
  SelfSubmittedAt DATETIME,
  
  -- Manager Assessment
  ManagerRating DECIMAL(3,1),
  ManagerComments TEXT,
  StrengthsComment TEXT,
  ImprovementAreasComment TEXT,
  ManagerSubmittedAt DATETIME,
  
  -- Final
  FinalRating DECIMAL(3,1),
  RatingLabel ENUM('outstanding','exceeds_expectations','meets_expectations','needs_improvement','unsatisfactory'),
  OverallComments TEXT,
  DevelopmentPlan TEXT,
  
  Status ENUM('pending_self','pending_manager','completed','acknowledged') DEFAULT 'pending_self',
  EmployeeAcknowledgedAt DATETIME,
  
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (CycleId) REFERENCES PerformanceCycles(Id),
  FOREIGN KEY (EmployeeId) REFERENCES Employees(Id),
  FOREIGN KEY (ReviewerId) REFERENCES Employees(Id),
  UNIQUE KEY uq_cycle_employee (CycleId, EmployeeId)
);

--- TABLE 21: Vacancies ---
CREATE TABLE Vacancies (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  CompanyId INT NOT NULL,
  DepartmentId INT,
  JobTitleId INT,
  TitleAr VARCHAR(200) NOT NULL,
  TitleEn VARCHAR(200) NOT NULL,
  DescriptionAr TEXT,
  DescriptionEn TEXT,
  RequirementsAr TEXT,
  RequirementsEn TEXT,
  RequiredCount TINYINT DEFAULT 1,
  EmploymentType ENUM('fulltime','parttime','contract') DEFAULT 'fulltime',
  SalaryMin DECIMAL(12,3),
  SalaryMax DECIMAL(12,3),
  SalaryVisible TINYINT(1) DEFAULT 0,
  City VARCHAR(100),
  ExperienceYearsMin TINYINT DEFAULT 0,
  ExperienceYearsMax TINYINT,
  EducationLevel ENUM('highschool','diploma','bachelor','master','phd','any') DEFAULT 'bachelor',
  PostingDate DATE,
  ClosingDate DATE,
  Status ENUM('draft','active','paused','closed','cancelled') DEFAULT 'draft',
  FilledCount TINYINT DEFAULT 0,
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (CompanyId) REFERENCES Companies(Id),
  FOREIGN KEY (DepartmentId) REFERENCES Departments(Id)
);

--- TABLE 22: Candidates ---
CREATE TABLE Candidates (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  CompanyId INT NOT NULL,
  FirstNameAr VARCHAR(100),
  LastNameAr VARCHAR(100),
  FirstNameEn VARCHAR(100) NOT NULL,
  LastNameEn VARCHAR(100) NOT NULL,
  Email VARCHAR(150) UNIQUE NOT NULL,
  Phone VARCHAR(20),
  CurrentJobTitle VARCHAR(200),
  CurrentCompany VARCHAR(200),
  TotalExperienceYears DECIMAL(4,1),
  EducationLevel ENUM('highschool','diploma','bachelor','master','phd'),
  CVPath VARCHAR(500),
  LinkedInUrl VARCHAR(500),
  Source ENUM('website','linkedin','referral','agency','walk_in','other') DEFAULT 'website',
  Skills TEXT COMMENT 'JSON array of skills',
  Notes TEXT,
  BlacklistReason TEXT,
  IsBlacklisted TINYINT(1) DEFAULT 0,
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (CompanyId) REFERENCES Companies(Id)
);

--- TABLE 23: JobApplications ---
CREATE TABLE JobApplications (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  VacancyId INT NOT NULL,
  CandidateId INT NOT NULL,
  ApplicationDate DATE NOT NULL DEFAULT (CURDATE()),
  CurrentStage ENUM('applied','screening','phone_interview','technical_interview','hr_interview','final_interview','offer','hired','rejected','withdrawn') DEFAULT 'applied',
  OverallScore DECIMAL(4,2),
  AssignedRecruiterEmployeeId INT,
  Notes TEXT,
  RejectionReason TEXT,
  OfferDate DATE,
  OfferSalary DECIMAL(12,3),
  OfferAccepted TINYINT(1),
  HiredDate DATE,
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (VacancyId) REFERENCES Vacancies(Id),
  FOREIGN KEY (CandidateId) REFERENCES Candidates(Id),
  UNIQUE KEY uq_vacancy_candidate (VacancyId, CandidateId)
);

--- TABLE 24: Interviews ---
CREATE TABLE Interviews (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  ApplicationId INT NOT NULL,
  InterviewType ENUM('phone','video','in_person','technical','panel') DEFAULT 'in_person',
  ScheduledAt DATETIME NOT NULL,
  DurationMinutes TINYINT DEFAULT 60,
  Location VARCHAR(300),
  MeetingLink VARCHAR(500),
  InterviewerEmployeeId INT NOT NULL,
  Status ENUM('scheduled','completed','cancelled','no_show') DEFAULT 'scheduled',
  OverallRating DECIMAL(3,1),
  TechnicalRating DECIMAL(3,1),
  CommunicationRating DECIMAL(3,1),
  AttitudeRating DECIMAL(3,1),
  Feedback TEXT,
  Recommendation ENUM('strongly_recommend','recommend','neutral','not_recommend','strongly_not_recommend'),
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (ApplicationId) REFERENCES JobApplications(Id),
  FOREIGN KEY (InterviewerEmployeeId) REFERENCES Employees(Id)
);

--- TABLE 25: EmployeeDocuments ---
CREATE TABLE EmployeeDocuments (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  EmployeeId INT NOT NULL,
  DocumentType ENUM('national_id','passport','work_permit','residency','contract','certificate','other') NOT NULL,
  DocumentNameAr VARCHAR(200),
  DocumentNameEn VARCHAR(200),
  DocumentNumber VARCHAR(100),
  IssuedDate DATE,
  ExpiryDate DATE,
  IssuedBy VARCHAR(200),
  FilePath VARCHAR(500),
  AlertDaysBefore TINYINT DEFAULT 30 COMMENT 'Days before expiry to alert',
  IsVerified TINYINT(1) DEFAULT 0,
  VerifiedBy INT NULL,
  Notes TEXT,
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (EmployeeId) REFERENCES Employees(Id),
  INDEX idx_expiry (ExpiryDate)
);

--- TABLE 26: Notifications ---
CREATE TABLE Notifications (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  CompanyId INT NOT NULL,
  UserId INT NOT NULL COMMENT 'Target user',
  TitleAr VARCHAR(300),
  TitleEn VARCHAR(300),
  MessageAr TEXT,
  MessageEn TEXT,
  Type ENUM('leave_request','leave_approved','leave_rejected','payroll','attendance','document_expiry','performance','overtime','system') NOT NULL,
  ReferenceId INT COMMENT 'ID of related record',
  ReferenceType VARCHAR(50),
  IsRead TINYINT(1) DEFAULT 0,
  ReadAt DATETIME,
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (UserId) REFERENCES Users(Id),
  INDEX idx_user_read (UserId, IsRead)
);

--- TABLE 27: AuditLogs ---
CREATE TABLE AuditLogs (
  Id BIGINT AUTO_INCREMENT PRIMARY KEY,
  CompanyId INT,
  UserId INT,
  Action VARCHAR(100) NOT NULL COMMENT 'CREATE, UPDATE, DELETE, LOGIN, etc.',
  EntityName VARCHAR(100) NOT NULL COMMENT 'Table/Entity name',
  EntityId INT,
  OldValues JSON,
  NewValues JSON,
  IPAddress VARCHAR(45),
  UserAgent VARCHAR(500),
  CreatedAt DATETIME DEFAULT NOW(),
  INDEX idx_entity (EntityName, EntityId),
  INDEX idx_user (UserId),
  INDEX idx_created (CreatedAt)
);

--- TABLE 28: SSCMonthlyReports ---
CREATE TABLE SSCMonthlyReports (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  CompanyId INT NOT NULL,
  ReportMonth TINYINT NOT NULL,
  ReportYear YEAR NOT NULL,
  PayrollRunId INT,
  TotalEmployees INT,
  TotalEmployeeContributions DECIMAL(15,3),
  TotalEmployerContributions DECIMAL(15,3),
  TotalContributions DECIMAL(15,3),
  SubmissionDeadline DATE,
  SubmittedAt DATETIME,
  SubmissionReference VARCHAR(100),
  Status ENUM('pending','submitted','accepted','rejected') DEFAULT 'pending',
  ReportFileUrl VARCHAR(500),
  Notes TEXT,
  CreatedAt DATETIME DEFAULT NOW(),
  UpdatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  CreatedBy INT, UpdatedBy INT,
  IsDeleted TINYINT(1) DEFAULT 0, DeletedAt DATETIME NULL,
  FOREIGN KEY (CompanyId) REFERENCES Companies(Id),
  FOREIGN KEY (PayrollRunId) REFERENCES PayrollRuns(Id),
  UNIQUE KEY uq_company_month_year (CompanyId, ReportMonth, ReportYear)
);

═══════════════════════════════════════════════════════════════
BACKEND — FULL IMPLEMENTATION DETAILS
═══════════════════════════════════════════════════════════════

--- PROGRAM.CS SETUP ---
Configure the following in Program.cs:
1. AddDbContext with MySQL (Pomelo), connection string from environment variable
2. AddAuthentication with JWT Bearer tokens
3. AddAuthorization with custom policies:
   - "HRAdmin" policy: roles = hradmin, superadmin
   - "Manager" policy: roles = manager, hradmin, superadmin
   - "PayrollAdmin" policy: roles = payrolladmin, hradmin, superadmin
4. AddAutoMapper with all MappingProfiles
5. AddFluentValidation scanning all assemblies
6. AddSwaggerGen with JWT auth support
7. UseSerilog with file + console sinks
8. Add global exception handling middleware
9. Add CORS (allow Angular dev server)
10. Add request logging middleware

--- PAYROLL CALCULATION ENGINE ---
Implement PayrollCalculationService with these exact methods:

CalculateSSCDeduction(decimal basicSalary, PayrollRules rules):
  - Apply SSC only to basic salary (not allowances) - Jordanian law
  - Cap at rules.SSCMaxSalary
  - Employee = basicSalary * rules.SSCEmployeeRate (7.5%)
  - Employer = basicSalary * rules.SSCEmployerRate (14.25%)

CalculateIncomeTax(decimal annualGrossSalary, Employee employee, PayrollRules rules):
  JORDANIAN PROGRESSIVE TAX (monthly tax = annual / 12):
  
  1. Calculate personal exemption:
     - Single: 9,000 JOD/year
     - Married: 18,000 JOD/year
     - Per dependent: +1,000 JOD
  
  2. Taxable income = Annual Gross - Exemptions - SSC Deductions
  
  3. Apply brackets:
     - First 5,000: 5%
     - Next 5,000 (5,001-10,000): 10%
     - Next 10,000 (10,001-20,000): 15%
     - Next 980,000 (20,001-1,000,000): 20%
     - Above 1,000,000: 25%
  
  4. Monthly tax = Annual tax / 12

CalculateOvertimePay(OvertimeRequest req, decimal hourlyRate, PayrollRules rules):
  - Weekday: hourlyRate * 1.25 * hours
  - Weekend/Holiday: hourlyRate * 1.50 * hours
  - Hourly rate = (basicSalary / 30 / 8)

ProcessPayrollRun(int payrollRunId):
  For each active employee:
  1. Get attendance summary for the month
  2. Calculate earnings (basic + allowances + overtime)
  3. Calculate SSC employee deduction
  4. Calculate income tax
  5. Calculate loan installments due
  6. Calculate absence deductions
  7. Calculate late deductions (if enabled)
  8. Compute net salary
  9. Save PayrollDetails record
  10. Update PayrollRun totals

GenerateSSCReport(int payrollRunId):
  Generate CSV/Excel with columns:
  - رقم الضمان الاجتماعي للموظف
  - الاسم الكامل
  - الراتب الأساسي
  - اشتراك الموظف (7.5%)
  - اشتراك صاحب العمل (14.25%)
  - المجموع

--- ATTENDANCE SERVICE ---
Implement AttendanceService:

ProcessDailyAttendance():
  - Run as background service every day at 11:59 PM
  - For each active employee:
    - If no attendance record and not holiday/weekend: mark absent
    - Calculate late minutes vs shift start time
    - Calculate early leave minutes
    - Calculate overtime if worked > shift hours

GetAttendanceSummary(int employeeId, int month, int year):
  Returns: { presentDays, absentDays, lateDays, leaveDays, overtimeHours, totalWorkHours }

--- JWT AUTHENTICATION ---
Implement tokens:
  - Access token: 1 hour expiry, contains { userId, employeeId, companyId, role }
  - Refresh token: 7 days, stored in DB
  - Refresh endpoint: /api/v1/auth/refresh

--- ALL API CONTROLLERS ---
Implement these controllers with FULL CRUD + business logic:

1. AuthController:
   POST /api/v1/auth/login           - Returns access + refresh tokens
   POST /api/v1/auth/refresh         - Refresh access token
   POST /api/v1/auth/logout          - Invalidate refresh token
   POST /api/v1/auth/change-password

2. EmployeesController:
   GET    /api/v1/employees           - Paginated list with filters (dept, status, search)
   GET    /api/v1/employees/{id}      - Full employee details
   POST   /api/v1/employees           - Create + auto-generate EmployeeCode + create User account
   PUT    /api/v1/employees/{id}      - Update
   DELETE /api/v1/employees/{id}      - Soft delete
   POST   /api/v1/employees/{id}/terminate - Terminate with reason + date
   GET    /api/v1/employees/{id}/payslips  - Employee payslip history
   GET    /api/v1/employees/org-chart     - Return hierarchical org tree

3. LeaveController:
   GET    /api/v1/leave/requests         - List with filters (status, employee, date range)
   GET    /api/v1/leave/requests/{id}    - Detail
   POST   /api/v1/leave/requests         - Submit leave request (validate balance)
   PUT    /api/v1/leave/requests/{id}/approve  - Approve (manager/HR only)
   PUT    /api/v1/leave/requests/{id}/reject   - Reject with reason
   DELETE /api/v1/leave/requests/{id}          - Cancel (employee own request only)
   GET    /api/v1/leave/balances/{employeeId}  - Current leave balances
   GET    /api/v1/leave/calendar            - Team leave calendar (who's off)
   POST   /api/v1/leave/policies           - CRUD for leave policies

4. AttendanceController:
   POST   /api/v1/attendance/clock-in     - Record clock-in with GPS coords
   POST   /api/v1/attendance/clock-out    - Record clock-out
   GET    /api/v1/attendance              - List with filters
   PUT    /api/v1/attendance/{id}/manual  - Manual correction (HR only)
   GET    /api/v1/attendance/summary/{employeeId} - Monthly summary
   GET    /api/v1/attendance/report       - Report with export (CSV/Excel)

5. OvertimeController:
   GET    /api/v1/overtime/requests       - List
   POST   /api/v1/overtime/requests       - Submit overtime request
   PUT    /api/v1/overtime/requests/{id}/approve
   PUT    /api/v1/overtime/requests/{id}/reject

6. PayrollController:
   GET    /api/v1/payroll/runs             - List payroll runs
   POST   /api/v1/payroll/runs             - Create payroll run for month/year
   POST   /api/v1/payroll/runs/{id}/process - Calculate all salaries
   GET    /api/v1/payroll/runs/{id}/details - All employee details for this run
   PUT    /api/v1/payroll/runs/{id}/approve - Approve run
   PUT    /api/v1/payroll/runs/{id}/finalize - Finalize (lock) run
   GET    /api/v1/payroll/runs/{id}/payslip/{employeeId} - Individual payslip
   GET    /api/v1/payroll/runs/{id}/ssc-report - SSC report (CSV)
   GET    /api/v1/payroll/runs/{id}/bank-transfer - Bank transfer file
   GET    /api/v1/payroll/runs/{id}/tax-report - Income tax report

7. PerformanceController:
   CRUD for /api/v1/performance/cycles
   CRUD for /api/v1/performance/goals
   CRUD for /api/v1/performance/reviews
   POST /api/v1/performance/reviews/{id}/submit-self    - Employee submits self-review
   POST /api/v1/performance/reviews/{id}/submit-manager - Manager submits review
   POST /api/v1/performance/reviews/{id}/acknowledge    - Employee acknowledges

8. RecruitmentController:
   CRUD for /api/v1/recruitment/vacancies
   CRUD for /api/v1/recruitment/candidates
   CRUD for /api/v1/recruitment/applications
   PUT  /api/v1/recruitment/applications/{id}/move-stage - Move pipeline stage
   CRUD for /api/v1/recruitment/interviews
   POST /api/v1/recruitment/applications/{id}/hire - Convert to employee

9. ReportsController:
   GET /api/v1/reports/headcount         - Headcount by dept/status
   GET /api/v1/reports/attendance-summary - Monthly attendance summary
   GET /api/v1/reports/payroll-summary    - Payroll cost summary
   GET /api/v1/reports/leave-analysis     - Leave usage analysis
   GET /api/v1/reports/documents-expiry   - Expiring documents
   GET /api/v1/reports/turnover           - Employee turnover rate
   GET /api/v1/reports/ssc-annual         - Annual SSC report

10. DashboardController:
    GET /api/v1/dashboard/hr-summary      - Key HR metrics
    GET /api/v1/dashboard/attendance-today - Today's attendance snapshot
    GET /api/v1/dashboard/leave-calendar  - Current month leave overview
    GET /api/v1/dashboard/birthday-today  - Employees with birthday today
    GET /api/v1/dashboard/document-alerts - Docs expiring in 30 days
    GET /api/v1/dashboard/pending-approvals - Count of pending requests

11. NotificationsController:
    GET  /api/v1/notifications             - User notifications (paginated)
    PUT  /api/v1/notifications/{id}/read   - Mark as read
    PUT  /api/v1/notifications/read-all    - Mark all as read

═══════════════════════════════════════════════════════════════
FRONTEND — ANGULAR 18 FULL IMPLEMENTATION
═══════════════════════════════════════════════════════════════

--- ROUTES STRUCTURE ---
/auth/login
/auth/change-password

/dashboard                    (HR Admin dashboard)
/employees                    (Employee list)
/employees/new                (Add employee)
/employees/:id                (Employee profile - full detail page)
/employees/:id/edit           (Edit employee)

/leave
/leave/my-leaves              (Employee: my leave requests)
/leave/team-leaves            (Manager: team leave approval)
/leave/calendar               (Leave calendar - who's off)
/leave/policies               (HR: manage leave policies)
/leave/balances               (HR: all employee balances)

/attendance
/attendance/clock             (Employee clock in/out)
/attendance/my-attendance     (Employee: my records)
/attendance/team-attendance   (Manager: team)
/attendance/report            (HR: full report)

/payroll
/payroll/runs                 (Payroll run list)
/payroll/runs/:id             (Payroll run detail)
/payroll/my-payslips          (Employee: my payslips)
/payroll/payslip/:id          (Single payslip view/print)

/performance
/performance/cycles           (HR: manage cycles)
/performance/my-goals         (Employee: my goals)
/performance/my-reviews       (Employee: self review)
/performance/team-reviews     (Manager: team reviews)

/recruitment
/recruitment/vacancies        (Vacancy list)
/recruitment/vacancies/:id    (Vacancy detail + applications)
/recruitment/candidates       (Candidate pool)
/recruitment/pipeline         (Kanban pipeline view)

/reports
/reports/headcount
/reports/payroll
/reports/attendance
/reports/ssc

/settings
/settings/company
/settings/departments
/settings/job-titles
/settings/shifts
/settings/leave-policies
/settings/payroll-rules
/settings/users
/settings/holidays

--- KEY ANGULAR COMPONENTS ---

1. DashboardComponent:
   - Top stats cards: Total Employees, Present Today, On Leave, Pending Approvals
   - Attendance chart: Bar chart (present/absent/late) last 7 days
   - Department headcount: Pie chart
   - Recent activities feed
   - Document expiry alerts widget
   - Birthdays today widget

2. EmployeeListComponent:
   - Searchable, filterable table (Angular Material MatTable)
   - Filters: department, status, employment type
   - Actions: view, edit, terminate
   - Export to Excel button
   - Paginator with page size options

3. EmployeeFormComponent:
   - Multi-step form (Angular Material stepper):
     Step 1: Personal Info (name AR/EN, DOB, national ID, gender)
     Step 2: Employment Info (department, job title, hire date, manager)
     Step 3: Salary (basic + all allowances, auto-calculates total)
     Step 4: SSC & Tax (SSC number, exemptions)
     Step 5: Bank Info (bank, account, IBAN)
     Step 6: Documents (upload contract, ID, etc.)
   - Real-time salary total calculation
   - All Arabic fields with RTL direction

4. EmployeeProfileComponent (full page):
   - Tab layout:
     Tab: Overview (photo, basic info, KPIs)
     Tab: Employment (history, contracts)
     Tab: Salary (current + history)
     Tab: Attendance (last 30 days timeline)
     Tab: Leave (balances + history)
     Tab: Documents (list with expiry status)
     Tab: Performance (latest review)

5. PayrollRunComponent:
   - Status timeline: Draft → Review → Approved → Finalized
   - Summary cards: Total Gross, Total Net, Total SSC, Total Tax
   - Employee table with all salary components
   - Edit individual adjustments (bonus, deductions)
   - Generate reports buttons: SSC Report, Bank Transfer, Tax Report, Payslips
   - Lock/Finalize with confirmation dialog

6. PayslipComponent:
   - Print-ready payslip layout (A4)
   - Company header with logo
   - Employee info section
   - Earnings table (basic + each allowance itemized)
   - Deductions table (SSC, tax, loans, absences)
   - Net salary highlighted
   - Arabic and English labels
   - QR code for verification

7. AttendanceClockComponent:
   - Big clock-in / clock-out button
   - Current GPS location display
   - Today's status and worked hours
   - Recent attendance list

8. LeaveRequestFormComponent:
   - Leave type dropdown
   - Date range picker (blocks holidays/weekends)
   - Auto-calculates working days
   - Shows remaining balance
   - Reason + attachment

9. RecruitmentPipelineComponent:
   - Kanban board (CDK drag and drop)
   - Columns: Applied, Screening, Phone, Technical, HR, Final, Offer
   - Candidate card: name, position applied, days in stage, rating
   - Drag between columns updates stage

--- INTERCEPTORS ---
1. AuthInterceptor: Add Bearer token to all requests
2. RefreshInterceptor: Catch 401, refresh token, retry request
3. LoadingInterceptor: Show/hide global loading spinner
4. ErrorInterceptor: Show snackbar for API errors

--- GUARDS ---
1. AuthGuard: Redirect to login if not authenticated
2. RoleGuard: Check role for specific routes
3. UnsavedChangesGuard: Prompt before leaving form with changes

--- SERVICES ---
AuthService: login, logout, refreshToken, currentUser$, hasRole()
EmployeeService: CRUD + org chart
LeaveService: requests, balances, policies, calendar
AttendanceService: clock in/out, records, reports
PayrollService: runs, processing, payslips, reports
PerformanceService: cycles, goals, reviews
RecruitmentService: vacancies, candidates, applications, pipeline
NotificationService: real-time notifications, unread count
DashboardService: all dashboard widgets

--- I18N SETUP ---
Implement full bilingual support (Arabic/English):
All UI text via translate pipe: {{ 'employees.add' | translate }}
ar.json and en.json files with ALL translation keys
Language toggle button in header (switches entire UI instantly)
RTL direction for Arabic, LTR for English (using dir attribute on body)
Arabic number formatting for monetary values (JOD)
Hijri calendar support is optional but mark where to add it

--- THEME & STYLING ---
Primary color: #1A56DB (professional blue)
Secondary: #16BDCA (teal accent)
Success: #0E9F6E
Warning: #FF5A1F
Error: #E02424
Angular Material custom theme with these colors
Fully responsive (mobile-first)
RTL-compatible CSS (use logical properties: margin-inline-start, etc.)
Print styles for payslips and reports

═══════════════════════════════════════════════════════════════
JORDANIAN COMPLIANCE — CRITICAL BUSINESS RULES
═══════════════════════════════════════════════════════════════

Implement ALL of these exactly as described:

1. SOCIAL SECURITY CORPORATION (SSC):
   - Apply to ALL employees (Jordanian and foreign) from day 1
   - Employee rate: 7.5% of BASIC SALARY ONLY (not allowances)
   - Employer rate: 14.25% of BASIC SALARY ONLY
   - Monthly ceiling: 3,416 JOD basic salary (if higher, cap it)
   - Minimum: 230 JOD basic (if lower, use 230 JOD as base)
   - Submit monthly report to SSC by 15th of following month
   - Store SSCNumber for each employee

2. INCOME TAX (ISTD - دائرة ضريبة الدخل):
   Progressive annual brackets (calculate monthly as 1/12):
   - Annual exemption: 9,000 JOD single / 18,000 JOD married
   - Per dependent: 1,000 JOD (max 3 dependents typically)
   - Bracket 1: up to 5,000 JOD = 5%
   - Bracket 2: 5,001-10,000 = 10%
   - Bracket 3: 10,001-20,000 = 15%
   - Bracket 4: 20,001-1,000,000 = 20%
   - Bracket 5: over 1,000,000 = 25%
   - Monthly tax return submission to ISTD

3. WORKING HOURS (Labor Law No. 8/1996):
   - Normal: 8 hours/day, 48 hours/week maximum
   - 6 working days maximum
   - Standard week: Sunday to Thursday in Jordan
   - Friday is official day off for most companies
   - Friday + Saturday = weekend (banks, government)

4. OVERTIME (Article 59 of Labor Law):
   - Weekday overtime: basic hourly rate × 1.25
   - Weekend/holiday overtime: basic hourly rate × 1.50
   - Hourly rate = monthly salary / 30 / 8
   - Max overtime: no explicit legal cap but document everything

5. ANNUAL LEAVE:
   - Year 1-4: minimum 14 working days per year
   - Year 5+: minimum 21 working days
   - Calculate proportionally if < 1 year
   - Can carry forward with employer agreement
   - Encash unused leave on termination

6. SICK LEAVE:
   - First 14 days: full salary
   - Next 14 days: 75% salary
   - Next 14 days: 50% salary
   - Requires medical certificate from approved doctor

7. MATERNITY LEAVE:
   - 10 weeks paid (100%) - minimum 6 weeks post-birth
   - Funded by SSC maternity branch
   - Require 6 months SSC coverage in last 12 months

8. PATERNITY LEAVE:
   - 3 days paid

9. HAJJ LEAVE:
   - Once in employment: 30 days paid (if SSC covered 2+ years)

10. TERMINATION:
    - Indefinite contract: 1 month notice
    - Compensation for wrongful termination
    - End of service gratuity for employees NOT covered by SSC:
      1 month salary per year of service
    - SSC-covered employees: SSC handles pension instead
    - Final settlement: include all accrued leave, notice period

11. PROBATION:
    - Maximum 3 months (can extend to 6 months)
    - Either party can terminate without notice during probation
    - SSC still required from day 1

12. MINIMUM WAGE:
    - 290 JOD/month (2025) - validate in payroll
    - Warn HR if employee salary below minimum wage

13. DOCUMENT ALERTS:
    - Alert 60 days before work permit expiry
    - Alert 30 days before residency expiry
    - Alert 30 days before any contract end date
    - Alert 60 days before passport expiry

═══════════════════════════════════════════════════════════════
SEED DATA — Initialize with this on first run
═══════════════════════════════════════════════════════════════

1. Super admin user: admin@zenjo.com / Admin@123456
2. Sample company: "شركة الأردن للتقنية / Jordan Tech Co."
3. Departments: IT, HR, Finance, Operations, Sales
4. Job Titles: Software Engineer, HR Manager, Accountant, Operations Manager, Sales Rep
5. One shift: Standard (8:00-17:00, Sunday-Thursday)
6. Leave policies (Jordan defaults):
   - Annual Leave: 14 days
   - Sick Leave: 14 days
   - Maternity: 70 days (10 weeks)
   - Paternity: 3 days
   - Hajj: 30 days (once only)
   - Emergency: 3 days
   - Unpaid: 0 days (unlimited with approval)
7. Payroll rules 2025 (Jordan rates as specified above)
8. Jordanian public holidays 2025:
   - New Year: Jan 1
   - King Abdullah's Birthday: Jan 30
   - Arab League Day: Mar 22
   - Labor Day: May 1
   - Independence Day: May 25
   - Army Day: Jun 10
   - Eid Al-Fitr: 3 days (approx)
   - Eid Al-Adha: 3 days (approx)
   - Prophet's Birthday: 1 day
   - Christmas: Dec 25
9. 10 sample employees with realistic Jordanian names, distributed across departments, with varying salaries (300-1500 JOD)

═══════════════════════════════════════════════════════════════
ENVIRONMENT CONFIGURATION
═══════════════════════════════════════════════════════════════

Backend appsettings.json / environment:
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost;Database=ZenJO;User=root;Password=;CharSet=utf8mb4;"
  },
  "JwtSettings": {
    "SecretKey": "ZenJO_SecretKey_2025_Minimum32Chars!!",
    "Issuer": "ZenJO-API",
    "Audience": "ZenJO-App",
    "AccessTokenExpiryMinutes": 60,
    "RefreshTokenExpiryDays": 7
  },
  "FileStorage": {
    "BasePath": "uploads",
    "MaxFileSizeMB": 10,
    "AllowedExtensions": [".pdf", ".jpg", ".jpeg", ".png"]
  }
}

Frontend environment.ts:
{
  production: false,
  apiUrl: 'http://localhost:5000/api/v1',
  defaultLanguage: 'ar',
  supportedLanguages: ['ar', 'en'],
  currency: 'JOD',
  currencyLocale: 'ar-JO',
  companyName: 'ZenJO'
}

═══════════════════════════════════════════════════════════════
DOCKER COMPOSE (Optional but include it)
═══════════════════════════════════════════════════════════════

Create docker-compose.yml:
- mysql:8.0 service (port 3306, utf8mb4, persistent volume)
- backend .NET 9 service (port 5000)
- frontend Angular service (port 4200, with nginx)
- All services connected via internal network
- Health checks for mysql before starting backend

═══════════════════════════════════════════════════════════════
QUALITY REQUIREMENTS
═══════════════════════════════════════════════════════════════

1. ALL API endpoints return consistent response format:
   { "success": true, "data": {...}, "message": "تم بنجاح", "errors": null, "pagination": {...} }

2. ALL forms have proper validation:
   - Required field messages in Arabic
   - Format validation (phone, email, IBAN, national ID)
   - Business rule validation (salary > 290 JOD minimum wage, etc.)

3. ALL tables support:
   - Server-side pagination
   - Sorting by column
   - Search/filter
   - Export to Excel/CSV

4. Security:
   - JWT tokens with proper expiry
   - Role-based access on both backend (attributes) and frontend (guards)
   - Employees can only see their own data (payslips, leave, attendance)
   - Managers see only their direct reports
   - HR sees all employees in the company

5. Arabic/RTL:
   - Full RTL layout when language is Arabic
   - All text fields accept Arabic input
   - Numbers in Arabic-Indic format where appropriate
   - Dates in Arabic format option

6. Error handling:
   - All API errors caught and displayed as Arabic snackbar messages
   - Network errors handled gracefully
   - Loading states on all async operations
   - Confirmation dialogs for destructive actions

═══════════════════════════════════════════════════════════════
START ORDER
═══════════════════════════════════════════════════════════════

Build in this exact order:
1. Database schema (all tables)
2. Domain entities (C# classes)
3. EF Core DbContext + migrations
4. Authentication (Users + JWT)
5. Employee CRUD (core)
6. Leave management (policies + requests + balances)
7. Attendance (clock in/out + records)
8. Payroll engine (calculation + runs)
9. SSC report generation
10. Performance management
11. Recruitment (ATS)
12. Reports & Analytics
13. Angular frontend (same order as features)
14. i18n (Arabic/English)
15. Docker compose
16. Seed data + README

Build the COMPLETE system. Do not skip any module or table.
This is a production system that will be used by real companies in Jordan.
```

## ═══════════════════════════════════════════════════
## END OF REPLIT AGENT PROMPT
## ═══════════════════════════════════════════════════

---

## ملاحظات مهمة للاستخدام

### طريقة الاستخدام في Replit Agent:
1. افتح Replit → اختر "Create with AI" أو اضغط على Replit Agent
2. انسخ كل شيء بين `START` و `END` وضعه في الـ prompt
3. Replit Agent هيبدأ ببناء المشروع خطوة بخطوة

### إذا Agent توقف في منتصف الطريق:
أرسل له هذا:
```
Continue building. You stopped at [mention where].
Continue from where you left off without rebuilding what's already done.
```

### لإضافة وحدات مستقبلية:
```
Add to the existing ZenJO system:
- [اسم الوحدة الجديدة]
Follow the same architecture and coding patterns already used.
```

### التقنيات والإصدارات المحددة:
| التقنية | الإصدار |
|---------|---------|
| .NET | 9.0 |
| ASP.NET Core | 9.0 |
| Entity Framework Core | 9.0 |
| Pomelo MySQL Provider | 9.0 |
| Angular | 18+ |
| Angular Material | 18+ |
| MySQL | 8.0+ |
| Node.js (للـ Angular) | 20+ |

### هيكل الـ Payroll الأردني المطبّق:
```
الراتب الإجمالي
= الراتب الأساسي
+ بدل سكن
+ بدل مواصلات
+ بدل هاتف
+ بدل طعام
+ بدلات أخرى
+ أجر إضافي

الخصومات:
- ضمان اجتماعي (7.5% من الأساسي فقط)
- ضريبة دخل (تصاعدية حسب الدخل السنوي)
- أقساط قروض
- خصم غياب
- خصم تأخير

صافي الراتب = الإجمالي - مجموع الخصومات
```

### شهادات الامتثال الأردنية المغطاة:
- ✅ قانون العمل رقم 8 لسنة 1996
- ✅ مؤسسة الضمان الاجتماعي (SSC)
- ✅ دائرة ضريبة الدخل والمبيعات (ISTD)
- ✅ وزارة العمل (تسجيل العقود)
- ✅ الحد الأدنى للأجور 290 دينار (2025)
