import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { LangService } from '../../core/services/lang.service';
import { ToastService } from '../../core/services/toast.service';

type ApiResponse<T> = { success: boolean; data: T; message?: string };

interface NotificationRow {
  id: number;
  notificationType: string;
  titleAr: string;
  titleEn: string;
  messageAr: string;
  messageEn: string;
  priority: string;
  status: string;
  entityType?: string;
  actionUrl?: string;
  createdAt: string;
  readAt?: string;
}

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationsComponent implements OnInit {
  loading = false;
  saving = false;
  rows: NotificationRow[] = [];
  preferences: any[] = [];
  deliveryLogs: any[] = [];
  total = 0;
  page = 1;
  pageSize = 20;
  filters = { status: '', type: '' };

  constructor(
    public lang: LangService,
    public auth: AuthService,
    private api: ApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.load();
    this.loadPreferences();
    this.loadDeliveryLogs();
  }

  get role(): string {
    return this.auth.currentUser()?.role || '';
  }

  get canAdmin(): boolean {
    return this.role === 'hradmin' || this.role === 'superadmin';
  }

  t(ar: string, en: string): string {
    return this.lang.isAr ? ar : en;
  }

  title(row: NotificationRow): string {
    return this.lang.isAr ? row.titleAr : row.titleEn;
  }

  message(row: NotificationRow): string {
    return this.lang.isAr ? row.messageAr : row.messageEn;
  }

  typeLabel(type: string): string {
    const map: Record<string, { ar: string; en: string }> = {
      leave_request_submitted: { ar: 'طلب إجازة', en: 'Leave request' },
      leave_request_approved: { ar: 'اعتماد إجازة', en: 'Leave approved' },
      leave_request_rejected: { ar: 'رفض إجازة', en: 'Leave rejected' },
      leave_cancelled: { ar: 'إلغاء إجازة', en: 'Leave cancelled' },
      leave_approval_reminder: { ar: 'تذكير اعتماد', en: 'Approval reminder' },
      payroll_published: { ar: 'مسير رواتب', en: 'Payroll' },
      workflow_request_created: { ar: 'سير عمل', en: 'Workflow' },
      phase_d_test: { ar: 'اختبار', en: 'Test' }
    };
    const item = map[type] || { ar: type, en: type };
    return this.t(item.ar, item.en);
  }

  statusLabel(status: string): string {
    if (status === 'read') return this.t('مقروء', 'Read');
    return this.t('غير مقروء', 'Unread');
  }

  load(): void {
    this.loading = true;
    this.api.get<ApiResponse<any>>('/api/notifications/center', { ...this.filters, page: this.page, pageSize: this.pageSize })
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: res => {
          const data = res.data || {};
          this.rows = data.items || [];
          this.total = data.total || this.rows.length;
        },
        error: err => this.toast.error(err?.error?.message || this.t('تعذر تحميل الإشعارات.', 'Unable to load notifications.'))
      });
  }

  loadPreferences(): void {
    this.api.get<ApiResponse<any[]>>('/api/notifications/preferences')
      .subscribe({ next: res => { this.preferences = res.data || []; this.cdr.markForCheck(); } });
  }

  loadDeliveryLogs(): void {
    if (!this.canAdmin) return;
    this.api.get<ApiResponse<any[]>>('/api/notifications/delivery-logs')
      .subscribe({ next: res => { this.deliveryLogs = res.data || []; this.cdr.markForCheck(); } });
  }

  markRead(row: NotificationRow): void {
    this.api.patch<ApiResponse<unknown>>(`/api/notifications/${row.id}/read`)
      .subscribe({
        next: () => { row.status = 'read'; this.cdr.markForCheck(); },
        error: err => this.toast.error(err?.error?.message || this.t('تعذر تحديث الإشعار.', 'Unable to update notification.'))
      });
  }

  markUnread(row: NotificationRow): void {
    this.api.patch<ApiResponse<unknown>>(`/api/notifications/${row.id}/unread`)
      .subscribe({
        next: () => { row.status = 'unread'; this.cdr.markForCheck(); },
        error: err => this.toast.error(err?.error?.message || this.t('تعذر تحديث الإشعار.', 'Unable to update notification.'))
      });
  }

  markAllRead(): void {
    this.api.patch<ApiResponse<unknown>>('/api/notifications/read-all')
      .subscribe({
        next: () => {
          this.rows = this.rows.map(row => ({ ...row, status: 'read' }));
          this.toast.success(this.t('تم تعليم كل الإشعارات كمقروءة.', 'All notifications marked as read.'));
          this.cdr.markForCheck();
        },
        error: err => this.toast.error(err?.error?.message || this.t('تعذر تحديث الإشعارات.', 'Unable to update notifications.'))
      });
  }

  archive(row: NotificationRow): void {
    this.api.patch<ApiResponse<unknown>>(`/api/notifications/${row.id}/archive`)
      .subscribe({
        next: () => { this.rows = this.rows.filter(item => item.id !== row.id); this.cdr.markForCheck(); },
        error: err => this.toast.error(err?.error?.message || this.t('تعذر أرشفة الإشعار.', 'Unable to archive notification.'))
      });
  }

  savePreference(pref: any): void {
    this.saving = true;
    this.api.patch<ApiResponse<any>>('/api/notifications/preferences', {
      notificationType: pref.notification_type || pref.notificationType || '*',
      inAppEnabled: pref.in_app_enabled ?? pref.inAppEnabled,
      emailEnabled: pref.email_enabled ?? pref.emailEnabled
    })
      .pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => this.toast.success(this.t('تم حفظ التفضيلات.', 'Preferences saved.')),
        error: err => this.toast.error(err?.error?.message || this.t('تعذر حفظ التفضيلات.', 'Unable to save preferences.'))
      });
  }

  sendTest(): void {
    this.api.post<ApiResponse<unknown>>('/api/notifications/center/test', {})
      .subscribe({
        next: () => { this.toast.success(this.t('تم إرسال إشعار تجريبي.', 'Test notification sent.')); this.load(); },
        error: err => this.toast.error(err?.error?.message || this.t('تعذر إرسال الإشعار.', 'Unable to send notification.'))
      });
  }

  sendReminders(): void {
    this.api.post<ApiResponse<any>>('/api/notifications/reminders/leave-approvals', {})
      .subscribe({
        next: res => this.toast.success(this.t(`تم إرسال ${res.data?.sent || 0} تذكير.`, `${res.data?.sent || 0} reminders sent.`)),
        error: err => this.toast.error(err?.error?.message || this.t('تعذر إرسال التذكيرات.', 'Unable to send reminders.'))
      });
  }

  nextPage(delta: number): void {
    const maxPage = Math.max(1, Math.ceil(this.total / this.pageSize));
    this.page = Math.min(maxPage, Math.max(1, this.page + delta));
    this.load();
  }
}
