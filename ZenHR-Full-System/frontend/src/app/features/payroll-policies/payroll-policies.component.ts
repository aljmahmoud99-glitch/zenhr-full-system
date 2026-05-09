import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { LangService } from '../../core/services/lang.service';
import { ToastService } from '../../core/services/toast.service';

type ApiResponse<T> = { success: boolean; data: T; message?: string };

interface EmployeeOption {
  id: number;
  employeeCode?: string;
  firstNameAr?: string;
  middleNameAr?: string;
  lastNameAr?: string;
  firstNameEn?: string;
  middleNameEn?: string;
  lastNameEn?: string;
  fullNameAr?: string;
  fullNameEn?: string;
}

@Component({
  selector: 'app-payroll-policies',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payroll-policies.component.html',
  styleUrl: './payroll-policies.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PayrollPoliciesComponent implements OnInit {
  loading = false;
  saving = false;
  previewLoading = false;
  error = '';

  policy: any = this.defaultPolicy();
  rules: any[] = [];
  history: any[] = [];
  employees: EmployeeOption[] = [];
  selectedRule: any = null;
  preview: any = null;
  previewForm = {
    employeeId: null as number | null,
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    mode: ''
  };

  modes = [
    { value: 'fixed_30', ar: 'شهر ثابت 30 يوماً', en: 'Fixed 30-day month', helpAr: 'يتم احتساب المعدل اليومي على أساس الراتب / 30 دائماً.', helpEn: 'Daily rate is always salary / 30.' },
    { value: 'actual_calendar_days', ar: 'أيام الشهر الفعلية', en: 'Actual calendar days', helpAr: 'يستخدم عدد أيام الشهر الفعلي: 28 أو 29 أو 30 أو 31.', helpEn: 'Uses the actual days in the month: 28, 29, 30, or 31.' },
    { value: 'working_days_only', ar: 'أيام العمل فقط', en: 'Working days only', helpAr: 'يستبعد عطلات نهاية الأسبوع والعطل الرسمية من المقام.', helpEn: 'Excludes weekends and public holidays from the divisor.' },
    { value: 'hourly', ar: 'بالساعة', en: 'Hourly', helpAr: 'يحتسب الراتب من معدل الساعة مضروباً في ساعات العمل.', helpEn: 'Pay is hourly rate multiplied by worked hours.' },
  ];

  salaryBasisOptions = [
    { value: 'monthly', ar: 'شهري', en: 'Monthly' },
    { value: 'daily', ar: 'يومي', en: 'Daily' },
    { value: 'hourly', ar: 'بالساعة', en: 'Hourly' },
    { value: 'contract', ar: 'عقد', en: 'Contract' },
    { value: 'milestone', ar: 'إنجازات', en: 'Milestone' },
  ];

  dayLabels: Record<string, { ar: string; en: string }> = {
    sun: { ar: 'الأحد', en: 'Sun' },
    mon: { ar: 'الإثنين', en: 'Mon' },
    tue: { ar: 'الثلاثاء', en: 'Tue' },
    wed: { ar: 'الأربعاء', en: 'Wed' },
    thu: { ar: 'الخميس', en: 'Thu' },
    fri: { ar: 'الجمعة', en: 'Fri' },
    sat: { ar: 'السبت', en: 'Sat' },
  };

  constructor(
    public lang: LangService,
    private api: ApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
    this.loadEmployees();
  }

  t(ar: string, en: string): string {
    return this.lang.isAr ? ar : en;
  }

  label(item: any): string {
    if (!item) return '';
    return this.lang.isAr
      ? (item.labelAr || item.nameAr || item.fullNameAr || item.nameEn || item.fullNameEn || item.labelEn || item.code || '')
      : (item.labelEn || item.nameEn || item.fullNameEn || item.nameAr || item.fullNameAr || item.labelAr || item.code || '');
  }

  employeeLabel(emp: EmployeeOption): string {
    const ar = emp.fullNameAr || [emp.firstNameAr, emp.middleNameAr, emp.lastNameAr].filter(Boolean).join(' ');
    const en = emp.fullNameEn || [emp.firstNameEn, emp.middleNameEn, emp.lastNameEn].filter(Boolean).join(' ');
    return `${this.lang.isAr ? (ar || en) : (en || ar)}${emp.employeeCode ? ' / ' + emp.employeeCode : ''}`;
  }

  modeHelp(): string {
    const mode = this.modes.find(m => m.value === this.policy.salaryCalculationMode);
    return mode ? this.t(mode.helpAr, mode.helpEn) : '';
  }

  dayLabel(day: string): string {
    const item = this.dayLabels[day];
    return item ? this.t(item.ar, item.en) : day;
  }

  defaultPolicy(): any {
    return {
      salaryCalculationMode: 'fixed_30',
      defaultWorkingDaysPolicy: 'company_calendar',
      weekendDays: ['fri', 'sat'],
      roundingPolicy: 'nearest_0_001',
      dailyRatePrecision: 3,
      hourlyRatePrecision: 3,
      overtimePolicyMode: 'policy_rules',
      deductionPolicyMode: 'policy_rules',
      unpaidLeavePolicy: 'deduct_daily_rate',
      latenessDeductionPolicy: 'none',
      earlyLeaveDeductionPolicy: 'none',
      applyAttendanceToPayroll: false,
      applyOvertimeToPayroll: true,
      workingHoursPerDay: 8,
      manualWorkingDaysPerMonth: null,
      labelAr: 'سياسة الرواتب الأساسية',
      labelEn: 'Default payroll policy',
      notesAr: '',
      notesEn: ''
    };
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.api.get<ApiResponse<any>>('/api/payroll-policies')
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: res => {
          this.policy = { ...this.defaultPolicy(), ...(res.data?.policy || {}) };
          this.rules = res.data?.employmentTypeRules || [];
          this.selectedRule = this.rules[0] || null;
          this.loadHistory();
        },
        error: err => {
          this.error = err?.error?.message || this.t('تعذر تحميل سياسات الرواتب.', 'Unable to load payroll policies.');
        }
      });
  }

  loadEmployees(): void {
    this.api.get<ApiResponse<any[]>>('/api/employees', { pageSize: 100 })
      .subscribe({ next: res => {
        const data: any = res.data;
        this.employees = Array.isArray(data) ? data : (data?.items || []);
        if (!this.previewForm.employeeId && this.employees[0]) this.previewForm.employeeId = this.employees[0].id;
        this.cdr.markForCheck();
      }});
  }

  loadHistory(): void {
    this.api.get<ApiResponse<any[]>>('/api/payroll-policies/history')
      .subscribe({ next: res => { this.history = res.data || []; this.cdr.markForCheck(); } });
  }

  toggleWeekend(day: string): void {
    const set = new Set(this.policy.weekendDays || []);
    set.has(day) ? set.delete(day) : set.add(day);
    this.policy.weekendDays = Array.from(set);
  }

  savePolicy(): void {
    this.saving = true;
    this.api.put<ApiResponse<any>>('/api/payroll-policies', { ...this.policy, reasonEn: 'Updated from payroll policy screen' })
      .pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: res => {
          this.policy = { ...this.defaultPolicy(), ...res.data };
          this.toast.success(this.t('تم حفظ سياسة الرواتب.', 'Payroll policy saved.'));
          this.loadHistory();
        },
        error: err => this.toast.error(err?.error?.message || this.t('تعذر حفظ السياسة.', 'Unable to save policy.'))
      });
  }

  saveRule(): void {
    if (!this.selectedRule) return;
    this.saving = true;
    this.api.put<ApiResponse<any>>(`/api/payroll-policies/employment-types/${this.selectedRule.employmentType}`, this.selectedRule)
      .pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: res => {
          const idx = this.rules.findIndex(r => r.employmentType === res.data.employmentType);
          if (idx >= 0) this.rules[idx] = res.data;
          this.selectedRule = res.data;
          this.toast.success(this.t('تم حفظ قاعدة نوع التوظيف.', 'Employment type rule saved.'));
          this.loadHistory();
        },
        error: err => this.toast.error(err?.error?.message || this.t('تعذر حفظ قاعدة نوع التوظيف.', 'Unable to save employment type rule.'))
      });
  }

  runPreview(): void {
    if (!this.previewForm.employeeId) return;
    this.previewLoading = true;
    this.api.get<ApiResponse<any>>('/api/payroll-policies/preview', this.previewForm)
      .pipe(finalize(() => { this.previewLoading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: res => this.preview = res.data,
        error: err => this.toast.error(err?.error?.message || this.t('تعذر تنفيذ المعاينة.', 'Unable to run preview.'))
      });
  }
}
