import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { RoleAccessService } from '../../core/services/role-access.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog.component';
import { getErrorMessage } from '../../core/utils/error-message';

type DocumentStatus = 'valid' | 'expiring_soon' | 'expired' | 'missing';

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, ConfirmDialogComponent],
  templateUrl: './documents.component.html',
  styleUrl: './documents.component.scss'
})
export class DocumentsComponent implements OnInit {
  readonly allDocuments = signal<any[]>([]);
  readonly missingRequired = signal<any[]>([]);
  readonly expiringAlerts = signal<any[]>([]);
  readonly summary = signal<any | null>(null);
  readonly docTypes = signal<any[]>([]);
  readonly employees = signal<any[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly deleting = signal(false);
  readonly exporting = signal(false);
  readonly formOpen = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
  readonly deleteTarget = signal<any | null>(null);
  readonly editingId = signal<number | null>(null);

  readonly searchTerm = signal('');
  readonly employeeFilter = signal('');
  readonly typeFilter = signal('');
  readonly statusFilter = signal('');
  readonly expiryFromFilter = signal('');
  readonly expiryToFilter = signal('');
  readonly complianceOnly = signal(false);
  readonly missingOnly = signal(false);

  readonly dash = '—';

  form = {
    employeeId: '',
    documentTypeId: '',
    documentNumber: '',
    issuedBy: '',
    issuedDate: '',
    expiryDate: '',
    fileName: '',
    fileUrl: '',
    notes: ''
  };

  readonly allowedUploadMimeTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  readonly maxUploadSizeBytes = 5 * 1024 * 1024;

  readonly employeeOptions = computed(() => {
    const map = new Map<number, { id: number; label: string }>();
    for (const employee of this.employees()) {
      map.set(employee.id, { id: employee.id, label: this.employeeLabel(employee) });
    }
    for (const item of this.allDocuments()) {
      if (!map.has(item.employeeId)) {
        map.set(item.employeeId, {
          id: item.employeeId,
          label: `${this.lang === 'ar' ? item.employeeNameAr : (item.employeeNameEn || item.employeeNameAr)} (${item.employeeCode})`
        });
      }
    }
    return Array.from(map.values());
  });

  readonly filteredDocuments = computed(() => {
    const source = this.missingOnly() ? this.missingRequired() : this.allDocuments();
    const search = this.searchTerm().trim().toLowerCase();
    const employeeId = this.employeeFilter();
    const typeId = this.typeFilter();
    const status = this.statusFilter();
    const expiryFrom = this.expiryFromFilter();
    const expiryTo = this.expiryToFilter();
    const complianceOnly = this.complianceOnly();

    return source.filter(item => {
      const matchesEmployee = !employeeId || String(item.employeeId) === String(employeeId);
      const matchesType = !typeId || String(item.documentTypeId ?? '') === String(typeId);
      const itemStatus = item.status ?? 'missing';
      const matchesStatus = !status || itemStatus === status;
      const matchesCompliance = !complianceOnly || !!item.complianceRelated;
      const docExpiry = item.expiryDate ? String(item.expiryDate).slice(0, 10) : '';
      const matchesExpiryFrom = !expiryFrom || (!!docExpiry && docExpiry >= expiryFrom);
      const matchesExpiryTo = !expiryTo || (!!docExpiry && docExpiry <= expiryTo);
      const haystack = [
        this.canManage ? item.employeeNameAr : '',
        this.canManage ? item.employeeNameEn : '',
        this.canManage ? item.employeeCode : '',
        this.canManage ? item.departmentAr : '',
        this.canManage ? item.departmentEn : '',
        item.documentNumber,
        item.documentTypeNameAr,
        item.documentTypeNameEn,
        item.issuedBy
      ].join(' ').toLowerCase();
      const matchesSearch = !search || haystack.includes(search);
      return matchesEmployee && matchesType && matchesStatus && matchesCompliance && matchesExpiryFrom && matchesExpiryTo && matchesSearch;
    });
  });

  readonly hasActiveFilters = computed(() => !!(
    this.searchTerm() ||
    this.employeeFilter() ||
    this.typeFilter() ||
    this.statusFilter() ||
    this.expiryFromFilter() ||
    this.expiryToFilter() ||
    this.complianceOnly() ||
    this.missingOnly()
  ));

  constructor(
    public auth: AuthService,
    private access: RoleAccessService,
    private api: ApiService,
    private toast: ToastService,
    private route: ActivatedRoute
  ) {}

  get lang() {
    return this.auth.lang;
  }

  get canManage() {
    return this.access.isAny('hradmin', 'superadmin', 'employee');
  }

  get canExport() {
    return this.access.isAny('hradmin', 'superadmin');
  }

  ngOnInit() {
    this.applyQueryFilters();
    this.loadDashboard();
    this.loadDocuments();
    this.loadDocTypes();
    if (this.canManage && !this.isEmployee) {
      this.loadEmployees();
    }
  }

  get isEmployee() {
    return this.access.isEmployee();
  }

  get myEmployeeId() {
    return this.auth.currentUser()?.employeeId ?? null;
  }

  t(ar: string, en: string) {
    return this.lang === 'ar' ? ar : en;
  }

  loadDashboard() {
    this.api.get<any>('/api/documents/summary').subscribe({
      next: response => this.summary.set(response.data ?? null),
      error: error => this.error.set(getErrorMessage(error, this.t('تعذر تحميل ملخص المستندات.', 'Failed to load document summary.')))
    });

    this.api.get<any>('/api/documents/expiring?days=30').subscribe({
      next: response => this.expiringAlerts.set(response.data ?? []),
      error: () => this.expiringAlerts.set([])
    });

    this.api.get<any>('/api/documents?missingRequiredOnly=true').subscribe({
      next: response => this.missingRequired.set(response.data ?? []),
      error: () => this.missingRequired.set([])
    });
  }

  applyQueryFilters() {
    const query = this.route.snapshot.queryParamMap;
    const employeeId = query.get('employeeId');
    const missing = query.get('missing');
    const compliance = query.get('compliance');
    const expiring = query.get('expiring');

    if (employeeId) this.employeeFilter.set(employeeId);
    if (missing === '1' || missing === 'true') this.missingOnly.set(true);
    if (compliance === '1' || compliance === 'true') this.complianceOnly.set(true);
    if (expiring === '30') {
      const now = new Date();
      const next = new Date();
      next.setDate(now.getDate() + 30);
      this.expiryFromFilter.set(now.toISOString().slice(0, 10));
      this.expiryToFilter.set(next.toISOString().slice(0, 10));
    }
  }

  loadDocuments() {
    this.loading.set(true);
    this.error.set('');
    this.api.get<any>('/api/documents').subscribe({
      next: response => {
        this.allDocuments.set(response.data ?? []);
        this.loading.set(false);
      },
      error: error => {
        this.error.set(getErrorMessage(error, this.t('تعذر تحميل مركز المستندات.', 'Failed to load document center.')));
        this.loading.set(false);
      }
    });
  }

  loadDocTypes() {
    this.api.get<any>('/api/lookups/document-types').subscribe({
      next: response => this.docTypes.set(response.data ?? []),
      error: () => this.docTypes.set([])
    });
  }

  loadEmployees() {
    this.api.get<any>('/api/employees').subscribe({
      next: response => this.employees.set(response.data ?? []),
      error: () => this.employees.set([])
    });
  }

  openCreateModal() {
    this.editingId.set(null);
    this.formError.set('');
    this.form = {
      employeeId: this.isEmployee && this.myEmployeeId ? String(this.myEmployeeId) : '',
      documentTypeId: '',
      documentNumber: '',
      issuedBy: '',
      issuedDate: '',
      expiryDate: '',
      fileName: '',
      fileUrl: '',
      notes: ''
    };
    this.formOpen.set(true);
  }

  openEditModal(item: any) {
    this.editingId.set(item.id ?? null);
    this.formError.set('');
    this.form = {
      employeeId: this.isEmployee && this.myEmployeeId ? String(this.myEmployeeId) : String(item.employeeId ?? ''),
      documentTypeId: String(item.documentTypeId ?? ''),
      documentNumber: item.documentNumber ?? '',
      issuedBy: item.issuedBy ?? '',
      issuedDate: item.issuedDate ? String(item.issuedDate).slice(0, 10) : '',
      expiryDate: item.expiryDate ? String(item.expiryDate).slice(0, 10) : '',
      fileName: item.fileName ?? '',
      fileUrl: item.fileUrl ?? '',
      notes: item.notes ?? ''
    };
    this.formOpen.set(true);
  }

  closeModal() {
    this.formOpen.set(false);
    this.saving.set(false);
    this.formError.set('');
  }

  saveDocument() {
    if (this.saving()) return;
    this.formError.set('');

    if (!this.form.employeeId || !this.form.documentTypeId) {
      this.formError.set(this.t('يرجى اختيار الموظف ونوع المستند.', 'Please choose an employee and document type.'));
      return;
    }

    if (this.isEmployee && this.myEmployeeId && Number(this.form.employeeId) !== Number(this.myEmployeeId)) {
      this.formError.set(this.t('غير مسموح برفع مستند لموظف آخر.', 'You cannot upload documents for another employee.'));
      return;
    }

    const type = this.docTypes().find(item => String(item.id) === String(this.form.documentTypeId));
    if (!type) {
      this.formError.set(this.t('نوع المستند غير متاح.', 'Document type is unavailable.'));
      return;
    }

    const meta = this.documentMeta(type.code);

    if (type.requiresExpiry && !this.form.expiryDate) {
      this.formError.set(this.t('تاريخ الانتهاء مطلوب لهذا النوع.', 'Expiry date is required for this document type.'));
      return;
    }

    if (meta.requiresAttachment && !this.form.fileName && !this.form.fileUrl) {
      this.formError.set(this.t('يرجى إدخال مرجع أو رابط للمرفق.', 'Please provide an attachment reference or link.'));
      return;
    }

    if (type.isRequired && !this.form.fileName && !this.form.fileUrl) {
      this.formError.set(this.t('هذا المستند مطلوب ولا يمكن حفظه بدون مرفق.', 'This is a required document and must have an attachment.'));
      return;
    }

    const payload = {
      employeeId: Number(this.form.employeeId),
      documentTypeId: Number(this.form.documentTypeId),
      documentNumber: this.form.documentNumber || null,
      issuedBy: this.form.issuedBy || null,
      issuedDate: this.form.issuedDate || null,
      expiryDate: this.form.expiryDate || null,
      fileName: this.form.fileName || null,
      fileUrl: this.form.fileUrl || null,
      notes: this.form.notes || null,
      alertDaysBefore: type.alertDaysBefore ?? null
    };

    this.saving.set(true);
    const request$ = this.editingId()
      ? this.api.put(`/api/documents/${this.editingId()}`, payload)
      : this.api.post('/api/documents', payload);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeModal();
        this.toast.success(this.t('تم حفظ المستند بنجاح.', 'Document saved successfully.'));
        this.loadDashboard();
        this.loadDocuments();
      },
      error: error => {
        this.saving.set(false);
        this.formError.set(getErrorMessage(error, this.t('تعذر حفظ المستند.', 'Failed to save document.')));
        this.toast.error(this.formError());
      }
    });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!this.form.employeeId) {
      this.formError.set(this.t('اختر الموظف أولاً قبل رفع الملف.', 'Select employee first before uploading a file.'));
      input.value = '';
      return;
    }

    if (file.size > this.maxUploadSizeBytes) {
      this.formError.set(this.t('حجم الملف يتجاوز 5 ميجابايت.', 'File size exceeds 5 MB.'));
      input.value = '';
      return;
    }

    if (!this.allowedUploadMimeTypes.includes(file.type.toLowerCase())) {
      this.formError.set(this.t('نوع الملف غير مدعوم. المسموح PDF أو صورة.', 'Unsupported file type. Allowed: PDF or image.'));
      input.value = '';
      return;
    }

    const body = new FormData();
    body.append('employeeId', String(this.form.employeeId));
    body.append('file', file);

    this.uploading.set(true);
    this.formError.set('');
    this.api.post<any>('/api/documents/upload', body).subscribe({
      next: response => {
        const uploaded = response?.data;
        this.form.fileName = uploaded?.fileName || file.name;
        this.form.fileUrl = uploaded?.fileUrl || '';
        this.uploading.set(false);
        this.toast.success(this.t('تم رفع الملف بنجاح.', 'File uploaded successfully.'));
      },
      error: error => {
        this.uploading.set(false);
        this.formError.set(getErrorMessage(error, this.t('تعذر رفع الملف.', 'Failed to upload file.')));
      }
    });
  }

  promptDelete(item: any) {
    this.deleteTarget.set(item);
  }

  cancelDelete() {
    this.deleteTarget.set(null);
    this.deleting.set(false);
  }

  confirmDelete() {
    const target = this.deleteTarget();
    if (!target?.id || this.deleting()) return;
    this.deleting.set(true);
    this.api.delete(`/api/documents/${target.id}`).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteTarget.set(null);
        this.toast.success(this.t('تم حذف المستند.', 'Document deleted.'));
        this.loadDashboard();
        this.loadDocuments();
      },
      error: error => {
        this.deleting.set(false);
        this.toast.error(getErrorMessage(error, this.t('تعذر حذف المستند.', 'Failed to delete document.')));
      }
    });
  }

  exportReport() {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.api.get<any>('/api/documents/export').subscribe({
      next: response => {
        this.exporting.set(false);
        const rows = response.data ?? [];
        const html = `
          <html dir="${this.lang === 'ar' ? 'rtl' : 'ltr'}" lang="${this.lang}">
            <head>
              <title>${this.t('تقرير المستندات', 'Documents report')}</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 24px; color: #172420; }
                h1 { margin: 0 0 16px; }
                table { width: 100%; border-collapse: collapse; margin-top: 16px; }
                th, td { border: 1px solid #dbe5df; padding: 10px; text-align: start; }
                th { background: #f1f8f4; }
              </style>
            </head>
            <body>
              <h1>${this.t('تقرير المستندات', 'Documents report')}</h1>
              <table>
                <thead>
                  <tr>
                    <th>${this.t('الموظف', 'Employee')}</th>
                    <th>${this.t('نوع المستند', 'Document type')}</th>
                    <th>${this.t('الحالة', 'Status')}</th>
                    <th>${this.t('تاريخ الانتهاء', 'Expiry date')}</th>
                    <th>${this.t('الوحدة المرتبطة', 'Linked module')}</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.map((item: any) => `
                    <tr>
                      <td>${this.lang === 'ar' ? item.employeeNameAr : (item.employeeNameEn || item.employeeNameAr)}</td>
                      <td>${this.lang === 'ar' ? item.documentTypeNameAr : (item.documentTypeNameEn || item.documentTypeNameAr)}</td>
                      <td>${this.statusLabel(item.status)}</td>
                      <td>${item.expiryDate ? item.expiryDate.slice(0, 10) : this.dash}</td>
                      <td>${this.linkedModuleLabel(item.linkedModule)}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </body>
          </html>`;
        const popup = window.open('', '_blank', 'width=980,height=760');
        if (popup) {
          popup.document.open();
          popup.document.write(html);
          popup.document.close();
          popup.focus();
          popup.print();
        }
      },
      error: error => {
        this.exporting.set(false);
        this.toast.error(getErrorMessage(error, this.t('تعذر تصدير التقرير.', 'Failed to export report.')));
      }
    });
  }

  printDocument(item: any) {
    const html = `
      <html dir="${this.lang === 'ar' ? 'rtl' : 'ltr'}" lang="${this.lang}">
        <head>
          <title>${this.t('ملخص المستند', 'Document summary')}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #172420; }
            h1 { margin-bottom: 18px; }
            .row { display: grid; grid-template-columns: 180px 1fr; gap: 12px; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
            .label { color: #64748b; font-weight: 700; }
          </style>
        </head>
        <body>
          <h1>${this.t('ملخص المستند', 'Document summary')}</h1>
          <div class="row"><div class="label">${this.t('الموظف', 'Employee')}</div><div>${this.employeeName(item)}</div></div>
          <div class="row"><div class="label">${this.t('نوع المستند', 'Document type')}</div><div>${this.documentTypeName(item)}</div></div>
          <div class="row"><div class="label">${this.t('رقم المستند', 'Document number')}</div><div>${item.documentNumber || this.dash}</div></div>
          <div class="row"><div class="label">${this.t('جهة الإصدار', 'Issued by')}</div><div>${item.issuedBy || this.dash}</div></div>
          <div class="row"><div class="label">${this.t('تاريخ الإصدار', 'Issue date')}</div><div>${item.issuedDate ? item.issuedDate.slice(0, 10) : this.dash}</div></div>
          <div class="row"><div class="label">${this.t('تاريخ الانتهاء', 'Expiry date')}</div><div>${item.expiryDate ? item.expiryDate.slice(0, 10) : this.dash}</div></div>
          <div class="row"><div class="label">${this.t('الحالة', 'Status')}</div><div>${this.statusLabel(item.status)}</div></div>
          <div class="row"><div class="label">${this.t('الوحدة المرتبطة', 'Linked module')}</div><div>${this.linkedModuleLabel(item.linkedModule)}</div></div>
          <div class="row"><div class="label">${this.t('المرفق', 'Attachment')}</div><div>${item.fileUrl || item.fileName || this.dash}</div></div>
          <div class="row"><div class="label">${this.t('ملاحظات', 'Notes')}</div><div>${item.notes || this.dash}</div></div>
        </body>
      </html>`;
    const popup = window.open('', '_blank', 'width=900,height=720');
    if (popup) {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.focus();
      popup.print();
    }
  }

  resetFilters() {
    this.searchTerm.set('');
    this.employeeFilter.set('');
    this.typeFilter.set('');
    this.statusFilter.set('');
    this.expiryFromFilter.set('');
    this.expiryToFilter.set('');
    this.complianceOnly.set(false);
    this.missingOnly.set(false);
  }

  filterExpiringWithin30() {
    this.missingOnly.set(false);
    const now = new Date();
    const next = new Date();
    next.setDate(now.getDate() + 30);
    this.expiryFromFilter.set(now.toISOString().slice(0, 10));
    this.expiryToFilter.set(next.toISOString().slice(0, 10));
  }

  employeeLabel(employee: any) {
    const name = this.lang === 'ar' ? (employee.fullNameAr || `${employee.firstNameAr || ''} ${employee.lastNameAr || ''}`.trim()) : (employee.fullNameEn || employee.fullNameAr || `${employee.firstNameEn || ''} ${employee.lastNameEn || ''}`.trim());
    return `${name} (${employee.employeeCode})`;
  }

  employeeName(item: any) {
    return this.lang === 'ar' ? item.employeeNameAr : (item.employeeNameEn || item.employeeNameAr);
  }

  documentTypeName(item: any) {
    return this.lang === 'ar' ? item.documentTypeNameAr : (item.documentTypeNameEn || item.documentTypeNameAr);
  }

  selectedDocumentType() {
    return this.docTypes().find(item => String(item.id) === String(this.form.documentTypeId));
  }

  documentMeta(code?: string) {
    switch ((code || '').toUpperCase()) {
      case 'NATID': return { requiresAttachment: true, complianceRelated: false, linkedModule: 'employee_profile' };
      case 'PASSPORT': return { requiresAttachment: true, complianceRelated: true, linkedModule: 'compliance' };
      case 'WORKPERMIT': return { requiresAttachment: true, complianceRelated: true, linkedModule: 'compliance' };
      case 'RESIDENCY': return { requiresAttachment: true, complianceRelated: true, linkedModule: 'compliance' };
      case 'HEALTHCERT': return { requiresAttachment: true, complianceRelated: true, linkedModule: 'compliance' };
      case 'CRIMCLEAR': return { requiresAttachment: true, complianceRelated: true, linkedModule: 'compliance' };
      case 'SSCPROOF': return { requiresAttachment: true, complianceRelated: true, linkedModule: 'compliance' };
      case 'CONTRACT': return { requiresAttachment: true, complianceRelated: false, linkedModule: 'pre_employment' };
      default: return { requiresAttachment: false, complianceRelated: false, linkedModule: 'documents' };
    }
  }

  linkedModuleLabel(module: string) {
    const key = module || 'documents';
    if (key === 'compliance') return this.t('الامتثال', 'Compliance');
    if (key === 'pre_employment') return this.t('ما قبل التوظيف', 'Pre-employment');
    if (key === 'payroll') return this.t('الرواتب', 'Payroll');
    if (key === 'employee_profile') return this.t('ملف الموظف', 'Employee profile');
    return this.t('الوثائق', 'Documents');
  }

  statusLabel(status: DocumentStatus | string) {
    if (status === 'valid') return this.t('ساري', 'Valid');
    if (status === 'expiring_soon') return this.t('ينتهي قريباً', 'Expiring soon');
    if (status === 'expired') return this.t('منتهي', 'Expired');
    if (status === 'missing') return this.t('مفقود', 'Missing');
    return status;
  }

  statusClass(status: DocumentStatus | string) {
    if (status === 'valid') return 'badge-success status-valid';
    if (status === 'expiring_soon') return 'badge-warning status-expiring';
    if (status === 'expired') return 'badge-danger status-expired';
    return 'badge-danger status-missing';
  }

  daysLeftLabel(days: number | null | undefined) {
    if (days == null) return this.dash;
    if (days < 0) return this.t('منتهي', 'Expired');
    return this.lang === 'ar' ? `${days} يوم` : `${days} days`;
  }
}
