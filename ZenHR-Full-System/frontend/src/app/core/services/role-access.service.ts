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

  '/app/dashboard': ['hradmin', 'payrolladmin', 'manager', 'employee'],

  '/app/employees': ['hradmin', 'payrolladmin', 'manager'],
  '/app/employees/new': ['hradmin'],
  '/app/employees/:id': ['hradmin', 'payrolladmin', 'manager', 'employee'],
  '/app/job-descriptions': ['hradmin'],

  '/app/pre-employment': ['hradmin'],
  '/app/pre-employment/evaluation/:employeeId': ['hradmin'],
  '/app/disciplinary': ['hradmin', 'manager'],
  '/app/resignations': ['hradmin', 'manager', 'payrolladmin'],
  '/app/clearance': ['hradmin'],

  '/app/shifts': ['hradmin', 'manager'],
  '/app/attendance': ['hradmin', 'manager', 'employee'],
  '/app/leave': ['hradmin', 'manager', 'employee'],
  '/app/overtime': ['hradmin', 'manager', 'employee'],
  '/app/holidays': ['hradmin', 'payrolladmin', 'manager', 'employee'],

  '/app/compliance': ['hradmin'],
  '/app/documents': ['hradmin', 'employee', 'manager', 'payrolladmin', 'superadmin'],
  '/app/assets': ['hradmin', 'manager', 'employee', 'payrolladmin', 'superadmin'],

  '/app/advances': ['hradmin', 'payrolladmin', 'employee'],
  '/app/payroll/runs': ['hradmin', 'payrolladmin'],
  '/app/payroll/slips': ['hradmin', 'payrolladmin', 'employee'],

  '/app/forms': ['hradmin', 'payrolladmin', 'manager', 'employee'],
  '/app/reports': ['hradmin', 'payrolladmin'],
  '/app/users': ['hradmin'],
  '/app/settings': ['hradmin']
};

export interface NavItem {
  labelAr: string;
  labelEn: string;
  icon: string;
  path: string;
  roles?: string[];
}

export interface NavGroup {
  labelAr: string;
  labelEn: string;
  items: NavItem[];
}

const PLATFORM_NAV: NavGroup[] = [
  {
    labelAr: 'المنصة',
    labelEn: 'Platform',
    items: [
      { labelAr: 'إدارة الشركات', labelEn: 'Company Management', icon: 'domain', path: '/admin/companies' },
      { labelAr: 'إدارة المستخدمين', labelEn: 'User Management', icon: 'manage_accounts', path: '/admin/users' }
    ]
  }
];

const HRADMIN_NAV: NavGroup[] = [
  {
    labelAr: 'نظرة عامة',
    labelEn: 'Overview',
    items: [
      { labelAr: 'لوحة التحكم', labelEn: 'HR Dashboard', icon: 'dashboard', path: '/app/dashboard' }
    ]
  },
  {
    labelAr: 'إدارة الموظفين',
    labelEn: 'Employee Management',
    items: [
      { labelAr: 'المسميات الوظيفية', labelEn: 'Job Descriptions', icon: '📋', path: '/app/job-descriptions', roles: ['hradmin'] },
      { labelAr: 'الموظفون', labelEn: 'Employees', icon: 'groups', path: '/app/employees' },
      { labelAr: 'ما قبل التوظيف', labelEn: 'Pre-Employment', icon: 'person_add', path: '/app/pre-employment' },
      { labelAr: 'التأديب', labelEn: 'Disciplinary', icon: 'gavel', path: '/app/disciplinary' },
      { labelAr: 'الاستقالات', labelEn: 'Resignations', icon: 'logout', path: '/app/resignations' },
      { labelAr: 'براءة الذمة', labelEn: 'Clearance', icon: 'fact_check', path: '/app/clearance' }
    ]
  },
  {
    labelAr: 'الوقت والحضور',
    labelEn: 'Time & Attendance',
    items: [
      { labelAr: 'الورديات', labelEn: 'Shifts', icon: 'schedule', path: '/app/shifts' },
      { labelAr: 'الحضور والانصراف', labelEn: 'Attendance', icon: 'fact_check', path: '/app/attendance' },
      { labelAr: 'الإجازات', labelEn: 'Leave Requests', icon: 'event_note', path: '/app/leave' },
      { labelAr: 'العمل الإضافي', labelEn: 'Overtime', icon: 'more_time', path: '/app/overtime' },
      { labelAr: 'العطل الرسمية', labelEn: 'Public Holidays', icon: 'today', path: '/app/holidays' }
    ]
  },
  {
    labelAr: 'الامتثال والوثائق',
    labelEn: 'Compliance & Documents',
    items: [
      { labelAr: 'الامتثال', labelEn: 'Compliance', icon: 'verified_user', path: '/app/compliance' },
      { labelAr: 'الوثائق', labelEn: 'Documents', icon: 'folder_open', path: '/app/documents' },
      { labelAr: 'الأصول', labelEn: 'Assets', icon: 'inventory_2', path: '/app/assets' }
    ]
  },
  {
    labelAr: 'المالية',
    labelEn: 'Finance',
    items: [
      { labelAr: 'السلف', labelEn: 'Salary Advances', icon: 'payments', path: '/app/advances' },
      { labelAr: 'مسيرات الرواتب', labelEn: 'Payroll Runs', icon: 'receipt_long', path: '/app/payroll/runs' }
    ]
  },
  {
    labelAr: 'الإدارة',
    labelEn: 'Administration',
    items: [
      { labelAr: 'النماذج الرسمية', labelEn: 'Official Forms', icon: 'description', path: '/app/forms' },
      { labelAr: 'التقارير', labelEn: 'Reports', icon: 'bar_chart', path: '/app/reports' },
      { labelAr: 'المستخدمون', labelEn: 'Users', icon: 'manage_accounts', path: '/app/users' },
      { labelAr: 'الإعدادات', labelEn: 'Settings', icon: 'settings', path: '/app/settings' }
    ]
  }
];

const PAYROLLADMIN_NAV: NavGroup[] = [
  {
    labelAr: 'نظرة عامة',
    labelEn: 'Overview',
    items: [
      { labelAr: 'لوحة الرواتب', labelEn: 'Payroll Dashboard', icon: 'dashboard', path: '/app/dashboard' }
    ]
  },
  {
    labelAr: 'الرواتب',
    labelEn: 'Payroll',
    items: [
      { labelAr: 'مسيرات الرواتب', labelEn: 'Payroll Runs', icon: 'receipt_long', path: '/app/payroll/runs' },
      { labelAr: 'إدارة السلف', labelEn: 'Salary Advances', icon: 'payments', path: '/app/advances' }
    ]
  },
  {
    labelAr: 'البيانات المساندة',
    labelEn: 'Supporting Data',
    items: [
      { labelAr: 'الموظفون', labelEn: 'Employees (Read)', icon: 'groups', path: '/app/employees' },
      { labelAr: 'الوثائق', labelEn: 'Documents', icon: 'folder_open', path: '/app/documents' },
      { labelAr: 'العطل الرسمية', labelEn: 'Public Holidays', icon: 'today', path: '/app/holidays' },
      { labelAr: 'التقارير المالية', labelEn: 'Financial Reports', icon: 'bar_chart', path: '/app/reports' }
    ]
  },
  {
    labelAr: 'النماذج',
    labelEn: 'Forms',
    items: [
      { labelAr: 'النماذج الرسمية', labelEn: 'Official Forms', icon: 'description', path: '/app/forms' }
    ]
  }
];

const MANAGER_NAV: NavGroup[] = [
  {
    labelAr: 'نظرة عامة',
    labelEn: 'Overview',
    items: [
      { labelAr: 'لوحة الفريق', labelEn: 'Team Dashboard', icon: 'dashboard', path: '/app/dashboard' }
    ]
  },
  {
    labelAr: 'إدارة الفريق',
    labelEn: 'Team Management',
    items: [
      { labelAr: 'فريقي', labelEn: 'My Team', icon: 'groups', path: '/app/employees' },
      { labelAr: 'التأديب', labelEn: 'Disciplinary', icon: 'gavel', path: '/app/disciplinary' },
      { labelAr: 'ورديات الفريق', labelEn: 'Team Shifts', icon: 'schedule', path: '/app/shifts' },
      { labelAr: 'حضور الفريق', labelEn: 'Team Attendance', icon: 'fact_check', path: '/app/attendance' },
      { labelAr: 'إجازات الفريق', labelEn: 'Team Leave', icon: 'event_note', path: '/app/leave' },
      { labelAr: 'العمل الإضافي للفريق', labelEn: 'Team Overtime', icon: 'more_time', path: '/app/overtime' },
      { labelAr: 'العطل الرسمية', labelEn: 'Public Holidays', icon: 'today', path: '/app/holidays' }
    ]
  },
  {
    labelAr: 'الأدوات',
    labelEn: 'Tools',
    items: [
      { labelAr: 'الوثائق', labelEn: 'Documents', icon: 'folder_open', path: '/app/documents' },
      { labelAr: 'الأصول', labelEn: 'Assets', icon: 'inventory_2', path: '/app/assets' },
      { labelAr: 'النماذج الرسمية', labelEn: 'Official Forms', icon: 'description', path: '/app/forms' }
    ]
  }
];

const EMPLOYEE_NAV: NavGroup[] = [
  {
    labelAr: 'نظرة عامة',
    labelEn: 'Overview',
    items: [
      { labelAr: 'لوحتي', labelEn: 'My Dashboard', icon: 'dashboard', path: '/app/dashboard' }
    ]
  },
  {
    labelAr: 'الخدمة الذاتية',
    labelEn: 'Self Service',
    items: [
      { labelAr: 'حضوري', labelEn: 'My Attendance', icon: 'fact_check', path: '/app/attendance' },
      { labelAr: 'إجازاتي', labelEn: 'My Leave', icon: 'event_note', path: '/app/leave' },
      { labelAr: 'ساعاتي الإضافية', labelEn: 'My Overtime', icon: 'more_time', path: '/app/overtime' },
      { labelAr: 'سلفي', labelEn: 'My Advances', icon: 'payments', path: '/app/advances' },
      { labelAr: 'مسير راتبي', labelEn: 'My Payslips', icon: 'receipt_long', path: '/app/payroll/slips' },
      { labelAr: 'مستنداتي', labelEn: 'My Documents', icon: 'folder_open', path: '/app/documents' },
      { labelAr: 'أصولي', labelEn: 'My Assets', icon: 'inventory_2', path: '/app/assets' },
      { labelAr: 'العطل الرسمية', labelEn: 'Public Holidays', icon: 'today', path: '/app/holidays' },
      { labelAr: 'النماذج الرسمية', labelEn: 'Official Forms', icon: 'description', path: '/app/forms' }
    ]
  }
];

export const NAV_MAP: Record<string, NavGroup[]> = {
  superadmin: PLATFORM_NAV,
  hradmin: HRADMIN_NAV,
  payrolladmin: PAYROLLADMIN_NAV,
  manager: MANAGER_NAV,
  employee: EMPLOYEE_NAV,
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
  'disciplinary:view': ['hradmin', 'manager'],

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

  constructor(private auth: AuthService, private http: HttpClient) {
    // Whenever the logged-in user changes, refresh the permission map
    effect(() => {
      const user = this.auth.currentUser();
      if (user) {
        this._loadPermissions();
      } else {
        this._permissionMap.next(null);
      }
    });
  }

  private _loadPermissions() {
    this.http
      .get<{ success: boolean; data: PermissionMap }>('/api/permissions/my')
      .pipe(catchError(() => of(null)))
      .subscribe(res => {
        if (res?.success && res.data) {
          this._permissionMap.next(res.data);
        }
      });
  }

  /** Force-refresh permissions (call after login if needed) */
  refreshPermissions() {
    this._loadPermissions();
  }

  get role(): string {
    return this.auth.currentUser()?.role ?? '';
  }

  canSeePage(page: string): boolean {
    return (SCREEN_ACCESS[page] ?? []).includes(this.role);
  }

  getNavGroups(): NavGroup[] {
    return NAV_MAP[this.role] ?? [];
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

    const managerScreens = ['employees', 'leave', 'overtime', 'attendance', 'disciplinary', 'documents', 'assets', 'forms'];
    if (role === 'manager') {
      if (!managerScreens.includes(screen)) return false;
      if (['employees', 'documents', 'assets', 'forms'].includes(screen)) return action === 'view';
      if (screen === 'leave' || screen === 'overtime') return action === 'view' || action === 'approve';
      if (screen === 'attendance') return action === 'view';
      if (screen === 'disciplinary') return action === 'view' || action === 'create' || action === 'update';
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
}
