// ═══════════════════════════════════════════════════════════════════
// ZenJO Forms Engine — Form Definitions
// All 16 HR form types with fields, categories, and document templates
// ═══════════════════════════════════════════════════════════════════

export type FieldType = 'employee' | 'text' | 'textarea' | 'date' | 'select' | 'number' | 'static' | 'leave-type' | 'separator';

export interface FormField {
  id: string;
  labelAr: string;
  labelEn: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; labelAr: string }[];
  defaultValue?: string;
  bindTo?: string;
  rows?: number;
  hint?: string;
  cols?: 1 | 2;
}

export type FormCategory = 'employee' | 'recruitment' | 'assets' | 'legal' | 'certificates';

export interface FormDefinition {
  id: string;
  nameAr: string;
  nameEn: string;
  category: FormCategory;
  icon: string;
  roleAccess: string[];
  fields: FormField[];
  getTemplate: (v: Record<string, string>, emp: any, company: any) => string;
}

// ───────────────────────────────────────────
// SHARED: document header / footer builders
// ───────────────────────────────────────────
function docHeader(company: any, titleAr: string, refNumber?: string): string {
  const today = new Date().toLocaleDateString('ar-JO', { year: 'numeric', month: 'long', day: 'numeric' });
  return `
    <div class="doc-header">
      <div class="company-logo-area">
        <div class="company-logo-placeholder">🏢</div>
        <div class="company-info">
          <div class="company-name">${company?.nameAr || 'الشركة'}</div>
          <div class="company-sub">${company?.nameEn || ''}</div>
        </div>
      </div>
      <div class="doc-meta">
        <div class="doc-title">${titleAr}</div>
        <div class="doc-date">التاريخ: ${today}</div>
        ${refNumber ? `<div class="doc-ref">الرقم: ${refNumber}</div>` : ''}
      </div>
    </div>
    <div class="doc-divider"></div>
  `;
}

function empInfoRow(emp: any): string {
  if (!emp?.fullNameAr) return '';
  return `
    <table class="info-table">
      <tr>
        <td class="label">اسم الموظف</td>
        <td class="value">${emp.fullNameAr || '—'}</td>
        <td class="label">رقم الموظف</td>
        <td class="value">${emp.employeeCode || '—'}</td>
      </tr>
      <tr>
        <td class="label">القسم</td>
        <td class="value">${emp.departmentAr || '—'}</td>
        <td class="label">المسمى الوظيفي</td>
        <td class="value">${emp.jobTitleAr || '—'}</td>
      </tr>
    </table>
  `;
}

function signaturesSection(roles: string[]): string {
  const items = roles.map(r => `
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">${r}</div>
    </div>
  `).join('');
  return `<div class="signatures">${items}</div>`;
}

function docFooter(): string {
  return `<div class="doc-footer">نموذج رسمي — ZenJO HRMS</div>`;
}

// ═══════════════════════════════════════════════════════════════════
// FORM DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

export const FORM_DEFINITIONS: FormDefinition[] = [

  // ────────────────────────────────────────────────────────────────
  // 1. LEAVE REQUEST نموذج طلب إجازة
  // ────────────────────────────────────────────────────────────────
  {
    id: 'leave',
    nameAr: 'نموذج طلب إجازة',
    nameEn: 'Leave Request Form',
    category: 'employee',
    icon: 'event_available',
    roleAccess: ['hradmin', 'manager', 'employee'],
    fields: [
      { id: 'employeeId', labelAr: 'الموظف', labelEn: 'Employee', type: 'employee', required: true },
      { id: 'leaveType', labelAr: 'نوع الإجازة', labelEn: 'Leave Type', type: 'select', required: true, options: [
        { value: 'سنوية', labelAr: 'إجازة سنوية' },
        { value: 'مرضية', labelAr: 'إجازة مرضية' },
        { value: 'أمومة', labelAr: 'إجازة أمومة' },
        { value: 'أبوة', labelAr: 'إجازة أبوة' },
        { value: 'زواج', labelAr: 'إجازة زواج' },
        { value: 'وفاة', labelAr: 'إجازة وفاة' },
        { value: 'حج', labelAr: 'إجازة حج' },
        { value: 'بدون راتب', labelAr: 'إجازة بدون راتب' },
      ]},
      { id: 'startDate', labelAr: 'تاريخ البداية', labelEn: 'Start Date', type: 'date', required: true },
      { id: 'endDate', labelAr: 'تاريخ الانتهاء', labelEn: 'End Date', type: 'date', required: true },
      { id: 'days', labelAr: 'عدد الأيام', labelEn: 'Days', type: 'number', required: true },
      { id: 'reason', labelAr: 'السبب / الملاحظات', labelEn: 'Reason', type: 'textarea', rows: 3 },
      { id: 'alternateEmployee', labelAr: 'الموظف البديل (إن وجد)', labelEn: 'Alternate', type: 'text' },
    ],
    getTemplate: (v, emp, company) => `
      ${docHeader(company, 'نموذج طلب إجازة')}
      ${empInfoRow(emp)}
      <table class="info-table mt-8">
        <tr>
          <td class="label">نوع الإجازة</td>
          <td class="value" colspan="3">${v['leaveType'] || '—'}</td>
        </tr>
        <tr>
          <td class="label">من تاريخ</td>
          <td class="value">${v['startDate'] || '—'}</td>
          <td class="label">إلى تاريخ</td>
          <td class="value">${v['endDate'] || '—'}</td>
        </tr>
        <tr>
          <td class="label">عدد الأيام</td>
          <td class="value">${v['days'] || '—'}</td>
          <td class="label">الموظف البديل</td>
          <td class="value">${v['alternateEmployee'] || '—'}</td>
        </tr>
        ${v['reason'] ? `<tr><td class="label">السبب</td><td class="value" colspan="3">${v['reason']}</td></tr>` : ''}
      </table>
      <div class="doc-note">أتعهد بصحة المعلومات الواردة أعلاه وأرجو الموافقة على منحي الإجازة المطلوبة.</div>
      ${signaturesSection(['توقيع الموظف', 'المدير المباشر', 'مدير الموارد البشرية'])}
      ${docFooter()}
    `
  },

  // ────────────────────────────────────────────────────────────────
  // 2. EXIT PERMIT تصريح خروج
  // ────────────────────────────────────────────────────────────────
  {
    id: 'exit-permit',
    nameAr: 'تصريح خروج',
    nameEn: 'Exit Permit',
    category: 'employee',
    icon: 'logout',
    roleAccess: ['hradmin', 'manager'],
    fields: [
      { id: 'employeeId', labelAr: 'الموظف', labelEn: 'Employee', type: 'employee', required: true },
      { id: 'exitDate', labelAr: 'تاريخ الخروج', labelEn: 'Exit Date', type: 'date', required: true },
      { id: 'exitTime', labelAr: 'وقت الخروج', labelEn: 'Exit Time', type: 'text', required: true },
      { id: 'returnTime', labelAr: 'وقت العودة المتوقع', labelEn: 'Return Time', type: 'text' },
      { id: 'exitType', labelAr: 'نوع الخروج', labelEn: 'Type', type: 'select', required: true, options: [
        { value: 'رسمي', labelAr: 'لمهمة رسمية' },
        { value: 'شخصي', labelAr: 'لغرض شخصي' },
        { value: 'طبي', labelAr: 'لمراجعة طبية' },
      ]},
      { id: 'reason', labelAr: 'الغرض من الخروج', labelEn: 'Purpose', type: 'textarea', rows: 2, required: true },
    ],
    getTemplate: (v, emp, company) => `
      ${docHeader(company, 'تصريح خروج')}
      ${empInfoRow(emp)}
      <table class="info-table mt-8">
        <tr>
          <td class="label">تاريخ الخروج</td>
          <td class="value">${v['exitDate'] || '—'}</td>
          <td class="label">نوع الخروج</td>
          <td class="value">${v['exitType'] || '—'}</td>
        </tr>
        <tr>
          <td class="label">وقت الخروج</td>
          <td class="value">${v['exitTime'] || '—'}</td>
          <td class="label">وقت العودة</td>
          <td class="value">${v['returnTime'] || '—'}</td>
        </tr>
        ${v['reason'] ? `<tr><td class="label">الغرض</td><td class="value" colspan="3">${v['reason']}</td></tr>` : ''}
      </table>
      ${signaturesSection(['توقيع الموظف', 'المدير المباشر', 'أمن الشركة'])}
      ${docFooter()}
    `
  },

  // ────────────────────────────────────────────────────────────────
  // 3. RESIGNATION LETTER خطاب استقالة
  // ────────────────────────────────────────────────────────────────
  {
    id: 'resignation',
    nameAr: 'خطاب استقالة',
    nameEn: 'Resignation Letter',
    category: 'employee',
    icon: 'exit_to_app',
    roleAccess: ['hradmin', 'employee'],
    fields: [
      { id: 'employeeId', labelAr: 'الموظف', labelEn: 'Employee', type: 'employee', required: true },
      { id: 'resignationDate', labelAr: 'تاريخ تقديم الاستقالة', labelEn: 'Resignation Date', type: 'date', required: true },
      { id: 'lastWorkingDay', labelAr: 'آخر يوم عمل', labelEn: 'Last Working Day', type: 'date', required: true },
      { id: 'noticePeriod', labelAr: 'فترة الإشعار (أيام)', labelEn: 'Notice Period', type: 'number', defaultValue: '30' },
      { id: 'reason', labelAr: 'أسباب الاستقالة', labelEn: 'Reason', type: 'textarea', rows: 4, required: true },
      { id: 'additionalNote', labelAr: 'ملاحظات إضافية', labelEn: 'Notes', type: 'textarea', rows: 2 },
    ],
    getTemplate: (v, emp, company) => `
      ${docHeader(company, 'خطاب استقالة')}
      <div class="letter-intro">السادة المحترمون / إدارة ${company?.nameAr || 'الشركة'}</div>
      <div class="letter-salutation">تحية طيبة وبعد،</div>
      <div class="letter-body">
        أنا الموظف ${emp?.fullNameAr || '........................'} بالرقم الوظيفي (${emp?.employeeCode || '........'})،
        العامل بقسم ${emp?.departmentAr || '........................'} بمسمى وظيفي ${emp?.jobTitleAr || '........................'}،
        أتقدم بكل احترام بخطاب استقالتي من منصبي الحالي.
      </div>
      <table class="info-table mt-8">
        <tr>
          <td class="label">تاريخ الاستقالة</td>
          <td class="value">${v['resignationDate'] || '—'}</td>
          <td class="label">فترة الإشعار</td>
          <td class="value">${v['noticePeriod'] || '30'} يوم</td>
        </tr>
        <tr>
          <td class="label">آخر يوم عمل</td>
          <td class="value" colspan="3">${v['lastWorkingDay'] || '—'}</td>
        </tr>
      </table>
      ${v['reason'] ? `<div class="doc-section"><strong>أسباب الاستقالة:</strong><br>${v['reason']}</div>` : ''}
      ${v['additionalNote'] ? `<div class="doc-section">${v['additionalNote']}</div>` : ''}
      <div class="letter-body mt-8">وأتمنى للشركة دوام التوفيق والنجاح، مع خالص شكري وتقديري.</div>
      ${signaturesSection(['توقيع الموظف', 'استلام الإدارة'])}
      ${docFooter()}
    `
  },

  // ────────────────────────────────────────────────────────────────
  // 4. SALARY ADVANCE طلب سلفة راتب
  // ────────────────────────────────────────────────────────────────
  {
    id: 'salary-advance',
    nameAr: 'طلب سلفة راتب',
    nameEn: 'Salary Advance Request',
    category: 'employee',
    icon: 'attach_money',
    roleAccess: ['hradmin', 'payrolladmin', 'employee'],
    fields: [
      { id: 'employeeId', labelAr: 'الموظف', labelEn: 'Employee', type: 'employee', required: true },
      { id: 'amount', labelAr: 'المبلغ المطلوب (JOD)', labelEn: 'Amount', type: 'number', required: true },
      { id: 'installments', labelAr: 'عدد الأقساط', labelEn: 'Installments', type: 'number', required: true, defaultValue: '3' },
      { id: 'requestDate', labelAr: 'تاريخ الطلب', labelEn: 'Request Date', type: 'date', required: true },
      { id: 'reason', labelAr: 'الغرض من السلفة', labelEn: 'Purpose', type: 'textarea', rows: 3, required: true },
    ],
    getTemplate: (v, emp, company) => {
      const monthly = v['amount'] && v['installments']
        ? (parseFloat(v['amount']) / parseInt(v['installments'])).toFixed(3)
        : '—';
      return `
        ${docHeader(company, 'طلب سلفة راتب')}
        ${empInfoRow(emp)}
        <table class="info-table mt-8">
          <tr>
            <td class="label">الراتب الأساسي</td>
            <td class="value">${emp?.basicSalary ? Number(emp.basicSalary).toFixed(3) + ' JOD' : '—'}</td>
            <td class="label">تاريخ الطلب</td>
            <td class="value">${v['requestDate'] || '—'}</td>
          </tr>
          <tr>
            <td class="label">المبلغ المطلوب</td>
            <td class="value"><strong>${v['amount'] ? v['amount'] + ' JOD' : '—'}</strong></td>
            <td class="label">عدد الأقساط</td>
            <td class="value">${v['installments'] || '—'} قسط</td>
          </tr>
          <tr>
            <td class="label">قسط الخصم الشهري</td>
            <td class="value" colspan="3">${monthly} JOD / شهر</td>
          </tr>
          ${v['reason'] ? `<tr><td class="label">الغرض</td><td class="value" colspan="3">${v['reason']}</td></tr>` : ''}
        </table>
        <div class="doc-note">أتعهد بسداد السلفة المذكورة وفق جدول الاستقطاع المحدد.</div>
        ${signaturesSection(['توقيع الموظف', 'مدير الموارد البشرية', 'المدير المالي'])}
        ${docFooter()}
      `;
    }
  },

  // ────────────────────────────────────────────────────────────────
  // 5. HIRING REQUEST طلب توظيف
  // ────────────────────────────────────────────────────────────────
  {
    id: 'hiring-request',
    nameAr: 'طلب توظيف',
    nameEn: 'Hiring Request',
    category: 'recruitment',
    icon: 'person_add',
    roleAccess: ['hradmin', 'manager'],
    fields: [
      { id: 'requestingDept', labelAr: 'القسم الطالب', labelEn: 'Department', type: 'text', required: true },
      { id: 'jobTitle', labelAr: 'المسمى الوظيفي المطلوب', labelEn: 'Job Title', type: 'text', required: true },
      { id: 'headcount', labelAr: 'العدد المطلوب', labelEn: 'Headcount', type: 'number', required: true, defaultValue: '1' },
      { id: 'employmentType', labelAr: 'نوع التوظيف', labelEn: 'Type', type: 'select', required: true, options: [
        { value: 'دوام كامل', labelAr: 'دوام كامل' },
        { value: 'دوام جزئي', labelAr: 'دوام جزئي' },
        { value: 'عقد مؤقت', labelAr: 'عقد مؤقت' },
      ]},
      { id: 'requiredDate', labelAr: 'التاريخ المطلوب للتعيين', labelEn: 'Required Date', type: 'date', required: true },
      { id: 'salaryRange', labelAr: 'نطاق الراتب (JOD)', labelEn: 'Salary Range', type: 'text' },
      { id: 'qualifications', labelAr: 'المؤهلات والمتطلبات', labelEn: 'Requirements', type: 'textarea', rows: 4 },
      { id: 'reason', labelAr: 'مبرر الطلب', labelEn: 'Justification', type: 'textarea', rows: 3 },
    ],
    getTemplate: (v, emp, company) => `
      ${docHeader(company, 'طلب توظيف')}
      <table class="info-table">
        <tr>
          <td class="label">القسم الطالب</td>
          <td class="value">${v['requestingDept'] || '—'}</td>
          <td class="label">العدد المطلوب</td>
          <td class="value">${v['headcount'] || '1'} موظف</td>
        </tr>
        <tr>
          <td class="label">المسمى الوظيفي</td>
          <td class="value">${v['jobTitle'] || '—'}</td>
          <td class="label">نوع التوظيف</td>
          <td class="value">${v['employmentType'] || '—'}</td>
        </tr>
        <tr>
          <td class="label">تاريخ التعيين المطلوب</td>
          <td class="value">${v['requiredDate'] || '—'}</td>
          <td class="label">نطاق الراتب</td>
          <td class="value">${v['salaryRange'] || '—'}</td>
        </tr>
      </table>
      ${v['qualifications'] ? `<div class="doc-section"><strong>المؤهلات والمتطلبات:</strong><br>${v['qualifications']}</div>` : ''}
      ${v['reason'] ? `<div class="doc-section"><strong>مبرر الطلب:</strong><br>${v['reason']}</div>` : ''}
      ${signaturesSection(['مدير القسم الطالب', 'مدير الموارد البشرية', 'الإدارة العليا'])}
      ${docFooter()}
    `
  },

  // ────────────────────────────────────────────────────────────────
  // 6. APPOINTMENT LETTER كتاب تعيين
  // ────────────────────────────────────────────────────────────────
  {
    id: 'appointment-letter',
    nameAr: 'كتاب تعيين',
    nameEn: 'Appointment Letter',
    category: 'recruitment',
    icon: 'how_to_reg',
    roleAccess: ['hradmin'],
    fields: [
      { id: 'employeeId', labelAr: 'الموظف', labelEn: 'Employee', type: 'employee', required: true },
      { id: 'startDate', labelAr: 'تاريخ بدء العمل', labelEn: 'Start Date', type: 'date', required: true },
      { id: 'probationMonths', labelAr: 'مدة التجربة (أشهر)', labelEn: 'Probation', type: 'number', defaultValue: '3' },
      { id: 'workHours', labelAr: 'ساعات العمل', labelEn: 'Work Hours', type: 'text', defaultValue: '8 ساعات / يوم' },
      { id: 'workDays', labelAr: 'أيام العمل', labelEn: 'Work Days', type: 'text', defaultValue: 'من الأحد إلى الخميس' },
      { id: 'annualLeave', labelAr: 'الإجازة السنوية', labelEn: 'Annual Leave', type: 'text', defaultValue: '14 يوماً' },
      { id: 'additionalTerms', labelAr: 'شروط إضافية', labelEn: 'Additional Terms', type: 'textarea', rows: 3 },
    ],
    getTemplate: (v, emp, company) => `
      ${docHeader(company, 'كتاب تعيين')}
      <div class="letter-intro">الأستاذ / الأستاذة: <strong>${emp?.fullNameAr || '........................'}</strong></div>
      <div class="letter-salutation">تحية طيبة وبعد،</div>
      <div class="letter-body">
        يسرنا إبلاغكم بقبول انضمامكم إلى فريق عمل ${company?.nameAr || 'الشركة'} وتعيينكم في المنصب الوظيفي التالي:
      </div>
      <table class="info-table mt-8">
        <tr>
          <td class="label">المسمى الوظيفي</td>
          <td class="value">${emp?.jobTitleAr || '—'}</td>
          <td class="label">القسم</td>
          <td class="value">${emp?.departmentAr || '—'}</td>
        </tr>
        <tr>
          <td class="label">تاريخ بدء العمل</td>
          <td class="value">${v['startDate'] || '—'}</td>
          <td class="label">مدة التجربة</td>
          <td class="value">${v['probationMonths'] || '3'} أشهر</td>
        </tr>
        <tr>
          <td class="label">الراتب الأساسي</td>
          <td class="value">${emp?.basicSalary ? Number(emp.basicSalary).toFixed(3) + ' JOD' : '—'}</td>
          <td class="label">الإجازة السنوية</td>
          <td class="value">${v['annualLeave'] || '14 يوماً'}</td>
        </tr>
        <tr>
          <td class="label">ساعات العمل</td>
          <td class="value">${v['workHours'] || '—'}</td>
          <td class="label">أيام العمل</td>
          <td class="value">${v['workDays'] || '—'}</td>
        </tr>
      </table>
      ${v['additionalTerms'] ? `<div class="doc-section"><strong>شروط إضافية:</strong><br>${v['additionalTerms']}</div>` : ''}
      <div class="letter-body mt-8">نأمل منكم الحضور في التاريخ المحدد مزودين بالمستندات المطلوبة.</div>
      ${signaturesSection(['مدير الموارد البشرية', 'إقرار الموظف بالاستلام'])}
      ${docFooter()}
    `
  },

  // ────────────────────────────────────────────────────────────────
  // 7. EMPLOYMENT CONTRACT عقد عمل
  // ────────────────────────────────────────────────────────────────
  {
    id: 'employment-contract',
    nameAr: 'عقد عمل',
    nameEn: 'Employment Contract',
    category: 'recruitment',
    icon: 'description',
    roleAccess: ['hradmin'],
    fields: [
      { id: 'employeeId', labelAr: 'الموظف', labelEn: 'Employee', type: 'employee', required: true },
      { id: 'contractType', labelAr: 'نوع العقد', labelEn: 'Contract Type', type: 'select', required: true, options: [
        { value: 'دائم', labelAr: 'عقد دائم' },
        { value: 'محدد المدة', labelAr: 'عقد محدد المدة' },
        { value: 'مؤقت', labelAr: 'عقد مؤقت' },
      ]},
      { id: 'startDate', labelAr: 'تاريخ بداية العقد', labelEn: 'Start Date', type: 'date', required: true },
      { id: 'endDate', labelAr: 'تاريخ نهاية العقد', labelEn: 'End Date', type: 'date', hint: 'للعقود محددة المدة' },
      { id: 'probationMonths', labelAr: 'مدة التجربة (أشهر)', labelEn: 'Probation', type: 'number', defaultValue: '3' },
      { id: 'workHours', labelAr: 'ساعات العمل اليومية', labelEn: 'Daily Hours', type: 'number', defaultValue: '8' },
      { id: 'annualLeave', labelAr: 'أيام الإجازة السنوية', labelEn: 'Annual Leave', type: 'number', defaultValue: '14' },
      { id: 'noticePeriod', labelAr: 'مدة الإشعار المسبق (أيام)', labelEn: 'Notice Period', type: 'number', defaultValue: '30' },
    ],
    getTemplate: (v, emp, company) => `
      ${docHeader(company, 'عقد عمل')}
      <div class="contract-parties">
        <p><strong>الطرف الأول (صاحب العمل):</strong> ${company?.nameAr || '........................'}</p>
        <p><strong>الطرف الثاني (الموظف):</strong> ${emp?.fullNameAr || '........................'}
          — الرقم الوطني: ${emp?.nationalId || '........................'}</p>
      </div>
      <div class="doc-section-title">اتفق الطرفان على الشروط التالية:</div>
      <table class="info-table">
        <tr>
          <td class="label">المسمى الوظيفي</td>
          <td class="value">${emp?.jobTitleAr || '—'}</td>
          <td class="label">القسم</td>
          <td class="value">${emp?.departmentAr || '—'}</td>
        </tr>
        <tr>
          <td class="label">نوع العقد</td>
          <td class="value">${v['contractType'] || '—'}</td>
          <td class="label">تاريخ البداية</td>
          <td class="value">${v['startDate'] || '—'}</td>
        </tr>
        ${v['endDate'] ? `<tr><td class="label">تاريخ الانتهاء</td><td class="value" colspan="3">${v['endDate']}</td></tr>` : ''}
        <tr>
          <td class="label">مدة التجربة</td>
          <td class="value">${v['probationMonths'] || '3'} أشهر</td>
          <td class="label">ساعات العمل</td>
          <td class="value">${v['workHours'] || '8'} ساعة / يوم</td>
        </tr>
        <tr>
          <td class="label">الراتب الأساسي</td>
          <td class="value">${emp?.basicSalary ? Number(emp.basicSalary).toFixed(3) + ' JOD' : '—'}</td>
          <td class="label">بدل السكن</td>
          <td class="value">${emp?.housingAllowance ? Number(emp.housingAllowance).toFixed(3) + ' JOD' : '—'}</td>
        </tr>
        <tr>
          <td class="label">بدل النقل</td>
          <td class="value">${emp?.transportAllowance ? Number(emp.transportAllowance).toFixed(3) + ' JOD' : '—'}</td>
          <td class="label">الإجمالي</td>
          <td class="value"><strong>${emp?.totalSalary ? Number(emp.totalSalary).toFixed(3) + ' JOD' : '—'}</strong></td>
        </tr>
        <tr>
          <td class="label">الإجازة السنوية</td>
          <td class="value">${v['annualLeave'] || '14'} يوماً</td>
          <td class="label">مدة الإشعار</td>
          <td class="value">${v['noticePeriod'] || '30'} يوماً</td>
        </tr>
      </table>
      <div class="doc-note">يلتزم الطرفان بأحكام قانون العمل الأردني رقم 8 لسنة 1996 وتعديلاته.</div>
      ${signaturesSection(['الطرف الأول (صاحب العمل)', 'الطرف الثاني (الموظف)'])}
      ${docFooter()}
    `
  },

  // ────────────────────────────────────────────────────────────────
  // 8. ASSET HANDOVER استلام عهدة
  // ────────────────────────────────────────────────────────────────
  {
    id: 'asset-handover',
    nameAr: 'استلام عهدة / أصول',
    nameEn: 'Asset Handover',
    category: 'assets',
    icon: 'inventory',
    roleAccess: ['hradmin'],
    fields: [
      { id: 'employeeId', labelAr: 'الموظف', labelEn: 'Employee', type: 'employee', required: true },
      { id: 'handoverDate', labelAr: 'تاريخ الاستلام', labelEn: 'Date', type: 'date', required: true },
      { id: 'assetType', labelAr: 'نوع الأصل', labelEn: 'Asset Type', type: 'select', required: true, options: [
        { value: 'حاسوب محمول', labelAr: 'حاسوب محمول' },
        { value: 'هاتف', labelAr: 'هاتف عمل' },
        { value: 'سيارة', labelAr: 'سيارة' },
        { value: 'أثاث', labelAr: 'أثاث مكتبي' },
        { value: 'أخرى', labelAr: 'أخرى' },
      ]},
      { id: 'assetName', labelAr: 'اسم / وصف الأصل', labelEn: 'Asset Name', type: 'text', required: true },
      { id: 'assetSerial', labelAr: 'الرقم التسلسلي / رقم الأصل', labelEn: 'Serial/Asset No.', type: 'text' },
      { id: 'assetCondition', labelAr: 'حالة الأصل', labelEn: 'Condition', type: 'select', options: [
        { value: 'جديد', labelAr: 'جديد' },
        { value: 'جيد', labelAr: 'جيد' },
        { value: 'مقبول', labelAr: 'مقبول' },
      ]},
      { id: 'notes', labelAr: 'ملاحظات', labelEn: 'Notes', type: 'textarea', rows: 2 },
    ],
    getTemplate: (v, emp, company) => `
      ${docHeader(company, 'نموذج استلام عهدة / أصول')}
      ${empInfoRow(emp)}
      <table class="info-table mt-8">
        <tr>
          <td class="label">تاريخ الاستلام</td>
          <td class="value">${v['handoverDate'] || '—'}</td>
          <td class="label">نوع الأصل</td>
          <td class="value">${v['assetType'] || '—'}</td>
        </tr>
        <tr>
          <td class="label">اسم / وصف الأصل</td>
          <td class="value">${v['assetName'] || '—'}</td>
          <td class="label">الرقم التسلسلي</td>
          <td class="value">${v['assetSerial'] || '—'}</td>
        </tr>
        <tr>
          <td class="label">حالة الأصل</td>
          <td class="value" colspan="3">${v['assetCondition'] || '—'}</td>
        </tr>
        ${v['notes'] ? `<tr><td class="label">ملاحظات</td><td class="value" colspan="3">${v['notes']}</td></tr>` : ''}
      </table>
      <div class="doc-note">أتعهد بالحفاظ على الأصل المذكور واستخدامه لأغراض العمل فقط وإعادته عند انتهاء الخدمة.</div>
      ${signaturesSection(['توقيع الموظف (المستلم)', 'مسؤول الأصول', 'مدير الموارد البشرية'])}
      ${docFooter()}
    `
  },

  // ────────────────────────────────────────────────────────────────
  // 9. WORK PERMIT REQUEST طلب تصريح عمل
  // ────────────────────────────────────────────────────────────────
  {
    id: 'work-permit',
    nameAr: 'طلب تصريح عمل',
    nameEn: 'Work Permit Request',
    category: 'assets',
    icon: 'badge',
    roleAccess: ['hradmin'],
    fields: [
      { id: 'employeeId', labelAr: 'الموظف', labelEn: 'Employee', type: 'employee', required: true },
      { id: 'permitType', labelAr: 'نوع التصريح', labelEn: 'Permit Type', type: 'select', required: true, options: [
        { value: 'تصريح عمل جديد', labelAr: 'تصريح عمل جديد' },
        { value: 'تجديد تصريح عمل', labelAr: 'تجديد تصريح عمل' },
        { value: 'تجديد إقامة', labelAr: 'تجديد إقامة' },
      ]},
      { id: 'requestDate', labelAr: 'تاريخ الطلب', labelEn: 'Request Date', type: 'date', required: true },
      { id: 'currentPermitNo', labelAr: 'رقم التصريح الحالي (للتجديد)', labelEn: 'Current Permit No.', type: 'text' },
      { id: 'expiryDate', labelAr: 'تاريخ انتهاء التصريح الحالي', labelEn: 'Expiry Date', type: 'date' },
      { id: 'notes', labelAr: 'ملاحظات', labelEn: 'Notes', type: 'textarea', rows: 2 },
    ],
    getTemplate: (v, emp, company) => `
      ${docHeader(company, 'طلب تصريح عمل')}
      ${empInfoRow(emp)}
      <table class="info-table mt-8">
        <tr>
          <td class="label">الجنسية</td>
          <td class="value">${emp?.nationality || '—'}</td>
          <td class="label">رقم جواز السفر</td>
          <td class="value">${emp?.passportNumber || '—'}</td>
        </tr>
        <tr>
          <td class="label">نوع الطلب</td>
          <td class="value">${v['permitType'] || '—'}</td>
          <td class="label">تاريخ الطلب</td>
          <td class="value">${v['requestDate'] || '—'}</td>
        </tr>
        ${v['currentPermitNo'] ? `<tr><td class="label">رقم التصريح الحالي</td><td class="value">${v['currentPermitNo']}</td><td class="label">تاريخ الانتهاء</td><td class="value">${v['expiryDate'] || '—'}</td></tr>` : ''}
        ${v['notes'] ? `<tr><td class="label">ملاحظات</td><td class="value" colspan="3">${v['notes']}</td></tr>` : ''}
      </table>
      ${signaturesSection(['مدير الموارد البشرية', 'الإدارة العليا'])}
      ${docFooter()}
    `
  },

  // ────────────────────────────────────────────────────────────────
  // 10. PASSPORT REQUEST طلب تسليم جواز
  // ────────────────────────────────────────────────────────────────
  {
    id: 'passport-request',
    nameAr: 'طلب تسليم جواز السفر',
    nameEn: 'Passport Return Request',
    category: 'assets',
    icon: 'travel_explore',
    roleAccess: ['hradmin', 'employee'],
    fields: [
      { id: 'employeeId', labelAr: 'الموظف', labelEn: 'Employee', type: 'employee', required: true },
      { id: 'requestDate', labelAr: 'تاريخ الطلب', labelEn: 'Date', type: 'date', required: true },
      { id: 'purpose', labelAr: 'الغرض من الطلب', labelEn: 'Purpose', type: 'select', required: true, options: [
        { value: 'سفر شخصي', labelAr: 'سفر شخصي' },
        { value: 'تجديد إقامة', labelAr: 'تجديد إقامة' },
        { value: 'فتح حساب بنكي', labelAr: 'فتح حساب بنكي' },
        { value: 'إجراءات حكومية', labelAr: 'إجراءات حكومية' },
        { value: 'أخرى', labelAr: 'أخرى' },
      ]},
      { id: 'returnDate', labelAr: 'تاريخ إعادة الجواز', labelEn: 'Return Date', type: 'date', required: true },
      { id: 'notes', labelAr: 'ملاحظات', labelEn: 'Notes', type: 'textarea', rows: 2 },
    ],
    getTemplate: (v, emp, company) => `
      ${docHeader(company, 'طلب تسليم جواز السفر')}
      ${empInfoRow(emp)}
      <table class="info-table mt-8">
        <tr>
          <td class="label">رقم جواز السفر</td>
          <td class="value">${emp?.passportNumber || '—'}</td>
          <td class="label">الجنسية</td>
          <td class="value">${emp?.nationality || '—'}</td>
        </tr>
        <tr>
          <td class="label">تاريخ الطلب</td>
          <td class="value">${v['requestDate'] || '—'}</td>
          <td class="label">الغرض</td>
          <td class="value">${v['purpose'] || '—'}</td>
        </tr>
        <tr>
          <td class="label">تاريخ إعادة الجواز</td>
          <td class="value" colspan="3">${v['returnDate'] || '—'}</td>
        </tr>
        ${v['notes'] ? `<tr><td class="label">ملاحظات</td><td class="value" colspan="3">${v['notes']}</td></tr>` : ''}
      </table>
      <div class="doc-note">أتعهد بإعادة جواز السفر في التاريخ المحدد أعلاه.</div>
      ${signaturesSection(['توقيع الموظف', 'مدير الموارد البشرية'])}
      ${docFooter()}
    `
  },

  // ────────────────────────────────────────────────────────────────
  // 11. INVESTIGATION NOTICE إشعار تحقيق
  // ────────────────────────────────────────────────────────────────
  {
    id: 'investigation',
    nameAr: 'قرار / إشعار تحقيق',
    nameEn: 'Investigation Notice',
    category: 'legal',
    icon: 'policy',
    roleAccess: ['hradmin'],
    fields: [
      { id: 'employeeId', labelAr: 'الموظف المُحقَق معه', labelEn: 'Employee', type: 'employee', required: true },
      { id: 'issueDate', labelAr: 'تاريخ الإشعار', labelEn: 'Issue Date', type: 'date', required: true },
      { id: 'hearingDate', labelAr: 'تاريخ جلسة التحقيق', labelEn: 'Hearing Date', type: 'date' },
      { id: 'violationType', labelAr: 'نوع المخالفة', labelEn: 'Violation', type: 'select', required: true, options: [
        { value: 'غياب بدون إذن', labelAr: 'غياب بدون إذن' },
        { value: 'إهمال في العمل', labelAr: 'إهمال في العمل' },
        { value: 'عدم احترام المدير', labelAr: 'عدم احترام المدير' },
        { value: 'إفشاء أسرار الشركة', labelAr: 'إفشاء أسرار الشركة' },
        { value: 'استخدام ممتلكات الشركة', labelAr: 'استخدام ممتلكات الشركة لأغراض شخصية' },
        { value: 'أخرى', labelAr: 'مخالفة أخرى' },
      ]},
      { id: 'incidentDate', labelAr: 'تاريخ المخالفة', labelEn: 'Incident Date', type: 'date', required: true },
      { id: 'violationDetails', labelAr: 'تفاصيل المخالفة', labelEn: 'Details', type: 'textarea', rows: 4, required: true },
    ],
    getTemplate: (v, emp, company) => `
      ${docHeader(company, 'إشعار بالتحقيق')}
      <div class="letter-intro">السيد / السيدة: <strong>${emp?.fullNameAr || '........................'}</strong></div>
      <div class="letter-salutation">وبعد،</div>
      <div class="letter-body">
        بناءً على صلاحياتنا المخوّلة وفقاً لأحكام قانون العمل الأردني ولوائح الشركة الداخلية،
        يشرفنا إبلاغكم بأنه سيتم فتح تحقيق بشأن ما نُسب إليكم من مخالفة.
      </div>
      <table class="info-table mt-8">
        <tr>
          <td class="label">القسم</td>
          <td class="value">${emp?.departmentAr || '—'}</td>
          <td class="label">المسمى الوظيفي</td>
          <td class="value">${emp?.jobTitleAr || '—'}</td>
        </tr>
        <tr>
          <td class="label">نوع المخالفة</td>
          <td class="value">${v['violationType'] || '—'}</td>
          <td class="label">تاريخ المخالفة</td>
          <td class="value">${v['incidentDate'] || '—'}</td>
        </tr>
        ${v['hearingDate'] ? `<tr><td class="label">تاريخ جلسة التحقيق</td><td class="value" colspan="3">${v['hearingDate']}</td></tr>` : ''}
      </table>
      ${v['violationDetails'] ? `<div class="doc-section"><strong>تفاصيل المخالفة:</strong><br>${v['violationDetails']}</div>` : ''}
      <div class="doc-note">يُطلب منكم الحضور في الوقت والمكان المحددين لتقديم أقوالكم ودفاعكم. عدم الحضور يُعدّ تنازلاً عن حقكم في الدفاع.</div>
      ${signaturesSection(['مدير الموارد البشرية', 'استلام الموظف / تاريخ الاستلام'])}
      ${docFooter()}
    `
  },

  // ────────────────────────────────────────────────────────────────
  // 12. TERMINATION قرار فصل / إنهاء خدمة
  // ────────────────────────────────────────────────────────────────
  {
    id: 'termination',
    nameAr: 'قرار إنهاء خدمة',
    nameEn: 'Termination Letter',
    category: 'legal',
    icon: 'person_off',
    roleAccess: ['hradmin'],
    fields: [
      { id: 'employeeId', labelAr: 'الموظف', labelEn: 'Employee', type: 'employee', required: true },
      { id: 'terminationDate', labelAr: 'تاريخ الإنهاء', labelEn: 'Termination Date', type: 'date', required: true },
      { id: 'terminationType', labelAr: 'نوع الإنهاء', labelEn: 'Type', type: 'select', required: true, options: [
        { value: 'فصل تأديبي', labelAr: 'فصل تأديبي' },
        { value: 'إنهاء بإشعار مسبق', labelAr: 'إنهاء بإشعار مسبق' },
        { value: 'إنهاء خلال التجربة', labelAr: 'إنهاء خلال فترة التجربة' },
        { value: 'انتهاء عقد', labelAr: 'انتهاء مدة العقد' },
      ]},
      { id: 'reason', labelAr: 'أسباب الإنهاء', labelEn: 'Reason', type: 'textarea', rows: 4, required: true },
      { id: 'lastWorkingDay', labelAr: 'آخر يوم عمل', labelEn: 'Last Working Day', type: 'date', required: true },
      { id: 'eosb', labelAr: 'مكافأة نهاية الخدمة (JOD)', labelEn: 'EOSB Amount', type: 'number' },
    ],
    getTemplate: (v, emp, company) => `
      ${docHeader(company, 'قرار إنهاء خدمة')}
      <div class="letter-intro">السيد / السيدة: <strong>${emp?.fullNameAr || '........................'}</strong></div>
      <div class="letter-body">
        بناءً على صلاحياتنا الممنوحة، نُحيطكم علماً بقرار إنهاء خدمتكم لدى ${company?.nameAr || 'الشركة'}.
      </div>
      ${empInfoRow(emp)}
      <table class="info-table mt-8">
        <tr>
          <td class="label">نوع الإنهاء</td>
          <td class="value">${v['terminationType'] || '—'}</td>
          <td class="label">تاريخ الإنهاء</td>
          <td class="value">${v['terminationDate'] || '—'}</td>
        </tr>
        <tr>
          <td class="label">آخر يوم عمل</td>
          <td class="value">${v['lastWorkingDay'] || '—'}</td>
          <td class="label">مكافأة نهاية الخدمة</td>
          <td class="value">${v['eosb'] ? v['eosb'] + ' JOD' : '—'}</td>
        </tr>
      </table>
      ${v['reason'] ? `<div class="doc-section"><strong>أسباب الإنهاء:</strong><br>${v['reason']}</div>` : ''}
      <div class="doc-note">يُطلب منكم تسليم جميع ممتلكات الشركة وإتمام إجراءات براءة الذمة قبل آخر يوم عمل.</div>
      ${signaturesSection(['الإدارة العليا', 'مدير الموارد البشرية', 'استلام الموظف'])}
      ${docFooter()}
    `
  },

  // ────────────────────────────────────────────────────────────────
  // 13. ADMIN DECISION قرار إداري
  // ────────────────────────────────────────────────────────────────
  {
    id: 'admin-decision',
    nameAr: 'قرار إداري',
    nameEn: 'Administrative Decision',
    category: 'legal',
    icon: 'gavel',
    roleAccess: ['hradmin'],
    fields: [
      { id: 'decisionNumber', labelAr: 'رقم القرار', labelEn: 'Decision No.', type: 'text', required: true },
      { id: 'decisionDate', labelAr: 'تاريخ القرار', labelEn: 'Date', type: 'date', required: true },
      { id: 'employeeId', labelAr: 'الموظف المعني (اختياري)', labelEn: 'Employee', type: 'employee' },
      { id: 'decisionType', labelAr: 'نوع القرار', labelEn: 'Type', type: 'select', required: true, options: [
        { value: 'ترقية', labelAr: 'ترقية وظيفية' },
        { value: 'نقل قسم', labelAr: 'نقل إلى قسم آخر' },
        { value: 'تعديل راتب', labelAr: 'تعديل راتب' },
        { value: 'تحذير', labelAr: 'إنذار / تحذير' },
        { value: 'خصم', labelAr: 'خصم من الراتب' },
        { value: 'مكافأة', labelAr: 'منح مكافأة' },
        { value: 'أخرى', labelAr: 'قرار آخر' },
      ]},
      { id: 'decisionBody', labelAr: 'نص القرار', labelEn: 'Decision Text', type: 'textarea', rows: 5, required: true },
      { id: 'effectiveDate', labelAr: 'تاريخ التطبيق', labelEn: 'Effective Date', type: 'date' },
    ],
    getTemplate: (v, emp, company) => `
      ${docHeader(company, 'قرار إداري', v['decisionNumber'])}
      <div class="decision-preamble">
        <p>نحن إدارة ${company?.nameAr || 'الشركة'}، وبناءً على الصلاحيات الممنوحة لنا،</p>
        <p>وبعد الاطلاع على المستندات والبيانات ذات الصلة،</p>
        <p><strong>نُصدر القرار الإداري التالي:</strong></p>
      </div>
      ${emp?.fullNameAr ? `<div class="doc-section"><strong>الموظف المعني:</strong> ${emp.fullNameAr} — ${emp.departmentAr || ''} — ${emp.jobTitleAr || ''}</div>` : ''}
      <table class="info-table">
        <tr>
          <td class="label">نوع القرار</td>
          <td class="value">${v['decisionType'] || '—'}</td>
          <td class="label">تاريخ التطبيق</td>
          <td class="value">${v['effectiveDate'] || v['decisionDate'] || '—'}</td>
        </tr>
      </table>
      ${v['decisionBody'] ? `<div class="doc-section decision-body">${v['decisionBody']}</div>` : ''}
      ${signaturesSection(['الإدارة العليا', 'مدير الموارد البشرية'])}
      ${docFooter()}
    `
  },

  // ────────────────────────────────────────────────────────────────
  // 14. CLEARANCE FORM نموذج براءة ذمة
  // ────────────────────────────────────────────────────────────────
  {
    id: 'clearance',
    nameAr: 'نموذج براءة ذمة',
    nameEn: 'Employee Clearance Form',
    category: 'legal',
    icon: 'checklist',
    roleAccess: ['hradmin', 'payrolladmin'],
    fields: [
      { id: 'employeeId', labelAr: 'الموظف', labelEn: 'Employee', type: 'employee', required: true },
      { id: 'clearanceDate', labelAr: 'تاريخ المغادرة', labelEn: 'Last Day', type: 'date', required: true },
      { id: 'reason', labelAr: 'سبب مغادرة الخدمة', labelEn: 'Reason', type: 'select', required: true, options: [
        { value: 'استقالة', labelAr: 'استقالة' },
        { value: 'إنهاء خدمة', labelAr: 'إنهاء خدمة' },
        { value: 'انتهاء عقد', labelAr: 'انتهاء عقد' },
        { value: 'تقاعد', labelAr: 'تقاعد' },
      ]},
    ],
    getTemplate: (v, emp, company) => {
      const departments = [
        { ar: 'الموارد البشرية', check: 'الملف الوظيفي وبطاقة الدوام' },
        { ar: 'تقنية المعلومات', check: 'الأجهزة والكمبيوتر والبريد الإلكتروني' },
        { ar: 'المالية والمحاسبة', check: 'السلف والمديونيات المالية' },
        { ar: 'الأصول', check: 'الأثاث والمعدات والمركبات' },
        { ar: 'المكتبة والوثائق', check: 'الوثائق والملفات والمطبوعات' },
        { ar: 'الأمن', check: 'بطاقة الدخول وتصاريح الأمن' },
      ];
      const rows = departments.map(d => `
        <tr>
          <td class="value">${d.ar}</td>
          <td class="value">${d.check}</td>
          <td class="value clearance-check">☐</td>
          <td class="value clearance-check">☐</td>
          <td class="value sig-cell"></td>
        </tr>
      `).join('');
      return `
        ${docHeader(company, 'نموذج براءة ذمة')}
        ${empInfoRow(emp)}
        <table class="info-table mt-8">
          <tr>
            <td class="label">سبب المغادرة</td>
            <td class="value">${v['reason'] || '—'}</td>
            <td class="label">تاريخ المغادرة</td>
            <td class="value">${v['clearanceDate'] || '—'}</td>
          </tr>
        </table>
        <table class="clearance-table mt-8">
          <thead>
            <tr>
              <th>الجهة</th>
              <th>العهد / المسؤوليات</th>
              <th>مُستوفى</th>
              <th>غير مُستوفى</th>
              <th>توقيع المسؤول</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${signaturesSection(['مدير الموارد البشرية', 'المدير المالي', 'توقيع الموظف'])}
        ${docFooter()}
      `;
    }
  },

  // ────────────────────────────────────────────────────────────────
  // 15. EXPERIENCE CERTIFICATE شهادة خبرة
  // ────────────────────────────────────────────────────────────────
  {
    id: 'experience-certificate',
    nameAr: 'شهادة خبرة',
    nameEn: 'Experience Certificate',
    category: 'certificates',
    icon: 'workspace_premium',
    roleAccess: ['hradmin'],
    fields: [
      { id: 'employeeId', labelAr: 'الموظف', labelEn: 'Employee', type: 'employee', required: true },
      { id: 'issueDate', labelAr: 'تاريخ الإصدار', labelEn: 'Issue Date', type: 'date', required: true },
      { id: 'endDate', labelAr: 'تاريخ انتهاء الخدمة (إن انتهت)', labelEn: 'End Date', type: 'date' },
      { id: 'addressedTo', labelAr: 'موجهة إلى (جهة / شركة)', labelEn: 'Addressed To', type: 'text' },
      { id: 'additionalText', labelAr: 'نص إضافي (اختياري)', labelEn: 'Additional Text', type: 'textarea', rows: 3 },
    ],
    getTemplate: (v, emp, company) => {
      const from = emp?.hireDate ? new Date(emp.hireDate).toLocaleDateString('ar-JO') : '........................';
      const to = v['endDate'] ? new Date(v['endDate']).toLocaleDateString('ar-JO') : 'تاريخه';
      return `
        ${docHeader(company, 'شهادة خبرة')}
        ${v['addressedTo'] ? `<div class="letter-intro">إلى: ${v['addressedTo']}</div>` : ''}
        <div class="letter-salutation">تحية طيبة وبعد،</div>
        <div class="certificate-body">
          <p>نشهد بأن السيد / السيدة: <strong>${emp?.fullNameAr || '........................'}</strong></p>
          <p>بالرقم الوطني: <strong>${emp?.nationalId || '........................'}</strong></p>
          <p>قد عمل / عملت في ${company?.nameAr || 'شركتنا'} بمسمى <strong>${emp?.jobTitleAr || '........................'}</strong>
          في قسم <strong>${emp?.departmentAr || '........................'}</strong>.</p>
          <p>للفترة الممتدة من: <strong>${from}</strong> وحتى: <strong>${to}</strong></p>
          ${emp?.basicSalary ? `<p>براتب إجمالي: <strong>${Number(emp.totalSalary || emp.basicSalary).toFixed(3)} JOD</strong></p>` : ''}
          <p>وقد أبدى / أبدت خلال فترة عمله / عملها كفاءة ومهنية عالية.</p>
        </div>
        ${v['additionalText'] ? `<div class="doc-section">${v['additionalText']}</div>` : ''}
        <div class="letter-body">صدرت هذه الشهادة بناءً على طلبه / طلبها لاستخدامها فيما يراه / تراه مناسباً.</div>
        ${signaturesSection(['مدير الموارد البشرية', 'الختم الرسمي للشركة'])}
        ${docFooter()}
      `;
    }
  },

  // ────────────────────────────────────────────────────────────────
  // 16. LETTERHEAD ورقة ترويسة
  // ────────────────────────────────────────────────────────────────
  {
    id: 'letterhead',
    nameAr: 'خطاب رسمي (ترويسة)',
    nameEn: 'Official Letterhead',
    category: 'certificates',
    icon: 'mail',
    roleAccess: ['hradmin'],
    fields: [
      { id: 'addressedTo', labelAr: 'موجه إلى', labelEn: 'To', type: 'text', required: true },
      { id: 'subject', labelAr: 'الموضوع', labelEn: 'Subject', type: 'text', required: true },
      { id: 'issueDate', labelAr: 'التاريخ', labelEn: 'Date', type: 'date', required: true },
      { id: 'refNumber', labelAr: 'رقم المرجع', labelEn: 'Reference No.', type: 'text' },
      { id: 'body', labelAr: 'نص الخطاب', labelEn: 'Letter Body', type: 'textarea', rows: 10, required: true },
      { id: 'closingText', labelAr: 'الخاتمة', labelEn: 'Closing', type: 'text', defaultValue: 'وتفضلوا بقبول فائق الاحترام والتقدير' },
    ],
    getTemplate: (v, emp, company) => `
      ${docHeader(company, 'خطاب رسمي', v['refNumber'])}
      <div class="letter-intro">السادة / ${v['addressedTo'] || '........................'}</div>
      <div class="letter-subject"><strong>الموضوع: ${v['subject'] || '........................'}</strong></div>
      <div class="letter-salutation">تحية طيبة وبعد،</div>
      <div class="letter-body">${(v['body'] || '').replace(/\n/g, '<br>')}</div>
      <div class="letter-body mt-8">${v['closingText'] || 'وتفضلوا بقبول فائق الاحترام والتقدير'}</div>
      ${signaturesSection(['المدير العام / الإدارة العليا'])}
      ${docFooter()}
    `
  },
];

// ─── CATEGORY DEFINITIONS ────────────────────────────────────────────────────

export const FORM_CATEGORIES: { id: FormCategory; nameAr: string; nameEn: string; icon: string }[] = [
  { id: 'employee',      nameAr: 'نماذج الموظفين',           nameEn: 'Employee Forms',          icon: 'person' },
  { id: 'recruitment',   nameAr: 'التوظيف والتعيين',          nameEn: 'Recruitment & Hiring',    icon: 'work' },
  { id: 'assets',        nameAr: 'العهد والتصاريح',           nameEn: 'Assets & Permits',        icon: 'inventory_2' },
  { id: 'legal',         nameAr: 'قانونية وإدارية',           nameEn: 'Legal & Administrative',  icon: 'gavel' },
  { id: 'certificates',  nameAr: 'خطابات وشهادات',            nameEn: 'Letters & Certificates',  icon: 'workspace_premium' },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

export function getFormById(id: string): FormDefinition | undefined {
  return FORM_DEFINITIONS.find(f => f.id === id);
}

export function getFormsByCategory(category: FormCategory): FormDefinition[] {
  return FORM_DEFINITIONS.filter(f => f.category === category);
}

export function getFormsForRole(role: string): FormDefinition[] {
  return FORM_DEFINITIONS.filter(f => f.roleAccess.includes(role));
}
