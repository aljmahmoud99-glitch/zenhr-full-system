import {
  ChangeDetectionStrategy, Component, OnInit, computed, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { RoleAccessService } from '../../core/services/role-access.service';
import { OrgNodesService, OrgNode } from '../../core/services/org-nodes.service';
import { ToastService } from '../../core/services/toast.service';

type ReportKey =
  | 'headcount' | 'attendance' | 'leave' | 'overtime'
  | 'compliance' | 'disciplinary' | 'payroll' | 'ssc'
  | 'income-tax' | 'turnover' | 'salary-components';

interface ReportCard {
  key: ReportKey;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  descriptionEn: string;
  icon: string;
  group: 'hr' | 'financial';
}

interface FilterChip {
  label: string;
  field: string;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReportsComponent implements OnInit {

  loading = signal(false);
  reportData = signal<any>(null);
  hasRun = signal(false);
  activeReport = signal<ReportKey>('headcount');
  showFilters = signal(true);

  filterOrgNodeId: number | '' = '';
  filterEmployeeId: number | '' = '';
  filterMonth = new Date().getMonth() + 1;
  filterYear = new Date().getFullYear();
  filterFrom = `${new Date().getFullYear()}-01-01`;
  filterTo   = `${new Date().getFullYear()}-12-31`;
  filterStatus    = '';
  filterLeaveType = '';
  filterDocType   = '';
  filterExpiryStatus = '';

  employeeSearch = '';
  allEmployees = signal<any[]>([]);
  employeeSuggestions = signal<any[]>([]);
  showEmployeeSuggestions = signal(false);
  selectedEmployeeName = '';

  orgNodes = signal<OrgNode[]>([]);

  currentPage = signal(1);
  readonly pageSize = 50;

  appliedChips = signal<FilterChip[]>([]);

  monthsAr = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  monthsEn = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  years = [2023, 2024, 2025, 2026, 2027];

  reportCards: ReportCard[] = [
    { key:'headcount',         labelAr:'القوى العاملة',       labelEn:'Headcount',          descriptionAr:'توزيع الموظفين حسب الحالة والقسم',   descriptionEn:'Workforce distribution by status and dept',  icon:'groups',         group:'hr' },
    { key:'attendance',        labelAr:'الحضور والغياب',      labelEn:'Attendance',          descriptionAr:'ملخص الحضور والغياب والتأخير',         descriptionEn:'Attendance, absence and lateness summary',   icon:'schedule',       group:'hr' },
    { key:'leave',             labelAr:'تحليل الإجازات',      labelEn:'Leave Analysis',      descriptionAr:'أنواع الإجازات والأيام المستخدمة',       descriptionEn:'Leave type usage and total days',            icon:'event_available',group:'hr' },
    { key:'overtime',          labelAr:'العمل الإضافي',       labelEn:'Overtime',            descriptionAr:'ساعات العمل الإضافي وتكلفتها',           descriptionEn:'Overtime hours and cost by employee',        icon:'timer',          group:'hr' },
    { key:'compliance',        labelAr:'الامتثال',            labelEn:'Compliance Status',   descriptionAr:'حالة الوثائق والتسجيلات النظامية',       descriptionEn:'Document compliance and SSC enrollment',     icon:'verified_user',  group:'hr' },
    { key:'disciplinary',      labelAr:'التأديب',             labelEn:'Disciplinary',        descriptionAr:'تحليل القضايا والمخالفات التأديبية',     descriptionEn:'Disciplinary case breakdown',                icon:'gavel',          group:'hr' },
    { key:'turnover',          labelAr:'الدوران الوظيفي',     labelEn:'Turnover',            descriptionAr:'التعيينات والمغادرون ومعدل الدوران',     descriptionEn:'Hires, exits and turnover rate',             icon:'trending_down',  group:'hr' },
    { key:'payroll',           labelAr:'ملخص الرواتب',        labelEn:'Payroll Summary',     descriptionAr:'الإجمالي والصافي والاستقطاعات الشهرية', descriptionEn:'Monthly payroll totals and deductions',      icon:'payments',       group:'financial' },
    { key:'ssc',               labelAr:'الضمان الاجتماعي',   labelEn:'SSC Contributions',   descriptionAr:'بيانات اشتراكات الضمان الشهرية',         descriptionEn:'Monthly SSC contributions',                  icon:'shield',         group:'financial' },
    { key:'income-tax',        labelAr:'ضريبة الدخل',         labelEn:'Income Tax',          descriptionAr:'إجمالي الدخل السنوي والضريبة',           descriptionEn:'Annual gross income and tax summary',        icon:'receipt_long',   group:'financial' },
    { key:'salary-components', labelAr:'مكونات الراتب',       labelEn:'Salary Components',   descriptionAr:'تفصيل مكونات راتب كل موظف',              descriptionEn:'Per-employee salary component breakdown',    icon:'account_balance_wallet', group:'financial' },
  ];

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private access: RoleAccessService,
    private orgNodesService: OrgNodesService,
    private toast: ToastService
  ) {}

  get lang() { return this.auth.lang; }
  get isPayrollViewer() { return this.access.isAny('payrolladmin'); }
  get dir() { return this.lang === 'ar' ? 'rtl' : 'ltr'; }

  get visibleReports(): ReportCard[] {
    if (this.isPayrollViewer) {
      return this.reportCards.filter(r => r.group === 'financial');
    }
    return this.reportCards;
  }

  get hrReports()        { return this.visibleReports.filter(r => r.group === 'hr'); }
  get financialReports() { return this.visibleReports.filter(r => r.group === 'financial'); }

  currentCard() { return this.visibleReports.find(r => r.key === this.activeReport()); }

  ngOnInit() {
    this.orgNodesService.getFlat().subscribe({ next: r => this.orgNodes.set(r.data ?? []) });
    this.api.get<any>('/api/employees').subscribe({
      next: r => this.allEmployees.set((r.data ?? []).filter((e: any) => !e.isDeleted))
    });
    if (this.isPayrollViewer) this.activeReport.set('payroll');
  }

  selectReport(key: ReportKey) {
    this.activeReport.set(key);
    this.hasRun.set(false);
    this.reportData.set(null);
    this.currentPage.set(1);
    this.showFilters.set(true);
    this.filterStatus = '';
    this.filterLeaveType = '';
    this.filterDocType = '';
    this.filterExpiryStatus = '';
  }

  toggleFilters() { this.showFilters.update(v => !v); }

  setPreset(preset: 'thisMonth' | 'thisQuarter' | 'thisYear') {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    if (preset === 'thisMonth') {
      const last = new Date(y, m + 1, 0).getDate();
      this.filterFrom = `${y}-${String(m+1).padStart(2,'0')}-01`;
      this.filterTo   = `${y}-${String(m+1).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
    } else if (preset === 'thisQuarter') {
      const q = Math.floor(m / 3);
      const qs = q * 3;
      const qe = qs + 2;
      const last = new Date(y, qe + 1, 0).getDate();
      this.filterFrom = `${y}-${String(qs+1).padStart(2,'0')}-01`;
      this.filterTo   = `${y}-${String(qe+1).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
    } else {
      this.filterFrom = `${y}-01-01`;
      this.filterTo   = `${y}-12-31`;
    }
  }

  onEmployeeInput() {
    const q = this.employeeSearch.trim().toLowerCase();
    if (!q) {
      this.employeeSuggestions.set([]);
      this.showEmployeeSuggestions.set(false);
      this.filterEmployeeId = '';
      return;
    }
    const matched = this.allEmployees().filter(e => {
      const ar = (e.fullNameAr ?? '').toLowerCase();
      const en = (e.fullNameEn ?? '').toLowerCase();
      const code = (e.employeeCode ?? '').toLowerCase();
      return ar.includes(q) || en.includes(q) || code.includes(q);
    }).slice(0, 8);
    this.employeeSuggestions.set(matched);
    this.showEmployeeSuggestions.set(matched.length > 0);
  }

  selectEmployee(emp: any) {
    this.filterEmployeeId = emp.id;
    this.selectedEmployeeName = this.lang === 'ar' ? emp.fullNameAr : emp.fullNameEn;
    this.employeeSearch = this.selectedEmployeeName;
    this.showEmployeeSuggestions.set(false);
  }

  clearEmployee() {
    this.filterEmployeeId = '';
    this.employeeSearch = '';
    this.selectedEmployeeName = '';
    this.employeeSuggestions.set([]);
    this.showEmployeeSuggestions.set(false);
  }

  buildParams(format: 'json' | 'excel' = 'json'): Record<string, any> {
    const key = this.activeReport();
    const p: Record<string, any> = {};
    if (format === 'excel') p['format'] = 'excel';
    if (this.filterOrgNodeId) p['orgNodeId'] = this.filterOrgNodeId;
    if (this.filterEmployeeId) p['employeeId'] = this.filterEmployeeId;
    if (this.filterStatus) p['status'] = this.filterStatus;
    if (this.filterLeaveType) p['leaveType'] = this.filterLeaveType;
    if (this.filterDocType) p['docType'] = this.filterDocType;
    if (this.filterExpiryStatus) p['expiryStatus'] = this.filterExpiryStatus;

    if (['attendance','payroll','ssc','salary-components'].includes(key)) {
      p['month'] = this.filterMonth;
      p['year']  = this.filterYear;
    }
    if (['income-tax','turnover'].includes(key)) {
      p['year'] = this.filterYear;
    }
    if (['leave','overtime','disciplinary','turnover'].includes(key)) {
      if (this.filterFrom) p['from'] = this.filterFrom;
      if (this.filterTo)   p['to']   = this.filterTo;
    }
    return p;
  }

  endpointBase(): string {
    const map: Record<string, string> = {
      headcount:          '/api/reports/headcount',
      attendance:         '/api/reports/attendance-summary',
      leave:              '/api/reports/leave-analysis',
      overtime:           '/api/reports/overtime-summary',
      compliance:         '/api/reports/compliance-status',
      disciplinary:       '/api/reports/disciplinary-summary',
      payroll:            '/api/reports/payroll-summary',
      ssc:                '/api/reports/ssc-contributions',
      'income-tax':       '/api/reports/income-tax',
      turnover:           '/api/reports/turnover',
      'salary-components':'/api/reports/salary-components',
    };
    return map[this.activeReport()] ?? '';
  }

  runReport() {
    this.loading.set(true);
    this.hasRun.set(false);
    this.currentPage.set(1);
    this.api.get<any>(this.endpointBase(), this.buildParams('json')).subscribe({
      next: r => {
        this.reportData.set(r.data);
        this.hasRun.set(true);
        this.loading.set(false);
        this.showFilters.set(false);
        this.buildChips();
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.error(this.lang === 'ar' ? 'فشل تحميل التقرير' : 'Failed to load report');
      }
    });
  }

  buildChips() {
    const chips: FilterChip[] = [];
    const key = this.activeReport();
    if (this.filterOrgNodeId) {
      const node = this.orgNodes().find(n => n.id === this.filterOrgNodeId);
      if (node) chips.push({ label: this.lang === 'ar' ? node.nameAr : node.nameEn, field: 'orgNodeId' });
    }
    if (this.filterEmployeeId && this.selectedEmployeeName) {
      chips.push({ label: this.selectedEmployeeName, field: 'employeeId' });
    }
    if (['attendance','payroll','ssc','salary-components'].includes(key)) {
      const mName = this.lang === 'ar' ? this.monthsAr[this.filterMonth-1] : this.monthsEn[this.filterMonth-1];
      chips.push({ label: `${mName} ${this.filterYear}`, field: 'period' });
    }
    if (['income-tax','turnover'].includes(key)) {
      chips.push({ label: String(this.filterYear), field: 'year' });
    }
    if (['leave','overtime','disciplinary'].includes(key) && this.filterFrom) {
      chips.push({ label: `${this.filterFrom} → ${this.filterTo}`, field: 'dateRange' });
    }
    if (this.filterStatus) chips.push({ label: this.statusLabel(this.filterStatus), field: 'status' });
    if (this.filterLeaveType) chips.push({ label: this.filterLeaveType, field: 'leaveType' });
    if (this.filterDocType) chips.push({ label: this.filterDocType, field: 'docType' });
    if (this.filterExpiryStatus) chips.push({ label: this.filterExpiryStatus, field: 'expiryStatus' });
    this.appliedChips.set(chips);
  }

  removeChip(chip: FilterChip) {
    switch (chip.field) {
      case 'orgNodeId':    this.filterOrgNodeId = ''; break;
      case 'employeeId':   this.clearEmployee(); break;
      case 'period':       break;
      case 'year':         break;
      case 'dateRange':    break;
      case 'status':       this.filterStatus = ''; break;
      case 'leaveType':    this.filterLeaveType = ''; break;
      case 'docType':      this.filterDocType = ''; break;
      case 'expiryStatus': this.filterExpiryStatus = ''; break;
    }
    this.runReport();
  }

  exportExcel() {
    const params = this.buildParams('excel');
    const qs = Object.entries(params)
      .filter(([,v]) => v != null && v !== '')
      .map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    const url = `${this.endpointBase()}?${qs}`;
    const token = this.auth.getToken();
    const key = this.activeReport();
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (!r.ok) throw new Error('Export failed');
        return r.blob();
      })
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `zenjo-${key}-${new Date().toISOString().slice(0,10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => this.toast.error(this.lang === 'ar' ? 'فشل التصدير' : 'Export failed'));
  }

  printReport() { window.print(); }

  rows = computed(() => {
    const data = this.reportData();
    if (!data) return [];
    const key = this.activeReport();
    switch (key) {
      case 'attendance':          return Array.isArray(data) ? data : [];
      case 'ssc':                 return Array.isArray(data) ? data : [];
      case 'disciplinary':        return data.records ?? [];
      case 'payroll':             return data.payslips ?? [];
      case 'turnover':            return data.monthly ?? [];
      case 'leave':               return data.requests ?? [];
      case 'income-tax':          return data.records ?? [];
      case 'compliance':          return data.records ?? [];
      case 'salary-components':   return data.records ?? [];
      case 'overtime':            return Array.isArray(data) ? data : [];
      default:                    return [];
    }
  });

  rowCount = computed(() => this.rows().length);

  paginatedRows = computed(() => {
    const all = this.rows();
    const start = (this.currentPage() - 1) * this.pageSize;
    return all.slice(start, start + this.pageSize);
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.rowCount() / this.pageSize)));

  pages = computed(() => {
    const total = this.totalPages();
    if (total <= 7) return Array.from({length: total}, (_, i) => i + 1);
    const cur = this.currentPage();
    const pages: (number|'...')[] = [1];
    if (cur > 3) pages.push('...');
    for (let i = Math.max(2, cur-1); i <= Math.min(total-1, cur+1); i++) pages.push(i);
    if (cur < total - 2) pages.push('...');
    pages.push(total);
    return pages;
  });

  goPage(p: number | '...') { if (typeof p === 'number') { this.currentPage.set(p); } }
  prevPage() { if (this.currentPage() > 1) this.currentPage.update(p => p - 1); }
  nextPage() { if (this.currentPage() < this.totalPages()) this.currentPage.update(p => p + 1); }

  usesMonthYear() {
    return ['attendance','payroll','ssc','salary-components'].includes(this.activeReport());
  }
  usesYear() {
    return ['income-tax','turnover'].includes(this.activeReport());
  }
  usesDateRange() {
    return ['leave','overtime','disciplinary'].includes(this.activeReport());
  }
  usesEmployeeFilter() {
    return !['headcount','turnover','compliance'].includes(this.activeReport());
  }
  usesStatusFilter() {
    return ['attendance','leave'].includes(this.activeReport());
  }
  usesLeaveTypeFilter()   { return this.activeReport() === 'leave'; }
  usesComplianceFilters() { return this.activeReport() === 'compliance'; }

  statusOptions(): {value: string; labelAr: string; labelEn: string}[] {
    const key = this.activeReport();
    if (key === 'attendance') {
      return [
        { value:'present', labelAr:'حاضر', labelEn:'Present' },
        { value:'late',    labelAr:'متأخر', labelEn:'Late' },
        { value:'absent',  labelAr:'غائب', labelEn:'Absent' },
      ];
    }
    if (key === 'leave') {
      return [
        { value:'pending',  labelAr:'معلق',  labelEn:'Pending' },
        { value:'approved', labelAr:'معتمد', labelEn:'Approved' },
        { value:'rejected', labelAr:'مرفوض', labelEn:'Rejected' },
      ];
    }
    return [];
  }

  orgNodeLabel(node: OrgNode) {
    return (this.lang === 'ar' ? node.nameAr : node.nameEn) || node.nameAr;
  }

  maxDeptCount = computed(() => {
    const data = this.reportData();
    if (!data?.byDepartment?.length) return 1;
    return Math.max(...data.byDepartment.map((d: any) => Number(d.count) || 0), 1);
  });

  trafficClass(light: string) {
    if (light === 'red')   return 'traffic-red';
    if (light === 'amber') return 'traffic-amber';
    if (light === 'green') return 'traffic-green';
    return '';
  }

  sscStatusLabel(s: string) {
    const map: Record<string,string> = { enrolled:'مسجّل', missing:'غير مسجّل', exempt:'معفى', 'n/a':'—' };
    return this.lang === 'ar' ? (map[s] ?? s) : s;
  }

  statusLabel(status: string) {
    const map: Record<string,string> = {
      active:'نشط', inactive:'غير نشط', resigned:'مستقيل', terminated:'منتهي الخدمة',
      draft:'مسودة', approved:'معتمد', pending:'معلق', rejected:'مرفوض',
      manager_approved:'موافقة المدير', present:'حاضر', late:'متأخر', absent:'غائب'
    };
    return this.lang === 'ar' ? (map[status] ?? status) : status;
  }

  empName(row: any) {
    return (this.lang === 'ar' ? row.nameAr : (row.nameEn || row.nameAr)) || row.nameAr || '';
  }

  orgName(row: any) {
    return (this.lang === 'ar'
      ? (row.orgNodeNameAr ?? row.departmentAr ?? row.deptAr)
      : (row.orgNodeNameEn ?? row.departmentEn ?? row.deptEn)) || '';
  }

  fmt3(n: any) {
    const v = parseFloat(n);
    return isNaN(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  }
}
