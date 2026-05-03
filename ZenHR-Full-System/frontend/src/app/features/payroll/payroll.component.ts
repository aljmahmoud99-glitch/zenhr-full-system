import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { RoleAccessService } from '../../core/services/role-access.service';
import { ToastService } from '../../core/services/toast.service';
import { ApiResponse, MONTHS_AR, MONTHS_EN, PayrollRun, Payslip } from '../../core/models';
import { SkeletonCardComponent } from '../../shared/components/skeleton/skeleton-card.component';
import { SkeletonKpiCardsComponent } from '../../shared/components/skeleton/skeleton-kpi-cards.component';
import { ConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog.component';
import { getErrorMessage } from '../../core/utils/error-message';
import { openPrintDoc } from '../../core/utils/print-doc.util';
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
    private settings: AppSettingsService,
    private access: RoleAccessService
  ) {}

  ngOnInit() {
    if (this.isAdmin) this.loadRuns();
    if (this.isEmployee) this.loadMySlips();
  }

  get lang() {
    return this.auth.lang;
  }

  get isAdmin() {
    return this.access.isAny('hradmin', 'payrolladmin');
  }

  get isPayrollAdmin() {
    return this.access.isAny('payrolladmin');
  }

  get isEmployee() {
    return this.access.isEmployee();
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
    return new Intl.NumberFormat(this.lang === 'ar' ? 'ar-JO-u-nu-latn' : 'en-US', {
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
    openPrintDoc({
      lang: this.lang as 'ar' | 'en',
      docType: 'PAYRUN',
      title: this.label('ملخص مسير الرواتب', 'Payroll Run Summary'),
      subtitle: `${this.monthName(run.runMonth)} ${run.runYear}`,
      fields: [
        { label: this.label('فترة المسير', 'Payroll Period'), value: `${this.monthName(run.runMonth)} ${run.runYear}` },
        { label: this.label('الحالة', 'Status'), value: this.statusLabel(run.status) },
        { label: this.label('عدد الموظفين', 'Employee Count'), value: String(run.employeeCount ?? 0) },
        { label: this.label('إجمالي الرواتب', 'Gross Total'), value: this.money(run.totalGross) },
        { label: this.label('إجمالي الاستقطاعات', 'Total Deductions'), value: this.money(run.totalDeductions) },
        { label: this.label('إجمالي الصافي', 'Net Total'), value: this.money(run.totalNet) },
        { label: this.label('أنشئ بواسطة', 'Created By'), value: run.createdByName || '—' },
        { label: this.label('اعتمد بواسطة', 'Approved By'), value: run.approvedByName || '—' },
        { label: this.label('تاريخ الاعتماد', 'Approval Date'), value: run.approvedAt ? new Date(run.approvedAt).toLocaleDateString(this.lang === 'ar' ? 'ar-JO-u-nu-latn' : 'en-US') : '—' },
      ],
      summaryLabel: this.label('إجمالي الصافي', 'Net Total'),
      summaryValue: this.money(run.totalNet),
      signatures: [
        { label: this.label('توقيع مدير الرواتب', 'Payroll Manager Signature') },
        { label: this.label('توقيع المدير المالي', 'Finance Director Signature') },
      ],
    });
  }

  printSlip(slip?: any) {
    const current = slip ?? this.selectedSlip();
    if (!current) return;

    const empName = this.lang === 'ar' ? (current.fullNameAr || current.fullNameEn) : (current.fullNameEn || current.fullNameAr);
    const period = `${this.monthName(current.periodMonth)} ${current.periodYear}`;

    const earningRows: string[][] = [
      [this.label('الراتب الأساسي', 'Basic Salary'), this.money(current.basicSalary)],
    ];
    if (parseFloat(current.housingAllowance ?? 0) > 0) earningRows.push([this.label('بدل السكن', 'Housing Allowance'), this.money(current.housingAllowance)]);
    if (parseFloat(current.transportAllowance ?? 0) > 0) earningRows.push([this.label('بدل المواصلات', 'Transport Allowance'), this.money(current.transportAllowance)]);
    if (parseFloat(current.mobileAllowance ?? 0) > 0) earningRows.push([this.label('بدل الجوال', 'Mobile Allowance'), this.money(current.mobileAllowance)]);
    if (parseFloat(current.mealAllowance ?? 0) > 0) earningRows.push([this.label('بدل الوجبات', 'Meal Allowance'), this.money(current.mealAllowance)]);
    if (parseFloat(current.otherAllowances ?? 0) > 0) earningRows.push([this.label('بدلات أخرى', 'Other Allowances'), this.money(current.otherAllowances)]);
    if (parseFloat(current.overtimeAmount ?? 0) > 0) earningRows.push([this.label('أجر إضافي', 'Overtime'), this.money(current.overtimeAmount)]);
    earningRows.push([this.label('الإجمالي', 'Gross Salary'), this.money(current.grossSalary)]);

    const deductRows: string[][] = [
      [this.label('ضمان اجتماعي (7.5%)', 'SSC Employee (7.5%)'), this.money(current.sscEmployeeDeduction ?? current.sscDeduction)],
      [this.label('ضريبة الدخل', 'Income Tax'), this.money(current.incomeTaxDeduction)],
    ];
    if (parseFloat(current.advanceDeduction ?? 0) > 0) deductRows.push([this.label('خصم سلفة', 'Advance Deduction'), this.money(current.advanceDeduction)]);
    if (parseFloat(current.otherDeductions ?? 0) > 0) deductRows.push([this.label('استقطاعات أخرى', 'Other Deductions'), this.money(current.otherDeductions)]);
    deductRows.push([this.label('إجمالي الاستقطاعات', 'Total Deductions'), this.money(current.totalDeductions)]);

    openPrintDoc({
      lang: this.lang as 'ar' | 'en',
      docType: 'PAYSLIP',
      title: this.label('كشف الراتب', 'Payslip'),
      subtitle: period,
      fields: [
        { label: this.label('الموظف', 'Employee'), value: empName },
        { label: this.label('الرقم الوظيفي', 'Employee Code'), value: current.employeeCode || '—' },
        { label: this.label('الوحدة التنظيمية', 'Org Unit'), value: this.orgUnitLabel(current) || '—' },
        { label: this.label('فترة الراتب', 'Pay Period'), value: period },
        { label: this.label('حالة الدفع', 'Payment Status'), value: this.statusLabel(current.paymentStatus || current.payrollRunStatus) },
      ],
      tableHeaders: [this.label('البند', 'Item'), this.label('المبلغ', 'Amount')],
      tableRows: [...earningRows, ['', ''], ...deductRows],
      summaryLabel: this.label('صافي الراتب', 'Net Salary'),
      summaryValue: this.money(current.netSalary),
      signatures: [
        { label: this.label('توقيع مدير الرواتب', 'Payroll Manager') },
        { label: this.label('توقيع الموظف / إقرار الاستلام', 'Employee Signature / Receipt') },
      ],
    });
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
