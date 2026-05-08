import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { getErrorMessage } from '../../core/utils/error-message';

interface UserRow {
  id: number;
  username: string;
  email?: string;
  role: string;
  isActive: boolean;
  roleId?: number | null;
  employeeId?: number | null;
  employeeCode?: string | null;
  employeeNameAr?: string | null;
  employeeNameEn?: string | null;
  managerEmployeeCode?: string | null;
  managerNameAr?: string | null;
  managerNameEn?: string | null;
  lastLoginAt?: string;
}

interface Role {
  id: number;
  name: string;
  labelAr: string;
  labelEn: string;
}

@Component({
  selector: 'app-user-roles',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-6 space-y-6" [attr.dir]="lang === 'ar' ? 'rtl' : 'ltr'">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ lang === 'ar' ? 'تعيين أدوار المستخدمين' : 'User Role Assignment' }}</h1>
        <p class="text-sm text-gray-500 mt-1">
          {{ lang === 'ar' ? 'اعرض الدور النظامي بوضوح وافصل علاقة المدير المباشر عن دور المستخدم.' : 'Show the actual system role separately from the direct-manager relationship.' }}
        </p>
      </div>

      <div *ngIf="loading()" class="flex items-center justify-center py-20">
        <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>

      <div *ngIf="error()" class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">{{ error() }}</div>

      <div *ngIf="!loading() && !error()" class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 flex flex-wrap gap-3 items-center justify-between">
          <input
            [(ngModel)]="searchTerm"
            (ngModelChange)="filterUsers()"
            [placeholder]="lang === 'ar' ? 'بحث عن مستخدم أو دور أو مدير...' : 'Search user, role, or manager...'"
            class="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <div class="flex flex-wrap gap-2 text-xs text-gray-500">
            <span *ngFor="let item of roleCounts()" class="px-2.5 py-1 rounded-full bg-gray-100">{{ item.label }}: {{ item.count }}</span>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b border-gray-100">
              <tr>
                <th class="text-start px-5 py-3 font-medium text-gray-600">{{ lang === 'ar' ? 'المستخدم' : 'User' }}</th>
                <th class="text-start px-5 py-3 font-medium text-gray-600">{{ lang === 'ar' ? 'الدور النظامي' : 'System Role' }}</th>
                <th class="text-start px-5 py-3 font-medium text-gray-600">{{ lang === 'ar' ? 'علاقة المدير' : 'Manager Relationship' }}</th>
                <th class="text-start px-5 py-3 font-medium text-gray-600">{{ lang === 'ar' ? 'الحالة' : 'Status' }}</th>
                <th class="text-start px-5 py-3 font-medium text-gray-600">{{ lang === 'ar' ? 'تعيين دور' : 'Assign Role' }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr *ngFor="let user of filteredUsers()" class="hover:bg-gray-50 transition-colors">
                <td class="px-5 py-4">
                  <div class="font-medium text-gray-900">{{ user.username }}</div>
                  <div class="text-xs text-gray-500">{{ user.email }}</div>
                  <div class="text-xs text-gray-500" *ngIf="employeeDisplay(user)">{{ employeeDisplay(user) }}</div>
                </td>
                <td class="px-5 py-4">
                  <span [class]="roleBadgeClass(user.role)" class="px-2.5 py-1 rounded-full text-xs font-medium">{{ roleLabel(user.role) }}</span>
                </td>
                <td class="px-5 py-4">
                  <span class="text-xs text-gray-600" *ngIf="managerDisplay(user); else noManager">{{ managerDisplay(user) }}</span>
                  <ng-template #noManager><span class="text-xs text-gray-400">{{ lang === 'ar' ? 'لا يوجد مدير مباشر' : 'No direct manager' }}</span></ng-template>
                </td>
                <td class="px-5 py-4">
                  <span [class]="user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'" class="px-2.5 py-1 rounded-full text-xs font-medium">
                    {{ user.isActive ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'غير نشط' : 'Inactive') }}
                  </span>
                </td>
                <td class="px-5 py-4">
                  <div class="flex items-center gap-2">
                    <select
                      [value]="pendingRole(user.id) ?? user.role"
                      (change)="setPendingRole(user.id, $any($event.target).value)"
                      class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option *ngFor="let role of availableRoles()" [value]="role.name">{{ lang === 'ar' ? role.labelAr : role.labelEn }}</option>
                    </select>
                    <button
                      *ngIf="pendingRole(user.id) && pendingRole(user.id) !== user.role"
                      (click)="applyRole(user)"
                      [disabled]="savingUser() === user.id"
                      class="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
                      {{ savingUser() === user.id ? (lang === 'ar' ? 'جارٍ الحفظ...' : 'Saving...') : (lang === 'ar' ? 'تطبيق' : 'Apply') }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div *ngIf="filteredUsers().length === 0" class="text-center py-12 text-gray-400">
          {{ lang === 'ar' ? 'لا توجد نتائج' : 'No results found' }}
        </div>
      </div>
    </div>
  `
})
export class UserRolesComponent implements OnInit {
  users = signal<UserRow[]>([]);
  filteredUsers = signal<UserRow[]>([]);
  availableRoles = signal<Role[]>([]);
  loading = signal(true);
  error = signal('');
  savingUser = signal<number | null>(null);
  searchTerm = '';
  private _pendingRoles = new Map<number, string>();

  constructor(private http: HttpClient, private i18n: I18nService, private toast: ToastService) {}

  get lang() { return this.i18n.currentLang; }

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.http.get<{ success: boolean; data: { users: UserRow[]; roles: Role[] } }>('/api/user-roles').subscribe({
      next: res => {
        this.users.set(res.data?.users ?? []);
        this.filteredUsers.set(res.data?.users ?? []);
        this.availableRoles.set(res.data?.roles ?? []);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(getErrorMessage(err, this.lang === 'ar' ? 'تعذر تحميل المستخدمين.' : 'Failed to load users'));
        this.loading.set(false);
      }
    });
  }

  filterUsers() {
    const term = this.searchTerm.toLowerCase();
    if (!term) { this.filteredUsers.set(this.users()); return; }
    this.filteredUsers.set(
      this.users().filter(u =>
        u.username.toLowerCase().includes(term) ||
        (u.email ?? '').toLowerCase().includes(term) ||
        (u.employeeCode ?? '').toLowerCase().includes(term) ||
        (u.managerNameAr ?? '').toLowerCase().includes(term) ||
        (u.managerNameEn ?? '').toLowerCase().includes(term) ||
        u.role.toLowerCase().includes(term) ||
        this.roleLabel(u.role).toLowerCase().includes(term)
      )
    );
  }

  pendingRole(userId: number): string | undefined {
    return this._pendingRoles.get(userId);
  }

  setPendingRole(userId: number, role: string) {
    this._pendingRoles.set(userId, role);
    this.filteredUsers.set([...this.filteredUsers()]);
  }

  applyRole(user: UserRow) {
    const newRole = this._pendingRoles.get(user.id);
    if (!newRole || newRole === user.role) return;

    this.savingUser.set(user.id);
    this.http.patch(`/api/users/${user.id}`, { role: newRole }).subscribe({
      next: () => {
        this.savingUser.set(null);
        this._pendingRoles.delete(user.id);
        user.role = newRole;
        this.users.set([...this.users()]);
        this.filteredUsers.set([...this.filteredUsers()]);
        this.toast.success(this.lang === 'ar'
          ? 'تم تحديث الدور بنجاح. قد يحتاج المستخدم إلى إعادة تسجيل الدخول لتفعيل الصلاحيات الجديدة.'
          : 'Role updated. The user may need to log out and back in for new permissions to take effect.');
      },
      error: err => {
        this.savingUser.set(null);
        this.toast.error(getErrorMessage(err, this.lang === 'ar' ? 'تعذر تحديث الدور.' : 'Failed to update role'));
      }
    });
  }

  employeeDisplay(user: UserRow): string {
    const name = this.lang === 'ar'
      ? (user.employeeNameAr || user.employeeNameEn)
      : (user.employeeNameEn || user.employeeNameAr);
    return name ? `${name}${user.employeeCode ? ` (${user.employeeCode})` : ''}` : '';
  }

  managerDisplay(user: UserRow): string {
    const name = this.lang === 'ar'
      ? (user.managerNameAr || user.managerNameEn)
      : (user.managerNameEn || user.managerNameAr);
    return name ? `${name}${user.managerEmployeeCode ? ` (${user.managerEmployeeCode})` : ''}` : '';
  }

  roleCounts() {
    const counts = new Map<string, number>();
    for (const user of this.users()) counts.set(user.role, (counts.get(user.role) || 0) + 1);
    return Array.from(counts.entries()).map(([role, count]) => ({ role, count, label: this.roleLabel(role) }));
  }

  roleLabel(role: string): string {
    const labels: Record<string, [string, string]> = {
      superadmin: ['مدير النظام', 'Super Admin'],
      hradmin: ['مدير الموارد البشرية', 'HR Admin'],
      payrolladmin: ['مدير الرواتب', 'Payroll Admin'],
      manager: ['مدير', 'Manager'],
      employee: ['موظف', 'Employee'],
      recruiter: ['موظف توظيف', 'Recruiter'],
      admin: ['مدير النظام', 'Admin']
    };
    const pair = labels[role];
    return pair ? (this.lang === 'ar' ? pair[0] : pair[1]) : role;
  }

  roleBadgeClass(role: string): string {
    const classes: Record<string, string> = {
      superadmin: 'bg-red-100 text-red-700',
      admin: 'bg-red-100 text-red-700',
      hradmin: 'bg-blue-100 text-blue-700',
      payrolladmin: 'bg-green-100 text-green-700',
      manager: 'bg-purple-100 text-purple-700',
      employee: 'bg-gray-100 text-gray-700',
      recruiter: 'bg-orange-100 text-orange-700'
    };
    return classes[role] ?? 'bg-gray-100 text-gray-700';
  }
}
