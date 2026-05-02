import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ApiResponse, MONTHS_AR, MONTHS_EN, PayrollRun, Payslip } from '../../core/models';
import { SkeletonCardComponent } from '../../shared/components/skeleton/skeleton-card.component';
import { SkeletonKpiCardsComponent } from '../../shared/components/skeleton/skeleton-kpi-cards.component';
import { ConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog.component';
import { getErrorMessage } from '../../core/utils/error-message';
import { AppSettingsService } from '../../core/services/app-settings.service';

type PayrollStatus = 'draft' | 'approved' | 'paid' | 'unpaid' | string;

@Component({
  selector: 'app-payroll',
  standalone: true,
  imports: [CommonModule, FormsModule, SkeletonCardComponent, SkeletonKpiCardsComponent, ConfirmDialogComponent],
  templateUrl: './payroll.component.html',
  styleUrl: './payroll.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PayrollComponent implements OnInit {
  allPayrollRuns = signal<(PayrollRun & any)[]>([]);
  filteredPayrollRuns = signal<(PayrollRun & any)[]>([]);
  mySlips = signal<(Payslip & any)[]>([]);
  mySummary = signal<any | null>(null);
  allPayslips = signal<(Payslip & any)[]>([]);
  filteredPayslips = signal<(Payslip & any)[]>([]);
  selectedSlip = signal<(Payslip & any) | null>(null);

  loading = signal(true);
  loadingPayslips = signal(false);
  error = signal('');
  saving = signal(false);
  approvingRunId = signal<number | null>(null);
  confirmApproveRunId = signal<number | null>(null);
  selectedRunId = signal<number | null>(null);
  showCreateModal = signal(false);
  showSlipsModal = signal(false);
  showSlipDetailModal = signal(false);

  runForm = { month: new Date().getMonth() + 1, year: new Date().getFullYear() };
  runSearch = '';
  runStatusFilter = '';
  runMonthFilter = '';
  runYearFilter = '';

  payslipSearch = '';
  payslipDepartmentFilter = '';
  payslipStatusFilter = '';
  myPayslipSearch = '';
  myFromDate = '';
  myToDate = '';
  myStatusFilter = '';

  monthsAr = MONTHS_AR;
  monthsEn = MONTHS_EN;
  months = Array.from({ length: 12 }, (_, i) => i + 1);
  years = [2024, 2025, 2026, 2027];

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private toast: ToastService,
    private settings: AppSettingsService
  ) {}

  ngOnInit() {
    if (this.isAdmin) this.loadRuns();
    if (this.isEmployee) this.loadMySlips();
  }

  get lang() {
    return this.auth.lang;
  }

  get isAdmin() {
    return this.auth.hasRole('hradmin', 'payrolladmin');
  }

  get isPayrollAdmin() {
    return this.auth.hasRole('payrolladmin');
  }

  get isEmployee() {
    return this.auth.hasRole('employee');
  }

  readonly selectedRun = computed(() => this.allPayrollRuns().find(run => run.id === this.selectedRunId()) ?? null);

  readonly payslipDepartments = computed(() =>
    Array.from(
      new Set(
        this.allPayslips()
          .map(slip => this.orgUnitLabel(slip))
          .filter(Boolean)
      )
    )
  );

  readonly adminSummaryCards = computed(() => {
    const runs = this.allPayrollRuns();
    const latest = runs[0];
    return [
      {
        labelAr: 'آخر مسير',
        labelEn: 'Latest run',
        value: latest ? `${this.monthName(latest.runMonth)} ${latest.runYear}` : this.label('لا يوجد', 'None'),
        metaAr: latest ? `${this.label('الحالة', 'Status')}: ${this.statusLabel(latest.status)}` : this.label('ابدأ أول مسير', 'Create the first run'),
        metaEn: latest ? `${this.label('الحالة', 'Status')}: ${this.statusLabel(latest.status)}` : this.label('ابدأ أول مسير', 'Create the first run'),
        icon: 'receipt_long',
        tone: 'emerald'
      },
      {
        labelAr: 'إجمالي الرواتب',
        labelEn: 'Total gross',
        value: this.money(runs.reduce((sum, run) => sum + (run.totalGross || 0), 0)),
        metaAr: 'إجمالي المبالغ الإجمالية',
        metaEn: 'Total gross payroll',
        icon: 'payments',
        tone: 'neutral'
      },
      {
        labelAr: 'إجمالي الاستقطاعات',
        labelEn: 'Total deductions',
        value: this.money(runs.reduce((sum, run) => sum + (run.totalDeductions || 0), 0)),
        metaAr: 'ضمان وضريبة وخصومات وسلف',
        metaEn: 'SSC, tax, deductions, advances',
        icon: 'remove_circle_outline',
        tone: 'amber'
      },
      {
        labelAr: 'إجمالي الصافي',
        labelEn: 'Total net',
        value: this.money(runs.reduce((sum, run) => sum + (run.totalNet || 0), 0)),
        metaAr: 'صافي الرواتب بعد الخصم',
        metaEn: 'Net payroll after deductions',
        icon: 'account_balance_wallet',
        tone: 'emerald'
      }
    ];
  });

  readonly employeeSummaryCards = computed(() => {
    const summary = this.mySummary();
    const latest = summary?.lastPayslip;
    return [
      {
        labelAr: 'آخر كشف راتب',
        labelEn: 'Latest payslip',
        value: latest ? `${this.monthName(latest.periodMonth)} ${latest.periodYear}` : this.label('لم يصدر بعد', 'Not issued yet'),
        metaAr: latest ? `${this.monthName(latest.periodMonth)} ${latest.periodYear}` : this.label('سيظهر هنا عند الاعتماد', 'It appears after approval'),
        metaEn: latest ? `${this.monthName(latest.periodMonth)} ${latest.periodYear}` : this.label('سيظهر هنا عند الاعتماد', 'It appears after approval'),
        icon: 'description',
        tone: 'emerald'
      },
      {
        labelAr: 'إجمالي الاستحقاقات',
        labelEn: 'Total earnings',
        value: this.money(summary?.totalEarnings),
        metaAr: 'من آخر كشف معتمد',
        metaEn: 'From latest approved payslip',
        icon: 'payments',
        tone: 'neutral'
      },
      {
        labelAr: 'إجمالي الاستقطاعات',
        labelEn: 'Total deductions',
        value: this.money(summary?.totalDeductions),
        metaAr: 'من آخر كشف معتمد',
        metaEn: 'From latest approved payslip',
        icon: 'remove_circle_outline',
        tone: 'amber'
      },
      {
        labelAr: 'صافي الراتب',
        labelEn: 'Net salary',
        value: this.money(summary?.netSalary),
        metaAr: 'صافي آخر كشف معتمد',
        metaEn: 'Net from latest approved payslip',
        icon: 'paid',
        tone: 'emerald'
      }
    ];
  });

  readonly filteredMySlips = computed(() => {
    const search = this.myPayslipSearch.trim().toLowerCase();
    return this.mySlips().filter(slip => {
      if (!search) return true;
      const statusValue = this.statusLabel(slip.paymentStatus || slip.payrollRunStatus).toLowerCase();
      const periodValue = `${this.monthName(slip.periodMonth)} ${slip.periodYear}`.toLowerCase();
      return periodValue.includes(search) || statusValue.includes(search);
    });
  });

  hasRunFilters() {
    return !!(this.runSearch.trim() || this.runStatusFilter || this.runMonthFilter || this.runYearFilter);
  }

  hasPayslipFilters() {
    return !!(this.payslipSearch.trim() || this.payslipDepartmentFilter || this.payslipStatusFilter);
  }

  hasMyPayslipFilters() {
    return !!(this.myPayslipSearch.trim() || this.myFromDate || this.myToDate || this.myStatusFilter);
  }

  monthName(month: number) {
    return this.lang === 'ar' ? this.monthsAr[month] : this.monthsEn[month];
  }

  label(ar: string, en: string) {
    return this.lang === 'ar' ? ar : en;
  }

  money(value: number | undefined | null) {
    const currency = this.settings.currencyCode();
    return new Intl.NumberFormat(this.lang === 'ar' ? 'ar-JO' : 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 3,
      maximumFractionDigits: 3
    }).format(value ?? 0);
  }

  orgUnitLabel(slip: any) {
    return (this.lang === 'ar' ? slip?.orgNodeNameAr : slip?.orgNodeNameEn)
      || slip?.orgNodeNameAr
      || slip?.orgNodeNameEn
      || (this.lang === 'ar' ? slip?.departmentNameAr : slip?.departmentNameEn)
      || slip?.departmentNameAr
      || slip?.departmentNameEn
      || '';
  }

  statusLabel(status: string) {
    const map: Record<string, { ar: string; en: string }> = {
      draft: { ar: 'مسودة', en: 'Draft' },
      approved: { ar: 'معتمد', en: 'Approved' },
      paid: { ar: 'مدفوع', en: 'Paid' },
      pending: { ar: 'قيد الانتظار', en: 'Pending' },
      unpaid: { ar: 'غير مدفوع', en: 'Unpaid' }
    };
    return this.lang === 'ar' ? (map[status]?.ar ?? status) : (map[status]?.en ?? status);
  }

  statusClass(status: string) {
    const map: Record<string, string> = {
      draft: 'warning',
      approved: 'success',
      paid: 'success',
      unpaid: 'neutral'
    };
    return `z-badge ${map[status] ?? 'neutral'}`;
  }

  applyRunFilters() {
    const search = this.runSearch.trim().toLowerCase();
    const filtered = this.allPayrollRuns().filter(run => {
      const haystack = [
        run.createdByName,
        run.approvedByName,
        `${run.runMonth}`,
        `${run.runYear}`
      ].filter(Boolean).join(' ').toLowerCase();

      const matchesSearch = !search || haystack.includes(search);
      const matchesStatus = !this.runStatusFilter || run.status === this.runStatusFilter;
      const matchesMonth = !this.runMonthFilter || String(run.runMonth) === String(this.runMonthFilter);
      const matchesYear = !this.runYearFilter || String(run.runYear) === String(this.runYearFilter);

      return matchesSearch && matchesStatus && matchesMonth && matchesYear;
    });

    this.filteredPayrollRuns.set(filtered);
  }

  resetRunFilters() {
    this.runSearch = '';
    this.runStatusFilter = '';
    this.runMonthFilter = '';
    this.runYearFilter = '';
    this.applyRunFilters();
  }

  applyPayslipFilters() {
    const search = this.payslipSearch.trim().toLowerCase();
    const filtered = this.allPayslips().filter(slip => {
      const haystack = [
        slip.fullNameAr,
        slip.fullNameEn,
        slip.employeeCode,
        slip.orgNodeNameAr,
        slip.orgNodeNameEn,
        slip.departmentNameAr,
        slip.departmentNameEn
      ].filter(Boolean).join(' ').toLowerCase();

      const matchesSearch = !search || haystack.includes(search);
      const matchesDepartment =
        !this.payslipDepartmentFilter ||
        this.orgUnitLabel(slip) === this.payslipDepartmentFilter ||
        slip.departmentNameAr === this.payslipDepartmentFilter ||
        slip.departmentNameEn === this.payslipDepartmentFilter;
      const matchesStatus = !this.payslipStatusFilter || (slip.paymentStatus || slip.payrollRunStatus) === this.payslipStatusFilter;

      return matchesSearch && matchesDepartment && matchesStatus;
    });

    this.filteredPayslips.set(filtered);
  }

  resetPayslipFilters() {
    this.payslipSearch = '';
    this.payslipDepartmentFilter = '';
    this.payslipStatusFilter = '';
    this.applyPayslipFilters();
  }

  loadRuns() {
    this.loading.set(true);
    this.error.set('');
    this.api.get<ApiResponse<any[]>>('/api/payroll/runs').subscribe({
      next: response => {
        const sorted = [...(response.data ?? [])].sort((a, b) => (b.runYear - a.runYear) || (b.runMonth - a.runMonth));
        this.allPayrollRuns.set(sorted);
        this.applyRunFilters();
        this.loading.set(false);
      },
      error: error => {
        this.error.set(getErrorMessage(error, this.label('تعذر تحميل مسيرات الرواتب', 'Failed to load payroll runs')));
        this.loading.set(false);
      }
    });
  }

  loadMySlips() {
    this.loading.set(true);
    this.error.set('');
    this.api.get<ApiResponse<any[]>>('/api/payroll/slips/my', {
      fromDate: this.myFromDate || undefined,
      toDate: this.myToDate || undefined,
      status: this.myStatusFilter || undefined
    }).subscribe({
      next: response => {
        this.mySlips.set(response.data ?? []);
        this.loadMySummary();
        this.loading.set(false);
      },
      error: error => {
        this.error.set(getErrorMessage(error, this.label('تعذر تحميل كشوف الرواتب', 'Failed to load payslips')));
        this.loading.set(false);
      }
    });
  }

  loadMySummary() {
    this.api.get<ApiResponse<any>>('/api/payroll/slips/my/summary').subscribe({
      next: response => this.mySummary.set(response.data ?? null),
      error: () => this.mySummary.set(null)
    });
  }

  applyMyPayslipFilters() {
    this.loadMySlips();
  }

  resetMyPayslipFilters() {
    this.myPayslipSearch = '';
    this.myFromDate = '';
    this.myToDate = '';
    this.myStatusFilter = '';
    this.loadMySlips();
  }

  openCreate() {
    this.error.set('');
    this.showCreateModal.set(true);
  }

  closeCreate() {
    if (this.saving()) return;
    this.showCreateModal.set(false);
  }

  createRun() {
    if (this.saving()) return;
    this.error.set('');

    const duplicate = this.allPayrollRuns().some(run =>
      run.runMonth === this.runForm.month &&
      run.runYear === this.runForm.year &&
      run.status !== 'cancelled'
    );

    if (duplicate) {
      const message = this.label('يوجد مسير رواتب لهذا الشهر والسنة بالفعل.', 'A payroll run already exists for this month and year.');
      this.toast.warning(message);
      this.error.set(message);
      return;
    }

    this.saving.set(true);
    this.api.post<ApiResponse<any>>('/api/payroll/runs', this.runForm).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeCreate();
        this.toast.success(this.label('تم إنشاء مسير الرواتب بنجاح', 'Payroll run created successfully'));
        this.loadRuns();
      },
      error: error => {
        const message = getErrorMessage(error, this.label('حدث خطأ أثناء إنشاء المسير', 'Failed to create payroll run'));
        this.saving.set(false);
        this.error.set(message);
        this.toast.error(message);
      }
    });
  }

  viewSlips(runId: number) {
    this.selectedRunId.set(runId);
    this.loadingPayslips.set(true);
    this.api.get<ApiResponse<any[]>>(`/api/payroll/runs/${runId}/payslips`).subscribe({
      next: response => {
        this.allPayslips.set(response.data ?? []);
        this.applyPayslipFilters();
        this.loadingPayslips.set(false);
        this.showSlipsModal.set(true);
      },
      error: error => {
        this.loadingPayslips.set(false);
        this.toast.error(getErrorMessage(error, this.label('تعذر تحميل كشوف الرواتب', 'Failed to load payslips')));
      }
    });
  }

  closeSlips() {
    this.showSlipsModal.set(false);
    this.allPayslips.set([]);
    this.filteredPayslips.set([]);
    this.resetPayslipFilters();
  }

  openSlipDetail(id: number) {
    this.api.get<ApiResponse<any>>(`/api/payroll/slips/${id}`).subscribe({
      next: response => {
        this.selectedSlip.set(response.data);
        this.showSlipDetailModal.set(true);
      },
      error: error => {
        this.toast.error(getErrorMessage(error, this.label('تعذر تحميل كشف الراتب', 'Failed to load payslip')));
      }
    });
  }

  closeSlipDetail() {
    this.showSlipDetailModal.set(false);
    this.selectedSlip.set(null);
  }

  approve(id: number) {
    if (this.approvingRunId() === id) return;
    this.confirmApproveRunId.set(id);
  }

  closeApproveDialog() {
    if (this.confirmApproveRunId() !== null && this.approvingRunId() !== this.confirmApproveRunId()) {
      this.confirmApproveRunId.set(null);
    }
  }

  submitApprove() {
    const id = this.confirmApproveRunId();
    if (!id || this.approvingRunId() === id) return;

    this.approvingRunId.set(id);
    this.api.post<ApiResponse<any>>(`/api/payroll/runs/${id}/approve`, {}).subscribe({
      next: () => {
        this.approvingRunId.set(null);
        this.confirmApproveRunId.set(null);
        this.toast.success(this.label('تم اعتماد المسير بنجاح', 'Payroll run approved successfully'));
        this.loadRuns();
      },
      error: error => {
        this.approvingRunId.set(null);
        this.toast.error(getErrorMessage(error, this.label('تعذر اعتماد المسير', 'Failed to approve payroll run')));
      }
    });
  }

  printRun(run: any) {
    const popup = window.open('', '_blank', 'width=980,height=760');
    if (!popup) return;
    popup.document.write(`
      <html lang="${this.lang}" dir="${this.lang === 'ar' ? 'rtl' : 'ltr'}">
        <head>
          <title>${this.label('ملخص مسير الرواتب', 'Payroll run summary')}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1 { margin: 0 0 10px; }
            .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 18px; }
            .card { border: 1px solid #d9e4dc; border-radius: 14px; padding: 14px; }
            .label { font-size: 12px; color: #666; margin-bottom: 6px; }
            .value { font-weight: 700; }
          </style>
        </head>
        <body>
          <h1>${this.label('ملخص مسير الرواتب', 'Payroll run summary')}</h1>
          <div class="grid">
            <div class="card"><div class="label">${this.label('الفترة', 'Period')}</div><div class="value">${this.monthName(run.runMonth)} ${run.runYear}</div></div>
            <div class="card"><div class="label">${this.label('الحالة', 'Status')}</div><div class="value">${this.statusLabel(run.status)}</div></div>
            <div class="card"><div class="label">${this.label('عدد الموظفين', 'Employee count')}</div><div class="value">${run.employeeCount ?? 0}</div></div>
            <div class="card"><div class="label">${this.label('إجمالي الرواتب', 'Gross total')}</div><div class="value">${this.money(run.totalGross)}</div></div>
            <div class="card"><div class="label">${this.label('إجمالي الاستقطاعات', 'Total deductions')}</div><div class="value">${this.money(run.totalDeductions)}</div></div>
            <div class="card"><div class="label">${this.label('إجمالي الصافي', 'Net total')}</div><div class="value">${this.money(run.totalNet)}</div></div>
            <div class="card"><div class="label">${this.label('أنشئ بواسطة', 'Created by')}</div><div class="value">${run.createdByName || '—'}</div></div>
            <div class="card"><div class="label">${this.label('اعتمد بواسطة', 'Approved by')}</div><div class="value">${run.approvedByName || '—'}</div></div>
          </div>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  printSlip(slip?: any) {
    const current = slip ?? this.selectedSlip();
    if (!current) return;
    const popup = window.open('', '_blank', 'width=980,height=760');
    if (!popup) return;
    popup.document.write(`
      <html lang="${this.lang}" dir="${this.lang === 'ar' ? 'rtl' : 'ltr'}">
        <head>
          <title>${this.label('كشف راتب', 'Payslip')}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1 { margin: 0 0 10px; }
            .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 18px; }
            .card { border: 1px solid #d9e4dc; border-radius: 14px; padding: 14px; }
            .label { font-size: 12px; color: #666; margin-bottom: 6px; }
            .value { font-weight: 700; }
          </style>
        </head>
        <body>
          <h1>${this.label('كشف راتب', 'Payslip')}</h1>
          <div class="grid">
            <div class="card"><div class="label">${this.label('الموظف', 'Employee')}</div><div class="value">${this.lang === 'ar' ? current.fullNameAr : current.fullNameEn}</div></div>
            <div class="card"><div class="label">${this.label('الرقم الوظيفي', 'Employee code')}</div><div class="value">${current.employeeCode || '—'}</div></div>
            <div class="card"><div class="label">${this.label('الوحدة', 'Org Unit')}</div><div class="value">${this.orgUnitLabel(current) || '—'}</div></div>
            <div class="card"><div class="label">${this.label('الفترة', 'Payroll month')}</div><div class="value">${this.monthName(current.periodMonth)} ${current.periodYear}</div></div>
            <div class="card"><div class="label">${this.label('الإجمالي', 'Gross salary')}</div><div class="value">${this.money(current.grossSalary)}</div></div>
            <div class="card"><div class="label">${this.label('إضافي', 'Overtime')}</div><div class="value">${this.money(current.overtimeAmount)}</div></div>
            <div class="card"><div class="label">${this.label('الاستقطاعات', 'Deductions')}</div><div class="value">${this.money(current.totalDeductions)}</div></div>
            <div class="card"><div class="label">${this.label('الصافي', 'Net salary')}</div><div class="value">${this.money(current.netSalary)}</div></div>
            <div class="card"><div class="label">SSC</div><div class="value">${this.money(current.sscDeduction)}</div></div>
            <div class="card"><div class="label">${this.label('الضريبة', 'Tax')}</div><div class="value">${this.money(current.incomeTaxDeduction)}</div></div>
            <div class="card"><div class="label">${this.label('السلفة', 'Advance deduction')}</div><div class="value">${this.money(current.advanceDeduction)}</div></div>
            <div class="card"><div class="label">${this.label('حالة الدفع', 'Payment status')}</div><div class="value">${this.statusLabel(current.paymentStatus || current.payrollRunStatus)}</div></div>
          </div>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  openCreateForMonth(month: number, year: number) {
    this.runForm = { month, year };
    this.openCreate();
  }

  slipEarnings(slip: any) {
    return [
      { labelAr: 'الراتب الأساسي', labelEn: 'Basic salary', value: slip.basicSalary },
      { labelAr: 'بدل السكن', labelEn: 'Housing', value: slip.housingAllowance },
      { labelAr: 'بدل المواصلات', labelEn: 'Transport', value: slip.transportAllowance },
      { labelAr: 'بدل الجوال', labelEn: 'Mobile', value: slip.mobileAllowance },
      { labelAr: 'بدل الوجبات', labelEn: 'Meals', value: slip.mealAllowance },
      { labelAr: 'بدلات أخرى', labelEn: 'Other allowances', value: slip.otherAllowances },
      { labelAr: 'عمل إضافي', labelEn: 'Overtime', value: slip.overtimeAmount }
    ].filter(item => (item.value || 0) !== 0);
  }

  slipDeductions(slip: any) {
    return [
      { labelAr: 'ضمان اجتماعي', labelEn: 'SSC', value: slip.sscDeduction },
      { labelAr: 'ضريبة دخل', labelEn: 'Income tax', value: slip.incomeTaxDeduction },
      { labelAr: 'غياب', labelEn: 'Absence deduction', value: slip.absenceDeduction },
      { labelAr: 'تأخير', labelEn: 'Late deduction', value: slip.lateDeduction },
      { labelAr: 'سلفة', labelEn: 'Advance deduction', value: slip.advanceDeduction },
      { labelAr: 'جزاءات', labelEn: 'Penalties', value: slip.otherDeductions }
    ].filter(item => (item.value || 0) !== 0);
  }
}
