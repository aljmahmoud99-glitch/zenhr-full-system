import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DashboardComponent } from './dashboard.component';

@Component({
  selector: 'app-payroll-dashboard',
  standalone: true,
  imports: [DashboardComponent],
  template: '<app-dashboard />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PayrollDashboardComponent {}
