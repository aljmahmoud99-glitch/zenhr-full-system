import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiResponse } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { SkeletonCardComponent } from '../../shared/components/skeleton/skeleton-card.component';
import { SkeletonKpiCardsComponent } from '../../shared/components/skeleton/skeleton-kpi-cards.component';
import { SkeletonTableComponent } from '../../shared/components/skeleton/skeleton-table.component';
import { ConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog.component';
import { RejectReasonDialogComponent } from '../../shared/components/ui/reject-reason-dialog.component';
import { getErrorMessage } from '../../core/utils/error-message';
import { AppSettingsService } from '../../core/services/app-settings.service';
import { RoleAccessService } from '../../core/services/role-access.service';

type AdvanceStatus = 'pending' | 'approved' | 'rejected' | 'deducted' | 'partially_deducted';
type RepaymentMethod = 'monthly' | 'one_time';

interface AdvanceItem {
  id: number;
  employeeId: number;
  employeeNameAr: string;
  employeeNameEn: string;
  employeeCode: string;
  departmentAr: string;
  departmentEn: string;
  orgNodeNameAr?: string;
  orgNodeNameEn?: string;
  requestedAmount: number;
  approvedAmount?: number | null;
  reason: string;
  requestDate: string;
  status: AdvanceStatus | string;
  repaymentMethod: RepaymentMethod | string;
  repaymentPlan?: string | null;
  remainingBalance: number;
  requestNotes?: string | null;
  decisionNotes?: string | null;
  rejectionReason?: string | null;
}

interface RequestFormState {
  requestedAmount: number | null;
  reason: string;
  repaymentMethod: RepaymentMethod;
  notes: string;
}

@Component({
  selector: 'app-advances',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SkeletonCardComponent,
    SkeletonKpiCardsComponent,
    SkeletonTableComponent,
    ConfirmDialogComponent,
    RejectReasonDialogComponent
  ],
  templateUrl: './advances.component.html',
  styleUrl: './advances.component.scss'
})
export class AdvancesComponent implements OnInit {
  readonly allAdvances = signal<AdvanceItem[]>([]);
  readonly filteredAdvances = signal<AdvanceItem[]>([]);
  readonly selectedAdvance = signal<AdvanceItem | null>(null);
  readonly employeeSummary = signal<{ totalRequests: number; pendingRequests: number; approvedAmount: number }>({
    totalRequests: 0,
    pendingRequests: 0,
    approvedAmount: 0
  });

  readonly loading = signal(true);
  readonly submittingRequest = signal(false);
  readonly actionLoadingId = signal<number | null>(null);
  readonly notification = signal('');
  readonly error = signal('');
  readonly formError = signal('');
  readonly rejectDialogError = signal('');

  readonly requestModalOpen = signal(false);
  readonly detailModalOpen = signal(false);
  readonly confirmApproveOpen = signal(false);
  readonly rejectDialogOpen = signal(false);

  searchTerm = '';
  statusFilter = '';
  repaymentMethodFilter = '';
  orgUnitFilter = '';
  dateFrom = '';
  dateTo = '';

  detailApprovedAmount: number | null = null;
  detailRepaymentPlan = '';
  detailDecisionNotes = '';

  requestForm: RequestFormState = this.createEmptyRequestForm();

  readonly departments = computed(() =>
    Array.from(
      new Set(
        this.allAdvances()
          .flatMap(item => [item.orgNodeNameAr, item.orgNodeNameEn, item.departmentAr, item.departmentEn])
          .filter(Boolean)
      )
    )
  );

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private toast: ToastService,
    private router: Router,
    private settings: AppSettingsService,
    private access: RoleAccessService
  ) {}

  ngOnInit(): void {
    this.loadAdvances();
  }

  get lang(): 'ar' | 'en' {
    return this.auth.lang === 'en' ? 'en' : 'ar';
  }

  get isArabic(): boolean {
    return this.lang === 'ar';
  }

  get currentRole(): string {
    return this.auth.currentUser()?.role ?? 'employee';
  }

  get isEmployee(): boolean {
    return this.auth.currentUser()?.role === 'employee';
  }

  get currentEmployeeId(): number {
    return this.auth.currentUser()?.employeeId ?? 0;
  }

  get isAdminView(): boolean {
    return this.access.canDoAction('advance:viewAll');
  }

  get canManageAdvances(): boolean {
    return this.access.canDoAction('advance:approve') || this.access.canDoAction('advance:reject');
  }

  get canSubmitAdvance(): boolean {
    return this.access.canDoAction('advance:create:mine') && this.currentEmployeeId > 0;
  }

  get screenTitle(): string {
    return this.isAdminView ? this.t('hrTitle') : this.t('employeeTitle');
  }

  get screenSubtitle(): string {
    return this.isAdminView ? this.t('hrSubtitle') : this.t('employeeSubtitle');
  }

  get hasActiveFilters(): boolean {
    return !!(
      this.searchTerm.trim() ||
      this.statusFilter ||
      this.repaymentMethodFilter ||
      this.orgUnitFilter ||
      this.dateFrom ||
      this.dateTo
    );
  }

  get adminSummary() {
    const items = this.allAdvances();
    return {
      totalRequests: items.length,
      pendingRequests: items.filter(item => item.status === 'pending').length,
      approvedAmount: items.reduce((sum, item) => sum + (item.approvedAmount ?? 0), 0),
      activeEmployees: new Set(items.filter(item => (item.remainingBalance ?? 0) > 0).map(item => item.employeeId)).size
    };
  }

  t(key: string): string {
    const dict: Record<string, { ar: string; en: string }> = {
      employeeTitle: { ar: 'السلف الشخصية', en: 'My Salary Advances' },
      employeeSubtitle: { ar: 'تابع طلبات السلف الخاصة بك وتقدم الطلبات الجديدة مع حالة الموافقة والخصم.', en: 'Track your advance requests and submit new ones with approval and payroll visibility.' },
      hrTitle: { ar: 'إدارة سلف الرواتب', en: 'Salary Advances Management' },
      hrSubtitle: { ar: 'لوحة موحدة لمراجعة الطلبات وربطها بملف الموظف والرواتب.', en: 'A unified screen to review requests and connect them to employee profile and payroll.' },
      requestNew: { ar: 'طلب سلفة جديدة', en: 'New Advance Request' },
      requestFormTitle: { ar: 'طلب سلفة راتب', en: 'Salary Advance Request' },
      requestFormSubtitle: { ar: 'أدخل تفاصيل الطلب وسيظهر لفريق الموارد البشرية فوراً.', en: 'Enter the request details and it will appear to HR immediately.' },
      detailsTitle: { ar: 'تفاصيل السلفة', en: 'Advance Details' },
      summaryCards: { ar: 'ملخص السلف', en: 'Advances Summary' },
      filtersTitle: { ar: 'البحث والتصفية', en: 'Search & Filters' },
      filtersSubtitleEmployee: { ar: 'صفِّ حسب الحالة والطريقة والتاريخ.', en: 'Filter by status, method, and date.' },
      filtersSubtitleHr: { ar: 'ابحث حسب الموظف أو القسم أو رقم الموظف، وصفِّ حسب الحالة والطريقة والتاريخ.', en: 'Search by employee, department, or code, then filter by status, method, and date.' },
      employeeName: { ar: 'الموظف', en: 'Employee' },
      employeeCode: { ar: 'الرقم الوظيفي', en: 'Employee Code' },
      department: { ar: 'الوحدة التنظيمية', en: 'Org Unit' },
      amount: { ar: 'المبلغ المطلوب', en: 'Requested Amount' },
      approvedAmount: { ar: 'المبلغ المعتمد', en: 'Approved Amount' },
      requestDate: { ar: 'تاريخ الطلب', en: 'Request Date' },
      repaymentMethod: { ar: 'طريقة السداد', en: 'Repayment Method' },
      repaymentMonthly: { ar: 'خصم شهري', en: 'Monthly Deduction' },
      repaymentOneTime: { ar: 'دفعة واحدة', en: 'One-Time Deduction' },
      reason: { ar: 'سبب الطلب', en: 'Reason' },
      notes: { ar: 'ملاحظات', en: 'Notes' },
      optional: { ar: 'اختياري', en: 'Optional' },
      status: { ar: 'الحالة', en: 'Status' },
      pending: { ar: 'معلقة', en: 'Pending' },
      approved: { ar: 'معتمدة', en: 'Approved' },
      rejected: { ar: 'مرفوضة', en: 'Rejected' },
      deducted: { ar: 'مخصومة', en: 'Deducted' },
      partiallyDeducted: { ar: 'خصم جزئي', en: 'Partially Deducted' },
      actions: { ar: 'الإجراءات', en: 'Actions' },
      view: { ar: 'عرض', en: 'View' },
      approve: { ar: 'اعتماد', en: 'Approve' },
      reject: { ar: 'رفض', en: 'Reject' },
      print: { ar: 'طباعة', en: 'Print' },
      profile: { ar: 'ملف الموظف', en: 'Employee Profile' },
      reset: { ar: 'مسح الفلاتر', en: 'Reset Filters' },
      retry: { ar: 'إعادة المحاولة', en: 'Retry' },
      allStatuses: { ar: 'كل الحالات', en: 'All statuses' },
      allMethods: { ar: 'كل طرق السداد', en: 'All methods' },
      allDepartments: { ar: 'كل الوحدات', en: 'All org units' },
      dateFrom: { ar: 'من تاريخ', en: 'Date from' },
      dateTo: { ar: 'إلى تاريخ', en: 'Date to' },
      totalRequests: { ar: 'إجمالي الطلبات', en: 'Total Requests' },
      pendingRequests: { ar: 'طلبات معلقة', en: 'Pending Requests' },
      totalApproved: { ar: 'إجمالي المعتمد', en: 'Approved Amount' },
      employeesCovered: { ar: 'موظفون لديهم سلف نشطة', en: 'Employees with Active Advances' },
      tableTitle: { ar: 'طلبات السلف', en: 'Advance Requests' },
      employeeRequestsTitle: { ar: 'سجل طلباتي', en: 'My Requests' },
      employeeData: { ar: 'بيانات الموظف', en: 'Employee Information' },
      advanceData: { ar: 'بيانات السلفة', en: 'Advance Information' },
      approvalData: { ar: 'بيانات الاعتماد', en: 'Approval Information' },
      payrollImpact: { ar: 'تأثير الرواتب', en: 'Payroll Impact' },
      remainingBalance: { ar: 'الرصيد المتبقي', en: 'Remaining Balance' },
      repaymentPlan: { ar: 'خطة السداد', en: 'Repayment Plan' },
      deductionStatus: { ar: 'حالة الخصم', en: 'Deduction Status' },
      requestNotes: { ar: 'ملاحظات الطلب', en: 'Request Notes' },
      decisionNotes: { ar: 'ملاحظات القرار', en: 'Decision Notes' },
      rejectionReason: { ar: 'سبب الرفض', en: 'Rejection Reason' },
      approvalDate: { ar: 'تاريخ الاعتماد', en: 'Approval Date' },
      approvedBy: { ar: 'اعتمد بواسطة', en: 'Approved By' },
      searchPlaceholder: { ar: 'اسم الموظف أو رقمه أو القسم', en: 'Employee name, code, or department' },
      emptyEmployee: { ar: 'لا توجد طلبات سلف حتى الآن.', en: 'No advance requests yet.' },
      emptyHr: { ar: 'لا توجد طلبات مطابقة للفلاتر الحالية.', en: 'No requests match the current filters.' },
      validationAmount: { ar: 'يرجى إدخال مبلغ صحيح.', en: 'Please enter a valid amount.' },
      validationReason: { ar: 'يرجى إدخال سبب الطلب.', en: 'Please provide a request reason.' },
      requestFailed: { ar: 'تعذر إرسال طلب السلفة.', en: 'Failed to submit the advance request.' },
      actionFailed: { ar: 'تعذر تحديث طلب السلفة.', en: 'Failed to update the advance request.' },
      requestSubmitted: { ar: 'تم تقديم طلب السلفة بنجاح.', en: 'Advance request submitted successfully.' },
      approvedToast: { ar: 'تم اعتماد السلفة وتحديث القائمة.', en: 'Advance approved and the list was refreshed.' },
      rejectedToast: { ar: 'تم رفض السلفة وتحديث الحالة.', en: 'Advance rejected and the status was updated.' },
      submit: { ar: 'إرسال الطلب', en: 'Submit Request' },
      cancel: { ar: 'إلغاء', en: 'Cancel' },
      close: { ar: 'إغلاق', en: 'Close' },
      noValue: { ar: '—', en: '—' },
      requestHint: { ar: 'سيتم عرض الطلب في شاشة الموارد البشرية وملف الموظف مباشرة.', en: 'The request will appear instantly in HR and employee profile views.' },
      payrollNextRun: { ar: 'سيتم خصمها من مسير الرواتب القادم', en: 'This will be deducted in the next payroll run' },
      payrollDeducted: { ar: 'تم خصم هذه السلفة من الرواتب', en: 'This advance has already been deducted in payroll' },
      payrollPartial: { ar: 'هذه السلفة تحت خصم جزئي، ويوجد رصيد متبقٍ', en: 'This advance is partially deducted and still has a remaining balance' },
      payrollManual: { ar: 'سيتم متابعة السلفة ضمن معالجة الرواتب الحالية', en: 'This advance is tracked through the payroll process' },
      installPlanHint: { ar: 'مثال: 4 أقساط شهرية / خصم كامل الشهر القادم', en: 'Example: 4 monthly installments / full deduction next month' },
      profileNotice: { ar: 'يمكن فتح ملف الموظف لمراجعة السلف ضمن الملف الشخصي.', en: 'Open the employee profile to review this advance there.' },
      printTitle: { ar: 'طلب سلفة راتب', en: 'Salary Advance Request' }
      ,
      viewOnlyTitle: { ar: 'صلاحية عرض فقط', en: 'View-only access' },
      viewOnlyBody: {
        ar: 'يمكنك عرض الطلبات لكن لا يمكنك اعتمادها أو رفضها. الاعتماد والرفض متاحان لمدير الموارد البشرية فقط.',
        en: 'You can view requests but cannot approve or reject them. Approval actions are restricted to HR Admin.'
      }
    };
    return dict[key]?.[this.lang] ?? key;
  }

  money(value: number | null | undefined): string {
    return this.settings.formatMoney(value);
  }

  employeeName(item: AdvanceItem): string {
    return this.isArabic ? item.employeeNameAr : (item.employeeNameEn || item.employeeNameAr);
  }

  departmentLabel(item: AdvanceItem): string {
    return this.isArabic
      ? (item.orgNodeNameAr || item.departmentAr)
      : (item.orgNodeNameEn || item.orgNodeNameAr || item.departmentEn || item.departmentAr);
  }

  repaymentMethodLabel(method: string | null | undefined): string {
    return method === 'one_time' ? this.t('repaymentOneTime') : this.t('repaymentMonthly');
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      pending: this.t('pending'),
      approved: this.t('approved'),
      rejected: this.t('rejected'),
      deducted: this.t('deducted'),
      partially_deducted: this.t('partiallyDeducted')
    };
    return map[status] ?? status;
  }

  statusClass(status: string): string {
    const map: Record<string, string> = {
      pending: 'warning',
      approved: 'success',
      rejected: 'danger',
      deducted: 'neutral',
      partially_deducted: 'info'
    };
    return `z-badge ${map[status] ?? 'neutral'}`;
  }

  hasPayrollIntegration(item: AdvanceItem): boolean {
    return item.status === 'approved' || item.status === 'deducted' || item.status === 'partially_deducted';
  }

  payrollImpactLabel(item: AdvanceItem): string {
    if (item.status === 'deducted') return this.t('payrollDeducted');
    if (item.status === 'partially_deducted') return this.t('payrollPartial');
    if (item.status === 'approved' && (item.remainingBalance ?? 0) > 0) return this.t('payrollNextRun');
    return this.t('payrollManual');
  }

  isRequestRejected(item: AdvanceItem): boolean {
    return item.status === 'rejected';
  }

  fallback(value: string | number | null | undefined): string | number {
    if (value === null || value === undefined || value === '') return this.t('noValue');
    return value;
  }

  applyFilters(): void {
    const search = this.searchTerm.trim().toLowerCase();
    const from = this.dateFrom ? new Date(this.dateFrom).getTime() : null;
    const to = this.dateTo ? new Date(this.dateTo).getTime() : null;

    const filtered = this.allAdvances().filter(item => {
      const label = this.isAdminView
        ? [
            item.employeeNameAr,
            item.employeeNameEn,
            item.employeeCode,
            item.orgNodeNameAr,
            item.orgNodeNameEn,
            item.departmentAr,
            item.departmentEn
          ].filter(Boolean).join(' ').toLowerCase()
        : '';

      const dateValue = item.requestDate ? new Date(item.requestDate).getTime() : null;
      const matchesSearch = !this.isAdminView || !search || label.includes(search);
      const matchesStatus = !this.statusFilter || item.status === this.statusFilter;
      const matchesRepayment = !this.repaymentMethodFilter || item.repaymentMethod === this.repaymentMethodFilter;
      const matchesDepartment =
        !this.isAdminView ||
        !this.orgUnitFilter ||
        item.orgNodeNameAr === this.orgUnitFilter ||
        item.orgNodeNameEn === this.orgUnitFilter ||
        item.departmentAr === this.orgUnitFilter ||
        item.departmentEn === this.orgUnitFilter;
      const matchesFrom = from === null || (dateValue !== null && dateValue >= from);
      const matchesTo = to === null || (dateValue !== null && dateValue <= to);

      return matchesSearch && matchesStatus && matchesRepayment && matchesDepartment && matchesFrom && matchesTo;
    });

    this.filteredAdvances.set(filtered);

    const selected = this.selectedAdvance();
    if (selected && !filtered.some(item => item.id === selected.id)) {
      this.selectedAdvance.set(null);
      this.detailModalOpen.set(false);
    }
  }

  resetFilters(): void {
    this.searchTerm = '';
    this.statusFilter = '';
    this.repaymentMethodFilter = '';
    this.orgUnitFilter = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.applyFilters();
  }

  loadAdvances(selectedId?: number): void {
    this.loading.set(true);
    this.error.set('');
    const endpoint = this.isAdminView ? '/api/salary-advances' : '/api/salary-advances/me';
    this.api.get<ApiResponse<AdvanceItem[]>>(endpoint).subscribe({
      next: response => {
        const items = response.data ?? [];
        this.allAdvances.set(items);
        this.applyFilters();

        const targetId = selectedId ?? this.selectedAdvance()?.id;
        if (targetId) {
          const match = items.find(item => item.id === targetId) ?? null;
          if (match) this.selectAdvance(match, this.detailModalOpen());
        }

        this.loading.set(false);
      },
      error: err => {
        this.allAdvances.set([]);
        this.filteredAdvances.set([]);
        this.selectedAdvance.set(null);
        this.error.set(getErrorMessage(err, this.t('actionFailed')));
        this.loading.set(false);
      }
    });

    if (!this.isAdminView) {
      this.api.get<ApiResponse<{ totalRequests: number; pendingRequests: number; approvedAmount: number }>>('/api/salary-advances/me/summary').subscribe({
        next: res => {
          if (res.success && res.data) this.employeeSummary.set(res.data);
        },
        error: () => {
          // keep previous summary
        }
      });
    }
  }

  openRequestForm(): void {
    if (!this.canSubmitAdvance) return;
    this.requestForm = this.createEmptyRequestForm();
    this.formError.set('');
    this.requestModalOpen.set(true);
  }

  closeRequestForm(): void {
    if (this.submittingRequest()) return;
    this.requestModalOpen.set(false);
    this.formError.set('');
  }

  submitRequest(): void {
    this.formError.set('');
    if (this.submittingRequest()) return;

    if (!this.requestForm.requestedAmount || this.requestForm.requestedAmount <= 0) {
      this.formError.set(this.t('validationAmount'));
      return;
    }
    if (!this.requestForm.reason.trim()) {
      this.formError.set(this.t('validationReason'));
      return;
    }

    this.submittingRequest.set(true);
    this.api.post<ApiResponse<AdvanceItem>>('/api/salary-advances', {
      amount: this.requestForm.requestedAmount,
      reason: this.requestForm.reason.trim(),
      repaymentMethod: this.requestForm.repaymentMethod,
      notes: this.requestForm.notes.trim() || null
    }).subscribe({
      next: () => {
        this.submittingRequest.set(false);
        this.requestModalOpen.set(false);
        const message = this.t('requestSubmitted');
        this.showNotification(message);
        this.toast.success(message);
        this.loadAdvances();
      },
      error: err => {
        this.submittingRequest.set(false);
        const message = getErrorMessage(err, this.t('requestFailed'));
        this.formError.set(message);
        this.toast.error(message);
      }
    });
  }

  selectAdvance(item: AdvanceItem, openModal = true): void {
    this.selectedAdvance.set({ ...item });
    this.detailApprovedAmount = item.approvedAmount ?? item.requestedAmount;
    this.detailRepaymentPlan = item.repaymentPlan ?? '';
    this.detailDecisionNotes = item.decisionNotes ?? item.requestNotes ?? '';
    if (openModal) this.detailModalOpen.set(true);
  }

  closeDetails(): void {
    if (this.actionLoadingId() !== null) return;
    this.detailModalOpen.set(false);
  }

  approveSelected(): void {
    const item = this.selectedAdvance();
    if (!item || this.actionLoadingId() === item.id) return;
    this.confirmApproveOpen.set(true);
  }

  submitApproveSelected(): void {
    const item = this.selectedAdvance();
    if (!item || this.actionLoadingId() === item.id) return;

    const approvedAmount = this.detailApprovedAmount && this.detailApprovedAmount > 0
      ? this.detailApprovedAmount
      : item.requestedAmount;

    this.actionLoadingId.set(item.id);
    this.api.put<ApiResponse<unknown>>(`/api/salary-advances/${item.id}/approve`, {
      approvedAmount,
      repaymentMethod: item.repaymentMethod,
      repaymentPlan: this.detailRepaymentPlan.trim() || null,
      notes: this.detailDecisionNotes.trim() || null
    }).subscribe({
      next: () => {
        this.confirmApproveOpen.set(false);
        this.actionLoadingId.set(null);
        const message = this.t('approvedToast');
        this.showNotification(message);
        this.toast.success(message);
        this.loadAdvances(item.id);
      },
      error: err => {
        this.actionLoadingId.set(null);
        const message = getErrorMessage(err, this.t('actionFailed'));
        this.toast.error(message);
      }
    });
  }

  rejectSelected(): void {
    const item = this.selectedAdvance();
    if (!item || this.actionLoadingId() === item.id) return;
    this.rejectDialogError.set('');
    this.rejectDialogOpen.set(true);
  }

  submitRejectSelected(reason: string): void {
    const item = this.selectedAdvance();
    if (!item || this.actionLoadingId() === item.id) return;

    const rejectionReason = reason.trim() || this.detailDecisionNotes.trim();
    if (!rejectionReason) {
      this.rejectDialogError.set(this.t('validationReason'));
      return;
    }

    this.actionLoadingId.set(item.id);
    this.api.put<ApiResponse<unknown>>(`/api/salary-advances/${item.id}/reject`, {
      reason: rejectionReason,
      notes: rejectionReason
    }).subscribe({
      next: () => {
        this.rejectDialogOpen.set(false);
        this.rejectDialogError.set('');
        this.actionLoadingId.set(null);
        const message = this.t('rejectedToast');
        this.showNotification(message);
        this.toast.info(message);
        this.loadAdvances(item.id);
      },
      error: err => {
        this.actionLoadingId.set(null);
        const message = getErrorMessage(err, this.t('actionFailed'));
        this.rejectDialogError.set(message);
        this.toast.error(message);
      }
    });
  }

  closeRejectDialog(): void {
    if (this.actionLoadingId() !== null) return;
    this.rejectDialogOpen.set(false);
    this.rejectDialogError.set('');
  }

  openEmployeeProfile(item: AdvanceItem): void {
    this.router.navigate(['/app/employees', item.employeeId]);
  }

  printAdvance(item?: AdvanceItem | null): void {
    const detail = item ?? this.selectedAdvance();
    if (!detail) return;

    const popup = window.open('', '_blank', 'width=900,height=760');
    if (!popup) return;

    popup.document.write(`
      <html lang="${this.lang}" dir="${this.isArabic ? 'rtl' : 'ltr'}">
        <head>
          <title>${this.t('printTitle')}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1 { margin: 0 0 10px; }
            .muted { color: #666; margin-bottom: 18px; }
            .sheet { display: grid; gap: 18px; }
            .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 18px; }
            .card { border: 1px solid #d9e4dc; border-radius: 14px; padding: 14px; }
            .label { font-size: 12px; color: #666; margin-bottom: 6px; }
            .value { font-weight: 700; }
            .signatures { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; padding-top: 28px; }
            .sig { border-top: 1px solid #bbb; padding-top: 12px; min-height: 60px; }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div>
              <h1>${this.t('printTitle')}</h1>
              <div class="muted">ZenJO HRMS</div>
            </div>
            <div class="grid">
              <div class="card"><div class="label">${this.t('employeeName')}</div><div class="value">${this.employeeName(detail)}</div></div>
              <div class="card"><div class="label">${this.t('employeeCode')}</div><div class="value">${detail.employeeCode || '—'}</div></div>
              <div class="card"><div class="label">${this.t('department')}</div><div class="value">${this.departmentLabel(detail) || '—'}</div></div>
              <div class="card"><div class="label">${this.t('requestDate')}</div><div class="value">${detail.requestDate || '—'}</div></div>
              <div class="card"><div class="label">${this.t('amount')}</div><div class="value">${this.money(detail.requestedAmount)}</div></div>
              <div class="card"><div class="label">${this.t('approvedAmount')}</div><div class="value">${detail.approvedAmount ? this.money(detail.approvedAmount) : '—'}</div></div>
              <div class="card"><div class="label">${this.t('repaymentMethod')}</div><div class="value">${this.repaymentMethodLabel(detail.repaymentMethod)}</div></div>
              <div class="card"><div class="label">${this.t('status')}</div><div class="value">${this.statusLabel(detail.status)}</div></div>
              <div class="card"><div class="label">${this.t('reason')}</div><div class="value">${detail.reason || '—'}</div></div>
              <div class="card"><div class="label">${this.t('repaymentPlan')}</div><div class="value">${detail.repaymentPlan || '—'}</div></div>
            </div>
            <div class="card"><div class="label">${this.t('payrollImpact')}</div><div class="value">${this.payrollImpactLabel(detail)}</div></div>
            <div class="card"><div class="label">${this.t('notes')}</div><div class="value">${detail.decisionNotes || detail.requestNotes || detail.rejectionReason || '—'}</div></div>
            <div class="signatures">
              <div class="sig">${this.isArabic ? 'توقيع الموظف' : 'Employee Signature'}</div>
              <div class="sig">${this.isArabic ? 'توقيع الموارد البشرية' : 'HR Signature'}</div>
            </div>
          </div>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  private showNotification(message: string): void {
    this.notification.set(message);
    setTimeout(() => {
      if (this.notification() === message) this.notification.set('');
    }, 3500);
  }

  private createEmptyRequestForm(): RequestFormState {
    return {
      requestedAmount: null,
      reason: '',
      repaymentMethod: 'monthly',
      notes: ''
    };
  }
}
