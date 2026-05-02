import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { getErrorMessage } from '../../core/utils/error-message';

interface Role {
  id: number;
  name: string;
  labelAr: string;
  labelEn: string;
  isSystem: boolean;
  companyId: number;
}

interface Permission {
  id: number;
  screen: string;
  action: string;
  labelAr?: string;
  labelEn?: string;
}

interface RolePermission {
  id: number;
  roleId: number;
  permissionId: number;
  dataScope: string;
}

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-6 space-y-6">
      <!-- Header -->
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ lang === 'ar' ? 'الأدوار والصلاحيات' : 'Roles & Permissions' }}</h1>
        <p class="text-sm text-gray-500 mt-1">{{ lang === 'ar' ? 'عرض الأدوار والصلاحيات الممنوحة لكل دور' : 'View roles and permissions granted to each role' }}</p>
      </div>

      <!-- Loading -->
      <div *ngIf="loading()" class="flex items-center justify-center py-20">
        <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>

      <!-- Error -->
      <div *ngIf="error()" class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">{{ error() }}</div>

      <!-- Roles List -->
      <div *ngIf="!loading() && !error()" class="grid grid-cols-1 gap-4">
        <div *ngFor="let role of roles()" class="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div class="flex items-center justify-between px-5 py-4 bg-gray-50 border-b border-gray-200 cursor-pointer" (click)="toggleRole(role.id)">
            <div class="flex items-center gap-3">
              <span class="material-symbols-rounded text-2xl" [class]="roleIconClass(role.name)">{{ roleIcon(role.name) }}</span>
              <div>
                <div class="font-semibold text-gray-900">{{ lang === 'ar' ? role.labelAr : role.labelEn }}</div>
                <div class="text-xs text-gray-500">{{ role.name }} · {{ role.isSystem ? (lang === 'ar' ? 'دور نظام' : 'System role') : (lang === 'ar' ? 'دور مخصص' : 'Custom role') }}</div>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">{{ permissionCount(role.id) }} {{ lang === 'ar' ? 'صلاحية' : 'permissions' }}</span>
              <span class="material-symbols-rounded text-gray-400 transition-transform" [class.rotate-180]="expandedRole() === role.id">expand_more</span>
            </div>
          </div>

          <div *ngIf="expandedRole() === role.id" class="p-4">
            <div *ngIf="permissionsForRole(role.id).length === 0" class="text-center text-gray-400 py-6 text-sm">
              {{ lang === 'ar' ? 'لا توجد صلاحيات محددة لهذا الدور' : 'No permissions assigned to this role' }}
            </div>
            <div *ngIf="permissionsForRole(role.id).length > 0" class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-xs text-gray-500 uppercase border-b border-gray-100">
                    <th class="text-start py-2 font-medium">{{ lang === 'ar' ? 'الشاشة' : 'Screen' }}</th>
                    <th class="text-start py-2 font-medium">{{ lang === 'ar' ? 'الإجراء' : 'Action' }}</th>
                    <th class="text-start py-2 font-medium">{{ lang === 'ar' ? 'نطاق البيانات' : 'Data Scope' }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                  <tr *ngFor="let rp of permissionsForRole(role.id)" class="hover:bg-gray-50">
                    <td class="py-2 text-gray-700 font-mono">{{ rp.screen }}</td>
                    <td class="py-2">
                      <span [class]="actionBadgeClass(rp.action)" class="px-2 py-0.5 rounded-full text-xs font-medium">{{ rp.action }}</span>
                    </td>
                    <td class="py-2 text-gray-500 text-xs">{{ rp.dataScope }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div *ngIf="roles().length === 0" class="text-center py-16 bg-white rounded-xl border border-gray-200">
          <span class="material-symbols-rounded text-5xl text-gray-300">admin_panel_settings</span>
          <p class="mt-2 text-gray-500">{{ lang === 'ar' ? 'لا توجد أدوار' : 'No roles found' }}</p>
        </div>
      </div>
    </div>
  `
})
export class RolesComponent implements OnInit {
  roles = signal<Role[]>([]);
  rolePermissions = signal<(RolePermission & { screen: string; action: string })[]>([]);
  loading = signal(true);
  error = signal('');
  expandedRole = signal<number | null>(null);

  constructor(private http: HttpClient, private i18n: I18nService, private toast: ToastService) {}

  get lang() { return this.i18n.currentLang; }

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.http.get<{ success: boolean; data: { roles: Role[]; rolePermissions: (RolePermission & { screen: string; action: string })[] } }>('/api/roles').subscribe({
      next: res => {
        this.roles.set(res.data?.roles ?? []);
        this.rolePermissions.set(res.data?.rolePermissions ?? []);
        this.loading.set(false);
        if (res.data?.roles?.length) this.expandedRole.set(res.data.roles[0].id);
      },
      error: err => {
        this.error.set(getErrorMessage(err, 'Failed to load roles'));
        this.loading.set(false);
      }
    });
  }

  toggleRole(id: number) {
    this.expandedRole.set(this.expandedRole() === id ? null : id);
  }

  permissionsForRole(roleId: number) {
    return this.rolePermissions().filter(rp => rp.roleId === roleId);
  }

  permissionCount(roleId: number): number {
    return this.permissionsForRole(roleId).length;
  }

  roleIcon(name: string): string {
    const icons: Record<string, string> = {
      superadmin: 'shield', hradmin: 'manage_accounts', payrolladmin: 'payments',
      manager: 'supervisor_account', employee: 'person', recruiter: 'work'
    };
    return icons[name] ?? 'admin_panel_settings';
  }

  roleIconClass(name: string): string {
    const classes: Record<string, string> = {
      superadmin: 'text-red-600', hradmin: 'text-blue-600', payrolladmin: 'text-green-600',
      manager: 'text-purple-600', employee: 'text-gray-600', recruiter: 'text-orange-600'
    };
    return classes[name] ?? 'text-gray-600';
  }

  actionBadgeClass(action: string): string {
    const classes: Record<string, string> = {
      view: 'bg-gray-100 text-gray-700', create: 'bg-green-100 text-green-700',
      update: 'bg-yellow-100 text-yellow-700', delete: 'bg-red-100 text-red-700',
      approve: 'bg-blue-100 text-blue-700', export: 'bg-purple-100 text-purple-700'
    };
    return classes[action] ?? 'bg-gray-100 text-gray-700';
  }
}
