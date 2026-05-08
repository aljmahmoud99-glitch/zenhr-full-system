import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { finalize, forkJoin } from 'rxjs';
import { I18nService } from '../../core/services/i18n.service';

type ApiResponse<T> = { success: boolean; data: T; message?: string };

@Component({
  selector: 'app-admin-automation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="automation-shell">
      <header class="hero">
        <div>
          <div class="breadcrumbs">
            <span>{{ t('إدارة ZenJO', 'ZenJO Admin') }}</span>
            <span class="material-symbols-rounded">chevron_right</span>
            <strong>{{ t('الأتمتة المؤسسية', 'Enterprise Automation') }}</strong>
          </div>
          <h1>{{ t('الأتمتة المؤسسية', 'Enterprise Automation') }}</h1>
          <p>{{ t('مركز تحكم للتخزين وتسليم البريد واختبار الإشعارات وعمليات الطوابير الخلفية.', 'Command center for storage, email delivery, notification QA, and background queue operations.') }}</p>
        </div>
      </header>

      <div class="context-action-bar">
        <div>
          <span>{{ t('إجراءات الصفحة', 'Page actions') }}</span>
          <strong>{{ t('الأتمتة والعمليات', 'Automation operations') }}</strong>
        </div>
        <div class="hero-actions">
          <button class="action ghost" type="button" (click)="load()" [disabled]="loading">
            <span class="material-symbols-rounded" [class.spin]="loading">{{ loading ? 'progress_activity' : 'refresh' }}</span>
            {{ loading ? t('جار التحديث', 'Refreshing') : t('تحديث', 'Refresh') }}
          </button>
          <button class="action primary" type="button" (click)="runDueJobs()" [disabled]="saving">
            <span class="material-symbols-rounded">play_arrow</span>
            {{ t('تشغيل المهام المستحقة', 'Run due jobs') }}
          </button>
        </div>
      </div>

      <div class="toast success" *ngIf="success"><span class="material-symbols-rounded">check_circle</span>{{ success }}</div>
      <div class="toast danger" *ngIf="error"><span class="material-symbols-rounded">error</span>{{ error }}</div>

      <section class="metric-grid">
        <article class="metric-card">
          <span>{{ t('تسليم الإشعارات', 'Notification delivery') }}</span>
          <strong>{{ metric('notificationsSent') }}</strong>
          <small><i class="up">+9.2%</i> {{ t('اتجاه سبعة أيام', 'seven day trend') }}</small>
        </article>
        <article class="metric-card">
          <span>{{ t('تجارب البريد الجافة', 'Email dry-runs') }}</span>
          <strong>{{ emailLogs.length }}</strong>
          <small>{{ deliveryRate() }} {{ t('مؤشر نجاح التسليم', 'delivery success score') }}</small>
        </article>
        <article class="metric-card">
          <span>{{ t('الملفات المتتبعة', 'Tracked files') }}</span>
          <strong>{{ files.length }}</strong>
          <small>{{ storageConfig.storage_provider || 'local' }} {{ t('مزوّد', 'provider') }}</small>
        </article>
        <article class="metric-card">
          <span>{{ t('مهام الطابور', 'Queue jobs') }}</span>
          <strong>{{ jobs.length }}</strong>
          <small>{{ failedJobs() }} {{ t('تحتاج متابعة', 'need attention') }}</small>
        </article>
      </section>

      <section class="automation-grid">
        <article class="panel storage-panel">
          <div class="panel-head">
            <div>
              <span class="section-kicker">{{ t('إعدادات التخزين', 'Storage Settings') }}</span>
              <h2>{{ t('تخزين الملفات الخاصة', 'Private file storage') }}</h2>
              <p>{{ t('إعدادات المزوّد المحلي وحدود الرفع وخصوصية الملفات وجاهزية التخزين.', 'Local provider defaults, upload limits, file visibility, and storage readiness.') }}</p>
            </div>
            <span class="status-pill success">{{ t('سليم', 'Healthy') }}</span>
          </div>
          <div class="provider-cards">
            <button type="button" class="provider-card selected">
              <span class="material-symbols-rounded">hard_drive</span>
              <strong>{{ t('تخزين محلي', 'Local Storage') }}</strong>
              <small>{{ t('التخزين الافتراضي للوثائق الخاصة', 'Default private document storage') }}</small>
            </button>
            <button type="button" class="provider-card">
              <span class="material-symbols-rounded">cloud</span>
              <strong>{{ t('تخزين سحابي', 'Cloud Storage') }}</strong>
              <small>{{ t('جاهز للتوسع المتوافق مع S3', 'Ready for S3-compatible expansion') }}</small>
            </button>
          </div>
          <div class="usage-box">
            <div><span>{{ t('السعة المستخدمة', 'Used capacity') }}</span><strong>{{ files.length * 2 }} MB</strong></div>
            <i><em [style.width.%]="capacityPercent()"></em></i>
            <small>{{ files.length }} {{ t('كائنات ملفات مفهرسة مع بيانات صلاحيات', 'file objects indexed with RBAC metadata') }}</small>
          </div>
          <div class="form-grid">
            <label>{{ t('المزوّد', 'Provider') }}<input class="field" [(ngModel)]="storageConfig.storage_provider"></label>
            <label>{{ t('المسار المحلي', 'Local path') }}<input class="field" [(ngModel)]="storageConfig.storage_local_path"></label>
            <label>{{ t('أقصى حجم رفع بالميغابايت', 'Max upload MB') }}<input class="field" [(ngModel)]="storageConfig.max_upload_mb"></label>
            <label>{{ t('أنواع MIME المسموحة', 'Allowed MIME types') }}<input class="field" [(ngModel)]="storageConfig.allowed_upload_types"></label>
          </div>
          <button class="action primary" type="button" (click)="saveStorage()" [disabled]="saving">{{ t('حفظ إعدادات التخزين', 'Save storage settings') }}</button>
        </article>

        <article class="panel email-panel">
          <div class="panel-head">
            <div>
              <span class="section-kicker">{{ t('خدمة البريد', 'Email Service') }}</span>
              <h2>{{ t('إعداد تسليم SMTP', 'SMTP delivery setup') }}</h2>
              <p>{{ t('اضبط تسليم البريد التجريبي وهوية المرسل ورسائل الاختبار.', 'Configure dry-run email delivery, sender identity, and test message flows.') }}</p>
            </div>
            <span class="status-pill warning">{{ emailConfig.email_dry_run === 'false' ? t('فعّال', 'Live') : t('تجريبي', 'Dry-run') }}</span>
          </div>
          <div class="smtp-steps">
            <span class="active">{{ t('المرسل', 'Sender') }}</span><span>{{ t('الخادم', 'Server') }}</span><span>{{ t('التحقق', 'Validation') }}</span>
          </div>
          <label class="company-field">{{ t('معرّف الشركة', 'Company ID') }}<input class="field" type="number" [(ngModel)]="companyId" (change)="load()"></label>
          <div class="form-grid">
            <label>{{ t('مضيف SMTP', 'SMTP host') }}<input class="field" [(ngModel)]="emailConfig.smtp_host"></label>
            <label>{{ t('منفذ SMTP', 'SMTP port') }}<input class="field" [(ngModel)]="emailConfig.smtp_port"></label>
            <label>{{ t('مستخدم SMTP', 'SMTP user') }}<input class="field" [(ngModel)]="emailConfig.smtp_user"></label>
            <label>{{ t('بريد المرسل', 'From email') }}<input class="field" [(ngModel)]="emailConfig.smtp_from_email"></label>
            <label>{{ t('اسم المرسل', 'From name') }}<input class="field" [(ngModel)]="emailConfig.smtp_from_name"></label>
            <label>{{ t('البريد مفعّل', 'Email enabled') }}<select class="field" [(ngModel)]="emailConfig.email_enabled"><option>true</option><option>false</option></select></label>
            <label>{{ t('الوضع التجريبي', 'Dry-run') }}<select class="field" [(ngModel)]="emailConfig.email_dry_run"><option>true</option><option>false</option></select></label>
          </div>
          <div class="panel-actions">
            <button class="action primary" type="button" (click)="saveEmail()" [disabled]="saving">{{ t('حفظ إعدادات البريد', 'Save email settings') }}</button>
            <button class="action ghost" type="button" (click)="sendTestEmail()" [disabled]="saving">{{ t('إرسال بريد اختبار', 'Send test email') }}</button>
          </div>
        </article>
      </section>

      <section class="automation-grid lower">
        <article class="panel notification-panel">
          <div class="panel-head">
            <div>
              <span class="section-kicker">{{ t('اختبار الإشعارات', 'Notification QA') }}</span>
              <h2>{{ t('مؤشرات التسليم داخل النظام', 'In-app delivery intelligence') }}</h2>
              <p>{{ t('مؤشرات حجم التسليم وقوائم غير المقروء ومتابعة الفشل وأحداث سير العمل.', 'Signals for delivery volume, unread queues, failed delivery follow-up, and workflow events.') }}</p>
            </div>
            <button class="action ghost" type="button" (click)="sendTestNotification()" [disabled]="saving">{{ t('إرسال اختبار', 'Send test') }}</button>
          </div>
          <div class="delivery-grid">
            <div><strong>{{ metric('unreadNotifications') }}</strong><span>{{ t('غير مقروء', 'Unread') }}</span></div>
            <div><strong>{{ metric('readNotifications') }}</strong><span>{{ t('مقروء', 'Read') }}</span></div>
            <div><strong>{{ metric('urgentNotifications') }}</strong><span>{{ t('عاجل', 'Urgent') }}</span></div>
          </div>
          <div class="trend-chart">
            <span *ngFor="let h of trendBars(); let i = index" [style.height.%]="h"><b>{{ i + 1 }}</b></span>
          </div>
        </article>

        <article class="panel jobs-panel">
          <div class="panel-head">
            <div>
              <span class="section-kicker">{{ t('المهام الخلفية', 'Background Jobs') }}</span>
              <h2>{{ t('لوحة الطوابير', 'Queue dashboard') }}</h2>
              <p>{{ t('راقب حالة المهام وإعادة المحاولة وصحة العاملين دون كشف التفاصيل التقنية للمستخدمين.', 'Monitor job state, retry failures, and understand worker health without exposing internals to normal users.') }}</p>
            </div>
            <button class="action primary" type="button" (click)="queueJob()" [disabled]="saving">
              <span class="material-symbols-rounded">add</span>
              {{ t('إضافة مهمة', 'Queue job') }}
            </button>
          </div>
          <div class="queue-health">
            <div><span>{{ t('مكتملة', 'Completed') }}</span><strong>{{ jobsByStatus('completed') }}</strong></div>
            <div><span>{{ t('قيد الانتظار', 'Pending') }}</span><strong>{{ jobsByStatus('pending') }}</strong></div>
            <div><span>{{ t('فاشلة', 'Failed') }}</span><strong>{{ jobsByStatus('failed') }}</strong></div>
          </div>
          <table class="enterprise-table">
            <thead><tr><th>{{ t('المهمة', 'Job') }}</th><th>{{ t('الحالة', 'Status') }}</th><th>{{ t('المحاولات', 'Attempts') }}</th><th>{{ t('وقت التشغيل', 'Run at') }}</th><th>{{ t('العامل', 'Worker') }}</th></tr></thead>
            <tbody>
              <tr *ngFor="let job of jobs">
                <td><strong>{{ job.job_type }}</strong><small>{{ job.queue_name }}</small></td>
                <td><span class="status-pill" [ngClass]="jobTone(job.status)">{{ job.status }}</span></td>
                <td>{{ job.attempts || 0 }} / {{ job.max_attempts || 3 }}</td>
                <td>{{ job.run_at | date:'short' }}</td>
                <td><span class="worker-dot"></span>online</td>
              </tr>
            </tbody>
          </table>
        </article>
      </section>

      <section class="logs-grid">
        <article class="panel">
          <div class="panel-head"><div><span class="section-kicker">{{ t('سجلات البريد', 'Email logs') }}</span><h2>{{ t('أحدث محاولات التسليم', 'Recent delivery attempts') }}</h2></div></div>
          <table class="enterprise-table compact">
            <thead><tr><th>{{ t('المستلم', 'Recipient') }}</th><th>{{ t('القالب', 'Template') }}</th><th>{{ t('الحالة', 'Status') }}</th><th>{{ t('تاريخ الإنشاء', 'Created') }}</th></tr></thead>
            <tbody>
              <tr *ngFor="let log of emailLogs.slice(0, 8)">
                <td>{{ log.to_email }}</td>
                <td>{{ log.template_key }}</td>
                <td><span class="status-pill" [ngClass]="jobTone(log.status)">{{ log.status }}</span></td>
                <td>{{ log.created_at | date:'short' }}</td>
              </tr>
            </tbody>
          </table>
        </article>
        <article class="panel">
          <div class="panel-head"><div><span class="section-kicker">{{ t('كائنات الملفات', 'File objects') }}</span><h2>{{ t('أحدث الملفات الخاصة', 'Recent private files') }}</h2></div></div>
          <table class="enterprise-table compact">
            <thead><tr><th>{{ t('الملف', 'File') }}</th><th>{{ t('الظهور', 'Visibility') }}</th><th>{{ t('الحجم', 'Size') }}</th><th>{{ t('تاريخ الإنشاء', 'Created') }}</th></tr></thead>
            <tbody>
              <tr *ngFor="let file of files.slice(0, 8)">
                <td>{{ file.original_file_name }}</td>
                <td><span class="status-pill info">{{ file.visibility }}</span></td>
                <td>{{ file.size_bytes || 0 }} B</td>
                <td>{{ file.created_at | date:'short' }}</td>
              </tr>
            </tbody>
          </table>
        </article>
      </section>
    </section>
  `,
  styles: [`
    :host{display:block}.automation-shell{--green:#0f766e;--green-dark:#115e59;--ink:#10201b;--muted:#61746c;--line:#dbe6e1;--soft:#f6faf8;padding:28px;display:grid;gap:20px;color:var(--ink)}.hero{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding:22px;border:1px solid var(--line);border-radius:28px;background:linear-gradient(135deg,#fff 0%,#f7fbf9 58%,#eef8f4 100%);box-shadow:0 24px 70px rgba(15,23,42,.08)}.breadcrumbs{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:12px;font-weight:800}.breadcrumbs .material-symbols-rounded{font-size:16px}.hero h1{margin:10px 0 6px;font-size:clamp(30px,3vw,44px);letter-spacing:-.02em;line-height:1.05}.hero p{margin:0;max-width:740px;color:var(--muted)}.hero-actions,.panel-head,.panel-actions{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}.action{min-height:40px;border:1px solid var(--line);border-radius:13px;background:#fff;color:var(--ink);padding:9px 14px;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:900;font-size:12px;box-shadow:0 8px 20px rgba(15,23,42,.04)}.action.primary{background:linear-gradient(135deg,var(--green),var(--green-dark));border-color:var(--green);color:#fff;box-shadow:0 16px 30px rgba(15,118,110,.22)}.action.ghost{background:rgba(255,255,255,.75)}.action:disabled{opacity:.6}.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.metric-card{border:1px solid var(--line);border-radius:22px;background:#fff;padding:18px;box-shadow:0 14px 34px rgba(15,23,42,.055);overflow:hidden}.metric-card span{display:block;color:var(--muted);font-size:12px;font-weight:900}.metric-card strong{display:block;font-size:31px;margin-top:8px}.metric-card small{display:block;margin-top:8px;color:var(--muted)}.up{color:#16a34a;font-weight:900}.automation-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px}.automation-grid.lower{grid-template-columns:minmax(360px,.7fr) minmax(0,1.3fr)}.logs-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.panel{border:1px solid var(--line);border-radius:24px;background:rgba(255,255,255,.96);padding:20px;box-shadow:0 18px 44px rgba(15,23,42,.065);overflow:hidden}.section-kicker{display:inline-flex;width:max-content;border-radius:999px;background:#e9f7f2;color:var(--green);padding:5px 9px;font-size:11px;font-weight:900}.panel h2{margin:8px 0 4px;font-size:21px;letter-spacing:-.01em}.panel p{margin:0;color:var(--muted);font-size:13px}.status-pill{display:inline-flex;width:max-content;align-items:center;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900;background:#f1f5f9;color:#475569}.status-pill.success,.success{background:#dcfce7;color:#166534}.status-pill.warning,.warning,.dry_run{background:#fef3c7;color:#92400e}.status-pill.danger,.failed{background:#fee2e2;color:#991b1b}.status-pill.info,.pending{background:#dbeafe;color:#1d4ed8}.completed{background:#dcfce7;color:#166534}.provider-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px}.provider-card{border:1px solid var(--line);border-radius:18px;background:#fff;padding:14px;text-align:start;display:grid;gap:6px}.provider-card.selected{border-color:rgba(15,118,110,.45);background:#effaf6}.provider-card .material-symbols-rounded{color:var(--green)}.provider-card small{color:var(--muted)}.usage-box{display:grid;gap:8px;margin:16px 0;padding:15px;border:1px solid var(--line);border-radius:18px;background:linear-gradient(180deg,#f8fbfa,#f1f7f4)}.usage-box div{display:flex;justify-content:space-between}.usage-box span,.usage-box small{color:var(--muted)}.usage-box i{height:9px;border-radius:999px;background:#e2ece7;overflow:hidden}.usage-box em{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--green),#38bdf8)}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:16px 0}.form-grid label,.company-field{display:grid;gap:6px;color:var(--muted);font-size:11px;font-weight:900}.field{width:100%;min-height:42px;border:1px solid var(--line);border-radius:13px;background:#fff;padding:9px 12px;color:var(--ink);outline:none}.field:focus{border-color:var(--green);box-shadow:0 0 0 4px rgba(15,118,110,.12)}.smtp-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0}.smtp-steps span{height:34px;border-radius:12px;background:#f1f5f9;display:grid;place-items:center;color:var(--muted);font-size:12px;font-weight:900}.smtp-steps .active{background:#e9f7f2;color:var(--green)}.delivery-grid,.queue-health{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}.delivery-grid div,.queue-health div{border:1px solid var(--line);border-radius:18px;background:#f8fbfa;padding:14px}.delivery-grid strong,.queue-health strong{font-size:26px}.delivery-grid span,.queue-health span{display:block;color:var(--muted);font-size:12px;font-weight:900}.trend-chart{height:190px;display:flex;align-items:end;gap:8px;padding:16px;border-radius:18px;background:linear-gradient(180deg,#f8fbfa,#f1f7f4)}.trend-chart span{flex:1;min-height:14px;border-radius:10px 10px 4px 4px;background:linear-gradient(180deg,var(--green),#7dd3fc);position:relative}.trend-chart b{position:absolute;bottom:-22px;inset-inline:0;text-align:center;color:var(--muted);font-size:10px}.enterprise-table{width:100%;border-collapse:separate;border-spacing:0;margin-top:8px}.enterprise-table th{background:#f7faf9;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em}.enterprise-table th,.enterprise-table td{padding:12px 14px;border-bottom:1px solid var(--line);text-align:start;vertical-align:middle}.enterprise-table.compact th,.enterprise-table.compact td{padding:10px 12px}.enterprise-table td small{display:block;color:var(--muted)}.enterprise-table tbody tr:hover{background:#f8fbfa}.worker-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#16a34a;margin-inline-end:6px}.toast{display:flex;align-items:center;gap:8px;padding:12px 14px;border-radius:16px;font-weight:800}.toast.success{background:#dcfce7;color:#166534}.toast.danger{background:#fee2e2;color:#991b1b}.spin{animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}[dir='rtl'] .enterprise-table th{text-transform:none;letter-spacing:0}@media(max-width:1200px){.metric-grid,.automation-grid,.automation-grid.lower,.logs-grid{grid-template-columns:1fr}}@media(max-width:720px){.automation-shell{padding:16px}.hero,.hero-actions,.panel-head{display:grid}.provider-cards,.form-grid,.delivery-grid,.queue-health{grid-template-columns:1fr}.panel{padding:16px}.enterprise-table{min-width:760px}}
  `,
  `
    .context-action-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;border:1px solid var(--line);border-radius:20px;background:rgba(255,255,255,.86);box-shadow:0 12px 30px rgba(15,23,42,.055)}
    .context-action-bar>div:first-child{display:grid;gap:2px}
    .context-action-bar span{color:var(--muted);font-size:11px;font-weight:900}
    .context-action-bar strong{font-size:14px}
    .context-action-bar .hero-actions{align-items:center;justify-content:flex-end}
    @media(max-width:720px){.context-action-bar{display:grid}.context-action-bar .hero-actions{justify-content:start}}
  `]
})
export class AdminAutomationComponent implements OnInit {
  companyId = 1;
  loading = false;
  saving = false;
  success = '';
  error = '';
  summary: any = {};
  emailConfig: any = {};
  storageConfig: any = {};
  emailLogs: any[] = [];
  jobs: any[] = [];
  files: any[] = [];

  constructor(private http: HttpClient, public i18n: I18nService, private cdr: ChangeDetectorRef) {}

  t(ar: string, en: string) {
    return this.i18n.currentLang === 'ar' ? ar : en;
  }

  ngOnInit() {
    this.load();
    this.cdr.markForCheck();
  }

  load() {
    this.error = '';
    this.loading = true;
    forkJoin({
      summary: this.http.get<ApiResponse<any>>('/api/admin/automation/summary'),
      email: this.http.get<ApiResponse<any>>(`/api/admin/email/settings?companyId=${this.companyId}`),
      storage: this.http.get<ApiResponse<any>>(`/api/admin/storage/settings?companyId=${this.companyId}`),
      jobs: this.http.get<ApiResponse<any[]>>('/api/admin/background-jobs'),
    }).pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); })).subscribe({
      next: ({ summary, email, storage, jobs }) => {
        this.summary = summary.data ?? {};
        this.emailConfig = email.data?.config ?? {};
        this.emailLogs = email.data?.logs ?? [];
        this.storageConfig = storage.data?.config ?? {};
        this.files = storage.data?.files ?? [];
        this.jobs = jobs.data ?? [];
        this.cdr.markForCheck();
      },
      error: e => { this.error = e?.error?.message || 'Failed to load automation data'; this.cdr.markForCheck(); }
    });
  }

  metric(key: string) {
    return this.summary?.[key] ?? this.summary?.metrics?.[key] ?? 0;
  }

  deliveryRate() {
    if (!this.emailLogs.length) return '100%';
    const good = this.emailLogs.filter(log => ['sent', 'dry_run', 'delivered', 'completed'].includes(log.status)).length;
    return `${Math.round((good / this.emailLogs.length) * 100)}%`;
  }

  failedJobs() {
    return this.jobsByStatus('failed');
  }

  jobsByStatus(status: string) {
    return this.jobs.filter(job => job.status === status).length;
  }

  jobTone(status: string) {
    if (['completed', 'sent', 'delivered', 'dry_run'].includes(status)) return 'completed';
    if (status === 'failed') return 'failed';
    if (status === 'pending' || status === 'queued') return 'pending';
    return 'status-pill';
  }

  capacityPercent() {
    return Math.min(100, Math.max(8, this.files.length * 3));
  }

  trendBars() {
    return [28, 44, 38, 66, 52, 80, 64, 92, 74, 88];
  }

  saveEmail() {
    this.save('/api/admin/email/settings', { companyId: this.companyId, config: this.emailConfig }, 'Email settings saved');
  }

  saveStorage() {
    this.save('/api/admin/storage/settings', { companyId: this.companyId, config: this.storageConfig }, 'Storage settings saved');
  }

  sendTestEmail() {
    this.save('/api/admin/email/test', { companyId: this.companyId, toEmail: this.emailConfig.smtp_from_email || 'qa@example.com' }, 'Dry-run email logged', 'post');
  }

  sendTestNotification() {
    this.save('/api/notifications/test', {}, 'Test notification sent', 'post');
  }

  queueJob() {
    this.save('/api/admin/background-jobs', { companyId: this.companyId, jobType: 'qa_test', queueName: 'default', payload: { source: 'admin-ui' } }, 'Job queued', 'post');
  }

  runDueJobs() {
    this.save('/api/admin/background-jobs/run-due', {}, 'Due jobs processed', 'post');
  }

  private save(url: string, body: any, message: string, method: 'patch' | 'post' = 'patch') {
    this.saving = true;
    this.success = '';
    this.error = '';
    const req = method === 'post' ? this.http.post<ApiResponse<any>>(url, body) : this.http.patch<ApiResponse<any>>(url, body);
    req.pipe(finalize(() => this.saving = false)).subscribe({
      next: () => { this.success = message; this.load(); },
      error: e => this.error = e?.error?.message || 'Save failed',
    });
  }
}
