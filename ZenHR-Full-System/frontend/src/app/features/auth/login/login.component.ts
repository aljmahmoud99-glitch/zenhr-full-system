import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { RoleAccessService } from '../../../core/services/role-access.service';
import { AppSettingsService } from '../../../core/services/app-settings.service';
import { BrandingService } from '../../../core/services/branding.service';
import { ThemeService } from '../../../core/services/theme.service';

type LoginCopyKey = keyof LoginComponent['copy'];

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  username = '';
  password = '';
  error = signal('');
  loading = signal(false);
  showPassword = signal(false);
  rememberMe = signal(true);
  lang = signal<'ar' | 'en'>('ar');

  demoAccounts = [
    { user: 'admin', pass: 'Admin@1234', roleAr: 'مدير المنصة', roleEn: 'Super Admin' },
    { user: 'hr', pass: 'Test@12345', roleAr: 'مدير الموارد البشرية', roleEn: 'HR Admin' },
    { user: 'payroll', pass: 'Test@12345', roleAr: 'مدير الرواتب', roleEn: 'Payroll Admin' },
    { user: 'manager', pass: 'Test@12345', roleAr: 'مدير قسم', roleEn: 'Manager' },
    { user: 'employee', pass: 'Test@12345', roleAr: 'موظف', roleEn: 'Employee' }
  ];

  copy = {
    brandSubtitle: { ar: 'نظام تشغيل الموارد البشرية', en: 'HR operating system' },
    light: { ar: 'نهاري', en: 'Light' },
    dark: { ar: 'ليلي', en: 'Dark' },
    arabic: { ar: 'عربي', en: 'Arabic' },
    kicker: { ar: 'منصة SaaS مؤسسية للأردن والمنطقة', en: 'Enterprise SaaS for Jordan and the region' },
    headline: { ar: 'إدارة موارد بشرية ورواتب وامتثال في منصة واحدة.', en: 'HR, payroll, workflows, and compliance in one operating platform.' },
    intro: { ar: 'ZenJO يربط الحضور والإجازات والرواتب والوثائق والأصول وسير الموافقات مع عزل المستأجرين وصلاحيات دقيقة لكل دور.', en: 'ZenJO connects attendance, leave, payroll, documents, assets, and approvals with tenant isolation and precise role permissions.' },
    peopleOps: { ar: 'إدارة الموظفين', en: 'People operations' },
    peopleOpsDesc: { ar: 'ملفات، عقود، وثائق، ومهام.', en: 'Profiles, contracts, documents, tasks.' },
    payroll: { ar: 'رواتب آمنة', en: 'Secure payroll' },
    payrollDesc: { ar: 'صلاحيات حساسة ومخرجات دقيقة.', en: 'Sensitive access and accurate outputs.' },
    workflows: { ar: 'موافقات ذكية', en: 'Smart workflows' },
    workflowsDesc: { ar: 'مدير، موارد بشرية، ورواتب.', en: 'Manager, HR, and payroll approvals.' },
    multiCompany: { ar: 'متعدد الشركات', en: 'Multi-company SaaS' },
    multiCompanyDesc: { ar: 'اشتراكات، خطط، وتدقيق مركزي.', en: 'Plans, subscriptions, and audit control.' },
    secureAccess: { ar: 'وصول آمن', en: 'Secure access' },
    tenantIsolation: { ar: 'عزل المستأجرين', en: 'Tenant isolation' },
    rolePermissions: { ar: 'صلاحيات حسب الدور', en: 'Role-based permissions' },
    signIn: { ar: 'تسجيل الدخول', en: 'Sign in' },
    accessWorkspace: { ar: 'ادخل إلى مساحة عمل ZenJO الخاصة بك.', en: 'Access your ZenJO workspace.' },
    username: { ar: 'اسم المستخدم أو البريد', en: 'Username or email' },
    usernamePlaceholder: { ar: 'مثال: hr', en: 'Example: hr' },
    password: { ar: 'كلمة المرور', en: 'Password' },
    passwordPlaceholder: { ar: 'أدخل كلمة المرور', en: 'Enter password' },
    showPassword: { ar: 'إظهار أو إخفاء كلمة المرور', en: 'Show or hide password' },
    rememberMe: { ar: 'تذكرني', en: 'Remember me' },
    protectedLogin: { ar: 'دخول محمي', en: 'Protected login' },
    signingIn: { ar: 'جار التحقق...', en: 'Signing in...' },
    secureSignIn: { ar: 'دخول آمن', en: 'Secure sign in' },
    demoTitle: { ar: 'حسابات تجربة سريعة', en: 'Quick demo access' },
    demoSubtitle: { ar: 'اختر حسابا لملء البيانات', en: 'Choose an account to fill credentials' },
    missingCredentials: { ar: 'يرجى إدخال اسم المستخدم وكلمة المرور.', en: 'Please enter username and password.' },
    invalidCredentials: { ar: 'خطأ في بيانات الدخول.', en: 'Invalid credentials.' }
  } as const;

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private roleAccess: RoleAccessService,
    private settings: AppSettingsService,
    private branding: BrandingService,
    public theme: ThemeService,
  ) {
    this.lang.set(auth.lang as 'ar' | 'en');
  }

  tx(key: LoginCopyKey) {
    const item = this.copy[key];
    return this.lang() === 'ar' ? item.ar : item.en;
  }

  toggleLang() {
    const next = this.lang() === 'ar' ? 'en' : 'ar';
    this.lang.set(next);
    this.auth.setLang(next);
  }

  toggleTheme() {
    this.theme.toggle();
  }

  fill(acc: { user: string; pass: string }) {
    this.username = acc.user;
    this.password = acc.pass;
  }

  toggleShowPassword() {
    this.showPassword.update(v => !v);
  }

  login() {
    if (!this.username || !this.password) {
      this.error.set(this.tx('missingCredentials'));
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.auth.login(this.username, this.password).subscribe({
      next: () => {
        this.roleAccess.refreshPermissions();
        void this.settings.refresh();
        void this.branding.loadAndApply();
        const returnUrl = this.route.snapshot.queryParams['returnUrl'] || this.auth.defaultHomeUrl();
        this.router.navigateByUrl(returnUrl);
      },
      error: (err) => {
        this.loading.set(false);
        const msg = err?.error?.message || this.tx('invalidCredentials');
        this.error.set(msg);
      }
    });
  }
}
