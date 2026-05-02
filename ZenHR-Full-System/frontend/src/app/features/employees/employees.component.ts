import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { Employee, Department, JobTitle, ApiResponse, STATUS_LABELS } from '../../core/models';
import { ToastService } from '../../core/services/toast.service';
import { SkeletonTableComponent } from '../../shared/components/skeleton/skeleton-table.component';
import { getErrorMessage } from '../../core/utils/error-message';
import { ConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog.component';
import { AppSettingsService } from '../../core/services/app-settings.service';
import { OrgNode, OrgNodesService } from '../../core/services/org-nodes.service';
import { AccordionComponent, AccordionPanelComponent } from '../../shared/components/accordion/accordion.component';

type EmployeeForm = Partial<Employee> & { password?: string };

@Component({
  selector: 'app-employees',
  standalone: true,
  imports: [CommonModule, FormsModule, SkeletonTableComponent, ConfirmDialogComponent, AccordionComponent, AccordionPanelComponent],
  templateUrl: './employees.component.html',
  styleUrl: './employees.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmployeesComponent implements OnInit {
  employees = signal<Employee[]>([]);
  filteredEmployees = signal<Employee[]>([]);
  departments = signal<Department[]>([]);
  orgNodes = signal<OrgNode[]>([]);
  jobTitles = signal<JobTitle[]>([]);
  loading = signal(true);
  error = signal('');
  searchQ = '';
  filterOrgNode = '';
  filterStatus = '';

  showFormModal = signal(false);
  showDetailsModal = signal(false);
  editMode = signal(false);
  formLoading = signal(false);
  detailsLoading = signal(false);
  saving = signal(false);
  deleting = signal(false);
  formError = signal('');
  detailsError = signal('');
  formErrors = signal<Record<string, string>>({});
  selectedEmployee = signal<Employee | null>(null);
  pendingDeleteEmployee = signal<Employee | null>(null);

  form: EmployeeForm = {};
  statusLabels = STATUS_LABELS;

  complianceBadgeMap = signal<Record<number, { overallStatus: string; alertCount: number; items: any[] }>>({});

  readonly modalTitle = computed(() =>
    this.editMode()
      ? this.t('تعديل بيانات الموظف', 'Edit Employee')
      : this.t('إضافة موظف جديد', 'Add New Employee')
  );

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private toast: ToastService,
    private settings: AppSettingsService,
    private orgNodesService: OrgNodesService
  ) {}

  get lang() {
    return this.auth.lang;
  }

  get canManage() {
    return this.auth.hasRole('hradmin');
  }

  get canViewSalary() {
    return this.auth.hasRole('hradmin', 'payrolladmin');
  }

  get filtered() {
    return this.filteredEmployees();
  }

  get activeEmployees() {
    return this.filtered.filter(emp => emp.employmentStatus === 'active').length;
  }

  get probationEmployees() {
    return this.filtered.filter(emp => emp.employmentStatus === 'probation').length;
  }

  get nonJordanianEmployees() {
    return this.filtered.filter(emp => (emp.nationalityCode ?? '').toUpperCase() !== 'JO').length;
  }

  get hasActiveFilters() {
    return !!(this.searchQ || this.filterOrgNode || this.filterStatus);
  }

  ngOnInit() {
    this.load();
    this.loadDepts();
    this.loadOrgNodes();
    this.loadJobTitles();
    this.loadComplianceBadges();
  }

  t(ar: string, en: string) {
    return this.lang === 'ar' ? ar : en;
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.api.get<ApiResponse<Employee[]>>('/api/employees').subscribe({
      next: response => {
        this.employees.set(response.data ?? []);
        this.applyFilters();
        this.loading.set(false);
      },
      error: apiError => {
        this.error.set(getErrorMessage(apiError, this.t('تعذر تحميل بيانات الموظفين.', 'Failed to load employees.')));
        this.loading.set(false);
      }
    });
  }

  applyFilters() {
    const term = this.searchQ.trim().toLowerCase();
    const orgNode = this.filterOrgNode;
    const status = this.filterStatus;

    this.filteredEmployees.set(
      this.employees().filter(emp => {
        const matchesOrgNode = !orgNode || String(emp.orgNodeId ?? '') === orgNode;
        const matchesStatus = !status || emp.employmentStatus === status;
        const haystack = [
          emp.fullNameAr,
          emp.fullNameEn,
          emp.employeeCode,
          emp.workEmail,
          emp.personalPhone
        ].join(' ').toLowerCase();
        const matchesSearch = !term || haystack.includes(term);
        return matchesOrgNode && matchesStatus && matchesSearch;
      })
    );
  }

  clearFilters() {
    this.searchQ = '';
    this.filterOrgNode = '';
    this.filterStatus = '';
    this.applyFilters();
  }

  loadComplianceBadges() {
    this.api.get<any>('/api/compliance/badge-status').subscribe({
      next: response => {
        const map: Record<number, any> = {};
        (response.data as any[]).forEach(item => {
          map[item.employeeId] = item;
        });
        this.complianceBadgeMap.set(map);
      }
    });
  }

  loadDepts() {
    this.api.get<ApiResponse<Department[]>>('/api/departments').subscribe({
      next: response => this.departments.set(response.data ?? [])
    });
  }

  loadOrgNodes() {
    this.orgNodesService.getFlat().subscribe({
      next: response => this.orgNodes.set(response.data ?? [])
    });
  }

  loadJobTitles() {
    this.api.get<ApiResponse<JobTitle[]>>('/api/job-titles').subscribe({
      next: response => this.jobTitles.set(response.data ?? [])
    });
  }

  openCreate() {
    this.editMode.set(false);
    this.formLoading.set(false);
    this.selectedEmployee.set(null);
    this.form = this.getDefaultForm();
    this.formErrors.set({});
    this.formError.set('');
    this.showFormModal.set(true);
  }

  openEdit(employee: Employee) {
    this.editMode.set(true);
    this.formLoading.set(true);
    this.formErrors.set({});
    this.formError.set('');
    this.showFormModal.set(true);
    this.api.get<ApiResponse<Employee>>(`/api/employees/${employee.id}`).subscribe({
      next: response => {
        const details = response.data ?? employee;
        this.selectedEmployee.set(details);
        this.form = this.mapEmployeeToForm(details);
        this.formLoading.set(false);
      },
      error: apiError => {
        this.formLoading.set(false);
        const message = getErrorMessage(apiError, this.t('تعذر تحميل بيانات الموظف.', 'Failed to load employee details.'));
        this.formError.set(message);
        this.toast.error(message);
      }
    });
  }

  openDetails(employee: Employee) {
    this.showDetailsModal.set(true);
    this.detailsLoading.set(true);
    this.detailsError.set('');
    this.selectedEmployee.set(null);

    this.api.get<ApiResponse<Employee>>(`/api/employees/${employee.id}`).subscribe({
      next: response => {
        this.selectedEmployee.set(response.data ?? employee);
        this.detailsLoading.set(false);
      },
      error: apiError => {
        this.detailsError.set(getErrorMessage(apiError, this.t('تعذر تحميل تفاصيل الموظف.', 'Failed to load employee details.')));
        this.detailsLoading.set(false);
      }
    });
  }

  closeFormModal() {
    if (this.saving()) {
      return;
    }
    this.showFormModal.set(false);
    this.formLoading.set(false);
    this.formError.set('');
    this.formErrors.set({});
    this.form = {};
  }

  closeDetailsModal() {
    this.showDetailsModal.set(false);
    this.detailsLoading.set(false);
    this.detailsError.set('');
    this.selectedEmployee.set(null);
  }

  save() {
    if (this.saving()) {
      return;
    }

    if (!this.validateForm()) {
      this.formError.set(this.t('يرجى إكمال الحقول المطلوبة أولاً.', 'Please complete the required fields first.'));
      return;
    }

    this.saving.set(true);
    this.formError.set('');
    const payload = this.buildPayload();
    const request = this.editMode() && this.form.id
      ? this.api.put<ApiResponse<Employee>>(`/api/employees/${this.form.id}`, payload)
      : this.api.post<ApiResponse<Employee>>('/api/employees', payload);

    request.subscribe({
      next: response => {
        const savedId = response.data?.id ?? this.form.id ?? null;
        this.saving.set(false);
        this.closeFormModal();
        this.toast.success(
          this.editMode()
            ? this.t('تم تحديث بيانات الموظف بنجاح.', 'Employee updated successfully.')
            : this.t('تمت إضافة الموظف بنجاح.', 'Employee created successfully.')
        );
        this.load();
        if (savedId) {
          this.refreshDetails(savedId);
        }
      },
      error: apiError => {
        this.saving.set(false);
        this.formError.set(getErrorMessage(apiError, this.t('حدث خطأ أثناء حفظ بيانات الموظف.', 'Failed to save employee.')));
      }
    });
  }

  requestDelete(employee: Employee) {
    this.pendingDeleteEmployee.set(employee);
  }

  closeDeleteDialog() {
    if (this.deleting()) {
      return;
    }
    this.pendingDeleteEmployee.set(null);
  }

  confirmDelete() {
    const employee = this.pendingDeleteEmployee();
    if (!employee || this.deleting()) {
      return;
    }

    this.deleting.set(true);
    this.api.delete<ApiResponse<any>>(`/api/employees/${employee.id}`).subscribe({
      next: () => {
        this.deleting.set(false);
        this.pendingDeleteEmployee.set(null);
        this.toast.success(this.t('تم حذف الموظف بنجاح.', 'Employee deleted successfully.'));
        if (this.selectedEmployee()?.id === employee.id) {
          this.closeDetailsModal();
        }
        this.load();
      },
      error: apiError => {
        this.deleting.set(false);
        this.toast.error(getErrorMessage(apiError, this.t('تعذر حذف الموظف.', 'Failed to delete employee.')));
      }
    });
  }

  exportCsv() {
    const headers = [
      'EmployeeCode', 'Name', 'Department', 'JobTitle', 'Nationality',
      'NationalId', 'DateOfBirth', 'Gender', 'Phone', 'Address',
      'BasicSalary', 'Status'
    ];

    const rows = this.filtered.map(emp => [
      emp.employeeCode,
      this.lang === 'ar' ? emp.fullNameAr : emp.fullNameEn,
      this.lang === 'ar' ? emp.departmentNameAr : emp.departmentNameEn,
      this.lang === 'ar' ? emp.jobTitleAr : emp.jobTitleEn,
      emp.nationality ?? '',
      this.employeeIdValue(emp),
      emp.dateOfBirth ?? '',
      emp.gender ?? '',
      emp.personalPhone ?? '',
      emp.addressAr ?? '',
      String(emp.basicSalary ?? ''),
      emp.employmentStatus
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'employees-export.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  complianceBadge(empId: number) {
    return this.complianceBadgeMap()[empId] ?? null;
  }

  complianceBadgeLabel(status: string) {
    const labels: Record<string, { ar: string; en: string }> = {
      compliant: { ar: 'ممتثل', en: 'Compliant' },
      warning: { ar: 'تنبيه', en: 'Warning' },
      critical: { ar: 'حرج', en: 'Critical' }
    };
    const label = labels[status];
    return label ? this.t(label.ar, label.en) : status;
  }

  deptName(id?: number) {
    if (!id) return '';
    const department = this.departments().find(item => item.id === id);
    return department ? (this.lang === 'ar' ? department.nameAr : department.nameEn) : '';
  }

  assignableOrgNodes() {
    return this.orgNodes().filter(node => ['department', 'section', 'unit'].includes(node.nodeType));
  }

  orgNodeName(id?: number) {
    if (!id) return '';
    const node = this.orgNodes().find(item => item.id === id);
    return node ? (node.breadcrumb || (this.lang === 'ar' ? node.nameAr : node.nameEn)) : '';
  }

  onOrgNodeChange(value: number | null | undefined) {
    const node = this.orgNodes().find(item => item.id === Number(value));
    this.form.orgNodeId = value ?? undefined;
    if (node?.nodeType === 'department' && node.code && !Number.isNaN(Number(node.code))) {
      this.form.departmentId = Number(node.code);
    }
  }

  jobName(id?: number) {
    if (!id) return '';
    const job = this.jobTitles().find(item => item.id === id);
    return job ? (this.lang === 'ar' ? job.titleAr : job.titleEn) : '';
  }

  empStatus(status: string) {
    const ar: Record<string, string> = {
      active: 'نشط',
      probation: 'تحت التجربة',
      suspended: 'موقوف',
      terminated: 'منتهي الخدمة',
      inactive: 'غير نشط'
    };
    const en: Record<string, string> = {
      active: 'Active',
      probation: 'Probation',
      suspended: 'Suspended',
      terminated: 'Terminated',
      inactive: 'Inactive'
    };
    return this.lang === 'ar' ? (ar[status] || this.statusLabels[status] || status) : (en[status] || status);
  }

  employeeIdLabel(emp: Employee) {
    return (emp.nationalityCode ?? '').toUpperCase() === 'JO'
      ? this.t('الهوية الوطنية', 'National ID')
      : this.t('رقم جواز السفر', 'Passport');
  }

  employeeIdValue(emp: Employee) {
    return (emp.nationalityCode ?? '').toUpperCase() === 'JO'
      ? (emp.nationalId ?? '—')
      : (emp.passportNumber ?? '—');
  }

  age(emp: Employee) {
    if (!emp.dateOfBirth) return '—';
    const birth = new Date(emp.dateOfBirth);
    const today = new Date();
    let years = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      years--;
    }
    return years >= 0 ? String(years) : '—';
  }

  salaryTotal(emp: Employee) {
    return (emp.basicSalary ?? 0)
      + (emp.housingAllowance ?? 0)
      + (emp.transportAllowance ?? 0)
      + (emp.mobileAllowance ?? 0)
      + (emp.mealAllowance ?? 0)
      + (emp.otherAllowances ?? 0);
  }

  displayValue(value: unknown) {
    if (value == null || value === '') {
      return '—';
    }
    return String(value);
  }

  formatDate(value?: string) {
    if (!value) {
      return '—';
    }

    return new Intl.DateTimeFormat(this.lang === 'ar' ? 'ar-JO' : 'en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(new Date(value));
  }

  money(value?: number | null) {
    if (value == null) {
      return '—';
    }

    return `${value.toLocaleString(this.lang === 'ar' ? 'ar-JO' : 'en-US', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3
    })} JOD`;
  }

  fieldError(field: string) {
    return this.formErrors()[field] ?? '';
  }

  pendingDeleteMessage() {
    const employee = this.pendingDeleteEmployee();
    if (!employee) {
      return '';
    }

    const name = this.lang === 'ar' ? employee.fullNameAr : employee.fullNameEn;
    return this.t(
      `سيتم حذف سجل الموظف ${name} بعد التأكيد.`,
      `The employee record for ${name} will be deleted after confirmation.`
    );
  }

  editSelectedEmployee() {
    const employee = this.selectedEmployee();
    if (!employee) {
      return;
    }

    this.closeDetailsModal();
    this.openEdit(employee);
  }

  trackByEmployee(_: number, emp: Employee) {
    return emp.id;
  }

  probationInfo(emp: Employee) {
    if (!emp.hireDate || !emp.probationEndDate) return null;
    const start = new Date(emp.hireDate).getTime();
    const end = new Date(emp.probationEndDate).getTime();
    const now = Date.now();
    const pct = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
    const daysLeft = Math.round((end - now) / (1000 * 60 * 60 * 24));
    let alertLevel: 'normal' | 'warning' | 'critical' | 'overdue' = 'normal';
    if (daysLeft < 0) alertLevel = 'overdue';
    else if (daysLeft <= 7) alertLevel = 'critical';
    else if (daysLeft <= 14) alertLevel = 'warning';
    return { pct, daysLeft, alertLevel };
  }

  private refreshDetails(employeeId: number) {
    if (!this.showDetailsModal() && this.selectedEmployee()?.id !== employeeId) {
      return;
    }

    this.api.get<ApiResponse<Employee>>(`/api/employees/${employeeId}`).subscribe({
      next: response => {
        if (response.data) {
          this.selectedEmployee.set(response.data);
        }
      }
    });
  }

  private validateForm() {
    const errors: Record<string, string> = {};
    const requiredFields: Array<[keyof EmployeeForm, string, string]> = [
      ['employeeCode', 'رمز الموظف مطلوب.', 'Employee code is required.'],
      ['firstNameAr', 'الاسم الأول بالعربية مطلوب.', 'Arabic first name is required.'],
      ['lastNameAr', 'اسم العائلة بالعربية مطلوب.', 'Arabic last name is required.'],
      ['firstNameEn', 'الاسم الأول بالإنجليزية مطلوب.', 'English first name is required.'],
      ['lastNameEn', 'اسم العائلة بالإنجليزية مطلوب.', 'English last name is required.'],
      ['orgNodeId', 'الوحدة التنظيمية مطلوبة.', 'Org unit is required.'],
      ['jobTitleId', 'المسمى الوظيفي مطلوب.', 'Job title is required.'],
      ['gender', 'الجنس مطلوب.', 'Gender is required.'],
      ['employmentType', 'نوع التوظيف مطلوب.', 'Employment type is required.'],
      ['employmentStatus', 'الحالة الوظيفية مطلوبة.', 'Employment status is required.']
    ];

    requiredFields.forEach(([field, ar, en]) => {
      const value = this.form[field];
      if (value == null || value === '') {
        errors[field as string] = this.t(ar, en);
      }
    });

    if (this.form.workEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.workEmail)) {
      errors['workEmail'] = this.t('صيغة البريد الإلكتروني غير صحيحة.', 'Email format is invalid.');
    }

    this.formErrors.set(errors);
    return Object.keys(errors).length === 0;
  }

  private buildPayload() {
    return {
      ...this.form,
      departmentId: this.form.departmentId ? Number(this.form.departmentId) : null,
      orgNodeId: this.form.orgNodeId ? Number(this.form.orgNodeId) : null,
      jobTitleId: this.form.jobTitleId ? Number(this.form.jobTitleId) : null,
      basicSalary: Number(this.form.basicSalary ?? 0),
      housingAllowance: Number(this.form.housingAllowance ?? 0),
      transportAllowance: Number(this.form.transportAllowance ?? 0),
      mobileAllowance: Number(this.form.mobileAllowance ?? 0),
      mealAllowance: Number(this.form.mealAllowance ?? 0),
      otherAllowances: Number(this.form.otherAllowances ?? 0)
    };
  }

  private getDefaultForm(): EmployeeForm {
    return {
      gender: 'male',
      employmentType: 'fulltime',
      employmentStatus: 'active',
      nationality: 'أردني',
      basicSalary: 0,
      housingAllowance: 0,
      transportAllowance: 0,
      mobileAllowance: 0,
      mealAllowance: 0,
      otherAllowances: 0
    };
  }

  private mapEmployeeToForm(employee: Employee): EmployeeForm {
    return {
      ...employee,
      departmentId: employee.departmentId ?? undefined,
      orgNodeId: employee.orgNodeId ?? undefined,
      jobTitleId: employee.jobTitleId ?? undefined
    };
  }
}
