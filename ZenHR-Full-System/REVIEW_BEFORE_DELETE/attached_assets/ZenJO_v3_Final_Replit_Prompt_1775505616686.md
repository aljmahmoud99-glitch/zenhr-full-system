# ZenJO HRMS v3.1 — Replit Agent Master Prompt
## نظام إدارة الموارد البشرية الأردني المتكامل
### Jordan-Only · Configurable · Workflow-Driven · Compliance-First · Enterprise-Grade

---

> **انسخ كل شيء من هنا وضعه في Replit Agent مباشرةً.**

---

```
Build ZenJO HRMS v3.1 — a complete, production-ready Human Resources Management System
fully compliant with Jordanian Labour Law No. 8 of 1996, Social Security Corporation (SSC)
regulations, and Jordanian Income Tax Law. Jordan-ONLY system.

This is a REAL enterprise system — not a demo. Every business rule, workflow,
compliance check, and form must be fully implemented and correct.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 0: SYSTEM IDENTITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

System Name: ZenJO HRMS
Country: Jordan ONLY
Currency: JOD — always 3 decimal places (e.g. 1,500.000 JOD)
Languages: Arabic (default, RTL) + English (LTR)
Legal Framework: Jordanian Labour Law No. 8/1996 + SSC Law + Income Tax Law
Working Week: Sunday–Thursday (Friday + Saturday = weekend/holidays)
Timezone: Asia/Amman

CONFIGURABLE SYSTEM RULE: Every compliance value (SSC rates, tax brackets, leave days,
working hours, overtime rates, probation days, alert days) must be stored in the
system_configurations table and read LIVE from the database — never hardcoded.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1: TECH STACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Backend:  Node.js 22 + TypeScript 5 strict, Express 5, Drizzle ORM, PostgreSQL 16
          Zod v4, JWT (access 15min + refresh 7days), bcrypt cost-12, Helmet + CORS + rate-limit
Frontend: React 18 + Vite 6, TypeScript strict, shadcn/ui + Tailwind v4, Wouter routing
          @tanstack/react-query v5, react-i18next (AR/EN), Recharts, react-hook-form + zod
Package:  pnpm workspaces
API base: /api/v1/
Response: { success, data, message?, pagination? }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2: RBAC — ACCESS CONTROL (CRITICAL — ENFORCE ON BACKEND + FRONTEND)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

6 Roles:
  superadmin    → Full access to everything including system configuration
  hradmin       → Employee CRUD, all approvals (step 2), documents, compliance, payroll create, forms
  payrolladmin  → Payroll approve + view, payslips, read-only employees WITH salary shown
  manager       → View direct-reports only, step-1 approvals (leave/OT), attendance
  employee      → Own records only: clock in/out, own leave, own OT, own payslips, own docs
  recruiter     → Create employees (draft only), view departments & job titles

PERMISSION MATRIX — ENFORCE ON BOTH BACKEND MIDDLEWARE AND FRONTEND ROUTE GUARDS:

  Action                           | super | hr    | payroll | manager | employee | recruiter
  ─────────────────────────────────────────────────────────────────────────────────────────────
  View all employees + salary      |  ✓   |  ✓    |   ✓    |   ✗    |    ✗    |    ✗
  View all employees NO salary     |  ✓   |  ✓    |   ✓    |  ✓**  |    ✗    |    ✗
  Create employees                 |  ✓   |  ✓    |   ✗    |   ✗    |    ✗    |  ✓(draft)
  Edit employees                   |  ✓   |  ✓    |   ✗    |   ✗    |    ✗    |    ✗
  Delete/deactivate employees      |  ✓   |  ✓    |   ✗    |   ✗    |    ✗    |    ✗
  View salary/bank/SSC fields      |  ✓   |  ✓    |   ✓    |   ✗    |    ✗    |    ✗
  Approve leave (step 1)           |  ✓   |  ✓    |   ✗    |   ✓    |    ✗    |    ✗
  Approve leave (step 2)           |  ✓   |  ✓    |   ✗    |   ✗    |    ✗    |    ✗
  Approve overtime (step 1)        |  ✓   |  ✓    |   ✗    |   ✓    |    ✗    |    ✗
  Approve overtime (step 2)        |  ✓   |  ✓    |   ✗    |   ✗    |    ✗    |    ✗
  Create payroll run               |  ✓   |  ✓    |   ✗    |   ✗    |    ✗    |    ✗
  Approve payroll run              |  ✓   |  ✗    |   ✓    |   ✗    |    ✗    |    ✗
  View payslips (all)              |  ✓   |  ✓    |   ✓    |   ✗    |    ✗    |    ✗
  View own payslip                 |  ✓   |  ✓    |   ✓    |   ✗    |  own ✓  |    ✗
  Manage compliance docs           |  ✓   |  ✓    |   ✗    |   ✗    |    ✗    |    ✗
  View compliance (own)            |  ✓   |  ✓    |   ✗    |   ✓    | own ✓  |    ✗
  Manage assets                    |  ✓   |  ✓    |   ✗    |   ✗    |    ✗    |    ✗
  Issue disciplinary actions       |  ✓   |  ✓    |   ✗    |   ✗    |    ✗    |    ✗
  Manage work permits              |  ✓   |  ✓    |   ✗    |   ✗    |    ✗    |    ✗
  Generate/print forms             |  ✓   |  ✓    |   ✗    |   ✗    |    ✗    |    ✗
  Manage pre-employment workflow   |  ✓   |  ✓    |   ✗    |   ✗    |    ✗    |    ✗
  Submit resignation               |  ✓   |  ✓    |   ✗    |   ✗    | own ✓  |    ✗
  View clearance workflow          |  ✓   |  ✓    |   ✓    |   ✗    | own ✓  |    ✗
  Edit system settings             |  ✓   |  ✓    |   ✗    |   ✗    |    ✗    |    ✗

  ** manager: sees only employees where direct_manager_id = self.employeeId
     Salary/bank/SSC fields always hidden for manager role

BACKEND ENFORCEMENT (mandatory):
  - Every protected route: authenticate middleware → role check → data scope
  - employee role: ALL queries filtered WHERE employee_id = :selfId
  - manager role: employee queries filtered WHERE direct_manager_id = :selfEmployeeId
  - recruiter: GET /employees → 403 Forbidden
  - Salary masking function: zeroes basicSalary, all allowances, bankAccountNumber, iban
    applied automatically for manager/employee/recruiter roles

FRONTEND ENFORCEMENT:
  - canAccessRoute(role, path) checked in <ProtectedRoute> wrapper
  - Unauthorized access → shows 403 "غير مصرح" card, not redirect
  - Salary tabs/fields hidden via role check in components
  - Action buttons (approve/edit/delete) rendered conditionally by role

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3: DATABASE SCHEMA (32 TABLES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All tables: id serial PK, company_id INT FK (except lookup tables),
            created_at/updated_at timestamptz, is_deleted boolean DEFAULT false

--- TABLE 1: companies ---
  name_ar, name_en, commercial_reg_no (unique), tax_number,
  ssc_employer_no (رقم تسجيل مؤسسة الضمان الاجتماعي — REQUIRED),
  labor_ministry_no (رقم وزارة العمل), address_ar,
  governorate (enum: Amman/Irbid/Zarqa/Balqa/Madaba/Karak/Tafilah/Maán/Aqaba/Ajloun/Jerash/Mafraq),
  phone, email, website, logo_url,
  industry_type (enum: technology/manufacturing/retail/healthcare/education/government/finance/food_service/hospitality/other),
  currency DEFAULT 'JOD', fiscal_year_start DEFAULT 1,
  work_week_start DEFAULT 1 (1=Sunday), work_week_end DEFAULT 5 (5=Thursday),
  is_active BOOLEAN DEFAULT true

--- TABLE 2: departments ---
  name_ar, name_en, code (unique per company), parent_department_id (self FK),
  manager_employee_id (FK employees), cost_center_code, headcount INT DEFAULT 0, is_active

  SEED: HR(الموارد البشرية), IT(تقنية المعلومات), FIN(المالية),
        OPS(العمليات), SAL(المبيعات), CS(خدمة العملاء)

--- TABLE 3: job_titles ---
  title_ar, title_en, code, grade (G1–G10),
  min_salary NUMERIC(12,3), max_salary NUMERIC(12,3), is_active

--- TABLE 4: employees (CORE — 55+ columns) ---
  Personal:
    employee_code VARCHAR UNIQUE (auto: EMP-0001),
    first_name_ar NOT NULL, middle_name_ar, last_name_ar NOT NULL,
    first_name_en NOT NULL, middle_name_en, last_name_en NOT NULL,
    gender (male/female) NOT NULL,
    date_of_birth DATE NOT NULL,
    age INT GENERATED — compute display age from DOB,
    national_id VARCHAR(10) UNIQUE (رقم الوطني — 10 digits, Jordanians only),
    nationality VARCHAR DEFAULT 'أردني',
    nationality_code VARCHAR(2) (ISO, JO = Jordanian),
    blood_type, religion, marital_status,
    number_of_dependents INT DEFAULT 0,
    education_level, field_of_study

  Contact (VISIBLE ON EMPLOYEE LIST — see Section 7):
    personal_phone VARCHAR NOT NULL,
    work_phone VARCHAR,
    personal_email VARCHAR,
    work_email VARCHAR UNIQUE,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation

  Address (VISIBLE ON EMPLOYEE LIST):
    address_ar TEXT,
    governorate VARCHAR,
    city VARCHAR

  Employment:
    department_id FK, job_title_id FK, direct_manager_id FK (self-ref),
    employment_type (fulltime/parttime/contract/secondment),
    hire_date DATE NOT NULL,
    probation_end_date DATE (auto: hire_date + 90 days, configurable),
    probation_status (active/completed/extended/failed) DEFAULT 'active',
    contract_type (permanent/fixed_term/seasonal),
    contract_end_date DATE,
    employment_status (draft/active/probation/suspended/terminated/resigned/retired/on_leave),
    termination_date DATE, termination_reason TEXT,
    notice_period_days INT DEFAULT 30,
    resignation_date DATE,
    last_working_day DATE,
    clearance_completed BOOLEAN DEFAULT false

  Financial (SALARY-MASKED for manager/employee/recruiter):
    basic_salary NUMERIC(12,3) NOT NULL,
    housing_allowance NUMERIC(12,3) DEFAULT 0,
    transport_allowance NUMERIC(12,3) DEFAULT 0,
    mobile_allowance NUMERIC(12,3) DEFAULT 0,
    meal_allowance NUMERIC(12,3) DEFAULT 0,
    other_allowances NUMERIC(12,3) DEFAULT 0,
    salary_payment_method (bank/cash/check) DEFAULT 'bank',
    bank_id FK,
    bank_account_number VARCHAR (MASKED),
    iban VARCHAR (MASKED)

  SSC — الضمان الاجتماعي:
    ssc_number VARCHAR (رقم الضمان الاجتماعي),
    ssc_enrollment_date DATE,
    ssc_enrollment_month INT (1–12: the actual SSC-registration month per Jordanian rule),
    is_ssc_enrolled BOOLEAN DEFAULT false,
    is_ssc_exempt BOOLEAN DEFAULT false,
    ssc_exempt_reason TEXT

  Tax:
    income_tax_number VARCHAR,
    tax_exemption_amount NUMERIC(12,3) DEFAULT 0,
    family_tax_exemption BOOLEAN DEFAULT false

  Compliance Documents (quick-access fields — full docs in TABLE 14):
    -- For NON-Jordanians only:
    work_permit_number VARCHAR,
    work_permit_start DATE,
    work_permit_expiry DATE,
    work_permit_category (regular/temporary/seasonal),
    residency_number VARCHAR,
    residency_type (annual/multi_year),
    residency_expiry DATE,
    passport_number VARCHAR,
    passport_expiry DATE,
    passport_country VARCHAR,
    -- For ALL employees:
    health_certificate_number VARCHAR,
    health_certificate_expiry DATE,
    health_certificate_issuer VARCHAR,
    health_certificate_active BOOLEAN DEFAULT false,
    criminal_clearance_number VARCHAR,
    criminal_clearance_date DATE,
    criminal_clearance_expiry DATE

  profile_photo VARCHAR

--- TABLE 5: users ---
  employee_id FK (nullable), username VARCHAR UNIQUE, password_hash VARCHAR (bcrypt-12),
  email VARCHAR, role (superadmin/hradmin/payrolladmin/manager/employee/recruiter),
  is_active BOOLEAN, last_login_at TIMESTAMPTZ, must_change_password BOOLEAN DEFAULT false,
  refresh_token VARCHAR, refresh_token_expiry TIMESTAMPTZ,
  failed_login_attempts INT DEFAULT 0, locked_until TIMESTAMPTZ

--- TABLE 6: attendance_records ---
  employee_id FK, date DATE, clock_in TIMESTAMPTZ, clock_out TIMESTAMPTZ,
  status (present/absent/late/on_leave/official_mission/half_day/holiday/probation_day),
  late_minutes INT DEFAULT 0, worked_minutes INT DEFAULT 0,
  overtime_minutes INT DEFAULT 0, break_minutes INT DEFAULT 0,
  notes TEXT, approved_by_id FK users

--- TABLE 7: leave_types ---
  name_ar, name_en, code, type (annual/sick/emergency/maternity/paternity/hajj/bereavement/unpaid/compensatory),
  is_paid BOOLEAN, default_days_per_year INT, max_carry_forward INT DEFAULT 0,
  min_service_months INT DEFAULT 0, requires_approval BOOLEAN DEFAULT true,
  gender_restriction (all/male/female), once_in_career BOOLEAN DEFAULT false,
  requires_medical_cert BOOLEAN DEFAULT false, is_active BOOLEAN

  SEED (9 types — Jordanian Labour Law):
    Annual Leave       | سنوية      | 14 days | paid | carry-forward 14 | all
    Sick Leave         | مرضية       | 14 days | paid | cert after 2 days | all
    Emergency Leave    | طارئة       | 3 days  | paid | no notice needed  | all
    Maternity Leave    | أمومة       | 70 days | paid | female only       | female
    Paternity Leave    | أبوة        | 3 days  | paid | male only         | male
    Hajj Leave         | حج          | 14 days | paid | once in career, min 5yr service
    Bereavement Leave  | وفاة        | 3 days  | paid | immediate family  | all
    Unpaid Leave       | بدون راتب   | custom  | unpaid | all
    Compensatory Leave | تعويضية     | auto    | paid | from approved OT  | all

--- TABLE 8: leave_policies ---
  leave_type_id FK, days_per_year INT, max_carry_forward INT,
  accrual_type (monthly/annually), min_service_months INT,
  requires_manager_approval BOOLEAN DEFAULT true,
  requires_hr_approval BOOLEAN DEFAULT true,
  notice_days_required INT DEFAULT 0,
  max_consecutive_days INT, is_active BOOLEAN

--- TABLE 9: leave_balances ---
  employee_id FK, leave_type_id FK, year INT,
  total_days NUMERIC(5,2), used_days NUMERIC(5,2),
  pending_days NUMERIC(5,2), remaining_days NUMERIC(5,2),
  carried_forward_days NUMERIC(5,2) DEFAULT 0

--- TABLE 10: leave_requests ---
  employee_id FK, leave_type_id FK, start_date DATE, end_date DATE,
  total_days NUMERIC(5,2), reason TEXT, attachment_url VARCHAR,
  status (pending/manager_approved/approved/rejected/cancelled),
  manager_approved_by_id FK, manager_approved_at TIMESTAMPTZ,
  hr_approved_by_id FK, hr_approved_at TIMESTAMPTZ,
  rejection_reason TEXT, rejection_step (manager/hr),
  is_medical_cert_attached BOOLEAN DEFAULT false

--- TABLE 11: overtime_requests ---
  employee_id FK, date DATE, start_time TIME, end_time TIME,
  hours NUMERIC(5,2), reason TEXT,
  overtime_type (weekday/weekend/holiday),
  compensation_type (pay/compensatory_leave),
  status (pending/manager_approved/approved/rejected/cancelled),
  manager_approved_by_id FK, manager_approved_at TIMESTAMPTZ,
  hr_approved_by_id FK, hr_approved_at TIMESTAMPTZ,
  rejection_reason TEXT, linked_payslip_id FK

--- TABLE 12: payroll_runs ---
  run_month INT, run_year INT,
  status (draft/processing/approved/paid/cancelled),
  total_gross NUMERIC(14,3), total_net NUMERIC(14,3),
  total_deductions NUMERIC(14,3), total_ssc_employee NUMERIC(14,3),
  total_ssc_employer NUMERIC(14,3), total_income_tax NUMERIC(14,3),
  employee_count INT, notes TEXT,
  created_by_id FK, approved_by_id FK,
  processed_at TIMESTAMPTZ, approved_at TIMESTAMPTZ, paid_at TIMESTAMPTZ

--- TABLE 13: payslips ---
  payroll_run_id FK, employee_id FK, period_month INT, period_year INT,
  basic_salary NUMERIC(12,3), housing_allowance NUMERIC(12,3),
  transport_allowance NUMERIC(12,3), mobile_allowance NUMERIC(12,3),
  meal_allowance NUMERIC(12,3), other_allowances NUMERIC(12,3),
  overtime_amount NUMERIC(12,3) DEFAULT 0, bonus_amount NUMERIC(12,3) DEFAULT 0,
  gross_salary NUMERIC(12,3),
  ssc_deduction NUMERIC(12,3), income_tax_deduction NUMERIC(12,3),
  absence_deduction NUMERIC(12,3) DEFAULT 0,
  late_deduction NUMERIC(12,3) DEFAULT 0,
  advance_deduction NUMERIC(12,3) DEFAULT 0,
  other_deductions NUMERIC(12,3) DEFAULT 0,
  total_deductions NUMERIC(12,3), net_salary NUMERIC(12,3),
  worked_days INT, absent_days INT, late_days INT,
  bank_id FK, bank_account_number VARCHAR, iban VARCHAR,
  payment_status (unpaid/paid), paid_at TIMESTAMPTZ

--- TABLE 14: documents ---
  employee_id FK, document_type_id FK, document_number VARCHAR,
  issued_by VARCHAR, issued_date DATE, expiry_date DATE,
  file_name VARCHAR, file_url VARCHAR, file_size INT,
  status (valid/expiring_soon/expired/pending_renewal),
  alert_days_before INT DEFAULT 30, notes TEXT

  Document types tracked:
    national_id       | هوية وطنية         | Jordanians only     | no expiry
    work_permit       | تصريح عمل           | non-Jordanians      | has expiry ✓
    residency         | إقامة               | non-Jordanians      | has expiry ✓
    passport          | جواز سفر            | all                 | has expiry ✓
    health_certificate| شهادة صحية          | industry-based      | has expiry ✓ (1 year)
    criminal_clearance| عدم محكومية          | all new hires       | has expiry ✓ (6 months)
    driving_license   | رخصة قيادة          | drivers             | has expiry ✓
    professional_lic  | ترخيص مهني          | doctors/engineers   | has expiry ✓
    employment_contract| عقد العمل الموقع   | all                 | no expiry
    uniform_receipt   | إيصال استلام زي      | all                 | no expiry

--- TABLE 15: document_types ---
  name_ar, name_en, code VARCHAR UNIQUE, is_required BOOLEAN,
  applicable_to (all/jordanian/non_jordanian/industry_based),
  requires_expiry BOOLEAN, validity_months INT,
  alert_days_before INT DEFAULT 30, is_active BOOLEAN

--- TABLE 16: assets ---
  asset_name_ar, asset_name_en, category_id FK, serial_number VARCHAR UNIQUE,
  barcode VARCHAR, purchase_date DATE, purchase_value NUMERIC(12,3),
  current_value NUMERIC(12,3), supplier VARCHAR,
  current_status (available/assigned/maintenance/retired/lost),
  assigned_to_employee_id FK, assigned_date DATE, expected_return_date DATE,
  condition_on_assign (new/good/fair/poor), notes TEXT

--- TABLE 17: asset_categories ---
  name_ar, name_en, icon VARCHAR, is_active BOOLEAN
  SEED: Laptop, Mobile Phone, Vehicle, SIM Card, Furniture, Access Card, Uniform, Equipment

--- TABLE 18: system_configurations ---
  key VARCHAR UNIQUE, value TEXT, category VARCHAR,
  description_ar TEXT, description_en TEXT,
  data_type (string/integer/decimal/boolean/time/json),
  is_editable BOOLEAN DEFAULT true, updated_by_id FK

  SEED ALL VALUES (read by all business logic):

  attendance:
    work_start_time          = "08:00"
    work_end_time            = "17:00"
    late_threshold_minutes   = "20"
    standard_work_hours      = "8"
    working_days_per_week    = "5"
    weekend_days             = "Friday,Saturday"
    break_duration_minutes   = "60"
    max_daily_overtime_hours = "4"

  payroll:
    ssc_employee_rate         = "7.5"
    ssc_employer_rate         = "14.25"
    ssc_max_insurable_salary  = "3000"
    income_tax_personal_exemption = "9000"
    income_tax_family_exemption   = "9000"
    income_tax_brackets = '[{"from":0,"to":5000,"rate":0},{"from":5000,"to":10000,"rate":5},{"from":10000,"to":15000,"rate":10},{"from":15000,"to":20000,"rate":15},{"from":20000,"to":9999999,"rate":20}]'
    overtime_weekday_rate     = "1.25"
    overtime_weekend_rate     = "1.5"
    overtime_holiday_rate     = "1.5"
    payroll_day               = "25"
    advance_salary_max_pct    = "50"

  hr:
    probation_period_days        = "90"
    notice_period_days           = "30"
    eosb_rate_per_year           = "1"
    annual_leave_days_year1      = "14"
    annual_leave_days_year5plus  = "21"
    contract_renewal_alert_days  = "60"
    min_wage_jod                 = "260"
    disciplinary_action_window_days = "14"

  compliance:
    health_cert_alert_days            = "30"
    health_cert_validity_months       = "12"
    health_cert_required_industries   = '["food_service","healthcare","hospitality","education"]'
    criminal_clearance_validity_months = "6"
    criminal_clearance_alert_months   = "3"
    criminal_clearance_required       = "true"
    work_permit_alert_days            = "60"
    residency_alert_days              = "60"
    passport_alert_days               = "90"

  leave:
    annual_leave_accrual              = "monthly"
    sick_leave_cert_required_after    = "2"
    allow_leave_without_balance       = "false"
    hajj_leave_min_service_years      = "5"

  general:
    company_name_ar  = "شركة ZenJO"
    company_name_en  = "ZenJO Company"
    currency         = "JOD"
    date_format      = "DD/MM/YYYY"
    timezone         = "Asia/Amman"

--- TABLE 19: pre_employment_records ---
  employee_id FK (links to employee created as 'probation' status),
  probation_start_date DATE, probation_end_date DATE (3 months),
  evaluation_status (pending/approved/rejected),
  evaluated_by_id FK users, evaluation_date DATE,
  evaluation_notes TEXT,
  ssc_registration_required_month INT (calculated per Jordanian SSC rule),
  ssc_registered BOOLEAN DEFAULT false,
  ssc_registration_date DATE,
  outcome (approved_to_active/rejected_to_clearance)

--- TABLE 20: resignations ---
  employee_id FK, resignation_date DATE, last_working_day DATE,
  notice_period_days INT DEFAULT 30,
  notice_timer_start DATE, notice_timer_end DATE,
  reason TEXT, resignation_letter_url VARCHAR,
  status (pending/active_notice/completed/cancelled),
  clearance_completed BOOLEAN DEFAULT false,
  clearance_completed_date DATE,
  hr_acknowledged_by_id FK, hr_acknowledged_at TIMESTAMPTZ

--- TABLE 21: clearance_records ---
  employee_id FK, resignation_id FK (nullable),
  termination_reason (resignation/termination/retirement/contract_end),
  clearance_status (pending/in_progress/completed),
  clearance_items JSON (array of dept sign-offs),
  eosb_amount NUMERIC(12,3),
  final_settlement_amount NUMERIC(12,3),
  hr_notes TEXT, completed_by_id FK, completed_at TIMESTAMPTZ

--- TABLE 22: disciplinary_actions ---
  employee_id FK, violation_type VARCHAR, violation_date DATE,
  violation_description TEXT,
  penalty_type (warning_written/half_day/one_day/two_days/three_days/written_notice/final_notice),
  penalty_days NUMERIC(3,1),
  action_deadline DATE (violation_date + 14 days — from system config),
  issued_by_id FK, issued_date DATE,
  status (pending/issued/appealed/cancelled),
  employee_acknowledgment BOOLEAN DEFAULT false,
  notes TEXT,
  previous_violations_count INT DEFAULT 0,
  form_generated BOOLEAN DEFAULT false,
  form_url VARCHAR

  NOTE: Cannot issue disciplinary actions on weekend days or public holidays.
  System validates: issued_date must not be Friday, Saturday, or in public_holidays table.

--- TABLE 23: violation_types ---
  name_ar, name_en, code VARCHAR UNIQUE,
  available_penalties JSON (ordered array of penalty types),
  is_active BOOLEAN

  SEED ALL violations and their available penalty progression:
  1.  تأخير / Late Arrival
      penalties: ["warning_written","half_day","one_day","three_days","written_notice","final_notice"]
  2.  غياب بدون عذر / Absence Without Excuse
      penalties: ["warning_written","one_day","three_days","written_notice","final_notice"]
  3.  تواجد في أماكن غير مخصصة / Unauthorized Location
      penalties: ["warning_written","half_day","one_day","two_days","written_notice","final_notice"]
  4.  تعمد تخفيض الإنتاج / Deliberate Reduced Output
      penalties: ["three_days","written_notice","final_notice"]
  5.  النوم أثناء الدوام / Sleeping During Work
      penalties: ["one_day","two_days","written_notice","final_notice"]
  6.  تناول مأكولات في أماكن غير مخصصة / Eating in Unauthorized Areas
      penalties: ["half_day","one_day","two_days","three_days","written_notice","final_notice"]
  7.  تشاجر / Fighting
      penalties: ["two_days","three_days","written_notice","final_notice"]
  8.  عدم مراعاة تعليمات السلامة / Safety Violation
      penalties: ["two_days","three_days","written_notice","final_notice"]
  9.  إدخال مشروبات كحولية / Bringing Alcohol
      penalties: ["two_days","three_days","written_notice","final_notice"]
  10. حمل سلاح غير مصرح / Unauthorized Weapon
      penalties: ["two_days","three_days","written_notice","final_notice"]
  11. التدخين في أماكن غير مسموح / Smoking Unauthorized Area
      penalties: ["two_days","three_days","written_notice","final_notice"]
  12. إساءة استعمال الأدوات / Equipment Misuse
      penalties: ["two_days","three_days","written_notice","final_notice"]
  13. الادعاء الكاذب بالمرض / Feigning Illness
      penalties: ["half_day","one_day","one_half_day","two_days"]
  14. قيادة مركبات الشركة بسرعة زائدة / Speeding Company Vehicle
      penalties: ["one_day","two_days","written_notice","final_notice"]
  15. عدم التقييد بتعليمات النظافة / Hygiene Violation
      penalties: ["warning_written","one_day","two_days","three_days","written_notice","final_notice"]
  16. عدم التقييد بالزي الرسمي / Dress Code Violation
      penalties: ["warning_written","half_day","one_day","written_notice","final_notice"]
  17. قبول هدايا بدون إذن / Accepting Gifts Without Permission
      penalties: ["two_days","three_days","written_notice","final_notice"]
  18. استقبال زيارات خاصة بدون إذن / Unauthorized Personal Visits
      penalties: ["warning_written","half_day","one_day","written_notice","final_notice"]
  19. التلاعب في الحضور / Attendance Fraud
      penalties: ["half_day","one_day","two_days","written_notice","final_notice"]
  20. التعامل بطريقة غير لائقة مع الزبائن / Inappropriate Customer Treatment
      penalties: ["two_days","three_days","written_notice","final_notice"]
  21. استعمال أدوات العمل لأغراض شخصية / Using Work Equipment Personally
      penalties: ["one_day","two_days","three_days","written_notice","final_notice"]
  22. رفض تنفيذ تعليمات العمل / Refusing Work Instructions
      penalties: ["one_day","two_days","written_notice","final_notice"]

--- TABLE 24: public_holidays ---
  name_ar, name_en, date DATE, type (national/religious/official),
  is_recurring BOOLEAN, year INT, notes TEXT

  SEED Jordanian holidays:
    01 Jan — رأس السنة الميلادية / New Year's Day (recurring)
    01 May — عيد العمال / Labour Day (recurring)
    25 May — عيد الاستقلال / Independence Day (recurring)
    10 Jun — يوم الجيش / Army Day (recurring)
    + Eid Al-Fitr 3 days (variable — input per year)
    + Eid Al-Adha 3 days (variable)

--- TABLE 25: salary_advances ---
  employee_id FK, amount NUMERIC(12,3), reason TEXT,
  request_date DATE, approved_by_id FK, status (pending/approved/rejected/deducted),
  deducted_in_run_id FK, notes TEXT

--- TABLE 26: notifications ---
  user_id FK, type (leave/overtime/document_expiry/payroll/compliance/disciplinary/pre_employment/system),
  title_ar, title_en, body_ar, body_en,
  entity_type VARCHAR, entity_id INT,
  is_read BOOLEAN DEFAULT false, read_at TIMESTAMPTZ

--- TABLE 27: activity_logs ---
  user_id FK, employee_id FK, action_type VARCHAR, entity_type VARCHAR,
  entity_id INT, description_ar TEXT, description_en TEXT,
  old_values JSON, new_values JSON, ip_address VARCHAR

--- TABLE 28: banks (Jordanian banks lookup) ---
  name_ar, name_en, swift_code, iban_prefix, is_active
  SEED ALL Jordanian banks:
    البنك العربي / Arab Bank (ARABJO)
    بنك الأردن / Bank of Jordan (BOJOJO)
    البنك الأهلي الأردني / Jordan Ahli Bank (NAHBJO)
    البنك التجاري الأردني / Jordan Commercial Bank (JCMBJO)
    بنك الإسكان / Housing Bank (HBOSJO)
    بنك القاهرة عمان / Cairo Amman Bank (CABKJO)
    البنك الأردني الكويتي / Jordan Kuwait Bank (JOKBJO)
    البنك الإسلامي الأردني / Jordan Islamic Bank (JIBAJOAX)
    البنك الاستثماري / Arab Jordan Investment Bank (AIJBJO)
    بنك الاتحاد / Union Bank (UBSIJOAM)
    بنك كابيتال / Capital Bank (CBJOJOAM)
    البنك المركزي الأردني (reference only)
    HSBC الأردن, Citibank Jordan, سيتي بنك
    المصرف الإسلامي العربي الدولي / Islamic International Arab Bank
    بنك الخليج الأردني / Jordan Gulf Bank
    بنك صفوة الإسلامي / Safwa Islamic Bank

--- TABLE 29: governorates (12 Jordanian governorates) ---
  name_ar, name_en, code, is_active
  SEED: عمان/Amman(AMM), إربد/Irbid(IRB), الزرقاء/Zarqa(ZRQ),
        البلقاء/Balqa(BLQ), مادبا/Madaba(MDQ), الكرك/Karak(KRK),
        الطفيلة/Tafilah(TFL), معان/Maán(MAN), العقبة/Aqaba(AQJ),
        عجلون/Ajloun(AJL), جرش/Jerash(JRS), المفرق/Mafraq(MFQ)

--- TABLE 30: cities ---
  name_ar, name_en, governorate_id FK, is_active
  SEED ~80 major Jordanian cities

--- TABLE 31: nationalities ---
  name_ar, name_en, country_code VARCHAR(2), is_active
  SEED: أردني(JO), فلسطيني(PS), مصري(EG), سوري(SY), عراقي(IQ),
        سعودي(SA), يمني(YE), لبناني(LB), سريلانكي(LK),
        فلبيني(PH), هندي(IN), باكستاني(PK), بنغلاديشي(BD),
        إندونيسي(ID), أمريكي(US), بريطاني(GB) + 30 more

--- TABLE 32: employee_compliance_status ---
  employee_id FK, document_type VARCHAR, status (compliant/non_compliant/pending/not_applicable/expiring_soon/expired),
  last_checked DATE, notes TEXT, reviewed_by_id FK

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4: BUSINESS RULES & WORKFLOWS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━
4.1 PRE-EMPLOYMENT WORKFLOW (ما قبل التعيين / فترة التجربة)
━━━━━━━━━━━━━━

This is the core Jordanian onboarding flow. Duration: 3 months.
The HR admin manages this. At end of 3 months: Approve → becomes active employee,
OR Reject → goes to clearance/termination.

FLOW:
  1. HR creates employee with status = 'probation'
  2. System auto-creates pre_employment_record:
       probation_start_date = hire_date
       probation_end_date   = hire_date + 90 days
       evaluation_status    = 'pending'
  
  3. SSC REGISTRATION RULE (Jordanian SSC Law — CRITICAL):
     RULE: Employee must be registered with Social Security BEFORE probation ends.
     
     SSC Registration Month calculation:
       IF hire_date.day >= 1 AND hire_date.day <= 16:
         ssc_registration_month = hire_date.month (SAME month)
         ssc_registration_year  = hire_date.year
       IF hire_date.day >= 17:
         ssc_registration_month = hire_date.month + 1 (NEXT month)
         ssc_registration_year  = hire_date.year (or +1 if December)
     
     Examples:
       Hired 05/02/2026 → SSC month: February 2026 (same month)
       Hired 19/02/2026 → SSC month: March 2026 (next month)
       Hired 01/07/2026 → SSC month: July 2026 (same month)
     
     Display on pre-employment screen:
       "تاريخ التسجيل المطلوب في الضمان: شهر [month name] [year]"
     
     If ssc_registered = false AND today > ssc_registration_deadline:
       Show RED warning: "يجب تسجيل الموظف في الضمان الاجتماعي فوراً!"
       Show button: 🔗 "التسجيل في موقع الضمان الاجتماعي"
         Link to: https://www.ssc.gov.jo
     
     When HR admin marks ssc_registered = true → store ssc_registration_date

  4. Pre-Employment Dashboard screen shows:
     - All employees currently in probation status
     - For each: Name | Hire Date | Probation End | Days Remaining | SSC Status | Actions
     - Color-coded countdown: Green (>30 days) / Yellow (8–30 days) / Red (<7 days)
     - SSC Badge: ✅ Registered | ⚠️ Due Soon | 🔴 Overdue | 🔗 Register Now link
     - Actions: [Evaluate] [Register SSC] [View Profile]
  
  5. At evaluation:
     HR opens evaluation modal with:
       - Employee name, probation period dates
       - SSC status (must be registered to approve)
       - Performance rating (1–5)
       - Evaluation notes
       - Decision: [✅ Approve — Confirm Employment] [❌ Reject — Proceed to Clearance]
     
     IF Approved:
       employee.employment_status → 'active'
       employee.probation_status  → 'completed'
       pre_employment_record.outcome = 'approved_to_active'
       pre_employment_record.evaluation_status = 'approved'
       Create notification to employee: "تم تثبيتك في العمل بتاريخ [date]"
       Log activity: "تثبيت الموظف [name]"
     
     IF Rejected:
       employee.employment_status → 'terminated'
       pre_employment_record.outcome = 'rejected_to_clearance'
       Auto-create clearance_record
       Navigate HR to clearance form for this employee
       Create notification to HR team: "تم رفض تثبيت [name] — يرجى إتمام المخالصة"

━━━━━━━━━━━━━━
4.2 LEAVE APPROVAL WORKFLOW (2-Step)
━━━━━━━━━━━━━━

  Employee submits → status = 'pending'
    → Notification: direct_manager + hradmin
  
  Manager approves (step 1) → status = 'manager_approved'
    → Notification: hradmin
  
  HR approves (step 2) → status = 'approved'
    → leave_balances.used_days += total_days
    → attendance_records created for leave period with status = 'on_leave'
    → Notification: employee
  
  Reject at any step → status = 'rejected', rejection_step = 'manager'|'hr'
    → Notification: employee with rejection_reason

  Business Rules:
    - Annual leave during probation: BLOCKED
      Check: if employment_status = 'probation' AND leave_type = 'annual' → reject
    - Balance check: remaining_days >= total_days (unless allow_leave_without_balance = true)
    - Sick leave >2 days: flag requires_medical_cert = true on request
    - Maternity: 70 consecutive days, female only, no splitting allowed
    - Hajj: once_in_career check against past leave history, min 5 years service
    - Overlap check: no overlapping approved/pending leaves for same employee dates
    - Emergency leave: manager can bypass step 2 (configurable flag)

━━━━━━━━━━━━━━
4.3 OVERTIME WORKFLOW (2-Step — same as leave)
━━━━━━━━━━━━━━

  Same pending → manager_approved → approved flow.
  
  After approval:
    IF compensation_type = 'pay':
      overtime_amount = hours × (basic_salary / 176) × applicable_rate
      Where: 176 = 22 working days × 8 hours (standard monthly hours)
      Rate: weekday = 1.25×, weekend/holiday = 1.5×
    IF compensation_type = 'compensatory_leave':
      Add days to leave_balances for compensatory leave type
  
  Payroll integration:
    On payroll run creation: auto-pull approved OT for the month → payslip.overtime_amount

━━━━━━━━━━━━━━
4.4 DISCIPLINARY ACTIONS (لجان المخالفات)
━━━━━━━━━━━━━━

  SCREEN: /disciplinary

  WORKFLOW:
    1. HR selects employee from dropdown
    2. Selects violation type from seeded list (Section 3, TABLE 23)
    3. Enters violation date
    4. System shows: employee's violation history (previous disciplinary_actions)
       Based on history count, system highlights recommended next penalty in progression
    5. HR selects penalty from available_penalties for that violation type
       (penalties are ordered — system shows current position in progression)
    6. System auto-calculates:
       action_deadline = violation_date + disciplinary_action_window_days (config: 14)
    7. WARNING: if today is within 3 days of action_deadline:
       "⚠️ تنبيه: الإجراء يجب اتخاذه قبل [date] — أي [N] أيام فقط"
    8. HR clicks [إصدار القرار] → system validates:
       a. issued_date must NOT be Friday or Saturday
       b. issued_date must NOT be in public_holidays table
       If invalid: "لا يمكن إصدار الإجراء في أيام العطل والأعياد الرسمية"
    9. On confirmation: disciplinary_action created with status = 'issued'
    10. Auto-generate printable form (HTML → Print):
       Form includes: company header, employee name/code/dept/job, violation type,
       violation date, penalty decision, signature lines, date
    11. Show preview of form in modal with [🖨️ طباعة] button
    
  EMPLOYEE HISTORY PANEL (on same screen):
    Before issuing new action, show sidebar/section:
    "سجل المخالفات السابقة للموظف"
    Table: Date | Violation | Penalty | Status
    Count badge: "[N] مخالفة سابقة"

  RULES:
    - 14-day window from violation date (system_configurations.disciplinary_action_window_days)
    - No action on weekends (Friday/Saturday) or public holidays
    - Penalty deduction (half_day, 1 day, etc.) auto-linked to next payroll run
    - Deduction: penalty_days × (basic_salary / working_days_in_month)

━━━━━━━━━━━━━━
4.5 RESIGNATION & CLEARANCE (الاستقالة والمخالصة)
━━━━━━━━━━━━━━

  RESIGNATION SCREEN: /resignations

  When employee submits resignation (or HR records it):
    1. resignation_date = today
    2. notice_timer_start = resignation_date
    3. last_working_day = resignation_date + notice_period_days (config: 30 days)
    4. employee.employment_status = 'resigned'
    5. Create resignation record with status = 'active_notice'
    6. Create countdown timer entry

  RESIGNATIONS MANAGEMENT SCREEN shows:
    Card per resigning employee with:
    ┌──────────────────────────────────────────────────┐
    │ 🧑 Ahmed Al-Ali | EMP-0001 | HR Department       │
    │ تاريخ الاستقالة: 01/04/2026                      │
    │ آخر يوم دوام:    01/05/2026                      │
    │                                                  │
    │ ⏱️ COUNTDOWN TIMER                               │
    │ [===========         ]  22 يوماً متبقٍ           │
    │                                                  │
    │ تمت المخالصة: ❌ لا                              │
    │ [إتمام المخالصة] [عرض الملف]                    │
    └──────────────────────────────────────────────────┘
    
    Timer: Live countdown showing days remaining, color-coded:
      > 15 days: green
      8–15 days: yellow/amber
      < 7 days:  red (urgent)
      0 days:    "انتهت فترة الإشعار — يجب إتمام المخالصة"
    
    All info shown: Name, Code, Dept, Job Title, Hire Date, Resignation Date,
                    Notice End Date, Countdown, Clearance Status

  CLEARANCE COMPLETION:
    HR clicks [إتمام المخالصة] → opens clearance form:
      - Employee info summary
      - EOSB Calculation (auto):
          years = (last_working_day - hire_date) / 365.25
          IF years < 1: eosb = 0
          IF resignation AND years < 3: eosb = 0
          IF resignation AND years >= 3: eosb = basic_salary × years × (1/12)
          IF termination: eosb = basic_salary × years × 1
        Display: "مكافأة نهاية الخدمة: [amount] JOD"
      - Final settlement: net salary owed + EOSB - any advances
      - Checklist: [ ] تسليم الأصول  [ ] إلغاء بطاقة المرور  [ ] حذف الصلاحيات  [ ] توقيع المخالصة
      - Notes, completion date
      - [اعتماد المخالصة] → clearance_completed = true, status = 'completed'
      - employee.employment_status = 'terminated'
    
  GENERATE clearance form printout on completion (see Section 5 — Forms).

━━━━━━━━━━━━━━
4.6 PAYROLL CALCULATION (reads all values from system_configurations)
━━━━━━━━━━━━━━

  For each active employee:
  
  gross = basic_salary + housing + transport + mobile + meal + other_allowances
          + overtime_amount (approved OT this month) + bonus_amount
  
  SSC Deduction (if not exempt):
    insurable_salary = MIN(basic_salary, ssc_max_insurable_salary)
    ssc_deduction = insurable_salary × (ssc_employee_rate / 100)
  
  Income Tax (progressive, Jordanian brackets):
    annual_gross = gross × 12
    exemptions = income_tax_personal_exemption
    IF family_tax_exemption: exemptions += income_tax_family_exemption
    exemptions += employee.tax_exemption_amount
    taxable_annual = MAX(0, annual_gross - exemptions)
    Apply brackets from income_tax_brackets JSON config
    income_tax_monthly = annual_tax / 12
  
  Deductions:
    absence_deduction = (basic_salary / working_days_month) × absent_days
    late_deduction    = penalty deductions from disciplinary_actions this month
    advance_deduction = from approved salary_advances
    total_deductions  = ssc + tax + absence + late + advance + other
  
  net_salary = gross - total_deductions

━━━━━━━━━━━━━━
4.7 HEALTH CERTIFICATES & CRIMINAL CLEARANCE
━━━━━━━━━━━━━━

  HEALTH CERTIFICATE (شهادة صحية):
  
    Required industries: from system_configurations.health_cert_required_industries
    Default: food_service, healthcare, hospitality, education
    
    HR Admin inputs for each employee:
      - health_certificate_number (رقم الشهادة الصحية)
      - health_certificate_expiry (تاريخ انتهاء الشهادة — 1 year from issue)
      - health_certificate_issuer (جهة الإصدار — e.g. وزارة الصحة)
      - health_certificate_active = true
    
    If employee does NOT have health certificate:
      Show: 🔗 "استخراج شهادة صحية — موقع وزارة الصحة الأردنية"
      Link: https://www.moh.gov.jo
    
    Alerts: 30 days before expiry → notify HR + employee
    
  CRIMINAL CLEARANCE (عدم المحكومية):
  
    Required for ALL employees upon hire.
    Validity: 6 months (system_configurations.criminal_clearance_validity_months)
    
    HR Admin inputs:
      - criminal_clearance_number (رقم وثيقة عدم المحكومية)
      - criminal_clearance_date (تاريخ الإصدار)
      - criminal_clearance_expiry (auto: issued_date + 6 months)
    
    If employee does NOT have criminal clearance:
      Show: 🔗 "استخراج وثيقة عدم المحكومية — الموقع الرسمي"
      Link: https://www.moj.gov.jo (وزارة العدل الأردنية)
    
    Alert: when certificate is 3 months old (halfway) → flag for renewal
    Alert: when expired → RED badge, HR notification

  COMPLIANCE SECTION SCREENS:
    Two sub-screens accessible from Compliance menu:
    
    Screen A: الشهادات الصحية (Health Certificates)
    ─────────────────────────────────────────────────
    Table showing ALL employees with:
      Columns: الاسم | رقم الوطني / جواز السفر / رقم الهوية | الجنسية |
               تاريخ تفعيل الشهادة | تاريخ انتهاء الشهادة | الحالة | إجراءات
      
      Status badges:
        🟢 سارية (valid)
        🟡 تنتهي قريباً (expiring within 30 days)
        🔴 منتهية (expired)
        🔵 غير مسجلة (no certificate — with link to MOH)
        ⚪ غير مطلوبة (N/A — industry doesn't require)
      
      For employees without cert: show [🔗 موقع وزارة الصحة] button
      HR can click [تسجيل/تجديد] to enter/update certificate details
      
      NOTE: Display national_id for Jordanians, passport_number for non-Jordanians
    
    Screen B: عدم المحكومية (Criminal Clearance)
    ─────────────────────────────────────────────
    Same structure as health certificates table:
      Columns: الاسم | رقم الوطني / رقم الجواز | الجنسية |
               تاريخ الإصدار | تاريخ الانتهاء | الحالة (بالشهور) | إجراءات
      
      Age display: "صادرة منذ X أشهر" (months since issuance)
      Status badges: سارية / قيد الانتهاء / منتهية / مطلوبة
      For employees without it: [🔗 موقع وزارة العدل الأردنية] button
      HR can enter/update clearance details inline

━━━━━━━━━━━━━━
4.8 WORK PERMITS (تصاريح العمل) — Non-Jordanians ONLY
━━━━━━━━━━━━━━

  Rule: If nationality_code = 'JO' (أردني): NO work permit required (fields hidden)
  Exception per Jordanian law: أبناء أردنيات (sons of Jordanian mothers, non-Jordanian father)
    → They also do NOT need a work permit. Field: permit_exempt_sons_of_jordanians BOOLEAN
  
  All other nationalities: work permit REQUIRED
  
  Display on employee profile compliance tab:
    - permit_number (رقم التصريح), permit_start, permit_expiry, permit_category
    - Identity shown: national_id for Jordanians, passport_number OR residency_number for non-Jordanians
    - Days remaining until expiry (colored counter)
    - Alert 60 days before expiry: notify HR + employee
    - Expired: RED badge "تصريح منتهي — يجب التجديد"
  
  Work Permit list in Compliance dashboard:
    Filter: All | Valid | Expiring | Expired | Missing
    Show: Employee | Nationality | Permit No. | Start | Expiry | Days Left | Status

━━━━━━━━━━━━━━
4.9 SSC (الضمان الاجتماعي) INTEGRATION
━━━━━━━━━━━━━━

  Employee fields: ssc_number, ssc_enrollment_date, ssc_enrollment_month,
                   is_ssc_enrolled, is_ssc_exempt
  
  On Pre-Employment screen: shows calculated registration month
  On Employee profile: SSC status prominently displayed
  If not enrolled: [🔗 التسجيل في الضمان الاجتماعي] → https://www.ssc.gov.jo
  
  Payroll: Uses ssc_employee_rate (7.5%) and ssc_employer_rate (14.25%)
           Applied on MIN(basic_salary, 3000 JOD)
  
  SSC Report: Monthly report per employee showing:
    Employee | SSC# | Basic Salary | Insurable Amount | Employee Share | Employer Share
    Exportable for SSC submission

━━━━━━━━━━━━━━
4.10 EOSB (مكافأة نهاية الخدمة) — Jordanian Labour Law Art. 87
━━━━━━━━━━━━━━

  Calculate when employee leaves (resignation, termination, retirement):
  
    years_of_service = (last_working_day - hire_date) / 365.25
    
    IF years_of_service < 1: eosb = 0 (less than 1 year → no entitlement)
    
    IF termination_reason = 'resigned':
      IF years_of_service < 3: eosb = 0
      IF years_of_service >= 3: eosb = basic_salary × years_of_service / 12
    
    IF termination_reason IN ('terminated', 'retired', 'contract_end'):
      eosb = basic_salary × years_of_service (1 month per year)
    
    Display breakdown in clearance form:
      "سنوات الخدمة: X سنة و Y شهر"
      "مكافأة نهاية الخدمة: [amount] JOD"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 5: FORMS (النماذج) — PRINTABLE OFFICIAL FORMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Build a Forms module accessible to superadmin and hradmin.
Each form: prefill from employee data, display print-ready HTML, [🖨️ طباعة] button.

FORMS LIST (/forms):

  1. نموذج إجازة ومغادرة | Leave & Exit Request Form
     Fields: Employee info, leave type, dates, duration, reason, signature lines

  2. نموذج استقالة | Resignation Form
     Fields: Employee info, resignation date, last working day, reason, formal Arabic text

  3. نموذج طلب توظيف | Job Application Form
     Fields: Personal info, education, experience, skills, references

  4. نموذج كتاب تعيين | Appointment Letter
     Fields: Employee name, job title, department, salary components, start date, contract type
     Auto-generated on employee activation from probation

  5. نموذج عقد عمل | Employment Contract
     Fields: Full employment contract per Jordanian Labour Law (both parties, terms, salary, benefits, notice period)

  6. نموذج طلب سلفة | Salary Advance Request Form
     Fields: Employee info, amount, reason, deduction schedule, signature

  7. نموذج تسليم أمانة | Asset Handover Form
     Fields: Employee, asset name/serial/category, condition, date, signatures (employee + HR)

  8. نموذج استلام تصريح عمل | Work Permit Receipt Form
     Fields: Employee, nationality, permit number, issue date, expiry, signature

  9. نموذج استعلام جواز سفر | Passport Information Form
     Fields: Request for employee's passport details, purpose, declaration

  10. نموذج لجنة تحقيق | Investigation Committee Form
      Fields: Employee info, incident details, committee members, findings, recommendations

  11. نموذج كتاب إنهاء خدمات | Termination Letter
      Fields: Employee info, termination date, reason, EOSB calculation, signature

  12. نموذج مخالصة | Final Settlement / Clearance Form
      Fields: Employee info, service period, EOSB, remaining salary, deductions, final amount,
              clearance checklist (assets returned, access revoked, documents signed)

  13. نموذج شهادة خبرة | Experience Certificate
      Fields: Company letterhead, employee name, job title, service period, character note

  14. نموذج قرارات إدارية | Administrative Decision Form
      Fields: Decision number, date, regarding (employee), decision text, authority signature

  15. نموذج مروس | Memo Form (مذكرة داخلية)
      Fields: To/From/Date/Subject/Body/Signature

  16. نموذج قرار المخالفة (Disciplinary Action Form — auto-generated from Section 4.4):
      Fields: Company header, employee info, violation type/date/description,
              penalty decision, action deadline note, signature lines
      AUTO NOTE: "يُلاحظ أنه يتبقى [N] يوماً على انتهاء فترة اتخاذ الإجراء المحددة بـ 14 يوماً"

  FORMS UI:
    Main /forms page: grid of form cards with icon + name
    Click card → modal with employee search dropdown (search by name/code)
    After selecting employee → form opens with prefilled data, editable, [طباعة] button
    Forms module link also accessible from employee profile page

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 6: EMPLOYEE LIST SCREEN — REQUIRED COLUMNS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The employees list (/employees) MUST show these fields per Jordanian HR requirements:

  DEFAULT VISIBLE COLUMNS:
    الرمز (Code) | الاسم (Full Name AR) | القسم (Dept) | المسمى (Job Title) |
    الجنسية (Nationality) | رقم الوطني / الجواز / الهوية (ID Number) |
    تاريخ الميلاد (DOB) | العمر (Age) | الجنس (Gender) |
    رقم الهاتف (Personal Phone) | عنوان السكن (Address/Governorate) |
    الحالة (Status) | الراتب الأساسي (Basic Salary — MASKED for non-finance)

  ID NUMBER DISPLAY LOGIC:
    IF nationality_code = 'JO': show national_id (رقم الوطني)
    ELSE: show passport_number OR residency_number (labeled accordingly)

  SALARY VISIBILITY:
    superadmin + hradmin + payrolladmin: salary column visible
    manager + employee + recruiter: salary column hidden (shows "—" or not rendered)

  FILTERS:
    Search by: name, code, email
    Filter by: Department, Status, Nationality, Gender, Employment Type
    Filter by compliance: "شهادة صحية منتهية", "تصريح عمل منتهي"

  QUICK ACTIONS per row:
    👁️ View profile | ✏️ Edit (hr/super only) | 🔴 Deactivate (hr/super only)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 7: FRONTEND PAGES & NAVIGATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALL ROUTES:
  /login                         → Public
  /                              → Dashboard (role-differentiated)
  /employees                     → Employees list (with all columns per Section 6)
  /employees/new                 → Add employee wizard (4 steps)
  /employees/:id                 → Employee profile (tabbed)
  /employees/:id/edit            → Edit employee
  /pre-employment                → Pre-Employment / Probation management
  /departments                   → Departments CRUD
  /job-titles                    → Job Titles CRUD
  /attendance                    → Attendance clock-in/out + records
  /leave/requests                → Leave requests
  /leave/policies                → Leave policies config
  /overtime                      → Overtime requests
  /payroll/runs                  → Payroll runs
  /payroll/runs/:id              → Payroll run detail + payslips
  /payroll/slips                 → Individual payslips
  /disciplinary                  → Disciplinary actions
  /resignations                  → Resignations + countdown timers
  /clearance                     → Clearance management
  /compliance                    → Compliance overview
  /compliance/work-permits       → Work permits tracker
  /compliance/health-certs       → Health certificates (شهادات صحية)
  /compliance/criminal-clearance → Criminal clearance (عدم محكومية)
  /documents                     → Employee documents
  /assets                        → Assets management
  /forms                         → Printable forms
  /holidays                      → Public holidays
  /settings                      → System configuration
  /notifications                 → Notifications
  /reports                       → Reports

SIDEBAR NAVIGATION (RTL, Arabic labels, role-based):

  superadmin / hradmin:
    لوحة التحكم | الموظفون | ما قبل التعيين | الحضور والغياب | الإجازات |
    العمل الإضافي | الرواتب | المخالفات | الاستقالات والمخالصات |
    الامتثال [sub: تصاريح العمل · الشهادات الصحية · عدم المحكومية] |
    الوثائق | الأصول | النماذج | التقارير | الإعدادات

  payrolladmin:
    لوحة التحكم | الموظفون | الرواتب | كشوف الرواتب | التقارير | الإعدادات

  manager:
    لوحة التحكم | موظفو الفريق | الحضور | الإجازات | العمل الإضافي

  employee:
    لوحة التحكم | حضوري | إجازاتي | عمل إضافي | راتبي | وثائقي

  recruiter:
    لوحة التحكم | إضافة موظف | الأقسام | المسميات الوظيفية

EMPLOYEE PROFILE TABS (:id):
  1. المعلومات الشخصية (Personal — includes phone, address, DOB, age, nationality, ID)
  2. تفاصيل التوظيف (Employment)
  3. الراتب والمزايا (Salary — superadmin/hr/payroll ONLY)
  4. البنك والضمان (Bank & SSC — superadmin/hr/payroll ONLY)
  5. الامتثال (Compliance — work permit, health cert, criminal clearance, residency)
  6. الوثائق (Documents)
  7. الحضور (Attendance history)
  8. الإجازات (Leave history + balances)
  9. كشوف الرواتب (Payslips — restricted)
  10. السجل التأديبي (Disciplinary history)
  11. ما قبل التعيين (Pre-Employment tab — shows if probation_status was tracked)

DASHBOARD (superadmin/hradmin) KPI CARDS Row 1:
  إجمالي الموظفين | موظفون جدد هذا الشهر | إجازات معلقة |
  عمل إضافي معلق

DASHBOARD Row 2 (compliance alerts):
  🔴 تصاريح منتهية | 🟡 وثائق تنتهي قريباً | ✅ في فترة التجربة | ⏰ استقالات نشطة

DASHBOARD Row 3:
  Headcount by Dept (bar chart) + Leave by type (donut) + Payroll trend (line)

DASHBOARD Row 4:
  Recent activity feed + Compliance alert cards (top 5 urgent)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 8: API ENDPOINTS (all under /api/v1/)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AUTH:
  POST /auth/login | POST /auth/refresh | POST /auth/logout | GET /auth/me
  PATCH /auth/change-password

EMPLOYEES:
  GET /employees | POST /employees | GET /employees/:id | PATCH /employees/:id
  DELETE /employees/:id | PATCH /employees/:id/status
  GET /employees/:id/compliance | GET /employees/:id/documents
  GET /employees/:id/payslips | GET /employees/:id/disciplinary

PRE-EMPLOYMENT:
  GET /pre-employment         → all probation employees with SSC status
  GET /pre-employment/:id     → single record
  PATCH /pre-employment/:id/ssc-register   → mark SSC registered
  POST /pre-employment/:id/evaluate        → approve/reject with outcome

DEPARTMENTS & JOB TITLES:
  GET/POST/PATCH/DELETE /departments | /job-titles

ATTENDANCE:
  GET /attendance | POST /attendance/clock-in | POST /attendance/clock-out
  GET /attendance/my-today | GET /attendance/summary | PATCH /attendance/:id

LEAVE:
  GET /leave/types | GET /leave/policies | PATCH /leave/policies/:id
  GET /leave/balances | GET/POST /leave/requests
  GET/PATCH/DELETE /leave/requests/:id
  POST /leave/requests/:id/approve | POST /leave/requests/:id/reject

OVERTIME:
  GET/POST /overtime | GET/PATCH/DELETE /overtime/:id
  POST /overtime/:id/approve | POST /overtime/:id/reject

PAYROLL:
  GET/POST /payroll/runs | GET /payroll/runs/:id
  POST /payroll/runs/:id/approve | POST /payroll/runs/:id/mark-paid
  GET /payroll/slips | GET /payroll/slips/:id

DISCIPLINARY:
  GET /disciplinary          → list all (scoped)
  POST /disciplinary         → create action (validates weekday/non-holiday)
  GET /disciplinary/:id
  GET /disciplinary/employee/:employeeId  → employee's history
  GET /violation-types       → seeded list with penalties
  POST /disciplinary/:id/generate-form    → generate printable form

RESIGNATIONS:
  GET /resignations          → list with countdown data
  POST /resignations         → record resignation
  GET /resignations/:id
  PATCH /resignations/:id/complete-clearance

CLEARANCE:
  GET /clearance | POST /clearance | GET /clearance/:id
  PATCH /clearance/:id/complete | GET /clearance/:id/eosb-calculation

COMPLIANCE:
  GET /compliance/overview
  GET /compliance/work-permits
  GET /compliance/health-certs
  GET /compliance/criminal-clearance
  PATCH /compliance/:employeeId/health-cert    → HR updates cert details
  PATCH /compliance/:employeeId/criminal-clearance

DOCUMENTS:
  GET/POST /documents | PATCH/DELETE /documents/:id
  GET /documents/expiring | GET /document-types

ASSETS:
  GET/POST /assets | PATCH/DELETE /assets/:id
  POST /assets/:id/assign | POST /assets/:id/return
  GET /asset-categories

FORMS:
  GET /forms/types           → list of 16 form types
  GET /forms/generate/:formType?employeeId=   → prefilled form data JSON
  POST /forms/log            → log form generation in activity

SALARY ADVANCES:
  GET/POST /advances | POST /advances/:id/approve | POST /advances/:id/reject

PUBLIC HOLIDAYS:
  GET/POST/PATCH/DELETE /holidays

NOTIFICATIONS:
  GET /notifications | PATCH /notifications/:id/read | PATCH /notifications/read-all

CONFIG:
  GET /config | PATCH /config/:key | PATCH /config (batch)

REPORTS:
  GET /reports/headcount | /reports/payroll-trend | /reports/leave-analysis
  GET /reports/attendance-summary | /reports/turnover | /reports/compliance
  GET /reports/ssc-contribution | /reports/income-tax-summary

LOOKUPS:
  GET /lookups/banks | /lookups/governorates | /lookups/cities?governorate_id=
  GET /lookups/nationalities | /lookups/violation-types

DASHBOARD:
  GET /dashboard/summary | /dashboard/headcount | /dashboard/leave-chart
  GET /dashboard/payroll-chart | /dashboard/recent-activity | /dashboard/compliance-alerts
  GET /dashboard/pre-employment-summary | /dashboard/resignations-active

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 9: UI DESIGN SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Colors (CSS variables):
  --primary:       #1B4332  (dark forest green — buttons, active nav, badges)
  --primary-hover: #15362A
  --primary-light: #D1FAE5  (light green backgrounds)
  --accent:        #34D399  (emerald — active states)
  --warning:       #F59E0B  (amber — expiring soon)
  --danger:        #EF4444  (red — expired, errors)
  --info:          #3B82F6  (blue — pending)
  --bg-main:       #F8FFFE
  --sidebar-bg:    #111827  (dark sidebar)
  --sidebar-text:  #F9FAFB
  --text-primary:  #111827
  --text-secondary:#6B7280
  --border:        #E5E7EB
  --radius:        8px

Typography:
  Arabic headings: Noto Kufi Arabic (Google Fonts)
  Arabic body:     Noto Naskh Arabic
  English:         Plus Jakarta Sans

RTL/LTR:
  Default: RTL Arabic. Toggle in header stores in localStorage.zenjo_lang
  document.dir = 'rtl' | 'ltr' on toggle
  All icons: flip horizontally in RTL where needed (chevrons, arrows)

Status Badges (reusable component):
  pending       → blue  "قيد الانتظار"
  manager_approved → light-green "موافقة المدير"
  approved      → green "موافق عليه"
  rejected      → red   "مرفوض"
  cancelled     → gray  "ملغي"
  expired       → red   "منتهي الصلاحية"
  expiring_soon → amber "ينتهي قريباً"
  valid         → green "ساري"
  pending_upload→ blue  "قيد الرفع"
  not_applicable→ gray  "لا ينطبق"
  draft         → gray  "مسودة"
  probation     → blue  "تجربة"
  active        → green "نشط"
  resigned      → orange "استقال"
  terminated    → red    "منهي الخدمة"

Countdown Timer Component (for resignations + pre-employment):
  Visual progress bar, colored by urgency
  Shows: "N يوماً متبقٍ" with live update
  Colors: green > 15 / amber 7-15 / red < 7

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 10: DEMO DATA SEED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Company: ZenJO HRMS | عمان، الأردن | قطاع: تقنية المعلومات
industry_type = 'technology' (health certs NOT required for this industry)

Demo accounts (bcrypt passwords):
  admin     / Admin@1234     → superadmin   → أحمد العلي    / Ahmed Al-Ali
  hr        / Hr@1234        → hradmin      → سارة محمود    / Sara Mahmoud
  payroll   / Payroll@1234   → payrolladmin → محمد الخطيب   / Mohammad Al-Khatib
  manager   / Manager@1234   → manager      → خالد النمر    / Khaled Al-Nemer
  employee  / Employee@1234  → employee     → ليلى حداد     / Layla Haddad
  recruiter / Recruiter@1234 → recruiter    → يوسف الراشد   / Yousef Al-Rashid

7 Seeded Employees:
  EMP-0001: Ahmed Al-Ali        | HR Manager     | HR  | أردني | hired 01/01/2020 | active | salary 1,500 JOD
  EMP-0002: Sara Mahmoud        | HR Specialist  | HR  | أردني | hired 15/03/2021 | active | salary 1,200 JOD
  EMP-0003: Mohammad Al-Khatib  | Software Dev   | IT  | أردني | hired 01/06/2019 | active | salary 1,800 JOD | direct_manager: EMP-0004
  EMP-0004: Khaled Al-Nemer     | Project Manager| IT  | أردني | hired 01/09/2017 | active | salary 2,500 JOD
  EMP-0005: Layla Haddad        | HR Specialist  | IT  | أردني | hired 10/01/2022 | active | salary 1,100 JOD | direct_manager: EMP-0004
  EMP-0006: Yousef Al-Rashid    | Ops Lead       | OPS | أردني | hired 01/05/2020 | active | salary 1,400 JOD
  EMP-0007: Ahmad Hassan        | Data Analyst   | IT  | مصري  | hired 01/02/2026 | probation
    → nationality_code: EG (non-Jordanian)
    → work_permit_number: WP-2026-007, expiry: 45 days from seed date
    → residency_number: RES-2026-007
    → criminal_clearance: issued on seed date (valid)
    → pre_employment_record: probation_end = hire_date + 90, ssc_registered = false
    → ssc_registration_required_month: calculate per rule (hired 01/02 → Feb 2026)

Demo compliance data (to show compliance alerts working):
  EMP-0005 Layla: criminal_clearance_date = 4 months ago (expiring alert)
  EMP-0007 Ahmad: work_permit_expiry = today + 45 days (amber — expiring soon)
  EMP-0006 Yousef: has no health_certificate (N/A — tech company)

Demo resignation:
  EMP-0003 Mohammad: resigned on 01/04/2026 → notice ends 01/05/2026 → show countdown timer

Demo disciplinary:
  EMP-0005 Layla: 1 previous violation (تأخير, warning_written, 3 months ago)

Seed 1 payroll run: April 2026, status: draft
Seed attendance records: last 7 days for all active employees
Seed 1 overtime request: EMP-0005 Layla, pending, weekday, 2.5h, reason: "deadline project"
Seed 1 leave request: EMP-0001 Ahmed, annual, next week, pending

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 11: SECURITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

JWT: access token 15min + refresh 7 days stored in DB
bcrypt cost factor 12
Account lockout: 5 failed logins → locked 30 min
Rate limiting: 100 req/min general, 10/min for /auth/login
Helmet security headers
CORS: frontend origin only
Password policy: min 8 chars, 1 uppercase, 1 number, 1 special char
All salary/bank/SSC fields masked for unauthorized roles
Zod validation on all inputs
Activity log: every state change with old/new values

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 12: JORDANIAN LAW REFERENCE TABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All configurable via system_configurations:

  Provision                           Value           Law Reference
  ──────────────────────────────────────────────────────────────────
  Annual leave (year 1-4)             14 days/year    Art. 61
  Annual leave (year 5+)              21 days/year    Art. 61
  Sick leave                          14 days/year    Art. 65
  Maternity leave                     70 consecutive  Art. 70
  Paternity leave                     3 days
  Hajj leave                          14 days (once)
  Bereavement leave                   3 days
  Emergency leave                     3 days
  Probation maximum                   90 days         Art. 30
  Notice period                       30 days minimum
  EOSB (termination)                  1 month/year    Art. 87
  EOSB (resignation ≥ 3 years)        proportional    Art. 87
  SSC employee contribution           7.5% of basic   SSC Law
  SSC employer contribution           14.25% of basic SSC Law
  SSC max insurable salary            3,000 JOD       SSC Law
  Minimum wage                        260 JOD/month
  Standard working hours              8h/day, 40h/week Art. 57
  Overtime weekday rate               1.25×            Art. 59
  Overtime weekend/holiday rate       1.5×             Art. 59
  Weekend days                        Friday + Saturday
  Disciplinary action window          14 days after violation
  No disciplinary on weekends/holidays                Labour Law
  Income tax personal exemption       9,000 JOD/year  Tax Law
  Income tax family exemption         9,000 JOD/year  Tax Law
  Income tax brackets                 0/5/10/15/20%   Tax Law
  Work permit required                All non-Jordanians Labour Law
  Sons of Jordanian mothers           Exempt from permit
  Criminal clearance required         All new hires
  Criminal clearance validity         6 months

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 13: BUILD COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pnpm install
pnpm --filter @workspace/db run push      # push schema
pnpm --filter @workspace/db run seed      # seed demo data
pnpm --filter @workspace/api-server run dev   # API on :8080
pnpm --filter @workspace/zenjo run dev        # Frontend on :3000
pnpm run build
pnpm run typecheck

DATABASE_URL must be set in Replit Secrets.
Run both servers in parallel via Replit workflow configuration.
```

---

## ملخص التغييرات في v3.1 (مقارنةً بالنظام الحالي)

| الميزة | النظام الحالي | v3.1 الجديد |
|--------|--------------|-------------|
| **مشكلة الصلاحيات** | خلل في تطبيق RBAC | ✅ matrix كامل + backend enforcement + frontend guards |
| **شاشة الشهادات الصحية** | غير موجودة | ✅ شاشة مستقلة مع رابط وزارة الصحة + إدخال HR |
| **شاشة عدم المحكومية** | غير موجودة | ✅ شاشة مستقلة مع رابط وزارة العدل + تتبع بالشهور |
| **ما قبل التعيين (3 أشهر)** | غير موجود | ✅ workflow كامل + تقييم + approve/reject |
| **قاعدة الضمان الاجتماعي** | بسيطة | ✅ حساب شهر التسجيل (1-16 / 17-آخر الشهر) مع رابط ssc.gov.jo |
| **الاستقالات + تايمر 30 يوم** | غير موجود | ✅ شاشة مع countdown timer لكل موظف |
| **المخالصة** | غير موجود | ✅ workflow كامل مع حساب EOSB |
| **المخالفات التأديبية** | غير موجود | ✅ 22 مخالفة + 6 عقوبات + تحقق من العطل + طباعة |
| **نموذج الـ 14 يوم** | غير موجود | ✅ تنبيه تلقائي في شاشة المخالفات |
| **النماذج الرسمية** | غير موجود | ✅ 16 نموذج قابل للطباعة |
| **تصاريح العمل** | جزئي | ✅ قاعدة أبناء أردنيات + رقم الوطني/جواز |
| **شاشة الموظفين** | تفاصيل محدودة | ✅ رقم الوطني/جواز + هاتف + عنوان + عمر + جنسية |
| **الإعدادات القابلة للتهيئة** | جزئية | ✅ كل شيء من قاعدة البيانات |

### Business Scenarios الجديدة المغطاة:
1. موظف مصري في فترة التجربة → يحسب النظام شهر الضمان تلقائياً ويضع رابط التسجيل
2. انتهاء فترة التجربة → HR يقيّم (موافق → موظف نشط / رفض → مخالصة)
3. موظف يستقيل → تايمر 30 يوم يبدأ، عند الانتهاء يكمل HR المخالصة
4. مخالفة تأخير متكررة → النظام يعرض سجل المخالفات السابقة ويقترح العقوبة التالية
5. محاولة إصدار مخالفة يوم الجمعة → النظام يرفض ويشرح السبب
6. شهادة صحية لموظف بدون شهادة → يظهر رابط وزارة الصحة مباشرة
7. أبناء أردنيات غير أردنيين → لا يحتاجون تصريح عمل (حقل exempt)
