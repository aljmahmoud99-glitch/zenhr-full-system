
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { Company, CompanyRegistration, PlatformStats, ApiResponse, User } from '../../core/models';

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
    // Save current superadmin session
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
