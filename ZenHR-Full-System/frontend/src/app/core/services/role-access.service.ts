import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
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

@Injectable({ providedIn: 'root' })
export class RoleAccessService {
  private permissionCache = new Map<string, Observable<boolean>>();

  constructor(private auth: AuthService, private http: HttpClient) {}

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

  canDo(screen: string, action: string): Observable<boolean> {
    const key = `${screen}:${action}`;
    const cached = this.permissionCache.get(key);
    if (cached) return cached;

    const params = new HttpParams().set('screen', screen).set('action', action);
    const request = this.http
      .get<{ success: boolean; data: { allowed: boolean } }>('/api/permissions/check', { params })
      .pipe(
        map(res => !!res.data?.allowed),
        catchError(() => of(this.canDoAction(key))),
        shareReplay(1)
      );

    this.permissionCache.set(key, request);
    return request;
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
}
