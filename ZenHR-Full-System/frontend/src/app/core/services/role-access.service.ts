/*
 * Phase 1 — RoleAccessService (updated)
 *
 * Changes:
 * - Fetches /api/permissions/my after login and caches the result locally
 * - canDoSync(screen, action) reads from cached map (no HTTP call) — used by canDo directive
 * - canDo(screen, action) still returns Observable for backward compat, now uses cached map
 * - permissionMap$ BehaviorSubject exposes the map for the directive to react to
 * - All legacy SCREEN_ACCESS / ACTION_ACCESS / NAV_MAP maps remain for backward compat
 */
import { Injectable, effect } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, map, of, shareReplay } from 'rxjs';
import { AuthService } from './auth.service';

export const SCREEN_ACCESS: Record<string, string[]> = {
  '/admin': ['superadmin'],
  '/admin/companies': ['superadmin'],
  '/admin/users': ['superadmin'],
  '/admin/roles-permissions': ['superadmin'],
  '/admin/company-settings': ['superadmin'],
  '/admin/plans-subscriptions': ['superadmin'],
  '/admin/analytics': ['superadmin'],
  '/admin/audit-logs': ['superadmin'],
  '/admin/automation': ['superadmin'],

  '/app/dashboard': ['hradmin', 'payrolladmin', 'manager', 'employee'],

  '/app/employees': ['hradmin', 'payrolladmin', 'manager'],
  '/app/employees/new': ['hradmin'],
  '/app/employees/:id': ['hradmin', 'payrolladmin', 'manager', 'employee'],
  '/app/job-descriptions': ['hradmin'],
  '/app/hr-master-data': ['hradmin'],
  '/app/recruitment': ['hradmin', 'manager', 'recruiter'],
  '/app/performance-workflows': ['hradmin', 'manager'],
  '/app/documents-reporting': ['hradmin', 'payrolladmin', 'recruiter'],

  '/app/pre-employment': ['hradmin'],
  '/app/pre-employment/evaluation/:employeeId': ['hradmin'],
  '/app/disciplinary': ['hradmin'],
  '/app/resignations': ['hradmin', 'manager', 'payrolladmin'],
  '/app/clearance': ['hradmin'],

  '/app/shifts': ['hradmin', 'manager'],
  '/app/attendance': ['hradmin', 'manager', 'employee'],
  '/app/leave': ['hradmin', 'manager', 'employee'],
  '/app/leave-management': ['hradmin', 'manager', 'employee', 'payrolladmin'],
  '/app/notifications': ['hradmin', 'payrolladmin', 'manager', 'employee', 'recruiter'],
  '/app/approvals': ['hradmin', 'payrolladmin', 'manager', 'recruiter', 'superadmin'],
  '/app/overtime': ['hradmin', 'manager', 'employee'],
  '/app/holidays': ['hradmin', 'payrolladmin', 'manager', 'employee'],

  '/app/compliance': ['hradmin'],
  '/app/compliance-contracts': ['hradmin'],
  '/app/documents': ['hradmin', 'employee', 'manager', 'payrolladmin', 'superadmin'],
  '/app/assets': ['hradmin', 'manager', 'employee', 'payrolladmin', 'superadmin'],

  '/app/advances': ['hradmin', 'payrolladmin', 'employee'],
  '/app/payroll-attendance': ['hradmin', 'payrolladmin'],
  '/app/payroll/runs': ['hradmin', 'payrolladmin'],
  '/app/payroll/slips': ['hradmin', 'payrolladmin', 'employee'],
  '/app/payroll/salary-components': ['hradmin', 'payrolladmin'],
  '/app/payroll-policies': ['hradmin', 'payrolladmin'],
  '/app/salary-components': ['hradmin', 'payrolladmin'],

  '/app/forms': ['hradmin', 'manager', 'employee', 'recruiter'],
  '/app/reports': ['hradmin', 'payrolladmin'],
  '/app/users': ['hradmin'],
  '/app/settings': ['hradmin'],
  '/app/org-structure': ['hradmin'],
  '/app/roles': ['hradmin'],
  '/app/user-roles': ['hradmin'],

  '/app/employee-actions/career-movements': ['hradmin', 'payrolladmin'],
  '/app/employee-actions/salary-changes': ['hradmin', 'payrolladmin'],
  '/app/employee-actions/status-changes': ['hradmin', 'payrolladmin'],
  '/app/workflows': ['hradmin', 'payrolladmin'],
};

export interface NavItem {
  labelAr: string;
  labelEn: string;
  icon: string;
  path: string;
  roles?: string[];
}

export interface NavGroup {
  groupKey: string;
  labelAr: string;
  labelEn: string;
  icon: string;
  items: NavItem[];
}

const PLATFORM_NAV: NavGroup[] = [
  {
    groupKey: 'platform',
    labelAr: 'المنصة',
    labelEn: 'Platform',
    icon: 'domain',
    items: [
      { labelAr: 'إدارة الشركات', labelEn: 'Company Management', icon: 'domain', path: '/admin/companies' },
      { labelAr: 'إدارة المستخدمين', labelEn: 'User Management', icon: 'manage_accounts', path: '/admin/users' },
      { labelAr: 'الأدوار والصلاحيات', labelEn: 'Roles & Permissions', icon: 'admin_panel_settings', path: '/admin/roles-permissions' },
      { labelAr: 'إعدادات الشركات', labelEn: 'Company Settings', icon: 'tune', path: '/admin/company-settings' },
      { labelAr: 'الخطط والاشتراكات', labelEn: 'Plans & Subscriptions', icon: 'payments', path: '/admin/plans-subscriptions' },
      { labelAr: 'تحليلات النظام', labelEn: 'System Analytics', icon: 'analytics', path: '/admin/analytics' },
      { labelAr: 'سجلات التدقيق', labelEn: 'Audit Logs', icon: 'history', path: '/admin/audit-logs' },
      { labelAr: 'الأتمتة', labelEn: 'Automation', icon: 'hub', path: '/admin/automation' }
    ]
  }
];

const HRADMIN_NAV: NavGroup[] = [
  {
    groupKey: 'employees',
    labelAr: 'الموظفين',
    labelEn: 'Employees',
    icon: 'groups',
    items: [
      { labelAr: 'الموظفون', labelEn: 'Employees', icon: 'groups', path: '/app/employees' },
      { labelAr: 'الملفات الوظيفية', labelEn: 'Job Profiles', icon: 'work_history', path: '/app/job-descriptions', roles: ['hradmin'] },
      { labelAr: 'البيانات الرئيسية للموارد البشرية', labelEn: 'HR Master Data', icon: 'database', path: '/app/hr-master-data', roles: ['hradmin'] },
      { labelAr: 'الحركات الوظيفية', labelEn: 'Career Movements', icon: 'swap_horiz', path: '/app/employee-actions/career-movements' },
      { labelAr: 'حالة التوظيف', labelEn: 'Employment Status', icon: 'person_off', path: '/app/employee-actions/status-changes' }
    ]
  },
  {
    groupKey: 'attendance-leave',
    labelAr: 'الحضور والإجازات',
    labelEn: 'Attendance & Leave',
    icon: 'schedule',
    items: [
      { labelAr: 'الحضور والانصراف', labelEn: 'Attendance', icon: 'fact_check', path: '/app/attendance' },
      { labelAr: 'إدارة الإجازات', labelEn: 'Leave Management', icon: 'event_available', path: '/app/leave-management', roles: ['hradmin'] },
      { labelAr: 'الورديات', labelEn: 'Shifts', icon: 'schedule', path: '/app/shifts' },
      { labelAr: 'العمل الإضافي', labelEn: 'Overtime', icon: 'more_time', path: '/app/overtime' },
      { labelAr: 'العطل الرسمية', labelEn: 'Holidays', icon: 'today', path: '/app/holidays' },
      { labelAr: 'مركز الإشعارات', labelEn: 'Notifications', icon: 'notifications', path: '/app/notifications', roles: ['hradmin'] }
    ]
  },
  {
    groupKey: 'recruitment',
    labelAr: 'التوظيف',
    labelEn: 'Recruitment',
    icon: 'person_search',
    items: [
      { labelAr: 'التوظيف والتعيين', labelEn: 'Recruitment & Hiring', icon: 'person_search', path: '/app/recruitment', roles: ['hradmin'] },
      { labelAr: 'ما قبل التوظيف', labelEn: 'Pre-Employment', icon: 'person_add', path: '/app/pre-employment' },
      { labelAr: 'طلبات التوظيف', labelEn: 'Hiring Requests', icon: 'assignment', path: '/app/recruitment', roles: ['hradmin'] }
    ]
  },
  {
    groupKey: 'payroll',
    labelAr: 'الرواتب',
    labelEn: 'Payroll',
    icon: 'receipt_long',
    items: [
      { labelAr: 'مسيرات الرواتب', labelEn: 'Payroll Runs', icon: 'receipt_long', path: '/app/payroll/runs' },
      { labelAr: 'عمليات الرواتب', labelEn: 'Payroll Operations', icon: 'rule', path: '/app/payroll-attendance' },
      { labelAr: 'تعديلات الرواتب', labelEn: 'Salary Changes', icon: 'price_change', path: '/app/employee-actions/salary-changes' },
      { labelAr: 'السلف', labelEn: 'Salary Advances', icon: 'payments', path: '/app/advances' },
      { labelAr: 'أثر الإجازات على الرواتب', labelEn: 'Leave Payroll Impact', icon: 'event_available', path: '/app/leave-management' },
      { labelAr: 'مكونات الراتب', labelEn: 'Salary Components', icon: 'tune', path: '/app/salary-components' },
      { labelAr: 'سياسات احتساب الرواتب', labelEn: 'Payroll Policies', icon: 'policy', path: '/app/payroll-policies' }
    ]
  },
  {
    groupKey: 'compliance-assets',
    labelAr: 'الامتثال والأصول',
    labelEn: 'Compliance & Assets',
    icon: 'verified_user',
    items: [
      { labelAr: 'العقود والامتثال', labelEn: 'Contracts & Compliance', icon: 'contract', path: '/app/compliance-contracts', roles: ['hradmin', 'superadmin'] },
      { labelAr: 'الوثائق والتقارير', labelEn: 'Documents & Reporting', icon: 'folder_managed', path: '/app/documents-reporting' },
      { labelAr: 'الأصول', labelEn: 'Assets', icon: 'inventory_2', path: '/app/assets' },
      { labelAr: 'التأديب', labelEn: 'Disciplinary', icon: 'gavel', path: '/app/disciplinary' },
      { labelAr: 'الاستقالات', labelEn: 'Resignations', icon: 'logout', path: '/app/resignations' },
      { labelAr: 'براءة الذمة', labelEn: 'Clearance', icon: 'fact_check', path: '/app/clearance' }
    ]
  },
  {
    groupKey: 'performance-analytics',
    labelAr: 'الأداء والتحليلات',
    labelEn: 'Performance & Analytics',
    icon: 'query_stats',
    items: [
      { labelAr: 'الأداء وسير العمل', labelEn: 'Performance & Workflows', icon: 'query_stats', path: '/app/performance-workflows', roles: ['hradmin'] },
      { labelAr: 'تقييمات الفريق', labelEn: 'Team Performance', icon: 'reviews', path: '/app/performance-workflows', roles: ['hradmin'] },
      { labelAr: 'التقارير والتحليلات', labelEn: 'Reports & Analytics', icon: 'analytics', path: '/app/reports' }
    ]
  },
  {
    groupKey: 'administration',
    labelAr: 'الإدارة',
    labelEn: 'Administration',
    icon: 'admin_panel_settings',
    items: [
      { labelAr: 'الهيكل التنظيمي', labelEn: 'Org Structure', icon: 'account_tree', path: '/app/org-structure' },
      { labelAr: 'الأدوار والصلاحيات', labelEn: 'Roles & Permissions', icon: 'admin_panel_settings', path: '/app/roles' },
      { labelAr: 'تعيين الأدوار', labelEn: 'User Role Assignment', icon: 'assignment_ind', path: '/app/user-roles' },
      { labelAr: 'المستخدمون', labelEn: 'Users', icon: 'manage_accounts', path: '/app/users' },
      { labelAr: 'الاعتمادات', labelEn: 'Approvals', icon: 'approval', path: '/app/approvals' },
      { labelAr: 'الإعدادات العامة', labelEn: 'General Settings', icon: 'settings', path: '/app/settings' }
    ]
  }
];

const PAYROLLADMIN_NAV: NavGroup[] = [
  {
    groupKey: 'payroll',
    labelAr: 'الرواتب',
    labelEn: 'Payroll',
    icon: 'receipt_long',
    items: [
      { labelAr: 'عمليات الرواتب', labelEn: 'Payroll Operations', icon: 'rule', path: '/app/payroll-attendance' },
      { labelAr: 'مسيرات الرواتب', labelEn: 'Payroll Runs', icon: 'receipt_long', path: '/app/payroll/runs' },
      { labelAr: 'تعديلات الرواتب', labelEn: 'Salary Changes', icon: 'price_change', path: '/app/employee-actions/salary-changes' },
      { labelAr: 'السلف', labelEn: 'Salary Advances', icon: 'payments', path: '/app/advances' },
      { labelAr: 'أثر الإجازات على الرواتب', labelEn: 'Leave Payroll Impact', icon: 'event_available', path: '/app/leave-management' },
      { labelAr: 'مكونات الراتب', labelEn: 'Salary Components', icon: 'tune', path: '/app/salary-components' },
      { labelAr: 'سياسات احتساب الرواتب', labelEn: 'Payroll Policies', icon: 'policy', path: '/app/payroll-policies' },
    ]
  },
  {
    groupKey: 'supporting-data',
    labelAr: 'البيانات المساندة',
    labelEn: 'Supporting Data',
    icon: 'storage',
    items: [
      { labelAr: 'الموظفون', labelEn: 'Employees (Read)', icon: 'groups', path: '/app/employees' },
      { labelAr: 'العطل الرسمية', labelEn: 'Public Holidays', icon: 'today', path: '/app/holidays' },
      { labelAr: 'وثائق وتقارير الفريق', labelEn: 'Team Documents & Reports', icon: 'folder_managed', path: '/app/documents-reporting' },
    ]
  }
];

const MANAGER_NAV: NavGroup[] = [
  {
    groupKey: 'my-team',
    labelAr: 'فريقي',
    labelEn: 'My Team',
    icon: 'groups',
    items: [
      { labelAr: 'فريقي', labelEn: 'My Team', icon: 'groups', path: '/app/employees' },
      { labelAr: 'حضور الفريق', labelEn: 'Team Attendance', icon: 'fact_check', path: '/app/attendance' },
      { labelAr: 'إجازات الفريق', labelEn: 'Team Leave', icon: 'event_available', path: '/app/leave-management' },
      { labelAr: 'العمل الإضافي للفريق', labelEn: 'Team Overtime', icon: 'more_time', path: '/app/overtime' },
      { labelAr: 'ورديات الفريق', labelEn: 'Team Shifts', icon: 'schedule', path: '/app/shifts' }
    ]
  },
  {
    groupKey: 'approvals',
    labelAr: 'الموافقات',
    labelEn: 'Approvals',
    icon: 'approval',
    items: [
      { labelAr: 'الاعتمادات', labelEn: 'Approvals', icon: 'approval', path: '/app/approvals' },
      { labelAr: 'طلبات التوظيف', labelEn: 'Hiring Requests', icon: 'person_search', path: '/app/recruitment' }
    ]
  },
  {
    groupKey: 'performance',
    labelAr: 'الأداء',
    labelEn: 'Performance',
    icon: 'query_stats',
    items: [
      { labelAr: 'تقييمات الفريق', labelEn: 'Team Performance', icon: 'query_stats', path: '/app/performance-workflows' }
    ]
  },
  {
    groupKey: 'tools',
    labelAr: 'الأدوات',
    labelEn: 'Tools',
    icon: 'build',
    items: [
      { labelAr: 'الإشعارات', labelEn: 'Notifications', icon: 'notifications', path: '/app/notifications' },
      { labelAr: 'الأصول', labelEn: 'Assets', icon: 'inventory_2', path: '/app/assets' }
    ]
  }
];

const EMPLOYEE_NAV: NavGroup[] = [
  {
    groupKey: 'my-attendance-leave',
    labelAr: 'حضوري وإجازاتي',
    labelEn: 'My Attendance & Leave',
    icon: 'fact_check',
    items: [
      { labelAr: 'حضوري', labelEn: 'My Attendance', icon: 'fact_check', path: '/app/attendance' },
      { labelAr: 'مركز إجازاتي', labelEn: 'My Leave Center', icon: 'event_available', path: '/app/leave-management' },
      { labelAr: 'ساعاتي الإضافية', labelEn: 'My Overtime', icon: 'more_time', path: '/app/overtime' },
      { labelAr: 'العطل الرسمية', labelEn: 'Public Holidays', icon: 'today', path: '/app/holidays' }
    ]
  },
  {
    groupKey: 'my-salary',
    labelAr: 'راتبي',
    labelEn: 'My Salary',
    icon: 'receipt_long',
    items: [
      { labelAr: 'مسير راتبي', labelEn: 'My Payslips', icon: 'receipt_long', path: '/app/payroll/slips' },
      { labelAr: 'سلفي', labelEn: 'My Advances', icon: 'payments', path: '/app/advances' }
    ]
  },
  {
    groupKey: 'my-profile',
    labelAr: 'ملفي',
    labelEn: 'My Profile',
    icon: 'person',
    items: [
      { labelAr: 'نماذجي', labelEn: 'My Forms', icon: 'dynamic_form', path: '/app/forms' },
      { labelAr: 'وثائقي', labelEn: 'My Documents', icon: 'folder_managed', path: '/app/documents' },
      { labelAr: 'أصولي', labelEn: 'My Assets', icon: 'inventory_2', path: '/app/assets' }
    ]
  },
  {
    groupKey: 'notifications',
    labelAr: 'الإشعارات',
    labelEn: 'Notifications',
    icon: 'notifications',
    items: [
      { labelAr: 'إشعاراتي', labelEn: 'My Notifications', icon: 'notifications', path: '/app/notifications' }
    ]
  }
];

const RECRUITER_NAV: NavGroup[] = [
  {
    groupKey: 'recruitment',
    labelAr: 'التوظيف',
    labelEn: 'Recruitment',
    icon: 'person_search',
    items: [
      { labelAr: 'مركز التوظيف', labelEn: 'Recruitment Center', icon: 'person_search', path: '/app/recruitment' },
      { labelAr: 'الاعتمادات', labelEn: 'Approvals', icon: 'approval', path: '/app/approvals' },
      { labelAr: 'الإشعارات', labelEn: 'Notifications', icon: 'notifications', path: '/app/notifications' },
      { labelAr: 'وثائق ونماذج التوظيف', labelEn: 'Recruitment Documents & Forms', icon: 'folder_managed', path: '/app/documents-reporting' }
    ]
  }
];

export const NAV_MAP: Record<string, NavGroup[]> = {
  superadmin: PLATFORM_NAV,
  hradmin: HRADMIN_NAV,
  payrolladmin: PAYROLLADMIN_NAV,
  manager: MANAGER_NAV,
  employee: EMPLOYEE_NAV,
  recruiter: RECRUITER_NAV,
};

export const ACTION_ACCESS: Record<string, string[]> = {
  'employee:create': ['hradmin'],
  'employee:edit': ['hradmin'],
  'employee:deactivate': ['hradmin'],
  'employee:viewSalary': ['hradmin', 'payrolladmin'],
  'employee:viewBank': ['hradmin', 'payrolladmin'],
  'employee:viewSSC': ['hradmin', 'payrolladmin'],

  'job-descriptions:create': ['hradmin'],
  'job-descriptions:edit': ['hradmin'],
  'job-descriptions:delete': ['hradmin'],

  'leave:approve:step1': ['hradmin', 'manager'],
  'leave:approve:step2': ['hradmin'],
  'leave:reject': ['hradmin', 'manager'],

  'overtime:approve:step1': ['hradmin', 'manager'],
  'overtime:approve:step2': ['hradmin'],

  'payroll:create': ['payrolladmin'],
  'payroll:approve': ['payrolladmin'],
  'payroll:viewAll': ['hradmin', 'payrolladmin'],

  'advance:approve': ['hradmin'],
  'advance:reject': ['hradmin'],
  'advance:viewAll': ['hradmin', 'payrolladmin'],
  'advance:viewTeam': ['manager'],
  'advance:create:mine': ['employee'],
  'advance:create:tenant': ['hradmin'],

  'disciplinary:create': ['hradmin'],
  'disciplinary:view': ['hradmin'],

  'user:create:hradmin': ['superadmin'],
  'user:create:payrolladmin': ['superadmin'],
  'user:create:manager': ['hradmin'],
  'user:create:employee': ['hradmin'],

  'settings:edit': ['hradmin'],
  'compliance:edit': ['hradmin']
};

export interface PermissionMap {
  screens: Record<string, Record<string, boolean>>;
  dataScope: string;
}

@Injectable({ providedIn: 'root' })
export class RoleAccessService {
  // Phase 1: dynamic permission map from /api/permissions/my
  private readonly _permissionMap = new BehaviorSubject<PermissionMap | null>(null);
  readonly permissionMap$ = this._permissionMap.asObservable();

  private _fetching = false;

  constructor(private auth: AuthService, private http: HttpClient) {
    // Belt-and-suspenders: if a user is already in memory at service creation
    // (page-refresh scenario), load immediately — don't wait for the effect.
    if (this.auth.currentUser()) {
      this._loadPermissions();
    }

    // Also react to signal changes: login, logout, impersonation switch.
    effect(() => {
      const user = this.auth.currentUser();
      if (user) {
        this._loadPermissions();
      } else {
        this._fetching = false;
        this._permissionMap.next(null);
      }
    });
  }

  private _loadPermissions() {
    // Guard: don't fire multiple concurrent fetches
    if (this._fetching) return;
    this._fetching = true;

    const token = localStorage.getItem('zenjo_token');
    if (!token) {
      // No token yet — wait for the effect to trigger after login
      this._fetching = false;
      return;
    }

    this.http
      .get<{ success: boolean; data: PermissionMap }>('/api/permissions/my')
      .pipe(
        catchError(err => {
          console.error('[RoleAccessService] Failed to load permissions:', err?.status, err?.message);
          return of(null);
        })
      )
      .subscribe(res => {
        this._fetching = false;
        if (res?.success && res.data) {
          this._permissionMap.next(this.applyGovernanceDenyList(res.data));
        }
        // On failure: _permissionMap stays null → canDoSync() falls back to _legacyCheck()
      });
  }

  /** Force-refresh permissions — call explicitly after login or role change */
  refreshPermissions() {
    this._fetching = false; // reset guard so the fetch actually runs
    this._loadPermissions();
  }

  get role(): string {
    return this.auth.currentUser()?.role ?? '';
  }

  canSeePage(page: string): boolean {
    return this.rolesForPath(page).includes(this.role);
  }

  getNavGroups(): NavGroup[] {
    const groups = NAV_MAP[this.role] ?? [];
    return groups
      .map(group => ({
        ...group,
        items: group.items.filter(item =>
          (!item.roles || item.roles.includes(this.role)) && this.canSeePage(item.path)
        )
      }))
      .filter(group => group.items.length > 0);
  }

  canDoAction(action: string): boolean {
    return (ACTION_ACCESS[action] ?? []).includes(this.role);
  }

  /**
   * Synchronous permission check using the cached permission map.
   * Falls back to legacy ACTION_ACCESS if map not loaded yet.
   * Used by the canDo directive.
   */
  canDoSync(screen: string, action: string): boolean {
    const cached = this._permissionMap.getValue();
    if (cached && Object.keys(cached.screens).length > 0) {
      return !!cached.screens[screen]?.[action];
    }
    // Fallback: use legacy role-based check
    return this._legacyCheck(this.role, screen, action);
  }

  /**
   * Observable permission check — uses cached map, falls back to HTTP check.
   * Backward compatible with existing code.
   */
  canDo(screen: string, action: string): Observable<boolean> {
    const cached = this._permissionMap.getValue();
    if (cached && Object.keys(cached.screens).length > 0) {
      return of(!!cached.screens[screen]?.[action]);
    }

    // Fall back to HTTP check (legacy behavior)
    const params = new HttpParams().set('screen', screen).set('action', action);
    return this.http
      .get<{ success: boolean; data: { allowed: boolean } }>('/api/permissions/check', { params })
      .pipe(
        map(res => !!res.data?.allowed),
        catchError(() => of(this._legacyCheck(this.role, screen, action))),
        shareReplay(1)
      );
  }

  /** Current data scope from permission map */
  dataScope(): string {
    return this._permissionMap.getValue()?.dataScope ?? 'own';
  }

  /** Get the raw permission map (for debugging / admin UI) */
  getPermissionMap(): PermissionMap | null {
    return this._permissionMap.getValue();
  }

  is(role: string): boolean {
    return this.role === role;
  }

  isAny(...roles: string[]): boolean {
    return roles.includes(this.role);
  }

  isSuperAdmin(): boolean {
    return this.role === 'superadmin';
  }

  isHrAdmin(): boolean {
    return this.role === 'hradmin';
  }

  isPayrollAdmin(): boolean {
    return this.role === 'payrolladmin';
  }

  isManager(): boolean {
    return this.role === 'manager';
  }

  isEmployee(): boolean {
    return this.role === 'employee';
  }

  /**
   * Unified permission check — wraps canDoSync for external consumers.
   * Usage: access.hasPermission('employees', 'create')
   */
  hasPermission(screen: string, action: string): boolean {
    return this.canDoSync(screen, action);
  }

  /**
   * Returns true if the user has at least one of the given [screen, action] pairs.
   * Usage: access.hasAnyPermission([['employees','view'],['payroll','view']])
   */
  hasAnyPermission(items: Array<[string, string]>): boolean {
    return items.some(([screen, action]) => this.canDoSync(screen, action));
  }

  canSeeWidget(widget: string): boolean {
    const widgetMap: Record<string, string[]> = {
      workforce: ['hradmin'],
      'pending-approvals': ['hradmin', 'manager'],
      'hr-workflows': ['hradmin'],
      compliance: ['hradmin'],
      'dept-chart': ['hradmin'],
      'quick-actions': ['hradmin', 'payrolladmin', 'manager', 'employee'],
      'payroll-summary': ['payrolladmin'],
      'team-summary': ['manager'],
      'ess-summary': ['employee'],
      'platform-stats': ['superadmin']
    };

    return (widgetMap[widget] ?? []).includes(this.role);
  }

  private _legacyCheck(role: string, screen: string, action: string): boolean {
    if (role === 'hradmin') return true;
    if (role === 'superadmin') return screen === 'users' || screen === 'settings';

    const payrollScreens = ['payroll', 'advances', 'reports', 'forms', 'employees', 'documents', 'attendance', 'assets'];
    if (role === 'payrolladmin') {
      if (!payrollScreens.includes(screen)) return false;
      if (['employees', 'documents', 'attendance', 'assets'].includes(screen)) return action === 'view' || action === 'export';
      return true;
    }

    const managerScreens = ['employees', 'leave', 'overtime', 'attendance', 'documents', 'assets', 'forms'];
    if (role === 'manager') {
      if (!managerScreens.includes(screen)) return false;
      if (['employees', 'documents', 'assets', 'forms'].includes(screen)) return action === 'view';
      if (screen === 'leave' || screen === 'overtime') return action === 'view' || action === 'approve';
      if (screen === 'attendance') return action === 'view';
      return false;
    }

    const ownScreens = ['leave', 'overtime', 'advances', 'attendance', 'documents', 'assets', 'payroll', 'forms'];
    if (role === 'employee') {
      if (!ownScreens.includes(screen)) return false;
      if (['documents', 'assets', 'payroll', 'forms'].includes(screen)) return action === 'view';
      return action === 'view' || action === 'create';
    }

    return false;
  }

  private applyGovernanceDenyList(map: PermissionMap): PermissionMap {
    const next: PermissionMap = {
      ...map,
      screens: Object.fromEntries(Object.entries(map.screens || {}).map(([screen, actions]) => [screen, { ...actions }]))
    };
    if (this.role === 'manager') {
      delete next.screens['disciplinary'];
      delete next.screens['employee-actions'];
    }
    if (this.role === 'employee') {
      for (const screen of ['disciplinary', 'employees', 'settings', 'users', 'compliance', 'reports']) {
        delete next.screens[screen];
      }
      if (next.screens['payroll']) next.screens['payroll'] = { view: next.screens['payroll']?.['view'] === true };
    }
    if (this.role === 'payrolladmin') {
      for (const screen of ['recruitment', 'disciplinary', 'compliance']) {
        delete next.screens[screen];
      }
    }
    return next;
  }

  private rolesForPath(path: string): string[] {
    if (SCREEN_ACCESS[path]) return SCREEN_ACCESS[path];
    const match = Object.entries(SCREEN_ACCESS).find(([pattern]) => {
      if (!pattern.includes(':')) return false;
      const regexSource = pattern
        .split('/')
        .map(segment => segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('/');
      const regex = new RegExp(`^${regexSource}$`);
      return regex.test(path);
    });
    return match?.[1] ?? [];
  }
}
