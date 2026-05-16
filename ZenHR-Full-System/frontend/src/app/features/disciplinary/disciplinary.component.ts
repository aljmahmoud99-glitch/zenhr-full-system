import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { SkeletonKpiCardsComponent } from '../../shared/components/skeleton/skeleton-kpi-cards.component';
import { SkeletonTableComponent } from '../../shared/components/skeleton/skeleton-table.component';
import { ConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog.component';
import { getErrorMessage } from '../../core/utils/error-message';

type View = 'list' | 'create' | 'detail' | 'settings';
type DetailTab = 'info' | 'investigation' | 'decision';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface DisciplineCase {
  id: number;
  employeeId: number;
  employeeCode: string;
  employeeNameAr: string;
  departmentAr?: string;
  violationTypeId: number;
  violationNameAr: string;
  violationCode: string;
  violationDate: string;
  violationDescription?: string;
  penaltyType: string;
  penaltyDays?: number;
  actionDeadline: string;
  issuedDate: string;
  status: string;
  employeeAcknowledgment: boolean;
  previousViolationsCount: number;
  salaryDeductionAmount?: number;
  decisionDate?: string;
  notes?: string;
  hasInvestigation: boolean;
  investigationOutcome?: string;
}

interface ViolationType {
  id: number;
  nameAr: string;
  nameEn?: string;
  code: string;
  isActive?: boolean;
  availablePenaltiesJson?: string;
}

interface EmployeeOption {
  id: number;
  employeeCode: string;
  fullNameAr: string;
  departmentAr?: string;
  jobTitleAr?: string;
}

interface DetailResponse {
  id: number;
  employeeId: number;
  violationTypeId: number;
  violationDate: string;
  violationDescription?: string;
  penaltyType: string;
  penaltyDays?: number;
  actionDeadline: string;
  issuedDate: string;
  status: string;
  employeeAcknowledgment: boolean;
  previousViolationsCount: number;
  salaryDeductionAmount?: number;
  decisionDate?: string;
  notes?: string;
  reportedBy?: string;
  violationNameAr: string;
  violationCode: string;
  availablePenaltiesJson?: string;
  employee: {
    employeeId: number;
    employeeCode: string;
    nameAr: string;
    jobTitle?: string;
    department?: string;
    manager?: { id: number; nameAr: string };
  };
  investigation?: {
    id: number;
    hrNotes?: string;
    employeeStatement?: string;
    managerStatement?: string;
    investigationDate?: string;
    outcome?: string;
  } | null;
  previousCases?: Array<{
    id: number;
    violationDate: string;
    penaltyType: string;
    status: string;
    violationNameAr: string;
  }>;
}

const STATUS_LABELS_AR: Record<string, string> = {
  draft: 'مسودة',
  open: 'مفتوحة',
  investigating: 'تحت التحقيق',
  decided: 'تم البت',
  closed: 'مغلقة',
  cancelled: 'ملغاة'
};

const STATUS_LABELS_EN: Record<string, string> = {
  draft: 'Draft',
  open: 'Open',
  investigating: 'Investigating',
  decided: 'Decided',
  closed: 'Closed',
  cancelled: 'Cancelled'
};

const PENALTY_LABELS_AR: Record<string, string> = {
  warning_verbal: 'تنبيه شفهي',
  warning_written: 'إنذار أول',
  warning_written_2: 'إنذار ثانٍ',
  warning_final: 'إنذار نهائي',
  salary_deduction_1: 'خصم يوم راتب',
  salary_deduction_3: 'خصم 3 أيام راتب',
  suspension_1: 'إيقاف يوم',
  suspension_3: 'إيقاف 3 أيام',
  termination: 'إنهاء الخدمة'
};

const PENALTY_LABELS_EN: Record<string, string> = {
  warning_verbal: 'Verbal Warning',
  warning_written: 'First Written Warning',
  warning_written_2: 'Second Written Warning',
  warning_final: 'Final Warning',
  salary_deduction_1: '1 Day Salary Deduction',
  salary_deduction_3: '3 Days Salary Deduction',
  suspension_1: '1 Day Suspension',
  suspension_3: '3 Days Suspension',
  termination: 'Termination'
};

@Component({
  selector: 'app-disciplinary',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, SkeletonKpiCardsComponent, SkeletonTableComponent, ConfirmDialogComponent],
  templateUrl: './disciplinary.component.html',
  styleUrl: './disciplinary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DisciplinaryComponent implements OnInit {
  activeView: View = 'list';
  detailTab: DetailTab = 'info';
  filterDateInputType: 'text' | 'date' = 'text';
  formDateInputType: 'text' | 'date' = 'text';

  cases = signal<DisciplineCase[]>([]);
  violations = signal<ViolationType[]>([]);
  allViolations = signal<ViolationType[]>([]);
  employees = signal<EmployeeOption[]>([]);
  stats = signal<any>({ total: 0, open: 0, investigating: 0, overdue: 0 });
  caseDetail = signal<DetailResponse | null>(null);
  empHistory = signal<any>({ suggested: '', totalCases: 0 });
  selectedEmployee = signal<EmployeeOption | null>(null);
  loading = signal(true);
  detailLoading = signal(false);
  detailError = signal('');
  saving = false;
  submitting = false;
  saveMsg = '';
  saveErr = false;

  confirmDialogOpen = signal(false);
  confirmDialogTitle = '';
  confirmDialogMessage = '';
  confirmDialogLabel = '';
  confirmDialogTone: 'primary' | 'danger' = 'primary';
  confirmDialogAction: (() => void) | null = null;

  formError = '';
  vtError = '';
  showAddViolation = false;
  editingViolationId: number | null = null;
  editViolation = { nameAr: '', nameEn: '' };

  filterSearch = '';
  filterStatus = '';
  filterViolation = '';
  filterDate = '';

  form = this.emptyForm();
  invForm = { hrNotes: '', employeeStatement: '', managerStatement: '', investigationDate: '', outcome: 'pending' };
  decForm = { penaltyType: 'warning_verbal', penaltyDays: 0, salaryDeductionAmount: 0, decisionDate: '', notes: '' };
  newViolation = { nameAr: '', nameEn: '', code: '' };

  penaltyLevels = [
    { key: 'warning_verbal', ar: 'تنبيه شفهي', en: 'Verbal Warning' },
    { key: 'warning_written', ar: 'إنذار أول', en: 'First Warning' },
    { key: 'warning_written_2', ar: 'إنذار ثانٍ', en: 'Second Warning' },
    { key: 'warning_final', ar: 'إنذار نهائي', en: 'Final Warning' },
    { key: 'termination', ar: 'إنهاء الخدمة', en: 'Termination' }
  ];

  filtered = signal<DisciplineCase[]>([]);

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  get lang() {
    return this.auth.lang;
  }

  get isHR() {
    return this.auth.currentUser()?.role === 'hradmin';
  }

  get hasActiveFilters() {
    return !!(this.filterSearch || this.filterStatus || this.filterViolation || this.filterDate);
  }

  ngOnInit() {
    this.loadList();
    this.api.get<any>('/api/employees?status=active').subscribe(r => this.employees.set(r.data || []));
    this.api.get<any>('/api/lookups/violation-types').subscribe(r => this.violations.set(r.data || []));
  }

  t(ar: string, en: string) {
    return this.lang === 'ar' ? ar : en;
  }

  loadList() {
    this.loading.set(true);
    this.api.get<ApiResponse<DisciplineCase[]>>('/api/disciplinary').subscribe({
      next: r => {
        this.cases.set(r.data || []);
        this.applyFilters();
        this.loading.set(false);
      },
      error: error => {
        this.loading.set(false);
        this.toast.error(getErrorMessage(error, this.t('تعذر تحميل القضايا التأديبية.', 'Failed to load disciplinary cases.')));
      }
    });

    this.api.get<any>('/api/disciplinary/stats').subscribe({
      next: r => this.stats.set(r.data || {}),
      error: () => this.stats.set({ total: 0, open: 0, investigating: 0, overdue: 0 })
    });
  }

  loadAllViolations() {
    this.api.get<any>('/api/disciplinary/violations').subscribe({
      next: r => this.allViolations.set(r.data || []),
      error: error => this.toast.error(getErrorMessage(error, this.t('تعذر تحميل أنواع المخالفات.', 'Failed to load violation types.')))
    });
  }

  backToList() {
    this.activeView = 'list';
    this.caseDetail.set(null);
    this.detailError.set('');
    this.detailLoading.set(false);
    this.saveMsg = '';
    this.loadList();
  }

  openCreate() {
    this.form = this.emptyForm();
    this.formError = '';
    this.empHistory.set({ suggested: '', totalCases: 0 });
    this.selectedEmployee.set(null);
    this.activeView = 'create';
  }

  openSettings() {
    this.loadAllViolations();
    this.activeView = 'settings';
  }

  openDetail(id: number) {
    this.detailLoading.set(true);
    this.detailError.set('');
    this.api.get<ApiResponse<DetailResponse>>(`/api/disciplinary/${id}`).subscribe({
      next: r => {
        const d = r.data;
        this.caseDetail.set(d);
        this.invForm = {
          hrNotes: d.investigation?.hrNotes || '',
          employeeStatement: d.investigation?.employeeStatement || '',
          managerStatement: d.investigation?.managerStatement || '',
          investigationDate: d.investigation?.investigationDate ? String(d.investigation.investigationDate).substring(0, 10) : '',
          outcome: d.investigation?.outcome || 'pending'
        };
        this.decForm = {
          penaltyType: d.penaltyType || 'warning_verbal',
          penaltyDays: d.penaltyDays || 0,
          salaryDeductionAmount: d.salaryDeductionAmount || 0,
          decisionDate: d.decisionDate ? String(d.decisionDate).substring(0, 10) : new Date().toISOString().substring(0, 10),
          notes: d.notes || ''
        };
        this.detailTab = 'info';
        this.saveMsg = '';
        this.activeView = 'detail';
        this.detailLoading.set(false);
      },
      error: error => {
        this.detailLoading.set(false);
        this.detailError.set(getErrorMessage(error, this.t('تعذر تحميل تفاصيل القضية.', 'Failed to load case details.')));
        this.toast.error(this.detailError());
        this.backToList();
      }
    });
  }

  onEmployeeChange() {
    const emp = this.employees().find(e => e.id === +this.form.employeeId);
    this.selectedEmployee.set(emp || null);
    if (!emp) return;
    this.api.get<any>(`/api/disciplinary/employee/${emp.id}/history`).subscribe({
      next: r => {
        this.empHistory.set(r.data || {});
        if (r.data?.suggested) this.form.penaltyType = r.data.suggested;
      },
      error: () => this.empHistory.set({ suggested: '', totalCases: 0 })
    });
  }

  submitCase(asDraft: boolean) {
    this.formError = '';
    if (!this.form.employeeId || !this.form.violationTypeId || !this.form.violationDate || !this.form.violationDescription?.trim()) {
      this.formError = this.t('يرجى تعبئة جميع الحقول المطلوبة (الموظف، نوع المخالفة، التاريخ، الوصف).', 'Please complete all required fields.');
      return;
    }

    const violationDate = new Date(`${this.form.violationDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today.getTime() - violationDate.getTime()) / 86400000);
    if (diffDays > 14) {
      this.formError = this.t('لا يمكن اتخاذ إجراء بعد 14 يوم من تاريخ المخالفة', 'No action can be taken after 14 days from the violation date.');
      return;
    }

    this.submitting = true;
    this.api.post<any>('/api/disciplinary', { ...this.form, asDraft }).subscribe({
      next: r => {
        this.submitting = false;
        this.toast.success(this.t('تم حفظ القضية بنجاح.', 'Case saved successfully.'));
        this.loadList();
        this.openDetail(r.data.id);
      },
      error: e => {
        this.submitting = false;
        this.formError = getErrorMessage(e, this.t('تعذر حفظ القضية.', 'Failed to save case.'));
        this.toast.error(this.formError);
      }
    });
  }

  saveInvestigation() {
    this.saving = true;
    this.saveMsg = '';
    this.saveErr = false;
    this.api.put<any>(`/api/disciplinary/${this.caseDetail()!.id}/investigation`, this.invForm).subscribe({
      next: () => {
        this.saving = false;
        this.saveMsg = this.t('تم حفظ التحقيق بنجاح', 'Investigation saved successfully.');
        this.toast.success(this.saveMsg);
        this.loadList();
        this.openDetail(this.caseDetail()!.id);
      },
      error: e => {
        this.saving = false;
        this.saveMsg = getErrorMessage(e, this.t('تعذر حفظ التحقيق.', 'Failed to save investigation.'));
        this.saveErr = true;
        this.toast.error(this.saveMsg);
      }
    });
  }

  saveDecision() {
    this.openConfirmDialog(
      this.t('اعتماد القرار', 'Apply Decision'),
      this.t('سيتم تطبيق القرار النهائي على القضية بعد التأكيد.', 'The final decision will be applied to this case after confirmation.'),
      this.t('اعتماد القرار', 'Apply Decision'),
      () => this.executeDecisionSave()
    );
  }

  changeStatus(status: string) {
    this.openConfirmDialog(
      this.t('بدء التحقيق', 'Start Investigation'),
      this.t('سيتم نقل القضية إلى مرحلة التحقيق.', 'This case will move to the investigation stage.'),
      this.t('بدء التحقيق', 'Start Investigation'),
      () => this.executeStatusChange(status)
    );
  }

  closeCase() {
    this.openConfirmDialog(
      this.t('إغلاق القضية', 'Close Case'),
      this.t('سيتم إغلاق القضية الحالية بعد التأكيد.', 'This case will be closed after confirmation.'),
      this.t('إغلاق القضية', 'Close Case'),
      () => this.executeCloseCase()
    );
  }

  acknowledgeCase() {
    if (this.saving) return;
    this.saving = true;
    this.api.put<any>(`/api/disciplinary/${this.caseDetail()!.id}/acknowledge`, {}).subscribe({
      next: () => {
        this.saving = false;
        this.toast.success(this.t('تم توثيق توقيع الموظف.', 'Employee acknowledgment saved.'));
        this.loadList();
        this.openDetail(this.caseDetail()!.id);
      },
      error: error => {
        this.saving = false;
        this.toast.error(getErrorMessage(error, this.t('تعذر توثيق توقيع الموظف.', 'Failed to save acknowledgment.')));
      }
    });
  }

  cancelCase() {
    if (this.saving) return;
    this.openConfirmDialog(
      this.t('إلغاء القضية', 'Cancel Case'),
      this.t('سيتم إلغاء القضية الحالية بعد التأكيد.', 'This case will be cancelled after confirmation.'),
      this.t('إلغاء القضية', 'Cancel Case'),
      () => this.submitCancelCase(),
      'danger'
    );
  }

  addViolation() {
    this.vtError = '';
    if (!this.newViolation.nameAr || !this.newViolation.code) {
      this.vtError = this.t('الاسم بالعربية والكود مطلوبان.', 'Arabic name and code are required.');
      return;
    }
    this.saving = true;
    this.api.post<any>('/api/disciplinary/violations', this.newViolation).subscribe({
      next: () => {
        this.saving = false;
        this.showAddViolation = false;
        this.newViolation = { nameAr: '', nameEn: '', code: '' };
        this.toast.success(this.t('تمت إضافة نوع المخالفة.', 'Violation type added successfully.'));
        this.loadAllViolations();
      },
      error: e => {
        this.saving = false;
        this.vtError = getErrorMessage(e, this.t('تعذر حفظ نوع المخالفة.', 'Failed to save violation type.'));
      }
    });
  }

  startEditViolation(v: ViolationType) {
    this.editingViolationId = v.id;
    this.editViolation = { nameAr: v.nameAr, nameEn: v.nameEn || '' };
  }

  saveViolation(id: number) {
    this.api.put<any>(`/api/disciplinary/violations/${id}`, { ...this.editViolation, code: '' }).subscribe({
      next: () => {
        this.editingViolationId = null;
        this.toast.success(this.t('تم تحديث نوع المخالفة.', 'Violation type updated successfully.'));
        this.loadAllViolations();
      },
      error: error => this.toast.error(getErrorMessage(error, this.t('تعذر تحديث نوع المخالفة.', 'Failed to update violation type.')))
    });
  }

  toggleViolation(id: number) {
    this.api.put<any>(`/api/disciplinary/violations/${id}/toggle`, {}).subscribe({
      next: () => this.loadAllViolations(),
      error: error => this.toast.error(getErrorMessage(error, this.t('تعذر تحديث حالة النوع.', 'Failed to toggle violation type.')))
    });
  }

  closeConfirmDialog() {
    if (!this.saving) this.confirmDialogOpen.set(false);
  }

  submitConfirmDialog() {
    if (this.saving || !this.confirmDialogAction) return;
    this.confirmDialogAction();
  }

  applyFilters() {
    let list = [...this.cases()];
    const search = this.filterSearch.trim().toLowerCase();

    if (search) {
      list = list.filter(item =>
        [item.employeeNameAr, item.employeeCode, item.violationDescription, item.departmentAr, item.violationNameAr]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(search)
      );
    }

    if (this.filterStatus) list = list.filter(item => item.status === this.filterStatus);
    if (this.filterViolation) list = list.filter(item => String(item.violationTypeId) === this.filterViolation);
    if (this.filterDate) list = list.filter(item => String(item.violationDate).slice(0, 10) === this.filterDate);

    this.filtered.set(list);
  }

  resetFilters() {
    this.filterSearch = '';
    this.filterStatus = '';
    this.filterViolation = '';
    this.filterDate = '';
    this.filterDateInputType = 'text';
    this.applyFilters();
  }

  activateDateInput(target: 'filter' | 'form') {
    if (target === 'filter') this.filterDateInputType = 'date';
    else this.formDateInputType = 'date';
  }

  normalizeDateInput(target: 'filter' | 'form') {
    if (target === 'filter' && !this.filterDate) this.filterDateInputType = 'text';
    if (target === 'form' && !this.form.violationDate) this.formDateInputType = 'text';
  }

  emptyForm() {
    return {
      employeeId: 0,
      violationTypeId: 0,
      violationDate: '',
      penaltyType: 'warning_verbal',
      violationDescription: '',
      notes: '',
      reportedBy: ''
    };
  }

  penaltyLabel(p: string) { return this.lang === 'ar' ? (PENALTY_LABELS_AR[p] ?? p) : (PENALTY_LABELS_EN[p] ?? p); }
  statusLabel(s: string) { return this.lang === 'ar' ? (STATUS_LABELS_AR[s] ?? s) : (STATUS_LABELS_EN[s] ?? s); }
  statusBadge(s: string) {
    const colors: Record<string, string> = {
      draft: 'neutral',
      open: 'warning',
      investigating: 'info',
      decided: 'success',
      closed: 'success',
      cancelled: 'danger'
    };
    return colors[s] ?? 'neutral';
  }

  penaltyBadge(p: string) {
    if (p === 'termination') return 'danger';
    if (p?.includes('suspension')) return 'warning';
    if (p?.includes('deduction')) return 'warning';
    if (p?.includes('final')) return 'danger';
    if (p?.includes('written')) return 'info';
    return 'neutral';
  }

  isOverdue(d: string) {
    return d && new Date(`${d}T00:00:00`) < new Date(new Date().toDateString());
  }

  getPenaltyLevelClass(levelKey: string, currentKey: string) {
    const order = ['warning_verbal', 'warning_written', 'warning_written_2', 'warning_final', 'termination'];
    const li = order.indexOf(levelKey);
    const ci = order.indexOf(currentKey);
    if (li < ci) return 'past';
    if (li === ci) return 'current';
    return '';
  }

  private openConfirmDialog(title: string, message: string, confirmLabel: string, action: () => void, tone: 'primary' | 'danger' = 'primary') {
    this.confirmDialogTitle = title;
    this.confirmDialogMessage = message;
    this.confirmDialogLabel = confirmLabel;
    this.confirmDialogTone = tone;
    this.confirmDialogAction = action;
    this.confirmDialogOpen.set(true);
  }

  private executeDecisionSave() {
    this.saving = true;
    this.saveMsg = '';
    this.saveErr = false;
    this.api.put<any>(`/api/disciplinary/${this.caseDetail()!.id}/decision`, this.decForm).subscribe({
      next: () => {
        this.saving = false;
        this.confirmDialogOpen.set(false);
        this.saveMsg = this.t('تم تسجيل القرار بنجاح', 'Decision recorded successfully.');
        this.toast.success(this.saveMsg);
        this.loadList();
        this.openDetail(this.caseDetail()!.id);
      },
      error: e => {
        this.saving = false;
        this.saveMsg = getErrorMessage(e, this.t('تعذر تسجيل القرار.', 'Failed to record decision.'));
        this.saveErr = true;
        this.toast.error(this.saveMsg);
      }
    });
  }

  private executeStatusChange(status: string) {
    this.saving = true;
    this.api.put<any>(`/api/disciplinary/${this.caseDetail()!.id}/status`, { status }).subscribe({
      next: () => {
        this.saving = false;
        this.confirmDialogOpen.set(false);
        this.toast.success(this.t('تم تحديث حالة القضية.', 'Case status updated successfully.'));
        this.loadList();
        this.openDetail(this.caseDetail()!.id);
      },
      error: error => {
        this.saving = false;
        this.toast.error(getErrorMessage(error, this.t('تعذر تحديث حالة القضية.', 'Failed to update case status.')));
      }
    });
  }

  private executeCloseCase() {
    this.saving = true;
    this.api.put<any>(`/api/disciplinary/${this.caseDetail()!.id}/close`, {}).subscribe({
      next: () => {
        this.saving = false;
        this.confirmDialogOpen.set(false);
        this.toast.success(this.t('تم إغلاق القضية بنجاح.', 'Case closed successfully.'));
        this.loadList();
        this.openDetail(this.caseDetail()!.id);
      },
      error: error => {
        this.saving = false;
        this.toast.error(getErrorMessage(error, this.t('تعذر إغلاق القضية.', 'Failed to close case.')));
      }
    });
  }

  private submitCancelCase() {
    if (this.saving) return;
    this.saving = true;
    this.api.put<any>(`/api/disciplinary/${this.caseDetail()!.id}/cancel`, { reason: '' }).subscribe({
      next: () => {
        this.saving = false;
        this.confirmDialogOpen.set(false);
        this.toast.info(this.t('تم إلغاء القضية.', 'Case cancelled.'));
        this.backToList();
      },
      error: error => {
        this.saving = false;
        this.saveMsg = getErrorMessage(error, this.t('تعذر إلغاء القضية.', 'Failed to cancel case.'));
        this.saveErr = true;
        this.toast.error(this.saveMsg);
      }
    });
  }
}
