import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { LangService } from '../../core/services/lang.service';
import { ToastService } from '../../core/services/toast.service';

type ApiResponse<T> = { success: boolean; data: T; message?: string };

interface LeaveType {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  color: string;
  isPaid: boolean;
  allowHalfDay: boolean;
  allowHourly: boolean;
  affectsPayroll: boolean;
  isActive: boolean;
}

interface LeaveRequest {
  id: number;
  employeeId: number;
  employeeCode?: string;
  employeeNameAr?: string;
  employeeNameEn?: string;
  leaveTypeNameAr?: string;
  leaveTypeNameEn?: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  totalHours?: number;
  durationUnit?: string;
  reason?: string;
  status: string;
  pendingApproverRole?: string;
  departmentNameAr?: string;
  departmentNameEn?: string;
}

interface EmployeeOption {
  id: number;
  employeeCode?: string;
  fullNameAr?: string;
  fullNameEn?: string;
  firstNameAr?: string;
  middleNameAr?: string;
  lastNameAr?: string;
  firstNameEn?: string;
  middleNameEn?: string;
  lastNameEn?: string;
}

@Component({
  selector: 'app-leave-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './leave-management.component.html',
  styleUrl: './leave-management.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LeaveManagementComponent implements OnInit {
  loading = false;
  saving = false;
  actionLoading = false;
  selectedSection: 'requests' | 'balances' | 'types' | 'payroll' | 'audit' = 'requests';
  dashboard: any = {};
  requests: LeaveRequest[] = [];
  balances: any[] = [];
  types: LeaveType[] = [];
  payrollImpacts: any[] = [];
  audit: any[] = [];
  employees: EmployeeOption[] = [];
  total = 0;
  page = 1;
  pageSize = 20;

  filters = {
    q: '',
    employeeId: '',
    leaveTypeId: '',
    status: '',
    from: '',
    to: ''
  };

  requestForm: any = this.emptyRequest();
  typeForm: any = this.emptyType();
  selectedRequest: LeaveRequest | null = null;
  actionReason = '';

  statusLabels: Record<string, { ar: string; en: string }> = {
    pending: { ar: 'بانتظار المدير', en: 'Pending manager' },
    manager_approved: { ar: 'بانتظار الموارد البشرية', en: 'Pending HR' },
    approved: { ar: 'معتمد', en: 'Approved' },
    rejected: { ar: 'مرفوض', en: 'Rejected' },
    cancelled: { ar: 'ملغي', en: 'Cancelled' },
    cancellation_pending: { ar: 'إلغاء بانتظار الاعتماد', en: 'Cancellation pending' },
    changes_requested: { ar: 'مطلوب تعديل', en: 'Changes requested' }
  };

  constructor(
    public lang: LangService,
    public auth: AuthService,
    private api: ApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadAll();
  }

  get role(): string {
    return this.auth.currentUser()?.role || '';
  }

  get canManageTypes(): boolean {
    return this.role === 'hradmin' || this.role === 'superadmin';
  }

  get canReview(): boolean {
    return this.role === 'hradmin' || this.role === 'manager';
  }

  get canCreateRequest(): boolean {
    return ['hradmin', 'manager', 'employee', 'superadmin'].includes(this.role);
  }

  t(ar: string, en: string): string {
    return this.lang.isAr ? ar : en;
  }

  label(item: any, ar = 'nameAr', en = 'nameEn'): string {
    if (!item) return '';
    return this.lang.isAr ? (item[ar] || item[en] || item.code || '') : (item[en] || item[ar] || item.code || '');
  }

  employeeLabel(emp: EmployeeOption): string {
    const ar = emp.fullNameAr || [emp.firstNameAr, emp.middleNameAr, emp.lastNameAr].filter(Boolean).join(' ');
    const en = emp.fullNameEn || [emp.firstNameEn, emp.middleNameEn, emp.lastNameEn].filter(Boolean).join(' ');
    return `${this.lang.isAr ? (ar || en) : (en || ar)}${emp.employeeCode ? ' / ' + emp.employeeCode : ''}`;
  }

  statusLabel(status: string): string {
    const item = this.statusLabels[status] || { ar: status, en: status };
    return this.t(item.ar, item.en);
  }

  sectionLabel(section: typeof this.selectedSection): string {
    const map: Record<string, { ar: string; en: string }> = {
      requests: { ar: 'طلبات الإجازات', en: 'Leave requests' },
      balances: { ar: 'الأرصدة', en: 'Balances' },
      types: { ar: 'أنواع الإجازات', en: 'Leave types' },
      payroll: { ar: 'أثر الرواتب', en: 'Payroll impact' },
      audit: { ar: 'سجل التدقيق', en: 'Audit history' }
    };
    return this.t(map[section].ar, map[section].en);
  }

  emptyRequest(): any {
    const today = new Date().toISOString().slice(0, 10);
    return {
      employeeId: '',
      leaveTypeId: '',
      startDate: today,
      endDate: today,
      durationUnit: 'day',
      totalDays: 1,
      totalHours: 8,
      halfDayPart: 'first_half',
      reason: ''
    };
  }

  emptyType(): any {
    return {
      code: '',
      nameAr: '',
      nameEn: '',
      category: 'custom',
      color: '#2f8f6b',
      isPaid: true,
      allowHalfDay: true,
      allowHourly: false,
      requiresAttachment: false,
      affectsPayroll: false,
      payrollImpactType: 'none',
      isActive: true
    };
  }

  loadAll(): void {
    this.loadDashboard();
    this.loadTypes();
    this.loadEmployees();
    this.loadRequests();
    this.loadBalances();
    this.loadPayrollImpacts();
    this.loadAudit();
  }

  loadDashboard(): void {
    this.api.get<ApiResponse<any>>('/api/leave/management/dashboard')
      .subscribe({ next: res => { this.dashboard = res.data || {}; this.cdr.markForCheck(); } });
  }

  loadTypes(): void {
    this.api.get<ApiResponse<LeaveType[]>>('/api/leave/management/types')
      .subscribe({ next: res => { this.types = res.data || []; this.cdr.markForCheck(); } });
  }

  loadEmployees(): void {
    if (this.role === 'employee') return;
    this.api.get<ApiResponse<any>>('/api/employees', { pageSize: 200 })
      .subscribe({ next: res => {
        const data: any = res.data;
        this.employees = Array.isArray(data) ? data : (data?.items || []);
        this.cdr.markForCheck();
      }});
  }

  loadRequests(): void {
    this.loading = true;
    this.api.get<ApiResponse<any>>('/api/leave/management/requests', { ...this.filters, page: this.page, pageSize: this.pageSize })
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: res => {
          const data = res.data || {};
          this.requests = data.items || [];
          this.total = data.total || this.requests.length;
        },
        error: err => this.toast.error(err?.error?.message || this.t('تعذر تحميل طلبات الإجازات.', 'Unable to load leave requests.'))
      });
  }

  loadBalances(): void {
    this.api.get<ApiResponse<any[]>>('/api/leave/management/balances')
      .subscribe({ next: res => { this.balances = res.data || []; this.cdr.markForCheck(); } });
  }

  loadPayrollImpacts(): void {
    if (!['hradmin', 'payrolladmin'].includes(this.role)) return;
    this.api.get<ApiResponse<any[]>>('/api/leave/management/payroll-impact')
      .subscribe({ next: res => { this.payrollImpacts = res.data || []; this.cdr.markForCheck(); } });
  }

  loadAudit(): void {
    this.api.get<ApiResponse<any[]>>('/api/leave/management/audit')
      .subscribe({ next: res => { this.audit = res.data || []; this.cdr.markForCheck(); } });
  }

  resetFilters(): void {
    this.filters = { q: '', employeeId: '', leaveTypeId: '', status: '', from: '', to: '' };
    this.page = 1;
    this.loadRequests();
  }

  createRequest(): void {
    if (!this.requestForm.leaveTypeId || !this.requestForm.startDate || !this.requestForm.endDate) {
      this.toast.error(this.t('يرجى تعبئة نوع الإجازة والتواريخ.', 'Please fill leave type and dates.'));
      return;
    }
    this.saving = true;
    this.api.post<ApiResponse<LeaveRequest>>('/api/leave/management/requests', this.requestForm)
      .pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => {
          this.toast.success(this.t('تم إرسال طلب الإجازة.', 'Leave request submitted.'));
          this.requestForm = this.emptyRequest();
          this.loadAll();
        },
        error: err => this.toast.error(err?.error?.message || this.t('تعذر إرسال طلب الإجازة.', 'Unable to submit leave request.'))
      });
  }

  saveType(): void {
    if (!this.typeForm.code || !this.typeForm.nameAr || !this.typeForm.nameEn) {
      this.toast.error(this.t('الكود والاسم العربي والإنجليزي مطلوبة.', 'Code, Arabic name, and English name are required.'));
      return;
    }
    this.saving = true;
    this.api.post<ApiResponse<LeaveType>>('/api/leave/management/types', this.typeForm)
      .pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => {
          this.toast.success(this.t('تم حفظ نوع الإجازة.', 'Leave type saved.'));
          this.typeForm = this.emptyType();
          this.loadTypes();
        },
        error: err => this.toast.error(err?.error?.message || this.t('تعذر حفظ نوع الإجازة.', 'Unable to save leave type.'))
      });
  }

  approve(request: LeaveRequest): void {
    this.runAction(request, 'approve', this.t('تم اعتماد الطلب.', 'Request approved.'));
  }

  reject(request: LeaveRequest): void {
    this.runAction(request, 'reject', this.t('تم رفض الطلب.', 'Request rejected.'), { reason: this.actionReason || this.t('غير مناسب للعملية الحالية', 'Not suitable for the current operation') });
  }

  requestChanges(request: LeaveRequest): void {
    this.runAction(request, 'request-changes', this.t('تم طلب تعديل الطلب.', 'Changes requested.'), { notes: this.actionReason || '' });
  }

  cancel(request: LeaveRequest): void {
    this.runAction(request, 'cancel', this.t('تم إلغاء الطلب.', 'Request cancelled.'), { reason: this.actionReason || '' });
  }

  runAction(request: LeaveRequest, action: string, message: string, body: any = {}): void {
    this.actionLoading = true;
    this.api.post<ApiResponse<LeaveRequest>>(`/api/leave/management/requests/${request.id}/${action}`, body)
      .pipe(finalize(() => { this.actionLoading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => {
          this.toast.success(message);
          this.selectedRequest = null;
          this.actionReason = '';
          this.loadAll();
        },
        error: err => this.toast.error(err?.error?.message || this.t('تعذر تنفيذ الإجراء.', 'Unable to complete action.'))
      });
  }

  nextPage(delta: number): void {
    const maxPage = Math.max(1, Math.ceil(this.total / this.pageSize));
    this.page = Math.min(maxPage, Math.max(1, this.page + delta));
    this.loadRequests();
  }
}
