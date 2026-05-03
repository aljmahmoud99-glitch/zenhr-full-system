
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { Company, CompanyRegistration, PlatformStats, ApiResponse, User } from '../../core/models';

interface BranchDraft {
  nameAr: string; nameEn: string; code: string; city: string; address: string;
}

@Component({
  selector: 'app-superadmin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './superadmin.component.html',
  styleUrl: './superadmin.component.scss'
})
export class SuperadminComponent implements OnInit {
  activeTab = signal<'companies' | 'registrations'>('companies');
  companies = signal<Company[]>([]);
  registrations = signal<CompanyRegistration[]>([]);
  stats = signal<PlatformStats | null>(null);
  loading = signal(false);
  actionLoading = signal<number | null>(null);
  impersonateLoading = signal<number | null>(null);
  regFilter = signal<'pending' | 'approved' | 'rejected'>('pending');

  planModal = signal<{ company: Company; newPlan: string; maxEmployees: number; expiryDate: string } | null>(null);

  planOptions = [
    { value: 'trial',        label: 'Trial (10 emp)',         max: 10 },
    { value: 'starter',      label: 'Starter (50 emp)',       max: 50 },
    { value: 'professional', label: 'Professional (200 emp)', max: 200 },
    { value: 'enterprise',   label: 'Enterprise (∞)',         max: 9999 },
  ];

  // ─── Create Company Wizard ──────────────────────────────────────────────────
  showCreateModal = signal(false);
  createStep = signal(1);          // 1 Company | 2 Subscription | 3 Branches | 4 Admin | 5 Success
  createLoading = signal(false);
  createErrors = signal<Record<string, string>>({});

  companyForm = {
    nameAr: '', nameEn: '', code: '', commercialRegNo: '', taxNumber: '',
    email: '', phone: '', country: 'Jordan', city: '', address: '', isActive: true
  };
  subForm = {
    planName: 'trial', subscriptionStart: '', subscriptionEnd: '',
    maxUsers: 10, maxEmployees: 50, isTrial: true
  };
  branches: BranchDraft[] = [];
  adminForm = {
    username: '', email: '', password: '', confirmPassword: '',
    firstNameAr: '', lastNameAr: '', firstNameEn: '', lastNameEn: '', phone: ''
  };
  createSaved: { companyNameAr: string; adminUsername: string } | null = null;

  openCreateModal() {
    this.companyForm = {
      nameAr: '', nameEn: '', code: '', commercialRegNo: '', taxNumber: '',
      email: '', phone: '', country: 'Jordan', city: '', address: '', isActive: true
    };
    this.subForm = {
      planName: 'trial', subscriptionStart: '', subscriptionEnd: '',
      maxUsers: 10, maxEmployees: 50, isTrial: true
    };
    this.branches = [{ nameAr: '', nameEn: '', code: '', city: '', address: '' }];
    this.adminForm = {
      username: '', email: '', password: '', confirmPassword: '',
      firstNameAr: '', lastNameAr: '', firstNameEn: '', lastNameEn: '', phone: ''
    };
    this.createErrors.set({});
    this.createSaved = null;
    this.createStep.set(1);
    this.showCreateModal.set(true);
  }

  closeCreateModal() {
    this.showCreateModal.set(false);
  }

  addBranch() {
    this.branches = [...this.branches, { nameAr: '', nameEn: '', code: '', city: '', address: '' }];
  }

  removeBranch(i: number) {
    if (this.branches.length <= 1) return;
    this.branches = this.branches.filter((_, idx) => idx !== i);
  }

  private validateStep1(): boolean {
    const e: Record<string, string> = {};
    if (!this.companyForm.nameAr.trim())  e['nameAr']  = 'الاسم العربي مطلوب';
    if (!this.companyForm.nameEn.trim())  e['nameEn']  = 'الاسم الإنجليزي مطلوب';
    if (!this.companyForm.code.trim())    e['code']    = 'رمز الشركة مطلوب';
    if (this.companyForm.email && !/\S+@\S+\.\S+/.test(this.companyForm.email))
      e['email'] = 'البريد الإلكتروني غير صالح';
    this.createErrors.set(e);
    return !Object.keys(e).length;
  }

  private validateStep3(): boolean {
    const e: Record<string, string> = {};
    this.branches.forEach((br, i) => {
      if (!br.nameEn.trim()) e[`br_nameEn_${i}`] = 'الاسم الإنجليزي مطلوب';
      if (!br.nameAr.trim()) e[`br_nameAr_${i}`] = 'الاسم العربي مطلوب';
    });
    this.createErrors.set(e);
    return !Object.keys(e).length;
  }

  private validateStep4(): boolean {
    const e: Record<string, string> = {};
    const a = this.adminForm;
    if (!a.username.trim() || !/^[a-zA-Z0-9_]{3,}$/.test(a.username))
      e['adm_username'] = 'اسم المستخدم: أحرف لاتينية وأرقام، 3 على الأقل';
    if (!a.email.trim() || !/\S+@\S+\.\S+/.test(a.email))
      e['adm_email'] = 'بريد إلكتروني صالح مطلوب';
    if (!a.password || a.password.length < 8)
      e['adm_password'] = 'كلمة المرور يجب أن تكون 8 أحرف على الأقل';
    if (a.password !== a.confirmPassword)
      e['adm_confirm'] = 'كلمة المرور غير متطابقة';
    if (!a.firstNameEn.trim()) e['adm_firstNameEn'] = 'الاسم الأول بالإنجليزية مطلوب';
    if (!a.lastNameEn.trim())  e['adm_lastNameEn']  = 'اسم العائلة بالإنجليزية مطلوب';
    this.createErrors.set(e);
    return !Object.keys(e).length;
  }

  nextStep() {
    this.createErrors.set({});
    const s = this.createStep();
    if (s === 1 && !this.validateStep1()) return;
    if (s === 3 && !this.validateStep3()) return;
    this.createStep.set(s + 1);
  }

  prevStep() {
    this.createErrors.set({});
    this.createStep.set(this.createStep() - 1);
  }

  goStep(n: number) {
    // Only allow clicking a past step directly
    if (n < this.createStep()) {
      this.createErrors.set({});
      this.createStep.set(n);
    }
  }

  submitCreate() {
    if (!this.validateStep4()) return;
    this.createLoading.set(true);
    const a = this.adminForm;
    const payload = {
      nameAr: this.companyForm.nameAr,
      nameEn: this.companyForm.nameEn,
      code: this.companyForm.code,
      commercialRegNo: this.companyForm.commercialRegNo || null,
      taxNumber: this.companyForm.taxNumber || null,
      email: this.companyForm.email || null,
      phone: this.companyForm.phone || null,
      country: this.companyForm.country || 'Jordan',
      city: this.companyForm.city || null,
      address: this.companyForm.address || null,
      planName: this.subForm.planName,
      subscriptionStart: this.subForm.subscriptionStart || null,
      subscriptionEnd: this.subForm.subscriptionEnd || null,
      maxUsers: +this.subForm.maxUsers,
      maxEmployees: +this.subForm.maxEmployees,
      isTrial: this.subForm.isTrial,
      branches: this.branches.map(br => ({
        nameAr: br.nameAr, nameEn: br.nameEn,
        code: br.code || null, city: br.city || null,
      })),
      initialAdmin: {
        username: a.username,
        email: a.email,
        password: a.password,
        firstNameEn: a.firstNameEn,
        lastNameEn: a.lastNameEn,
        firstNameAr: a.firstNameAr || a.firstNameEn,
        lastNameAr: a.lastNameAr || a.lastNameEn,
        phone: a.phone || null,
      }
    };

    this.http.post<ApiResponse<any>>('/api/admin/companies', payload).subscribe({
      next: () => {
        this.createLoading.set(false);
        this.createSaved = {
          companyNameAr: this.companyForm.nameAr,
          adminUsername: this.adminForm.username,
        };
        this.createErrors.set({});
        this.createStep.set(5);
        this.loadAll();
      },
      error: (err) => {
        this.createLoading.set(false);
        const msg = err?.error?.message ?? 'حدث خطأ أثناء إنشاء الشركة';
        this.createErrors.set({ submit: msg });
      }
    });
  }

  // ─── Existing methods ───────────────────────────────────────────────────────
  constructor(private http: HttpClient, public auth: AuthService) {}

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.loading.set(true);
    this.http.get<ApiResponse<PlatformStats>>('/api/admin/stats').subscribe(r => {
      this.stats.set(r.data);
    });
    this.http.get<ApiResponse<Company[]>>('/api/admin/companies').subscribe(r => {
      this.companies.set(r.data ?? []);
      this.loading.set(false);
    });
    this.loadRegistrations();
  }

  loadRegistrations() {
    this.http.get<ApiResponse<CompanyRegistration[]>>(`/api/admin/registrations?status=${this.regFilter()}`).subscribe(r => {
      this.registrations.set(r.data ?? []);
    });
  }

  suspend(id: number) {
    if (!confirm('تعليق هذه الشركة؟')) return;
    this.actionLoading.set(id);
    this.http.post(`/api/admin/companies/${id}/suspend`, {}).subscribe({
      next: () => { this.actionLoading.set(null); this.loadAll(); },
      error: () => this.actionLoading.set(null)
    });
  }

  activate(id: number) {
    this.actionLoading.set(id);
    this.http.post(`/api/admin/companies/${id}/activate`, {}).subscribe({
      next: () => { this.actionLoading.set(null); this.loadAll(); },
      error: () => this.actionLoading.set(null)
    });
  }

  openPlanModal(c: Company) {
    const expiry = c.planExpiryDate ? c.planExpiryDate.substring(0, 10) : '';
    this.planModal.set({ company: c, newPlan: c.planType, maxEmployees: c.maxEmployees, expiryDate: expiry });
  }

  savePlan() {
    const m = this.planModal();
    if (!m) return;
    this.http.put(`/api/admin/companies/${m.company.id}/plan`, {
      planType: m.newPlan,
      maxEmployees: m.maxEmployees,
      planExpiryDate: m.expiryDate
    }).subscribe({
      next: () => { this.planModal.set(null); this.loadAll(); },
      error: (e) => alert(e.error?.message ?? 'فشل التحديث')
    });
  }

  impersonate(companyId: number) {
    if (!confirm('تسجيل الدخول كمدير هذه الشركة؟')) return;
    this.impersonateLoading.set(companyId);
    const adminToken = this.auth.getToken()!;
    const adminUser = localStorage.getItem('zenjo_user')!;
    localStorage.setItem('zenjo_admin_token', adminToken);
    localStorage.setItem('zenjo_admin_user', adminUser);

    this.http.post<ApiResponse<{ accessToken: string; user: User }>>(`/api/admin/impersonate/${companyId}`, {}).subscribe({
      next: (res) => {
        this.impersonateLoading.set(null);
        if (res.data?.accessToken) {
          this.auth.setImpersonationToken(res.data.accessToken, res.data.user);
        }
      },
      error: (e) => { this.impersonateLoading.set(null); alert(e.error?.message ?? 'فشل التمثيل'); }
    });
  }

  approveReg(id: number) {
    if (!confirm('الموافقة على هذا الطلب وإنشاء الشركة؟')) return;
    this.actionLoading.set(id);
    this.http.post(`/api/admin/registrations/${id}/approve`, {}).subscribe({
      next: () => { this.actionLoading.set(null); this.loadAll(); },
      error: (e) => { this.actionLoading.set(null); alert(e.error?.message ?? 'فشل'); }
    });
  }

  rejectReg(id: number, notes: string) {
    this.actionLoading.set(id);
    this.http.post(`/api/admin/registrations/${id}/reject`, { notes }).subscribe({
      next: () => { this.actionLoading.set(null); this.loadAll(); },
      error: () => this.actionLoading.set(null)
    });
  }

  planLabel(plan: string) {
    return this.planOptions.find(p => p.value === plan)?.label ?? plan;
  }

  planBadgeClass(plan: string) {
    return { trial: 'badge-warning', starter: 'badge-info', professional: 'badge-success', enterprise: 'badge-primary' }[plan] ?? 'badge-default';
  }

  statusBadge(isActive: boolean) {
    return isActive ? 'badge-success' : 'badge-danger';
  }

  isExpired(dateStr?: string): boolean {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  }
}
