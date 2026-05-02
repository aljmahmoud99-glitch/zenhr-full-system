# ZenHR — توثيق شامل للنظام
## Complete System Documentation

> **النسخة:** 1.0  
> **تاريخ الإعداد:** أبريل 2026  
> **النطاق:** MENA Region — Saudi Arabia, UAE, Jordan, Egypt, Kuwait, Iraq  
> **اللغات المدعومة:** Arabic / English (Bilingual)

---

## 📋 جدول المحتويات

1. [نظرة عامة على المشروع](#1-نظرة-عامة-على-المشروع)
2. [الأهداف والرؤية](#2-الأهداف-والرؤية)
3. [الـ Actors (الجهات الفاعلة)](#3-الـ-actors-الجهات-الفاعلة)
4. [الوحدات (Modules)](#4-الوحدات-modules)
5. [Business Rules — قواعد العمل](#5-business-rules--قواعد-العمل)
6. [Workflows — سير العمليات](#6-workflows--سير-العمليات)
7. [متطلبات النظام (System Requirements)](#7-متطلبات-النظام-system-requirements)
8. [متطلبات وظيفية (Functional Requirements)](#8-متطلبات-وظيفية-functional-requirements)
9. [متطلبات غير وظيفية (Non-Functional Requirements)](#9-متطلبات-غير-وظيفية-non-functional-requirements)
10. [التكاملات (Integrations)](#10-التكاملات-integrations)
11. [الأمان والصلاحيات (Security & Permissions)](#11-الأمان-والصلاحيات-security--permissions)
12. [Use Cases التفصيلية](#12-use-cases-التفصيلية)
13. [نموذج البيانات (Data Model Overview)](#13-نموذج-البيانات-data-model-overview)
14. [Mobile App Requirements](#14-mobile-app-requirements)
15. [Compliance & Localization](#15-compliance--localization)

---

## 1. نظرة عامة على المشروع

### 1.1 تعريف ZenHR

**ZenHR** هو نظام إدارة موارد بشرية سحابي متكامل (Cloud-Based HRMS) مصمم خصيصاً لشركات منطقة الشرق الأوسط وشمال أفريقيا (MENA). يهدف إلى أتمتة جميع العمليات الإدارية والموارد البشرية من لحظة التعيين حتى نهاية الخدمة.

### 1.2 الجمهور المستهدف

| الفئة | الحجم |
|-------|-------|
| الشركات الصغيرة والمتوسطة (SME) | من 10 إلى 500 موظف |
| الشركات المتوسطة والكبيرة | من 500 إلى أكثر من 5000 موظف |
| المؤسسات متعددة الفروع | أي حجم مع فروع متعددة |

### 1.3 النموذج التقني

- **نوع النظام:** SaaS — Software as a Service
- **البنية التحتية:** Cloud-Based (Multi-tenant)
- **قاعدة البيانات:** موحدة لجميع الوحدات (Unified Data Model)
- **الوصول:** Web Browser + Mobile App (iOS / Android)
- **الأمان:** SOC 2 Compliant — Enterprise-grade Encryption

---

## 2. الأهداف والرؤية

### 2.1 المشكلة التي يحلها النظام

| المشكلة | الحل |
|---------|------|
| الاعتماد على الإكسل وملفات يدوية | بيانات مركزية موحدة |
| عدم الامتثال لقوانين العمل المحلية | Localization تلقائي لكل دولة |
| بطء عمليات الموافقة والطلبات | Automated Approval Workflows |
| تكرار إدخال البيانات بين الأنظمة | تكامل كامل بين جميع الوحدات |
| صعوبة متابعة أداء الموظفين | Performance Management مدمج |
| أخطاء في احتساب الرواتب | Automated Payroll Engine |

### 2.2 الأهداف الرئيسية

1. **أتمتة كاملة** لدورة حياة الموظف من التعيين للإنهاء
2. **الامتثال القانوني** لقوانين العمل في كل دولة بمنطقة MENA
3. **تجربة مستخدم محسّنة** للموظف والمدير وقسم HR
4. **تحليلات وتقارير** لاتخاذ قرارات مبنية على البيانات
5. **تكامل سلس** مع الأنظمة المحاسبية وأنظمة الحكومة

---

## 3. الـ Actors (الجهات الفاعلة)

يحتوي ZenHR على **7 Actors** رئيسيين، لكل منهم صلاحيات وأدوار محددة:

---

### 👤 Actor 1: Super Admin (مدير النظام العام)

**التعريف:** المسؤول الأعلى عن إعداد وتهيئة النظام بالكامل على مستوى الشركة.

**الصلاحيات:**
- إنشاء وإدارة الشركة وجميع الفروع
- إعداد هيكل المنظمة (Org Structure)
- تهيئة سياسات الإجازات والرواتب والحضور
- إدارة الأدوار والصلاحيات لجميع المستخدمين
- الوصول الكامل لجميع التقارير والبيانات
- إعداد التكاملات مع الأنظمة الخارجية
- إدارة اشتراكات ووحدات النظام

**العمليات الرئيسية:**
- `createCompany()` / `configureBranch()`
- `assignRoles()` / `setPermissions()`
- `configurePayrollRules()`
- `setupLeavePolicy()`
- `manageIntegrations()`

---

### 👤 Actor 2: HR Manager (مدير الموارد البشرية)

**التعريف:** المسؤول اليومي عن إدارة الموظفين والعمليات البشرية.

**الصلاحيات:**
- إدارة ملفات الموظفين الكاملة (إضافة، تعديل، أرشفة)
- إدارة دورة الإجازات والمغادرات
- الموافقة على الطلبات والإجراءات
- تشغيل دورة الرواتب
- إدارة عمليات الاستقدام (مع ZenATS)
- متابعة الحضور والغياب
- إنشاء وإرسال خطابات HR
- الوصول للتقارير والتحليلات

**العمليات الرئيسية:**
- `addEmployee()` / `updateEmployee()` / `terminateEmployee()`
- `processPayroll()` / `reviewPayroll()`
- `approveLeaveRequest()` / `manageLeavePolicies()`
- `generateHRLetter()` / `manageDocuments()`
- `runAttendanceReport()` / `generateComplianceReport()`

---

### 👤 Actor 3: Payroll Manager (مدير الرواتب)

**التعريف:** متخصص في معالجة الرواتب وضمان الامتثال القانوني المالي.

**الصلاحيات:**
- إعداد ومعالجة دورات الرواتب
- إدارة بدلات الرواتب والخصومات
- حساب مكافآت نهاية الخدمة (EOSB)
- إدارة السلف والقروض
- توليد ملفات WPS وتقارير GOSI
- تصدير قيود المحاسبة
- إدارة مراكز التكلفة (Cost Centers)

**العمليات الرئيسية:**
- `runPayrollCycle()` / `reviewPayroll()` / `finalizePayroll()`
- `calculateEOSB()` / `processLoanDeductions()`
- `generateWPSFile()` / `submitGOSIReport()`
- `exportJournalEntries()`

---

### 👤 Actor 4: Line Manager / Department Manager (المدير المباشر)

**التعريف:** مدير الفريق أو القسم، يدير موظفيه المباشرين.

**الصلاحيات (محدودة لفريقه فقط):**
- الموافقة/رفض طلبات الإجازة لمرؤوسيه
- الموافقة على طلبات الأوفرتايم
- مراجعة سجلات الحضور لفريقه
- إجراء تقييمات الأداء
- تعيين وتتبع المهام
- عرض تقارير فريقه

**العمليات الرئيسية:**
- `approveLeave()` / `rejectLeave()`
- `approveOvertime()` / `rejectOvertime()`
- `conductPerformanceReview()`
- `assignTask()` / `trackTask()`
- `viewTeamAttendance()`

---

### 👤 Actor 5: Employee (الموظف)

**التعريف:** المستخدم النهائي — أي موظف في الشركة.

**الصلاحيات (Self-Service فقط):**
- تسجيل الحضور والانصراف (Clock In/Out)
- تقديم طلبات الإجازة ومتابعتها
- الاطلاع على رصيد الإجازات
- تنزيل قسائم الرواتب (Payslips)
- تحديث بياناته الشخصية
- تقديم طلب أوفرتايم
- الاطلاع على جدول عمله ومواعيد الوردية
- رفع المستندات المطلوبة
- متابعة مهام الـ Onboarding
- تقديم طلب مصاريف (Expense Claim)

**العمليات الرئيسية:**
- `clockIn()` / `clockOut()`
- `submitLeaveRequest()` / `cancelLeaveRequest()`
- `downloadPayslip()` / `viewSalaryDetails()`
- `submitOvertime()` / `submitExpenseClaim()`
- `updatePersonalInfo()` / `uploadDocument()`
- `completOnboardingTask()`

---

### 👤 Actor 6: Recruiter (موظف التوظيف)

**التعريف:** المسؤول عن عمليات الاستقطاب والتوظيف عبر ZenATS.

**الصلاحيات:**
- نشر الوظائف الشاغرة
- مراجعة وفلترة طلبات المتقدمين
- إدارة مراحل التوظيف
- جدولة وإجراء المقابلات
- إرسال عروض العمل
- تحويل المرشح المقبول إلى موظف (Onboarding)
- إدارة قاعدة بيانات المرشحين (Talent Pool)

**العمليات الرئيسية:**
- `publishJobVacancy()` / `closeVacancy()`
- `reviewApplications()` / `filterCandidates()`
- `scheduleInterview()` / `conductVideoInterview()`
- `sendJobOffer()` / `rejectCandidate()`
- `convertToEmployee()` / `manageOnboarding()`

---

### 👤 Actor 7: External Candidate (المتقدم للوظيفة)

**التعريف:** شخص خارجي يتقدم لوظيفة شاغرة.

**الصلاحيات (محدودة — Career Portal فقط):**
- الاطلاع على الوظائف الشاغرة
- تقديم طلب التوظيف
- رفع السيرة الذاتية والمستندات
- تتبع حالة طلبه
- الاستجابة لمواعيد المقابلات

---

## 4. الوحدات (Modules)

ZenHR مكوّن من **9 وحدات رئيسية** تتشارك قاعدة بيانات واحدة موحدة:

---

### 📦 Module 1: Core HR — إدارة الموظفين

**الوصف:** النواة الأساسية للنظام — مركزية كاملة لبيانات الموظفين ودورة حياتهم.

#### الميزات التفصيلية:

| الميزة | الوصف |
|--------|-------|
| Employee Profile | ملف شامل لكل موظف (بيانات شخصية، وظيفية، تعاقدية) |
| Org Chart | هيكل تنظيمي مرئي وقابل للتخصيص |
| Onboarding Workflow | قوائم مهام إلكترونية للموظفين الجدد |
| Offboarding Workflow | إجراءات إنهاء الخدمة مع EOSB تلقائي |
| Asset Management | تتبع أصول الشركة المعينة لكل موظف |
| Document Management | تخزين آمن للعقود والمستندات مع تنبيهات الانتهاء |
| HR Letters | قوالب خطابات تلقائية مع التوقيع الإلكتروني |
| Salary Scale | جدول درجات الرواتب والبدلات |
| Custom Fields | حقول مخصصة حسب احتياجات الشركة |
| Suspension Management | إدارة الإيقاف مع التحكم بالرواتب والصلاحيات |
| Employee Directory | دليل موظفين كامل قابل للبحث |

#### Business Rules:
- لا يمكن حذف موظف من النظام — يتم أرشفته فقط
- كل موظف يجب أن ينتمي لقسم واحد على الأقل
- تاريخ انتهاء العقد يولّد تنبيهاً تلقائياً قبل 30 يوماً
- الوثائق المنتهية الصلاحية تولّد تنبيهاً لـ HR والموظف

---

### 📦 Module 2: Payroll — الرواتب

**الوصف:** محرك رواتب متكامل مع امتثال كامل لقوانين كل دولة في MENA.

#### الميزات التفصيلية:

| الميزة | الوصف |
|--------|-------|
| Gross-to-Net Calculation | احتساب الراتب الصافي تلقائياً |
| Multi-Currency | دعم عملات متعددة |
| Allowances & Deductions | إدارة البدلات والخصومات |
| EOSB Calculation | احتساب مكافأة نهاية الخدمة تلقائياً |
| Loan Management | إدارة السلف مع خطة الاستقطاع |
| Expense Management | مطالبات المصاريف مع الموافقات |
| Cost Center Allocation | توزيع تكاليف الرواتب على المراكز |
| Multi-Payroll | دورات رواتب منفصلة لكل فرع |
| Vacation Salary Advance | صرف راتب إجازة مسبقاً |
| WPS File Generation | ملفات WPS للبنوك والحكومة |
| GOSI / Social Security | تقارير التأمينات الاجتماعية |
| Payslip Generation | قسائم راتب إلكترونية |
| Accounting Export | تصدير قيود للأنظمة المحاسبية |
| Health Insurance Deductions | إدارة خصومات التأمين الصحي |

#### Business Rules:
- دورة الرواتب تمر بـ 3 مراحل: **Draft → Review → Final**
- لا يمكن تعديل الرواتب بعد مرحلة Final
- EOSB يُحسب وفق قانون العمل المحلي لكل دولة
- الموظف لا يمكنه الاطلاع على رواتب الآخرين
- يجب الموافقة على طلب السلفة قبل استقطاعها

---

### 📦 Module 3: Attendance & Time Tracking — الحضور والوقت

**الوصف:** نظام متكامل لتتبع الحضور بأساليب متعددة.

#### طرق تسجيل الحضور:

```
Clock-In Methods:
├── Mobile App (GPS + Geofencing)
├── QR Code Scan
├── Biometric Devices (Fingerprint / Facial / Iris)
│   └── ZKTeco Integration (BioTimeCloud)
├── Web Browser Clock-in
└── Kiosk Mode
```

#### الميزات التفصيلية:

| الميزة | الوصف |
|--------|-------|
| Geolocation Tracking | تتبع الموقع الجغرافي عند تسجيل الحضور |
| Geofencing | تقييد التسجيل ضمن نطاق جغرافي محدد |
| Shift Management | إدارة الورديات (عادي، روستر، ليلي، مرن) |
| Missing Punch Workflow | طلب تصحيح سجل الحضور |
| Overtime Management | إدارة الأوفرتايم مع قواعد مخصصة |
| Leave Management | إجازات سنوية، مرضية، أمومة، أبوة، بدون أجر |
| Disciplinary Recommendations | توصيات تلقائية عند انتهاك سياسات الحضور |
| Attendance Reports | تقارير فورية قابلة للتصدير |
| Timesheet | جداول الوقت المفصلة |

#### Business Rules:
- يمكن للمدير المباشر فقط الموافقة على Missing Punch لفريقه
- الأوفرتايم يحتاج موافقة المدير المباشر ثم HR
- الغياب المتكرر (3 مرات أو أكثر) يولّد توصية تأديبية تلقائية
- نهاية كل شهر تتدفق بيانات الحضور تلقائياً لوحدة الرواتب
- الجيوفنسينج قابل للإعداد لكل موقع عمل بشكل مستقل

---

### 📦 Module 4: ESS & MSS — الخدمة الذاتية

**الوصف:** بوابة الخدمة الذاتية للموظف (ESS) والمدير (MSS).

#### ESS — Employee Self-Service:

| الوظيفة | الوصف |
|---------|-------|
| Leave Request | تقديم / إلغاء / متابعة طلبات الإجازة |
| Leave Balance | عرض رصيد الإجازات المتبقي |
| Payslip | تنزيل قسائم الراتب التاريخية |
| Attendance | عرض سجل الحضور الشخصي |
| Overtime Request | تقديم طلب أوفرتايم |
| Expense Claim | تقديم مطالبة مصاريف |
| Document Center | الوصول للمستندات الشخصية |
| Profile Update | تحديث البيانات الشخصية |
| Task Completion | إتمام مهام الـ Onboarding / Offboarding |
| Schedule View | عرض جدول الوردية والعمل |
| Who's Off | معرفة من هم في إجازة اليوم |

#### MSS — Manager Self-Service:

| الوظيفة | الوصف |
|---------|-------|
| Approval Dashboard | لوحة موافقات مركزية |
| Team Attendance | متابعة حضور الفريق |
| Team Leave Calendar | تقويم إجازات الفريق |
| Override Approval | تجاوز الموافقة بالنيابة |
| Performance Reviews | إجراء تقييمات الأداء |
| Task Assignment | تعيين المهام لأعضاء الفريق |

---

### 📦 Module 5: Performance & Evaluation — الأداء والتقييم

**الوصف:** نظام تقييم أداء مؤتمت ومتعدد الأبعاد.

#### دورة التقييم (Evaluation Cycle):

```
Performance Cycle:
1. Goal Setting        → تحديد الأهداف و KPIs لكل موظف
2. Mid-Year Review     → مراجعة منتصف العام (اختياري)
3. Self-Assessment     → تقييم الموظف لنفسه
4. Manager Review      → تقييم المدير للموظف
5. Calibration         → معايرة الدرجات عبر الأقسام
6. Final Rating        → الدرجة النهائية مع Audit Trail
7. Development Plan    → خطة التطوير بناءً على النتائج
```

#### الميزات:

| الميزة | الوصف |
|--------|-------|
| KPI Management | أهداف قابلة للقياس مرتبطة بالأداء |
| 360° Feedback | تغذية راجعة من الزملاء والمرؤوسين |
| Rating Scales | مقاييس تقييم مخصصة |
| Performance History | سجل تاريخي للتقييمات |
| Development Plans | خطط التطوير والتدريب |

#### Business Rules:
- لا يمكن فتح دورة تقييم جديدة قبل إغلاق الحالية
- الموظف لا يرى تقييم المدير قبل إغلاق دورة التقييم
- التقييمات تبقى في السجل التاريخي ولا يمكن حذفها

---

### 📦 Module 6: ZenATS — نظام تتبع المتقدمين (Recruitment)

**الوصف:** منصة توظيف متكاملة من الاستقطاب حتى الإلحاق بالعمل.

#### مراحل التوظيف (Hiring Pipeline):

```
Recruitment Pipeline:
├── Vacancy Activation    → نشر الوظيفة (ZenHR → ZenATS)
├── Sourcing              → جمع الطلبات (LinkedIn, Career Page, Portals)
├── Screening             → AI CV Parsing + تصفية تلقائية
├── Phone Screen          → مقابلة هاتفية / تقييم أولي
├── Technical Interview   → مقابلة تقنية / Zoom Integration
├── HR Interview          → مقابلة HR
├── Assessment            → اختبارات (Third-party Integration)
├── Offer                 → عرض العمل الإلكتروني
├── Acceptance/Rejection  → رد المتقدم
└── Onboarding            → تحويل للموظف في ZenHR (Seamless)
```

#### الميزات:

| الميزة | الوصف |
|--------|-------|
| AI CV Parsing | تحليل السيرة الذاتية وتلقائي وإنشاء ملف منظم |
| Smart Matching | مطابقة ذكية للمرشحين مع متطلبات الوظيفة |
| Career Page Builder | صفحة وظائف مخصصة بالعلامة التجارية |
| LinkedIn Easy Apply | نشر مباشر على LinkedIn وقبول طلبات Easy Apply |
| Zoom Integration | مقابلات فيديو مدمجة |
| Talent Pool | قاعدة بيانات مرشحين للوظائف المستقبلية |
| Boolean Search | بحث متقدم في ملفات المتقدمين |
| Analytics | تقارير Time-to-Hire ومعدلات القبول |
| Email/SMS Templates | إشعارات تلقائية للمتقدمين |
| CV Migration | استيراد CVs موجودة |
| Collaborative Hiring | مشاركة الفريق في التقييم |

---

### 📦 Module 7: Reports & Analytics — التقارير والتحليلات

**الوصف:** لوحة تحكم تحليلية شاملة مع تقارير مخصصة.

#### أنواع التقارير:

| الفئة | الأمثلة |
|-------|---------|
| HR Reports | تقارير توزيع الموظفين، معدل الدوران، الهيكل التنظيمي |
| Payroll Reports | تقارير الرواتب التفصيلية، مراكز التكلفة، الإجمالي vs الصافي |
| Attendance Reports | تقارير التأخر، الغياب، الأوفرتايم، الإجازات |
| Compliance Reports | تقارير GOSI/WPS جاهزة للتقديم الحكومي |
| Performance Reports | نتائج التقييمات، توزيع الدرجات، KPI Completion |
| Recruitment Reports | Time-to-Hire، Fill Rate، مصادر التوظيف |
| Custom Reports | قوالب مخصصة بمرشحات متعددة |

---

### 📦 Module 8: Document Management — إدارة المستندات

**الوصف:** مستودع مركزي آمن لجميع وثائق HR والموظفين.

#### الميزات:

| الميزة | الوصف |
|--------|-------|
| Centralized Repository | تخزين موحد لجميع المستندات |
| Expiry Alerts | تنبيهات تلقائية عند اقتراب انتهاء الوثيقة |
| Role-Based Access | صلاحيات مخصصة لكل نوع مستند |
| Electronic Signature | توقيع إلكتروني على العقود والخطابات |
| Version Control | تتبع إصدارات المستندات |
| Document Requests | طلب تحديث مستند من الموظف |

---

### 📦 Module 9: Onboarding & Offboarding — الالتحاق وإنهاء الخدمة

#### Onboarding Workflow:

```
New Employee Onboarding:
PRE DAY-1:
├── إرسال بريد ترحيبي تلقائي
├── قائمة مهام IT (إنشاء حسابات، أجهزة)
├── جمع المستندات الشخصية
└── إتمام الاستمارات الإلكترونية

DAY 1:
├── تفعيل الحساب في ZenHR
├── تعيين الأصول (أجهزة، بطاقات)
└── الاطلاع على سياسات الشركة

FIRST WEEK:
├── إتمام مهام التوجيه
├── مراجعة ووقيع على العقود
└── إكمال إعداد البيانات الشخصية

ONGOING:
└── تتبع تقدم الـ Onboarding Tasks
```

#### Offboarding Workflow:

```
Employee Offboarding:
├── رفع طلب الاستقالة / إنهاء الخدمة
├── استرداد الأصول (أجهزة، بطاقات، مفاتيح)
├── إلغاء صلاحيات النظام تلقائياً
├── احتساب EOSB + الإجازات غير المستهلكة
├── توليد وثيقة التسوية النهائية
├── Exit Interview
└── أرشفة ملف الموظف
```

---

## 5. Business Rules — قواعد العمل

### 5.1 قواعد الإجازات

```
Leave Rules:
├── رصيد الإجازة السنوية يُحسب بناءً على تاريخ الانضمام
├── الإجازة المرضية تتطلب تقديم وثيقة طبية (> 3 أيام)
├── لا يمكن أن يكون أكثر من X% من الفريق في إجازة في نفس الوقت
├── الإجازة في الرصيد السالب تحتاج موافقة HR Manager
├── يمكن ترحيل الإجازات غير المستهلكة (حسب سياسة الشركة)
└── إجازة الأمومة/الأبوة وفق قانون العمل المحلي
```

### 5.2 قواعد الرواتب

```
Payroll Rules:
├── تأخر أكثر من 30 دقيقة = خصم يوم (حسب السياسة)
├── EOSB = (آخر راتب × سنوات الخدمة) بحساب نسبي
├── الضريبة والتأمينات تُحسب تلقائياً حسب البلد
├── لا يمكن تعديل الراتب الشهري بعد تأكيد دورة الرواتب
├── السلفة لا تتجاوز راتب شهر كامل (قابل للتخصيص)
└── يجب موافقة مستويين على تعديل الراتب
```

### 5.3 قواعد الأوفرتايم

```
Overtime Rules:
├── الساعات الإضافية في أيام العمل = 1.25x أو 1.5x (حسب الدولة)
├── الساعات الإضافية في العطل = 2x (حسب القانون)
├── يجب تقديم طلب الأوفرتايم قبل تنفيذه (أو في نفس اليوم)
├── الحد الأقصى للأوفرتايم الشهري = قابل للتخصيص
└── يمكن تعويضه بوقت راحة (Compensatory Leave) بدلاً من المال
```

### 5.4 قواعد التوظيف

```
Recruitment Rules:
├── لا يمكن نشر وظيفة بدون موافقة مدير القسم
├── لا يمكن تقديم عرض عمل بدون موافقة HR Manager
├── المتقدم المرفوض يبقى في قاعدة البيانات للمستقبل
├── بيانات المتقدمين محفوظة وفق GDPR / قوانين الخصوصية
└── الوظيفة تُغلق تلقائياً عند تعبئة المقاعد المحددة
```

---

## 6. Workflows — سير العمليات

### 6.1 Workflow: طلب إجازة

```
┌─────────────────────────────────────────────────────────────┐
│                    LEAVE REQUEST WORKFLOW                    │
└─────────────────────────────────────────────────────────────┘

Employee                Manager              HR System
   │                       │                     │
   │──── Submit Request ──►│                     │
   │     (Type, Dates,      │                     │
   │      Reason)           │                     │
   │                        │◄── Notification ────│
   │                        │    (Email + Push)    │
   │                        │                     │
   │                   [Review]                   │
   │                   ┌──────┐                   │
   │                   │Approve│                   │
   │                   │Reject │                   │
   │                   └──────┘                   │
   │                        │                     │
   │◄── Notification ───────│                     │
   │    (Approval/Rejection) │                     │
   │                        │                     │
   │                        │──── Update ────────►│
   │                        │     Leave Balance    │
   │                        │     Attendance       │
   │                        │     Payroll          │
   │                        │                     │

EXCEPTION PATHS:
- Manager غير متاح → Override بواسطة HR Manager
- رصيد غير كافٍ → Pending + HR Approval Required
- فترة الذروة → تحذير تلقائي للمدير
```

### 6.2 Workflow: دورة الرواتب

```
┌─────────────────────────────────────────────────────────────┐
│                      PAYROLL CYCLE WORKFLOW                  │
└─────────────────────────────────────────────────────────────┘

STEP 1: DATA COLLECTION (نهاية الشهر)
├── جلب بيانات الحضور من Attendance Module
├── تطبيق قواعد الإجازات والأوفرتايم
├── احتساب البدلات والخصومات
└── حساب أقساط القروض والسلف

STEP 2: DRAFT PAYROLL
├── توليد كشف الرواتب المبدئي
├── مراجعة Payroll Manager
└── تصحيح أي أخطاء

STEP 3: REVIEW & APPROVAL
├── مراجعة HR Manager
├── موافقة CFO / Finance (للشركات الكبيرة)
└── Lock الكشف (لا تعديل بعد هذا)

STEP 4: FINALIZE & DISTRIBUTE
├── توليد قسائم الرواتب الإلكترونية
├── إرسال لكل موظف عبر ESS
├── توليد ملف WPS للبنك
├── تصدير قيود المحاسبة
└── تقديم تقارير GOSI/Social Security
```

### 6.3 Workflow: دورة التوظيف (Recruitment)

```
┌─────────────────────────────────────────────────────────────┐
│                    RECRUITMENT WORKFLOW                      │
└─────────────────────────────────────────────────────────────┘

HR Manager                Recruiter               Candidate
   │                         │                        │
   │─── Vacancy Request ────►│                        │
   │    (Position, Grade)     │                        │
   │                          │                        │
   │                     [Publish Job]                 │
   │                          │──── Career Page ──────►│
   │                          │──── LinkedIn ─────────►│
   │                          │──── Job Boards ───────►│
   │                          │                        │
   │                          │◄─── Application ───────│
   │                          │     (CV, Documents)     │
   │                          │                        │
   │                     [AI CV Parsing]               │
   │                     [Smart Matching]              │
   │                          │                        │
   │                     [Screening]                   │
   │                          │──── Auto-Email ───────►│
   │                          │     (Status Update)     │
   │                          │                        │
   │                     [Interviews]                  │
   │                     (Zoom/In-Person)              │
   │                          │                        │
   │◄── Final Recommendation──│                        │
   │    (Hire / Reject)        │                        │
   │                          │                        │
   │─── Job Offer ───────────►│──── Offer Letter ─────►│
   │    (Approve)              │                        │
   │                          │◄─── Acceptance ─────────│
   │                          │                        │
   │                     [Convert to Employee]         │
   │                     [Trigger Onboarding]          │
```

### 6.4 Workflow: تقييم الأداء

```
┌─────────────────────────────────────────────────────────────┐
│                  PERFORMANCE REVIEW WORKFLOW                 │
└─────────────────────────────────────────────────────────────┘

HR Admin → Opens Evaluation Cycle (Annual/Semi-Annual)
    │
    ▼
Manager → Sets Goals & KPIs for each employee
    │
    ▼
During Period → Ongoing feedback & progress tracking
    │
    ▼
Employee → Completes Self-Assessment
    │
    ▼
Manager → Completes Manager Review
    │
    ▼
HR Admin → Calibration Session (Normalize Ratings)
    │
    ▼
Final Rating → Published to Employee
    │
    ▼
Development Plan → Created based on results
    │
    ▼
HR Admin → Closes Cycle & Archives Results
```

---

## 7. متطلبات النظام (System Requirements)

### 7.1 الـ Infrastructure

| المكوّن | المتطلب |
|---------|---------|
| Hosting | Cloud-Based (AWS / Azure) |
| Availability | 99.9% SLA Uptime |
| Data Backup | Daily Automated Backups |
| Disaster Recovery | RPO < 1 hour, RTO < 4 hours |
| Data Centers | MENA-region Compliant |

### 7.2 الأداء (Performance)

| المؤشر | المستهدف |
|--------|---------|
| Page Load Time | < 3 seconds |
| API Response Time | < 500ms |
| Concurrent Users | 10,000+ |
| Payroll Processing | < 30 min for 5,000 employees |

### 7.3 المتصفحات المدعومة

- Google Chrome (آخر إصدارين)
- Mozilla Firefox (آخر إصدارين)
- Microsoft Edge (آخر إصدارين)
- Safari (آخر إصدارين)

### 7.4 Mobile App

- iOS 14+
- Android 9+
- Responsive Web (Tablet-friendly)

---

## 8. متطلبات وظيفية (Functional Requirements)

### FR-01: إدارة الموظفين

| الكود | المتطلب | الأولوية |
|-------|---------|---------|
| FR-01.1 | يجب أن يتمكن HR من إضافة موظف جديد مع جميع بياناته | Must Have |
| FR-01.2 | يجب أن يدعم النظام هيكلاً تنظيمياً متعدد المستويات | Must Have |
| FR-01.3 | يجب تتبع تاريخ التغييرات على ملف الموظف (Audit Log) | Must Have |
| FR-01.4 | يجب إرسال تنبيه عند اقتراب انتهاء الإقامة/الجواز | Must Have |
| FR-01.5 | يجب دعم الحقول المخصصة (Custom Fields) | Should Have |
| FR-01.6 | يجب دعم تصدير بيانات الموظفين إلى Excel/CSV | Should Have |

### FR-02: الرواتب

| الكود | المتطلب | الأولوية |
|-------|---------|---------|
| FR-02.1 | يجب احتساب الراتب الصافي تلقائياً | Must Have |
| FR-02.2 | يجب دعم الضرائب والتأمينات لكل دولة MENA | Must Have |
| FR-02.3 | يجب توليد ملفات WPS للبنوك | Must Have |
| FR-02.4 | يجب احتساب EOSB تلقائياً عند إنهاء الخدمة | Must Have |
| FR-02.5 | يجب دعم مراكز التكلفة المتعددة | Should Have |
| FR-02.6 | يجب تصدير قيود محاسبية لـ QuickBooks / SAP | Should Have |

### FR-03: الحضور

| الكود | المتطلب | الأولوية |
|-------|---------|---------|
| FR-03.1 | يجب دعم تسجيل الحضور عبر GPS / QR / Biometric | Must Have |
| FR-03.2 | يجب دعم Geofencing لتقييد نطاق التسجيل | Must Have |
| FR-03.3 | يجب دعم أنواع الورديات المتعددة | Must Have |
| FR-03.4 | يجب ربط بيانات الحضور تلقائياً بالرواتب | Must Have |
| FR-03.5 | يجب إصدار توصيات تأديبية تلقائية عند الانتهاك | Should Have |

### FR-04: Onboarding

| الكود | المتطلب | الأولوية |
|-------|---------|---------|
| FR-04.1 | يجب إمكانية إنشاء Checklists مخصصة لكل منصب | Must Have |
| FR-04.2 | يجب إرسال تنبيهات تلقائية لكل صاحب مهمة | Must Have |
| FR-04.3 | يجب تتبع نسبة إتمام مهام الـ Onboarding | Must Have |

---

## 9. متطلبات غير وظيفية (Non-Functional Requirements)

### NFR-01: الأمان (Security)

| المتطلب | التفاصيل |
|---------|---------|
| Authentication | Multi-Factor Authentication (MFA) |
| Authorization | Role-Based Access Control (RBAC) |
| Encryption | TLS 1.2+ في النقل، AES-256 في التخزين |
| Session Management | Auto-logout بعد فترة خمول |
| Audit Trail | تسجيل جميع العمليات الحساسة |
| SOC 2 Compliance | شهادة SOC 2 Type II |

### NFR-02: قابلية التوسع (Scalability)

- دعم من 10 إلى +50,000 موظف
- إضافة وحدات جديدة دون إعادة تطوير
- دعم فروع وكيانات متعددة في نفس الحساب

### NFR-03: قابلية الاستخدام (Usability)

- واجهة ثنائية اللغة (عربي / إنجليزي) مع RTL كامل
- تصميم متجاوب لجميع الأجهزة
- إتمام الطلبات الشائعة في < 3 نقرات

### NFR-04: الموثوقية (Reliability)

- Uptime 99.9% (< 8.7 ساعة توقف سنوياً)
- Zero data loss لأي عملية مالية

---

## 10. التكاملات (Integrations)

### 10.1 الحكومية والامتثال

| الجهة | الدولة | نوع التكامل |
|-------|-------|------------|
| Mudad | السعودية | WPS Payroll File |
| GOSI | السعودية | Social Insurance Reporting |
| Muqeem | السعودية | Expat Workforce Management |
| MOHRE / WPS | الإمارات | Wage Protection System |
| Social Insurance | الأردن / مصر / الكويت | تقارير التأمينات |

### 10.2 الأنظمة المحاسبية

| النظام | نوع التكامل |
|--------|------------|
| QuickBooks | Journal Entry Export (API) |
| Xero | Journal Entry Export (API) |
| SAP Business One | Payroll Integration |
| NetSuite | Journal Entry Export |
| Oracle ERP | Custom API |

### 10.3 أنظمة التوظيف والتقييم

| النظام | نوع التكامل |
|--------|------------|
| LinkedIn (Easy Apply) | Job Publishing + Application Sync |
| Zoom | Video Interviews |
| LinkedIn Assessments | Candidate Testing |

### 10.4 أجهزة الحضور

| الجهاز | نوع التكامل |
|--------|------------|
| ZKTeco (Fingerprint/Facial/Iris) | BioTimeCloud Real-time Sync |
| Generic Biometric Devices | File Import / API |
| QR Code Kiosks | Real-time Sync |

### 10.5 الصحة والرفاهية

| النظام | الوصف |
|--------|-------|
| Altibbi | تطبيب عن بُعد للموظفين (MENA) |

---

## 11. الأمان والصلاحيات (Security & Permissions)

### 11.1 نموذج الصلاحيات (RBAC)

```
Permission Hierarchy:
├── Super Admin
│   └── Full Access (All Modules + Configuration)
├── HR Manager
│   └── All Employees Data + All HR Operations
│       (excluding: system config, integrations setup)
├── Payroll Manager
│   └── Payroll + Finance + Compliance Reports
│       (excluding: other HR operations)
├── Line Manager
│   └── Own Team Only (Leave, Attendance, Performance)
├── Employee
│   └── Own Data Only (ESS Portal)
└── Recruiter
    └── ZenATS + Candidate Data Only
```

### 11.2 مبدأ Least Privilege

- كل مستخدم يرى فقط البيانات التي يحتاجها
- الرواتب لا تُعرض إلا لصاحبها وـ Payroll Manager وـ HR Manager
- بيانات الموظفين في فروع أخرى لا تُعرض إلا للـ Super Admin

### 11.3 Audit Trail

جميع العمليات التالية تُسجَّل تلقائياً:
- تغييرات بيانات الموظف (من، ماذا، متى)
- الموافقات والرفض (مع التعليقات)
- تعديلات الرواتب
- تسجيل الدخول والخروج
- الوصول للبيانات الحساسة

---

## 12. Use Cases التفصيلية

### UC-01: إضافة موظف جديد

| الحقل | التفاصيل |
|-------|---------|
| **الاسم** | Add New Employee |
| **الـ Actor** | HR Manager |
| **المحفّز** | تعيين موظف جديد |
| **المتطلبات المسبقة** | الموظف تم قبوله وتجهيز عقده |
| **التدفق الرئيسي** | 1. HR يفتح نموذج إضافة موظف<br>2. إدخال البيانات الشخصية<br>3. إدخال البيانات الوظيفية (القسم، الدرجة، المدير المباشر)<br>4. إدخال بيانات الراتب<br>5. رفع المستندات المطلوبة<br>6. حفظ وتفعيل الحساب<br>7. إطلاق Onboarding Workflow تلقائياً |
| **التدفقات البديلة** | - البيانات ناقصة → رسالة خطأ مع تحديد الحقل<br>- رقم الهوية مكرر → تحذير تكرار |
| **النتيجة** | موظف جديد في النظام + Onboarding مطلق |

---

### UC-02: دورة الرواتب الشهرية

| الحقل | التفاصيل |
|-------|---------|
| **الاسم** | Monthly Payroll Run |
| **الـ Actor** | Payroll Manager, HR Manager |
| **المحفّز** | نهاية الشهر |
| **التدفق الرئيسي** | 1. Payroll Manager يفتح دورة الرواتب<br>2. النظام يجمع بيانات الحضور والإجازات<br>3. احتساب الرواتب الصافية تلقائياً<br>4. Payroll Manager يراجع ويصحح أي استثناءات<br>5. HR Manager يوافق على الكشف<br>6. Lock الدورة<br>7. توزيع قسائم الرواتب للموظفين<br>8. توليد ملف WPS وتقرير GOSI |
| **التدفقات البديلة** | - خطأ في بيانات موظف → تنبيه وإيقاف معالجته حتى التصحيح |
| **النتيجة** | رواتب محتسبة + قسائم موزعة + ملفات حكومية جاهزة |

---

### UC-03: طلب إجازة والموافقة

| الحقل | التفاصيل |
|-------|---------|
| **الاسم** | Leave Request & Approval |
| **الـ Actor** | Employee (يبدأ), Line Manager (يوافق) |
| **المحفّز** | الموظف يريد إجازة |
| **المتطلبات المسبقة** | الموظف لديه رصيد إجازة كافٍ |
| **التدفق الرئيسي** | 1. الموظف يختار نوع الإجازة والتواريخ<br>2. النظام يتحقق من الرصيد<br>3. إرسال الطلب للمدير المباشر<br>4. المدير يستلم إشعار (Email + Push)<br>5. المدير يراجع التقويم (من في إجازة؟)<br>6. الموافقة أو الرفض مع تعليق<br>7. الموظف يستلم إشعار بالقرار<br>8. تحديث الرصيد والحضور تلقائياً |
| **النتيجة** | إجازة معتمدة + رصيد محدث + حضور محدث |

---

## 13. نموذج البيانات (Data Model Overview)

```
CORE ENTITIES:
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Company    │──1:N─│    Branch    │──1:N─│  Department  │
└──────────────┘      └──────────────┘      └──────────────┘
                                                    │
                                                   1:N
                                                    │
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  JobGrade    │──1:N─│   Employee   │──N:1─│  Department  │
└──────────────┘      └──────────────┘      └──────────────┘
                             │
               ┌─────────────┼──────────────────┐
               │             │                  │
          ┌────▼────┐  ┌─────▼─────┐  ┌────────▼──────┐
          │Payroll  │  │Attendance │  │  Performance  │
          │Records  │  │ Records   │  │  Evaluations  │
          └─────────┘  └───────────┘  └───────────────┘
               │             │
          ┌────▼────┐  ┌─────▼─────┐
          │Payslips │  │Leave Req. │
          └─────────┘  └───────────┘

ZenATS ENTITIES:
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Vacancy    │──1:N─│ Application  │──N:1─│  Candidate   │
└──────────────┘      └──────────────┘      └──────────────┘
                             │
                        ┌────▼────┐
                        │Interview│
                        │Schedule │
                        └─────────┘
```

### الكيانات الرئيسية:

| الكيان | الحقول الأساسية |
|--------|----------------|
| Employee | ID, FullName, NationalID, JoinDate, JobTitle, Department, Manager, Salary, Status |
| Attendance | EmployeeID, Date, ClockIn, ClockOut, WorkHours, Location, Method |
| LeaveRequest | ID, EmployeeID, Type, StartDate, EndDate, Status, ApproverID |
| PayrollRecord | ID, EmployeeID, Month, GrossSalary, Deductions, NetSalary, Status |
| PerformanceReview | ID, EmployeeID, CycleID, Rating, Goals, ReviewerID |
| Vacancy | ID, Title, Department, RequiredCount, Status, PostedDate |
| Candidate | ID, Name, Email, CV, Status, Source |

---

## 14. Mobile App Requirements

### 14.1 الميزات الأساسية للتطبيق

| الميزة | ESS | MSS |
|--------|-----|-----|
| Clock In/Out (GPS) | ✅ | ✅ |
| QR Code Clock-in | ✅ | - |
| Leave Requests | ✅ | Approve |
| Leave Balance | ✅ | Team View |
| Payslip Download | ✅ | - |
| Attendance View | ✅ | Team View |
| Push Notifications | ✅ | ✅ |
| Employee Directory | ✅ | ✅ |
| Who's Off Today | ✅ | ✅ |
| Document Center | ✅ | ✅ |
| Task Completion | ✅ | - |
| Face/Touch ID | ✅ | ✅ |

### 14.2 المنصات

| المنصة | الإصدار الأدنى |
|--------|--------------|
| iOS (App Store) | iOS 14+ |
| Android (Google Play) | Android 9+ |
| Huawei (AppGallery) | يُنصح |

---

## 15. Compliance & Localization

### 15.1 الامتثال القانوني لكل دولة

| الدولة | القانون | التكاملات |
|--------|---------|----------|
| 🇸🇦 السعودية | نظام العمل السعودي، GOSI | Mudad, GOSI, Muqeem |
| 🇦🇪 الإمارات | قانون العمل الإماراتي، MOHRE | WPS (SIF File) |
| 🇯🇴 الأردن | قانون العمل الأردني، الضمان الاجتماعي | Social Security Reports |
| 🇪🇬 مصر | قانون العمل المصري، التأمينات | Insurance Reports |
| 🇰🇼 الكويت | قانون العمل الكويتي | PIFSS |
| 🇮🇶 العراق | قانون العمل العراقي | Manual Compliance |

### 15.2 إعدادات Localization

| الإعداد | الوصف |
|---------|-------|
| أيام العطل الرسمية | قابلة للتخصيص لكل دولة/فرع |
| بداية أسبوع العمل | الأحد أو الاثنين حسب الدولة |
| العملة | متعدد (SAR, AED, JOD, EGP, ...) |
| الوقت الإضافي | قواعد مختلفة لكل دولة |
| EOSB | آليات احتساب مختلفة حسب القانون المحلي |
| الإجازات المدفوعة | مدد مختلفة حسب قانون العمل المحلي |
| اللغة | عربي (RTL) / إنجليزي (LTR) |

---

## 📊 ملخص النظام

```
┌─────────────────────────────────────────────────────────┐
│                  ZenHR SYSTEM SUMMARY                   │
├─────────────────┬───────────────────────────────────────┤
│ Actors          │ 7 (Super Admin, HR Manager, Payroll    │
│                 │   Manager, Line Manager, Employee,     │
│                 │   Recruiter, External Candidate)       │
├─────────────────┼───────────────────────────────────────┤
│ Modules         │ 9 (Core HR, Payroll, Attendance, ESS,  │
│                 │   Performance, ZenATS, Reports,        │
│                 │   Documents, Onboarding/Offboarding)   │
├─────────────────┼───────────────────────────────────────┤
│ Workflows       │ Leave, Payroll, Recruitment,           │
│                 │   Performance Review, Onboarding,      │
│                 │   Offboarding, Disciplinary Action     │
├─────────────────┼───────────────────────────────────────┤
│ Integrations    │ 20+ (GOSI, WPS, Mudad, QuickBooks,    │
│                 │   SAP, LinkedIn, Zoom, ZKTeco, ...)    │
├─────────────────┼───────────────────────────────────────┤
│ Countries       │ KSA, UAE, Jordan, Egypt, Kuwait, Iraq │
├─────────────────┼───────────────────────────────────────┤
│ Languages       │ Arabic (RTL) + English                 │
├─────────────────┼───────────────────────────────────────┤
│ Platform        │ Web + iOS + Android                    │
├─────────────────┼───────────────────────────────────────┤
│ Security        │ SOC 2, MFA, RBAC, AES-256, Audit Trail │
└─────────────────┴───────────────────────────────────────┘
```

---

*تم إعداد هذه الوثيقة استناداً إلى المعلومات الرسمية المتاحة على zenhr.com*  
*© 2026 — ZenHR Documentation*
