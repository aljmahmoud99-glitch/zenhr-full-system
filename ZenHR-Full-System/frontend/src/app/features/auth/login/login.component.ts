
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { RoleAccessService } from '../../../core/services/role-access.service';
import { AppSettingsService } from '../../../core/services/app-settings.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  username = ''; password = '';
  error = signal('');
  loading = signal(false);
  showPassword = signal(false);
  lang = signal('ar');

  demoAccounts = [
    { user: 'admin', pass: 'Admin@1234', roleAr: 'مدير النظام', roleEn: 'Super Admin' },
    { user: 'hr', pass: 'Hr@1234', roleAr: 'مدير الموارد البشرية', roleEn: 'HR Admin' },
    { user: 'payroll', pass: 'Payroll@1234', roleAr: 'مدير الرواتب', roleEn: 'Payroll Admin' },
    { user: 'manager', pass: 'Manager@1234', roleAr: 'مدير القسم', roleEn: 'Manager' },
    { user: 'employee', pass: 'Employee@1234', roleAr: 'موظف', roleEn: 'Employee' }
  ];

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private roleAccess: RoleAccessService,
    private settings: AppSettingsService,
  ) {
    this.lang.set(auth.lang);
  }

  toggleLang() {
    const l = this.lang() === 'ar' ? 'en' : 'ar';
    this.lang.set(l); this.auth.setLang(l);
  }

  fill(acc: {user: string; pass: string}) {
    this.username = acc.user; this.password = acc.pass;
  }

  toggleShowPassword() { this.showPassword.update(v => !v); }

  login() {
    if (!this.username || !this.password) {
      this.error.set(this.lang() === 'ar' ? 'يرجى إدخال اسم المستخدم وكلمة المرور.' : 'Please enter username and password.');
      return;
    }
    this.loading.set(true); this.error.set('');
    this.auth.login(this.username, this.password).subscribe({
      next: () => {
        // Explicitly refresh permissions after login — belt-and-suspenders
        // alongside the effect() in RoleAccessService.
        this.roleAccess.refreshPermissions();
        void this.settings.refresh();
        const returnUrl = this.route.snapshot.queryParams['returnUrl'] || this.auth.defaultHomeUrl();
        this.router.navigateByUrl(returnUrl);
      },
      error: (err) => {
        this.loading.set(false);
        const msg = err?.error?.message || (this.lang() === 'ar' ? 'خطأ في بيانات الدخول.' : 'Invalid credentials.');
        this.error.set(msg);
      }
    });
  }
}

