import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

type ApiResponse<T> = { success: boolean; data: T; message?: string };

@Component({
  selector: 'app-workflows',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="wf-page" [attr.dir]="lang === 'ar' ? 'rtl' : 'ltr'" [attr.lang]="lang">
      <header class="wf-head">
        <div>
          <h1>{{ t('الاعتمادات المعلقة', 'Pending Approvals') }}</h1>
          <p>{{ t('اعتمد أو ارفض طلبات سير العمل المسندة إلى دورك ونطاق صلاحياتك.', 'Approve or reject workflow requests assigned to your role and scope.') }}</p>
        </div>
        <button class="btn" type="button" (click)="load()" [disabled]="loading">{{ loading ? t('جارٍ التحميل...', 'Loading...') : t('تحديث', 'Refresh') }}</button>
      </header>

      <div class="alert ok" *ngIf="success">{{ success }}</div>
      <div class="alert err" *ngIf="error">{{ error }}</div>

      <section class="card">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>{{ t('الموظف', 'Employee') }}</th>
                <th>{{ t('النوع', 'Type') }}</th>
                <th>{{ t('الحالة', 'Status') }}</th>
                <th>{{ t('تاريخ السريان', 'Effective') }}</th>
                <th>{{ t('الإجراءات', 'Actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of pending">
                <td>
                  <strong>{{ employeeName(item) }}</strong>
                  <small>{{ item.employeeCode || '' }}</small>
                </td>
                <td>{{ workflowTypeLabel(item.actionType || item.type || item.labelEn) }}</td>
                <td><span class="badge">{{ statusLabel(item.status) }}</span></td>
                <td>{{ item.effectiveDate | date:'mediumDate' }}</td>
                <td>
                  <button class="btn primary" type="button" (click)="approve(item)" [disabled]="savingId===item.id">{{ t('اعتماد', 'Approve') }}</button>
                  <button class="btn danger" type="button" (click)="reject(item)" [disabled]="savingId===item.id">{{ t('رفض', 'Reject') }}</button>
                  <button class="btn" type="button" (click)="history(item)">{{ t('السجل', 'History') }}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="empty" *ngIf="!loading && pending.length===0">{{ t('لا توجد اعتمادات معلقة.', 'No pending approvals.') }}</div>
      </section>

      <aside class="modal" *ngIf="selectedHistory">
        <button class="btn" type="button" (click)="selectedHistory=null">{{ t('إغلاق', 'Close') }}</button>
        <div class="history-list" *ngIf="historyRows().length; else rawHistory">
          <article *ngFor="let row of historyRows()">
            <strong>{{ statusLabel(row.status || row.action || row.decision) }}</strong>
            <span>{{ row.createdAt || row.at || row.date | date:'medium' }}</span>
            <p>{{ row.notes || row.comment || row.message || '—' }}</p>
          </article>
        </div>
        <ng-template #rawHistory><pre>{{ selectedHistory | json }}</pre></ng-template>
      </aside>
    </section>
  `,
  styles: [`
    .wf-page{padding:24px;display:flex;flex-direction:column;gap:16px;color:var(--foreground);background:var(--app-bg,var(--background))}
    .wf-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .wf-head h1{margin:0;font-size:28px}.wf-head p{margin:4px 0 0;color:var(--foreground-muted,#64748b)}
    .card,.modal{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;box-shadow:var(--shadow-sm,0 1px 3px #0001)}
    .table-wrap{overflow:auto}.table{width:100%;border-collapse:collapse;min-width:760px}.table th,.table td{border-bottom:1px solid var(--border);padding:12px;text-align:start;vertical-align:middle}.table th{color:var(--foreground-muted);font-size:12px}.table small{display:block;color:var(--foreground-muted);margin-top:3px}
    .btn{border:1px solid var(--border);background:var(--surface-elevated,var(--surface));color:var(--foreground);border-radius:9px;padding:8px 10px;cursor:pointer;margin-inline-end:6px}.btn.primary{background:var(--primary,#0f766e);border-color:var(--primary,#0f766e);color:#fff}.btn.danger{background:var(--danger,#dc2626);border-color:var(--danger,#dc2626);color:#fff}.btn:disabled{opacity:.6;cursor:not-allowed}
    .badge{background:var(--primary-soft,#e0f2fe);color:var(--primary,#075985);border-radius:999px;padding:4px 9px;font-size:12px;font-weight:700}.alert{padding:10px;border-radius:8px}.ok{background:#dcfce7;color:#166534}.err{background:#fee2e2;color:#991b1b}.empty{padding:24px;text-align:center;color:var(--foreground-muted)}
    .modal{position:fixed;inset:10% 12%;z-index:90;overflow:auto;box-shadow:0 20px 60px #0003}.history-list{display:grid;gap:10px;margin-top:12px}.history-list article{border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--surface-muted,var(--surface))}pre{white-space:pre-wrap}
    @media(max-width:700px){.wf-page{padding:14px}.modal{inset:6% 4%}.table{min-width:640px}}
  `]
})
export class WorkflowsComponent implements OnInit {
  pending: any[] = [];
  selectedHistory: any = null;
  loading = false;
  savingId: number | null = null;
  success = '';
  error = '';

  constructor(private http: HttpClient, private auth: AuthService) {}

  get lang() { return this.auth.lang; }

  ngOnInit() { this.load(); }

  t(ar: string, en: string) { return this.lang === 'ar' ? ar : en; }

  load() {
    this.loading = true;
    this.error = '';
    this.http.get<ApiResponse<any[]>>('/api/workflows/pending')
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: r => this.pending = r.data ?? [],
        error: e => this.error = e?.error?.message || this.t('تعذر تحميل الاعتمادات.', 'Failed to load approvals'),
      });
  }

  approve(item: any) { this.decide(item, 'approve'); }
  reject(item: any) { this.decide(item, 'reject'); }

  history(item: any) {
    this.http.get<ApiResponse<any>>(`/api/workflows/${item.id}/history`).subscribe({
      next: r => this.selectedHistory = r.data,
      error: e => this.error = e?.error?.message || this.t('تعذر تحميل السجل.', 'Failed to load history'),
    });
  }

  historyRows(): any[] {
    const value = this.selectedHistory;
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.history)) return value.history;
    if (Array.isArray(value?.actions)) return value.actions;
    return [];
  }

  employeeName(item: any) {
    return this.lang === 'ar'
      ? (item.employeeFullNameAr || item.employeeNameAr || item.employeeFullNameEn || item.employeeCode || '—')
      : (item.employeeFullNameEn || item.employeeNameEn || item.employeeFullNameAr || item.employeeCode || '—');
  }

  statusLabel(status: string) {
    const labels: Record<string, [string, string]> = {
      pending: ['معلق', 'Pending'],
      pending_hr: ['بانتظار الموارد البشرية', 'Pending HR'],
      pending_manager: ['بانتظار المدير', 'Pending Manager'],
      pending_payroll: ['بانتظار الرواتب', 'Pending Payroll'],
      manager_approved: ['اعتماد المدير', 'Manager Approved'],
      hr_approved: ['اعتماد الموارد البشرية', 'HR Approved'],
      payroll_approved: ['اعتماد الرواتب', 'Payroll Approved'],
      approved: ['معتمد', 'Approved'],
      rejected: ['مرفوض', 'Rejected'],
      draft: ['مسودة', 'Draft'],
      completed: ['مكتمل', 'Completed'],
      cancelled: ['ملغى', 'Cancelled']
    };
    const pair = labels[status];
    return pair ? (this.lang === 'ar' ? pair[0] : pair[1]) : this.humanize(status);
  }

  workflowTypeLabel(type: string) {
    const labels: Record<string, [string, string]> = {
      suspension: ['إيقاف عن العمل', 'Suspension'],
      salary_change: ['تغيير راتب', 'Salary Change'],
      transfer: ['نقل', 'Transfer'],
      promotion: ['ترقية', 'Promotion'],
      suspension_lifted: ['رفع الإيقاف', 'Suspension Lifted'],
      status_change: ['تغيير حالة', 'Status Change'],
      career_movement: ['حركة وظيفية', 'Career Movement'],
      resignation: ['استقالة', 'Resignation'],
      disciplinary: ['إجراء تأديبي', 'Disciplinary Action'],
      payroll_adjustment: ['تعديل راتب', 'Payroll Adjustment']
    };
    const key = String(type || '').toLowerCase();
    const pair = labels[key];
    return pair ? (this.lang === 'ar' ? pair[0] : pair[1]) : this.humanize(type);
  }

  private decide(item: any, action: 'approve' | 'reject') {
    this.savingId = item.id;
    this.success = '';
    this.error = '';
    this.http.post<ApiResponse<any>>(`/api/workflows/${item.id}/${action}`, {})
      .pipe(finalize(() => this.savingId = null))
      .subscribe({
        next: () => {
          this.success = action === 'approve' ? this.t('تم اعتماد الطلب.', 'Request approved') : this.t('تم رفض الطلب.', 'Request rejected');
          this.load();
        },
        error: e => this.error = e?.error?.message || (action === 'approve' ? this.t('تعذر اعتماد الطلب.', 'Failed to approve') : this.t('تعذر رفض الطلب.', 'Failed to reject')),
      });
  }

  private humanize(value: string) {
    const clean = String(value || '').replace(/_/g, ' ').trim();
    return clean ? clean.replace(/\b\w/g, c => c.toUpperCase()) : '—';
  }
}
