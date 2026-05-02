import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { RoleAccessService } from '../../core/services/role-access.service';
import { ToastService } from '../../core/services/toast.service';
import { SkeletonCardComponent } from '../../shared/components/skeleton/skeleton-card.component';
import { SkeletonKpiCardsComponent } from '../../shared/components/skeleton/skeleton-kpi-cards.component';
import { SkeletonTableComponent } from '../../shared/components/skeleton/skeleton-table.component';
import { ConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog.component';
import { RejectReasonDialogComponent } from '../../shared/components/ui/reject-reason-dialog.component';
import { getErrorMessage } from '../../core/utils/error-message';

type OvertimeView = 'dashboard' | 'log' | 'requests' | 'reports' | 'settings';
type OvertimeActionType = 'approve-request' | 'approve-record';

interface OvertimeLogRow {
  id: number;
  employeeId: number;
  date: string;
  fullNameAr?: string;
  departmentAr?: string;
  departmentEn?: string;
  orgNodeNameAr?: string;
  orgNodeNameEn?: string;
  overtimeHours: number;
  overtimeAmount?: number;
  status: string;
  source?: string;
  dayType?: string;
  compensationType?: string;
  isPayrollProcessed?: boolean;
}

interface OvertimeRequestRow {
  id: number;
  employeeId: number;
  date: string;
  startTime?: string;
  endTime?: string;
  fullNameAr?: string;
  departmentAr?: string;
  departmentEn?: string;
  orgNodeNameAr?: string;
  orgNodeNameEn?: string;
  hours: number;
  reason?: string;
  overtimeType?: string;
  compensationType?: string;
  status: string;
  managerNotes?: string;
  hrNotes?: string;
  rejectionReason?: string;
}

interface OvertimeRuleRow {
  dailyThresholdHours: number;
  maxDailyOvertimeHours: number;
  weeklyMaxHours: number;
  rateTier1: number;
  rateTier2: number;
  tier2ThresholdHours: number;
  rateWeekend: number;
  rateHoliday: number;
  requireManagerApproval: boolean;
  requireHrApproval: boolean;
  autoCalculateFromAttendance: boolean;
}

@Component({
  selector: 'app-overtime',
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
  templateUrl: './overtime.component.html',
  styleUrl: './overtime.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OvertimeComponent implements OnInit {
  view = signal<OvertimeView>('dashboard');
  dashboard = signal<any>(null);
  logRows = signal<OvertimeLogRow[]>([]);
  requests = signal<OvertimeRequestRow[]>([]);
  reportRows = signal<any[]>([]);
  rules = signal<OvertimeRuleRow | null>(null);
  feedback = signal('');
  error = signal('');
  dashboardError = signal('');
  logError = signal('');
  requestsError = signal('');
  reportsError = signal('');
  rulesError = signal('');
  loading = signal(false);
  logLoading = signal(false);
  requestsLoading = signal(false);
  reportsLoading = signal(false);
  rulesLoading = signal(false);
  showRequestModal = signal(false);
  savingRules = signal(false);
  requestActionIds = signal<number[]>([]);
  recordActionIds = signal<number[]>([]);
  confirmAction = signal<{ type: OvertimeActionType; id: number } | null>(null);
  rejectAction = signal<{ type: 'request' | 'record'; id: number } | null>(null);
  rejectError = signal('');

  dashPeriod: 'month' | 'week' = 'month';
  reportType = 'employee';
  reportFilters = { from: '', to: '' };
  logFilters = { from: '', to: '', status: '', source: '' };
  requestFilter = '';
  requestSearch = '';

  requestForm = {
    date: new Date().toISOString().slice(0, 10),
    startTime: '',
    endTime: '',
    hours: 0,
    reason: '',
    overtimeType: 'weekday',
    compensationType: 'pay'
  };

  readonly pendingRequests = computed(() =>
    this.requests().filter(row => row.status === 'pending' || row.status === 'manager_approved').length
  );

  readonly totalLoggedHours = computed(() =>
    this.logRows().reduce((sum, row) => sum + (row.overtimeHours || 0), 0)
  );

  readonly filteredRequestRows = computed(() => {
    const status = this.requestFilter;
    const term = this.requestSearch.trim().toLowerCase();
    return this.requests().filter(row => {
      const matchesStatus = !status || row.status === status;
      const haystack = this.isEmployee
        ? [row.date, row.reason, row.overtimeType, row.compensationType, row.status].join(' ').toLowerCase()
        : [row.fullNameAr, row.orgNodeNameAr, row.orgNodeNameEn, row.departmentAr, row.departmentEn, row.reason, row.overtimeType, row.compensationType].join(' ').toLowerCase();
      const matchesSearch = !term || haystack.includes(term);
      return matchesStatus && matchesSearch;
    });
  });

  orgUnitLabel(row: any) {
    return (this.lang === 'ar' ? row?.orgNodeNameAr : row?.orgNodeNameEn)
      || row?.orgNodeNameAr
      || row?.orgNodeNameEn
      || row?.orgUnit
      || row?.dept
      || '';
  }

  get calculatedRequestHours() {
    const { startTime, endTime } = this.requestForm;
    if (!startTime || !endTime) return 0;
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    if ([startHour, startMinute, endHour, endMinute].some(Number.isNaN)) return 0;

    const startTotal = startHour * 60 + startMinute;
    const endTotal = endHour * 60 + endMinute;
    if (endTotal <= startTotal) return 0;

    return Math.round(((endTotal - startTotal) / 60) * 100) / 100;
  }

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private toast: ToastService,
    private access: RoleAccessService
  ) {}

  get lang() {
    return this.auth.lang;
  }

  get isEmployee() {
    return this.access.isEmployee();
  }

  get isHr() {
    return this.access.isHrAdmin();
  }

  get isHrOrManager() {
    return this.access.isAny('hradmin', 'manager');
  }

  get canSeeReports() {
    return this.access.isAny('hradmin', 'payrolladmin');
  }

  get canSeeLog() {
    return this.access.isAny('employee', 'hradmin', 'payrolladmin');
  }

  get hasRequestFilters() {
    return !!(this.requestFilter || this.requestSearch.trim());
  }

  ngOnInit() {
    this.loadDashboard();
    if (this.canSeeLog) this.loadLog();
    this.loadRequests();
    if (this.canSeeReports) this.loadReports();
    if (this.isHr || this.isEmployee) this.loadRules();
  }

  setView(view: OvertimeView) {
    this.view.set(view);
    if (view === 'dashboard') this.loadDashboard();
    if (view === 'log' && this.canSeeLog) this.loadLog();
    if (view === 'requests') this.loadRequests();
    if (view === 'reports' && this.canSeeReports) this.loadReports();
    if (view === 'settings' && this.isHr) this.loadRules();
  }

  loadDashboard() {
    this.dashboardError.set('');
    this.api.get<any>('/api/overtime/dashboard', { period: this.dashPeriod }).subscribe({
      next: response => this.dashboard.set(response.data || null),
      error: error => {
        this.dashboard.set(null);
        this.dashboardError.set(getErrorMessage(error, this.lang === 'ar' ? 'تعذر تحميل لوحة العمل الإضافي.' : 'Failed to load overtime dashboard.'));
      }
    });
  }

  loadLog() {
    this.logLoading.set(true);
    this.logError.set('');
    this.api.get<any>(this.isEmployee ? '/api/overtime/me/log' : '/api/overtime/log', this.logFilters).subscribe({
      next: response => {
        this.logRows.set(response.data || []);
        this.logLoading.set(false);
      },
      error: error => {
        this.logRows.set([]);
        this.logError.set(getErrorMessage(error, this.lang === 'ar' ? 'تعذر تحميل سجل العمل الإضافي.' : 'Failed to load overtime log.'));
        this.logLoading.set(false);
      }
    });
  }

  loadRequests() {
    this.requestsLoading.set(true);
    this.requestsError.set('');
    this.api.get<any>(this.isEmployee ? '/api/overtime/me/requests' : '/api/overtime/requests').subscribe({
      next: response => {
        this.requests.set(response.data || []);
        this.requestsLoading.set(false);
      },
      error: error => {
        this.requests.set([]);
        this.requestsError.set(getErrorMessage(error, this.lang === 'ar' ? 'تعذر تحميل طلبات العمل الإضافي.' : 'Failed to load overtime requests.'));
        this.requestsLoading.set(false);
      }
    });
  }

  loadReports() {
    this.reportsLoading.set(true);
    this.reportsError.set('');
    this.api.get<any>('/api/overtime/reports', {
      type: this.reportType,
      from: this.reportFilters.from,
      to: this.reportFilters.to
    }).subscribe({
      next: response => {
        this.reportRows.set(response.data || []);
        this.reportsLoading.set(false);
      },
      error: error => {
        this.reportRows.set([]);
        this.reportsError.set(getErrorMessage(error, this.lang === 'ar' ? 'تعذر تحميل تقارير العمل الإضافي.' : 'Failed to load overtime reports.'));
        this.reportsLoading.set(false);
      }
    });
  }

  loadRules() {
    this.rulesLoading.set(true);
    this.rulesError.set('');
    this.api.get<any>('/api/overtime/rules').subscribe({
      next: response => {
        this.rules.set(response.data || null);
        this.rulesLoading.set(false);
      },
      error: error => {
        this.rules.set(null);
        this.rulesError.set(getErrorMessage(error, this.lang === 'ar' ? 'تعذر تحميل قواعد العمل الإضافي.' : 'Failed to load overtime rules.'));
        this.rulesLoading.set(false);
      }
    });
  }

  openRequestModal() {
    this.requestForm = {
      date: new Date().toISOString().slice(0, 10),
      startTime: '',
      endTime: '',
      hours: 0,
      reason: '',
      overtimeType: 'weekday',
      compensationType: 'pay'
    };
    this.error.set('');
    this.showRequestModal.set(true);
  }

  closeRequestModal() {
    this.showRequestModal.set(false);
    this.loading.set(false);
    this.error.set('');
  }

  submitRequest() {
    if (this.loading()) return;

    const calculatedHours = this.calculatedRequestHours;
    if (!this.requestForm.date) {
      this.error.set(this.lang === 'ar' ? 'تاريخ الطلب مطلوب.' : 'Request date is required.');
      return;
    }
    if (this.requestForm.date > new Date().toISOString().slice(0, 10)) {
      this.error.set(this.lang === 'ar' ? 'لا يمكن تقديم طلب لتاريخ مستقبلي.' : 'Future overtime requests are not allowed.');
      return;
    }
    if (!this.requestForm.startTime) {
      this.error.set(this.lang === 'ar' ? 'وقت البداية مطلوب.' : 'Start time is required.');
      return;
    }
    if (!this.requestForm.endTime) {
      this.error.set(this.lang === 'ar' ? 'وقت النهاية مطلوب.' : 'End time is required.');
      return;
    }
    if (calculatedHours <= 0) {
      this.error.set(this.lang === 'ar' ? 'يجب أن يكون وقت النهاية بعد وقت البداية.' : 'End time must be after start time.');
      return;
    }
    if (!this.requestForm.reason.trim()) {
      this.error.set(this.lang === 'ar' ? 'سبب الطلب مطلوب.' : 'Reason is required.');
      return;
    }
    if (this.rules() && this.rules()!.maxDailyOvertimeHours > 0 && calculatedHours > this.rules()!.maxDailyOvertimeHours) {
      this.error.set(this.lang === 'ar' ? 'عدد الساعات يتجاوز الحد الأقصى اليومي.' : 'Hours exceed the max daily overtime limit.');
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.api.post<any>(this.isEmployee ? '/api/overtime/me/requests' : '/api/overtime/requests', {
      ...this.requestForm,
      hours: calculatedHours,
      reason: this.requestForm.reason.trim()
    }).subscribe({
      next: () => {
        const message = this.lang === 'ar' ? 'تم إرسال طلب العمل الإضافي.' : 'Overtime request submitted.';
        this.loading.set(false);
        this.showRequestModal.set(false);
        this.feedback.set(message);
        this.toast.success(message);
        this.loadRequests();
        this.loadLog();
        this.loadDashboard();
      },
      error: err => {
        const message = getErrorMessage(err, this.lang === 'ar' ? 'تعذر إرسال الطلب.' : 'Failed to submit request.');
        this.loading.set(false);
        this.error.set(message);
        this.toast.error(message);
      }
    });
  }

  approveRequest(id: number) {
    if (this.isRequestActionLoading(id)) return;
    this.confirmAction.set({ type: 'approve-request', id });
  }

  rejectRequest(id: number) {
    if (this.isRequestActionLoading(id)) return;
    this.rejectAction.set({ type: 'request', id });
    this.rejectError.set('');
  }

  approveRecord(id: number) {
    if (this.isRecordActionLoading(id)) return;
    this.confirmAction.set({ type: 'approve-record', id });
  }

  rejectRecord(id: number) {
    if (this.isRecordActionLoading(id)) return;
    this.rejectAction.set({ type: 'record', id });
    this.rejectError.set('');
  }

  closeConfirmDialog() {
    this.confirmAction.set(null);
  }

  submitConfirmAction() {
    const action = this.confirmAction();
    if (!action) return;

    if (action.type === 'approve-request') {
      this.setRequestActionLoading(action.id, true);
      this.api.put<any>(`/api/overtime/requests/${action.id}/approve`, { notes: null }).subscribe({
        next: () => {
          this.closeConfirmDialog();
          this.toast.success(this.lang === 'ar' ? 'تمت الموافقة على الطلب.' : 'Request approved.');
          this.loadRequests();
          this.loadDashboard();
          this.setRequestActionLoading(action.id, false);
        },
        error: err => {
          this.toast.error(getErrorMessage(err, this.lang === 'ar' ? 'تعذر اعتماد الطلب.' : 'Failed to approve request.'));
          this.setRequestActionLoading(action.id, false);
        }
      });
      return;
    }

    this.setRecordActionLoading(action.id, true);
    this.api.put<any>(`/api/overtime/records/${action.id}/approve`, { notes: null }).subscribe({
      next: () => {
        this.closeConfirmDialog();
        this.toast.success(this.lang === 'ar' ? 'تم اعتماد السجل.' : 'Record approved.');
        this.loadLog();
        this.loadDashboard();
        this.setRecordActionLoading(action.id, false);
      },
      error: err => {
        this.toast.error(getErrorMessage(err, this.lang === 'ar' ? 'تعذر اعتماد السجل.' : 'Failed to approve record.'));
        this.setRecordActionLoading(action.id, false);
      }
    });
  }

  closeRejectDialog() {
    this.rejectAction.set(null);
    this.rejectError.set('');
  }

  submitRejectReason(reason: string) {
    const action = this.rejectAction();
    if (!action) return;
    if (!reason.trim()) {
      this.rejectError.set(this.lang === 'ar' ? 'سبب الرفض مطلوب.' : 'Rejection reason is required.');
      return;
    }

    const payload = { notes: reason.trim() };
    if (action.type === 'request') {
      this.setRequestActionLoading(action.id, true);
      this.api.put<any>(`/api/overtime/requests/${action.id}/reject`, payload).subscribe({
        next: () => {
          this.closeRejectDialog();
          this.toast.info(this.lang === 'ar' ? 'تم رفض الطلب.' : 'Request rejected.');
          this.loadRequests();
          this.loadDashboard();
          this.setRequestActionLoading(action.id, false);
        },
        error: err => {
          this.rejectError.set(getErrorMessage(err, this.lang === 'ar' ? 'تعذر رفض الطلب.' : 'Failed to reject request.'));
          this.toast.error(this.rejectError());
          this.setRequestActionLoading(action.id, false);
        }
      });
      return;
    }

    this.setRecordActionLoading(action.id, true);
    this.api.put<any>(`/api/overtime/records/${action.id}/reject`, payload).subscribe({
      next: () => {
        this.closeRejectDialog();
        this.toast.info(this.lang === 'ar' ? 'تم رفض السجل.' : 'Record rejected.');
        this.loadLog();
        this.loadDashboard();
        this.setRecordActionLoading(action.id, false);
      },
      error: err => {
        this.rejectError.set(getErrorMessage(err, this.lang === 'ar' ? 'تعذر رفض السجل.' : 'Failed to reject record.'));
        this.toast.error(this.rejectError());
        this.setRecordActionLoading(action.id, false);
      }
    });
  }

  resetRequestFilters() {
    this.requestFilter = '';
    this.requestSearch = '';
  }

  runAutoCalculation() {
    this.api.post<any>('/api/overtime/calculate', {
      from: this.logFilters.from || null,
      to: this.logFilters.to || null
    }).subscribe({
      next: response => {
        const message = response.message || (this.lang === 'ar' ? 'اكتمل الاحتساب بنجاح.' : 'Calculation completed.');
        this.feedback.set(message);
        this.toast.success(message);
        this.loadLog();
        this.loadDashboard();
      },
      error: err => {
        this.toast.error(getErrorMessage(err, this.lang === 'ar' ? 'تعذر تنفيذ الاحتساب.' : 'Failed to run calculation.'));
      }
    });
  }

  saveRules() {
    const current = this.rules();
    if (!current || this.savingRules()) return;
    this.savingRules.set(true);
    this.api.put<any>('/api/overtime/rules', current).subscribe({
      next: response => {
        const message = response.message || (this.lang === 'ar' ? 'تم حفظ القواعد.' : 'Rules saved.');
        this.savingRules.set(false);
        this.feedback.set(message);
        this.toast.success(message);
        this.loadRules();
      },
      error: err => {
        this.savingRules.set(false);
        this.toast.error(getErrorMessage(err, this.lang === 'ar' ? 'تعذر حفظ القواعد.' : 'Failed to save rules.'));
      }
    });
  }

  updateRule<K extends keyof OvertimeRuleRow>(key: K, value: OvertimeRuleRow[K]) {
    const current = this.rules();
    if (!current) return;
    this.rules.set({ ...current, [key]: value });
  }

  employeeName(row: { fullNameAr?: string }) {
    return row.fullNameAr || '--';
  }

  requestApprovalPath(request: OvertimeRequestRow) {
    if (request.status === 'approved') {
      return this.lang === 'ar' ? 'تمت موافقة المدير والموارد البشرية' : 'Manager and HR approved';
    }
    if (request.status === 'manager_approved') {
      return this.lang === 'ar' ? 'بانتظار اعتماد الموارد البشرية' : 'Awaiting HR approval';
    }
    if (request.status === 'rejected') {
      return this.lang === 'ar' ? 'تم رفض الطلب' : 'Request rejected';
    }
    return this.lang === 'ar' ? 'تم الإرسال وبانتظار المراجعة' : 'Submitted and pending review';
  }

  statusLabel(status: string) {
    const labels: Record<string, string> = {
      pending: this.lang === 'ar' ? 'بانتظار الموافقة' : 'Pending',
      manager_approved: this.lang === 'ar' ? 'موافقة المدير' : 'Manager approved',
      approved: this.lang === 'ar' ? 'موافق عليه' : 'Approved',
      rejected: this.lang === 'ar' ? 'مرفوض' : 'Rejected'
    };
    return labels[status] || status;
  }

  compensationLabel(type?: string) {
    if (type === 'time_off') return this.lang === 'ar' ? 'إجازة بديلة' : 'Time off';
    return this.lang === 'ar' ? 'بدل مالي' : 'Payment';
  }

  dayTypeLabel(type?: string) {
    const labels: Record<string, string> = {
      weekday: this.lang === 'ar' ? 'يوم عمل' : 'Weekday',
      weekend: this.lang === 'ar' ? 'عطلة أسبوعية' : 'Weekend',
      holiday: this.lang === 'ar' ? 'عطلة رسمية' : 'Holiday'
    };
    return labels[type || 'weekday'] || type || '--';
  }

  isRequestActionLoading(id: number) {
    return this.requestActionIds().includes(id);
  }

  isRecordActionLoading(id: number) {
    return this.recordActionIds().includes(id);
  }

  private setRequestActionLoading(id: number, loading: boolean) {
    const current = this.requestActionIds();
    this.requestActionIds.set(loading ? [...current, id] : current.filter(item => item !== id));
  }

  private setRecordActionLoading(id: number, loading: boolean) {
    const current = this.recordActionIds();
    this.recordActionIds.set(loading ? [...current, id] : current.filter(item => item !== id));
  }
}
