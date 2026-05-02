import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { HrDashboardComponent } from './hr-dashboard.component';
import { PayrollDashboardComponent } from './payroll-dashboard.component';
import { ManagerDashboardComponent } from './manager-dashboard.component';
import { EmployeeDashboardComponent } from './employee-dashboard.component';

@Component({
  selector: 'app-dashboard-shell',
  standalone: true,
  imports: [
    CommonModule,
    HrDashboardComponent,
    PayrollDashboardComponent,
    ManagerDashboardComponent,
    EmployeeDashboardComponent
  ],
  template: `
    <app-hr-dashboard *ngIf="role === 'hradmin'"></app-hr-dashboard>
    <app-payroll-dashboard *ngIf="role === 'payrolladmin'"></app-payroll-dashboard>
    <app-manager-dashboard *ngIf="role === 'manager'"></app-manager-dashboard>
    <app-employee-dashboard *ngIf="role === 'employee'"></app-employee-dashboard>
    <app-hr-dashboard *ngIf="!role || role === 'superadmin'"></app-hr-dashboard>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardShellComponent {
  constructor(private auth: AuthService) {}

  get role() {
    return this.auth.currentUser()?.role ?? '';
  }
}
