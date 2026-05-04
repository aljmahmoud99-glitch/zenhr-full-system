import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ApiResponse, Company, Department, ROLE_LABELS } from '../../core/models';
import { ToastService } from '../../core/services/toast.service';
import { SkeletonKpiCardsComponent } from '../../shared/components/skeleton/skeleton-kpi-cards.component';
import { SkeletonTableComponent } from '../../shared/components/skeleton/skeleton-table.component';
import { getErrorMessage } from '../../core/utils/error-message';

interface UserRow {
  id: number;
  username: string;
  email?: string;
  role: string;
  isActive: boolean;
  employeeId?: number;
  employeeCode?: string;
  fullNameAr?: string;
  fullNameEn?: string;
  lastLoginAt?: string;
  createdAt: string;
  mustChangePassword?: boolean;
  companyId?: number;
  companyNameAr?: string;
  companyNameEn?: string;
}

interface EmployeeOption {
  id: number;
  employeeCode?: string;
  fullNameAr?: string;
  fullNameEn?: string;
  departmentNameAr?: string;
  departmentNameEn?: string;
  departmentId?: number | null;
  jobTitleGrade?: string | null;
}

interface TemporaryCredential {
  username: string;
  email?: string;
  password: string;
  role: string;
  linkedEmployee?: string;
  mustChangePassword?: boolean;
}

type RoleKey = 'all' | 'superadmin' | 'hradmin' | 'payrolladmin' | 'manager' | 'employee' | 'recruiter';
type CreatableRole = 'superadmin' | 'hradmin' | 'payrolladmin' | 'manager' | 'employee' | 'recruiter';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule, SkeletonKpiCardsComponent, SkeletonTableComponent],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UsersComponent implements OnInit {
  users = signal<UserRow[]>([]);
  employeeOptions = signal<EmployeeOption[]>([]);
  companies = signal<Company[]>([]);
  departments = signal<Department[]>([]);
  loading = signal(true);
  saving = signal(false);
  resetting = signal<number | null>(null);
  toggling = signal<number | null>(null);
  error = signal('');
  search = signal('');
  roleFilter = signal<RoleKey>('all');
  showModal = signal(false);
  temporaryCredential = signal<TemporaryCredential | null>(null);
  submitted = signal(false);
  resetTarget = signal<UserRow | null>(null);

  form = {
    username: '',
    email: '',
    role: 'employee' as CreatableRole,
    employeeId: null as number | null,
    companyId: null as number | null,
    departmentId: null as number | null
  };

  readonly roleLabels = ROLE_LABELS;
  readonly roleOptions: RoleKey[] = ['all', 'superadmin', 'hradmin', 'payrolladmin', 'manager', 'employee', 'recruiter'];
  readonly callerRole = computed(() => this.auth.currentUser()?.role ?? '');
  readonly isSuperAdmin = computed(() => this.callerRole() === 'superadmin');
  readonly isHrAdmin = computed(() => this.callerRole() === 'hradmin');

  readonly creatableRoles = computed<CreatableRole[]>(() => {
    if (this.isSuperAdmin()) {
      return ['superadmin', 'hradmin', 'payrolladmin', 'manager', 'employee', 'recruiter'];
    }
    return ['manager', 'employee', 'recruiter'];
  });

  readonly selectedEmployee = computed(() => this.employeeOptions().find(employee => employee.id === this.form.employeeId) ?? null);
  readonly selectedDepartmentName = computed(() => {
    const employee = this.selectedEmployee();
    if (employee?.departmentId) {
      return this.lang === 'ar' ? (employee.departmentNameAr || '') : (employee.departmentNameEn || employee.departmentNameAr || '');
    }

    const department = this.departments().find(item => item.id === this.form.departmentId);
    return department ? (this.lang === 'ar' ? department.nameAr : department.nameEn) : '';
  });

  readonly canSubmit = computed(() => !this.validationMessage());

  readonly filteredUsers = computed(() => {
    const term = this.search().trim().toLowerCase();
    const role = this.roleFilter();
    return this.users().filter(user => {
      const matchesRole = role === 'all' || user.role === role;
      const haystack = [
        user.username,
        user.email,
        user.employeeCode,
        user.fullNameAr,
        user.fullNameEn,
        user.companyNameAr,
        user.companyNameEn
      ].join(' ').toLowerCase();
      const matchesSearch = !term || haystack.includes(term);
      return matchesRole && matchesSearch;
    });
  });

  readonly totalUsers = computed(() => this.users().length);
  readonly activeUsers = computed(() => this.users().filter(user => user.isActive).length);
  readonly inactiveUsers = computed(() => this.users().filter(user => !user.isActive).length);
  readonly mustChangeCount = computed(() => this.users().filter(user => !!user.mustChangePassword).length);
  readonly hasActiveFilters = computed(() => !!(this.search().trim() || this.roleFilter() !== 'all'));

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  get lang() {
    return this.auth.lang;
  }

  ngOnInit() {
    this.load();
    if (this.isSuperAdmin()) {
      this.loadCompanies();
    } else {
      this.loadEmployeeOptions();
      this.loadDepartments();
    }
  }

  t(ar: string, en: string) {
    return this.lang === 'ar' ? ar : en;
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.api.get<ApiResponse<UserRow[]>>('/api/users').subscribe({
      next: response => {
        this.users.set(response.data ?? []);
        this.loading.set(false);
      },
      error: error => {
        this.error.set(getErrorMessage(error, this.t('تعذر تحميل المستخدمين', 'Failed to load users')));
        this.loading.set(false);
      }
    });
  }

  loadCompanies() {
    this.api.get<ApiResponse<Company[]>>('/api/admin/companies').subscribe({
      next: response => this.companies.set(response.data ?? [])
    });
  }

  loadDepartments() {
    if (!this.isHrAdmin()) {
      this.departments.set([]);
      return;
    }

    this.api.get<ApiResponse<Department[]>>('/api/departments').subscribe({
      next: response => this.departments.set(response.data ?? [])
    });
  }

  loadEmployeeOptions(companyId?: number | null) {
    const params = new URLSearchParams();
    if (this.isSuperAdmin() && companyId) params.set('companyId', String(companyId));
    if (this.form.role && this.form.role !== 'hradmin' && this.form.role !== 'payrolladmin' && this.form.role !== 'superadmin') {
      params.set('role', this.form.role);
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    this.api.get<ApiResponse<EmployeeOption[]>>(`/api/users/employee-options${query}`).subscribe({
      next: response => this.employeeOptions.set(response.data ?? [])
    });
  }

  openCreate() {
    this.form = {
      username: '',
      email: '',
      role: this.creatableRoles()[this.isSuperAdmin() ? 2 : 0],
      employeeId: null,
      companyId: this.isSuperAdmin() ? null : (this.auth.currentUser()?.companyId ?? null),
      departmentId: null
    };
    this.employeeOptions.set([]);
    if (!this.isSuperAdmin()) {
      this.loadEmployeeOptions();
    }
    this.submitted.set(false);
    this.error.set('');
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.submitted.set(false);
    this.error.set('');
  }

  closeCredentialModal() {
    this.temporaryCredential.set(null);
  }

  clearFilters() {
    this.search.set('');
    this.roleFilter.set('all');
  }

  onCompanyChange() {
    this.form.employeeId = null;
    this.form.departmentId = null;
    this.form.username = '';
    this.submitted.set(false);
    if (this.form.companyId) {
      this.loadEmployeeOptions(this.form.companyId);
    } else {
      this.employeeOptions.set([]);
    }
  }

  onRoleChange() {
    this.submitted.set(false);
    this.error.set('');
    this.form.employeeId = null;
    if (this.form.role !== 'manager') {
      this.form.departmentId = null;
    }
    // Reload employee options with the new role filter
    if (!this.isSuperAdmin()) {
      this.loadEmployeeOptions();
    } else if (this.form.companyId) {
      this.loadEmployeeOptions(this.form.companyId);
    }
  }

  onEmployeeChange() {
    this.submitted.set(false);
    const employee = this.selectedEmployee();
    if (!employee) {
      this.form.departmentId = null;
      return;
    }

    this.form.username = this.suggestUsername(employee);
    this.form.departmentId = employee.departmentId ?? null;

    if (this.isHrAdmin() && this.shouldSuggestManager(employee)) {
      this.form.role = 'manager';
    }
  }

  create() {
    if (this.saving()) {
      return;
    }

    this.submitted.set(true);
    const validationMessage = this.validationMessage();
    if (validationMessage) {
      this.error.set(validationMessage);
      this.toast.error(validationMessage);
      return;
    }

    this.saving.set(true);
    this.error.set('');
    const payload = {
      username: this.form.username.trim(),
      email: this.form.email.trim(),
      role: this.form.role,
      employeeId: this.form.employeeId,
      companyId: this.isSuperAdmin() ? this.form.companyId : undefined,
      departmentId: this.form.role === 'manager'
        ? (this.selectedEmployee()?.departmentId ?? this.form.departmentId)
        : undefined
    };

    this.api.post<ApiResponse<{ id: number; username: string; email?: string; role: string; temporaryPassword: string; mustChangePassword?: boolean; linkedEmployee?: string }>>('/api/users', payload).subscribe({
      next: response => {
        this.saving.set(false);
        this.toast.success(this.t('تم إنشاء المستخدم بنجاح.', 'User created successfully.'));
        if (response.data?.temporaryPassword) {
          this.temporaryCredential.set({
            username: response.data.username || payload.username,
            email: response.data.email || payload.email,
            password: response.data.temporaryPassword,
            role: response.data.role || payload.role,
            linkedEmployee: response.data.linkedEmployee || this.selectedEmployeeLabel(),
            mustChangePassword: response.data.mustChangePassword ?? true
          });
        }
        this.closeModal();
        this.load();
        if (this.isSuperAdmin()) {
          this.loadEmployeeOptions(this.form.companyId);
        } else {
          this.loadEmployeeOptions();
        }
      },
      error: error => {
        this.saving.set(false);
        const message = getErrorMessage(error, this.t('حدث خطأ أثناء إنشاء المستخدم', 'Failed to create user'));
        this.error.set(message);
        this.toast.error(message);
      }
    });
  }

  toggle(id: number) {
    if (this.toggling() === id) {
      return;
    }
    this.toggling.set(id);
    this.api.patch<ApiResponse<unknown>>(`/api/users/${id}/toggle-active`).subscribe({
      next: () => {
        this.toggling.set(null);
        this.toast.success(this.t('تم تحديث حالة المستخدم.', 'User status updated.'));
        this.load();
      },
      error: error => {
        this.toggling.set(null);
        this.toast.error(getErrorMessage(error, this.t('تعذر تحديث حالة المستخدم.', 'Failed to update user status.')));
      }
    });
  }

  openResetConfirm(user: UserRow) {
    this.resetTarget.set(user);
  }

  cancelReset() {
    this.resetTarget.set(null);
  }

  confirmReset() {
    const target = this.resetTarget();
    if (!target) return;
    this.resetTarget.set(null);
    this.doResetPassword(target.id);
  }

  private doResetPassword(id: number) {
    if (this.resetting() === id) return;
    this.resetting.set(id);
    this.api.patch<ApiResponse<{ temporaryPassword: string; mustChangePassword?: boolean }>>(`/api/users/${id}/reset-password`, {}).subscribe({
      next: response => {
        this.resetting.set(null);
        const user = this.users().find(item => item.id === id);
        if (user && response.data?.temporaryPassword) {
          this.temporaryCredential.set({
            username: user.username,
            email: user.email,
            password: response.data.temporaryPassword,
            role: user.role,
            linkedEmployee: this.employeeName(user),
            mustChangePassword: response.data.mustChangePassword ?? true
          });
        }
        this.toast.success(this.t('تمت إعادة تعيين كلمة المرور.', 'Password reset successfully.'));
        this.load();
      },
      error: error => {
        this.resetting.set(null);
        this.toast.error(getErrorMessage(error, this.t('تعذر إعادة تعيين كلمة المرور.', 'Failed to reset password.')));
      }
    });
  }

  roleBadgeLabel(role: string) {
    return this.roleLabels[role] || role;
  }

  employeeName(user: UserRow) {
    return this.lang === 'ar' ? (user.fullNameAr || '--') : (user.fullNameEn || user.fullNameAr || '--');
  }

  employeeOptionLabel(employee: EmployeeOption) {
    const name = this.lang === 'ar' ? employee.fullNameAr : (employee.fullNameEn || employee.fullNameAr);
    const dept = this.lang === 'ar' ? employee.departmentNameAr : (employee.departmentNameEn || employee.departmentNameAr);
    return [employee.employeeCode, name, dept].filter(Boolean).join(' - ');
  }

  companyName(user: UserRow) {
    return this.lang === 'ar' ? (user.companyNameAr || '--') : (user.companyNameEn || user.companyNameAr || '--');
  }

  roleCount(role: RoleKey) {
    if (role === 'all') return this.totalUsers();
    return this.users().filter(user => user.role === role).length;
  }

  usernameError() {
    if (!this.submitted()) return '';
    const username = this.form.username.trim();
    if (!username) return this.t('اسم المستخدم مطلوب.', 'Username is required.');
    if (username.length < 3) return this.t('اسم المستخدم يجب أن يكون 3 أحرف على الأقل.', 'Username must be at least 3 characters.');
    if (!/^[A-Za-z0-9._-]+$/.test(username)) {
      return this.t('اسم المستخدم يقبل الحروف والأرقام والنقطة والشرطة السفلية والشرطة فقط.', 'Username may contain letters, numbers, dot, underscore, and dash only.');
    }
    return '';
  }

  emailError() {
    if (!this.submitted()) return '';
    const email = this.form.email.trim();
    if (!email) return this.t('البريد الإلكتروني مطلوب.', 'Email is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return this.t('أدخل بريدًا إلكترونيًا صالحًا.', 'Enter a valid email address.');
    return '';
  }

  companyError() {
    if (!this.submitted() || !this.isSuperAdmin()) return '';
    return this.form.companyId ? '' : this.t('يرجى اختيار الشركة.', 'Please select a company.');
  }

  employeeError() {
    if (!this.submitted()) return '';
    if (this.requiresEmployeeLink() && this.employeeOptions().length === 0) {
      return this.t('لا يوجد موظفون متاحون للربط بحساب جديد.', 'There are no eligible employees available for linking.');
    }
    if (this.requiresEmployeeLink() && !this.form.employeeId) {
      return this.t('يرجى ربط الحساب بموظف.', 'Please link this account to an employee.');
    }
    return '';
  }

  departmentError() {
    if (!this.submitted() || this.form.role !== 'manager') return '';
    return (this.selectedEmployee()?.departmentId || this.form.departmentId)
      ? ''
      : this.t('يرجى تحديد القسم الذي سيديره المدير.', 'Please choose the department this manager will oversee.');
  }

  requiresEmployeeLink() {
    return !this.isSuperAdmin() && (this.form.role === 'employee' || this.form.role === 'manager');
  }

  selectedEmployeeLabel() {
    const employee = this.selectedEmployee();
    return employee ? this.employeeOptionLabel(employee) : '';
  }

  copyPassword() {
    const credential = this.temporaryCredential();
    if (!credential?.password) return;
    this.copyText(credential.password, this.t('تم نسخ كلمة المرور المؤقتة.', 'Temporary password copied.'));
  }

  copyCredentialSummary() {
    const credential = this.temporaryCredential();
    if (!credential) return;
    const summary = [
      `${this.t('اسم المستخدم', 'Username')}: ${credential.username}`,
      `${this.t('البريد الإلكتروني', 'Email')}: ${credential.email || '—'}`,
      `${this.t('الدور', 'Role')}: ${this.roleBadgeLabel(credential.role)}`,
      credential.linkedEmployee ? `${this.t('الموظف المرتبط', 'Linked employee')}: ${credential.linkedEmployee}` : '',
      `${this.t('كلمة المرور المؤقتة', 'Temporary password')}: ${credential.password}`,
      credential.mustChangePassword ? this.t('يجب تغيير كلمة المرور عند أول دخول.', 'Password must be changed on first login.') : ''
    ].filter(Boolean).join('\n');
    this.copyText(summary, this.t('تم نسخ بيانات الحساب المؤقتة.', 'Temporary account summary copied.'));
  }

  private copyText(value: string, successMessage: string) {
    navigator.clipboard.writeText(value).then(
      () => this.toast.success(successMessage),
      () => this.toast.error(this.t('تعذر النسخ. حاول مرة أخرى.', 'Copy failed. Please try again.'))
    );
  }

  private validationMessage() {
    return this.usernameError()
      || this.emailError()
      || this.companyError()
      || this.employeeError()
      || this.departmentError();
  }

  private suggestUsername(employee: EmployeeOption): string {
    const preferredName = employee.fullNameEn || employee.fullNameAr || employee.employeeCode || 'user';
    const normalized = preferredName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '');

    return normalized || (employee.employeeCode?.toLowerCase() ?? 'user');
  }

  private shouldSuggestManager(employee: EmployeeOption): boolean {
    const grade = (employee.jobTitleGrade || '').trim().toUpperCase();
    if (!grade) return false;
    const directMatch = /^G(\d+)$/.exec(grade);
    if (directMatch) return Number(directMatch[1]) >= 5;
    const numericMatch = /(\d+)/.exec(grade);
    return numericMatch ? Number(numericMatch[1]) >= 5 : false;
  }
}
