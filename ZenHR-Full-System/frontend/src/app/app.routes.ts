import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/guards/auth.guard';
import { SCREEN_ACCESS } from './core/services/role-access.service';

const pageAccess = (pathKey: keyof typeof SCREEN_ACCESS) => ({
  canActivate: [roleGuard],
  data: { pathKey, roles: SCREEN_ACCESS[pathKey] }
});

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'change-password',
    canActivate: [authGuard],
    loadComponent: () => import('./features/auth/change-password/change-password.component').then(m => m.ChangePasswordComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent)
  },
  {
    path: 'subscription-expired',
    loadComponent: () => import('./features/subscription-expired/subscription-expired.component').then(m => m.SubscriptionExpiredComponent)
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/layout.component').then(m => m.LayoutComponent),
    children: [
      { path: '', redirectTo: 'companies', pathMatch: 'full' },
      {
        path: 'companies',
        ...pageAccess('/admin/companies'),
        loadComponent: () => import('./features/superadmin/superadmin.component').then(m => m.SuperadminComponent)
      },
      {
        path: 'users',
        ...pageAccess('/admin/users'),
        loadComponent: () => import('./features/users/users.component').then(m => m.UsersComponent)
      }
    ]
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/layout.component').then(m => m.LayoutComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        ...pageAccess('/app/dashboard'),
        loadComponent: () => import('./features/dashboard/dashboard-shell.component').then(m => m.DashboardShellComponent)
      },
      {
        path: 'employees',
        ...pageAccess('/app/employees'),
        loadComponent: () => import('./features/employees/employees.component').then(m => m.EmployeesComponent)
      },
      {
        path: 'job-descriptions',
        ...pageAccess('/app/job-descriptions'),
        loadComponent: () => import('./features/job-descriptions/job-descriptions.component').then(m => m.JobDescriptionsComponent)
      },
      {
        path: 'employees/:id',
        ...pageAccess('/app/employees/:id'),
        loadComponent: () => import('./features/employee-profile/employee-profile.component').then(m => m.EmployeeProfileComponent)
      },
      {
        path: 'pre-employment',
        ...pageAccess('/app/pre-employment'),
        loadComponent: () => import('./features/pre-employment/pre-employment.component').then(m => m.PreEmploymentComponent)
      },
      {
        path: 'pre-employment/evaluation/:employeeId',
        ...pageAccess('/app/pre-employment/evaluation/:employeeId'),
        loadComponent: () => import('./features/pre-employment/pre-employment-evaluation.component').then(m => m.PreEmploymentEvaluationComponent)
      },
      {
        path: 'disciplinary',
        ...pageAccess('/app/disciplinary'),
        loadComponent: () => import('./features/disciplinary/disciplinary.component').then(m => m.DisciplinaryComponent)
      },
      {
        path: 'resignations',
        ...pageAccess('/app/resignations'),
        loadComponent: () => import('./features/resignations/resignations.component').then(m => m.ResignationsComponent)
      },
      {
        path: 'clearance',
        ...pageAccess('/app/clearance'),
        loadComponent: () => import('./features/clearance/clearance.component').then(m => m.ClearanceComponent)
      },
      {
        path: 'compliance',
        ...pageAccess('/app/compliance'),
        loadComponent: () => import('./features/compliance/compliance.component').then(m => m.ComplianceComponent)
      },
      {
        path: 'assets',
        ...pageAccess('/app/assets'),
        loadComponent: () => import('./features/assets/assets.component').then(m => m.AssetsComponent)
      },
      {
        path: 'shifts',
        ...pageAccess('/app/shifts'),
        loadComponent: () => import('./features/shifts/shifts.component').then(m => m.ShiftsComponent)
      },
      {
        path: 'attendance',
        ...pageAccess('/app/attendance'),
        loadComponent: () => import('./features/attendance/attendance.component').then(m => m.AttendanceComponent)
      },
      {
        path: 'leave',
        ...pageAccess('/app/leave'),
        loadComponent: () => import('./features/leave/leave.component').then(m => m.LeaveComponent)
      },
      {
        path: 'overtime',
        ...pageAccess('/app/overtime'),
        loadComponent: () => import('./features/overtime/overtime.component').then(m => m.OvertimeComponent)
      },
      { path: 'payroll', redirectTo: 'payroll/runs', pathMatch: 'full' },
      {
        path: 'payroll/runs',
        ...pageAccess('/app/payroll/runs'),
        loadComponent: () => import('./features/payroll/payroll.component').then(m => m.PayrollComponent)
      },
      {
        path: 'payroll/slips',
        ...pageAccess('/app/payroll/slips'),
        loadComponent: () => import('./features/payroll/payroll.component').then(m => m.PayrollComponent)
      },
      {
        path: 'payroll/salary-components',
        ...pageAccess('/app/payroll/salary-components'),
        loadComponent: () => import('./features/payroll/salary-component-definitions/salary-component-definitions.component').then(m => m.SalaryComponentDefinitionsComponent)
      },
      {
        path: 'salary-components',
        ...pageAccess('/app/salary-components'),
        loadComponent: () => import('./features/salary-components/salary-components.component').then(m => m.SalaryComponentsComponent)
      },
      {
        path: 'documents',
        ...pageAccess('/app/documents'),
        loadComponent: () => import('./features/documents/documents.component').then(m => m.DocumentsComponent)
      },
      {
        path: 'advances',
        ...pageAccess('/app/advances'),
        loadComponent: () => import('./features/advances/advances.component').then(m => m.AdvancesComponent)
      },
      {
        path: 'holidays',
        ...pageAccess('/app/holidays'),
        loadComponent: () => import('./features/holidays/holidays.component').then(m => m.HolidaysComponent)
      },
      {
        path: 'reports',
        ...pageAccess('/app/reports'),
        loadComponent: () => import('./features/reports/reports.component').then(m => m.ReportsComponent)
      },
      {
        path: 'users',
        ...pageAccess('/app/users'),
        loadComponent: () => import('./features/users/users.component').then(m => m.UsersComponent)
      },
      {
        path: 'settings',
        ...pageAccess('/app/settings'),
        loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent)
      },
      {
        path: 'forms',
        ...pageAccess('/app/forms'),
        loadComponent: () => import('./features/forms/forms.component').then(m => m.FormsComponent)
      },
      {
        path: 'forms/:formId',
        ...pageAccess('/app/forms'),
        loadComponent: () => import('./features/forms/form-viewer/form-viewer.component').then(m => m.FormViewerComponent)
      },
      {
        path: 'org-structure',
        ...pageAccess('/app/org-structure'),
        loadComponent: () => import('./features/org-structure/org-structure.component').then(m => m.OrgStructureComponent)
      },
      {
        path: 'roles',
        ...pageAccess('/app/roles'),
        loadComponent: () => import('./features/roles/roles.component').then(m => m.RolesComponent)
      },
      {
        path: 'user-roles',
        ...pageAccess('/app/user-roles'),
        loadComponent: () => import('./features/user-roles/user-roles.component').then(m => m.UserRolesComponent)
      },
      {
        path: 'employee-actions/career-movements',
        ...pageAccess('/app/employee-actions/career-movements'),
        loadComponent: () => import('./features/employee-actions/career-movements/career-movements.component').then(m => m.CareerMovementsComponent)
      },
      {
        path: 'employee-actions/salary-changes',
        ...pageAccess('/app/employee-actions/salary-changes'),
        loadComponent: () => import('./features/employee-actions/salary-changes/salary-changes.component').then(m => m.SalaryChangesComponent)
      },
      {
        path: 'employee-actions/status-changes',
        ...pageAccess('/app/employee-actions/status-changes'),
        loadComponent: () => import('./features/employee-actions/status-changes/status-changes.component').then(m => m.StatusChangesComponent)
      }
    ]
  },
  { path: '**', redirectTo: 'login' }
];
