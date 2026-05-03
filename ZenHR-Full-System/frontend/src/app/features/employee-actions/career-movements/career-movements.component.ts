import { ChangeDetectionStrategy, Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
}

interface OrgNode {
  id: number;
  nameAr: string;
  nameEn: string;
  type: string;
}

interface JobTitle {
  id: number;
  titleAr: string;
  titleEn: string;
}

@Component({
  selector: 'app-career-movements',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, DatePipe, SkeletonKpiCardsComponent, SkeletonTableComponent],
  templateUrl: './career-movements.component.html',
  styleUrls: ['./career-movements.component.scss'],
})
export class CareerMovementsComponent implements OnInit {
  lang = 'ar';
  t = (ar: string, en: string) => this.lang === 'ar' ? ar : en;

  role = '';
  userId = 0;
  username = '';

  loading = signal(true);
  saving = signal(false);

  actions = signal<WorkflowAction[]>([]);
  employees = signal<EmployeeOption[]>([]);
  orgNodes = signal<OrgNode[]>([]);
  jobTitles = signal<JobTitle[]>([]);

  filterSearch = '';
  filterStatus = '';
  filterType = '';

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
    if (this.filterType) list = list.filter(a => a.actionType === this.filterType);
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

  get hasActiveFilters() { return !!(this.filterSearch || this.filterStatus || this.filterType); }

  showCreateModal = false;
  selectedAction: WorkflowAction | null = null;

  form = {
    employeeId: null as number | null,
    actionType: 'transfer',
    effectiveDate: '',
    orgNodeId: null as number | null,
    jobTitleId: null as number | null,
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
  ) {}

  ngOnInit() {
    const u = this.auth.currentUser();
    if (u) { this.role = u.role; this.userId = u.id; this.username = u.username; }
    this.lang = localStorage.getItem('lang') || 'ar';
    this.loadAll();
  }

  loadAll() {
    this.loading.set(true);
    Promise.all([
      this.api.get<any>('/workflow/career-movements').toPromise(),
      this.api.get<any>('/workflow/employee-list').toPromise(),
      this.api.get<any>('/org-nodes').toPromise(),
      this.api.get<any>('/job-titles').toPromise(),
    ]).then(([actRes, empRes, nodeRes, jtRes]) => {
      if (actRes?.success) this.actions.set(actRes.data);
      if (empRes?.success) this.employees.set(empRes.data);
      if (nodeRes?.success) this.orgNodes.set(nodeRes.data);
      if (jtRes?.success) this.jobTitles.set(jtRes.data);
      this.loading.set(false);
    }).catch(() => {
      this.toast.error(this.t('فشل تحميل البيانات', 'Failed to load data'));
      this.loading.set(false);
    });
  }

  resetFilters() {
    this.filterSearch = '';
    this.filterStatus = '';
    this.filterType = '';
  }

  openCreate() {
    this.form = {
      employeeId: null, actionType: 'transfer', effectiveDate: '',
      orgNodeId: null, jobTitleId: null, basicSalary: null,
      housingAllowance: null, transportAllowance: null,
      mobileAllowance: null, mealAllowance: null, otherAllowances: null,
      notes: '',
    };
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

  submitCreate() {
    if (!this.form.employeeId || !this.form.effectiveDate) {
      this.formError = this.t('الحقول المطلوبة ناقصة', 'Required fields missing');
      return;
    }
    if (this.form.actionType !== 'transfer' && !this.form.jobTitleId) {
      this.formError = this.t('يجب تحديد المسمى الوظيفي', 'Job title is required');
      return;
    }
    this.formError = '';
    this.saving.set(true);
    const payload: any = {
      employeeId: this.form.employeeId,
      actionType: this.form.actionType,
      effectiveDate: this.form.effectiveDate,
      notes: this.form.notes || null,
    };
    if (this.form.actionType === 'transfer') {
      payload.orgNodeId = this.form.orgNodeId;
    } else {
      payload.jobTitleId = this.form.jobTitleId;
      if (this.form.basicSalary != null) {
        payload.basicSalary = this.form.basicSalary;
        payload.housingAllowance = this.form.housingAllowance ?? 0;
        payload.transportAllowance = this.form.transportAllowance ?? 0;
        payload.mobileAllowance = this.form.mobileAllowance ?? 0;
        payload.mealAllowance = this.form.mealAllowance ?? 0;
        payload.otherAllowances = this.form.otherAllowances ?? 0;
      }
    }
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
      pending_manager: ['بانتظار المدير', 'Pending Manager'],
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

  actionTypeLabel(type: string): string {
    const map: Record<string, [string, string]> = {
      transfer: ['نقل', 'Transfer'],
      promotion: ['ترقية', 'Promotion'],
      demotion: ['خفض درجة', 'Demotion'],
    };
    return this.lang === 'ar' ? (map[type]?.[0] ?? type) : (map[type]?.[1] ?? type);
  }

  actionTypeIcon(type: string): string {
    if (type === 'transfer') return 'swap_horiz';
    if (type === 'promotion') return 'trending_up';
    if (type === 'demotion') return 'trending_down';
    return 'work';
  }

  stepLabel(step: string): string {
    return this.statusLabel(step);
  }

  getOrgNodeName(id: number | null | undefined): string {
    if (!id) return '—';
    const n = this.orgNodes().find(n => n.id === id);
    return (this.lang === 'ar' ? n?.nameAr : n?.nameEn) || '—';
  }

  getJobTitleName(id: number | null | undefined): string {
    if (!id) return '—';
    const jt = this.jobTitles().find(j => j.id === id);
    return (this.lang === 'ar' ? jt?.titleAr : jt?.titleEn) || '—';
  }

  getEmployeeName(id: number | null | undefined): string {
    if (!id) return '—';
    const emp = this.employees().find(e => e.id === id);
    if (!emp) return '—';
    return this.lang === 'ar'
      ? `${emp.firstNameAr} ${emp.lastNameAr}`
      : `${emp.firstNameEn} ${emp.lastNameEn}`;
  }

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
}
