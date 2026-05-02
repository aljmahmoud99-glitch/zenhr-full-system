# HR Actor Specification - ZenJO HR System

## 1. Overview

يمثل **HR Actor** في نظام **ZenJO** دور **`hradmin`** داخل بيئة الشركة (`Company-scoped role`). هذا الدور هو المسؤول التشغيلي الرئيسي عن دورة حياة الموظف داخل النظام، بدءًا من **التوظيف والتهيئة (Onboarding / Pre-employment)**، مرورًا بـ **الحضور والإجازات والعمل الإضافي والامتثال والوثائق والأصول والسلف**، وصولًا إلى **الاستقالات، براءة الذمة، ونهاية الخدمة**.

هذا الدور ليس مجرد مستخدم إداري لواجهة الاستخدام، بل هو **صاحب قرار تشغيلي** في معظم وحدات الموارد البشرية، مع صلاحيات قراءة/كتابة/اعتماد وفقًا للسياسات التالية:

- إدارة بيانات الموظفين وإنشاء ملفاتهم.
- إنشاء حسابات المستخدمين للموظفين والمديرين ضمن الحدود المسموح بها.
- متابعة الالتزام النظامي والوثائق الحكومية.
- اعتماد أو رفض طلبات الإجازات والسلف والطلبات التصحيحية للحضور.
- متابعة حالة الموظفين قبل التثبيت وخلال فترة التجربة.
- إدارة مسارات الاستقالة وبراءة الذمة وربطها بالأصول والتسويات.
- الإشراف على الإعدادات التشغيلية للشركة التي تؤثر على الوحدات الأخرى.

الدور **`hradmin`** يعمل ضمن حدود الشركة فقط، ولا يملك صلاحيات **Superadmin** متعددة الشركات، كما أنه لا يملك صلاحيات **Payroll Admin** الكاملة في إنشاء واعتماد مسيرات الرواتب، لكنه يملك **رؤية تشغيلية** ومشاركة جزئية في بعض المسارات المالية.

---

## 2. HR Responsibilities

### 2.1 إدارة الموظفين

- إنشاء موظف جديد عبر `/app/employees`.
- تعديل بيانات الموظف الشخصية، الوظيفية، المالية، البنكية، والتأمينية.
- إيقاف/حذف الموظف منطقيًا (Soft delete / deactivate) حسب منطق النظام.
- الاطلاع على ملف الموظف الكامل، بما في ذلك:
  - البيانات الشخصية
  - البيانات الوظيفية
  - الحضور
  - الإجازات
  - الرواتب/قسائم الراتب (وفق الصلاحية)
  - الوثائق
  - الامتثال
  - التأديب
  - الأصول
  - السلف

### 2.2 ما قبل التوظيف (Pre-employment)

- إنشاء سجل فترة تجربة للموظف.
- إدارة تقييمات فترة التجربة الشهرية والنهائية.
- تسجيل الضمان الاجتماعي الأولي.
- متابعة اكتمال المستندات المطلوبة قبل التثبيت.
- منع وجود أكثر من فترة تجربة نشطة للموظف نفسه.

### 2.3 مراقبة الحضور والانصراف

- الاطلاع على سجلات الحضور لجميع موظفي الشركة.
- إدخال حضور يدوي عند الحاجة.
- اعتماد/رفض طلبات تصحيح الحضور.
- إدارة مواقع العمل المرتبطة بالحضور.
- الاطلاع على الخرائط وتقارير الحضور وملخصات التأخير والغياب.

### 2.4 اعتماد الإجازات

- إدارة سياسات الإجازات الخاصة بالشركة.
- مراجعة طلبات الإجازات الواردة من الموظفين.
- اعتماد الطلب النهائي أو رفضه مع السبب.
- الاطلاع على أرصدة الإجازات للموظفين.
- متابعة أثر الموافقة على الإجازة على وحدة الحضور.

### 2.5 مراجعة العمل الإضافي

- إدارة قواعد العمل الإضافي.
- احتساب العمل الإضافي يدويًا أو عبر البيانات التشغيلية.
- اعتماد/رفض سجلات وطلبات العمل الإضافي.
- متابعة التكامل مع الرواتب.

### 2.6 الإجراءات التأديبية

- إنشاء حالة تأديبية.
- تسجيل التحقيق والبيانات المرتبطة بالمخالفة.
- إصدار العقوبة.
- إغلاق الحالة أو متابعة إقرار الموظف.
- الالتزام بقاعدة النافذة الزمنية التأديبية (`disciplinary_window_days`).

### 2.7 الاستقالات

- استلام طلب الاستقالة.
- اعتماد أو رفض طلب الاستقالة بحسب المرحلة.
- إدارة مقابلة الخروج (`Exit Interview`).
- بدء وإدارة إجراءات براءة الذمة.
- استكمال إجراءات التسوية النهائية مع الوحدات ذات العلاقة.

### 2.8 براءة الذمة / نهاية الخدمة

- إنشاء سجل براءة ذمة.
- احتساب نهاية الخدمة (`EOSB / Gratuity`) بالاعتماد على بيانات الموظف والإعدادات.
- منع الإغلاق إذا كانت الأصول ما تزال بعهدة الموظف.
- إظهار أثر الذمم/الخصومات/السلف على التسوية النهائية.

### 2.9 الوثائق

- رفع الوثائق الرسمية وربطها بالموظف.
- تعديل/تجديد/حذف الوثائق.
- تصنيف الوثائق حسب النوع والجهة المصدرة وتواريخ الإصدار والانتهاء.
- متابعة صلاحية الوثائق وربطها بالامتثال.

### 2.10 الامتثال

- عرض لوحة امتثال الشركة.
- متابعة الضمان الاجتماعي وتصاريح العمل والإقامة والشهادات الصحية وعدم المحكومية.
- تحديث حالة الامتثال مباشرة أو عبر الوثائق المرتبطة.
- إدارة الروابط الخارجية للجهات الحكومية.

### 2.11 الأصول

- إنشاء أصل جديد.
- إسناد الأصل لموظف.
- استرجاع الأصل وإدارة حالته.
- تتبع الأصول المعلقة مع الموظفين المستقيلين أو ذوي الإجازات الطويلة.

### 2.12 السلف

- مراجعة طلبات السلف.
- اعتماد أو رفض الطلب.
- متابعة حالة الخصم من مسير الرواتب.
- إظهار تاريخ السلف وحالة السداد للموظف.

### 2.13 الرواتب (رؤية تشغيلية)

- الاطلاع على مسيرات الرواتب (`Payroll Runs`) وقسائم الرواتب ضمن الصلاحية.
- الاطلاع على قسائم رواتب الموظفين.
- الاطلاع على أثر السلف والعمل الإضافي والغياب على الرواتب.
- لا يملك اعتماد المسير النهائي إلا إذا سمح النظام مستقبلاً؛ حاليًا الاعتماد النهائي خاص بـ `payrolladmin`.

### 2.14 المستخدمون والحسابات

- إنشاء حسابات للموظفين والمديرين.
- عرض المستخدمين داخل الشركة.
- تعطيل/تفعيل الحسابات.
- إعادة تعيين كلمة المرور.
- لا يمكن لـ `hradmin` إنشاء `hradmin` أو `payrolladmin`؛ ذلك خاص بـ `superadmin`.

### 2.15 الإعدادات

- قراءة وتعديل الإعدادات التشغيلية للشركة عبر `/app/settings`.
- الإعدادات التي يعدلها HR تؤثر على:
  - الحضور
  - الإجازات
  - العمل الإضافي
  - فترة التجربة
  - النافذة التأديبية
  - تنبيهات الامتثال
  - الإشعارات
  - تنسيق العملة

### 2.16 التقارير والنماذج

- الوصول إلى التقارير الإدارية.
- الوصول إلى النماذج الرسمية وإنشاؤها/تعبئتها.
- طباعة أو تصدير النماذج/التقارير المتاحة حسب الوحدة.

---

## 3. Frontend Scope

> جميع الشاشات داخل نطاق HR تعمل تحت المسار العام `/app/*` وتستخدم `LayoutComponent` مع دعم RTL/LTR وواجهة ثنائية اللغة.

### 3.1 Dashboard

| العنصر | التفاصيل |
|---|---|
| Route | `/app/dashboard` |
| الغرض | لوحة تشغيلية تعرض مؤشرات الموارد البشرية، الطلبات المعلقة، التنبيهات، والتنقل السريع |
| الأفعال الظاهرة | إضافة موظف، فتح التقارير، متابعة التنبيهات، فتح الوحدات السريعة |
| الأزرار | `Add employee`, `Report`, روابط السريع للوحدات، روابط عرض الكل |
| النوافذ/النماذج | لا يوجد نموذج رئيسي داخل الشاشة، لكن توجد روابط إلى الوحدات التنفيذية |
| حالات التحميل/الفراغ/الخطأ | `Skeleton cards`, empty states في الأقسام، وتحميل API من Dashboard |
| الطباعة/التصدير | لا يوجد تصدير مباشر من dashboard |
| العربية/الإنجليزية | النصوص تعتمد على `lang` و`t(ar,en)` |
| RTL/LTR | الشاشة تضبط `dir` وتستخدم محاذاة منطقية؛ Hero وCards يفترض أن تتبع الاتجاه |

### 3.2 Employees

| العنصر | التفاصيل |
|---|---|
| Route | `/app/employees` |
| الغرض | إدارة قائمة الموظفين وإنشاء/تعديل/عرض بياناتهم |
| الأفعال الظاهرة | View, Edit, Delete/Deactivate, Add employee |
| الأزرار | `Add Employee`, `View`, `Edit`, `Delete` |
| النوافذ/النماذج | Modal لإضافة موظف، Modal للتعديل، Modal لتفاصيل الموظف |
| التحقق | حقول أساسية مطلوبة مثل الاسم، الكود، القسم/المسمى الوظيفي عند الحاجة، الرواتب وفق الصلاحية |
| حالات التحميل/الفراغ/الخطأ | loading list, form submit loading, empty employees, inline + toast errors |
| الطباعة/التصدير | غير ظاهر كميزة أساسية في القائمة |
| العربية/الإنجليزية | labels ثنائية اللغة حسب `lang` |
| RTL/LTR | modals والجداول تستخدم محاذاة منطقية |

### 3.3 Employee Profile

| العنصر | التفاصيل |
|---|---|
| Route | `/app/employees/:id` |
| الغرض | الملف الشامل للموظف |
| التبويبات | Personal, Job, Salary, Bank/SSC, Attendance, Leave, Payslips, Documents, Compliance, Disciplinary, Assets, Advances |
| الأفعال | قراءة تفصيلية، تحديث بعض الأجزاء من HR، فتح المستندات أو الأصول أو السلف المرتبطة |
| التحقق | يعتمد على كل تبويب عند تنفيذ حفظ أو تحديث |
| حالات التحميل/الفراغ/الخطأ | loading profile, tab lazy-loading, error state, hidden tabs حسب الدور |
| الطباعة | طباعة عناصر داخلية مثل payslip أو document summary من الوحدات الفرعية |
| RTL/LTR | محفوظ على مستوى الصفحة والتبويبات |

### 3.4 Pre-employment

| العنصر | التفاصيل |
|---|---|
| Route | `/app/pre-employment` |
| الغرض | إدارة فترات التجربة قبل التثبيت |
| الأفعال | Add record, View employee docs, Social Security register, Delete |
| النوافذ/النماذج | Modal لإنشاء سجل، Modal للضمان الاجتماعي، Modal وثائق مرتبطة |
| التحقق | start date مطلوب، end date محسوب تلقائيًا من `probation_days`، منع duplicate active probation |
| حالات التحميل/الفراغ/الخطأ | loading list, empty state, validation/toast errors |
| الطباعة | غير أساسي في الشاشة الرئيسية |
| RTL/LTR | مدعوم |

### 3.5 Pre-employment Evaluation

| العنصر | التفاصيل |
|---|---|
| Route | `/app/pre-employment/evaluation/:employeeId` |
| الغرض | صفحة تقييم شهر 1/2/3 والقرار النهائي |
| الأفعال | Save evaluation |
| النماذج | تقييم شهري، ملاحظات، HR requirements checklist، final decision |
| التحقق | تقييمات مطلوبة، قرار نهائي مطلوب، حفظ مع loading |
| التكامل | تؤثر على probation status وتوصية التثبيت |

### 3.6 Attendance

| العنصر | التفاصيل |
|---|---|
| Route | `/app/attendance` |
| الغرض | شاشة الحضور الموحدة للشركة أو للفريق أو للموظف نفسه |
| التبويبات | Summary, Records, Requests, Map |
| الأفعال | clock-in/out (employee), manual entry (HR), approve/reject correction, manage locations |
| البحث/الفلاتر | employee name/code, department, status, date range, late/absent/present |
| التحقق | reason مطلوب لطلب التصحيح، منع double click، تحديث السجل بعد الموافقة |
| حالات التحميل/الفراغ/الخطأ | today summary, records, requests, map لها حالات منفصلة |
| الطباعة/التقارير | تقارير attendance عبر API/قسم reports |
| RTL/LTR | مدعوم في summary/cards/table/tabs |

### 3.7 Leave

| العنصر | التفاصيل |
|---|---|
| Route | `/app/leave` |
| الغرض | إدارة سياسات الإجازات والطلبات والأرصدة |
| الأفعال | Edit policies, create request, approve, reject, cancel, print |
| النوافذ/النماذج | settings modal, request modal, details / print flow |
| التحقق | type, dates, max days, notice period, attachment requirements, available balance |
| حالات التحميل/الفراغ/الخطأ | summary cards + requests list + balances + policy states |
| الطباعة | Leave request print |
| التكامل | approval updates attendance status to `on_leave` |

### 3.8 Overtime

| العنصر | التفاصيل |
|---|---|
| Route | `/app/overtime` |
| الغرض | سجل وطلبات وقواعد العمل الإضافي |
| الأفعال | calculate, manual, approve/reject record, create request, approve/reject request, update rules |
| الفلاتر | employee, status, date, department |
| التحقق | request hours/reason, rule-bound calculations |
| التكامل | approved overtime يظهر في payroll |

### 3.9 Holidays

| العنصر | التفاصيل |
|---|---|
| Route | `/app/holidays` |
| الغرض | إدارة العطل الرسمية والعطل القادمة |
| الأفعال | create, edit, delete, generate recurring, reports |
| التحقق | اسم وتاريخ ونوع ونطاق التطبيق |
| التكامل | attendance check / holiday-aware calculations |

### 3.10 Disciplinary

| العنصر | التفاصيل |
|---|---|
| Route | `/app/disciplinary` |
| الغرض | إدارة المخالفات والتحقيقات والعقوبات |
| الأفعال | create case, investigate, apply action, close, acknowledge |
| البحث/الفلاتر | employee, status, violation type, date |
| التحقق | violation date must be within configured disciplinary window |
| حالات التحميل/الفراغ/الخطأ | list + detail modal/sections |
| التكامل | employee profile disciplinary tab |

### 3.11 Resignations

| العنصر | التفاصيل |
|---|---|
| Route | `/app/resignations` |
| الغرض | إدارة دورة الاستقالة والموافقات والمقابلة الختامية وربطها ببراءة الذمة |
| الأفعال | create, approve/reject, start clearance, update clearance, exit interview, settlement, complete, acknowledge, print |
| الفلاتر | employee, department, status, date |
| التحقق | approval stage logic, pending assets/clearance completion constraints |
| التكامل | triggers clearance and settlement |

### 3.12 Clearance / End-of-service

| العنصر | التفاصيل |
|---|---|
| Route | `/app/clearance` |
| الغرض | براءة الذمة ونهاية الخدمة والتسوية |
| الأفعال | create, update, calculate EOSB, complete, view, print |
| النوافذ | create modal, details modal, print view |
| التحقق | منع الإكمال إذا كانت أصول الموظف ما زالت assigned |
| التكامل | assets, resignations, payroll/settlement |

### 3.13 Compliance

| العنصر | التفاصيل |
|---|---|
| Route | `/app/compliance` |
| الغرض | لوحة امتثال شاملة حسب الموظفين والوثائق |
| الأقسام | Summary cards, Alerts list, tabs by category, employee compliance modal |
| الأفعال | view employee compliance, update social security/work permit/health/criminal record, export, portal links |
| الفلاتر | employee, department, nationality, status, expiring within |
| التحقق | status derived from docs + settings; HR update actions allowed |

### 3.14 Documents

| العنصر | التفاصيل |
|---|---|
| Route | `/app/documents` |
| الغرض | مركز الوثائق الموحد |
| الأفعال | create, update/renew, delete, view, download, export |
| النوافذ | new document modal, update modal, details preview where applicable |
| التحقق | attachment required per type, expiry required per type |
| التكامل | compliance, employee profile, pre-employment |

### 3.15 Assets

| العنصر | التفاصيل |
|---|---|
| Route | `/app/assets` |
| الغرض | إدارة الأصول والعهد |
| الأفعال | add, edit, assign, return, retire, view details, export/print |
| النوافذ | add asset modal, assign modal, return modal, details modal |
| التحقق | cannot assign already assigned asset; return condition drives status |
| التكامل | employee profile, resignation, clearance |

### 3.16 Salary Advances

| العنصر | التفاصيل |
|---|---|
| Route | `/app/advances` |
| الغرض | إدارة طلبات السلف ومتابعة أثرها على الرواتب |
| الأفعال | create request, view details, approve, reject, print |
| البحث/الفلاتر | employee, code, department, status, repayment method, date range |
| التكامل | payroll deduction visibility + employee profile advances tab |

### 3.17 Payroll Runs

| العنصر | التفاصيل |
|---|---|
| Route | `/app/payroll/runs` و `/app/payroll/slips` |
| الغرض | عرض مسيرات الرواتب وقسائم الرواتب |
| أفعال HR | view runs, view payslips, print; approval النهائي ليس HR action |
| التنسيق | financial numbers always western digits + dynamic currency |
| التكامل | advances + overtime + attendance/absence deductions |

### 3.18 Users

| العنصر | التفاصيل |
|---|---|
| Route | `/app/users` |
| الغرض | إدارة حسابات المستخدمين داخل الشركة |
| الأفعال | create employee/manager accounts, edit basic account data, toggle active, reset password |
| النوافذ | create user modal + temporary password result |
| التحقق | username, email, role, linked employee where required |
| القيود | HR cannot create `hradmin` or `payrolladmin` |

### 3.19 Settings

| العنصر | التفاصيل |
|---|---|
| Route | `/app/settings` |
| الغرض | إدارة الإعدادات المركزية للشركة |
| الأفعال | save single/bulk settings, load catalog |
| التأثير | attendance, overtime, leave, disciplinary, compliance, notifications, currency, payroll display |

### 3.20 Reports

| العنصر | التفاصيل |
|---|---|
| Route | `/app/reports` |
| الغرض | تقارير headcount, payroll, leave, attendance, compliance, SSC, disciplinary, overtime, tax, turnover |
| الأفعال | filter/report read/print/export حسب الشاشة |

### 3.21 Official Forms

| العنصر | التفاصيل |
|---|---|
| Route | `/app/forms` و `/app/forms/:formId` |
| الغرض | إدارة النماذج الرسمية وسجلاتها |
| الأفعال | create, edit, delete, fill employee data, leave balance data, company info |
| التكامل | employees, leave, company settings |

---

## 4. Backend API Scope

> جميع الاستجابات في النظام تُغلَّف غالبًا في `ApiResponse<T>`. البنية التفصيلية قد تختلف حسب الـ controller، لكنها عادةً تحتوي على `data` و/أو رسالة نجاح.

### 4.1 Employees APIs

| Method | Route | الغرض | Authorization |
|---|---|---|---|
| GET | `/api/employees` | قائمة الموظفين مع scope حسب الدور | `hradmin,payrolladmin,manager` |
| GET | `/api/employees/{id}` | جلب ملف موظف مفصل | `hradmin,payrolladmin,manager,employee` |
| POST | `/api/employees` | إنشاء موظف جديد | `hradmin` |
| PUT | `/api/employees/{id}` | تحديث موظف | `hradmin` |
| DELETE | `/api/employees/{id}` | حذف/تعطيل موظف | `hradmin` |
| GET | `/api/employees/{id}/documents` | وثائق موظف | حسب scope داخل controller |
| GET | `/api/employees/{id}/assets` | أصول موظف | حسب scope |
| GET | `/api/employees/{id}/disciplinary` | سجل تأديبي | حسب scope |
| GET | `/api/employees/{id}/payslips` | قسائم راتب موظف | حسب scope |

**Request body (POST/PUT)**

```json
{
  "employeeCode": "EMP-0001",
  "firstNameAr": "سارة",
  "lastNameAr": "العموري",
  "firstNameEn": "Sara",
  "lastNameEn": "Alamouri",
  "departmentId": 1,
  "jobTitleId": 2,
  "hireDate": "2026-01-01",
  "employmentStatus": "active",
  "basicSalary": 900.000
}
```

**Validation / Errors**

- حقول الاسم/الكود الأساسية مطلوبة.
- قد يرفض API التكرار في `employeeCode`.
- 403 عند عدم امتلاك الصلاحية.
- 404 عند عدم وجود الموظف.

### 4.2 Attendance APIs

| Method | Route | الغرض | Authorization |
|---|---|---|---|
| GET | `/api/attendance/dashboard` | summary dashboard | authenticated |
| GET | `/api/attendance/my-today` | سجل اليوم للموظف | authenticated |
| GET | `/api/attendance` | attendance records list | authenticated with scope |
| POST | `/api/attendance/clock-in` | تسجيل حضور | employee/self-service |
| POST | `/api/attendance/clock-out` | تسجيل انصراف | employee/self-service |
| POST | `/api/attendance/manual` | إدخال يدوي | `hradmin` |
| GET | `/api/attendance/summary` | summary cards/data | authenticated |
| GET | `/api/attendance/reports` | تقارير الحضور | `hradmin,payrolladmin,manager` |
| GET | `/api/attendance/map` | خريطة الحضور | `hradmin,manager` |
| GET | `/api/attendance/requests` | طلبات التصحيح | authenticated |
| POST | `/api/attendance/requests` | إنشاء طلب تصحيح | authenticated |
| PUT | `/api/attendance/requests/{id}/approve` | اعتماد تصحيح | `hradmin,manager` |
| PUT | `/api/attendance/requests/{id}/reject` | رفض تصحيح | `hradmin,manager` |
| GET | `/api/attendance/locations` | مواقع العمل | `hradmin` |
| POST | `/api/attendance/locations` | إنشاء موقع | `hradmin` |
| DELETE | `/api/attendance/locations/{id}` | حذف موقع | `hradmin` |

**Request body examples**

```json
{
  "requestDate": "2026-04-25",
  "requestedClockIn": "08:05",
  "requestedClockOut": "16:10",
  "reason": "نسيان البصمة"
}
```

**Validation / Errors**

- reason مطلوب لطلبات التصحيح.
- لا يسمح بالموافقة الوهمية قبل نجاح API.
- يتم تحديث `AttendanceRecord` فقط بعد اعتماد طلب التصحيح.
- إعدادات العمل (`work_start_time`, `grace_period_minutes`, `work_hours_per_day`) تؤثر على late/overtime calculation.

### 4.3 Leave APIs

| Method | Route | الغرض | Authorization |
|---|---|---|---|
| GET | `/api/leave/types` | أنواع الإجازات | authenticated |
| GET | `/api/leave/policies` | سياسات الشركة | authenticated |
| PUT | `/api/leave/policies` | تحديث السياسات | `hradmin` |
| GET | `/api/leave/requests` | طلبات الإجازة | authenticated with scope |
| POST | `/api/leave/requests` | إنشاء طلب إجازة | authenticated |
| POST | `/api/leave/requests/{id}/approve` | اعتماد | `hradmin,manager` |
| POST | `/api/leave/requests/{id}/reject` | رفض مع سبب | `hradmin,manager` |
| POST | `/api/leave/requests/{id}/cancel` | إلغاء الطلب | requester / scoped |
| GET | `/api/leave/balances` | أرصدة المستخدم الحالي | authenticated |
| GET | `/api/leave/balances/{employeeId}` | أرصدة موظف | `hradmin,manager` |

**Validation Rules**

- leave type must exist.
- end date must not precede start date.
- max days per request from policy.
- notice days from settings/policy.
- required attachment for medical types.
- available balance check unless `allow_leave_without_balance=true`.

### 4.4 Overtime APIs

| Method | Route | الغرض | Authorization |
|---|---|---|---|
| GET | `/api/overtime/dashboard` | overtime dashboard | authenticated |
| GET | `/api/overtime/log` | overtime log | authenticated |
| POST | `/api/overtime/calculate` | حساب overtime | `hradmin` |
| POST | `/api/overtime/manual` | إدخال يدوي | `hradmin` |
| PUT | `/api/overtime/records/{id}/approve` | اعتماد سجل | `hradmin,manager` |
| PUT | `/api/overtime/records/{id}/reject` | رفض سجل | `hradmin,manager` |
| GET | `/api/overtime/requests` | طلبات OT | authenticated |
| POST | `/api/overtime/requests` | طلب OT جديد | authenticated |
| PUT | `/api/overtime/requests/{id}/approve` | اعتماد طلب | route-level shows `manager,employee` but business workflow handled in controller |
| PUT | `/api/overtime/requests/{id}/reject` | رفض طلب | `hradmin,manager` |
| GET | `/api/overtime/reports` | تقارير OT | `hradmin,payrolladmin` |
| GET | `/api/overtime/payroll-summary` | ملخص payroll linkage | `hradmin,payrolladmin` |
| GET | `/api/overtime/rules` | قواعد OT | authenticated |
| PUT | `/api/overtime/rules` | تحديث القواعد | `hradmin` |

### 4.5 Disciplinary APIs

> مسارات الـ controller الفعلية موجودة في `DisciplinaryController.cs`، وتشمل إدارة الحالة والتحقيق واتخاذ القرار. من خلال التطبيق، HR يستخدم هذه المجموعة:

| Method | Route (module family) | الغرض | Authorization |
|---|---|---|---|
| GET | `/api/disciplinary` | قائمة الحالات | `hradmin,manager` |
| POST | `/api/disciplinary` | إنشاء مخالفة | `hradmin` |
| PUT | `/api/disciplinary/{id}` | تحديث بيانات الحالة/التحقيق | `hradmin` |
| PUT/POST | `/api/disciplinary/{id}/decision` أو ما يعادله | إصدار العقوبة | `hradmin` |
| PUT | `/api/disciplinary/{id}/close` | إغلاق الحالة | `hradmin` |
| PUT | `/api/disciplinary/{id}/acknowledge` | إقرار الموظف | scoped |

**Validation**

- `ViolationDate` must be within `disciplinary_window_days`.
- نوع المخالفة مطلوب.
- الوصف/المبلغ/نوع العقوبة حسب الحالة.

### 4.6 Resignations APIs

| Method | Route | الغرض | Authorization |
|---|---|---|---|
| GET | `/api/resignations` | قائمة الاستقالات | authenticated by scope |
| POST | `/api/resignations` | إنشاء استقالة | authenticated |
| PUT | `/api/resignations/{id}/approve` | اعتماد | حسب المرحلة |
| PUT | `/api/resignations/{id}/reject` | رفض | حسب المرحلة |
| PUT | `/api/resignations/{id}/start-clearance` | بدء براءة الذمة | `hradmin` |
| PUT | `/api/resignations/{id}/clearance` | تحديث بيانات clearance | `hradmin` |
| PUT | `/api/resignations/{id}/exit-interview` | حفظ مقابلة الخروج | `hradmin` |
| PUT | `/api/resignations/{id}/settlement` | تحديث التسوية | `hradmin,payrolladmin` |
| PUT | `/api/resignations/{id}/complete` | إغلاق نهائي | `hradmin` |
| PUT | `/api/resignations/{id}/acknowledge` | acknowledgment | `hradmin` |

**Validation / Errors**

- لا يمكن الإكمال إذا بقيت أصول معلقة.
- clearance must be complete before final completion.
- rejection reason required عند الرفض.

### 4.7 Clearance APIs

| Method | Route | الغرض | Authorization |
|---|---|---|---|
| GET | `/api/clearance` | قائمة براءات الذمة | authenticated |
| GET | `/api/clearance/{id}` | تفاصيل سجل | authenticated |
| POST | `/api/clearance` | إنشاء سجل | `superadmin,hradmin` |
| PUT | `/api/clearance/{id}` | تحديث السجل | `superadmin,hradmin` |
| GET | `/api/clearance/calculate-eosb/{employeeId}` | حساب مكافأة/تسوية | `superadmin,hradmin,payrolladmin` |

**Validation**

- تعتمد الحسابات على salary snapshot-like source fields at runtime.
- لا يمكن إكمال السجل إذا ما زالت الأصول assigned.

### 4.8 Documents APIs

| Method | Route | الغرض | Authorization |
|---|---|---|---|
| GET | `/api/documents` | قائمة الوثائق | `hradmin,employee,manager,payrolladmin,superadmin` |
| GET | `/api/documents/summary` | ملخص الوثائق | scoped |
| GET | `/api/documents/{id}` | تفاصيل وثيقة | scoped |
| POST | `/api/documents` | إنشاء وثيقة | `hradmin,superadmin` |
| PUT | `/api/documents/{id}` | تحديث/تجديد وثيقة | `hradmin,superadmin` |
| DELETE | `/api/documents/{id}` | حذف وثيقة | `hradmin,superadmin` |
| GET | `/api/documents/expiring` | وثائق منتهية/قريبة الانتهاء | scoped |
| GET | `/api/documents/export` | تصدير | `hradmin,superadmin` |

**Validation**

- document type required.
- expiry required if type requires expiry.
- attachment/file expected when type requires attachment.
- updates affect compliance and pre-employment checklist.

### 4.9 Compliance APIs

| Method | Route | الغرض | Authorization |
|---|---|---|---|
| GET | `/api/compliance/overview` | dashboard overview | `hradmin,manager,payrolladmin,superadmin` |
| GET | `/api/compliance/items` | tabular items | `hradmin,manager,payrolladmin,superadmin` |
| GET | `/api/compliance/employee/{employeeId}` | ملف الامتثال لموظف | scoped inside controller |
| GET | `/api/compliance/my-summary` | self-service summary | `employee` |
| GET | `/api/compliance/export` | تصدير تقرير | `hradmin,superadmin` |
| GET | `/api/compliance/badge-status` | status badge feed | `hradmin,manager,payrolladmin,employee,superadmin` |
| GET | `/api/compliance/work-permits` | work permit list | `hradmin,manager,payrolladmin,superadmin` |
| GET | `/api/compliance/ssc-status` | SSC status list | same |
| GET | `/api/compliance/health-certificates` | health cert list | same |
| GET | `/api/compliance/criminal-records` | criminal record list | same |
| PUT | `/api/compliance/employees/{empId}/social-security` | تحديث الضمان | HR |
| PUT | `/api/compliance/employees/{empId}/work-permit` | تحديث تصريح العمل | HR |
| PUT | `/api/compliance/employees/{empId}/health-certificate` | تحديث الشهادة الصحية | HR |
| PUT | `/api/compliance/employees/{empId}/criminal-record` | تحديث عدم المحكومية | HR |

**Validation**

- thresholds from settings (`work_permit_alert_days`, etc.).
- nationality-sensitive rules for non-Jordanian employees.

### 4.10 Assets APIs

| Method | Route | الغرض | Authorization |
|---|---|---|---|
| GET | `/api/assets` | قائمة الأصول | `hradmin,manager,employee,payrolladmin,superadmin` with scope |
| GET | `/api/assets/summary` | summary cards | scoped |
| GET | `/api/assets/{id}` | تفاصيل الأصل | scoped |
| POST | `/api/assets` | إنشاء أصل | `hradmin,superadmin` |
| PUT | `/api/assets/{id}` | تحديث أصل | `hradmin,superadmin` |
| POST | `/api/assets/{id}/assign` | إسناد أصل | `hradmin,superadmin` |
| POST | `/api/assets/{id}/return` | استرجاع أصل | `hradmin,superadmin` |
| POST | `/api/assets/{id}/retire` | إخراج من الخدمة | `hradmin,superadmin` |
| GET | `/api/assets/export` | تقرير/تصدير | `hradmin,superadmin` |

**Validation**

- cannot assign if status already assigned.
- return condition determines resulting status.
- clearance and resignation completion should check pending assets.

### 4.11 Salary Advances APIs

| Method | Route | الغرض | Authorization |
|---|---|---|---|
| GET | `/api/salary-advances` | قائمة السلف | authenticated with scope |
| POST | `/api/salary-advances` | طلب/إنشاء سلفة | authenticated |
| PUT | `/api/salary-advances/{id}/approve` | اعتماد | `hradmin` |
| PUT | `/api/salary-advances/{id}/reject` | رفض | `hradmin` |

**Validation**

- amount limits can be setting-driven (`advance_salary_max_pct`).
- duplicate/pending logic حسب controller.
- deducted status updated after payroll linkage.

### 4.12 Payroll APIs

| Method | Route | الغرض | Authorization |
|---|---|---|---|
| GET | `/api/payroll/runs` | قائمة المسيرات | `hradmin,payrolladmin` |
| GET | `/api/payroll/runs/current-summary` | current summary | `hradmin,payrolladmin` |
| POST | `/api/payroll/runs` | إنشاء مسير | `payrolladmin` |
| GET | `/api/payroll/runs/{id}/payslips` | قسائم المسير | `hradmin,payrolladmin` |
| GET | `/api/payroll/slips/my` | قسائم الموظف الحالي | employee |
| GET | `/api/payroll/slips` | قسائم عامة حسب scope | `hradmin,payrolladmin,employee` |
| GET | `/api/payroll/slips/{id}` | قسيمة مفصلة | scoped |
| POST | `/api/payroll/runs/{id}/approve` | اعتماد المسير | `payrolladmin` |

**Validation**

- منع duplicate month/year runs.
- approval blocked if no payslips / employeeCount=0.
- approved run becomes immutable snapshot.
- only approved/paid payslips visible to employee self-service.

### 4.13 Users APIs

| Method | Route | الغرض | Authorization |
|---|---|---|---|
| GET | `/api/users` | قائمة المستخدمين | `superadmin,hradmin` |
| GET | `/api/users/employee-options` | موظفون صالحون للربط | `superadmin,hradmin` |
| POST | `/api/users` | إنشاء حساب | `superadmin,hradmin` |
| PATCH | `/api/users/{id}` | تحديث حساب | `superadmin,hradmin` |
| PATCH | `/api/users/{id}/toggle-active` | تفعيل/تعطيل | `superadmin,hradmin` |
| PATCH | `/api/users/{id}/reset-password` | إعادة تعيين كلمة المرور | `superadmin,hradmin` |

**Validation**

- username: min 3, characters `[a-zA-Z0-9._-]`.
- email valid format.
- employee link required for `employee` / `manager` and maybe other roles حسب backend rule.
- HR can create only `employee`, `manager`.
- backend returns temporary password and `mustChangePassword=true`.

### 4.14 Settings APIs

| Method | Route | الغرض | Authorization |
|---|---|---|---|
| GET | `/api/config` | جلب الإعدادات | authenticated |
| GET | `/api/config/{key}` | جلب setting واحدة | authenticated |
| PUT | `/api/config/{key}` | تحديث setting | `hradmin,superadmin` |
| PATCH | `/api/config/bulk` | تحديث جماعي | `hradmin,superadmin` |
| GET | `/api/config/catalog` | catalog / metadata | `hradmin,superadmin` |

### 4.15 Notifications APIs

| Method | Route | الغرض | Authorization |
|---|---|---|---|
| GET | `/api/notifications` | قائمة الإشعارات | authenticated |
| POST | `/api/notifications/{id}/read` | تعيين كمقروء | authenticated |
| POST | `/api/notifications/read-all` | تعليم الكل كمقروء | authenticated |

---

## 5. Database Scope

> الأسماء التالية هي **Entity/Table** كما تظهر في `Entities.cs`. في حال استخدام EF Core convention فاسم الجدول قد يطابق اسم الـ entity أو يتم تحويله بحسب إعدادات الـ DbContext.

| Entity / Table | الغرض | أهم الحقول | العلاقات | الفهارس المقترحة / المفيدة | Audit |
|---|---|---|---|---|---|
| `User` | حسابات النظام | `CompanyId`, `EmployeeId`, `Username`, `Email`, `Role`, `IsActive`, `MustChangePassword` | `Employee`, `Company` | unique على `Username`, `Email`, index على `CompanyId, Role` | `CreatedAt`, `UpdatedAt`, `LastLoginAt` |
| `Employee` | الملف الأساسي للموظف | `EmployeeCode`, names AR/EN, `DepartmentId`, `JobTitleId`, `HireDate`, `BasicSalary`, `BankId`, `SscNumber`, permit/residency/passport fields | `Company`, `Department`, `JobTitle`, `DirectManager`, `Bank` | unique على `CompanyId+EmployeeCode`, index على `DepartmentId`, `DirectManagerId` | `CreatedAt`, `UpdatedAt`, `IsDeleted` |
| `Department` | الأقسام | `CompanyId`, `NameAr`, `NameEn`, `ParentDepartmentId`, `ManagerEmployeeId` | `Company`, self-reference | index على `CompanyId`, `ParentDepartmentId` | `CreatedAt`, `UpdatedAt`, `IsDeleted` |
| `JobTitle` | المسميات الوظيفية | `CompanyId`, titles, `Grade`, `MinSalary`, `MaxSalary` | company-scoped | index على `CompanyId` | `CreatedAt`, `UpdatedAt` |
| `AttendanceRecord` | سجل حضور اليوم/اليوميات | `EmployeeId`, `Date`, `ClockIn`, `ClockOut`, `Status`, `LateMinutes`, `WorkedMinutes`, `OvertimeMinutes`, `ShiftId` | `Employee`, `Shift` | unique على `EmployeeId+Date`, index على `ShiftId`, `Status` | `CreatedAt`, `UpdatedAt` |
| `AttendanceRequest` | طلبات تصحيح الحضور | `EmployeeId`, `RequestType`, `RequestDate`, requested punches, `Status`, manager/hr approval fields | `Employee` | index على `EmployeeId`, `Status`, `RequestDate` | `CreatedAt`, `ApprovedAt` |
| `LeaveType` | أنواع الإجازة | `Code`, `Type`, `DefaultDaysPerYear`, `RequiresMedicalCert` | lookup | unique على `Code` | `CreatedAt` |
| `LeavePolicy` | سياسة الشركة للإجازة | `CompanyId`, `LeaveTypeId`, `DaysPerYear`, `RequiresManagerApproval`, `RequiresHrApproval`, `NoticeDaysRequired` | `LeaveType` | unique على `CompanyId+LeaveTypeId` | `UpdatedAt` |
| `LeaveBalance` | أرصدة الإجازات | `EmployeeId`, `LeaveTypeId`, `Year`, `TotalDays`, `UsedDays`, `PendingDays`, `RemainingDays` | `Employee`, `LeaveType` | unique على `EmployeeId+LeaveTypeId+Year` | implicit via yearly records |
| `LeaveRequest` | طلبات الإجازة | `EmployeeId`, `LeaveTypeId`, dates, `TotalDays`, `Status`, approval fields, `RejectionReason` | `Employee`, `LeaveType` | index على `EmployeeId`, `Status`, date range | approval timestamps |
| `OvertimeRequest` / `OvertimeRecord` | الطلبات/السجلات الإضافية | hours, dates, status, approval fields | employee-related | index على `EmployeeId`, `Status`, period | timestamps |
| `DisciplinaryAction` | القضية التأديبية | `EmployeeId`, `ViolationTypeId`, `ViolationDate`, `PenaltyType`, `ActionDeadline`, `Status`, `SalaryDeductionAmount` | `Employee`, `ViolationType`, `Investigation` | index على `EmployeeId`, `ViolationDate`, `Status` | `CreatedAt`, `UpdatedAt` |
| `DisciplinaryInvestigation` | التحقيق | `CaseId`, `HrNotes`, statements, `Outcome` | `DisciplinaryAction` | index على `CaseId` | `CreatedAt`, `UpdatedAt` |
| `Resignation` | طلبات الاستقالة | employee, reason, dates, approvals, status | employee-related | index على `EmployeeId`, `Status` | timestamps |
| `ExitInterview` | مقابلة الخروج | `ResignationId`, reasons, satisfaction, notes | `Resignation` | index على `ResignationId` | `CreatedAt`, `UpdatedAt` |
| `Clearance` | براءة الذمة / التسوية | employee, settlement values, status | linked to employee/resignation | index على employee/status | timestamps |
| `DocumentType` | تعريف نوع الوثيقة | `Code`, `RequiresExpiry`, `ApplicableTo`, `AlertDaysBefore` | lookup | unique على `Code` | - |
| `Document` | الوثائق الفعلية | `EmployeeId`, `DocumentTypeId`, `DocumentNumber`, `IssuedBy`, `IssuedDate`, `ExpiryDate`, `FileUrl`, `Status` | `Employee`, `DocumentType` | index على `EmployeeId`, `DocumentTypeId`, `ExpiryDate`, `Status` | `CreatedAt`, `UpdatedAt`, `IsDeleted` |
| `EmployeeComplianceStatus` | حالة الامتثال الملخصة | `EmployeeId`, `DocumentType`, `Status`, `LastChecked`, `ReviewedById` | `Employee` | index على `EmployeeId`, `DocumentType` | `UpdatedAt` |
| `AssetCategory` | تصنيفات الأصول | names, icon | lookup | index على activity status | - |
| `Asset` | الأصل نفسه | names AR/EN, `CategoryId`, `SerialNumber`, `PurchaseValue`, `CurrentStatus`, `AssignedToEmployeeId`, `AssignedDate`, `ExpectedReturnDate`, `ConditionOnAssign` | `AssetCategory`, `Employee` | index على `CompanyId`, `SerialNumber`, `AssignedToEmployeeId`, `CurrentStatus` | `CreatedAt`, `UpdatedAt`, `IsDeleted` |
| `AssetAssignment` / history (logical) | تاريخ العهد والاسترجاع | assignment/return fields | employee + asset | index by asset/employee | timestamps |
| `SalaryAdvance` | طلب سلفة | `EmployeeId`, `Amount`, `RequestDate`, `ApprovedById`, `Status`, `DeductedInRunId` | `Employee`, payroll linkage | index على `EmployeeId`, `Status`, `DeductedInRunId` | `CreatedAt`, `UpdatedAt` |
| `PayrollRun` | مسير الرواتب | month/year, totals, status, approval metadata | company-scoped with payslips | unique على company+month+year | created/approved timestamps |
| `Payslip` | قسيمة راتب | employee, period, gross, deductions, net, payroll run link | `Employee`, `PayrollRun` | index على employee/run/status | snapshot timestamps |
| `SystemConfiguration` | الإعدادات | `CompanyId`, `Key`, `Value`, `Category`, `DataType`, `UpdatedById` | company-scoped | unique على `CompanyId+Key` | `UpdatedAt` |
| `Notification` | الإشعارات | `UserId`, `Type`, title/body AR/EN, `EntityType`, `EntityId`, `IsRead` | user-scoped | index على `UserId`, `IsRead`, `Type` | `CreatedAt`, `ReadAt` |
| `ActivityLog` | سجلات التدقيق | user/employee refs, action, entity, old/new json, IP | broad audit | index على `CompanyId`, `EntityType`, `EntityId`, `UserId` | `CreatedAt` |
| `ProbationEvaluation` | تقييمات فترة التجربة | `EmployeeId`, `EvaluationStage`, scores, notes, `Recommendation` | `Employee`, `Company` | index على `EmployeeId`, `EvaluationStage` | `CreatedAt`, `UpdatedAt` |
| `FormRecord` | سجلات النماذج | `FormType`, `EmployeeId`, `DataJson`, `Status`, `CreatedBy` | `Employee`, `Company` | index على `CompanyId`, `FormType`, `EmployeeId` | `CreatedAt`, `UpdatedAt` |
| `PublicHoliday` | العطل الرسمية | dates, type, scope, status | company/department linkage | index on date/type/company | `CreatedAt`, `UpdatedAt` |

---

## 6. Permissions Matrix

| Module | Action | HR allowed? | Manager allowed? | Employee allowed? | Payroll Admin allowed? | Notes |
|---|---|---:|---:|---:|---:|---|
| Dashboard | View dashboard | نعم | نعم | نعم | نعم | حسب شاشة كل دور |
| Employees | List employees | نعم | نعم (team scope) | لا | نعم | HR full, manager scoped |
| Employees | Create employee | نعم | لا | لا | لا | `employee:create` |
| Employees | Edit employee | نعم | لا | لا | لا | `employee:edit` |
| Employees | View salary/bank/SSC | نعم | لا | لا | نعم | حساسة ماليًا |
| Pre-employment | Manage probation | نعم | لا | لا | لا | route restricted |
| Attendance | View records | نعم | نعم | نعم (self) | نعم (reports) | backend scoping |
| Attendance | Manual entry | نعم | لا | لا | لا | HR only |
| Attendance | Approve correction | نعم | نعم | لا | لا | shared workflow |
| Leave | View requests | نعم | نعم | نعم (self) | لا | scoped |
| Leave | Edit policies | نعم | لا | لا | لا | HR only |
| Leave | Approve/reject | نعم | نعم | لا | لا | manager step + HR final |
| Overtime | Create manual/calculate rules | نعم | لا | لا | لا | HR only |
| Overtime | Approve/reject | نعم | نعم | لا | لا | حسب المسار |
| Holidays | Manage holidays | نعم | لا | لا | لا | payrolladmin read/report only |
| Disciplinary | Create case | نعم | لا | لا | لا | manager read scope |
| Disciplinary | View cases | نعم | نعم | لا | لا | employee read via profile not action |
| Resignations | View | نعم | نعم | نعم (self if implemented) | نعم | scoped |
| Resignations | Approve/clearance/interview | نعم | جزئيًا | لا | settlement only | حسب المرحلة |
| Clearance | Create/update/complete | نعم | لا | لا | لا | payrolladmin can calculate/view |
| Documents | Create/update/delete | نعم | لا | لا | لا | employee self-view only |
| Compliance | Edit compliance records | نعم | لا | لا | لا | managers/payroll view only |
| Assets | Create/edit/assign/return/retire | نعم | لا | لا | لا | managers/employees read scoped |
| Advances | Approve/reject | نعم | لا | لا | نعم (visibility) | HR operational approval |
| Payroll Runs | View runs/payslips | نعم | لا | لا | نعم | HR has visibility |
| Payroll Runs | Create/approve run | لا | لا | لا | نعم | payroll-only |
| Users | Create employee/manager users | نعم | لا | لا | لا | HR cannot create hradmin/payrolladmin |
| Settings | Edit | نعم | لا | لا | لا | `settings:edit` |
| Reports | View/export | نعم | لا | لا | نعم | حسب تقرير |
| Forms | Manage forms | نعم | نعم | نعم (some self-service) | نعم | scoped by feature |

---

## 7. HR Workflows

### 7.1 Create Employee

1. HR opens `/app/employees`.
2. HR clicks **Add Employee**.
3. النظام يفتح modal منظم.
4. HR يملأ البيانات الأساسية:
   - الاسم AR/EN
   - القسم
   - المسمى الوظيفي
   - تاريخ التعيين
   - بيانات الاتصال
5. يتم التحقق من الحقول المطلوبة.
6. عند الحفظ:
   - `POST /api/employees`
   - success toast
   - refresh employees list
7. يمكن فتح employee profile مباشرة لاستكمال الوثائق/الحساب/الأصول.

### 7.2 Create User Account for Employee

1. HR opens `/app/users`.
2. يضغط **Create User**.
3. يختار role مسموحًا (`employee` أو `manager`).
4. يربط الحساب بموظف من `employee-options`.
5. النظام يتحقق من:
   - username
   - email
   - عدم ربط الموظف مسبقًا
6. `POST /api/users`
7. يعرض النظام:
   - username
   - email
   - temporary password
   - must-change-password flow

### 7.3 Pre-employment Probation

1. HR opens `/app/pre-employment`.
2. يضيف سجل فترة تجربة للموظف.
3. start date فقط هو الإدخال الأساسي.
4. النظام يحسب `probationEndDate` من `probation_days`.
5. HR يتابع التقييمات الشهرية من `/app/pre-employment/evaluation/:employeeId`.
6. HR يسجل الضمان الاجتماعي الأولي إن لزم.
7. عند اكتمال التقييم والوثائق، ينتقل الموظف من probation إلى confirmed حسب القرار.

### 7.4 Employee Attendance Correction

1. الموظف ينشئ طلب تصحيح من `/app/attendance`.
2. `POST /api/attendance/requests`.
3. HR يرى الطلب في تبويب Requests.
4. HR يراجع reason والوقت المطلوب.
5. approve:
   - confirm dialog
   - `PUT /api/attendance/requests/{id}/approve`
   - update `AttendanceRecord`
6. reject:
   - reject reason dialog
   - `PUT /api/attendance/requests/{id}/reject`
7. الطلب ينعكس في employee profile attendance tab.

### 7.5 Leave Request Approval

1. الموظف ينشئ طلب إجازة.
2. النظام يطبق policy validation.
3. إذا كانت السياسة تتطلب مديرًا أولًا، يمر الطلب بمرحلة manager approval.
4. HR يرى الطلبات في `/app/leave`.
5. HR يعتمد أو يرفض.
6. عند الاعتماد النهائي:
   - updated leave balance
   - attendance records marked `on_leave`
   - notification/update in employee view

### 7.6 Overtime Approval

1. الموظف أو المدير يرفع طلب OT أو يسجل OT.
2. HR يراجع في `/app/overtime`.
3. HR يعتمد السجل أو الطلب.
4. approved overtime becomes visible for payroll calculations.
5. الرفض يتطلب reason حيث ينطبق.

### 7.7 Disciplinary Action

1. HR ينشئ حالة تأديبية.
2. النظام يتحقق أن `ViolationDate` ضمن `disciplinary_window_days`.
3. يتم تسجيل التحقيق والمذكرات.
4. HR يصدر العقوبة ويحدد المهلة/القرار.
5. الموظف يرى السجل read-only في profile إذا كانت الصلاحيات تسمح.

### 7.8 Resignation Approval

1. الموظف/الإدارة تنشئ طلب استقالة.
2. HR يراجع الحالة، السبب، التاريخ، والمرحلة.
3. HR يوافق/يرفض.
4. عند الموافقة:
   - start clearance
   - exit interview
   - settlement
   - pending assets check
5. لا يتم الإكمال قبل اكتمال clearance والأصول.

### 7.9 End-of-service Clearance

1. HR ينشئ سجل clearance.
2. النظام يحسب:
   - gratuity
   - leave compensation
   - pending salary
   - deductions
3. HR يرى pending assets.
4. إذا بقيت أصول assigned، يمنع completion.
5. بعد اكتمال جميع المسارات:
   - finalize clearance
   - print clearance summary

### 7.10 Document Upload and Compliance Update

1. HR opens `/app/documents`.
2. يرفع document من نوع compliance-related.
3. النظام يحفظ `Document`.
4. compliance dashboard/profile updates automatically.
5. pre-employment checklist يتحدث إذا كانت الوثيقة ضمن required onboarding docs.

### 7.11 Asset Assignment and Return

1. HR ينشئ أصل أو يفتح أصلًا موجودًا.
2. assign modal:
   - employee
   - assignment date
   - expected return date
   - condition
3. عند return:
   - return date
   - returned condition
   - notes / deduction if damaged
4. employee profile assets tab updates.
5. clearance/resignation checks pending assets before completion.

### 7.12 Salary Advance Approval

1. الموظف يطلب سلفة.
2. HR يراجع الطلب في `/app/advances`.
3. approve عبر confirm dialog أو reject via reason dialog.
4. advance status updates.
5. approved advance يظهر في payroll deduction visibility.

### 7.13 Payroll Review Visibility

1. HR يفتح `/app/payroll/runs`.
2. يرى runs وقيم gross/net/deductions وقسائم الرواتب.
3. لا ينشئ المسير ولا يعتمد المسير النهائي.
4. يستخدم الرؤية التشغيلية للتدقيق ومتابعة ارتباط السلف والإضافي والغيابات.

---

## 8. Integrations

| المصدر | التأثير | التفاصيل |
|---|---|---|
| Leave approval | Attendance | الطلب المعتمد يضع `AttendanceRecord.Status = on_leave` للأيام المعتمدة |
| Documents | Compliance | الوثيقة المرفوعة/المحدثة تعيد احتساب status والتنبيهات |
| Documents | Employee profile | يظهر المستند في تبويب Documents مباشرة |
| Documents | Pre-employment | تحديث checklist للمستندات المطلوبة قبل التثبيت |
| Compliance settings | Documents/Compliance alerts | أيام التنبيه (`*_alert_days`) تحدد expiring soon logic |
| Resignation | Clearance | الموافقة/البدء في الاستقالة يفتح مسار براءة الذمة |
| Clearance | Assets | completion blocked if assigned assets remain |
| Assets | Employee profile | employee assets tab reflects current/historical assignments |
| Salary advances | Payroll | approved undeducted advances تدخل في deductions عند إنشاء payroll run |
| Overtime | Payroll | approved overtime يدخل في payroll additions |
| Attendance | Payroll | absence/unpaid impact يظهر في deductions حسب logic/settings |
| Settings | All modules | settings هي المصدر المركزي لقواعد العمل |
| Notifications | Topbar/activity | الأحداث والطلبات تظهر أو تُخفى حسب notification settings |
| Users | Employee | account linked to employee profile via `EmployeeId` |

---

## 9. Validation Rules

### 9.1 Employee Rules

- employee code مطلوب ويجب أن يكون فريدًا ضمن الشركة.
- البيانات الأساسية للهوية مطلوبة عند الإنشاء.
- ربط البنك/IBAN/SSC يظهر فقط للأدوار المخولة.

### 9.2 Leave Rules

- end date >= start date.
- leave type must exist and be active.
- requested days لا تتجاوز balance/policy.
- notice period من settings/policy.
- medical attachment where required.

### 9.3 Attendance Correction Rules

- reason required.
- request date valid.
- لا يتم تحديث attendance record إلا بعد approval.

### 9.4 Disciplinary 14-day / configurable Rule

- لا يجوز اتخاذ إجراء تأديبي إذا تجاوزت المخالفة النافذة المحددة في `disciplinary_window_days`.
- الرسالة العربية المعتمدة في الواجهة:
  - `لا يمكن اتخاذ إجراء بعد 14 يوم من تاريخ المخالفة`
  - أو بالقيمة الجديدة إذا تغيرت setting.

### 9.5 Probation Duration Rule

- تاريخ نهاية التجربة = `start date + probation_days`.
- لا يسمح بإنشاء active probation duplicate.

### 9.6 Document Expiry Rules

- بعض الوثائق تتطلب `ExpiryDate`.
- expiring/expired based on document type + settings threshold.

### 9.7 Asset Return Rules

- cannot assign if already assigned.
- return condition changes status:
  - good -> available
  - damaged -> damaged/maintenance
  - lost -> lost
- clearance completion blocked when pending assets exist.

### 9.8 Salary Advance Limits

- amount may be bounded by `advance_salary_max_pct`.
- pending/rejected advances are not deducted in payroll.

### 9.9 Payroll Snapshot Rules

- approved payroll runs are immutable.
- payroll values are stored as snapshot for payslips.
- future settings changes do not retroactively change approved runs.

---

## 10. Notifications

الإشعارات التي تهم HR داخل ZenJO:

| نوع الإشعار | المصدر | شرط الظهور |
|---|---|---|
| Leave requests | `/api/dashboard/summary` أو activity | `notify_leave_requests=true` |
| Overtime requests | dashboard summary/activity | `notify_overtime_requests=true` |
| Advance requests | dashboard summary/activity | `notify_advance_requests=true` |
| Expiring documents | documents/compliance summary | `notify_expiring_documents=true` |
| Probation ending | dashboard upcoming probations | `notify_probation_alerts` إذا تم ربطه بالكامل |
| Resignations | resignation workflow | `notify_resignations` |
| Attendance corrections | attendance requests | حسب activity/notification generation |
| Pending approvals | dashboard pending queue | حسب دور HR والطلبات المعلقة |

الـ topbar notifications في `LayoutComponent` تستخدم summary/activity feeds، وتخضع لبعض settings المركزية.

---

## 11. Printing / Exporting

العناصر المطبوعة/القابلة للتصدير التي يتعامل معها HR:

| العنصر | الوحدة | النوع |
|---|---|---|
| Leave request | Leave | Print |
| Resignation request | Resignations | Print |
| Clearance / end-of-service summary | Clearance | Print |
| Payslip | Payroll | Print |
| Payroll summary | Payroll Runs | Print / summary export |
| Asset handover form | Assets | Print |
| Asset return receipt | Assets | Print |
| Compliance report | Compliance | Export / Print |
| Document report | Documents | Export |
| Asset inventory report | Assets | Export |
| Reports module outputs | Reports | Report read/print/export حسب endpoint |

---

## 12. Security and Audit

### 12.1 Role-based Access Control

- يعتمد النظام على claims-based authorization عبر `[Authorize]` و `[Authorize(Roles=...)]`.
- `RoleAccessService` في الواجهة يحدد:
  - `SCREEN_ACCESS`
  - `ACTION_ACCESS`
- backend remains source of truth، والواجهة فقط تضبط UX visibility.

### 12.2 Employee Data Privacy

- الموظف لا يرى إلا بياناته (`employee` scoped access).
- المدير يرى موظفي فريقه فقط في الوحدات scoped.
- HR يرى موظفي الشركة.

### 12.3 Salary / Bank / SSC Restrictions

- بيانات الراتب والبنك وSSC حساسة.
- الوصول إليها في الواجهة مقيد عبر:
  - `employee:viewSalary`
  - `employee:viewBank`
  - `employee:viewSSC`
- المسموح: `hradmin`, `payrolladmin`.

### 12.4 Audit Logging

- `ActivityLog` يحتفظ بالعمليات الرئيسية:
  - `ActionType`
  - `EntityType`
  - `EntityId`
  - `OldValuesJson`
  - `NewValuesJson`
  - `IpAddress`
  - `CompanyId`
- مهم للعمليات الحساسة مثل:
  - employee updates
  - disciplinary decisions
  - leave approvals
  - account creation
  - settings updates

### 12.5 Sensitive Actions

- إنشاء حساب مستخدم.
- تغيير إعدادات الشركة.
- اعتماد إجازة/سلفة/تصحيح حضور.
- إصدار عقوبة تأديبية.
- إغلاق استقالة أو براءة ذمة.
- إسناد أو استرجاع أصل.

### 12.6 Who Can See What

| البيانات | HR | Manager | Employee | Payroll Admin |
|---|---:|---:|---:|---:|
| ملف الموظف الكامل | نعم | فريقه فقط | نفسه فقط | نعم (مع قيود عملية) |
| الراتب والبنك | نعم | لا | غالبًا لا عبر profile العام | نعم |
| attendance company-wide | نعم | team scope | self only | تقارير فقط |
| leave approvals | نعم | نعم لمرحلة الفريق | self tracking فقط | لا |
| payroll runs | view | لا | approved slips only | full |
| users/accounts | نعم ضمن القيود | لا | لا | لا |

---

## 13. Open Questions / Gaps

1. **API response schemas ليست موثقة مركزيًا**:
   - النظام يستخدم `ApiResponse<T>` لكن بعض الـ payloads التفصيلية تحتاج OpenAPI/Swagger spec مكتمل.

2. **بعض أسماء مسارات الـ Disciplinary وResignation التفصيلية**:
   - تم توثيقها بحسب controller family + السلوك الظاهر في الواجهة، لكن يوصى بإضافة API contract file موحد.

3. **جداول مثل `PayrollRun`, `Payslip`, `Resignation`, `Clearance`**:
   - تفاصيل الحقول الكاملة غير ظاهرة في المقتطف المفتوح من `Entities.cs`، لذلك التوثيق الحالي يركز على الحقول الوظيفية المستخدمة فعليًا في الواجهات والـ controllers.

4. **Workflow step labeling لبعض الطلبات**:
   - خاصة Overtime approval حيث يوجد route-level authorization يحتاج توحيد مع business workflow لمرحلة manager vs HR.

5. **Notification generation backend**:
   - توجد notifications screen وdashboard activity feeds، لكن ليس كل أنواع الإشعارات موحدة بعد في Notification entity نفسها.

6. **Print/export standardization**:
   - بعض الوحدات تعتمد browser print، وبعضها export endpoint. يوصى بمكتبة أو خدمة طباعة موحدة.

7. **Compliance write-back model**:
   - النظام يدعم التحديث المباشر لبعض حالات الامتثال، وفي الوقت نفسه يعتمد على الوثائق كمصدر حقيقة. يوصى بتثبيت policy واضحة:
     - documents-first
     - direct manual override with audit trail

8. **Manager scope rules**:
   - بعض الـ APIs تعتمد scope logic داخل controller. يوصى بتجميعها في reusable policy/service لسهولة التدقيق الأمني.

9. **HR vs Payroll ownership boundaries**:
   - HR لديه visibility على payroll، لكن حدود القراءة/الاعتماد/التعديل تحتاج matrix تشغيلية رسمية معتمدة من business.

10. **Settings catalog completeness**:
   - بعد integration pass أصبحت الإعدادات مصدر حقيقة مهم، لكن يوصى بإصدار documentation منفصل لكل key والقيم الافتراضية وتأثيره على كل module.

