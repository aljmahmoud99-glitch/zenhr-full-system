# ZenJO HRMS v3.0 — Replit Agent Master Prompt
## نظام إدارة الموارد البشرية الأردني المتكامل
### Jordanian-Specific · Configurable · Workflow-Driven · Compliance-First

---

> **انسخ كل شيء من هنا وضعه في Replit Agent مباشرةً.**

---

```
Build ZenJO HRMS v3 — a complete, production-ready Human Resources Management System
fully compliant with Jordanian Labour Law No. 8 of 1996, Social Security Corporation (SSC)
regulations, and Jordanian Income Tax Law. Jordan-ONLY, not generic MENA.

This is an enterprise-grade system. Every business rule, workflow, scenario, and compliance
check must be implemented correctly — not as a demo or placeholder.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 0: SYSTEM IDENTITY & PHILOSOPHY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

System Name: ZenJO HRMS
Target Country: Jordan ONLY
Currency: JOD (Jordanian Dinar) — always 3 decimal places (e.g. 1,500.000 JOD)
Languages: Arabic (default, RTL) + English (LTR)
Legal Framework: Jordanian Labour Law No. 8/1996 + SSC Law + Income Tax Law
Calendar: Gregorian only (Hijri display optional in settings)
Working Week: Sunday–Thursday (Friday–Saturday = weekend)
Default City: Amman, Jordan

CONFIGURABLE SYSTEM: Every compliance value (SSC rates, tax brackets, leave days, 
working hours, overtime rates, etc.) must be stored in the database and editable 
by superadmin/hradmin — NOT hardcoded in business logic. The system reads live 
configuration on every calculation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1: TECH STACK — MANDATORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Backend:
  - Node.js 22 + TypeScript 5 (strict mode)
  - Express 5
  - Drizzle ORM with PostgreSQL
  - Zod v4 for validation (drizzle-zod for schema inference)
  - JWT (jsonwebtoken) — access token (15min) + refresh token (7 days)
  - bcrypt for password hashing (cost factor 12)
  - Helmet, cors, rate-limiter-flexible for security

Frontend:
  - React 18 + Vite 6
  - TypeScript (strict)
  - shadcn/ui + Tailwind CSS v4
  - Wouter for routing
  - @tanstack/react-query v5
  - react-i18next for AR/EN i18n
  - Recharts for charts
  - react-hook-form + zod for forms
  - date-fns for date calculations

Database: PostgreSQL 16
Package manager: pnpm (workspaces)

Monorepo structure:
  /artifacts/api-server     → Express API
  /artifacts/zenjo          → React SPA
  /lib/db                   → Drizzle schema + seed
  /lib/api-spec             → Zod schemas + OpenAPI
  /lib/api-client-react     → React Query hooks

API base: /api/v1/...
Response envelope: { success: boolean, data: any, message?: string, pagination?: {...} }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2: ACCESS CONTROL (RBAC)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Roles (6 total):
  superadmin    → Full system access, system configuration, all data
  hradmin       → Employee management, leave/OT approvals (step 2), documents, payroll create
  payrolladmin  → Payroll runs approve, payslips, read-only employees (with salary)
  manager       → Team view (direct reports only), leave/OT approve (step 1), attendance
  employee      → Own records: clock in/out, leave request, OT request, own payslips, own docs
  recruiter     → Create employees (draft status), view departments & job titles only

Permission Matrix (enforce on BOTH backend middleware AND frontend route guards):

  Action                      | super | hradmin | payroll | manager | employee | recruiter
  ─────────────────────────────────────────────────────────────────────────────────────────
  View all employees           |  ✓   |   ✓     |   ✓*   |  ✓**   |    ✗    |    ✗
  View salary fields           |  ✓   |   ✓     |   ✓    |   ✗    |    ✗    |    ✗
  Create employees             |  ✓   |   ✓     |   ✗    |   ✗    |    ✗    |  ✓***
  Edit employees               |  ✓   |   ✓     |   ✗    |   ✗    |    ✗    |    ✗
  Delete employees             |  ✓   |   ✓     |   ✗    |   ✗    |    ✗    |    ✗
  Approve leave step 1         |  ✓   |   ✓     |   ✗    |   ✓    |    ✗    |    ✗
  Approve leave step 2         |  ✓   |   ✓     |   ✗    |   ✗    |    ✗    |    ✗
  Approve overtime step 1      |  ✓   |   ✓     |   ✗    |   ✓    |    ✗    |    ✗
  Approve overtime step 2      |  ✓   |   ✓     |   ✗    |   ✗    |    ✗    |    ✗
  Create payroll run           |  ✓   |   ✓     |   ✗    |   ✗    |    ✗    |    ✗
  Approve payroll run          |  ✓   |   ✗     |   ✓    |   ✗    |    ✗    |    ✗
  View own payslips            |  ✓   |   ✓     |   ✓    |   ✗    | own only |    ✗
  Manage documents             |  ✓   |   ✓     |   ✗    |   ✓    | own only |    ✗
  Manage assets                |  ✓   |   ✓     |   ✗    |   ✗    |    ✗    |    ✗
  Edit system settings         |  ✓   |   ✓     |   ✗    |   ✗    |    ✗    |    ✗
  View system audit logs       |  ✓   |   ✓     |   ✗    |   ✗    |    ✗    |    ✗

  * payrolladmin sees all employees with salary, read-only
  ** manager sees only direct_manager_id = self.employeeId
  *** recruiter creates with status='draft', cannot edit/delete

Data Scoping (mandatory backend enforcement):
  - employee role: WHERE employee_id = :selfId on ALL queries
  - manager role: WHERE direct_manager_id = :selfEmployeeId
  - recruiter: GET /employees → 403 Forbidden
  - Salary masking: Zero out basicSalary, housingAllowance, transportAllowance,
    mobileAllowance, mealAllowance, otherAllowances, bankAccountNumber, iban
    for manager, employee, recruiter roles

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3: DATABASE SCHEMA (28 TABLES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All tables include: id (serial PK), company_id (FK unless lookup),
created_at/updated_at (timestamptz), is_deleted (boolean, soft delete)

--- TABLE 1: companies ---
  name_ar, name_en, commercial_reg_no (unique), tax_number,
  ssc_employer_no (رقم تسجيل مؤسسة الضمان), labor_ministry_no,
  address_ar, governorate (enum: Amman/Irbid/Zarqa/Balqa/Madaba/Karak/Tafilah/Maán/Aqaba/Ajloun/Jerash/Mafraq),
  phone, email, website, logo_url,
  industry_type (enum: technology/manufacturing/retail/healthcare/education/government/finance/hospitality/other),
  currency DEFAULT 'JOD', fiscal_year_start INT DEFAULT 1,
  work_week_start INT DEFAULT 1 (1=Sunday), work_week_end INT DEFAULT 5 (5=Thursday),
  is_active BOOLEAN DEFAULT true

--- TABLE 2: departments ---
  name_ar, name_en, code (unique per company), parent_department_id (self FK),
  manager_employee_id (FK employees), cost_center_code, is_active

  SEED 6 departments:
    HR: الموارد البشرية/Human Resources
    IT: تقنية المعلومات/Information Technology  
    FIN: المالية/Finance
    OPS: العمليات/Operations
    SAL: المبيعات/Sales
    CS:  خدمة العملاء/Customer Service

--- TABLE 3: job_titles ---
  title_ar, title_en, code, grade (G1-G10), min_salary NUMERIC(12,3),
  max_salary NUMERIC(12,3), is_active

--- TABLE 4: employees (CORE — most complex) ---
  Personal:
    employee_code (auto: EMP-0001), first_name_ar, middle_name_ar, last_name_ar,
    first_name_en, middle_name_en, last_name_en, gender (male/female),
    date_of_birth, national_id (10-digit Jordanian NID, unique),
    nationality DEFAULT 'أردني', blood_type, religion, marital_status,
    number_of_dependents INT DEFAULT 0, education_level, field_of_study
    
  Contact:
    personal_email, work_email (unique), personal_phone, work_phone,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation
    
  Address:
    address_ar, governorate, city
    
  Employment:
    department_id FK, job_title_id FK, direct_manager_id FK (self),
    employment_type (fulltime/parttime/contract/secondment),
    hire_date, probation_end_date, contract_type (permanent/fixed_term/seasonal),
    contract_end_date, employment_status (active/suspended/terminated/resigned/retired/onleave),
    termination_date, termination_reason, notice_period_days
    
  Financial (MASKED for non-finance roles):
    basic_salary NUMERIC(12,3), housing_allowance NUMERIC(12,3) DEFAULT 0,
    transport_allowance NUMERIC(12,3) DEFAULT 0, mobile_allowance NUMERIC(12,3) DEFAULT 0,
    meal_allowance NUMERIC(12,3) DEFAULT 0, other_allowances NUMERIC(12,3) DEFAULT 0,
    salary_payment_method (bank/cash/check), bank_id FK, bank_account_number, iban
    
  SSC (Social Security — الضمان الاجتماعي):
    ssc_number (رقم الضمان الاجتماعي),
    ssc_enrollment_date, is_ssc_exempt BOOLEAN DEFAULT false,
    ssc_exempt_reason
    
  Tax:
    income_tax_number, tax_exemption_amount NUMERIC(12,3) DEFAULT 0,
    family_tax_exemption BOOLEAN DEFAULT false (spouse/kids exemption per Jordanian Tax Law)
    
  Work Permit / Residency (for non-Jordanians):
    work_permit_number, work_permit_expiry, work_permit_category,
    residency_number, residency_expiry, residency_type (annual/multi_year),
    passport_number, passport_expiry, passport_country
    
  Medical:
    health_certificate_number (شهادة صحية — required for food/healthcare industries),
    health_certificate_expiry, health_certificate_issuer
    
  Criminal:
    criminal_clearance_number (عدم محكومية),
    criminal_clearance_date, criminal_clearance_expiry
    
  Profile: profile_photo

--- TABLE 5: users ---
  employee_id FK (nullable), username (unique), password_hash (bcrypt),
  email, role (superadmin/hradmin/payrolladmin/manager/employee/recruiter),
  is_active, last_login_at, must_change_password BOOLEAN DEFAULT false,
  refresh_token, refresh_token_expiry, failed_login_attempts INT DEFAULT 0,
  locked_until TIMESTAMPTZ

--- TABLE 6: attendance_records ---
  employee_id FK, date DATE, clock_in TIMESTAMPTZ, clock_out TIMESTAMPTZ,
  status (present/absent/late/on_leave/official_mission/half_day/holiday),
  late_minutes INT DEFAULT 0, worked_minutes INT DEFAULT 0,
  overtime_minutes INT DEFAULT 0, break_minutes INT DEFAULT 0,
  location_in (GPS JSON: {lat,lng}), location_out (GPS JSON),
  notes, approved_by_id FK users

--- TABLE 7: leave_types ---
  name_ar, name_en, code, type (annual/sick/emergency/maternity/paternity/hajj/bereavement/unpaid/compensatory/study/national_service),
  is_paid BOOLEAN, default_days_per_year INT, max_carry_forward INT DEFAULT 0,
  min_service_months INT DEFAULT 0, requires_approval BOOLEAN DEFAULT true,
  gender_restriction (all/male/female/none), once_in_career BOOLEAN DEFAULT false,
  requires_medical_cert BOOLEAN DEFAULT false, is_active

  SEED 9 types (Jordanian Labour Law):
    Annual Leave    | سنوية      | 14 days | paid | carry forward 14
    Sick Leave      | مرضية       | 14 days | paid | requires medical cert after 2 days
    Emergency Leave | طارئة       | 3 days  | paid | no advance notice
    Maternity Leave | أمومة       | 70 days | paid | female only
    Paternity Leave | أبوة        | 3 days  | paid | male only
    Hajj Leave      | حج          | 14 days | paid | once in career | min 5 years service
    Bereavement     | وفاة        | 3 days  | paid | immediate family
    Unpaid Leave    | بدون راتب   | custom  | unpaid
    Compensatory    | تعويضية     | auto    | paid | from approved overtime

--- TABLE 8: leave_policies ---
  leave_type_id FK, days_per_year INT, max_carry_forward INT,
  accrual_type (monthly/quarterly/annually), min_service_months,
  requires_hr_approval BOOLEAN, requires_manager_approval BOOLEAN,
  notice_days_required INT DEFAULT 0, max_consecutive_days INT,
  is_active

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
  rejection_reason TEXT, linked_payslip_id FK payslips

--- TABLE 12: payroll_runs ---
  run_month INT, run_year INT, status (draft/processing/approved/paid/cancelled),
  total_gross NUMERIC(14,3), total_net NUMERIC(14,3), total_deductions NUMERIC(14,3),
  total_ssc_employee NUMERIC(14,3), total_ssc_employer NUMERIC(14,3),
  total_income_tax NUMERIC(14,3), employee_count INT,
  notes TEXT, created_by_id FK, approved_by_id FK,
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
  bank_id FK, bank_account_number, iban,
  payment_status (unpaid/paid), paid_at TIMESTAMPTZ

--- TABLE 14: documents ---
  employee_id FK, document_type_id FK, title_ar, title_en,
  document_number VARCHAR, issued_by VARCHAR, issued_date DATE,
  expiry_date DATE, file_name VARCHAR, file_url VARCHAR, file_size INT,
  status (valid/expiring_soon/expired/pending_renewal),
  alert_days_before INT DEFAULT 30, notes TEXT

  IMPORTANT: Track these Jordanian-specific doc types:
    - National ID (هوية وطنية) — Jordanians only
    - Work Permit (تصريح عمل) — non-Jordanians, from Ministry of Labour
    - Residency (إقامة) — non-Jordanians
    - Passport (جواز سفر) — all
    - Health Certificate (شهادة صحية) — food/healthcare sectors
    - Criminal Clearance (عدم محكومية) — all new hires
    - Driving Licence (رخصة قيادة) — drivers
    - Professional Licence (ترخيص مهني) — doctors/engineers/lawyers
    - Company Uniform Receipt (إيصال استلام زي رسمي)
    - Employment Contract Signed Copy (عقد العمل الموقع)

--- TABLE 15: document_types ---
  name_ar, name_en, code, is_required BOOLEAN,
  applicable_to (all/jordanian/non_jordanian), requires_expiry BOOLEAN,
  alert_days_before INT DEFAULT 30, is_active

--- TABLE 16: assets ---
  asset_name_ar, asset_name_en, category_id FK, serial_number (unique),
  barcode, purchase_date DATE, purchase_value NUMERIC(12,3),
  current_value NUMERIC(12,3), supplier VARCHAR,
  current_status (available/assigned/maintenance/retired/lost),
  assigned_to_employee_id FK, assigned_date DATE, expected_return_date DATE,
  condition_on_assign (new/good/fair/poor), notes TEXT

--- TABLE 17: asset_categories ---
  name_ar, name_en, icon, is_active
  SEED: Laptop, Mobile Phone, Vehicle, SIM Card, Furniture, Access Card, Uniform, Equipment

--- TABLE 18: system_configurations ---
  key VARCHAR UNIQUE, value TEXT, category, description_ar, description_en,
  data_type (string/integer/decimal/boolean/time/json), is_editable BOOLEAN DEFAULT true,
  updated_by_id FK

  SEED ALL:
  Category: attendance
    work_start_time          = "08:00"   — وقت بداية الدوام (HH:MM, Sunday-Thursday)
    work_end_time            = "17:00"   — وقت نهاية الدوام
    late_threshold_minutes   = "20"      — فترة السماح قبل تسجيل تأخير
    standard_work_hours      = "8"       — ساعات العمل الأساسية يومياً
    working_days_per_week    = "5"       — أيام العمل (الأحد–الخميس)
    weekend_days             = "Friday,Saturday" — أيام الإجازة الأسبوعية
    break_duration_minutes   = "60"      — مدة الاستراحة
    max_daily_overtime_hours = "4"       — الحد الأقصى للعمل الإضافي يومياً
    grace_departure_minutes  = "15"      — فترة السماح عند الانصراف

  Category: payroll
    ssc_employee_rate        = "7.5"     — نسبة اشتراك الموظف في الضمان الاجتماعي (%)
    ssc_employer_rate        = "14.25"   — نسبة اشتراك صاحب العمل في الضمان (%)
    ssc_max_insurable_salary = "3000"    — الحد الأقصى للراتب الخاضع للضمان (JOD)
    income_tax_personal_exemption = "9000" — الإعفاء الشخصي السنوي (JOD)
    income_tax_family_exemption  = "9000" — إعفاء الأسرة السنوي (JOD)
    income_tax_brackets      = '[{"from":0,"to":5000,"rate":0},{"from":5000,"to":10000,"rate":5},{"from":10000,"to":15000,"rate":10},{"from":15000,"to":20000,"rate":15},{"from":20000,"to":1000000,"rate":20}]'
    overtime_weekday_rate    = "1.25"    — معدل العمل الإضافي في أيام العمل
    overtime_weekend_rate    = "1.5"     — معدل العمل الإضافي في العطلة الأسبوعية
    overtime_holiday_rate    = "1.5"     — معدل العمل الإضافي في الأعياد الرسمية
    payroll_day              = "25"      — يوم معالجة الرواتب شهرياً
    advance_salary_max_pct   = "50"      — الحد الأقصى لسلفة الراتب (%)

  Category: hr
    probation_period_days    = "90"      — مدة فترة التجربة (الحد الأقصى 90 يوم)
    notice_period_days       = "30"      — مدة الإشعار بالاستقالة
    eosb_rate_per_year       = "1"       — مكافأة نهاية الخدمة (شهر راتب لكل سنة)
    annual_leave_days_year1  = "14"      — أيام الإجازة السنوية (قانون العمل)
    annual_leave_days_year5  = "21"      — أيام الإجازة للموظف ذي الخبرة +5 سنوات
    contract_renewal_alert_days = "60"  — تنبيه قبل انتهاء العقد
    health_cert_alert_days   = "30"      — تنبيه قبل انتهاء الشهادة الصحية
    criminal_cert_validity_months = "6" — صلاحية وثيقة عدم المحكومية
    work_permit_alert_days   = "60"      — تنبيه قبل انتهاء تصريح العمل
    residency_alert_days     = "60"      — تنبيه قبل انتهاء الإقامة

  Category: leave
    annual_leave_accrual     = "monthly" — طريقة استحقاق الإجازة
    sick_leave_requires_cert_after = "2" — طلب شهادة طبية بعد X أيام غياب مرضي
    leave_balance_reset_month = "1"     — شهر إعادة احتساب أرصدة الإجازات
    allow_leave_without_balance = "false" — السماح بالإجازة رصيد سالب

  Category: compliance (Jordanian specific)
    work_permit_required_nationalities = '["non_jordanian"]'
    health_cert_required_industries    = '["food","healthcare","hospitality","education"]'
    criminal_clearance_required        = "true" — مطلوب لجميع الموظفين الجدد
    iqama_required_for_non_jordanians  = "true"
    min_wage_jod                       = "260"  — الحد الأدنى للأجور (JOD)

  Category: general
    company_name_ar          = "شركة ZenJO"
    company_name_en          = "ZenJO Company"
    currency                 = "JOD"
    date_format              = "DD/MM/YYYY"
    show_hijri_calendar      = "false"
    logo_url                 = ""
    system_email             = ""
    timezone                 = "Asia/Amman"

--- TABLE 19: activity_logs ---
  user_id FK, employee_id FK, action_type, entity_type, entity_id,
  description_ar, description_en, old_values JSON, new_values JSON,
  ip_address, user_agent

--- TABLE 20: salary_advances ---
  employee_id FK, amount NUMERIC(12,3), reason TEXT,
  request_date DATE, approved_by_id FK, status (pending/approved/rejected/deducted),
  deducted_in_run_id FK payroll_runs, notes

--- TABLE 21: public_holidays ---
  name_ar, name_en, date DATE, type (national/religious/official),
  is_recurring BOOLEAN, notes

  SEED Jordanian public holidays:
    1 Jan  — رأس السنة الميلادية / New Year's Day
    25 Jan — عيد الاستقلال (يحتفل) / placeholder
    1 May  — عيد العمال / Labour Day
    25 May — عيد الاستقلال / Independence Day
    10 Jun — يوم الجيش / Army Day
    Eid Al-Fitr (3 days, variable — input manually each year)
    Eid Al-Adha (3 days, variable)
    Islamic New Year (variable)
    Prophet's Birthday (variable)

--- TABLE 22: notifications ---
  user_id FK, type (leave_request/overtime_request/document_expiry/payroll/system),
  title_ar, title_en, body_ar, body_en, entity_type, entity_id,
  is_read BOOLEAN DEFAULT false, read_at TIMESTAMPTZ

--- TABLE 23: banks (Jordanian banks lookup) ---
  name_ar, name_en, swift_code, iban_prefix, is_active
  SEED: Arab Bank, Bank of Jordan, Jordan Ahli Bank, Housing Bank, Cairo Amman Bank,
    Jordan Commercial Bank, Jordan Kuwait Bank, Jordan Islamic Bank, Union Bank,
    Capital Bank, Arab Jordan Investment Bank, HSBC Jordan, Citibank Jordan,
    Islamic International Arab Bank, Safwa Islamic Bank, Jordan Dubai Islamic Bank,
    Invest Bank, Arab Bank (Islamic), + others

--- TABLE 24: governorates (Jordanian governorates) ---
  name_ar, name_en, code (AMM/IRB/ZRQ/etc.), is_active
  SEED all 12: عمان/Amman, إربد/Irbid, الزرقاء/Zarqa, البلقاء/Balqa,
    مادبا/Madaba, الكرك/Karak, الطفيلة/Tafilah, معان/Maán,
    العقبة/Aqaba, عجلون/Ajloun, جرش/Jerash, المفرق/Mafraq

--- TABLE 25: cities (Jordanian cities) ---
  name_ar, name_en, governorate_id FK, is_active
  SEED ~80 major Jordanian cities

--- TABLE 26: nationalities ---
  name_ar, name_en, country_code ISO-3166, is_active
  SEED Jordanian + all major nationalities in Jordan workforce:
    أردني, فلسطيني, مصري, سوري, عراقي, سعودي, يمني, لبناني, سريلانكي,
    فلبيني, هندي, باكستاني, بنغلاديشي, إندونيسي, أمريكي, بريطاني, + 40 more

--- TABLE 27: compliance_checklist_items ---
  name_ar, name_en, category (onboarding/ongoing/expiry_based),
  is_required BOOLEAN, applicable_to (all/jordanian/non_jordanian),
  reminder_days_before INT, linked_document_type_id FK

--- TABLE 28: employee_compliance_status ---
  employee_id FK, checklist_item_id FK, status (compliant/non_compliant/pending/not_applicable),
  completed_date DATE, notes TEXT, reviewed_by_id FK

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4: JORDANIAN-SPECIFIC COMPLIANCE MODULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This is the CORE differentiator of ZenJO. Build it properly.

4.1 WORK PERMITS (تصاريح العمل) — Ministry of Labour
─────────────────────────────────────────────────────
Business Rules:
  - Non-Jordanian employees MUST have a valid work permit (تصريح عمل) from Ministry of Labour
  - Work permit categories in Jordan: اعتيادي/Regular, مؤقت/Temporary, موسمي/Seasonal
  - Work permit validity: usually 1 year, renewable
  - Alert: system sends notification work_permit_alert_days (default 60) before expiry
  - If work permit expires → employment_status automatically flagged 'compliance_risk'
  - Employer (company) must be registered with Ministry of Labour
  - Work permit cost/fee tracking field (optional)
  
  Jordanian Nationality Exception: If nationality = 'أردني' OR country_code = 'JO',
    work permit fields are hidden/not required.

  Non-Jordanian Onboarding Checklist:
    □ Work Permit (تصريح عمل) — required
    □ Residency (إقامة) — required
    □ Passport (جواز سفر) — required
    □ Passport photo copies

4.2 HEALTH CERTIFICATES (شهادات صحية) — Ministry of Health
────────────────────────────────────────────────────────────
Business Rules:
  - Required for employees in: food service, healthcare, hospitality, education
  - Controlled by system_configurations.health_cert_required_industries
  - Validity: usually 1 year
  - Issuer: Ministry of Health or approved health centers in Jordan
  - Field: health_certificate_number, health_certificate_expiry, health_certificate_issuer
  - Alert: 30 days before expiry (configurable)
  - Renewal reminder sent to employee AND hradmin
  - If expired → employee flagged in compliance dashboard

4.3 CRIMINAL CLEARANCE (عدم محكومية / براءة ذمة جنائية)
────────────────────────────────────────────────────────
Business Rules:
  - Required for ALL new employees upon onboarding (system config: criminal_clearance_required)
  - Issued by: محكمة البداية (court of first instance) in Jordan
  - Validity: 6 months (configurable in system_configurations)
  - Field: criminal_clearance_number, criminal_clearance_date, criminal_clearance_expiry
  - Alert: when document age exceeds 3 months (halfway through validity)
  - Some positions require annual renewal (store in employee record)
  - Exemption: existing employees pre-system can be marked 'legacy/exempt'

4.4 RESIDENCY (إقامة) — Non-Jordanians
────────────────────────────────────────
Business Rules:
  - Required for all non-Jordanian employees
  - Types: سنوية/Annual, متعددة السنوات/Multi-year
  - Alert: 60 days before expiry
  - Employer is responsible for renewal coordination
  - Residency renewal linked to work permit renewal

4.5 COMPLIANCE DASHBOARD
─────────────────────────
Build a dedicated Compliance screen (/compliance) with:

  Overview Cards:
    - 🔴 Expired Documents Count (action required now)
    - 🟡 Expiring Soon Count (within alert_days_before)
    - 🟢 Compliant Employees Count
    - ⚪ Non-Applicable Count

  Tabs:
    Work Permits Tab:
      - Table: Employee | Nationality | Permit No. | Issue Date | Expiry | Days Left | Status
      - Status badges: Valid (green) / Expiring Soon (yellow/orange) / Expired (red) / N/A (gray)
      - Action: Upload renewal | Send reminder

    Health Certificates Tab:
      - Table: Employee | Dept | Certificate No. | Expiry | Issuer | Status
      - Action: Upload new cert | Request renewal

    Criminal Clearance Tab:
      - Table: Employee | Issue Date | Expiry | Status | Age (months)
      - Filter: Expired | Expiring | Missing

    Residency Tab (non-Jordanians):
      - Table: Employee | Nationality | Residency No. | Type | Expiry | Status

    Passports Tab:
      - All employees with passport expiry within 6 months

  Compliance Checklist per Employee:
    On employee profile → Compliance tab showing:
      □ National ID verified ✓
      □ Criminal Clearance (عدم محكومية) — expires: [date] ✓/⚠️/✗
      □ Work Permit — if non-Jordanian
      □ Residency — if non-Jordanian
      □ Health Certificate — if required by industry
      □ Signed Employment Contract ✓/✗
      □ SSC Enrollment ✓/✗

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 5: BUSINESS RULES & WORKFLOWS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5.1 LEAVE APPROVAL WORKFLOW (2-Step)
──────────────────────────────────────

Step 1: Employee submits leave request
  → status = 'pending'
  → Notification sent to: direct_manager + hradmin

Step 2: Manager reviews (can approve/reject)
  IF approved by manager:
    → status = 'manager_approved'
    → Notification sent to: hradmin
  IF rejected by manager:
    → status = 'rejected', rejection_step = 'manager'
    → Notification sent to: employee (reason shown)

Step 3: HR Admin reviews
  IF approved by HR:
    → status = 'approved'
    → leave_balances.used_days += total_days
    → leave_balances.remaining_days -= total_days
    → attendance_records created for leave dates with status = 'on_leave'
    → Notification sent to: employee
  IF rejected by HR:
    → status = 'rejected', rejection_step = 'hr'
    → Notification sent to: employee (reason shown)

Special Rules (Jordanian Labour Law):
  - Annual Leave: Employee must have completed service period per policy
  - Sick Leave after 2 days: REQUIRES medical certificate (flag: requires_medical_cert)
  - Maternity Leave: 70 consecutive calendar days, female only, no splitting
  - Hajj Leave: Only once per career, employee must have completed 5+ years of service
  - Emergency Leave: Manager can approve without HR (bypass step 2) — config option
  - Leave during probation: Annual/Emergency leave NOT allowed during probation period
    (check: if hire_date + probation_period_days > leave_start_date → reject)
  
  Balance validation:
    Before approval: check leave_balances.remaining_days >= total_days
    Exception: sick leave and emergency can go negative (show warning)
    If allow_leave_without_balance = false: block approval when balance = 0

  Cancellation:
    Employee can cancel ONLY if status = 'pending' or 'manager_approved'
    After HR approval: cancellation requires HR action
    If leave is ongoing/past: no cancellation

  Overlap check:
    Before submitting: verify employee has no other approved/pending leave
    on overlapping dates

5.2 OVERTIME APPROVAL WORKFLOW (2-Step)
────────────────────────────────────────

Same 2-step flow as leave. Additional rules:

  Submission rules:
    - Must be submitted BEFORE or ON the day of overtime (not retroactively, configurable)
    - Max daily overtime: max_daily_overtime_hours (system config, default 4h)
    - Weekend/holiday overtime rate: overtime_weekend_rate (1.5×)
    - Weekday overtime rate: overtime_weekday_rate (1.25×)
    
  After full approval (status = 'approved'):
    - If compensation_type = 'pay':
        overtime_amount = hours × (basic_salary / 176) × overtime_rate
        (where 176 = standard monthly work hours: 22 days × 8 hours)
        Amount stored, linked to next payroll run
    - If compensation_type = 'compensatory_leave':
        Add compensatory leave days to employee's leave balance
        leave_balances.total_days += equivalent_days
    
  Payroll integration:
    When creating payroll run for month M:
      Pull all approved overtime_requests where date is in month M
      Sum amounts, add to payslip.overtime_amount
      Update linked_payslip_id on each overtime_request

5.3 PAYROLL CALCULATION ENGINE
────────────────────────────────
Read ALL rates from system_configurations (never hardcode):

  Step 1: Gather employee data
    gross_salary = basic_salary + housing_allowance + transport_allowance
                 + mobile_allowance + meal_allowance + other_allowances
                 + overtime_amount (from approved OT this month)
                 + bonus_amount (if any)

  Step 2: SSC Calculation (الضمان الاجتماعي)
    IF is_ssc_exempt = false:
      insurable_salary = MIN(basic_salary, ssc_max_insurable_salary)
      ssc_deduction = insurable_salary × (ssc_employee_rate / 100)
      ssc_employer = insurable_salary × (ssc_employer_rate / 100)
    ELSE:
      ssc_deduction = 0, ssc_employer = 0

  Step 3: Income Tax (ضريبة الدخل — Jordanian Progressive)
    annual_gross = gross_salary × 12
    exemptions = income_tax_personal_exemption
    IF family_tax_exemption = true: exemptions += income_tax_family_exemption
    exemptions += tax_exemption_amount (employee-specific)
    
    taxable_annual = MAX(0, annual_gross - exemptions)
    
    income_tax_annual = apply_progressive_brackets(taxable_annual, brackets)
      Where brackets from system_configurations.income_tax_brackets JSON:
        0 – 5,000 JOD/year  → 0%
        5,001 – 10,000      → 5%
        10,001 – 15,000     → 10%
        15,001 – 20,000     → 15%
        > 20,000            → 20%
    
    income_tax_monthly = income_tax_annual / 12

  Step 4: Deductions
    absence_deduction = (basic_salary / working_days_in_month) × absent_days
    late_deduction = optional, configurable (e.g. 15 min threshold)
    advance_deduction = from salary_advances approved for this month
    
    total_deductions = ssc_deduction + income_tax_deduction + absence_deduction
                      + late_deduction + advance_deduction + other_deductions

  Step 5: Net
    net_salary = gross_salary - total_deductions

  All amounts: NUMERIC(12,3), display with 3 decimal places, currency = JOD

5.4 ATTENDANCE STATUS LOGIC
──────────────────────────────
Clock-In:
  1. Load from system_configurations: work_start_time, late_threshold_minutes
  2. scheduled_start = today + work_start_time (in Asia/Amman timezone)
  3. late_minutes = MAX(0, clock_in - scheduled_start) in minutes
  4. IF late_minutes > late_threshold_minutes: status = 'late'
     ELSE: status = 'present'

Clock-Out:
  1. Load from system_configurations: standard_work_hours, break_duration_minutes
  2. worked_minutes = clock_out - clock_in (in minutes)
  3. net_worked = worked_minutes - break_duration_minutes
  4. standard_minutes = standard_work_hours × 60
  5. overtime_minutes = MAX(0, net_worked - standard_minutes)

Daily Attendance (background job / end-of-day):
  For each active employee who didn't clock in today (working day only):
    IF employee has approved leave for today: status = 'on_leave'
    ELSE IF today is public holiday: status = 'holiday'
    ELSE: status = 'absent'

Working day check:
  - Check weekend_days from system_configurations (default: Friday, Saturday)
  - Check public_holidays table for today's date

5.5 DOCUMENT EXPIRY ALERTS
─────────────────────────────
Daily background job checks:
  1. Load alert_days_before from each document_type
  2. For each document:
     days_until_expiry = expiry_date - today
     IF days_until_expiry <= 0: status = 'expired'
     ELSE IF days_until_expiry <= alert_days_before: status = 'expiring_soon'
     ELSE: status = 'valid'
  3. Create notifications for:
     - Employee (own documents)
     - HR Admin (all expiring/expired)
  4. Dashboard shows count of documents expiring in next 30/60/90 days

Special Jordanian alerts:
  Work permit expiry → 60 days: Notify HR + employee
  Residency expiry → 60 days: Notify HR + employee
  Health certificate expiry → 30 days: Notify HR + employee + manager
  Criminal clearance → 3 months old: Flag for renewal (if required annually)
  Contract end → 60 days: Notify HR + manager

5.6 END OF SERVICE BENEFITS (مكافأة نهاية الخدمة / EOSB)
────────────────────────────────────────────────────────────
Calculated on employee termination/resignation:

  years_of_service = (termination_date - hire_date) / 365.25
  IF years_of_service < 1: eosb = 0 (must complete 1 year)
  
  IF termination_reason = 'resigned' AND years_of_service < 3: eosb = 0
  IF termination_reason = 'resigned' AND years_of_service >= 3:
    eosb = basic_salary × years_of_service × (eosb_rate_per_year / 12)
  IF termination_reason IN ('terminated','retired'):
    eosb = basic_salary × years_of_service × eosb_rate_per_year
    (1 month's basic salary per year of service, per Jordanian Labour Law Art. 87)

  Show EOSB calculation on employee termination modal with breakdown.

5.7 SALARY ADVANCE (سلفة راتب)
──────────────────────────────────
  Max advance: basic_salary × (advance_salary_max_pct / 100) (configurable)
  Status flow: pending → approved/rejected → deducted (in payroll)
  When payroll run created: auto-deduct approved advances from net salary
  Employee can only have ONE active advance at a time

5.8 EMPLOYEE ONBOARDING WORKFLOW
──────────────────────────────────
When employee status transitions to 'active' (from 'draft'):
  1. Auto-generate employee_code (EMP-XXXX, sequential)
  2. Auto-create user account (username = work_email prefix, temp password)
  3. Initialize leave balances for all active leave types
  4. Create compliance checklist entries:
     - Criminal Clearance: status = 'pending'
     - Work Permit: if non-Jordanian → 'pending', else 'not_applicable'
     - Health Certificate: if company industry requires → 'pending'
     - Signed Contract: 'pending'
     - SSC Enrollment: 'pending'
  5. Send welcome notification to employee
  6. Log in activity_logs: "Employee onboarded: [name]"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 6: API ENDPOINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Base: /api/v1/
Auth: Bearer JWT (all routes except /auth/login, /health)

AUTH
  POST   /auth/login              → {token, refreshToken, user}
  POST   /auth/refresh            → {token}
  POST   /auth/logout
  GET    /auth/me
  PATCH  /auth/change-password

EMPLOYEES
  GET    /employees               → list (scoped by role, salary masked)
  POST   /employees               → create (superadmin/hradmin/recruiter)
  GET    /employees/:id           → detail
  PATCH  /employees/:id           → update
  DELETE /employees/:id           → soft delete
  PATCH  /employees/:id/status    → change status (active/suspended/terminated)
  GET    /employees/:id/compliance → compliance checklist items + status
  GET    /employees/:id/documents → employee's documents
  GET    /employees/:id/payslips  → employee's payslips

DEPARTMENTS
  GET    /departments
  POST   /departments
  PATCH  /departments/:id
  DELETE /departments/:id

JOB TITLES
  GET    /job-titles
  POST   /job-titles
  PATCH  /job-titles/:id
  DELETE /job-titles/:id

ATTENDANCE
  GET    /attendance              → list (scoped)
  POST   /attendance/clock-in     → clock in current user
  POST   /attendance/clock-out    → clock out current user
  GET    /attendance/my-today     → today's record for current user
  GET    /attendance/summary      → monthly summary
  PATCH  /attendance/:id          → manual correction (hradmin only)

LEAVE
  GET    /leave/types
  GET    /leave/policies
  PATCH  /leave/policies/:id      → update policy (hradmin)
  GET    /leave/balances          → employee's balances (own or team)
  GET    /leave/requests          → list (scoped)
  POST   /leave/requests          → submit request
  GET    /leave/requests/:id
  PATCH  /leave/requests/:id      → edit own pending
  DELETE /leave/requests/:id      → cancel own pending
  POST   /leave/requests/:id/approve → step 1 or 2 (role-based)
  POST   /leave/requests/:id/reject  → with reason

OVERTIME
  GET    /overtime                → list (scoped)
  POST   /overtime                → submit
  GET    /overtime/:id
  PATCH  /overtime/:id            → edit own pending
  DELETE /overtime/:id            → cancel
  POST   /overtime/:id/approve
  POST   /overtime/:id/reject

PAYROLL
  GET    /payroll/runs
  POST   /payroll/runs            → create run (auto-calculate all employees)
  GET    /payroll/runs/:id        → run detail with all payslips
  POST   /payroll/runs/:id/approve → payrolladmin approval
  POST   /payroll/runs/:id/mark-paid
  GET    /payroll/slips           → list (own for employee)
  GET    /payroll/slips/:id       → detail
  GET    /payroll/slips/:id/pdf   → generate PDF payslip

DOCUMENTS
  GET    /documents               → list (scoped)
  POST   /documents               → add document
  PATCH  /documents/:id
  DELETE /documents/:id
  GET    /documents/expiring      → expiring in next N days
  GET    /document-types          → lookup

ASSETS
  GET    /assets
  POST   /assets
  PATCH  /assets/:id
  DELETE /assets/:id
  POST   /assets/:id/assign       → assign to employee
  POST   /assets/:id/return       → return from employee
  GET    /asset-categories        → lookup

COMPLIANCE
  GET    /compliance/overview     → counts by type and status
  GET    /compliance/work-permits → all employee work permit status
  GET    /compliance/health-certs → all health certificate status
  GET    /compliance/criminal-clearance → all criminal clearance status
  GET    /compliance/residency    → non-Jordanian residency status
  PATCH  /compliance/:employeeId/:itemId → update checklist item status

SALARY ADVANCES
  GET    /advances
  POST   /advances                → request advance
  POST   /advances/:id/approve
  POST   /advances/:id/reject

PUBLIC HOLIDAYS
  GET    /holidays
  POST   /holidays                → add holiday
  PATCH  /holidays/:id
  DELETE /holidays/:id

CONFIG
  GET    /config                  → {flat, byCategory}
  PATCH  /config/:key             → update single key (hradmin+)
  PATCH  /config                  → batch update

NOTIFICATIONS
  GET    /notifications           → own unread
  PATCH  /notifications/:id/read
  PATCH  /notifications/read-all

REPORTS
  GET    /reports/headcount       → by dept, status, nationality, gender
  GET    /reports/payroll-trend   → last 12 months
  GET    /reports/leave-analysis  → by type, dept, month
  GET    /reports/attendance-summary → late/absent rates by dept
  GET    /reports/turnover        → hired vs left by month
  GET    /reports/compliance      → compliance status summary

DASHBOARD
  GET    /dashboard/summary       → KPI counts
  GET    /dashboard/headcount-chart
  GET    /dashboard/leave-chart
  GET    /dashboard/payroll-chart
  GET    /dashboard/recent-activity
  GET    /dashboard/compliance-alerts → count of expiring docs

LOOKUPS
  GET    /lookups/banks
  GET    /lookups/governorates
  GET    /lookups/cities?governorate_id=
  GET    /lookups/nationalities

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 7: FRONTEND PAGES & ROUTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Layout: Right sidebar navigation (Arabic RTL default) with language toggle.
Design system: ZenJO brand — dark forest green (#1B4332) primary, light mint (#F0FDF4) backgrounds.
Mobile: Bottom tab navigation (5 items, role-based).

ROUTES & ACCESS:
  /login                → Public
  /                     → Dashboard (role-differentiated)
  /employees            → superadmin, hradmin, payrolladmin, manager
  /employees/new        → superadmin, hradmin, recruiter
  /employees/:id        → superadmin, hradmin, manager(own team), employee(own)
  /employees/:id/edit   → superadmin, hradmin
  /departments          → all (create/edit: superadmin, hradmin)
  /job-titles           → all (create/edit: superadmin, hradmin)
  /attendance           → superadmin, hradmin, manager, employee
  /leave/requests       → superadmin, hradmin, manager, employee
  /leave/policies       → superadmin, hradmin (read: manager)
  /overtime             → superadmin, hradmin, manager, employee
  /payroll/runs         → superadmin, hradmin, payrolladmin
  /payroll/runs/:id     → superadmin, hradmin, payrolladmin
  /payroll/slips        → superadmin, hradmin, payrolladmin, employee(own)
  /compliance           → superadmin, hradmin, manager
  /documents            → superadmin, hradmin, manager, employee(own)
  /assets               → superadmin, hradmin
  /holidays             → superadmin, hradmin
  /settings             → superadmin, hradmin
  /notifications        → all authenticated
  /reports              → superadmin, hradmin, payrolladmin

DASHBOARD VIEWS (differentiated by role):
  superadmin/hradmin:
    Row 1: KPI cards (Total Employees, New This Month, Pending Leaves, Pending OT)
    Row 2: KPI cards (Compliance Alerts 🔴, Expiring Docs, Payroll This Month)
    Row 3: Headcount by Dept (bar chart) + Leave by Type (donut chart)
    Row 4: Payroll Trend (last 6 months, line chart)
    Row 5: Recent Activity Feed + Compliance Alert Cards
    
  payrolladmin:
    Payroll KPIs + Payroll Trend + Pending Approval + Payslips Summary
    
  manager:
    Team Stats (team count, present today, on leave today)
    Pending approvals queue (leave + overtime awaiting step 1)
    Team attendance today (mini table)
    
  employee:
    Clock In/Out Widget (prominent, shows current time)
    Today's attendance status
    My Leave Balances (all types, visual progress bars)
    Upcoming Leaves (approved)
    Recent Payslips (last 3 months)
    Pending Requests (leave/OT awaiting approval)
    Document expiry warnings (my docs expiring soon)
    
  recruiter:
    Quick Actions: Add Employee, View Departments, View Job Titles
    My Recent Additions

EMPLOYEE PROFILE (/:id) — TAB STRUCTURE:
  Tab 1: Personal Info      (all allowed viewers)
  Tab 2: Employment         (all allowed viewers, salary hidden for non-finance)
  Tab 3: Salary             (superadmin, hradmin, payrolladmin ONLY)
  Tab 4: Bank & SSC         (superadmin, hradmin, payrolladmin ONLY)
  Tab 5: Compliance         → NEW TAB
    - Compliance checklist with status for each item
    - Work Permit details (if non-Jordanian)
    - Health Certificate status
    - Criminal Clearance status
    - Passports + Residency (if non-Jordanian)
  Tab 6: Documents          (superadmin, hradmin, manager, own)
  Tab 7: Attendance History (superadmin, hradmin, manager, own)
  Tab 8: Leave History      (superadmin, hradmin, manager, own)
  Tab 9: Payslips           (superadmin, hradmin, payrolladmin, own)

ADD EMPLOYEE FORM — 4-STEP WIZARD:
  Step 1: Personal Info
    - Full name (AR + EN), gender, DOB, national ID (10 digits, validate format)
    - Nationality (dropdown from nationalities table)
    - Religion, marital status, dependents
    - Blood type, education level, field of study
    - Personal email, personal phone
    - Emergency contact (name, phone, relation)
    - Address (governorate dropdown → city dropdown)
    - Profile photo upload

  Step 2: Employment Details
    - Department, Job Title, Direct Manager
    - Employment type, Contract type, Hire date
    - Probation end date (auto-calculated: hire_date + 90 days, editable)
    - Contract end date (if fixed_term)
    - Status (default: draft until activated)
    - Work email (auto-suggested: firstname.lastname@company.com)

  Step 3: Salary & Financial
    - Basic Salary (required, validate >= min_wage_jod from config)
    - Allowances: Housing, Transport, Mobile, Meal, Other
    - Salary payment method (bank/cash)
    - Bank (dropdown from banks table), account number, IBAN
    - SSC Number, SSC enrollment date, SSC exempt toggle
    - Income tax number, personal tax exemption amount, family exemption toggle

  Step 4: Compliance & Documents
    - Work Permit (show only if nationality ≠ Jordanian):
        permit number, issue date, expiry, category, upload file
    - Health Certificate (show only if industry requires it):
        cert number, expiry, issuer, upload file
    - Criminal Clearance: cert number, issue date, expiry, upload file
    - Passport: number, expiry, country, upload file
    - Notes
    - Submit button: "Create Employee" → status becomes 'active'
      OR "Save as Draft" → status stays 'draft'

COMPLIANCE PAGE (/compliance):
  Overview Section:
    4 metric cards (expired, expiring soon, compliant, pending)
  
  Filter Bar: All / Work Permits / Health Certs / Criminal Clearance / Residency / Passports
  
  Table Columns: Employee | Nationality | Document Type | Number | Expiry | Days Left | Status | Actions
  
  Status badges with colors:
    🟢 Valid — green
    🟡 Expiring Soon (within alert_days) — amber
    🔴 Expired — red
    🔵 Pending Upload — blue
    ⚪ N/A — gray
  
  Actions per row:
    Upload new document, Mark as renewed, Send reminder email, View document
  
  Export to Excel button (all compliance data)

SETTINGS PAGE (/settings) — TAB STRUCTURE:
  Tab 1: Attendance Settings
    - Work schedule (start/end time, working days)
    - Late threshold, standard hours, break duration
    - Weekend days checkboxes (Sun/Mon/Tue/Wed/Thu/Fri/Sat)

  Tab 2: Payroll Settings
    - SSC rates (employee/employer), max insurable salary
    - Income tax brackets (editable table: from, to, rate%)
    - Overtime rates (weekday/weekend/holiday)
    - Personal/family exemption amounts
    - Payroll processing day, max advance %

  Tab 3: HR Policies
    - Probation period, notice period, EOSB rate
    - Annual leave days (year 1, year 5+)
    - Sick leave cert threshold
    - Allow leave without balance (toggle)

  Tab 4: Compliance Settings
    - Criminal clearance validity months
    - Work permit alert days
    - Health cert alert days
    - Residency alert days
    - Health cert required industries (multi-select)

  Tab 5: Leave Policies
    - Table showing all leave types with editable days/year, carry forward

  Tab 6: Company Info
    - Company name (AR/EN), registration numbers, SSC employer number
    - Industry type, address, contact

  Tab 7: Public Holidays
    - Table of holidays with add/edit/delete
    - Import from template

REPORTS PAGE (/reports):
  Report Cards (click to generate):
    1. Headcount Report — filters: dept, status, nationality, gender, month
    2. Payroll Summary — month/year range
    3. Leave Analysis — by type, dept, approval rate
    4. Attendance Summary — late/absent percentages
    5. Turnover Report — hired vs resigned/terminated
    6. Compliance Report — all doc statuses
    7. SSC Contribution Report (per employee, per month — for SSC submission)
    8. Income Tax Summary (for Tax Department submission)

  Each report: view in-page table + Export to Excel/PDF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 8: JORDANIAN LABOUR LAW COMPLIANCE SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Enforce these in business logic (all configurable via system_configurations):

  ┌────────────────────────────────────┬───────────────────────────────────────────┐
  │ Provision                          │ Value / Rule                              │
  ├────────────────────────────────────┼───────────────────────────────────────────┤
  │ Annual leave (< 5 years service)   │ 14 calendar days/year (Art. 61)           │
  │ Annual leave (≥ 5 years service)   │ 21 calendar days/year (Art. 61)           │
  │ Sick leave (paid)                  │ 14 days/year (Art. 65)                    │
  │ Maternity leave                    │ 70 consecutive days, paid (Art. 70)       │
  │ Paternity leave                    │ 3 days, paid                              │
  │ Hajj leave                         │ 14 days, once in career, min 5yr service  │
  │ Bereavement leave                  │ 3 days, immediate family                  │
  │ Emergency leave                    │ 3 days/year (per Jordanian practice)      │
  │ Probation maximum                  │ 90 days (Art. 30)                         │
  │ EOSB                               │ 1 month salary per year (Art. 87)         │
  │ SSC employee contribution          │ 7.5% of basic salary                      │
  │ SSC employer contribution          │ 14.25% of basic salary                    │
  │ Max SSC insurable salary           │ 3,000 JOD/month                           │
  │ Minimum wage                       │ 260 JOD/month                             │
  │ Working hours                      │ 8 hours/day, 40 hours/week (Art. 57)      │
  │ Overtime weekday rate              │ 1.25× (25% premium) (Art. 59)             │
  │ Overtime weekend/holiday rate      │ 1.5× (50% premium) (Art. 59)             │
  │ Weekly rest                        │ Friday + Saturday (Jordan standard)       │
  │ Income tax personal exemption      │ 9,000 JOD/year                            │
  │ Income tax family exemption        │ 9,000 JOD/year (spouse + dependents)     │
  │ Work permit required               │ All non-Jordanian workers                 │
  │ Criminal clearance required        │ All new hires (عدم محكومية)              │
  │ Notice period (resignation)        │ 1 month minimum                          │
  └────────────────────────────────────┴───────────────────────────────────────────┘

Income Tax Brackets (Jordanian Law):
  Annual taxable income after exemptions:
    0 – 5,000 JOD    → 0%
    5,001 – 10,000   → 5%
    10,001 – 15,000  → 10%
    15,001 – 20,000  → 15%
    > 20,000         → 20%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 9: DEMO DATA & SEED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Seed company_id = 1: ZenJO شركة ZenJO (Amman, IT sector)

Demo accounts (seed with bcrypt hashed passwords):
  username: admin     | password: Admin@1234   | role: superadmin  | name: أحمد العلي / Ahmed Al-Ali
  username: hr        | password: Hr@1234      | role: hradmin     | name: سارة محمود / Sara Mahmoud
  username: payroll   | password: Payroll@1234 | role: payrolladmin| name: محمد الخطيب / Mohammad Al-Khatib
  username: manager   | password: Manager@1234 | role: manager     | name: خالد النمر / Khaled Al-Nemer
  username: employee  | password: Employee@1234| role: employee    | name: ليلى حداد / Layla Haddad
  username: recruiter | password: Recruiter@1234| role: recruiter  | name: يوسف الراشد / Yousef Al-Rashid

Seed 6 employees (Jordanian nationals, active status):
  EMP-0001: Ahmed Al-Ali | HR Manager | HR Dept | Salary: 1,500.000 JOD basic
  EMP-0002: Sara Mahmoud | HR Specialist | HR Dept | direct_manager: EMP-0001
  EMP-0003: Mohammad Al-Khatib | Software Developer | Finance | 
  EMP-0004: Khaled Al-Nemer | Project Manager | IT | 
  EMP-0005: Layla Haddad | HR Specialist | IT | direct_manager: EMP-0004
  EMP-0006: Yousef Al-Rashid | Operations Lead | Operations |

Add 1 non-Jordanian employee (to demo compliance module):
  EMP-0007: Ahmad Hassan | Data Analyst | IT | Nationality: مصري/Egyptian
    → has work_permit_number, residency_number, passport seeded
    → compliance checklist: work permit expiring in 45 days (shows in compliance dashboard)

Seed compliance data for demo:
  - EMP-0005 Layla: criminal clearance issued 5 months ago (expiring alert)
  - EMP-0007 Ahmad: work permit expiry = today + 45 days (expiring soon)
  - EMP-0003 Mohammad: health certificate expired 10 days ago (food-safe coffee machine? no — actually remove health cert, seed only where industry applies)

Seed 1 payroll run: April 2026, status: draft, all 6 employees

Seed attendance records for current week.

Seed 1 overtime request (Layla Haddad, status: pending, reason: "Urgent project deadline")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 10: UI/UX REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Design tokens (CSS variables):
  --primary: #1B4332         (dark forest green)
  --primary-hover: #15362A
  --primary-light: #D1FAE5
  --accent: #34D399           (emerald green — active states)
  --warning: #F59E0B          (amber — expiring soon)
  --danger: #EF4444           (red — expired, errors)
  --info: #3B82F6             (blue — pending)
  --bg-main: #F8FFFE          (very light mint)
  --bg-sidebar: #FFFFFF
  --text-primary: #111827
  --text-secondary: #6B7280
  --border: #E5E7EB
  --radius: 8px
  --shadow: 0 1px 3px rgba(0,0,0,0.08)

Typography:
  Arabic: Noto Kufi Arabic (Google Fonts) — headings
  Arabic body: Noto Naskh Arabic
  English: Plus Jakarta Sans

RTL/LTR:
  Default: RTL (Arabic)
  Toggle stored in localStorage.zenjo_lang
  On language change: document.dir = rtl/ltr, reload i18n keys
  All icons must mirror correctly in RTL (chevrons, arrows)

Components to build:
  - StatusBadge: pending(blue), approved(green), rejected(red), expired(red), expiring_soon(amber), draft(gray)
  - ComplianceStatusBadge: valid/expiring_soon/expired/pending/n_a
  - EmployeeAvatar: initials or photo, colored by dept
  - DaysCounter: shows "N days left" with color coding
  - ComplianceIndicator: row of icons showing doc status at a glance
  - PayslipCard: summary card for payslip
  - NotificationBell: with unread count badge
  - LeaveBalanceBar: visual bar showing used/remaining per leave type

Notification Bell (header):
  Shows count of unread notifications
  Dropdown: last 5 notifications with type icon, title, time ago
  "View All" link
  Types: 
    📋 leave_request — Leave request from [name]
    ⏰ overtime_request — Overtime request from [name]
    📄 document_expiry — [Doc type] for [name] expiring in N days
    💰 payroll — Payroll run [month] ready for approval
    ⚠️  compliance — Work permit expired for [name]

Mobile Bottom Navigation (role-based, 5 tabs):
  superadmin/hradmin: الرئيسية | الموظفون | الحضور | الإجازات | الإعدادات
  payrolladmin:       الرئيسية | الرواتب  | كشوف الرواتب | الأقسام | الإعدادات
  manager:            الرئيسية | الحضور  | الإجازات | العمل الإضافي | موظفوني
  employee:           الرئيسية | حضوري   | إجازاتي  | عمل إضافي | راتبي
  recruiter:          الرئيسية | إضافة موظف | الأقسام | المسميات | الإعدادات

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 11: I18N (ARABIC + ENGLISH)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All UI text must have both AR and EN translations in i18n files.
Key namespaces:
  nav.*, auth.*, dashboard.*, employees.*, attendance.*, leave.*,
  overtime.*, payroll.*, compliance.*, documents.*, assets.*,
  settings.*, reports.*, notifications.*, common.*

Key compliance translations:
  compliance.workPermit = تصريح عمل / Work Permit
  compliance.healthCertificate = شهادة صحية / Health Certificate
  compliance.criminalClearance = عدم محكومية / Criminal Clearance
  compliance.residency = إقامة / Residency
  compliance.passport = جواز سفر / Passport
  compliance.expired = منتهي الصلاحية / Expired
  compliance.expiringSoon = ينتهي قريباً / Expiring Soon
  compliance.valid = ساري / Valid
  compliance.pending = قيد الرفع / Pending Upload
  compliance.daysLeft = {n} يوم متبقٍ / {n} Days Left

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 12: SECURITY & INFRASTRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Authentication:
  - JWT access token: 15 minutes expiry
  - Refresh token: 7 days, stored in DB (users.refresh_token)
  - On login: return both tokens, client stores access in memory + refresh in httpOnly cookie
  - Token rotation: issue new access token when refresh is used
  - Account lockout: 5 failed attempts → locked for 30 minutes
  - Must change password flag: force password change on first login

Password Policy:
  - Min 8 characters, at least 1 uppercase, 1 number, 1 special char
  - Bcrypt with cost factor 12

API Security:
  - Helmet (security headers)
  - CORS: whitelist frontend origin only
  - Rate limiting: 100 requests/minute per IP (general), 10/minute for /auth/login
  - Input validation: Zod on all POST/PATCH body + query params
  - SQL injection: prevented by Drizzle ORM parameterized queries
  - Audit log: every state change logged in activity_logs with old/new values

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 13: BUILD & RUN COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Install
pnpm install

# Database
pnpm --filter @workspace/db run push     # Push schema to PostgreSQL
pnpm --filter @workspace/db run seed     # Seed demo data

# Development
pnpm --filter @workspace/api-server run dev    # API on port 8080
pnpm --filter @workspace/zenjo run dev         # Frontend on port 3000

# Build
pnpm run build

# Type check
pnpm run typecheck

Replit workflow: run both API + frontend in parallel via .replit config.
DATABASE_URL must be set in Replit Secrets.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
END OF PROMPT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## ملاحظات للمطور (Notes for Developer)

### ما الجديد في v3 مقارنة بالنظام الحالي:

| الميزة | v2 الحالي | v3 الجديد |
|--------|-----------|-----------|
| التركيز الجغرافي | عام | **الأردن فقط** |
| تصاريح العمل | غير موجود | ✅ وحدة كاملة |
| الشهادات الصحية | غير موجود | ✅ مرتبطة بالقطاع |
| عدم المحكومية | غير موجود | ✅ لجميع الموظفين |
| الإقامة | غير موجود | ✅ للموظفين غير الأردنيين |
| لوحة Compliance | غير موجود | ✅ صفحة مستقلة |
| الشريحة الضريبية | مبسطة | ✅ شرائح أردنية تصاعدية |
| الضمان الاجتماعي | نسبة فقط | ✅ حد أقصى للراتب الخاضع |
| التهيئة | ثابتة | ✅ كل شيء من قاعدة البيانات |
| إشعارات الانتهاء | جزئية | ✅ كاملة لجميع الوثائق |
| سلفة الراتب | غير موجود | ✅ workflow كامل |
| خدمة نهاية الخدمة | حساب بسيط | ✅ قانون العمل الأردني كامل |
| المحافظات الأردنية | مدن عامة | ✅ 12 محافظة + 80 مدينة |
| البنوك الأردنية | قائمة مبسطة | ✅ جميع البنوك الأردنية |
| تقارير الامتثال | غير موجود | ✅ تقرير الضمان + الضريبة |

### Business Scenarios المغطاة:

1. **توظيف موظف مصري** → يطلب النظام تلقائياً تصريح عمل + إقامة + جواز سفر
2. **انتهاء شهادة صحية** → تنبيه قبل 30 يوم للموظف و HR
3. **عدم محكومية جديد** → checklist يتابع التحديث عند انتهاء 6 أشهر
4. **إجازة حج** → يتحقق من 5 سنوات خدمة + مرة واحدة في المسيرة المهنية
5. **إجازة أمومة** → 70 يوم متواصل، إناث فقط، لا يمكن تقسيمها
6. **راتب موظف متدرب** → يتحقق من الحد الأدنى 260 JOD
7. **عمل إضافي في رمضان/يوم جمعة** → يطبق معدل 1.5×
8. **مكافأة نهاية الخدمة للاستقالة** → صفر إذا أقل من 3 سنوات، حساب بعد 3 سنوات
9. **تصريح عمل منتهي** → employee يُعلَّم compliance_risk في الداشبورد
10. **تغيير SSC rate من الإعدادات** → يؤثر على حسابات الراتب التالية فوراً
