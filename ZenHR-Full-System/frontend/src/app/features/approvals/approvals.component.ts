import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

type ApiResponse<T> = { success: boolean; data: T; message?: string };

interface ApprovalItem {
  id: string;
  domain: string;
  entityId: number;
  title: string;
  employeeName?: string | null;
  requester?: string | null;
  status: string;
  submittedAt?: string;
  currentStep?: string | null;
  availableActions: string[];
  priority: string;
  route: string;
  companyId: number;
}

@Component({
  selector: 'app-approvals',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="approvals-page" [attr.dir]="lang === 'ar' ? 'rtl' : 'ltr'">
      <header class="page-head">
        <div>
          <h1>{{ t('مركز الاعتمادات', 'Approval Center') }}</h1>
          <p>{{ t('اعتماد موحد لكل طلبات سير العمل حسب دورك ونطاق صلاحياتك.', 'Unified approval visibility for your role and data scope.') }}</p>
        </div>
        <div class="head-actions">
          <span class="unread">{{ t('غير مقروء', 'Unread') }}: {{ unreadCount }}</span>
          <button class="btn" type="button" (click)="load()" [disabled]="loading">{{ loading ? t('تحميل...', 'Loading...') : t('تحديث', 'Refresh') }}</button>
        </div>
      </header>

      <section class="filters">
        <label>
          <span>{{ t('المجال', 'Domain') }}</span>
          <select [(ngModel)]="domain" (ngModelChange)="load()">
            <option value="">{{ t('كل المجالات', 'All domains') }}</option>
            <option *ngFor="let option of domainOptions" [value]="option.value">{{ t(option.ar, option.en) }}</option>
          </select>
        </label>
        <label>
          <span>{{ t('بحث', 'Search') }}</span>
          <input [(ngModel)]="q" [placeholder]="t('ابحث بالموظف أو العنوان', 'Search employee or title')" />
        </label>
      </section>

      <div class="alert ok" *ngIf="success">{{ success }}</div>
      <div class="alert err" *ngIf="error">{{ error }}</div>

      <section class="approval-list" *ngIf="!loading; else skeleton">
        <article class="approval-card" *ngFor="let item of filteredItems()">
          <div class="main">
            <span class="domain">{{ domainLabel(item.domain) }}</span>
            <h2>{{ item.title || domainLabel(item.domain) }}</h2>
            <p>{{ item.employeeName || item.requester || t('بدون موظف مرتبط', 'No linked employee') }}</p>
            <small>{{ t('الخطوة الحالية', 'Current step') }}: {{ stepLabel(item.currentStep || item.status) }} · {{ item.submittedAt | date:'medium' }}</small>
          </div>
          <div class="status">
            <span class="badge" [class.high]="item.priority === 'high'">{{ statusLabel(item.status) }}</span>
            <a class="btn ghost" [routerLink]="item.route">{{ t('فتح المصدر', 'Open source') }}</a>
          </div>
          <div class="actions">
            <button class="btn primary" *ngIf="item.availableActions.includes('approve')" type="button" (click)="act(item, 'approve')" [disabled]="savingId === item.id">{{ t('اعتماد', 'Approve') }}</button>
            <button class="btn danger" *ngIf="item.availableActions.includes('reject')" type="button" (click)="act(item, 'reject')" [disabled]="savingId === item.id">{{ t('رفض', 'Reject') }}</button>
            <button class="btn" *ngIf="item.availableActions.includes('request_changes')" type="button" (click)="act(item, 'request_changes')" [disabled]="savingId === item.id">{{ t('طلب تعديل', 'Request changes') }}</button>
          </div>
        </article>
        <div class="empty" *ngIf="filteredItems().length === 0">{{ t('لا توجد اعتمادات معلقة.', 'No pending approvals.') }}</div>
      </section>

      <ng-template #skeleton>
        <section class="approval-list">
          <article class="approval-card skeleton" *ngFor="let row of [1,2,3]"></article>
        </section>
      </ng-template>
    </section>
  `,
  styles: [`
    .approvals-page{display:flex;flex-direction:column;gap:16px;padding:24px;color:var(--foreground);background:var(--app-bg,var(--background));min-height:100%}
    .page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
    h1{margin:0;font-size:28px;line-height:1.2}p{margin:4px 0 0;color:var(--foreground-muted,#64748b)}
    .head-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.unread{font-weight:700;color:var(--foreground-muted)}
    .filters{display:grid;grid-template-columns:220px minmax(240px,1fr);gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px}
    label{display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--foreground-muted)}select,input{min-height:40px;border:1px solid var(--border);border-radius:10px;background:var(--surface-elevated,var(--surface));color:var(--foreground);padding:0 12px}
    .approval-list{display:grid;gap:12px}.approval-card{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:16px;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;box-shadow:var(--shadow-sm,0 1px 3px #0001)}
    .approval-card h2{margin:6px 0 4px;font-size:18px}.approval-card small{display:block;color:var(--foreground-muted)}.domain{display:inline-flex;width:max-content;border:1px solid var(--border);border-radius:999px;padding:3px 9px;font-size:12px;color:var(--foreground-muted)}
    .status,.actions{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.badge{border-radius:999px;background:var(--primary-soft,#e0f2fe);color:var(--primary,#075985);padding:5px 10px;font-size:12px;font-weight:800}.badge.high{background:#fee2e2;color:#991b1b}
    .btn{border:1px solid var(--border);background:var(--surface-elevated,var(--surface));color:var(--foreground);border-radius:10px;padding:9px 12px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;min-height:38px}.btn.primary{background:var(--primary,#0f766e);border-color:var(--primary,#0f766e);color:#fff}.btn.danger{background:var(--danger,#dc2626);border-color:var(--danger,#dc2626);color:#fff}.btn.ghost{background:transparent}.btn:disabled{opacity:.6;cursor:not-allowed}
    .alert{padding:10px 12px;border-radius:10px}.ok{background:#dcfce7;color:#166534}.err{background:#fee2e2;color:#991b1b}.empty{text-align:center;color:var(--foreground-muted);padding:32px;background:var(--surface);border:1px dashed var(--border);border-radius:12px}
    .skeleton{min-height:108px;background:linear-gradient(90deg,var(--surface) 25%,var(--surface-elevated,#f1f5f9) 50%,var(--surface) 75%);background-size:200% 100%;animation:pulse 1.2s infinite}@keyframes pulse{to{background-position:-200% 0}}
    @media(max-width:760px){.approvals-page{padding:14px}.filters,.approval-card{grid-template-columns:1fr}.status,.actions{justify-content:flex-start}}
  `]
})
export class ApprovalsComponent implements OnInit {
  items: ApprovalItem[] = [];
  loading = false;
  savingId = '';
  error = '';
  success = '';
  domain = '';
  q = '';
  unreadCount = 0;
  domainOptions = [
    { value: 'leave', ar: 'الإجازات', en: 'Leave' },
    { value: 'employee_action', ar: 'حركات الموظفين', en: 'Employee actions' },
    { value: 'payroll_adjustment', ar: 'تعديلات الرواتب', en: 'Payroll adjustments' },
    { value: 'attendance_correction', ar: 'تصحيحات الحضور', en: 'Attendance corrections' },
    { value: 'recruitment', ar: 'التوظيف', en: 'Recruitment' },
    { value: 'performance', ar: 'الأداء', en: 'Performance' },
    { value: 'compliance_contract', ar: 'العقود والامتثال', en: 'Contracts compliance' },
  ];

  constructor(private http: HttpClient, private auth: AuthService) {}

  get lang() { return this.auth.lang; }

  ngOnInit(): void {
    this.load();
    this.loadUnread();
  }

  t(ar: string, en: string) { return this.lang === 'ar' ? ar : en; }

  load(): void {
    this.loading = true;
    this.error = '';
    const qs = this.domain ? `?domain=${encodeURIComponent(this.domain)}` : '';
    this.http.get<ApiResponse<{ items: ApprovalItem[]; total: number }>>(`/api/approvals/pending${qs}`)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: res => this.items = res.data?.items || [],
        error: err => this.error = err?.error?.message || this.t('تعذر تحميل الاعتمادات.', 'Unable to load approvals.'),
      });
  }

  loadUnread(): void {
    this.http.get<ApiResponse<{ count: number }>>('/api/notifications/center/unread-count')
      .subscribe({ next: res => this.unreadCount = res.data?.count || 0 });
  }

  filteredItems(): ApprovalItem[] {
    const term = this.q.trim().toLowerCase();
    if (!term) return this.items;
    return this.items.filter(item => [item.title, item.employeeName, item.requester, item.domain, item.status].some(v => String(v || '').toLowerCase().includes(term)));
  }

  act(item: ApprovalItem, action: 'approve' | 'reject' | 'request_changes'): void {
    this.savingId = item.id;
    this.success = '';
    this.error = '';
    this.http.post<ApiResponse<unknown>>(`/api/approvals/${item.domain}/${item.entityId}/action`, { action, notes: this.t('تمت المعالجة من مركز الاعتمادات الموحد.', 'Processed from unified approval center.') })
      .pipe(finalize(() => this.savingId = ''))
      .subscribe({
        next: () => {
          this.success = action === 'approve' ? this.t('تم اعتماد الطلب.', 'Request approved.') : action === 'reject' ? this.t('تم رفض الطلب.', 'Request rejected.') : this.t('تم طلب التعديل.', 'Changes requested.');
          this.load();
          this.loadUnread();
        },
        error: err => this.error = err?.error?.message || this.t('تعذرت معالجة الطلب.', 'Unable to process request.'),
      });
  }

  domainLabel(domain: string): string {
    const item = this.domainOptions.find(option => option.value === domain);
    return item ? this.t(item.ar, item.en) : this.humanize(domain);
  }

  statusLabel(status: string): string {
    const labels: Record<string, [string, string]> = {
      pending: ['معلق', 'Pending'],
      pending_hr: ['بانتظار الموارد البشرية', 'Pending HR'],
      pending_manager: ['بانتظار المدير', 'Pending Manager'],
      pending_payroll: ['بانتظار الرواتب', 'Pending Payroll'],
      manager_approved: ['اعتماد المدير', 'Manager approved'],
      approved: ['معتمد', 'Approved'],
      rejected: ['مرفوض', 'Rejected'],
      escalated: ['مصعد', 'Escalated'],
      missing_documents: ['مستندات ناقصة', 'Missing documents'],
      pending_review: ['بانتظار المراجعة', 'Pending review'],
      draft: ['مسودة', 'Draft'],
    };
    const pair = labels[status];
    return pair ? this.t(pair[0], pair[1]) : this.humanize(status);
  }

  stepLabel(step: string): string {
    const labels: Record<string, [string, string]> = {
      hradmin: ['الموارد البشرية', 'HR'],
      manager: ['المدير', 'Manager'],
      payrolladmin: ['مسؤول الرواتب', 'Payroll'],
      recruiter: ['مسؤول التوظيف', 'Recruiter'],
      pending_hr: ['الموارد البشرية', 'HR'],
      pending_manager: ['المدير', 'Manager'],
      pending_payroll: ['مسؤول الرواتب', 'Payroll'],
    };
    const pair = labels[step];
    return pair ? this.t(pair[0], pair[1]) : this.statusLabel(step);
  }

  private humanize(value: string): string {
    const clean = String(value || '').replace(/_/g, ' ').trim();
    return clean ? clean.replace(/\b\w/g, c => c.toUpperCase()) : '—';
  }
}
