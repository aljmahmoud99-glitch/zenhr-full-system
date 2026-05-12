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

interface ContractType {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string;
  defaultDurationMonths?: number | null;
  defaultProbationDays?: number | null;
  renewalNoticeDays?: number | null;
  isActive: boolean;
}

interface ContractRow {
  id: number;
  employeeId: number;
  contractTypeId: number;
  contractNumber?: string | null;
  titleAr: string;
  titleEn: string;
  startDate: string;
  endDate?: string | null;
  probationEndDate?: string | null;
  renewalNoticeDate?: string | null;
  renewalStatus: string;
  contractStatus: string;
  complianceStatus: string;
  autoRenewal: boolean;
  salaryAmount?: string | number | null;
  currency: string;
  notesAr?: string | null;
  notesEn?: string | null;
  employeeCode?: string;
  employeeNameAr?: string;
  employeeNameEn?: string;
  departmentNameAr?: string;
  departmentNameEn?: string;
  contractTypeCode?: string;
  contractTypeNameAr?: string;
  contractTypeNameEn?: string;
  daysUntilExpiry?: number | null;
  attachmentsCount?: number;
  requiredDocumentsCount?: number;
}

const EMPTY_FORM = {
  id: null as number | null,
  employeeId: null as number | null,
  contractTypeId: null as number | null,
  contractNumber: '',
  titleAr: '',
  titleEn: '',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  probationEndDate: '',
  renewalNoticeDate: '',
  renewalStatus: 'not_required',
  contractStatus: 'active',
  complianceStatus: 'pending_review',
  autoRenewal: false,
  salaryAmount: null as number | null,
  currency: 'JOD',
  notesAr: '',
  notesEn: ''
};

@Component({
  selector: 'app-compliance-contracts',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './compliance-contracts.component.html',
  styleUrl: './compliance-contracts.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ComplianceContractsComponent implements OnInit {
  loading = false;
  saving = false;
  typeSaving = false;
  error = '';

  dashboard: any = {};
  contracts: ContractRow[] = [];
  contractTypes: ContractType[] = [];
  employees: EmployeeOption[] = [];
  selectedContract: any = null;
  detailsLoading = false;

  page = 1;
  pageSize = 12;
  total = 0;
  totalPages = 1;

  filters = {
    q: '',
    status: '',
    complianceStatus: '',
    contractTypeId: '',
    expiringDays: ''
  };

  dialogOpen = false;
  typeDialogOpen = false;
  form = { ...EMPTY_FORM };
  typeForm = {
    id: null as number | null,
    code: '',
    nameAr: '',
    nameEn: '',
    descriptionAr: '',
    descriptionEn: '',
    defaultDurationMonths: null as number | null,
    defaultProbationDays: 90,
    renewalNoticeDays: 30,
    requiresAttachment: true,
    isActive: true
  };

  contractStatuses = [
    { value: 'draft', ar: 'مسودة', en: 'Draft' },
    { value: 'active', ar: 'نشط', en: 'Active' },
    { value: 'pending_renewal', ar: 'بانتظار التجديد', en: 'Pending renewal' },
    { value: 'expired', ar: 'منتهي', en: 'Expired' },
    { value: 'terminated', ar: 'منهى', en: 'Terminated' },
    { value: 'superseded', ar: 'مستبدل', en: 'Superseded' }
  ];

  complianceStatuses = [
    { value: 'compliant', ar: 'ملتزم', en: 'Compliant' },
    { value: 'warning', ar: 'تنبيه', en: 'Warning' },
    { value: 'critical', ar: 'حرج', en: 'Critical' },
    { value: 'missing_documents', ar: 'مستندات ناقصة', en: 'Missing documents' },
    { value: 'pending_review', ar: 'بانتظار المراجعة', en: 'Pending review' }
  ];

  renewalStatuses = [
    { value: 'not_required', ar: 'غير مطلوب', en: 'Not required' },
    { value: 'pending_review', ar: 'بانتظار المراجعة', en: 'Pending review' },
    { value: 'renewed', ar: 'تم التجديد', en: 'Renewed' },
    { value: 'not_renewed', ar: 'لن يجدد', en: 'Not renewed' },
    { value: 'expired', ar: 'منتهي', en: 'Expired' }
  ];

  constructor(
    public lang: LangService,
    private api: ApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadAll();
  }

  t(ar: string, en: string): string {
    return this.lang.isAr ? ar : en;
  }

  label(item: any): string {
    if (!item) return '';
    return this.lang.isAr
      ? (item.nameAr || item.titleAr || item.employeeNameAr || item.nameEn || item.titleEn || item.code || '')
      : (item.nameEn || item.titleEn || item.employeeNameEn || item.nameAr || item.titleAr || item.code || '');
  }

  employeeLabel(emp: EmployeeOption): string {
    const ar = emp.fullNameAr || [emp.firstNameAr, emp.middleNameAr, emp.lastNameAr].filter(Boolean).join(' ');
    const en = emp.fullNameEn || [emp.firstNameEn, emp.middleNameEn, emp.lastNameEn].filter(Boolean).join(' ');
    return `${this.lang.isAr ? (ar || en) : (en || ar)}${emp.employeeCode ? ' / ' + emp.employeeCode : ''}`;
  }

  statusLabel(value: string, group: Array<{ value: string; ar: string; en: string }>): string {
    const item = group.find(s => s.value === value);
    return item ? this.t(item.ar, item.en) : value;
  }

  loadAll(): void {
    this.loadDashboard();
    this.loadTypes();
    this.loadEmployees();
    this.loadContracts();
  }

  loadDashboard(): void {
    this.api.get<ApiResponse<any>>('/api/compliance-contracts/dashboard')
      .subscribe({
        next: res => { this.dashboard = res.data || {}; this.cdr.markForCheck(); },
        error: err => { this.error = err?.error?.message || this.t('تعذر تحميل لوحة الامتثال والعقود.', 'Unable to load compliance dashboard.'); this.cdr.markForCheck(); }
      });
  }

  loadTypes(): void {
    this.api.get<ApiResponse<ContractType[]>>('/api/compliance-contracts/types')
      .subscribe({
        next: res => { this.contractTypes = res.data || []; this.cdr.markForCheck(); },
        error: err => this.toast.error(err?.error?.message || this.t('تعذر تحميل أنواع العقود.', 'Unable to load contract types.'))
      });
  }

  loadEmployees(): void {
    this.api.get<ApiResponse<any>>('/api/employees', { pageSize: 100 })
      .subscribe({
        next: res => {
          const data = res.data;
          this.employees = Array.isArray(data) ? data : (data?.items || []);
          this.cdr.markForCheck();
        }
      });
  }

  loadContracts(page = this.page): void {
    this.loading = true;
    this.error = '';
    this.page = page;
    this.api.get<ApiResponse<any>>('/api/compliance-contracts/contracts', {
      page: this.page,
      pageSize: this.pageSize,
      q: this.filters.q,
      status: this.filters.status,
      complianceStatus: this.filters.complianceStatus,
      contractTypeId: this.filters.contractTypeId,
      expiringDays: this.filters.expiringDays
    }).pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: res => {
          const data = res.data || {};
          this.contracts = data.items || [];
          this.total = data.total || 0;
          this.totalPages = data.totalPages || 1;
        },
        error: err => {
          this.error = err?.error?.message || this.t('تعذر تحميل العقود.', 'Unable to load contracts.');
        }
      });
  }

  resetFilters(): void {
    this.filters = { q: '', status: '', complianceStatus: '', contractTypeId: '', expiringDays: '' };
    this.loadContracts(1);
  }

  openCreate(): void {
    this.form = { ...EMPTY_FORM, startDate: new Date().toISOString().slice(0, 10) };
    if (this.contractTypes[0]) this.form.contractTypeId = this.contractTypes[0].id;
    if (this.employees[0]) this.form.employeeId = this.employees[0].id;
    this.dialogOpen = true;
  }

  openEdit(row: ContractRow): void {
    this.form = {
      ...EMPTY_FORM,
      id: row.id,
      employeeId: row.employeeId,
      contractTypeId: row.contractTypeId,
      contractNumber: row.contractNumber || '',
      titleAr: row.titleAr || '',
      titleEn: row.titleEn || '',
      startDate: this.asDate(row.startDate),
      endDate: this.asDate(row.endDate),
      probationEndDate: this.asDate(row.probationEndDate),
      renewalNoticeDate: this.asDate(row.renewalNoticeDate),
      renewalStatus: row.renewalStatus || 'not_required',
      contractStatus: row.contractStatus || 'active',
      complianceStatus: row.complianceStatus || 'pending_review',
      autoRenewal: !!row.autoRenewal,
      salaryAmount: row.salaryAmount == null ? null : Number(row.salaryAmount),
      currency: row.currency || 'JOD',
      notesAr: row.notesAr || '',
      notesEn: row.notesEn || ''
    };
    this.dialogOpen = true;
  }

  saveContract(): void {
    if (!this.form.employeeId || !this.form.contractTypeId || !this.form.titleAr || !this.form.titleEn || !this.form.startDate) {
      this.toast.warning(this.t('أكمل بيانات العقد الأساسية قبل الحفظ.', 'Complete the required contract fields before saving.'));
      return;
    }
    this.saving = true;
    const body = { ...this.form };
    const request = this.form.id
      ? this.api.patch<ApiResponse<ContractRow>>(`/api/compliance-contracts/contracts/${this.form.id}`, body)
      : this.api.post<ApiResponse<ContractRow>>('/api/compliance-contracts/contracts', body);
    request.pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => {
          this.dialogOpen = false;
          this.toast.success(this.t('تم حفظ العقد بنجاح.', 'Contract saved successfully.'));
          this.loadDashboard();
          this.loadContracts(this.page);
        },
        error: err => this.toast.error(err?.error?.message || this.t('تعذر حفظ العقد.', 'Unable to save contract.'))
      });
  }

  deleteContract(row: ContractRow): void {
    if (!confirm(this.t('هل تريد حذف هذا العقد؟', 'Delete this contract?'))) return;
    this.api.delete<ApiResponse<any>>(`/api/compliance-contracts/contracts/${row.id}`)
      .subscribe({
        next: () => {
          this.toast.success(this.t('تم حذف العقد.', 'Contract deleted.'));
          this.loadDashboard();
          this.loadContracts(this.page);
        },
        error: err => this.toast.error(err?.error?.message || this.t('تعذر حذف العقد.', 'Unable to delete contract.'))
      });
  }

  viewDetails(row: ContractRow): void {
    this.detailsLoading = true;
    this.selectedContract = null;
    this.api.get<ApiResponse<any>>(`/api/compliance-contracts/contracts/${row.id}`)
      .pipe(finalize(() => { this.detailsLoading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: res => this.selectedContract = res.data,
        error: err => this.toast.error(err?.error?.message || this.t('تعذر تحميل تفاصيل العقد.', 'Unable to load contract details.'))
      });
  }

  openTypeCreate(): void {
    this.typeForm = {
      id: null,
      code: '',
      nameAr: '',
      nameEn: '',
      descriptionAr: '',
      descriptionEn: '',
      defaultDurationMonths: null,
      defaultProbationDays: 90,
      renewalNoticeDays: 30,
      requiresAttachment: true,
      isActive: true
    };
    this.typeDialogOpen = true;
  }

  saveType(): void {
    if (!this.typeForm.code || !this.typeForm.nameAr || !this.typeForm.nameEn) {
      this.toast.warning(this.t('أدخل كود ونوع العقد بالعربية والإنجليزية.', 'Enter code, Arabic name, and English name.'));
      return;
    }
    this.typeSaving = true;
    this.api.post<ApiResponse<ContractType>>('/api/compliance-contracts/types', this.typeForm)
      .pipe(finalize(() => { this.typeSaving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: res => {
          this.typeDialogOpen = false;
          this.contractTypes = [res.data, ...this.contractTypes];
          this.form.contractTypeId = res.data.id;
          this.toast.success(this.t('تمت إضافة نوع العقد.', 'Contract type added.'));
          this.cdr.markForCheck();
        },
        error: err => this.toast.error(err?.error?.message || this.t('تعذر حفظ نوع العقد.', 'Unable to save contract type.'))
      });
  }

  expiryClass(row: ContractRow): string {
    const days = row.daysUntilExpiry;
    if (days == null) return 'neutral';
    if (days < 0) return 'danger';
    if (days <= 30) return 'warning';
    return 'success';
  }

  complianceClass(status: string): string {
    if (status === 'compliant') return 'success';
    if (status === 'warning' || status === 'pending_review') return 'warning';
    return 'danger';
  }

  private asDate(value?: string | null): string {
    return value ? String(value).slice(0, 10) : '';
  }
}
