import { ChangeDetectionStrategy, Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { SkeletonKpiCardsComponent } from '../../../shared/components/skeleton/skeleton-kpi-cards.component';
import { SkeletonTableComponent } from '../../../shared/components/skeleton/skeleton-table.component';
import { getErrorMessage } from '../../../core/utils/error-message';

interface ApprovalStep {
  step: string;
  userId: number;
  username: string;
  decision: 'approved' | 'rejected';
  date: string;
  notes?: string;
}

interface ApprovalStepsData {
  chain: string[];
  steps: ApprovalStep[];
}

interface WorkflowAction {
  id: number;
  employeeId: number;
  actionType: string;
  effectiveDate: string;
  status: string;
  notes?: string;
  previousValueJson?: string;
  newValueJson?: string;
  approvalStepsJson?: string;
  createdAt: string;
  createdByUserId?: number;
  employeeFullNameEn: string;
  employeeFullNameAr: string;
  employeeCode: string;
  createdByName?: string;
  labelEn: string;
  labelAr: string;
}

interface EmployeeOption {
  id: number;
  employeeCode: string;
  firstNameEn: string; lastNameEn: string;
  firstNameAr: string; lastNameAr: string;
  basicSalary?: number;
  housingAllowance?: number;
  transportAllowance?: number;
  mobileAllowance?: number;
  mealAllowance?: number;
  otherAllowances?: number;
}

@Component({
  selector: 'app-salary-changes',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, DatePipe, SkeletonKpiCardsComponent, SkeletonTableComponent],
  templateUrl: './salary-changes.component.html',
  styleUrls: ['./salary-changes.component.scss'],
})
export class SalaryChangesComponent implements OnInit {
  lang = 'ar';
  t = (ar: string, en: string) => this.lang === 'ar' ? ar : en;

  role = '';
  userId = 0;
  username = '';

  loading = signal(true);
  saving = signal(false);

  actions = signal<WorkflowAction[]>([]);
  employees = signal<EmployeeOption[]>([]);

  filterSearch = '';
  filterStatus = '';

  filtered = computed(() => {
    let list = this.actions();
    if (this.filterSearch) {
      const q = this.filterSearch.toLowerCase();
      list = list.filter(a =>
        a.employeeFullNameAr.toLowerCase().includes(q) ||
        a.employeeFullNameEn.toLowerCase().includes(q) ||
        a.employeeCode.toLowerCase().includes(q)
      );
    }
    if (this.filterStatus) list = list.filter(a => a.status === this.filterStatus);
    return list;
  });

  kpis = computed(() => {
    const all = this.actions();
    return {
      total: all.length,
      pending: all.filter(a => a.status.startsWith('pending')).length,
      applied: all.filter(a => a.status === 'applied').length,
      rejected: all.filter(a => a.status === 'rejected').length,
    };
  });

  get hasActiveFilters() { return !!(this.filterSearch || this.filterStatus); }

  showCreateModal = false;
  selectedAction: WorkflowAction | null = null;

  selectedEmployeeData: EmployeeOption | null = null;

  form = {
    employeeId: null as number | null,
    effectiveDate: '',
    basicSalary: null as number | null,
    housingAllowance: null as number | null,
    transportAllowance: null as number | null,
    mobileAllowance: null as number | null,
    mealAllowance: null as number | null,
    otherAllowances: null as number | null,
    notes: '',
  };
  formError = '';

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private toast: ToastService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    const u = this.auth.currentUser();
    if (u) { this.role = u.role; this.userId = u.id; this.username = u.username; }
    this.lang = localStorage.getItem('lang') || 'ar';
    this.loadAll().then(() => {
      const empId = this.route.snapshot.queryParamMap.get('employeeId');
      if (empId) {
        const emp = this.employees().find(e => e.id === +empId);
        this.form = {
          employeeId: +empId,
          effectiveDate: new Date().toISOString().slice(0, 10),
          basicSalary: emp ? (Number(emp.basicSalary) || null) : null,
          housingAllowance: emp ? (Number(emp.housingAllowance) || null) : null,
          transportAllowance: emp ? (Number(emp.transportAllowance) || null) : null,
          mobileAllowance: emp ? (Number(emp.mobileAllowance) || null) : null,
          mealAllowance: emp ? (Number(emp.mealAllowance) || null) : null,
          otherAllowances: emp ? (Number(emp.otherAllowances) || null) : null,
          notes: '',
        };
        this.selectedEmployeeData = emp || null;
        this.formError = '';
        this.showCreateModal = true;
        this.selectedAction = null;
        this.router.navigate([], { replaceUrl: true, queryParams: {} });
      }
    });
  }

  loadAll(): Promise<void> {
    this.loading.set(true);
    return Promise.all([
      this.api.get<any>('/workflow/salary-changes').toPromise(),
      this.api.get<any>('/workflow/employee-list').toPromise(),
    ]).then(([actRes, empRes]) => {
      if (actRes?.success) this.actions.set(actRes.data);
      if (empRes?.success) this.employees.set(empRes.data);
      this.loading.set(false);
    }).catch(() => {
      this.toast.error(this.t('فشل تحميل البيانات', 'Failed to load data'));
      this.loading.set(false);
    });
  }

  resetFilters() {
    this.filterSearch = '';
    this.filterStatus = '';
  }

  onEmployeeChange() {
    const emp = this.employees().find(e => e.id === this.form.employeeId);
    this.selectedEmployeeData = emp || null;
    if (emp) {
      this.form.basicSalary = Number(emp.basicSalary) || null;
      this.form.housingAllowance = Number(emp.housingAllowance) || null;
      this.form.transportAllowance = Number(emp.transportAllowance) || null;
      this.form.mobileAllowance = Number(emp.mobileAllowance) || null;
      this.form.mealAllowance = Number(emp.mealAllowance) || null;
      this.form.otherAllowances = Number(emp.otherAllowances) || null;
    }
  }

  openCreate() {
    this.form = {
      employeeId: null, effectiveDate: '',
      basicSalary: null, housingAllowance: null, transportAllowance: null,
      mobileAllowance: null, mealAllowance: null, otherAllowances: null,
      notes: '',
    };
    this.selectedEmployeeData = null;
    this.formError = '';
    this.showCreateModal = true;
    this.selectedAction = null;
  }

  closeCreate() { this.showCreateModal = false; }

  openDetail(action: WorkflowAction) {
    this.selectedAction = action;
    this.showCreateModal = false;
  }

  closeDetail() { this.selectedAction = null; }

  getGross(form: typeof this.form): number {
    return (form.basicSalary || 0) + (form.housingAllowance || 0) + (form.transportAllowance || 0) +
      (form.mobileAllowance || 0) + (form.mealAllowance || 0) + (form.otherAllowances || 0);
  }

  submitCreate() {
    if (!this.form.employeeId || !this.form.effectiveDate || this.form.basicSalary == null) {
      this.formError = this.t('الحقول المطلوبة ناقصة', 'Required fields missing');
      return;
    }
    this.formError = '';
    this.saving.set(true);
    const payload: any = {
      employeeId: this.form.employeeId,
      actionType: 'salary_change',
      effectiveDate: this.form.effectiveDate,
      notes: this.form.notes || null,
      basicSalary: this.form.basicSalary,
      housingAllowance: this.form.housingAllowance ?? 0,
      transportAllowance: this.form.transportAllowance ?? 0,
      mobileAllowance: this.form.mobileAllowance ?? 0,
      mealAllowance: this.form.mealAllowance ?? 0,
      otherAllowances: this.form.otherAllowances ?? 0,
    };
    this.api.post<any>('/workflow/requests', payload).subscribe({
      next: (res) => {
        if (res.success) {
          this.toast.success(this.t('تم إرسال الطلب بنجاح', 'Request submitted successfully'));
          this.showCreateModal = false;
          this.loadAll();
        } else {
          this.formError = res.message || this.t('حدث خطأ', 'An error occurred');
        }
        this.saving.set(false);
      },
      error: (e) => {
        this.formError = getErrorMessage(e, 'An error occurred');
        this.saving.set(false);
      }
    });
  }

  approve(actionId: number) {
    this.api.post<any>(`/workflow/requests/${actionId}/approve`, {}).subscribe({
      next: (res) => {
        if (res.success) {
          this.toast.success(this.t('تمت الموافقة', 'Approved successfully'));
          this.selectedAction = null;
          this.loadAll();
        } else {
          this.toast.error(res.message || this.t('فشل', 'Failed'));
        }
      },
      error: (e) => this.toast.error(getErrorMessage(e, 'An error occurred')),
    });
  }

  reject(actionId: number, notes: string = '') {
    this.api.post<any>(`/workflow/requests/${actionId}/reject`, { notes }).subscribe({
      next: (res) => {
        if (res.success) {
          this.toast.success(this.t('تم الرفض', 'Rejected'));
          this.selectedAction = null;
          this.loadAll();
        } else {
          this.toast.error(res.message || this.t('فشل', 'Failed'));
        }
      },
      error: (e) => this.toast.error(getErrorMessage(e, 'An error occurred')),
    });
  }

  cancel(actionId: number) {
    this.api.post<any>(`/workflow/requests/${actionId}/cancel`, {}).subscribe({
      next: (res) => {
        if (res.success) {
          this.toast.success(this.t('تم الإلغاء', 'Cancelled'));
          this.selectedAction = null;
          this.loadAll();
        } else {
          this.toast.error(res.message || this.t('فشل', 'Failed'));
        }
      },
      error: (e) => this.toast.error(getErrorMessage(e, 'An error occurred')),
    });
  }

  getApprovalData(action: WorkflowAction): ApprovalStepsData | null {
    if (!action.approvalStepsJson) return null;
    try { return JSON.parse(action.approvalStepsJson); } catch { return null; }
  }

  getPreviousValue(action: WorkflowAction): any {
    if (!action.previousValueJson) return {};
    try { return JSON.parse(action.previousValueJson); } catch { return {}; }
  }

  getNewValue(action: WorkflowAction): any {
    if (!action.newValueJson) return {};
    try { return JSON.parse(action.newValueJson); } catch { return {}; }
  }

  canApprove(action: WorkflowAction): boolean {
    const s = action.status;
    if (s === 'pending_manager') return ['manager', 'hradmin', 'superadmin'].includes(this.role);
    if (s === 'pending_hr') return ['hradmin', 'superadmin'].includes(this.role);
    if (s === 'pending_payroll') return ['payrolladmin', 'hradmin', 'superadmin'].includes(this.role);
    return false;
  }

  canCancel(action: WorkflowAction): boolean {
    return action.status.startsWith('pending') &&
      (action.createdByUserId === this.userId || this.role === 'hradmin' || this.role === 'superadmin');
  }

  statusLabel(status: string): string {
    const map: Record<string, [string, string]> = {
      pending_hr: ['بانتظار الموارد البشرية', 'Pending HR'],
      pending_payroll: ['بانتظار الرواتب', 'Pending Payroll'],
      approved: ['مُوافق عليه', 'Approved'],
      applied: ['مُطبَّق', 'Applied'],
      rejected: ['مرفوض', 'Rejected'],
      cancelled: ['ملغى', 'Cancelled'],
      pending: ['قيد المراجعة', 'Pending'],
    };
    return this.lang === 'ar' ? (map[status]?.[0] ?? status) : (map[status]?.[1] ?? status);
  }

  statusClass(status: string): string {
    if (status === 'applied') return 'badge-success';
    if (status === 'approved') return 'badge-info';
    if (status.startsWith('pending')) return 'badge-warning';
    if (status === 'rejected') return 'badge-danger';
    if (status === 'cancelled') return 'badge-neutral';
    return 'badge-neutral';
  }

  stepLabel(step: string): string { return this.statusLabel(step); }

  rejectNotes = '';
  showRejectModal = false;
  rejectTargetId: number | null = null;

  openRejectModal(id: number) {
    this.rejectTargetId = id;
    this.rejectNotes = '';
    this.showRejectModal = true;
  }

  closeRejectModal() { this.showRejectModal = false; this.rejectTargetId = null; }

  confirmReject() {
    if (this.rejectTargetId) {
      this.reject(this.rejectTargetId, this.rejectNotes);
      this.showRejectModal = false;
    }
  }

  formatSalary(val: any): string {
    const n = Number(val);
    if (isNaN(n)) return '—';
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
}
