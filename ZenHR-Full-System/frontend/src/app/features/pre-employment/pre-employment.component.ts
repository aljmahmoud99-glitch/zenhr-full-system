import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { getErrorMessage } from '../../core/utils/error-message';
import { ConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog.component';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface EmployeeOption {
  id: number;
  employeeCode: string;
  fullNameAr?: string;
  fullNameEn?: string;
  departmentNameAr?: string;
  departmentNameEn?: string;
  jobTitleAr?: string;
  jobTitleEn?: string;
}

interface PreEmploymentRecord {
  id: number;
  employeeId: number;
  employeeCode: string;
  employeeNameAr: string;
  employeeNameEn: string;
  departmentAr?: string;
  departmentEn?: string;
  jobTitleAr?: string;
  jobTitleEn?: string;
  probationStartDate: string;
  probationEndDate: string;
  evaluationStatus: string;
  performanceRating?: number | null;
  outcome?: string | null;
  sscRegistered: boolean;
  sscRegistrationDate?: string | null;
  sscRegistrationRequiredMonth?: number | null;
  sscRegistrationRequiredYear?: number | null;
  sscStatus?: string | null;
  sscNotes?: string | null;
  policeClearanceProvided?: boolean;
  medicalCertificateProvided?: boolean;
  sscNumber?: string | null;
}

interface EmployeeDocumentItem {
  id?: number;
  employeeId: number;
  documentTypeId: number;
  documentTypeCode: string;
  documentTypeNameAr: string;
  documentTypeNameEn?: string | null;
  status: string;
  linkedModule?: string | null;
  complianceRelated?: boolean;
  preEmploymentRelated?: boolean;
  issuedDate?: string | null;
  expiryDate?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  daysUntilExpiry?: number | null;
}

@Component({
  selector: 'app-pre-employment',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent],
  templateUrl: './pre-employment.component.html',
  styleUrl: './pre-employment.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PreEmploymentComponent implements OnInit {
  records = signal<PreEmploymentRecord[]>([]);
  filteredRecords = signal<PreEmploymentRecord[]>([]);
  employees = signal<EmployeeOption[]>([]);
  loading = signal(true);
  error = signal('');

  searchQuery = '';
  filterStatus = '';

  showAddModal = signal(false);
  showSscModal = signal(false);
  showDocumentsModal = signal(false);
  submitting = signal(false);
  sscSubmitting = signal(false);
  deleting = signal(false);
  loadingDocuments = signal(false);
  formAttempted = signal(false);
  sscAttempted = signal(false);
  formError = signal('');
  sscError = signal('');
  documentsError = signal('');

  selectedSscRecord = signal<PreEmploymentRecord | null>(null);
  pendingDeleteRecord = signal<PreEmploymentRecord | null>(null);
  selectedDocumentRecord = signal<PreEmploymentRecord | null>(null);
  employeeDocuments = signal<EmployeeDocumentItem[]>([]);
  missingDocuments = signal<EmployeeDocumentItem[]>([]);

  addForm = {
    employeeId: 0,
    probationStartDate: ''
  };

  sscForm = {
    registrationDate: new Date().toISOString().slice(0, 10),
    sscNumber: '',
    status: 'registered',
    notes: ''
  };

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private router: Router,
    private toast: ToastService
  ) {}

  get lang() {
    return this.auth.lang;
  }

  get allRecords() {
    return this.records();
  }

  get visibleRecords() {
    return this.filteredRecords();
  }

  get allEmployees() {
    return this.employees();
  }

  get hasActiveFilters() {
    return !!(this.searchQuery.trim() || this.filterStatus);
  }

  get probationEndDate() {
    return this.calculateProbationEndDate(this.addForm.probationStartDate);
  }

  get hasDuplicateActiveProbation() {
    return !!(this.addForm.employeeId && this.activeProbationForEmployee(this.addForm.employeeId));
  }

  ngOnInit() {
    this.loadEmployees();
    this.loadRecords();
  }

  t(ar: string, en: string) {
    return this.lang === 'ar' ? ar : en;
  }

  loadEmployees() {
    this.api.get<ApiResponse<any[]>>('/api/employees').subscribe({
      next: response => {
        const items = (response.data ?? []).map(employee => ({
          id: employee.id,
          employeeCode: employee.employeeCode,
          fullNameAr: employee.fullNameAr ?? `${employee.firstNameAr ?? ''} ${employee.lastNameAr ?? ''}`.trim(),
          fullNameEn: employee.fullNameEn ?? `${employee.firstNameEn ?? ''} ${employee.lastNameEn ?? ''}`.trim(),
          departmentNameAr: employee.departmentNameAr,
          departmentNameEn: employee.departmentNameEn,
          jobTitleAr: employee.jobTitleAr,
          jobTitleEn: employee.jobTitleEn
        }));
        this.employees.set(items);
      }
    });
  }

  loadRecords() {
    this.loading.set(true);
    this.error.set('');
    this.api.get<ApiResponse<PreEmploymentRecord[]>>('/api/pre-employment').subscribe({
      next: response => {
        this.records.set(response.data ?? []);
        this.applyFilters();
        this.loading.set(false);
      },
      error: apiError => {
        this.error.set(getErrorMessage(apiError, this.t('تعذر تحميل سجلات ما قبل التوظيف.', 'Failed to load pre-employment records.')));
        this.loading.set(false);
      }
    });
  }

  applyFilters() {
    const term = this.searchQuery.trim().toLowerCase();
    const status = this.filterStatus;

    this.filteredRecords.set(
      this.records().filter(record => {
        const haystack = [
          record.employeeCode,
          record.employeeNameAr,
          record.employeeNameEn,
          record.departmentAr,
          record.departmentEn,
          record.jobTitleAr,
          record.jobTitleEn,
          this.statusLabel(record.evaluationStatus)
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        const matchesSearch = !term || haystack.includes(term);
        const matchesStatus = !status || record.evaluationStatus === status;
        return matchesSearch && matchesStatus;
      })
    );
  }

  clearFilters() {
    this.searchQuery = '';
    this.filterStatus = '';
    this.applyFilters();
  }

  openAddModal() {
    this.formAttempted.set(false);
    this.formError.set('');
    this.addForm = {
      employeeId: 0,
      probationStartDate: ''
    };
    this.showAddModal.set(true);
  }

  closeAddModal() {
    if (this.submitting()) {
      return;
    }
    this.showAddModal.set(false);
    this.formAttempted.set(false);
    this.formError.set('');
  }

  createRecord() {
    this.formAttempted.set(true);
    this.formError.set('');

    if (!this.addForm.employeeId || !this.addForm.probationStartDate) {
      this.formError.set(this.t('يرجى تعبئة الحقول المطلوبة.', 'Please complete the required fields.'));
      return;
    }

    if (this.hasDuplicateActiveProbation) {
      this.formError.set(this.t('الموظف لديه فترة تجربة نشطة.', 'This employee already has an active probation period.'));
      return;
    }

    if (this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.api.post<ApiResponse<any>>('/api/pre-employment', {
      employeeId: this.addForm.employeeId,
      probationStartDate: this.addForm.probationStartDate
    }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.showAddModal.set(false);
        this.toast.success(this.t('تمت إضافة سجل فترة التجربة بنجاح.', 'Probation record created successfully.'));
        this.loadRecords();
      },
      error: apiError => {
        this.submitting.set(false);
        const message = getErrorMessage(apiError, this.t('تعذر حفظ سجل فترة التجربة.', 'Failed to save probation record.'));
        this.formError.set(message);
        this.toast.error(message);
      }
    });
  }

  openSscModal(record: PreEmploymentRecord) {
    this.selectedSscRecord.set(record);
    this.sscAttempted.set(false);
    this.sscError.set('');
    this.sscForm = {
      registrationDate: record.sscRegistrationDate ? String(record.sscRegistrationDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
      sscNumber: record.sscNumber ?? '',
      status: record.sscStatus ?? 'registered',
      notes: record.sscNotes ?? ''
    };
    this.showSscModal.set(true);
  }

  closeSscModal() {
    if (this.sscSubmitting()) {
      return;
    }
    this.showSscModal.set(false);
    this.selectedSscRecord.set(null);
    this.sscAttempted.set(false);
    this.sscError.set('');
  }

  submitSsc() {
    this.sscAttempted.set(true);
    this.sscError.set('');
    const record = this.selectedSscRecord();

    if (!record) {
      return;
    }

    if (!this.sscForm.registrationDate || !this.sscForm.sscNumber.trim() || !this.sscForm.status) {
      this.sscError.set(this.t('يرجى تعبئة بيانات الضمان المطلوبة.', 'Please complete the required SSC fields.'));
      return;
    }

    if (this.sscSubmitting()) {
      return;
    }

    this.sscSubmitting.set(true);
    this.api.put<ApiResponse<any>>(`/api/pre-employment/${record.id}/ssc-register`, {
      registrationDate: this.sscForm.registrationDate,
      sscNumber: this.sscForm.sscNumber.trim(),
      status: this.sscForm.status,
      notes: this.sscForm.notes.trim() || null
    }).subscribe({
      next: () => {
        this.sscSubmitting.set(false);
        this.closeSscModal();
        this.toast.success(this.t('تم تحديث بيانات الضمان الاجتماعي بنجاح.', 'Social security data updated successfully.'));
        this.loadRecords();
      },
      error: apiError => {
        this.sscSubmitting.set(false);
        const message = getErrorMessage(apiError, this.t('تعذر تحديث بيانات الضمان الاجتماعي.', 'Failed to update social security data.'));
        this.sscError.set(message);
        this.toast.error(message);
      }
    });
  }

  openEvaluation(record: PreEmploymentRecord) {
    this.router.navigate(['/app/pre-employment/evaluation', record.employeeId]);
  }

  openDocumentsModal(record: PreEmploymentRecord) {
    this.selectedDocumentRecord.set(record);
    this.showDocumentsModal.set(true);
    this.loadDocumentChecklist(record.employeeId);
  }

  closeDocumentsModal() {
    if (this.loadingDocuments()) {
      return;
    }
    this.showDocumentsModal.set(false);
    this.selectedDocumentRecord.set(null);
    this.employeeDocuments.set([]);
    this.missingDocuments.set([]);
    this.documentsError.set('');
  }

  loadDocumentChecklist(employeeId: number) {
    this.loadingDocuments.set(true);
    this.documentsError.set('');

    this.api.get<ApiResponse<EmployeeDocumentItem[]>>('/api/documents', { employeeId }).subscribe({
      next: response => {
        const docs = (response.data ?? []).filter(item => this.isPreEmploymentDocument(item));
        this.employeeDocuments.set(docs);
        this.loadingDocuments.set(false);
      },
      error: apiError => {
        this.employeeDocuments.set([]);
        this.documentsError.set(getErrorMessage(apiError, this.t('تعذر تحميل مستندات الموظف.', 'Failed to load employee documents.')));
        this.loadingDocuments.set(false);
      }
    });

    this.api.get<ApiResponse<EmployeeDocumentItem[]>>('/api/documents', { employeeId, missingRequiredOnly: true }).subscribe({
      next: response => {
        const docs = (response.data ?? []).filter(item => this.isPreEmploymentDocument(item));
        this.missingDocuments.set(docs);
      },
      error: () => this.missingDocuments.set([])
    });
  }

  openDocumentCenter(record: PreEmploymentRecord) {
    this.router.navigate(['/app/documents'], {
      queryParams: {
        employeeId: record.employeeId,
        missing: 1
      }
    });
  }

  requestDelete(record: PreEmploymentRecord) {
    this.pendingDeleteRecord.set(record);
  }

  closeDeleteDialog() {
    if (this.deleting()) {
      return;
    }
    this.pendingDeleteRecord.set(null);
  }

  confirmDelete() {
    const record = this.pendingDeleteRecord();
    if (!record || this.deleting()) {
      return;
    }

    this.deleting.set(true);
    this.api.delete<ApiResponse<any>>(`/api/pre-employment/${record.id}`).subscribe({
      next: () => {
        this.deleting.set(false);
        this.pendingDeleteRecord.set(null);
        this.toast.success(this.t('تم حذف السجل بنجاح.', 'Record deleted successfully.'));
        this.loadRecords();
      },
      error: apiError => {
        this.deleting.set(false);
        this.toast.error(getErrorMessage(apiError, this.t('تعذر حذف السجل.', 'Failed to delete record.')));
      }
    });
  }

  calculateProbationEndDate(startDate: string) {
    if (!startDate) {
      return '';
    }

    const date = new Date(`${startDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    date.setMonth(date.getMonth() + 3);
    return date.toISOString().slice(0, 10);
  }

  activeProbationForEmployee(employeeId: number) {
    return this.records().find(record => record.employeeId === employeeId && ['pending', 'extended'].includes(record.evaluationStatus));
  }

  selectedEmployee() {
    return this.employees().find(employee => employee.id === this.addForm.employeeId) ?? null;
  }

  employeeName(recordOrEmployee: {
    fullNameAr?: string;
    fullNameEn?: string;
    employeeNameAr?: string;
    employeeNameEn?: string;
  }) {
    const ar = recordOrEmployee.fullNameAr || recordOrEmployee.employeeNameAr || '—';
    const en = recordOrEmployee.fullNameEn || recordOrEmployee.employeeNameEn || ar;
    return this.lang === 'ar'
      ? ar
      : en;
  }

  statusLabel(status: string) {
    const labels: Record<string, { ar: string; en: string }> = {
      pending: { ar: 'قيد التجربة', en: 'In Probation' },
      passed: { ar: 'تم التثبيت', en: 'Confirmed' },
      extended: { ar: 'تمديد', en: 'Extended' },
      failed: { ar: 'مرفوض', en: 'Rejected' }
    };

    const value = labels[status];
    return value ? this.t(value.ar, value.en) : status;
  }

  statusClass(status: string) {
    const classes: Record<string, string> = {
      pending: 'warning',
      passed: 'success',
      extended: 'info',
      failed: 'danger'
    };

    return classes[status] ?? 'neutral';
  }

  sscStatusLabel(status?: string | null, registered?: boolean) {
    if (registered && !status) {
      return this.t('مسجل', 'Registered');
    }

    const labels: Record<string, { ar: string; en: string }> = {
      pending: { ar: 'بانتظار التسجيل', en: 'Pending Registration' },
      registered: { ar: 'مسجل', en: 'Registered' },
      delayed: { ar: 'متأخر', en: 'Delayed' }
    };

    const value = status ? labels[status] : null;
    return value ? this.t(value.ar, value.en) : this.t('غير متوفر', 'Unavailable');
  }

  monthLabel(month?: number | null, year?: number | null) {
    if (!month || !year) {
      return '—';
    }

    const arMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const enMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${this.lang === 'ar' ? arMonths[month - 1] : enMonths[month - 1]} ${year}`;
  }

  trackByRecord(_: number, record: PreEmploymentRecord) {
    return record.id;
  }

  isPreEmploymentDocument(item: EmployeeDocumentItem) {
    return !!item.preEmploymentRelated || !!item.complianceRelated || item.linkedModule === 'pre_employment';
  }

  documentTypeLabel(item: EmployeeDocumentItem) {
    return this.lang === 'ar'
      ? item.documentTypeNameAr
      : (item.documentTypeNameEn || item.documentTypeNameAr);
  }

  documentStatusLabel(status: string) {
    const labels: Record<string, { ar: string; en: string }> = {
      valid: { ar: 'ساري', en: 'Valid' },
      expiring_soon: { ar: 'ينتهي قريباً', en: 'Expiring soon' },
      expired: { ar: 'منتهي', en: 'Expired' },
      missing: { ar: 'مفقود', en: 'Missing' }
    };
    const value = labels[status];
    return value ? this.t(value.ar, value.en) : status;
  }

  documentStatusClass(status: string) {
    if (status === 'valid') return 'success';
    if (status === 'expiring_soon') return 'warning';
    if (status === 'expired' || status === 'missing') return 'danger';
    return 'neutral';
  }

  daysLabel(days?: number | null) {
    if (days == null) return '—';
    if (days < 0) return this.t('منتهي', 'Expired');
    return this.t(`${days} يوم`, `${days} days`);
  }
}
