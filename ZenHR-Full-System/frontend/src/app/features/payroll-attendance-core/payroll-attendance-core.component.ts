import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiResponse } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { LangService } from '../../core/services/lang.service';
import { RoleAccessService } from '../../core/services/role-access.service';
import { ToastService } from '../../core/services/toast.service';

type TabKey = 'dashboard' | 'adjustments' | 'recurring' | 'approvals' | 'violations' | 'shifts' | 'preview' | 'audit';

interface Option {
  id: number;
  nameAr?: string;
  nameEn?: string;
  fullNameAr?: string;
  fullNameEn?: string;
  employeeCode?: string;
  code?: string;
}

@Component({
  selector: 'app-payroll-attendance-core',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payroll-attendance-core.component.html',
  styleUrl: './payroll-attendance-core.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PayrollAttendanceCoreComponent implements OnInit {
  activeTab: TabKey = 'dashboard';
  loading = false;
  saving = false;
  error = '';
  query = '';

  dashboard: any = null;
  adjustments: any[] = [];
  recurring: any[] = [];
  approvals: any[] = [];
  violations: any[] = [];
  patterns: any[] = [];
  schedules: any[] = [];
  audit: any[] = [];
  preview: any = null;
  types: any[] = [];
  employees: Option[] = [];
  departments: Option[] = [];

  drawer = false;
  shiftDrawer = false;
  page = 1;
  pageSize = 20;
  totalPages = 1;

  form = {
    employeeId: null as number | null,
    adjustmentTypeId: null as number | null,
    direction: 'add',
    calculationMode: 'after_net',
    recurrenceType: 'one_time',
    amount: 50,
    effectiveDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    payrollMonth: new Date().getMonth() + 1,
    payrollYear: new Date().getFullYear(),
    installmentCount: 0,
    titleAr: '',
    titleEn: '',
    reasonAr: '',
    reasonEn: ''
  };

  shiftForm = {
    code: '',
    nameAr: '',
    nameEn: '',
    shiftType: 'fixed',
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 60,
    graceInMinutes: 10,
    graceOutMinutes: 10
  };

  readonly tabs: Array<{ key: TabKey; icon: string; ar: string; en: string }> = [
    { key: 'dashboard', icon: 'analytics', ar: 'لوحة التشغيل', en: 'Dashboard' },
    { key: 'adjustments', icon: 'price_change', ar: 'تعديلات الرواتب', en: 'Adjustments' },
    { key: 'recurring', icon: 'event_repeat', ar: 'المتكررة والأقساط', en: 'Recurring' },
    { key: 'approvals', icon: 'approval', ar: 'الاعتمادات', en: 'Approvals' },
    { key: 'violations', icon: 'warning', ar: 'مخالفات الحضور', en: 'Violations' },
    { key: 'shifts', icon: 'calendar_month', ar: 'جدولة الورديات', en: 'Shifts' },
    { key: 'preview', icon: 'calculate', ar: 'معاينة الأثر', en: 'Impact Preview' },
    { key: 'audit', icon: 'history', ar: 'سجل التدقيق', en: 'Audit' },
  ];

  constructor(
    public lang: LangService,
    public access: RoleAccessService,
    private api: ApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadBootstrap();
    this.loadAll();
  }

  get canManage(): boolean {
    return this.access.isAny('hradmin', 'payrolladmin');
  }

  private readonly arByEn: Record<string, string> = {
    Dashboard: 'لوحة التشغيل',
    Adjustments: 'تعديلات الرواتب',
    Recurring: 'المتكررة والأقساط',
    Approvals: 'الاعتمادات',
    Violations: 'مخالفات الحضور',
    Shifts: 'جدولة الورديات',
    'Impact Preview': 'معاينة الأثر',
    Audit: 'سجل التدقيق'
  };

  t(ar: string, en: string): string {
    return this.lang.isAr ? (this.arByEn[en] || ar) : en;
  }

  activeTabLabel(): string {
    const tab = this.tabs.find(item => item.key === this.activeTab);
    return tab ? this.t(tab.ar, tab.en) : '';
  }

  label(item: any): string {
    if (!item) return '';
    return this.lang.isAr
      ? (item.nameAr || item.fullNameAr || item.titleAr || item.nameEn || item.fullNameEn || item.titleEn || item.code)
      : (item.nameEn || item.fullNameEn || item.titleEn || item.nameAr || item.fullNameAr || item.titleAr || item.code);
  }

  setTab(tab: TabKey): void {
    this.activeTab = tab;
    this.loadActive();
  }

  loadBootstrap(): void {
    this.api.get<ApiResponse<any[]>>('/api/payroll-adjustments/types').subscribe({ next: r => { this.types = r.data ?? []; this.cdr.markForCheck(); }, error: e => this.setError(e, false) });
    this.api.get<ApiResponse<any[]>>('/api/employees').subscribe({ next: r => { this.employees = r.data ?? []; this.cdr.markForCheck(); }, error: e => this.setError(e, false) });
    this.api.get<ApiResponse<any[]>>('/api/departments').subscribe({ next: r => { this.departments = r.data ?? []; this.cdr.markForCheck(); }, error: e => this.setError(e, false) });
  }

  loadAll(): void {
    this.loadDashboard();
    this.loadAdjustments();
    if (this.canManage) this.loadRecurring();
    this.loadApprovals();
    this.loadViolations();
    this.loadShifts();
    if (this.canManage) this.loadAudit();
  }

  loadActive(): void {
    const map: Record<TabKey, () => void> = {
      dashboard: () => this.loadDashboard(),
      adjustments: () => this.loadAdjustments(),
      recurring: () => this.loadRecurring(),
      approvals: () => this.loadApprovals(),
      violations: () => this.loadViolations(),
      shifts: () => this.loadShifts(),
      preview: () => this.runPreview(),
      audit: () => this.loadAudit(),
    };
    map[this.activeTab]();
  }

  loadDashboard(): void {
    this.loading = this.activeTab === 'dashboard';
    this.api.get<ApiResponse<any>>('/api/payroll-attendance/dashboard')
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({ next: r => this.dashboard = r.data, error: e => this.setError(e) });
  }

  loadAdjustments(): void {
    this.loading = this.activeTab === 'adjustments';
    this.api.get<any>('/api/payroll-adjustments', { page: this.page, pageSize: this.pageSize, q: this.query })
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({ next: r => { this.adjustments = r.data ?? []; this.totalPages = r.meta?.totalPages ?? 1; }, error: e => this.setError(e) });
  }

  loadRecurring(): void {
    this.loading = this.activeTab === 'recurring';
    this.api.get<ApiResponse<any[]>>('/api/payroll-adjustments/recurring')
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({ next: r => this.recurring = r.data ?? [], error: e => this.setError(e) });
  }

  loadApprovals(): void {
    this.loading = this.activeTab === 'approvals';
    this.api.get<ApiResponse<any[]>>('/api/payroll-adjustments/approvals')
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({ next: r => this.approvals = r.data ?? [], error: e => this.setError(e) });
  }

  loadViolations(): void {
    this.loading = this.activeTab === 'violations';
    this.api.get<ApiResponse<any[]>>('/api/attendance-intelligence/violations')
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({ next: r => this.violations = r.data ?? [], error: e => this.setError(e) });
  }

  loadShifts(): void {
    this.loading = this.activeTab === 'shifts';
    this.api.get<ApiResponse<any[]>>('/api/shift-scheduler/patterns')
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({ next: r => this.patterns = r.data ?? [], error: e => this.setError(e) });
    this.api.get<ApiResponse<any[]>>('/api/shift-scheduler/schedules').subscribe({ next: r => { this.schedules = r.data ?? []; this.cdr.markForCheck(); }, error: e => this.setError(e, false) });
  }

  loadAudit(): void {
    this.loading = this.activeTab === 'audit';
    this.api.get<ApiResponse<any[]>>('/api/payroll-audit/history')
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({ next: r => this.audit = r.data ?? [], error: e => this.setError(e) });
  }

  search(): void {
    this.page = 1;
    this.loadAdjustments();
  }

  runPreview(): void {
    if (!this.form.employeeId || !this.form.adjustmentTypeId || !this.form.amount) return;
    this.loading = this.activeTab === 'preview';
    this.api.post<ApiResponse<any>>('/api/payroll-adjustments/preview', this.form)
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({ next: r => this.preview = r.data, error: e => this.setError(e) });
  }

  saveAdjustment(): void {
    if (!this.form.employeeId || !this.form.adjustmentTypeId || this.form.amount <= 0) {
      this.toast.warning(this.t('اختر الموظف ونوع التعديل وأدخل مبلغاً صحيحاً', 'Select employee, type, and a valid amount'));
      return;
    }
    this.saving = true;
    this.api.post<ApiResponse<any>>('/api/payroll-adjustments', this.form)
      .pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => { this.toast.success(this.t('تم حفظ تعديل الراتب', 'Payroll adjustment saved')); this.drawer = false; this.loadAll(); },
        error: e => this.setError(e)
      });
  }

  approve(row: any): void {
    this.api.patch<ApiResponse<any>>(`/api/payroll-adjustments/${row.payrollAdjustmentId || row.id}/approve`, {})
      .subscribe({ next: () => { this.toast.success(this.t('تم الاعتماد', 'Approved')); this.loadAll(); }, error: e => this.setError(e) });
  }

  processAttendance(): void {
    this.saving = true;
    this.api.post<ApiResponse<any>>('/api/attendance-intelligence/process', {})
      .pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({ next: () => { this.toast.success(this.t('تم تحليل الحضور', 'Attendance processed')); this.loadViolations(); this.loadDashboard(); }, error: e => this.setError(e) });
  }

  saveShift(): void {
    if (!this.shiftForm.code || !this.shiftForm.nameAr || !this.shiftForm.nameEn) {
      this.toast.warning(this.t('أدخل الكود والاسمين العربي والإنجليزي', 'Enter code, Arabic name, and English name'));
      return;
    }
    this.saving = true;
    this.api.post<ApiResponse<any>>('/api/shift-scheduler/patterns', this.shiftForm)
      .pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({ next: () => { this.toast.success(this.t('تم حفظ الوردية', 'Shift saved')); this.shiftDrawer = false; this.loadShifts(); }, error: e => this.setError(e) });
  }

  private setError(err: any, toast = true): void {
    this.error = err?.error?.message || this.t('تعذر تحميل بيانات حزمة الرواتب والحضور', 'Unable to load payroll and attendance core data');
    if (toast) this.toast.error(this.error);
    this.cdr.markForCheck();
  }
}
