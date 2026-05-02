# ZenJO — UI/UX Master Prompt
## Screens, Dashboards, Roles, Scenarios & Lookup Tables
## Part 2 — Complete Frontend Specification

---

> **هذا الـ Prompt يكمّل الـ Prompt الأول (Backend/DB). انسخه كاملاً وضعه في Replit Agent.**

---

```
You are continuing to build ZenJO - the Jordanian HRMS.
The backend (.NET 9 API) and database (MySQL) are already built.
Now build the COMPLETE Angular 18 frontend with every screen, dashboard,
role-based views, business scenarios, and all lookup/configuration tables.

This must look and feel like a professional enterprise HR system (ZenHR/BambooHR level).
Every screen must be fully functional, not placeholder.

═══════════════════════════════════════════════════════════════
SECTION 1: LOOKUP TABLES — COMPLETE LIST
═══════════════════════════════════════════════════════════════

These are all reference/configuration tables that power dropdowns,
policies, and business rules. Build full CRUD management screens for each.

--- 1.1 NATIONALITIES ---
Table: Nationalities
Columns: Id, NameAr, NameEn, CountryCode (ISO 3166-1 alpha-2), IsActive
Pre-seed: All Arab countries + major nationalities in Jordan workforce:
  أردني/Jordanian, فلسطيني/Palestinian, مصري/Egyptian, سوري/Syrian,
  عراقي/Iraqi, سعودي/Saudi, يمني/Yemeni, لبناني/Lebanese,
  سريلانكي/Sri Lankan, فلبيني/Filipino, هندي/Indian,
  باكستاني/Pakistani, بنغلاديشي/Bangladeshi, أمريكي/American,
  بريطاني/British, + 50 more common nationalities

--- 1.2 RELIGIONS ---
Table: Religions
Columns: Id, NameAr, NameEn, IsActive
Values: مسلم/Muslim, مسيحي/Christian, أخرى/Other

--- 1.3 MARITAL_STATUSES ---
Table: MaritalStatuses
Columns: Id, NameAr, NameEn, IsActive
Values: أعزب/Single, متزوج/Married, مطلق/Divorced, أرمل/Widowed

--- 1.4 CITIES ---
Table: Cities
Columns: Id, NameAr, NameEn, GovernorateId, IsActive
Governorates (المحافظات):
  عمان/Amman, إربد/Irbid, الزرقاء/Zarqa, البلقاء/Balqa,
  مادبا/Madaba, الكرك/Karak, الطفيلة/Tafilah, معان/Ma'an,
  العقبة/Aqaba, الأغوار/Ajloun, جرش/Jerash, المفرق/Mafraq
Cities under each governorate (seed all ~150 Jordanian cities)

--- 1.5 BANKS ---
Table: Banks
Columns: Id, NameAr, NameEn, SwiftCode, IsActive
Pre-seed all Jordanian banks:
  البنك العربي/Arab Bank, بنك الأردن/Bank of Jordan,
  البنك الأهلي الأردني/Jordan Ahli Bank,
  البنك التجاري الأردني/Jordan Commercial Bank,
  بنك الإسكان للتجارة والتمويل/Housing Bank,
  بنك القاهرة عمان/Cairo Amman Bank,
  البنك الأردني الكويتي/Jordan Kuwait Bank,
  بنك المال الأردني الإسلامي/Jordan Islamic Bank,
  بنك الاستثمار العربي الأردني/Arab Jordan Investment Bank,
  سيتي بنك/Citibank, HSBC الأردن, ستاندرد تشارترد,
  بنك الاتحاد/Union Bank, بنك بيمو السعودي الفرنسي,
  المصرف العربي الإسلامي الدولي, + others

--- 1.6 EDUCATION_LEVELS ---
Table: EducationLevels
Columns: Id, NameAr, NameEn, SortOrder, IsActive
Values:
  ثانوية عامة/High School (Tawjihi), دبلوم/Diploma (2yr),
  دبلوم متوسط/Associate Degree, بكالوريوس/Bachelor's,
  ماجستير/Master's, دكتوراه/PhD, شهادة مهنية/Professional Certificate,
  تعليم أساسي/Basic Education, بدون/None

--- 1.7 FIELDS_OF_STUDY ---
Table: FieldsOfStudy
Columns: Id, NameAr, NameEn, CategoryId, IsActive
Categories: Engineering, Business, IT, Medical, Sciences, Arts, Law, Education
Seeds: Computer Science, Information Technology, Software Engineering,
  Business Administration, Accounting, Finance, HR Management,
  Civil Engineering, Electrical Engineering, Mechanical Engineering,
  Medicine, Pharmacy, Law, Arabic Literature, English Literature,
  Marketing, Economics, + 80 more

--- 1.8 BLOOD_TYPES ---
Table: BloodTypes
Columns: Id, Name, IsActive
Values: A+, A-, B+, B-, AB+, AB-, O+, O-

--- 1.9 EMPLOYMENT_TYPES ---
Table: EmploymentTypes  
Columns: Id, NameAr, NameEn, IsActive
Values:
  دوام كامل/Full-Time, دوام جزئي/Part-Time,
  عقد/Contract, تجريبي/Probation, مؤقت/Temporary,
  استشاري/Consultant, متدرب/Intern

--- 1.10 CONTRACT_TYPES ---
Table: ContractTypes
Columns: Id, NameAr, NameEn, IsActive
Values:
  دائم/Permanent (Indefinite), محدد المدة/Fixed-Term,
  مشروع/Project-Based, موسمي/Seasonal

--- 1.11 TERMINATION_REASONS ---
Table: TerminationReasons
Columns: Id, NameAr, NameEn, Category (resignation/termination/retirement/other), IsActive
Values:
  استقالة طوعية/Voluntary Resignation,
  إنهاء خدمة/Employment Termination,
  انتهاء العقد/Contract End,
  تقاعد/Retirement,
  وفاة/Death,
  إعادة هيكلة/Restructuring/Layoff,
  إخلال بالعقد/Contract Breach,
  سوء سلوك/Misconduct,
  إجراء تأديبي/Disciplinary Action,
  فشل في فترة التجربة/Probation Failure,
  انتقال داخلي/Internal Transfer,
  أسباب صحية/Health Reasons

--- 1.12 DOCUMENT_TYPES ---
Table: DocumentTypes
Columns: Id, NameAr, NameEn, Category, RequiresExpiry, AlertDaysBefore, IsActive
Values:
  هوية وطنية/National ID (no expiry),
  جواز سفر/Passport (expiry 60d alert),
  تصريح عمل/Work Permit (expiry 60d alert),
  إقامة/Residency Permit (expiry 30d alert),
  عقد عمل/Employment Contract (expiry 30d),
  شهادة طبية/Medical Certificate,
  شهادة جامعية/University Certificate,
  شهادة خبرة/Experience Certificate,
  رخصة قيادة/Driving License (expiry 30d),
  شهادة مهنية/Professional Certificate,
  تأمين صحي/Health Insurance Card (expiry 30d),
  إخلاء سبيل/Police Clearance,
  عقد إيجار/Rental Contract,
  وكالة قانونية/Power of Attorney

--- 1.13 ALLOWANCE_TYPES ---
Table: AllowanceTypes
Columns: Id, NameAr, NameEn, IsSSCApplicable (always false per Jordanian law),
         IsTaxApplicable, IsFixed, IsActive
Values:
  راتب أساسي/Basic Salary (SSC base, taxable),
  بدل سكن/Housing Allowance (not SSC, taxable),
  بدل مواصلات/Transport Allowance (not SSC, not taxable up to limit),
  بدل هاتف/Mobile Allowance (not SSC, taxable),
  بدل طعام/Meal Allowance (not SSC),
  بدل أطفال/Children Allowance (not SSC),
  بدل لباس/Clothing Allowance (not SSC),
  بدل خطورة/Risk Allowance (not SSC),
  بدل ميداني/Field Allowance (not SSC),
  مكافأة/Bonus (taxable),
  عمولة/Commission (taxable),
  بدل عيد/Holiday Bonus,
  بدل تعليم/Education Allowance,
  بدل إيجار سيارة/Car Allowance

--- 1.14 DEDUCTION_TYPES ---
Table: DeductionTypes
Columns: Id, NameAr, NameEn, IsAutomatic, IsActive
Values:
  ضمان اجتماعي/SSC Employee (auto, 7.5%),
  ضريبة دخل/Income Tax (auto, progressive),
  قسط قرض/Loan Installment (auto, per loan schedule),
  سلفة/Salary Advance (manual),
  غياب/Absence Deduction (auto),
  تأخير/Late Deduction (auto if enabled),
  تأمين صحي/Health Insurance Premium (optional),
  خصم تأديبي/Disciplinary Deduction (manual),
  خصم إيجار/Housing Deduction (manual),
  خصم أخرى/Other Deduction (manual)

--- 1.15 LEAVE_TYPES ---
Table: LeaveTypes (extends LeavePolicies)
Columns: Id, NameAr, NameEn, Code, Icon, Color, IsSystemType, IsActive
Values:
  إجازة سنوية/Annual Leave (AL, beach icon, green),
  إجازة مرضية/Sick Leave (SL, medical icon, orange),
  إجازة أمومة/Maternity Leave (ML, baby icon, pink),
  إجازة أبوة/Paternity Leave (PL, baby icon, blue),
  إجازة حج/Hajj Leave (HL, mosque icon, gold),
  إجازة بدون أجر/Unpaid Leave (UL, grey),
  إجازة طارئة/Emergency Leave (EL, alert icon, red),
  إجازة دراسية/Study Leave (STL, book icon, purple),
  إجازة زواج/Marriage Leave (3 days, heart icon, pink),
  إجازة وفاة/Bereavement Leave (3 days, black),
  إجازة إضافية/Compensatory Leave (overtime compensation),
  إجازة رسمية/Public Holiday (auto, calendar icon)

--- 1.16 RELATIONSHIP_TYPES ---
Table: RelationshipTypes
Columns: Id, NameAr, NameEn, IsActive
Values:
  زوج/زوجة/Spouse, ابن/Son, ابنة/Daughter,
  أب/Father, أم/Mother, أخ/Brother, أخت/Sister,
  صديق/Friend, جار/Neighbor, زميل/Colleague, أخرى/Other

--- 1.17 INDUSTRIES ---
Table: Industries
Columns: Id, NameAr, NameEn, IsActive
Values:
  تقنية المعلومات/Information Technology,
  الاتصالات/Telecommunications,
  التصنيع/Manufacturing,
  التجزئة/Retail,
  الرعاية الصحية/Healthcare,
  التعليم/Education,
  الحكومة/Government,
  المال والبنوك/Finance & Banking,
  السياحة والضيافة/Tourism & Hospitality,
  الإنشاء والعقار/Construction & Real Estate,
  النقل والخدمات اللوجستية/Transport & Logistics,
  الطاقة والتعدين/Energy & Mining,
  الإعلام والتسويق/Media & Marketing,
  الزراعة/Agriculture,
  المنظمات غير الربحية/NGO & Non-Profit,
  أخرى/Other

--- 1.18 ASSET_CATEGORIES ---
Table: AssetCategories
Columns: Id, NameAr, NameEn, IsActive

--- 1.19 ASSETS ---
Table: Assets
Columns: Id, CompanyId, AssetCategoryId, NameAr, NameEn,
         SerialNumber, Model, Brand, PurchaseDate, PurchaseValue,
         CurrentStatus (available/assigned/maintenance/retired),
         AssignedToEmployeeId, AssignedDate, ReturnedDate, Notes,
         IsActive + base columns
Asset Categories: لابتوب/Laptop, هاتف/Mobile Phone, سيارة/Car,
  مكيف/AC, طابعة/Printer, ماوس/Mouse, لوحة مفاتيح/Keyboard,
  شاشة/Monitor, سماعات/Headset, بطاقة دخول/Access Card,
  مفاتيح/Keys, ملابس موحدة/Uniform, أدوات/Tools, أخرى/Other

--- 1.20 TRAINING_CATEGORIES ---
Table: TrainingCategories
Columns: Id, NameAr, NameEn, IsActive
Values:
  تقني/Technical, قيادي/Leadership, مهاري/Skills,
  امتثال/Compliance, صحة وسلامة/Health & Safety,
  تعريف بالشركة/Company Orientation, لغات/Languages,
  حاسوب/Computer Skills

--- 1.21 DISCIPLINARY_TYPES ---
Table: DisciplinaryTypes
Columns: Id, NameAr, NameEn, SeverityLevel (1-5), IsActive
Values:
  تنبيه شفهي/Verbal Warning (1),
  إنذار خطي/Written Warning (2),
  إنذار نهائي/Final Warning (3),
  خصم راتب/Salary Deduction (3),
  إيقاف مؤقت/Suspension (4),
  إنهاء خدمة/Termination (5)

--- 1.22 VIOLATION_TYPES ---
Table: ViolationTypes
Columns: Id, NameAr, NameEn, DefaultSeverity, IsActive
Values:
  تأخر متكرر/Repeated Lateness,
  غياب بدون إذن/Unauthorized Absence,
  سوء سلوك/Misconduct,
  إهمال في العمل/Negligence,
  انتهاك سياسة الشركة/Policy Violation,
  سوء استخدام الأصول/Asset Misuse,
  الإخلال بالسرية/Confidentiality Breach,
  تزوير/Falsification,
  تحرش/Harassment,
  مخالفة قانونية/Legal Violation

--- 1.23 EXPENSE_CATEGORIES ---
Table: ExpenseCategories
Columns: Id, NameAr, NameEn, RequiresReceipt, MaxAmount, IsActive
Values:
  سفر/Travel, مواصلات/Transportation, طعام/Meals,
  فندق/Accommodation, مؤتمرات/Conferences, تدريب/Training,
  اتصالات/Communications, مستلزمات مكتبية/Office Supplies,
  ترفيه عملاء/Client Entertainment, طبية/Medical, أخرى/Other

--- 1.24 SKILL_CATEGORIES ---
Table: SkillCategories + Skills
Values:
  مهارات تقنية/Technical Skills:
    برمجة/Programming, قواعد بيانات/Databases, شبكات/Networking, إلخ
  مهارات إدارية/Management Skills:
    قيادة/Leadership, تخطيط/Planning, إدارة فريق/Team Management
  مهارات تواصل/Communication:
    عرض/Presentation, تفاوض/Negotiation, كتابة/Writing
  لغات/Languages:
    عربية/Arabic, إنجليزية/English, فرنسية/French, إلخ

--- 1.25 CONFIGURATIONS ---
Table: SystemConfigurations
Columns: Id, CompanyId, ConfigKey, ConfigValue, ConfigType, Description, IsActive
Keys to seed:
  payroll_day: '25' (Day of month to run payroll)
  work_week_start: 'sunday'
  work_week_end: 'thursday'
  overtime_approval_required: 'true'
  late_deduction_enabled: 'true'
  late_threshold_minutes: '30'
  document_alert_days: '30'
  max_loan_months: '24'
  max_loan_salary_multiplier: '3'
  probation_months: '3'
  annual_leave_accrual: 'monthly' or 'yearly'
  carry_forward_max_days: '10'
  ssc_report_due_day: '15'
  min_password_length: '8'
  session_timeout_minutes: '60'
  currency_symbol: 'د.أ'
  date_format: 'DD/MM/YYYY'
  calendar_type: 'gregorian' (or hijri option)

═══════════════════════════════════════════════════════════════
SECTION 2: USER ROLES — COMPLETE SPECIFICATION
═══════════════════════════════════════════════════════════════

Implement 6 distinct roles with completely different UI experiences:

─────────────────────────────────────────────────────────────
ROLE 1: SUPER ADMIN (مدير النظام)
─────────────────────────────────────────────────────────────
Login: admin@zenjo.com
Access: ALL modules, ALL companies, ALL data
Special capabilities:
  - Create/manage companies (multi-tenant setup)
  - Manage system-wide lookup tables
  - View audit logs for all users
  - Override any approval
  - Access system health dashboard
  - Manage user accounts and reset passwords
  - Configure system-wide settings
  
Sidebar shows ALL navigation items (no restrictions)
Has special "System" section in sidebar:
  - Lookup Tables Management
  - System Configurations  
  - Audit Logs
  - User Management (all companies)

─────────────────────────────────────────────────────────────
ROLE 2: HR ADMIN (مدير الموارد البشرية)
─────────────────────────────────────────────────────────────
Access: All HR operations for their company only
What they CAN do:
  ✅ Full employee management (add/edit/terminate)
  ✅ Manage all leave requests (approve/reject any)
  ✅ Run and finalize payroll (but not without Payroll Admin)
  ✅ Manage recruitment pipeline
  ✅ View all attendance records
  ✅ Generate all reports
  ✅ Manage documents and send alerts
  ✅ Configure HR policies
  ✅ Send HR letters and notices
  ✅ Manage onboarding/offboarding
  ✅ Handle disciplinary actions
  ✅ Manage performance cycles
  
What they CANNOT do:
  ❌ Change payroll calculation rules (Payroll Admin only)
  ❌ Finalize payroll (requires Payroll Admin)
  ❌ Access other companies' data
  ❌ View system audit logs

Dashboard: HR Operations dashboard (see Section 3)

─────────────────────────────────────────────────────────────
ROLE 3: PAYROLL ADMIN (مدير الرواتب)
─────────────────────────────────────────────────────────────
Access: Payroll, Finance, Compliance only
What they CAN do:
  ✅ Create and process payroll runs
  ✅ Review and finalize payroll
  ✅ Manage salary structures and grades
  ✅ Configure payroll rules (SSC rates, tax brackets)
  ✅ Approve/manage loans and advances
  ✅ Generate SSC reports
  ✅ Generate bank transfer files
  ✅ Generate income tax reports
  ✅ View employee salary information
  ✅ View attendance summary (for payroll purposes)
  
What they CANNOT do:
  ❌ Add/edit employees (view only)
  ❌ Approve leave requests
  ❌ Access recruitment
  ❌ Access performance reviews

Dashboard: Payroll & Finance dashboard (see Section 3)

─────────────────────────────────────────────────────────────
ROLE 4: MANAGER (مدير مباشر)
─────────────────────────────────────────────────────────────
Access: ONLY their direct reports (team data)
What they CAN do:
  ✅ View their team members' profiles (read only)
  ✅ Approve/reject their team's leave requests
  ✅ View their team's attendance
  ✅ Approve/reject their team's overtime requests
  ✅ Conduct performance reviews for their team
  ✅ Set and track goals for their team
  ✅ Assign and track tasks for their team
  ✅ View their team's leave calendar (who's off)
  ✅ Submit requests for themselves (as employee)
  
What they CANNOT do:
  ❌ Edit employee salaries or contracts
  ❌ See other departments' employees
  ❌ Access payroll information (except their own payslip)
  ❌ Terminate employees
  ❌ Access recruitment (unless assigned as interviewer)

Dashboard: Team Management dashboard (see Section 3)
My Team widget: Shows only direct reports

─────────────────────────────────────────────────────────────
ROLE 5: EMPLOYEE (موظف)
─────────────────────────────────────────────────────────────
Access: ONLY their own data — strict self-service
What they CAN do:
  ✅ View their own profile
  ✅ Clock in/out (attendance)
  ✅ Submit and track leave requests
  ✅ View their own leave balances
  ✅ Download their own payslips
  ✅ Submit overtime requests
  ✅ Submit expense claims
  ✅ View their work schedule/shifts
  ✅ Complete onboarding tasks
  ✅ Update personal info (phone, address, emergency contact)
  ✅ Change password
  ✅ Submit self-performance review
  ✅ View notifications
  ✅ View company directory (names, emails, phones only)
  ✅ View public holidays calendar
  ✅ Download HR letters addressed to them
  
What they CANNOT do:
  ❌ View other employees' salaries
  ❌ View other employees' personal details
  ❌ Approve any requests
  ❌ Access HR administrative functions
  ❌ Edit their own salary or job info

Dashboard: Employee Self-Service dashboard (see Section 3)

─────────────────────────────────────────────────────────────
ROLE 6: RECRUITER (موظف التوظيف)
─────────────────────────────────────────────────────────────
Access: Recruitment module ONLY + own employee data
What they CAN do:
  ✅ Create and manage job vacancies
  ✅ Review and screen applications
  ✅ Move candidates through pipeline stages
  ✅ Schedule and record interviews
  ✅ Communicate with candidates (email templates)
  ✅ Manage candidate database/talent pool
  ✅ Generate recruitment reports
  ✅ Convert hired candidates to employees (creates draft)
  ✅ Their own ESS features (same as employee role)
  
What they CANNOT do:
  ❌ View existing employees' payroll
  ❌ Approve HR requests
  ❌ Finalize new employee (HR Admin must confirm)

═══════════════════════════════════════════════════════════════
SECTION 3: DASHBOARDS — DETAILED SPECIFICATIONS
═══════════════════════════════════════════════════════════════

─────────────────────────────────────────────────────────────
DASHBOARD 1: HR ADMIN DASHBOARD
─────────────────────────────────────────────────────────────
URL: /dashboard (default for HR Admin role)
Layout: 3-column responsive grid

ROW 1 — KPI Cards (4 cards):
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│  إجمالي الموظفين │   حاضر اليوم     │    في إجازة      │  طلبات معلقة    │
│      247         │    203 (82%)     │     15 (6%)      │      12          │
│  ↑ +3 هذا الشهر │  🟢 أعلى من أمس │  📋 3 طلبات جديدة│  ⚡ تحتاج مراجعة │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘

ROW 2 — Attendance Overview + Leave Calendar:
Left (60%): Bar Chart — "الحضور آخر 30 يوم"
  - X axis: Days
  - Y axis: Count
  - 3 bars per day: Present (blue), Late (orange), Absent (red)
  - Toggle buttons: Last 7d / Last 30d / This Month
  
Right (40%): Mini Calendar
  - Current month
  - Color coding: Green=full attendance, Orange=partial, Red=absent, Blue=holiday
  - Legend below
  - Click on date → shows who was absent that day

ROW 3 — Department Breakdown + Pending Approvals:
Left (40%): Donut Chart — "توزيع الموظفين حسب القسم"
  - Each slice = one department
  - Hover shows count and percentage
  - Legend on right
  - Click slice → drills into department detail

Right (60%): Pending Approvals List
  ┌────────────────────────────────────────────────────────────────┐
  │ الطلبات المعلقة (12)                              [عرض الكل →] │
  ├──────────┬──────────────┬──────────────┬──────────┬────────────┤
  │ الموظف   │ نوع الطلب    │ التفاصيل     │ منذ      │ إجراء      │
  ├──────────┼──────────────┼──────────────┼──────────┼────────────┤
  │ أحمد علي │ إجازة سنوية  │ 3-7 يناير   │ ساعتان  │ ✅ ❌       │
  │ سارة خالد│ أوفرتايم     │ أمس 4 ساعات │ أمس      │ ✅ ❌       │
  │ محمد نور │ إجازة مرضية  │ يومين       │ اليوم    │ ✅ ❌       │
  └──────────┴──────────────┴──────────────┴──────────┴────────────┘

ROW 4 — Three mini widgets:
Left: 🎂 أعياد ميلاد اليوم / هذا الأسبوع
  - Employee photo + name + years at company
  - "أرسل تهنئة" button

Middle: ⚠️ وثائق تنتهي قريباً
  - List: Employee name, document type, days remaining
  - Red if < 7 days, Orange if < 30 days
  - "تجديد" action button

Right: 📊 إحصائيات الشهر
  - New hires: X
  - Terminations: Y
  - Avg attendance rate: Z%
  - Payroll processed: JOD X,XXX

ROW 5 — Quick Actions Bar:
  [+ إضافة موظف] [📋 طلب إجازة] [⏰ معالجة رواتب] [📄 تقرير حضور] [📧 إشعار جماعي]

─────────────────────────────────────────────────────────────
DASHBOARD 2: PAYROLL ADMIN DASHBOARD
─────────────────────────────────────────────────────────────
URL: /dashboard (for Payroll Admin role)

ROW 1 — Financial KPIs:
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│  إجمالي الرواتب  │   اشتراكات ضمان  │  ضريبة الدخل    │   صافي الصرف    │
│  85,430 د.أ     │   6,200 د.أ      │   4,120 د.أ     │  75,110 د.أ     │
│  هذا الشهر      │  صاحب عمل + موظف │  هذا الشهر      │  للصرف          │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘

ROW 2 — Payroll Status Card + Payroll Trend:
Left (40%): Current Payroll Run Status
  ┌────────────────────────────────────┐
  │ كشف رواتب يناير 2025              │
  │ ████████████░░░░ 75%              │
  │ الحالة: قيد المراجعة              │
  │                                    │
  │ ✅ تم المعالجة: 240 موظف           │
  │ ⚠️ استثناءات: 7 حالات             │
  │ ❌ لم تعالج: 3 موظفين             │
  │                                    │
  │ [مراجعة الاستثناءات] [إتمام]      │
  └────────────────────────────────────┘

Right (60%): Line Chart — "تطور تكلفة الرواتب آخر 12 شهر"
  - Two lines: Gross Salary, Net Salary
  - Hover tooltip shows exact amounts
  - Annotations for significant events (hires/terminations)

ROW 3 — Department Cost Breakdown + SSC Status:
Left: Horizontal Bar Chart — "تكلفة الرواتب حسب القسم"
  - Each bar = one department (gross salary)
  - Color by department
  - JOD amounts on bars

Right: SSC Report Status
  ┌────────────────────────────────────────┐
  │ تقرير الضمان الاجتماعي               │
  │ يناير 2025                            │
  │                                        │
  │ مجموع اشتراكات الموظفين: 5,245 د.أ   │
  │ مجموع اشتراكات الشركة: 9,965 د.أ    │
  │ المجموع الكلي: 15,210 د.أ            │
  │                                        │
  │ موعد التسليم: 15 فبراير 2025         │
  │ الحالة: 🟡 لم يُقدّم بعد             │
  │                                        │
  │ [تحميل تقرير SSC] [تقديم]            │
  └────────────────────────────────────────┘

ROW 4 — Loans & Advances widget:
  Active loans count, total outstanding amount, due this month
  Table: Employee, Loan Amount, Remaining, Monthly Installment

─────────────────────────────────────────────────────────────
DASHBOARD 3: MANAGER DASHBOARD  
─────────────────────────────────────────────────────────────
URL: /dashboard (for Manager role)
Focus: "MY TEAM" only

ROW 1 — Team KPIs:
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ حجم الفريق  │ حاضر اليوم  │ في إجازة    │ طلبات تنتظر │
│     12       │    10 (83%) │      2       │      3       │
└──────────────┴──────────────┴──────────────┴──────────────┘

ROW 2 — Team Attendance Today + Who's Off:
Left: Team member cards (grid):
  Each card: Photo circle (green border=present, red=absent, blue=leave)
  Name, Check-in time, Status badge
  
Right: Who's Off This Week calendar
  Days as columns, employees as rows
  Green cell = working, grey = leave, blue = holiday

ROW 3 — Pending Approvals (MY team only):
  Same as HR dashboard but filtered to manager's team only
  
ROW 4 — My Team Performance Snapshot:
  Mini bar chart showing team's KPI completion rate
  Performance review status (who hasn't submitted self-review yet)
  Upcoming review deadlines

─────────────────────────────────────────────────────────────
DASHBOARD 4: EMPLOYEE SELF-SERVICE DASHBOARD
─────────────────────────────────────────────────────────────
URL: /dashboard (for Employee role)
Personal, friendly, minimal

ROW 1 — Personal Status Card:
  ┌──────────────────────────────────────────────────────────┐
  │ 🌅 صباح الخير، أحمد!                                    │
  │                                                           │
  │ 👤 [Photo] أحمد محمد علي                                │
  │    مهندس برمجيات | قسم تقنية المعلومات                  │
  │    مع الشركة منذ 2 سنة و 3 أشهر                        │
  │                                                           │
  │ اليوم: الأحد 15 يناير 2025                              │
  │ وردية: 8:00ص - 5:00م                                    │
  │                                                           │
  │ [📍 تسجيل حضور] ← Big green button (or clock out)      │
  └──────────────────────────────────────────────────────────┘

ROW 2 — My Leave Balances (colorful cards):
  ┌────────────┬────────────┬────────────┬────────────┐
  │ 🌴 سنوية  │ 🏥 مرضية  │ ⏰ إضافية  │ إجمالي    │
  │  8 أيام  │  10 أيام  │   0 أيام   │  18 يوم   │
  │ من أصل 14 │ من أصل 14 │  متاحة     │  متاحة     │
  │ ████░░░░  │ █████████░│            │            │
  └────────────┴────────────┴────────────┴────────────┘
  [+ طلب إجازة جديد] button

ROW 3 — This Month Attendance Summary + My Payslip:
Left: Attendance Summary Card
  - Present days: 18
  - Absent days: 0
  - Late arrivals: 2
  - Overtime hours: 4.5h
  - Progress ring: 95% attendance rate

Right: Latest Payslip Preview
  - Month: January 2025
  - Basic: 800 JOD
  - Total: 1,050 JOD
  - Net: 940 JOD
  - [تحميل قسيمة الراتب] button

ROW 4 — Upcoming & Recent:
Left: Upcoming (approved leaves, interviews, tasks)
Right: Recent Activity Feed (last 10 actions)

ROW 5 — Quick Actions:
  [🏖️ طلب إجازة] [⏰ طلب أوفرتايم] [💰 مطالبة مصاريف] [📄 طلب خطاب HR]

═══════════════════════════════════════════════════════════════
SECTION 4: COMPLETE SCREEN SPECIFICATIONS
═══════════════════════════════════════════════════════════════

─────────────────────────────────────────────────────────────
SCREEN GROUP 1: AUTHENTICATION
─────────────────────────────────────────────────────────────

LOGIN SCREEN (/auth/login):
  - Full screen background: gradient blue or clean white
  - Centered card (max-width 420px)
  - Company logo at top
  - Title: "نظام ZenJO لإدارة الموارد البشرية"
  - Fields:
    - البريد الإلكتروني / Email (with email icon)
    - كلمة المرور / Password (with eye toggle)
  - [تسجيل الدخول] button (primary, full width)
  - "نسيت كلمة المرور؟" link
  - Language toggle: العربية / English (in top right)
  - Loading spinner on submit
  - Error message: "بيانات الدخول غير صحيحة" in red banner
  - On success: redirect based on role to appropriate dashboard

CHANGE PASSWORD SCREEN (/auth/change-password):
  - Old password, new password, confirm password
  - Password strength indicator (Weak/Fair/Strong/Very Strong)
  - Requirements checklist (min 8 chars, uppercase, number, special)
  - Force change if MustChangePassword = true

─────────────────────────────────────────────────────────────
SCREEN GROUP 2: EMPLOYEE MANAGEMENT
─────────────────────────────────────────────────────────────

EMPLOYEE LIST (/employees):
  TOP BAR:
    Left: Page title "الموظفون" + breadcrumb
    Right: [+ إضافة موظف] [📥 استيراد Excel] [📤 تصدير] [🔍]
  
  FILTER BAR (collapsible):
    - Search: (name, code, email, national ID)
    - Department: multi-select dropdown
    - Status: All / Active / Suspended / Terminated
    - Employment Type: All / Full-time / Part-time / Contract
    - Join Date: date range picker
    - [تطبيق] [إعادة تعيين]
  
  VIEW TOGGLE: [☰ جدول] [⊞ بطاقات]
  
  TABLE VIEW columns:
    الكود | الصورة+الاسم | القسم | المسمى الوظيفي | نوع التوظيف | تاريخ التعيين | الراتب (hidden unless HR/Payroll) | الحالة | الإجراءات
  
  CARD VIEW:
    Grid of employee cards (3 per row on desktop, 2 tablet, 1 mobile)
    Each card: Photo, Name, Job Title, Department, Status badge, quick action icons
  
  PAGINATION: Rows per page: 10/25/50/100
  
  ROW ACTIONS (3-dot menu):
    👁️ عرض الملف الكامل
    ✏️ تعديل
    📋 نسخ الموظف (duplicate as template)
    🔒 إيقاف مؤقت
    🚫 إنهاء الخدمة
    🔑 إعادة تعيين كلمة المرور

EMPLOYEE FORM — ADD/EDIT (/employees/new, /employees/:id/edit):
  STEPPER (horizontal on desktop, vertical on mobile):
  
  STEP 1: المعلومات الشخصية
    Row 1: [الاسم الأول عربي*] [الاسم الأوسط عربي] [الاسم الأخير عربي*]
    Row 2: [الاسم الأول إنجليزي*] [الاسم الأوسط إنجليزي] [الاسم الأخير إنجليزي*]
    Row 3: [الجنس* ⊙ ذكر ⊙ أنثى] [تاريخ الميلاد*] [العمر: يحسب تلقائياً]
    Row 4: [الرقم الوطني*] [الجنسية*] [الديانة]
    Row 5: [الحالة الاجتماعية] [عدد المُعالين] [فصيلة الدم]
    Row 6: [رقم الهاتف الشخصي] [البريد الإلكتروني الشخصي]
    Row 7: [الاسم في حالة الطوارئ*] [هاتف الطوارئ*] [صلة القرابة]
    Row 8: [العنوان] [المحافظة] [المدينة]
    Row 9: [صورة شخصية - upload with preview + crop]
    VALIDATION: National ID = 10 digits starting with 1-9
  
  STEP 2: معلومات العمل
    Row 1: [القسم*] [المسمى الوظيفي*]
    Row 2: [المدير المباشر - searchable dropdown] [الدرجة الوظيفية]
    Row 3: [نوع التوظيف*] [نوع العقد*]
    Row 4: [تاريخ التعيين*] [تاريخ نهاية الاختبار] [تاريخ انتهاء العقد (if fixed)]
    Row 5: [البريد الإلكتروني للعمل - auto-suggest: firstname.lastname@company.com]
    Row 6: [هاتف العمل] [الرقم الوظيفي - auto-generated: EMP-XXXX]
    Row 7: [الوردية/نظام العمل]
    Row 8: [تاريخ نهاية خدمة التجربة إن وجدت]
    
  STEP 3: بيانات الراتب والمكافآت
    Header: "إجمالي الراتب: 0 د.أ" (updates live)
    
    EARNINGS SECTION:
    [الراتب الأساسي*] ← REQUIRED, min 290 JOD validation
    [بدل السكن] [بدل المواصلات]
    [بدل الهاتف] [بدل الطعام]
    [بدلات أخرى] ← add multiple with name + amount
    ─────────────────────────────
    إجمالي الراتب: [auto-calculated] د.أ
    
    DEDUCTIONS PREVIEW (informational, auto-calculated):
    ضمان اجتماعي (7.5% من الأساسي): [auto]
    ضريبة دخل المقدرة: [auto]
    ─────────────────────────────
    صافي الراتب التقديري: [auto] د.أ
    
    WAGE WARNING: 🟡 if basic salary < 290 JOD
    
  STEP 4: الضمان الاجتماعي والضريبة
    [رقم الضمان الاجتماعي] [تاريخ الاشتراك في الضمان]
    [⊙ مشمول بالضمان ⊙ غير مشمول] ← radio
    [الرقم الضريبي ISTD] [مبلغ الإعفاء الإضافي]
    INFO BOX: "حسب القانون الأردني، جميع الموظفين مشمولون بالضمان الاجتماعي من أول يوم عمل"
    
  STEP 5: معلومات بنكية
    [اسم البنك - dropdown with all Jordanian banks]
    [رقم الحساب البنكي] [رقم الآيبان IBAN]
    IBAN VALIDATOR: Shows bank name from first 4 chars (JO + bank code)
    
  STEP 6: الوثائق والمؤهلات
    DOCUMENT UPLOAD SECTION:
    For each document type (National ID, Passport, Work Permit, Contract, etc.):
    [📎 رفع الملف] [تاريخ الإصدار] [تاريخ الانتهاء] [جهة الإصدار]
    
    EDUCATION HISTORY:
    [+ إضافة مؤهل] rows:
    [المؤهل] [التخصص] [الجامعة/المدرسة] [سنة التخرج] [البلد]
    
    WORK EXPERIENCE:
    [+ إضافة خبرة سابقة] rows:
    [المسمى الوظيفي] [الشركة] [من] [إلى] [السبب]
    
  STEP 7: مراجعة وتأكيد
    Full summary of all entered data (read-only)
    ✅ Checklist of required items completed
    ⚠️ Warnings for optional but recommended items
    [رجوع] [حفظ وإنشاء الموظف] buttons

EMPLOYEE PROFILE (/employees/:id):
  HEADER SECTION:
    - Cover banner (company color gradient)
    - Profile photo (large, centered on banner edge)
    - Name (Arabic + English below)
    - Job Title | Department
    - Employee Code | Status badge (Active/Suspended/Terminated)
    - Action buttons: [تعديل] [إيقاف مؤقت / تفعيل] [إنهاء الخدمة] [📤 المزيد]
  
  TABS:
  
  TAB 1: نظرة عامة
    3-column info grid:
    Column 1: معلومات شخصية
      الاسم الكامل، الجنس، تاريخ الميلاد، العمر،
      الرقم الوطني، الجنسية، الديانة، الحالة الاجتماعية
    Column 2: معلومات العمل
      القسم، المسمى الوظيفي، المدير المباشر،
      تاريخ التعيين، نوع التوظيف، سنوات الخدمة
    Column 3: معلومات التواصل
      الهاتف الشخصي، البريد الشخصي، هاتف العمل،
      البريد الوظيفي، العنوان، جهة الطوارئ
    
    ────────
    Timeline (mini): Key milestones (Hired, Promoted, Dept Transfer, etc.)
  
  TAB 2: الراتب والمالية
    (Visible to HR Admin + Payroll Admin + Employee themselves only)
    
    Current Salary Breakdown card:
    ┌───────────────────────────────────────┐
    │ الراتب الأساسي:        850.000 د.أ   │
    │ بدل السكن:             200.000 د.أ   │
    │ بدل المواصلات:          75.000 د.أ   │
    │ بدل الهاتف:             25.000 د.أ   │
    │ ─────────────────────────────────────│
    │ إجمالي الراتب:        1,150.000 د.أ  │
    │ خصم الضمان (7.5%):    -63.750 د.أ   │
    │ ضريبة الدخل:           -45.000 د.أ   │
    │ ─────────────────────────────────────│
    │ صافي الراتب:          1,041.250 د.أ  │
    └───────────────────────────────────────┘
    
    Salary History table: Date, Change Type, Old Salary, New Salary, Reason, Changed By
    
    Active Loans table
    
  TAB 3: الحضور
    Monthly attendance calendar:
    - Color coded days (Green=present, Red=absent, Orange=late, Blue=leave, Grey=weekend)
    - Month selector
    - Summary stats below calendar
    - Detailed records table below
    
  TAB 4: الإجازات
    Leave Balances cards (one per leave type)
    Usage history table with status
    Calendar showing past and upcoming leaves
    
  TAB 5: الوثائق
    Document list with status indicators:
    🟢 Valid | 🟡 Expiring soon | 🔴 Expired | ⚪ Not uploaded
    For each doc: Name, Issue Date, Expiry Date, Status, View/Download button
    [+ رفع وثيقة جديدة] button
    
  TAB 6: الأداء
    Performance reviews history (list)
    Current cycle goals and progress
    Latest review summary
    
  TAB 7: التاريخ الوظيفي
    Timeline of all employment events:
    📅 Hire date, 🔄 Department transfers, 💰 Salary changes,
    ⬆️ Promotions, 🎓 Training completed, ⚠️ Disciplinary actions
    
  TAB 8: خطابات HR
    List of HR letters issued to this employee
    Download button per letter

─────────────────────────────────────────────────────────────
SCREEN GROUP 3: LEAVE MANAGEMENT
─────────────────────────────────────────────────────────────

LEAVE REQUESTS LIST (/leave/requests):
  Header: [+ طلب إجازة جديد] [📤 تصدير]
  
  TABS: الكل | معلق | مقبول | مرفوض | ملغي
  
  FILTERS: Employee (HR sees all, Manager sees team, Employee sees own),
           Leave Type, Date Range, Department
  
  TABLE columns:
    الموظف | نوع الإجازة | من | إلى | أيام | حالة الطلب | التاريخ | الإجراء
  
  STATUS BADGES:
    🟡 معلق (Pending)
    🟢 مقبول (Approved)
    🔴 مرفوض (Rejected)
    ⚫ ملغي (Cancelled)

LEAVE REQUEST FORM (Dialog/Modal):
  [نوع الإجازة*] ← dropdown with icons
  [من تاريخ*] [إلى تاريخ*]
  ← Date picker blocks weekends and holidays in red
  ← Auto-calculates: "عدد أيام العمل: X أيام"
  ← Shows remaining balance: "الرصيد المتاح: Y يوم"
  ← Warning if request > balance
  [السبب] ← text area
  [إرفاق مستند] ← file upload (required for sick leave)
  
  INFO BOX: Shows leave policy details for selected type
  
  BUTTONS: [إلغاء] [تقديم الطلب]

LEAVE APPROVAL SCREEN (/leave/team-leaves):
  For managers and HR admins
  
  TABLE with additional columns: Department, Manager
  
  APPROVAL ACTIONS:
    Inline: [✅ قبول] [❌ رفض] buttons
    Or: Click row → Detail slide-over panel with:
      - Employee info
      - Leave details
      - Leave balance (current + after this request)
      - History of past leaves
      - Team calendar showing who else is off those days
      - [قبول] [رفض مع ملاحظة] buttons

LEAVE CALENDAR (/leave/calendar):
  Full-width monthly calendar
  Each employee's leave shown as colored bar spanning their leave days
  Color per leave type
  Filter: Department, Employee Group
  Month navigation
  Click on leave bar → popup with details
  Print button

LEAVE BALANCES (/leave/balances):
  TABLE: Employee | Annual Remaining | Sick Remaining | Other types | Actions
  Filter by department
  Edit balance button (HR Admin only) → Adjustment dialog with reason
  Export to Excel

─────────────────────────────────────────────────────────────
SCREEN GROUP 4: ATTENDANCE
─────────────────────────────────────────────────────────────

CLOCK IN/OUT SCREEN (/attendance/clock):
  For Employees
  
  BIG CARD center of screen:
  ┌────────────────────────────────────────┐
  │ الإثنين، 15 يناير 2025               │
  │ 08:23:45 ← Live updating clock        │
  │                                        │
  │ الوردية: 8:00ص - 5:00م               │
  │ موقعك الحالي: عمان، الأردن 📍         │
  │                                        │
  │      ┌──────────────────┐             │
  │      │  📍 تسجيل حضور  │ ← BIG button│
  │      └──────────────────┘             │
  │      (turns to "تسجيل انصراف" after)  │
  │                                        │
  │ آخر تسجيل: أمس 17:02م انصراف          │
  └────────────────────────────────────────┘
  
  Below: This week attendance mini timeline
  Each day: ● (present/absent/leave) + check-in/out times

ATTENDANCE RECORDS (/attendance/my-attendance for employee):
  Monthly view by default
  CALENDAR HEADER:
    Summary row: Present X | Late X | Absent X | Leave X
  
  TABLE:
    التاريخ | يوم الأسبوع | الحضور | الانصراف | ساعات العمل | التأخير | الوضع
  
  Click on day → detail drawer:
    Check-in time, location, method
    Check-out time, location, method
    Worked hours, late minutes
    [طلب تصحيح] button if wrong

ATTENDANCE REPORT (/attendance/report):
  For HR/Managers
  
  FILTERS: Department, Employee, Month/Year, Status
  
  TABLE: All employees with attendance summary
    الموظف | القسم | أيام العمل | حاضر | غائب | متأخر | ساعات أوفرتايم
  
  EXPORT: Excel, CSV, PDF
  
  Below filters: CHARTS
    Bar chart: Attendance rate by department
    Line chart: Monthly trend

OVERTIME REQUESTS (/attendance/overtime):
  Similar to leave requests
  TABLE: Employee | Date | Start | End | Hours | Type | Status | Action
  
  REQUEST FORM:
    [تاريخ الأوفرتايم*]
    [وقت البداية*] [وقت النهاية*]
    ← Auto-calculates hours
    ← Shows: نوع الأوفرتايم: يوم عادي (1.25x) / عطلة (1.5x)
    ← Shows: المبلغ التقديري: X د.أ
    [السبب*]
    [مرفق]

─────────────────────────────────────────────────────────────
SCREEN GROUP 5: PAYROLL
─────────────────────────────────────────────────────────────

PAYROLL RUNS LIST (/payroll/runs):
  TABLE: الشهر | السنة | عدد الموظفين | إجمالي الرواتب | الحالة | تاريخ الإنشاء | الإجراءات
  
  STATUS BADGES with colors:
    ⚪ مسودة (Draft)
    🔵 قيد المراجعة (Review)
    🟡 معتمد (Approved)
    🟢 نهائي (Finalized)
    🔴 ملغي (Cancelled)
  
  [+ إنشاء كشف رواتب جديد] → Dialog:
    [الشهر*] [السنة*]
    Warning if run already exists for that month
    [إنشاء]

PAYROLL RUN DETAIL (/payroll/runs/:id):
  HEADER:
    Title: "كشف رواتب - يناير 2025"
    Status stepper: مسودة → مراجعة → اعتماد → نهائي
    Action buttons change based on status:
      Draft: [معالجة الرواتب ▶️]
      Review: [اعتماد ✅] [إعادة للمسودة]
      Approved: [تأكيد نهائي 🔒] [رفض]
      Finalized: [تحميل ↓] [طباعة]
  
  SUMMARY CARDS (4):
    إجمالي الرواتب | إجمالي الخصومات | إجمالي الضمان | صافي المصروفات
  
  EXCEPTIONS ALERT (if any):
    🟡 Warning banner: "7 موظفين يحتاجون مراجعة"
    Link to exceptions list
  
  EMPLOYEE TABLE:
    Columns: الموظف | الراتب الأساسي | البدلات | الأوفرتايم | الإجمالي | ضمان | ضريبة | خصومات أخرى | الصافي | إجراء
    
    Expandable row → shows all deduction breakdown
    Edit icon → opens salary adjustment dialog:
      [مكافأة/خصم إضافي] [السبب] [المبلغ]
  
  FOOTER BUTTONS:
    [تصدير SSC] [تحويل بنكي] [تقرير ضريبي] [تحميل كل القسائم ZIP]

PAYSLIP VIEW (/payroll/payslip/:id):
  Print-ready A4 layout, white background
  
  ┌──────────────────────────────────────────────────────────┐
  │  [شعار الشركة]    شركة الأردن للتقنية                   │
  │                   عمان، الأردن | 06-5XXXXXX              │
  ├──────────────────────────────────────────────────────────┤
  │              قسيمة راتب - يناير 2025                    │
  ├────────────────────────┬─────────────────────────────────┤
  │ الاسم: أحمد محمد علي  │ الرقم الوظيفي: EMP-0042        │
  │ المسمى: مهندس برمجيات │ القسم: تقنية المعلومات          │
  │ تاريخ التعيين: 1/3/22 │ رقم الضمان: 12345678           │
  ├────────────────────────┴─────────────────────────────────┤
  │ EARNINGS                        │ DEDUCTIONS             │
  ├─────────────────────────────────┼────────────────────────┤
  │ الراتب الأساسي     800.000 د.أ │ ضمان اجتماعي 60.000   │
  │ بدل السكن          150.000 د.أ │ ضريبة دخل    38.500   │
  │ بدل مواصلات         75.000 د.أ │ قسط قرض      50.000   │
  │ بدل هاتف            25.000 د.أ │                        │
  │ أوفرتايم            35.000 د.أ │                        │
  ├─────────────────────────────────┼────────────────────────┤
  │ إجمالي الاستحقاقات 1,085.000  │ إجمالي الخصومات 148.5  │
  ├─────────────────────────────────┴────────────────────────┤
  │                   صافي الراتب: 936.500 د.أ               │
  │                   ───────────────────────                 │
  ├──────────────────────────────────────────────────────────┤
  │ أيام العمل: 22  | حاضر: 21 | غائب: 1 | إجازات: 0      │
  ├──────────────────────────────────────────────────────────┤
  │ توقيع الموظف: ___________  │ توقيع المفوض: ___________  │
  └──────────────────────────────────────────────────────────┘
  
  [🖨️ طباعة] [📥 تحميل PDF] buttons (hidden from print)

MY PAYSLIPS (/payroll/my-payslips):
  For employee self-service
  Table: الشهر | السنة | الإجمالي | الصافي | تحميل
  Last 24 months shown

─────────────────────────────────────────────────────────────
SCREEN GROUP 6: PERFORMANCE MANAGEMENT
─────────────────────────────────────────────────────────────

PERFORMANCE CYCLES (/performance/cycles):
  For HR Admin only
  TABLE: اسم الدورة | النوع | من | إلى | الموظفون | الحالة | الإجراءات
  
  CREATE CYCLE DIALOG:
    [اسم الدورة*] [نوع الدورة: سنوي/نصف سنوي/ربع سنوي/اختبار]
    [من تاريخ*] [إلى تاريخ*]
    [آخر موعد للتقييم الذاتي] [آخر موعد لتقييم المدير]
    [تطبيق على: جميع الموظفين / قسم محدد / موظفين محددين]

MY GOALS (/performance/my-goals):
  For Employee
  
  Current cycle header with progress bar
  
  GOALS LIST:
    Each goal card:
    ┌────────────────────────────────────────────────────┐
    │ الهدف: تطوير نظام إدارة المخزون                  │
    │ المؤشر: إنجاز 80% من متطلبات النظام               │
    │ الوزن: 30%                                         │
    │ الحالة: 🔵 قيد التنفيذ                            │
    │ التقدم: ████████░░ 75%                            │
    │ [تحديث التقدم]                                    │
    └────────────────────────────────────────────────────┘
  
  [+ إضافة هدف جديد] (if cycle allows employee to add)

MY REVIEWS (/performance/my-reviews):
  For Employee
  
  Current pending self-review (if any):
  ┌────────────────────────────────────────────────────┐
  │ ⚡ لديك تقييم ذاتي معلق                           │
  │ دورة: تقييم 2025 السنوي                           │
  │ آخر موعد: 31 يناير 2025                           │
  │ [بدء التقييم الذاتي ←]                            │
  └────────────────────────────────────────────────────┘
  
  SELF REVIEW FORM:
    For each goal: [التحقيق الفعلي] + [تعليق]
    Overall self-rating (1-5 stars)
    [نقاط قوتي] text area
    [مجالات التطوير] text area
    [احتياجاتي التدريبية] text area
    [تعليق عام] text area
    [حفظ كمسودة] [تقديم نهائياً]
  
  Past reviews list with ratings and feedback

TEAM REVIEWS (/performance/team-reviews):
  For Managers
  
  Team review status table:
  TABLE: الموظف | التقييم الذاتي | تقييم المدير | الدرجة النهائية | الحالة | إجراء
  
  STATUS:
    ⏳ لم يبدأ
    📝 التقييم الذاتي معلق
    ✅ جاهز للمراجعة من المدير
    🔄 المدير قيد التقييم
    ✅ مكتمل
  
  MANAGER REVIEW FORM (opened for each employee):
    Shows employee's self-assessment side by side
    For each goal: Employee answer | Manager rating (1-5) + comment
    Strengths textarea, Improvement areas textarea
    Overall manager rating (1-5) + overall comment
    Development plan suggestions
    [حفظ] [تقديم نهائياً]

─────────────────────────────────────────────────────────────
SCREEN GROUP 7: RECRUITMENT (ATS)
─────────────────────────────────────────────────────────────

VACANCIES LIST (/recruitment/vacancies):
  CARD GRID VIEW:
  Each vacancy card:
  ┌────────────────────────────────────────┐
  │ مهندس برمجيات - قسم IT               │
  │ دوام كامل | عمان | 800-1200 د.أ      │
  │ 45 متقدم | مقابلات: 5 | عروض: 2    │
  │ نُشر: منذ 15 يوم | ينتهي: 15/2/25   │
  │ الحالة: 🟢 نشط                       │
  │ [عرض المتقدمين] [تعديل] [إيقاف]      │
  └────────────────────────────────────────┘

VACANCY FORM:
  Multi-section form (not stepper):
  Section 1: معلومات الوظيفة
    [مسمى الوظيفة عربي*] [مسمى الوظيفة إنجليزي]
    [القسم*] [المسمى الوظيفي المرتبط]
    [نوع التوظيف*] [عدد المطلوبين*]
    [الحد الأدنى للراتب] [الحد الأقصى] [✅ إظهار الراتب للمتقدمين]
    [المدينة]
  
  Section 2: متطلبات الوظيفة
    [وصف الوظيفة - Rich text editor, Arabic RTL]
    [المتطلبات - Rich text editor]
    [المؤهل العلمي] [سنوات الخبرة من] [إلى]
  
  Section 3: النشر
    [تاريخ النشر] [تاريخ الإغلاق]
    [مصادر النشر: ✅ الموقع الإلكتروني ✅ LinkedIn □ Indeed]

RECRUITMENT PIPELINE (/recruitment/pipeline):
  KANBAN BOARD — Full width, horizontal scroll
  
  COLUMNS (one per stage):
  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ تقديم   │ │ تصفية   │ │ هاتفية  │ │ تقنية   │ │ HR       │ │  عرض    │ │ تعيين  │
  │  (45)   │ │  (18)   │ │   (8)   │ │   (5)   │ │  (3)    │ │   (2)   │  │   (1)  │
  │─────────│ │─────────│ │─────────│ │─────────│ │─────────│ │─────────│ │────────│
  │ [Card]  │ │ [Card]  │ │ [Card]  │ │ [Card]  │ │ [Card]  │ │ [Card]  │ │ [Card] │
  │ [Card]  │ │ [Card]  │ │ [Card]  │ │ [Card]  │ │ [Card]  │ │ [Card]  │ │        │
  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
  
  CANDIDATE CARD:
  ┌─────────────────────────────┐
  │ 🧑 محمد أحمد               │
  │ 5 سنوات خبرة | React Dev   │
  │ ★★★★☆ 4.2                  │
  │ في هذه المرحلة: 3 أيام     │
  │ [📧] [📞] [📋 عرض]         │
  └─────────────────────────────┘
  
  Drag card between columns → confirmation dialog → updates stage
  
  FILTERS BAR: [الوظيفة] [المصدر] [التقييم] [المُعيَّن]

CANDIDATE PROFILE (side panel opens on click):
  Photo | Name | Contact
  Applied for: Job title
  Source: LinkedIn / Website / etc.
  Experience, Education, Skills tags
  
  TABS:
    السيرة الذاتية: PDF viewer
    المقابلات: List with dates, interviewers, ratings, feedback
    الملاحظات: Add notes
    التاريخ: Timeline of stage changes

─────────────────────────────────────────────────────────────
SCREEN GROUP 8: REPORTS
─────────────────────────────────────────────────────────────

All report screens follow same layout:
  TOP: Filters | Export buttons
  MIDDLE: Chart visualization
  BOTTOM: Data table

HEADCOUNT REPORT (/reports/headcount):
  FILTERS: Date, Department, Status, Employment Type
  
  CHART 1: Bar chart — Headcount by department
  CHART 2: Pie chart — By employment type
  CHART 3: Line chart — Headcount trend last 12 months (hires vs terminations)
  
  TABLE: Department | Total | Active | Terminated | On Leave | Male | Female | Avg Tenure

PAYROLL SUMMARY REPORT (/reports/payroll):
  FILTERS: Month range, Department
  
  CHART 1: Bar chart — Monthly payroll cost
  CHART 2: Stacked bar — Basic vs Allowances vs Overtime by month
  CHART 3: Department cost comparison
  
  TABLE: Month | Employees | Gross | SSC Employee | SSC Employer | Tax | Net | Total Cost

SSC ANNUAL REPORT (/reports/ssc):
  Full compliance report for the SSC
  Filter by year
  
  TABLE: Employee | SSC Number | Basic Salary | Employee 7.5% | Employer 14.25% | Total | Each Month
  
  EXPORT: Excel format exactly matching SSC official template
  Status column: Submitted / Pending

─────────────────────────────────────────────────────────────
SCREEN GROUP 9: SETTINGS & LOOKUP MANAGEMENT
─────────────────────────────────────────────────────────────

SETTINGS LAYOUT:
  Left sidebar: Settings navigation
    - الشركة (Company Profile)
    - الأقسام (Departments)
    - المسميات الوظيفية (Job Titles)
    - الورديات (Shifts)
    - سياسات الإجازات (Leave Policies)
    - قواعد الرواتب (Payroll Rules)
    - الإجازات الرسمية (Public Holidays)
    - إدارة المستخدمين (Users)
    - جداول البيانات المرجعية (Lookup Tables)
      → المدن والمحافظات
      → البنوك
      → الجنسيات
      → أنواع الوثائق
      → تصنيفات الأصول
      → فئات المصاريف
      → ... (all 25 lookup tables)
    - التكوينات (System Config)
    - سجل التدقيق (Audit Log)

LOOKUP TABLE SCREEN (generic, reused for all 25 tables):
  Title: "إدارة [اسم الجدول]"
  [+ إضافة جديد] [📥 استيراد] [📤 تصدير]
  
  Search bar
  
  TABLE:
    ID | الاسم بالعربي | الاسم بالإنجليزي | [Extra columns if any] | نشط | إجراءات
  
  Row actions: [✏️ تعديل] [🗑️ حذف / إيقاف تفعيل]
  
  ADD/EDIT DIALOG (same for all lookups):
    [الاسم بالعربي*] [الاسم بالإنجليزي*]
    [حقول إضافية حسب الجدول]
    [✅ نشط]
    [حفظ] [إلغاء]

COMPANY PROFILE SETTINGS:
  TABS: معلومات الشركة | الشعار | معلومات الامتثال | البريد الإلكتروني | الإشعارات
  
  Company Info tab:
    [الاسم بالعربي] [الاسم بالإنجليزي]
    [رقم السجل التجاري] [الرقم الضريبي] [رقم الضمان الاجتماعي] [رقم وزارة العمل]
    [القطاع] [العنوان] [المحافظة] [المدينة] [الهاتف] [البريد]
    
  Logo tab: Upload company logo + preview

PAYROLL RULES SETTINGS:
  Per year (2024, 2025, etc.)
  
  SSC SECTION:
    نسبة اشتراك الموظف: [7.50] %
    نسبة اشتراك صاحب العمل: [14.25] %
    الحد الأدنى للضمان: [230] د.أ
    الحد الأقصى للضمان: [3,416] د.أ
    INFO: "هذه النسب مقررة بموجب قانون الضمان الاجتماعي الأردني"
  
  INCOME TAX BRACKETS:
    TABLE:
    الشريحة | من | إلى | النسبة
    1       | 0  |5,000| 5%
    2       |5,001|10,000|10%
    3       |10,001|20,000|15%
    4       |20,001|1,000,000|20%
    5       |1,000,001|-|25%
    INFO: "حسب قانون ضريبة الدخل الأردني"
  
  EXEMPTIONS:
    الإعفاء الشخصي (أعزب): [9,000] د.أ/سنة
    الإعفاء الشخصي (متزوج): [18,000] د.أ/سنة
    إعفاء المعال الواحد: [1,000] د.أ/سنة
  
  OVERTIME RATES:
    أيام العمل: [1.25] x
    أيام العطل والإجازات: [1.50] x
  
  WORK HOURS:
    ساعات العمل اليومية القصوى: [8] ساعات
    ساعات العمل الأسبوعية القصوى: [48] ساعة
  
  [حفظ القواعد]

═══════════════════════════════════════════════════════════════
SECTION 5: COMPLETE BUSINESS SCENARIOS
═══════════════════════════════════════════════════════════════

Implement ALL of these scenarios with correct business logic:

─────────────────────────────────────────────────────────────
SCENARIO 1: إضافة موظف جديد (New Employee Onboarding)
─────────────────────────────────────────────────────────────
TRIGGER: HR Admin submits new employee form

SYSTEM ACTIONS (in order):
1. Validate all required fields + national ID format
2. Check: national ID not already registered
3. Auto-generate employee code: EMP-XXXX (4 digits, sequential per company)
4. Auto-generate work email: firstname.lastname@company.com
5. Calculate probation end date = hire date + 3 months
6. Create Employee record
7. Create User account:
   - Username = work email
   - Temp password = NationalID last 4 digits + "Zj!"
   - MustChangePassword = true
8. Create initial leave balances for current year (prorated from hire date):
   - Annual leave: (months_remaining / 12) × 14 days
   - Sick leave: full 14 days
   - All other applicable leave types
9. Assign employee to their shift
10. Create Notification for:
    - HR Admin: "تم إضافة موظف جديد: [name]"
    - Direct Manager: "تم تعيين موظف جديد تحت إشرافك: [name]"
11. Create document alerts for uploaded documents with expiry dates
12. Log in AuditLog
13. Return success with employee ID

IF probation period: Set reminder for HR 7 days before probation end

─────────────────────────────────────────────────────────────
SCENARIO 2: معالجة الرواتب الشهرية (Monthly Payroll Processing)
─────────────────────────────────────────────────────────────
TRIGGER: Payroll Admin clicks "معالجة الرواتب"

PRE-CHECKS (show errors if any):
  ✅ No unprocessed payroll for this month already
  ✅ Attendance data is complete for all employees
  ⚠️ Flag employees with missing attendance (don't block, just warn)
  ⚠️ Flag employees with negative leave balance
  ⚠️ Flag employees below minimum wage

FOR EACH ACTIVE EMPLOYEE:
  
  Step 1: Get base salary from employee record
  
  Step 2: Calculate attendance for the month:
    - working_days_in_month = business days (exclude weekends + holidays)
    - present_days = count from Attendance table (status='present' or 'late')
    - absent_days = working_days - present_days - leave_days
    - late_minutes_total = sum of LateMinutes
  
  Step 3: Calculate earnings:
    - daily_rate = TotalSalary / working_days_in_month
    - gross_earnings = TotalSalary - (absent_days × daily_rate)
    - overtime_pay = sum of approved OvertimeRequests this month
      (weekday hours × hourly_rate × 1.25) + (weekend hours × hourly_rate × 1.5)
    - bonus = any manual bonus entered for this run
  
  Step 4: Calculate SSC deduction:
    - ssc_base = MIN(BasicSalary, SSCMaxSalary)
    - ssc_base = MAX(ssc_base, SSCMinSalary) [only if BasicSalary < min]
    - employee_ssc = ssc_base × 0.075
    - employer_ssc = ssc_base × 0.1425
    [SSC applied to basic salary ONLY, per Jordanian law]
  
  Step 5: Calculate income tax:
    - annual_gross = TotalSalary × 12 (annualized)
    - annual_ssc = employee_ssc × 12
    - personal_exemption = (married ? 18000 : 9000) + (dependents × 1000)
    - taxable_income = annual_gross - annual_ssc - personal_exemption - other_exemptions
    - taxable_income = MAX(0, taxable_income)
    
    - annual_tax = calculate_progressive_tax(taxable_income):
      bracket_1 = MIN(taxable_income, 5000) × 0.05
      bracket_2 = MIN(MAX(0, taxable_income - 5000), 5000) × 0.10
      bracket_3 = MIN(MAX(0, taxable_income - 10000), 10000) × 0.15
      bracket_4 = MIN(MAX(0, taxable_income - 20000), 980000) × 0.20
      bracket_5 = MAX(0, taxable_income - 1000000) × 0.25
      annual_tax = sum of all brackets
    
    - monthly_tax = annual_tax / 12
    
  Step 6: Calculate other deductions:
    - loan_deduction = sum of active loan installments due this month
    - advance_deduction = any salary advance taken this month
    - late_deduction = (if enabled) late_minutes_total > threshold ? 
        (late_hours × hourly_rate) : 0
    - absence_deduction = absent_days × daily_basic_rate (from basic only)
    - other_manual_deductions = any HR-entered deductions
  
  Step 7: Calculate net salary:
    - total_deductions = employee_ssc + monthly_tax + loan_deduction + 
                         advance_deduction + late_deduction + absence_deduction + other_deductions
    - net_salary = gross_earnings - total_deductions
    
    IF net_salary < 0: Flag as exception, notify HR
    IF net_salary < 290 JOD: Flag as below minimum wage
  
  Step 8: Save PayrollDetails record
  
  Step 9: Update loan paid installments count
  
After all employees processed:
  Update PayrollRun totals
  Update status to 'review'
  Create notification for HR Admin + Payroll Admin
  Log in AuditLog

─────────────────────────────────────────────────────────────
SCENARIO 3: إنهاء خدمة موظف (Employee Termination)
─────────────────────────────────────────────────────────────
TRIGGER: HR Admin submits termination form

TERMINATION FORM (Dialog):
  [سبب الإنهاء*] dropdown → TerminationReasons lookup
  [تاريخ الإنهاء*]
  [تفاصيل إضافية] textarea
  CHECKBOX: إنشاء التسوية النهائية تلقائياً
  
SYSTEM CALCULATIONS:
  1. Calculate remaining annual leave days = leave balance remaining
  2. Calculate leave encashment = remaining_days × (monthly_salary / 30)
  3. Calculate end of service (for non-SSC employees):
     years_of_service = (termination_date - hire_date) in years
     eosb = last_basic_salary × years_of_service
     If partial year: prorated
  4. Check for active loans → calculate remaining balance
  5. Check for any pending approvals → auto-cancel

FINAL SETTLEMENT SUMMARY (show before confirming):
  ┌────────────────────────────────────────────┐
  │ التسوية النهائية - أحمد علي               │
  │                                             │
  │ آخر يوم عمل: 31/1/2025                    │
  │ فترة الخدمة: 3 سنوات و 4 أشهر            │
  │                                             │
  │ المستحقات:                                 │
  │ راتب يناير (حتى 31/1):    850.000 د.أ    │
  │ رصيد إجازة متبقٍ (8 أيام): 226.667 د.أ  │
  │ مكافأة نهاية الخدمة:     2,833.000 د.أ  │
  │ ─────────────────────────────────────      │
  │ إجمالي المستحقات:        3,909.667 د.أ   │
  │                                             │
  │ الخصومات:                                  │
  │ رصيد القرض المتبقي:       -200.000 د.أ   │
  │ ─────────────────────────────────────      │
  │ صافي المستحق:            3,709.667 د.أ   │
  └────────────────────────────────────────────┘
  
  [تأكيد الإنهاء] [إلغاء]

ON CONFIRM:
  1. Set employee status = terminated
  2. Set termination date and reason
  3. Revoke system access (User.IsActive = false)
  4. Create final payroll entry for termination month
  5. Mark as final settlement generated
  6. Release all assigned assets (create return request)
  7. Create offboarding task checklist
  8. Notify: HR Admin, Direct Manager, IT (access revocation)
  9. Archive employee record (IsDeleted soft delete stays false — must keep for compliance)
  10. Log in AuditLog with all details

─────────────────────────────────────────────────────────────
SCENARIO 4: طلب إجازة ورفض الطلب (Leave Request & Rejection)
─────────────────────────────────────────────────────────────
TRIGGER: Employee submits leave request

VALIDATION RULES:
  ✅ Start date must be in future (or today if half-day)
  ✅ End date >= start date
  ✅ Cannot overlap with existing approved/pending leave
  ✅ Check balance: total_days <= remaining_balance
     (unless CanBeNegative = true for the policy)
  ✅ Check min service months for eligibility
  ✅ For sick leave > 3 days: require medical certificate attachment
  ✅ For Hajj leave: check employee hasn't taken it before

CONFLICT CHECK:
  ⚠️ Warn if >X% of team already on leave those days
  ⚠️ Warn if leaves overlap with public holiday (show actual working days)

ON SUBMIT:
  1. Calculate actual working days (exclude weekends + holidays from date range)
  2. Create LeaveRequest with status='pending'
  3. Deduct from PendingDays in balance
  4. Notify direct manager (email + in-app notification)
  5. Notify employee: "تم تقديم طلب إجازتك بنجاح"

MANAGER APPROVES:
  1. Update status = approved
  2. Move from PendingDays → UsedDays in balance
  3. Update Attendance records for those days (status='on_leave')
  4. Notify employee: "تمت الموافقة على إجازتك من [date] إلى [date]"

MANAGER REJECTS:
  1. MUST enter rejection reason (required field)
  2. Update status = rejected
  3. Remove from PendingDays (restore balance)
  4. Notify employee: "تم رفض طلب إجازتك - السبب: [reason]"

EMPLOYEE CANCELS (before start date only):
  1. Status = cancelled
  2. Restore PendingDays to balance
  3. Notify manager

─────────────────────────────────────────────────────────────
SCENARIO 5: احتساب الضمان الاجتماعي وتوليد تقرير SSC
─────────────────────────────────────────────────────────────
TRIGGER: Click "توليد تقرير SSC" from finalized payroll run

REPORT GENERATION:
  For each employee in the payroll run:
    - Get basic salary used in payroll
    - Apply SSC ceiling (3,416 JOD)
    - Apply SSC floor (230 JOD if applicable)
    - Calculate employee contribution: basic × 7.5%
    - Calculate employer contribution: basic × 14.25%
    - Get employee SSC number from profile

OUTPUT FORMAT (Excel):
  Row per employee:
  رقم الضمان | الاسم | الراتب الأساسي | اشتراك الموظف | اشتراك صاحب العمل | المجموع
  
  FOOTER:
  المجموع الكلي | [sum] | [sum] | [sum]
  
  SEPARATE SHEET: تقرير ملخص لمؤسسة الضمان الاجتماعي
  شهر: يناير 2025
  عدد المشتركين: X
  إجمالي اشتراكات الموظفين: X د.أ
  إجمالي اشتراكات صاحب العمل: X د.أ
  المجموع الواجب دفعه: X د.أ
  تاريخ الاستحقاق: 15/2/2025
  
UPDATE: Mark SSCMonthlyReport as generated

─────────────────────────────────────────────────────────────
SCENARIO 6: تجديد تصريح عمل تلقائي (Work Permit Expiry Alert)
─────────────────────────────────────────────────────────────
TRIGGER: Background job runs daily at 8:00 AM

LOGIC:
  Query all employee documents where:
    ExpiryDate IS NOT NULL
    AND ExpiryDate BETWEEN TODAY and TODAY + AlertDaysBefore days
    AND IsDeleted = 0
    AND Employee.EmploymentStatus = 'active'
  
  For each found document:
    Calculate days_remaining = ExpiryDate - TODAY
    
    IF days_remaining <= 7: Severity = CRITICAL (red)
    IF days_remaining <= 30: Severity = WARNING (orange)  
    IF days_remaining <= 60: Severity = NOTICE (yellow)
    
    Create Notification for HR Admin:
      "⚠️ تصريح عمل [employee_name] ينتهي بعد [X] أيام"
    
    IF not already notified in last 7 days: send email to HR Admin
    
  Dashboard widget shows count of expiring documents

─────────────────────────────────────────────────────────────
SCENARIO 7: أوفرتايم وأثره على الراتب
─────────────────────────────────────────────────────────────
TRIGGER: Employee submits overtime request

VALIDATION:
  ✅ Date must be today or in the past (can't pre-request future overtime)
  ✅ Hours must be > 0
  ✅ Cannot overlap with existing overtime request

CALCULATION PREVIEW:
  hourly_rate = BasicSalary / 30 / 8
  
  IF date is working day:
    rate = 1.25
    type = "يوم عمل عادي"
  ELSE IF date is weekend/holiday:
    rate = 1.50
    type = "يوم إجازة/عطلة"
  
  overtime_pay = hours × hourly_rate × rate
  
  SHOW: "الأجر المتوقع: X د.أ ([Y] ساعة × [rate]x)"

ON APPROVAL:
  Amount reflected in next payroll run automatically
  Linked to attendance record for that date

═══════════════════════════════════════════════════════════════
SECTION 6: SHARED UI COMPONENTS
═══════════════════════════════════════════════════════════════

BUILD THESE REUSABLE COMPONENTS:

1. AppHeaderComponent:
   - Company logo
   - Page title (dynamic)
   - Notification bell with badge count (opens notification panel)
   - User avatar with dropdown (Profile, Change Password, Logout)
   - Language toggle (AR/EN)
   - Mobile hamburger menu

2. AppSidebarComponent:
   - Logo at top
   - Navigation items with icons (Arabic labels)
   - Collapsible on desktop
   - Role-based items (auto-hide non-permitted items)
   - Active route highlighting
   - Sub-menus with accordion
   - Footer: app version + company name

3. StatCardComponent:
   Input: title, value, subtitle, icon, color, trend (up/down), trendValue
   Output: styled KPI card with icon and trend indicator

4. DataTableComponent (wrapper around MatTable):
   Input: columns config, data, pagination, loading state
   Features: sort by column, search, export button, row actions
   Emits: page change, sort change, search, action

5. ConfirmDialogComponent:
   Input: title, message, confirmText, type (danger/warning/info)
   Two-step confirmation for critical actions (type "DELETE" to confirm)

6. FileUploadComponent:
   Input: accept types, max size, multiple
   Features: drag & drop, preview, progress bar, validation
   Shows: file name, size, type icon

7. StatusBadgeComponent:
   Input: status string
   Maps to: color + Arabic label automatically
   All statuses: active, inactive, pending, approved, rejected, terminated, etc.

8. EmptyStateComponent:
   Input: icon, title, description, actionLabel, actionRoute
   Shows when table/list has no data

9. LoadingSpinnerComponent:
   Full-screen overlay variant + inline variant

10. NotificationPanelComponent (slide-over):
    Triggered by bell icon in header
    Shows paginated notifications
    Mark single / all as read
    Notification types with different icons

11. BreadcrumbComponent:
    Auto-generates from route structure
    Arabic labels from route data

12. DateRangePickerComponent:
    Material date range picker with presets:
    (اليوم, هذا الأسبوع, هذا الشهر, الشهر الماضي, هذه السنة)

13. ArabicNumberPipe:
    Formats numbers with Arabic-Indic digits option
    Currency pipe with JOD symbol (د.أ)

14. PageHeaderComponent:
    Input: title, breadcrumbs, actions array
    Actions render as buttons in top right

15. SalaryBreakdownComponent:
    Reusable component showing salary breakdown table
    Used in payslip + employee profile + payroll run detail

═══════════════════════════════════════════════════════════════
SECTION 7: NOTIFICATIONS SYSTEM
═══════════════════════════════════════════════════════════════

In-app notification center:
- Bell icon in header with unread count badge
- Click → slide-over panel from right
- Real-time updates via polling (every 60 seconds) or SignalR

NOTIFICATION TYPES & MESSAGES (Arabic):

🏖️ LEAVE:
  "قدّم [name] طلب إجازة من [date] إلى [date]" → for manager
  "تمت الموافقة على إجازتك بتاريخ [date]" → for employee
  "تم رفض طلب إجازتك - السبب: [reason]" → for employee
  "يوجد [X] طلبات إجازة تنتظر موافقتك" → daily digest for manager

⏰ ATTENDANCE:
  "لم يتم تسجيل حضورك اليوم" → employee (if missed clock-in by 10 AM)
  "تسجيل حضور مشبوه - موقع خارج نطاق العمل" → HR Alert

💰 PAYROLL:
  "تم إصدار كشف راتب [month] [year]" → all employees
  "يمكنك الآن تنزيل قسيمة راتب [month]" → employee
  "كشف الرواتب يحتاج اعتمادك" → payroll admin/hr

📄 DOCUMENTS:
  "تصريح عمل [name] ينتهي بعد [X] أيام" → HR
  "جواز سفرك ينتهي بعد [X] أيام" → employee self

⭐ PERFORMANCE:
  "دورة التقييم [cycle_name] بدأت - قدّم تقييمك الذاتي" → employees
  "آخر موعد للتقييم الذاتي غداً" → employees pending
  "يوجد [X] تقييمات تنتظرك" → managers

👥 RECRUITMENT:
  "متقدم جديد على وظيفة [title]" → recruiter
  "مقابلة غداً مع [candidate]" → interviewer reminder

🏢 SYSTEM:
  "مرحباً بك في ZenJO! قم بإكمال إعداد ملفك الشخصي" → new employee
  "تذكير: إكمال مهام الـ Onboarding ([X] مهام متبقية)" → new employee

═══════════════════════════════════════════════════════════════
SECTION 8: MOBILE RESPONSIVE RULES
═══════════════════════════════════════════════════════════════

BREAKPOINTS:
  Mobile: < 768px
  Tablet: 768px - 1024px
  Desktop: > 1024px

MOBILE-SPECIFIC BEHAVIORS:
- Sidebar collapses to hamburger menu (full-screen overlay when open)
- Tables convert to card list on mobile (no horizontal scroll)
- Multi-step forms become full-screen
- Dashboard charts stack vertically
- Modals become full-screen bottom sheets
- Action buttons become floating action button (FAB)

MOBILE PRIORITY SCREENS (must be 100% mobile-friendly):
1. Login screen
2. Dashboard (simplified for mobile)
3. Clock in/out (this is primary mobile use case)
4. Leave request form
5. Leave balances
6. Notifications panel
7. My payslips
8. Approval screen (manager approving from mobile)

═══════════════════════════════════════════════════════════════
SECTION 9: ARABIC/RTL REQUIREMENTS
═══════════════════════════════════════════════════════════════

ALL of the following MUST work correctly in Arabic RTL mode:

1. Body dir="rtl" when Arabic language active
2. Sidebar on RIGHT side in Arabic
3. All icons on correct sides (chevrons flip, arrows flip)
4. Form labels above (not inline with wrong alignment)
5. Table text right-aligned in Arabic
6. Breadcrumb separators flip
7. Stepper numbers appear on right side
8. Dialog buttons order flips (Cancel on right, Confirm on left in Arabic)
9. Date picker opens in RTL mode
10. All Angular Material components use direction="rtl"
11. Text input direction="rtl" for Arabic fields
12. Mixed content (Arabic + numbers) handled correctly
13. Charts: labels in correct direction
14. Notifications slide from left in Arabic (not right)
15. Currency: "1,050.500 د.أ" format (JOD = 3 decimal places)
16. Date format: DD/MM/YYYY for Arabic display
17. Phone numbers: left-to-right even in RTL (use dir="ltr" on phone inputs)
18. Employee codes, IBAN, account numbers: always LTR
```

---

## ملاحظات الاستخدام

### كيف تستخدم هاد الـ Prompt مع الأول:

**الخطوة 1:** ضع الـ Prompt الأول في Replit Agent (Backend + DB)
**الخطوة 2:** بعد ما يخلص أو في جلسة جديدة، ضع هاد الـ Prompt (UI + Screens)

أو دمجهم مع بعض في نفس الـ Agent session بإضافة هاد في الأول:
```
Continue building ZenJO that was started.
Now implement the complete frontend based on these specifications:
[paste this prompt]
```

### أهم ما في هاد الـ Prompt:

| القسم | التفاصيل |
|-------|---------|
| Lookup Tables | 25 جدول مرجعي مكتمل بالبيانات الأردنية |
| Roles | 6 أدوار بشاشات مختلفة كلياً |
| Dashboards | 4 dashboards مخصصة لكل دور |
| Screens | 40+ شاشة مفصّلة بكل الحقول |
| Scenarios | 7 سيناريوهات عمل كاملة بالخطوات |
| Components | 15 مكوّن مشترك قابل لإعادة الاستخدام |
| Notifications | 20+ نوع إشعار بنصوص عربية |
| Mobile | قواعد responsive كاملة |
| RTL | 18 قاعدة للعربية والـ RTL |
