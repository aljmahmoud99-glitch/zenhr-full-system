import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { I18nService } from '../../core/services/i18n.service';

type Mode = 'roles' | 'settings' | 'plans' | 'analytics' | 'audit';
type ApiResponse<T> = { success: boolean; data: T; message?: string };

const MODULES = ['payroll', 'attendance', 'assets', 'compliance', 'documents', 'workflows', 'reports'];
const MODULE_LABELS: Record<string, { title: string; group: string; icon: string; description: string }> = {
  payroll: { title: 'Payroll', group: 'Finance', icon: 'payments', description: 'Runs, slips, salary components, payroll reports' },
  attendance: { title: 'Attendance', group: 'Workforce', icon: 'schedule', description: 'Clocking, shifts, attendance analytics' },
  assets: { title: 'Assets', group: 'Operations', icon: 'devices', description: 'Assigned devices, returns, asset inventory' },
  compliance: { title: 'Compliance', group: 'Risk', icon: 'verified_user', description: 'Documents, expiry alerts, legal readiness' },
  documents: { title: 'Documents', group: 'Operations', icon: 'folder_managed', description: 'Private employee files and forms' },
  workflows: { title: 'Workflows', group: 'Automation', icon: 'account_tree', description: 'Approvals, escalations, history' },
  reports: { title: 'Reports', group: 'Analytics', icon: 'monitoring', description: 'Operational and executive reporting' },
};

@Component({
  selector: 'app-system-admin-v1',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="admin-shell" [attr.data-mode]="mode">
      <header class="hero">
        <div class="hero-copy">
          <div class="breadcrumbs">
            <span>{{ t('إدارة ZenJO', 'ZenJO Admin') }}</span>
            <span class="material-symbols-rounded">chevron_right</span>
            <strong>{{ title }}</strong>
          </div>
          <h1>{{ title }}</h1>
          <p>{{ subtitle }}</p>
        </div>
      </header>

      <div class="context-action-bar">
        <div>
          <span>{{ t('إجراءات الصفحة', 'Page actions') }}</span>
          <strong>{{ title }}</strong>
        </div>
        <div class="hero-actions">
          <button class="action ghost" type="button">
            <span class="material-symbols-rounded">download</span>
            {{ t('تصدير', 'Export') }}
          </button>
          <button class="action primary" type="button" (click)="loadAll()" [disabled]="loading">
            <span class="material-symbols-rounded" [class.spin]="loading">{{ loading ? 'progress_activity' : 'refresh' }}</span>
            {{ loading ? t('جار التحديث', 'Refreshing') : t('تحديث', 'Refresh') }}
          </button>
        </div>
      </div>

      <div class="toast success" *ngIf="success">
        <span class="material-symbols-rounded">check_circle</span>
        {{ success }}
      </div>
      <div class="toast danger" *ngIf="error">
        <span class="material-symbols-rounded">error</span>
        {{ error }}
      </div>

      <ng-container [ngSwitch]="mode">
        <section *ngSwitchCase="'plans'" class="workspace">
          <div class="metric-grid">
            <article class="metric-card strong">
              <span class="metric-label">{{ t('الإيراد الشهري المتكرر', 'Monthly recurring revenue') }}</span>
              <strong>{{ money(totalMrr()) }}</strong>
              <small><span class="trend up">+12.8%</span> {{ t('نمو إجمالي الخطط', 'blended plan growth') }}</small>
            </article>
            <article class="metric-card">
              <span class="metric-label">{{ t('الاشتراكات النشطة', 'Active subscriptions') }}</span>
              <strong>{{ activeSubscriptionCount() }}</strong>
              <small>{{ subscriptions.length }} {{ t('سجل اشتراك إجمالي', 'total subscription records') }}</small>
            </article>
            <article class="metric-card">
              <span class="metric-label">{{ t('كتالوج الخطط', 'Plan catalog') }}</span>
              <strong>{{ plans.length }}</strong>
              <small>{{ activePlanCount() }} {{ t('خطط نشطة', 'active plans') }}</small>
            </article>
            <article class="metric-card">
              <span class="metric-label">{{ t('مسار التجارب', 'Trial pipeline') }}</span>
              <strong>{{ trialSubscriptionCount() }}</strong>
              <small>{{ t('حسابات قيد التقييم', 'accounts in evaluation') }}</small>
            </article>
          </div>

          <nav class="segmented-tabs">
            <button type="button" [class.active]="plansTab === 'plans'" (click)="plansTab='plans'">{{ t('الخطط', 'Plans') }}</button>
            <button type="button" [class.active]="plansTab === 'subscriptions'" (click)="plansTab='subscriptions'">{{ t('اشتراكات الشركات', 'Company Subscriptions') }}</button>
            <button type="button" [class.active]="plansTab === 'billing'" (click)="plansTab='billing'">{{ t('الفوترة', 'Billing') }}</button>
            <button type="button" [class.active]="plansTab === 'usage'" (click)="plansTab='usage'">{{ t('تحليلات الاستخدام', 'Usage Analytics') }}</button>
          </nav>

          <div class="plans-layout" *ngIf="plansTab === 'plans'">
            <section class="pricing-grid">
              <article class="plan-card" *ngFor="let p of plans" [class.inactive]="!p.is_active">
                <div class="plan-top">
                  <div>
                    <span class="status-pill" [class.success]="p.is_active" [class.neutral]="!p.is_active">{{ p.is_active ? t('نشطة', 'Active') : t('غير نشطة', 'Inactive') }}</span>
                    <h2>{{ p.name_en }}</h2>
                    <p>{{ p.name_ar || p.code }}</p>
                  </div>
                  <button class="icon-action" type="button" (click)="editPlan(p)" [attr.aria-label]="t('تعديل الخطة', 'Edit plan')">
                    <span class="material-symbols-rounded">edit</span>
                  </button>
                </div>
                <div class="price-row">
                  <strong>{{ money(p.price) }}</strong>
                  <span>/ {{ p.billing_cycle }}</span>
                </div>
                <div class="usage-bars">
                  <div>
                    <span>{{ t('المستخدمون', 'Users') }}</span><b>{{ p.max_users }}</b>
                    <i><em [style.width.%]="barPercent(p.max_users, 250)"></em></i>
                  </div>
                  <div>
                    <span>{{ t('الموظفون', 'Employees') }}</span><b>{{ p.max_employees }}</b>
                    <i><em [style.width.%]="barPercent(p.max_employees, 1000)"></em></i>
                  </div>
                </div>
                <div class="module-chip-list">
                  <span *ngFor="let mod of normalizeModules(p.enabled_modules)" class="module-chip">{{ moduleLabel(mod).title }}</span>
                </div>
                <footer>
                  <span>{{ subscriberCount(p.code) }} {{ t('مشتركون', 'subscribers') }}</span>
                  <strong>{{ money(planMrr(p)) }} MRR</strong>
                </footer>
              </article>
            </section>

            <aside class="builder-panel">
              <div class="panel-head">
                <span class="step-badge">{{ t('معالج الخطة', 'Plan wizard') }}</span>
                <h2>{{ planForm.id ? t('تعديل خطة مؤسسية', 'Edit enterprise plan') : t('إنشاء خطة مؤسسية', 'Create enterprise plan') }}</h2>
                <p>{{ t('حدد الحدود التجارية ودورة الفوترة والوحدات المفعلة.', 'Define commercial limits, billing cadence, and enabled product modules.') }}</p>
              </div>
              <div class="wizard-steps">
                <span class="active">{{ t('التفاصيل', 'Details') }}</span><span>{{ t('الحدود', 'Limits') }}</span><span>{{ t('الوحدات', 'Modules') }}</span>
              </div>
              <div class="form-grid">
                <label>{{ t('الرمز', 'Code') }}<input class="field" [(ngModel)]="planForm.code"></label>
                <label>{{ t('الاسم بالإنجليزية', 'Name EN') }}<input class="field" [(ngModel)]="planForm.nameEn"></label>
                <label>{{ t('الاسم بالعربية', 'Name AR') }}<input class="field" [(ngModel)]="planForm.nameAr"></label>
                <label>{{ t('السعر', 'Price') }}<input class="field" type="number" [(ngModel)]="planForm.price"></label>
                <label>{{ t('دورة الفوترة', 'Billing cycle') }}<input class="field" [(ngModel)]="planForm.billingCycle"></label>
                <label>{{ t('أيام التجربة', 'Trial days') }}<input class="field" type="number" [(ngModel)]="planForm.trialDays"></label>
                <label>{{ t('أقصى عدد مستخدمين', 'Max users') }}<input class="field" type="number" [(ngModel)]="planForm.maxUsers"></label>
                <label>{{ t('أقصى عدد موظفين', 'Max employees') }}<input class="field" type="number" [(ngModel)]="planForm.maxEmployees"></label>
              </div>
              <div class="module-card-grid">
                <button *ngFor="let m of modules" type="button" class="module-card" [class.selected]="planModules.has(m)" (click)="togglePlanModule(m)">
                  <span class="material-symbols-rounded">{{ moduleLabel(m).icon }}</span>
                  <strong>{{ moduleLabel(m).title }}</strong>
                  <small>{{ moduleLabel(m).description }}</small>
                </button>
              </div>
              <button class="action primary wide" type="button" (click)="savePlan()" [disabled]="saving">
                <span class="material-symbols-rounded">{{ saving ? 'progress_activity' : 'save' }}</span>
                {{ saving ? t('جار حفظ الخطة', 'Saving plan') : t('حفظ الخطة', 'Save plan') }}
              </button>
            </aside>
          </div>

          <section class="table-card" *ngIf="plansTab === 'subscriptions'">
            <div class="section-head">
              <div><h2>{{ t('اشتراكات الشركات', 'Company subscriptions') }}</h2><p>{{ t('اربط الخطط التجارية وراقب دورة الحياة وحافظ على حدود الشركات.', 'Assign commercial plans, monitor lifecycle, and keep company limits aligned.') }}</p></div>
            </div>
            <div class="subscription-editor">
              <select class="field" [(ngModel)]="subscriptionForm.companyId">
                <option [ngValue]="null">{{ t('اختر الشركة', 'Select company') }}</option>
                <option *ngFor="let c of companies" [ngValue]="c.id">{{ c.nameEn || c.name_en }}</option>
              </select>
              <select class="field" [(ngModel)]="subscriptionForm.planCode">
                <option *ngFor="let p of plans" [value]="p.code">{{ p.name_en }}</option>
              </select>
              <select class="field" [(ngModel)]="subscriptionForm.status">
                <option>trial</option><option>active</option><option>expired</option><option>suspended</option>
              </select>
              <input class="field" type="date" [(ngModel)]="subscriptionForm.startsAt">
              <input class="field" type="date" [(ngModel)]="subscriptionForm.endsAt">
              <button class="action primary" type="button" (click)="saveSubscription()" [disabled]="saving || !subscriptionForm.companyId">{{ t('حفظ', 'Save') }}</button>
            </div>
            <table class="enterprise-table">
              <thead><tr><th>{{ t('الشركة', 'Company') }}</th><th>{{ t('الخطة', 'Plan') }}</th><th>{{ t('الحالة', 'Status') }}</th><th>{{ t('الفترة', 'Period') }}</th><th>{{ t('الحدود', 'Limits') }}</th></tr></thead>
              <tbody>
                <tr *ngFor="let s of subscriptions">
                  <td><strong>{{ s.company_name_en }}</strong><small>{{ s.company_name_ar }}</small></td>
                  <td>{{ s.plan_name_en || s.plan_code || s.plan_id }}</td>
                  <td><span class="status-pill" [ngClass]="statusTone(s.status)">{{ s.status }}</span></td>
                  <td>{{ s.starts_at | date:'mediumDate' }} - {{ s.ends_at | date:'mediumDate' }}</td>
                  <td>{{ s.max_users }} {{ t('مستخدمين', 'users') }} / {{ s.max_employees }} {{ t('موظفين', 'employees') }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section class="analytics-panel" *ngIf="plansTab === 'billing' || plansTab === 'usage'">
            <div class="chart-card">
              <h2>{{ t('نمو الإيرادات', 'Revenue growth') }}</h2>
              <div class="bar-chart">
                <span *ngFor="let p of plans" [style.height.%]="barPercent(planMrr(p), maxPlanMrr())"><b>{{ p.code }}</b></span>
              </div>
            </div>
            <div class="chart-card">
              <h2>{{ t('توزيع الاشتراكات', 'Subscription distribution') }}</h2>
              <div class="donut" [style.--a]="donutDegree('active')" [style.--b]="donutDegree('trial')"></div>
              <div class="legend">
                <span><i class="success-dot"></i>{{ t('نشطة', 'Active') }} {{ activeSubscriptionCount() }}</span>
                <span><i class="warn-dot"></i>{{ t('تجريبية', 'Trial') }} {{ trialSubscriptionCount() }}</span>
                <span><i class="danger-dot"></i>{{ t('أخرى', 'Other') }} {{ subscriptions.length - activeSubscriptionCount() - trialSubscriptionCount() }}</span>
              </div>
            </div>
          </section>
        </section>

        <section *ngSwitchCase="'analytics'" class="workspace">
          <div class="metric-grid executive">
            <article class="metric-card" *ngFor="let s of summaryCards; let i = index">
              <span class="metric-label">{{ s.label }}</span>
              <strong>{{ s.value }}</strong>
              <small><span class="trend" [class.up]="i % 2 === 0" [class.flat]="i % 2 !== 0">{{ i % 2 === 0 ? '+8.4%' : '+1.9%' }}</span> {{ t('آخر 30 يوما', 'last 30 days') }}</small>
              <div class="sparkline"><i *ngFor="let n of spark(i)" [style.height.%]="n"></i></div>
            </article>
          </div>
          <div class="analytics-grid">
            <article class="chart-card wide">
              <h2>Users growth</h2>
              <div class="line-chart"><span *ngFor="let item of usersGrowth" [style.height.%]="barPercent(item.count || item.total || 1, maxSeries(usersGrowth))"></span></div>
            </article>
            <article class="chart-card">
              <h2>Companies growth</h2>
              <div class="area-chart"><span *ngFor="let item of companiesGrowth" [style.height.%]="barPercent(item.count || item.total || 1, maxSeries(companiesGrowth))"></span></div>
            </article>
            <article class="chart-card">
              <h2>Plan distribution</h2>
              <div class="distribution">
                <div *ngFor="let row of planDistribution()" class="dist-row">
                  <span>{{ row.label }}</span>
                  <i><em [style.width.%]="row.percent"></em></i>
                  <b>{{ row.count }}</b>
                </div>
              </div>
            </article>
            <article class="chart-card">
              <h2>Monthly activity heatmap</h2>
              <div class="heatmap"><span *ngFor="let n of heatmapCells()" [style.opacity]="n"></span></div>
            </article>
          </div>
          <section class="health-grid">
            <article class="health-card" *ngFor="let h of healthItems()">
              <span class="material-symbols-rounded">{{ h.icon }}</span>
              <div><strong>{{ h.label }}</strong><small>{{ h.detail }}</small></div>
              <i [class]="h.tone"></i>
            </article>
          </section>
        </section>

        <section *ngSwitchCase="'audit'" class="workspace">
          <section class="audit-filters">
            <input class="field" placeholder="Search keyword" [(ngModel)]="auditFilters.keyword">
            <input class="field" placeholder="Action type" [(ngModel)]="auditFilters.actionType">
            <input class="field" placeholder="Entity type" [(ngModel)]="auditFilters.entityType">
            <select class="field" [(ngModel)]="auditFilters.severity">
              <option value="">Severity</option><option>info</option><option>success</option><option>warning</option><option>critical</option>
            </select>
            <input class="field" type="date" [(ngModel)]="auditFilters.dateFrom">
            <input class="field" type="date" [(ngModel)]="auditFilters.dateTo">
            <button class="action primary" type="button" (click)="auditPage=1; loadAudit()"><span class="material-symbols-rounded">filter_alt</span>Apply</button>
          </section>
          <section class="audit-layout">
            <article class="table-card">
              <div class="section-head">
                <div><h2>Enterprise audit trail</h2><p>Immutable platform changes with actor, entity, company, and severity context.</p></div>
                <div class="export-actions"><button>CSV</button><button>Excel</button><button>PDF</button></div>
              </div>
              <table class="enterprise-table audit">
                <thead><tr><th>Date</th><th>Severity</th><th>Actor</th><th>Action</th><th>Entity</th><th>Company</th></tr></thead>
                <tbody>
                  <tr *ngFor="let row of auditRows" (click)="openAudit(row)" [class.selected]="selectedAudit?.id === row.id">
                    <td>{{ row.created_at | date:'short' }}</td>
                    <td><span class="status-pill" [ngClass]="auditTone(row.action_type)">{{ auditSeverity(row.action_type) }}</span></td>
                    <td><span class="avatar">{{ initials(row.actor_username || 'S') }}</span>{{ row.actor_username || '-' }}</td>
                    <td><strong>{{ row.action_type }}</strong></td>
                    <td>{{ row.entity_type || '-' }} #{{ row.entity_id || '-' }}</td>
                    <td>{{ row.company_name_en || '-' }}</td>
                  </tr>
                </tbody>
              </table>
              <div class="pager">
                <button class="action ghost" type="button" (click)="changeAuditPage(-1)" [disabled]="auditPage <= 1 || loading">Previous</button>
                <span>Page {{ auditPage }} / {{ auditPageCount }}</span>
                <button class="action ghost" type="button" (click)="changeAuditPage(1)" [disabled]="auditPage >= auditPageCount || loading">Next</button>
              </div>
            </article>
            <aside class="timeline-card">
              <h2>Event timeline</h2>
              <div class="timeline-item" *ngFor="let row of auditRows.slice(0, 8)" (click)="openAudit(row)">
                <span [class]="auditTone(row.action_type)"></span>
                <div><strong>{{ row.action_type }}</strong><small>{{ row.actor_username || 'System' }} · {{ row.created_at | date:'short' }}</small></div>
              </div>
            </aside>
          </section>
          <section class="drawer" *ngIf="selectedAudit">
            <button class="icon-action close" type="button" (click)="selectedAudit=null"><span class="material-symbols-rounded">close</span></button>
            <span class="status-pill" [ngClass]="auditTone(selectedAudit.action_type)">{{ auditSeverity(selectedAudit.action_type) }}</span>
            <h2>{{ selectedAudit.action_type }}</h2>
            <dl>
              <div><dt>Actor</dt><dd>{{ selectedAudit.actor_username || '-' }} {{ selectedAudit.actor_email ? '(' + selectedAudit.actor_email + ')' : '' }}</dd></div>
              <div><dt>Company</dt><dd>{{ selectedAudit.company_name_en || '-' }}</dd></div>
              <div><dt>Entity</dt><dd>{{ selectedAudit.entity_type || '-' }} #{{ selectedAudit.entity_id || '-' }}</dd></div>
              <div><dt>IP / Agent</dt><dd>{{ selectedAudit.ip_address || '-' }} · {{ selectedAudit.user_agent || '-' }}</dd></div>
            </dl>
          </section>
        </section>

        <section *ngSwitchCase="'settings'" class="workspace settings-grid">
          <article class="builder-panel">
            <div class="panel-head">
              <span class="step-badge">Tenant settings</span>
              <h2>Company deep settings</h2>
              <p>Commercial limits, locale, modules, and brand expression for each tenant.</p>
            </div>
            <select class="field" [(ngModel)]="selectedCompanyId" (change)="loadCompanySettings()">
              <option [ngValue]="null">Select company</option>
              <option *ngFor="let c of companies" [ngValue]="c.id">{{ c.nameEn || c.name_en }} / {{ c.nameAr || c.name_ar }}</option>
            </select>
            <div class="form-grid">
              <label>Max users<input class="field" type="number" [(ngModel)]="settingsForm.maxUsers"></label>
              <label>Max employees<input class="field" type="number" [(ngModel)]="settingsForm.maxEmployees"></label>
              <label>Timezone<input class="field" [(ngModel)]="settingsForm.timezone"></label>
              <label>Currency<input class="field" [(ngModel)]="settingsForm.currency"></label>
              <label>Locale<input class="field" [(ngModel)]="settingsForm.locale"></label>
            </div>
            <button class="action primary wide" type="button" (click)="saveCompanySettings()" [disabled]="saving || !selectedCompanyId">Save settings</button>
          </article>
          <article class="table-card">
            <div class="section-head"><div><h2>Modules</h2><p>Enable product surfaces with clean tenant-level boundaries.</p></div></div>
            <div class="module-card-grid">
              <button *ngFor="let m of modules" type="button" class="module-card" [class.selected]="moduleForm[m]" (click)="moduleForm[m]=!moduleForm[m]">
                <span class="material-symbols-rounded">{{ moduleLabel(m).icon }}</span>
                <strong>{{ moduleLabel(m).title }}</strong>
                <small>{{ moduleLabel(m).group }}</small>
              </button>
            </div>
            <button class="action primary" type="button" (click)="saveModules()" [disabled]="saving || !selectedCompanyId">Save modules</button>
            <div class="brand-row">
              <label>Logo URL<input class="field" [(ngModel)]="brandingForm.logoUrl"></label>
              <label>Primary<input class="field color" type="color" [(ngModel)]="brandingForm.primaryColor"></label>
              <label>Secondary<input class="field color" type="color" [(ngModel)]="brandingForm.secondaryColor"></label>
              <label>Accent<input class="field color" type="color" [(ngModel)]="brandingForm.accentColor"></label>
              <button class="action ghost" type="button" (click)="saveBranding()" [disabled]="saving || !selectedCompanyId">Save branding</button>
            </div>
          </article>
        </section>

        <section *ngSwitchCase="'roles'" class="workspace roles-layout">
          <article class="builder-panel">
            <div class="panel-head">
              <span class="step-badge">Access design</span>
              <h2>Role permission matrix</h2>
              <p>Grant precise screen/action access while keeping tenant data scopes explicit.</p>
            </div>
            <select class="field" [(ngModel)]="selectedRoleId" (change)="syncSelectedPermissions()">
              <option [ngValue]="null">Select role</option>
              <option *ngFor="let role of roles" [ngValue]="role.id">{{ role.company_name_en }} - {{ role.name }}</option>
            </select>
            <div class="segmented-control">
              <button type="button" [class.active]="selectedDataScope==='own'" (click)="selectedDataScope='own'">Own</button>
              <button type="button" [class.active]="selectedDataScope==='department'" (click)="selectedDataScope='department'">Department</button>
              <button type="button" [class.active]="selectedDataScope==='company'" (click)="selectedDataScope='company'">Company</button>
            </div>
            <button class="action primary wide" type="button" (click)="saveRolePermissions()" [disabled]="saving || !selectedRoleId">Save permissions</button>
          </article>
          <article class="permission-board">
            <button *ngFor="let p of permissions" type="button" class="permission-tile" [class.selected]="selectedPermissionIds.has(p.id)" (click)="togglePermission(p.id)">
              <span>{{ p.screen }}</span>
              <strong>{{ p.action }}</strong>
            </button>
          </article>
        </section>
      </ng-container>
    </section>
  `,
  styles: [`
    :host{display:block}.admin-shell{--green:#0f766e;--green-dark:#115e59;--ink:#10201b;--muted:#61746c;--line:#dbe6e1;--soft:#f6faf8;--card:#ffffff;padding:28px;display:grid;gap:20px;color:var(--ink)}.hero{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding:22px;border:1px solid rgba(219,230,225,.9);border-radius:28px;background:linear-gradient(135deg,#fff 0%,#f7fbf9 58%,#eef8f4 100%);box-shadow:0 24px 70px rgba(15,23,42,.08)}.breadcrumbs{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:12px;font-weight:700}.breadcrumbs .material-symbols-rounded{font-size:16px}.hero h1{margin:10px 0 6px;font-size:clamp(28px,3vw,42px);line-height:1.05;letter-spacing:-.02em}.hero p{margin:0;max-width:760px;color:var(--muted)}.hero-actions,.section-head,.export-actions,.pager,.brand-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.hero-actions{justify-content:flex-end}.action{min-height:40px;border:1px solid var(--line);border-radius:13px;background:#fff;color:var(--ink);padding:9px 14px;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:800;font-size:12px;box-shadow:0 8px 20px rgba(15,23,42,.04)}.action.primary{background:linear-gradient(135deg,var(--green),var(--green-dark));border-color:var(--green);color:#fff;box-shadow:0 16px 30px rgba(15,118,110,.22)}.action.ghost{background:rgba(255,255,255,.72)}.action.wide{width:100%}.action:disabled{opacity:.6}.icon-action{width:38px;height:38px;border:1px solid var(--line);border-radius:12px;background:#fff;display:grid;place-items:center}.workspace{display:grid;gap:18px}.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.metric-grid.executive{grid-template-columns:repeat(7,minmax(160px,1fr))}.metric-card{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:22px;background:rgba(255,255,255,.94);padding:18px;box-shadow:0 14px 34px rgba(15,23,42,.055)}.metric-card.strong{background:linear-gradient(135deg,#0f766e,#164e44);color:#fff}.metric-label{display:block;color:inherit;opacity:.72;font-size:12px;font-weight:800}.metric-card strong{display:block;margin-top:8px;font-size:30px;line-height:1}.metric-card small{display:block;margin-top:10px;color:inherit;opacity:.72}.trend{font-weight:900;color:#2563eb}.trend.up{color:#16a34a}.trend.flat{color:#64748b}.sparkline{height:34px;margin-top:12px;display:flex;align-items:end;gap:3px}.sparkline i{flex:1;border-radius:6px 6px 0 0;background:linear-gradient(180deg,rgba(15,118,110,.55),rgba(15,118,110,.12))}.segmented-tabs,.segmented-control{display:inline-flex;width:max-content;max-width:100%;padding:5px;border:1px solid var(--line);border-radius:16px;background:#fff;box-shadow:0 8px 20px rgba(15,23,42,.04)}.segmented-tabs button,.segmented-control button{border:0;background:transparent;border-radius:12px;padding:10px 14px;color:var(--muted);font-weight:900}.segmented-tabs button.active,.segmented-control button.active{background:#e9f7f2;color:var(--green);box-shadow:inset 0 0 0 1px rgba(15,118,110,.12)}.plans-layout,.settings-grid,.roles-layout,.audit-layout,.analytics-panel{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(360px,.8fr);gap:18px}.pricing-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.plan-card,.builder-panel,.table-card,.chart-card,.timeline-card,.permission-board{border:1px solid var(--line);border-radius:24px;background:rgba(255,255,255,.96);box-shadow:0 18px 44px rgba(15,23,42,.065)}.plan-card{padding:18px;display:grid;gap:16px}.plan-card.inactive{opacity:.72}.plan-top{display:flex;justify-content:space-between;gap:12px}.plan-card h2,.panel-head h2,.section-head h2,.chart-card h2,.timeline-card h2,.drawer h2{margin:8px 0 4px;font-size:20px;letter-spacing:-.01em}.plan-card p,.panel-head p,.section-head p{margin:0;color:var(--muted);font-size:13px}.price-row strong{font-size:32px}.price-row span{color:var(--muted)}.usage-bars{display:grid;gap:10px}.usage-bars div{display:grid;grid-template-columns:1fr auto;gap:6px}.usage-bars i,.dist-row i{grid-column:1/-1;height:8px;border-radius:999px;background:#edf3f0;overflow:hidden}.usage-bars em,.dist-row em{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--green),#38bdf8)}.module-chip-list{display:flex;flex-wrap:wrap;gap:6px}.module-chip,.status-pill,.step-badge{display:inline-flex;align-items:center;width:max-content;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900}.module-chip{background:#f1f5f9;color:#475569}.status-pill{background:#eef2f7;color:#475569}.status-pill.success,.success{background:#dcfce7;color:#166534}.status-pill.warning,.warning{background:#fef3c7;color:#92400e}.status-pill.danger,.critical{background:#fee2e2;color:#991b1b}.status-pill.info,.info{background:#dbeafe;color:#1d4ed8}.status-pill.neutral,.neutral{background:#f1f5f9;color:#475569}.step-badge{background:#e9f7f2;color:var(--green)}.plan-card footer{display:flex;justify-content:space-between;border-top:1px solid var(--line);padding-top:12px;color:var(--muted)}.plan-card footer strong{color:var(--ink)}.builder-panel{padding:20px;display:grid;gap:16px;align-content:start}.wizard-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.wizard-steps span{height:34px;border-radius:12px;background:#f1f5f9;display:grid;place-items:center;font-size:12px;font-weight:900;color:var(--muted)}.wizard-steps .active{background:#e9f7f2;color:var(--green)}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.form-grid label,.brand-row label{display:grid;gap:6px;color:var(--muted);font-size:11px;font-weight:900}.field{width:100%;min-height:42px;border:1px solid var(--line);border-radius:13px;background:#fff;padding:9px 12px;color:var(--ink);outline:none}.field:focus{border-color:var(--green);box-shadow:0 0 0 4px rgba(15,118,110,.12)}.field.color{padding:4px}.module-card-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.module-card,.permission-tile{border:1px solid var(--line);border-radius:18px;background:#fff;padding:13px;text-align:start;display:grid;gap:6px;color:var(--ink);transition:.18s ease}.module-card:hover,.permission-tile:hover{transform:translateY(-1px);box-shadow:0 12px 26px rgba(15,23,42,.08)}.module-card.selected,.permission-tile.selected{border-color:rgba(15,118,110,.45);background:#effaf6}.module-card .material-symbols-rounded{color:var(--green)}.module-card small,.permission-tile span{color:var(--muted);font-size:12px}.table-card,.chart-card,.timeline-card,.permission-board{padding:18px;overflow:hidden}.section-head{justify-content:space-between;margin-bottom:14px}.subscription-editor,.audit-filters{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:14px}.enterprise-table{width:100%;border-collapse:separate;border-spacing:0}.enterprise-table th{position:sticky;top:0;background:#f7faf9;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em}.enterprise-table th,.enterprise-table td{padding:12px 14px;border-bottom:1px solid var(--line);text-align:start;vertical-align:middle}.enterprise-table td small{display:block;color:var(--muted)}.enterprise-table tbody tr:hover{background:#f8fbfa}.enterprise-table tbody tr.selected{background:#eefaf6}.analytics-grid{display:grid;grid-template-columns:1.4fr .8fr .8fr;gap:18px}.chart-card.wide{grid-row:span 2}.line-chart,.area-chart,.bar-chart{height:230px;display:flex;align-items:end;gap:8px;padding:16px;border-radius:18px;background:linear-gradient(180deg,#f8fbfa,#f1f7f4)}.line-chart span,.area-chart span,.bar-chart span{flex:1;min-height:12px;border-radius:10px 10px 4px 4px;background:linear-gradient(180deg,var(--green),#7dd3fc);position:relative}.bar-chart span b{position:absolute;bottom:-24px;inset-inline:0;text-align:center;font-size:10px;color:var(--muted)}.donut{--a:180deg;--b:230deg;width:190px;aspect-ratio:1;margin:20px auto;border-radius:50%;background:conic-gradient(#0f766e 0 var(--a),#f59e0b var(--a) var(--b),#ef4444 var(--b) 360deg);position:relative}.donut:after{content:'';position:absolute;inset:32px;border-radius:50%;background:#fff}.legend,.distribution{display:grid;gap:10px}.legend span,.dist-row,.health-card{display:flex;align-items:center;gap:10px;justify-content:space-between}.legend i{width:10px;height:10px;border-radius:50%;display:inline-block}.success-dot{background:#0f766e}.warn-dot{background:#f59e0b}.danger-dot{background:#ef4444}.dist-row{display:grid;grid-template-columns:90px 1fr 32px}.heatmap{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.heatmap span{height:24px;border-radius:7px;background:#0f766e}.health-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}.health-card{justify-content:flex-start;border:1px solid var(--line);border-radius:18px;background:#fff;padding:13px}.health-card .material-symbols-rounded{color:var(--green)}.health-card div{flex:1;display:grid}.health-card small{color:var(--muted)}.health-card i{width:10px;height:10px;border-radius:50%;background:#16a34a}.health-card i.warning{background:#f59e0b}.audit-layout{grid-template-columns:minmax(0,1fr) 340px}.audit-filters{grid-template-columns:repeat(7,minmax(0,1fr))}.export-actions button{border:1px solid var(--line);background:#fff;border-radius:10px;padding:8px 10px;font-weight:800}.avatar{width:28px;height:28px;border-radius:50%;display:inline-grid;place-items:center;background:#e9f7f2;color:var(--green);font-weight:900;margin-inline-end:8px}.timeline-card{display:grid;gap:12px;align-content:start}.timeline-item{display:flex;gap:10px;padding:10px;border-radius:14px}.timeline-item:hover{background:#f8fbfa}.timeline-item>span{width:10px;height:10px;border-radius:50%;margin-top:6px;background:#2563eb}.timeline-item>span.success{background:#16a34a}.timeline-item>span.warning{background:#f59e0b}.timeline-item>span.critical{background:#ef4444}.timeline-item div{display:grid}.timeline-item small{color:var(--muted)}.drawer{position:fixed;z-index:40;inset-block:24px;inset-inline-end:24px;width:min(460px,calc(100vw - 48px));border:1px solid var(--line);border-radius:26px;background:#fff;padding:22px;box-shadow:0 28px 80px rgba(15,23,42,.22)}.drawer .close{position:absolute;inset-block-start:16px;inset-inline-end:16px}.drawer dl{display:grid;gap:14px}.drawer div{display:grid;gap:4px}.drawer dt{font-size:11px;font-weight:900;color:var(--muted)}.drawer dd{margin:0}.permission-board{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.toast{display:flex;align-items:center;gap:8px;padding:12px 14px;border-radius:16px;font-weight:800}.toast.success{background:#dcfce7;color:#166534}.toast.danger{background:#fee2e2;color:#991b1b}.spin{animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}[dir='rtl'] .hero h1,[dir='rtl'] .enterprise-table th{text-transform:none;letter-spacing:0}@media(max-width:1300px){.metric-grid.executive{grid-template-columns:repeat(3,minmax(0,1fr))}.plans-layout,.settings-grid,.roles-layout,.audit-layout,.analytics-panel{grid-template-columns:1fr}.pricing-grid,.analytics-grid,.health-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.permission-board{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:760px){.admin-shell{padding:16px}.hero,.hero-actions{display:grid}.metric-grid,.metric-grid.executive,.pricing-grid,.analytics-grid,.health-grid,.module-card-grid,.form-grid,.subscription-editor,.audit-filters,.permission-board{grid-template-columns:1fr}.segmented-tabs{width:100%;overflow:auto}.enterprise-table{min-width:760px}.table-card{overflow:auto}.drawer{inset:12px;width:auto}.brand-row{display:grid}}
  `,
  `
    .context-action-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;border:1px solid var(--line);border-radius:20px;background:rgba(255,255,255,.86);box-shadow:0 12px 30px rgba(15,23,42,.055)}
    .context-action-bar>div:first-child{display:grid;gap:2px}
    .context-action-bar span{color:var(--muted);font-size:11px;font-weight:900}
    .context-action-bar strong{font-size:14px}
    @media(max-width:760px){.context-action-bar{display:grid}.context-action-bar .hero-actions{justify-content:start}}
  `]
})
export class SystemAdminV1Component implements OnInit {
  mode: Mode = 'analytics';
  modules = MODULES;
  loading = false;
  saving = false;
  success = '';
  error = '';
  plansTab: 'plans' | 'subscriptions' | 'billing' | 'usage' = 'plans';

  companies: any[] = [];
  roles: any[] = [];
  permissions: any[] = [];
  rolePermissions: any[] = [];
  plans: any[] = [];
  subscriptions: any[] = [];
  selectedRoleId: number | null = null;
  selectedPermissionIds = new Set<number>();
  selectedDataScope = 'company';
  selectedCompanyId: number | null = null;

  settingsForm: any = { maxUsers: 10, maxEmployees: 50, timezone: 'Asia/Amman', currency: 'JOD', locale: 'ar-JO' };
  moduleForm: Record<string, boolean> = {};
  brandingForm: any = { logoUrl: '', primaryColor: '#0f766e', secondaryColor: '#1d4ed8', accentColor: '#f59e0b' };

  planForm: any = { code: '', nameAr: '', nameEn: '', price: 0, billingCycle: 'monthly', maxUsers: 10, maxEmployees: 50, trialDays: 0, isActive: true };
  planModules = new Set<string>(MODULES);
  subscriptionForm: any = { companyId: null, planCode: 'pro', status: 'active', startsAt: '', endsAt: '' };

  analyticsSummary: any = {};
  companiesGrowth: any[] = [];
  usersGrowth: any[] = [];
  subscriptionAnalytics: any = {};
  systemHealth: any = {};

  auditRows: any[] = [];
  auditFilters: any = {};
  auditPage = 1;
  auditPageSize = 50;
  auditTotal = 0;
  selectedAudit: any = null;

  constructor(private http: HttpClient, private route: ActivatedRoute, public i18n: I18nService, private cdr: ChangeDetectorRef) {}

  get title() {
    return {
      roles: this.t('إدارة الأدوار والصلاحيات', 'Role & Permission Management'),
      settings: this.t('إعدادات الشركات المتقدمة', 'Company Deep Settings'),
      plans: this.t('إدارة الاشتراكات والخطط', 'Subscription & Plans Management'),
      analytics: this.t('تحليلات المنصة', 'System-wide Analytics'),
      audit: this.t('سجلات التدقيق', 'Audit Logs'),
    }[this.mode];
  }

  get subtitle() {
    return this.t(
      'مركز تحكم مؤسسي لإدارة المستأجرين والاشتراكات والتحليلات والثقة التشغيلية.',
      'A premium SaaS control center for tenant governance, billing, analytics, and platform trust.'
    );
  }

  t(ar: string, en: string) {
    return this.i18n.currentLang === 'ar' ? ar : en;
  }

  get summaryCards() {
    const s = this.analyticsSummary || {};
    return [
      { label: 'Employees', value: s.total_employees ?? 0 },
      { label: 'Users', value: s.total_users ?? 0 },
      { label: 'Companies', value: s.total_companies ?? 0 },
      { label: 'Active subscriptions', value: s.active_companies ?? 0 },
      { label: 'Revenue', value: this.money(this.totalMrr()) },
      { label: 'Trial accounts', value: s.trial_companies ?? 0 },
      { label: 'Conversion', value: `${this.conversionRate()}%` },
    ];
  }

  get auditPageCount() {
    return Math.max(1, Math.ceil(this.auditTotal / this.auditPageSize));
  }

  ngOnInit() {
    this.route.data.subscribe(d => {
      this.mode = (d['mode'] || 'analytics') as Mode;
      this.loadAll();
      this.cdr.markForCheck();
    });
  }

  loadAll() {
    this.clearMessages();
    if (this.mode === 'roles') this.loadRoles();
    if (this.mode === 'settings') this.loadCompanies();
    if (this.mode === 'plans') { this.loadCompanies(); this.loadPlans(); this.loadSubscriptions(); }
    if (this.mode === 'analytics') { this.loadAnalytics(); this.loadPlans(); this.loadSubscriptions(); }
    if (this.mode === 'audit') this.loadAudit();
  }

  moduleLabel(key: string) {
    return MODULE_LABELS[key] ?? { title: key, group: 'Platform', icon: 'extension', description: key };
  }

  normalizeModules(value: any): string[] {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : MODULES;
      } catch {
        return value.split(',').map(x => x.trim()).filter(Boolean);
      }
    }
    return MODULES;
  }

  money(value: any) {
    const n = Number(value || 0);
    return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} JOD`;
  }

  barPercent(value: any, max: any) {
    const v = Number(value || 0);
    const m = Math.max(1, Number(max || 1));
    return Math.max(8, Math.min(100, (v / m) * 100));
  }

  totalMrr() {
    return this.plans.reduce((sum, p) => sum + this.planMrr(p), 0);
  }

  planMrr(plan: any) {
    const count = this.subscriberCount(plan.code);
    const price = Number(plan.price || 0);
    return count * (String(plan.billing_cycle).includes('annual') ? price / 12 : price);
  }

  maxPlanMrr() {
    return Math.max(1, ...this.plans.map(p => this.planMrr(p)));
  }

  subscriberCount(code: string) {
    return this.subscriptions.filter(s => s.plan_code === code || s.planCode === code || s.plan_name === code).length;
  }

  activeSubscriptionCount() {
    return this.subscriptions.filter(s => s.status === 'active').length;
  }

  trialSubscriptionCount() {
    return this.subscriptions.filter(s => s.status === 'trial').length;
  }

  activePlanCount() {
    return this.plans.filter(p => p.is_active).length;
  }

  conversionRate() {
    const active = this.activeSubscriptionCount();
    const trial = this.trialSubscriptionCount();
    return Math.round((active / Math.max(1, active + trial)) * 100);
  }

  donutDegree(status: 'active' | 'trial') {
    const total = Math.max(1, this.subscriptions.length);
    const active = this.activeSubscriptionCount();
    const trial = this.trialSubscriptionCount();
    return `${Math.round(((status === 'active' ? active : active + trial) / total) * 360)}deg`;
  }

  maxSeries(rows: any[]) {
    return Math.max(1, ...rows.map(x => Number(x.count || x.total || 1)));
  }

  planDistribution() {
    const total = Math.max(1, this.subscriptions.length);
    return this.plans.map(p => {
      const count = this.subscriberCount(p.code);
      return { label: p.name_en || p.code, count, percent: (count / total) * 100 };
    }).filter(x => x.count > 0);
  }

  spark(i: number) {
    const seed = [22, 46, 34, 66, 48, 78, 62, 90];
    return seed.map(n => Math.max(12, ((n + i * 11) % 92)));
  }

  heatmapCells() {
    return Array.from({ length: 35 }, (_, i) => String(0.18 + ((i * 17) % 75) / 100));
  }

  healthItems() {
    const h = this.systemHealth || {};
    return [
      { label: 'API Health', detail: h.api || 'Operational', icon: 'api', tone: 'success' },
      { label: 'Database', detail: h.database || 'Connected', icon: 'database', tone: 'success' },
      { label: 'Queue', detail: h.queue || 'Dry-run workers', icon: 'route', tone: 'warning' },
      { label: 'Storage', detail: h.storage || 'Local provider', icon: 'hard_drive', tone: 'success' },
      { label: 'Jobs', detail: h.jobs || 'Monitoring', icon: 'sync', tone: 'success' },
      { label: 'Email', detail: h.email || 'Dry-run mode', icon: 'mark_email_read', tone: 'warning' },
    ];
  }

  statusTone(status: string) {
    if (status === 'active') return 'success';
    if (status === 'trial') return 'warning';
    if (status === 'expired' || status === 'suspended') return 'danger';
    return 'neutral';
  }

  auditSeverity(action: string) {
    const a = String(action || '');
    if (a.includes('delete') || a.includes('suspend') || a.includes('reject')) return 'critical';
    if (a.includes('update') || a.includes('patch')) return 'warning';
    if (a.includes('create') || a.includes('approve')) return 'success';
    return 'info';
  }

  auditTone(action: string) {
    return this.auditSeverity(action);
  }

  initials(name: string) {
    return String(name || 'S').split(/[.\s_-]+/).filter(Boolean).slice(0, 2).map(x => x[0]?.toUpperCase()).join('');
  }

  private get<T>(url: string, cb: (data: T) => void, params?: HttpParams) {
    this.loading = true;
    this.http.get<ApiResponse<T>>(url, { params }).pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); })).subscribe({
      next: r => { cb(r.data); this.cdr.markForCheck(); },
      error: e => { this.error = e?.error?.message || 'Failed to load data'; this.cdr.markForCheck(); }
    });
  }

  loadCompanies() {
    this.get<any[]>('/api/admin/companies', rows => {
      this.companies = rows;
      if (!this.selectedCompanyId && rows.length) {
        this.selectedCompanyId = rows[0].id;
        this.loadCompanySettings();
      }
    });
  }

  loadRoles() {
    this.loading = true;
    forkJoin({
      roles: this.http.get<ApiResponse<any[]>>('/api/admin/roles'),
      permissions: this.http.get<ApiResponse<any[]>>('/api/admin/permissions'),
      rolePermissions: this.http.get<ApiResponse<any[]>>('/api/admin/role-permissions'),
    }).pipe(finalize(() => this.loading = false)).subscribe({
      next: ({ roles, permissions, rolePermissions }) => {
        this.roles = roles.data ?? [];
        this.permissions = permissions.data ?? [];
        this.rolePermissions = rolePermissions.data ?? [];
        if (!this.selectedRoleId && this.roles.length) this.selectedRoleId = this.roles[0].id;
        this.syncSelectedPermissions();
      },
      error: e => this.error = e?.error?.message || 'Failed to load roles'
    });
  }

  syncSelectedPermissions() {
    this.selectedPermissionIds = new Set(this.rolePermissions.filter(rp => Number(rp.role_id) === Number(this.selectedRoleId)).map(rp => Number(rp.permission_id)));
  }

  togglePermission(id: number) {
    this.selectedPermissionIds.has(id) ? this.selectedPermissionIds.delete(id) : this.selectedPermissionIds.add(id);
  }

  saveRolePermissions() {
    this.save('/api/admin/role-permissions', {
      roleId: this.selectedRoleId,
      permissionIds: Array.from(this.selectedPermissionIds),
      dataScope: this.selectedDataScope,
    }, () => this.loadRoles(), 'Role permissions saved');
  }

  loadCompanySettings() {
    if (!this.selectedCompanyId) return;
    this.get<any>(`/api/admin/companies/${this.selectedCompanyId}/settings`, data => {
      const c = data.company || {};
      this.settingsForm = {
        maxUsers: c.max_users ?? c.maxUsers ?? 10,
        maxEmployees: c.max_employees ?? c.maxEmployees ?? 50,
        timezone: c.timezone ?? 'Asia/Amman',
        currency: c.currency ?? 'JOD',
        locale: c.locale ?? 'ar-JO',
      };
      this.moduleForm = {};
      for (const m of MODULES) this.moduleForm[m] = data.modules?.find((x: any) => x.module_key === m)?.is_enabled ?? true;
      const b = data.branding || {};
      this.brandingForm = {
        logoUrl: b.logo_url ?? c.logo ?? '',
        primaryColor: b.primary_color ?? '#0f766e',
        secondaryColor: b.secondary_color ?? '#1d4ed8',
        accentColor: b.accent_color ?? '#f59e0b',
      };
    });
  }

  saveCompanySettings() {
    this.save(`/api/admin/companies/${this.selectedCompanyId}/settings`, this.settingsForm, () => this.loadCompanySettings(), 'Company settings saved');
  }

  saveModules() {
    this.save(`/api/admin/companies/${this.selectedCompanyId}/modules`, { modules: this.moduleForm }, () => this.loadCompanySettings(), 'Modules saved');
  }

  saveBranding() {
    this.save(`/api/admin/companies/${this.selectedCompanyId}/branding`, this.brandingForm, () => this.loadCompanySettings(), 'Branding saved');
  }

  loadPlans() {
    this.get<any[]>('/api/admin/plans', rows => this.plans = rows);
  }

  loadSubscriptions() {
    this.get<any[]>('/api/admin/subscriptions', rows => this.subscriptions = rows);
  }

  editPlan(p: any) {
    this.planForm = {
      id: p.id, code: p.code, nameAr: p.name_ar, nameEn: p.name_en, price: Number(p.price),
      billingCycle: p.billing_cycle, maxUsers: p.max_users, maxEmployees: p.max_employees,
      trialDays: p.trial_days, isActive: p.is_active,
    };
    this.planModules = new Set(this.normalizeModules(p.enabled_modules));
  }

  togglePlanModule(m: string) {
    this.planModules.has(m) ? this.planModules.delete(m) : this.planModules.add(m);
  }

  savePlan() {
    const body = { ...this.planForm, enabledModules: Array.from(this.planModules) };
    const url = this.planForm.id ? `/api/admin/plans/${this.planForm.id}` : '/api/admin/plans';
    const request = this.planForm.id ? this.http.patch<ApiResponse<any>>(url, body) : this.http.post<ApiResponse<any>>(url, body);
    this.saving = true;
    request.pipe(finalize(() => this.saving = false)).subscribe({
      next: () => {
        this.success = 'Plan saved';
        this.planForm = { code: '', nameAr: '', nameEn: '', price: 0, billingCycle: 'monthly', maxUsers: 10, maxEmployees: 50, trialDays: 0, isActive: true };
        this.planModules = new Set(MODULES);
        this.loadPlans();
      },
      error: e => this.error = e?.error?.message || 'Failed to save plan',
    });
  }

  saveSubscription() {
    this.save(`/api/admin/companies/${this.subscriptionForm.companyId}/subscription`, this.subscriptionForm, () => this.loadSubscriptions(), 'Subscription saved');
  }

  loadAnalytics() {
    this.loading = true;
    forkJoin({
      summary: this.http.get<ApiResponse<any>>('/api/admin/analytics/summary'),
      companiesGrowth: this.http.get<ApiResponse<any[]>>('/api/admin/analytics/companies-growth'),
      usersGrowth: this.http.get<ApiResponse<any[]>>('/api/admin/analytics/users-growth'),
      subscriptions: this.http.get<ApiResponse<any>>('/api/admin/analytics/subscriptions'),
      health: this.http.get<ApiResponse<any>>('/api/admin/analytics/system-health'),
    }).pipe(finalize(() => this.loading = false)).subscribe({
      next: ({ summary, companiesGrowth, usersGrowth, subscriptions, health }) => {
        this.analyticsSummary = summary.data ?? {};
        this.companiesGrowth = companiesGrowth.data ?? [];
        this.usersGrowth = usersGrowth.data ?? [];
        this.subscriptionAnalytics = subscriptions.data ?? {};
        this.systemHealth = health.data ?? {};
      },
      error: e => this.error = e?.error?.message || 'Failed to load analytics'
    });
  }

  loadAudit() {
    let params = new HttpParams().set('page', this.auditPage).set('pageSize', this.auditPageSize);
    for (const [k, v] of Object.entries(this.auditFilters)) if (v) params = params.set(k, String(v));
    this.get<any>('/api/admin/audit-logs', data => {
      this.auditRows = data.rows ?? [];
      this.auditTotal = data.total ?? this.auditRows.length;
      this.auditPage = data.page ?? this.auditPage;
      this.auditPageSize = data.pageSize ?? this.auditPageSize;
    }, params);
  }

  changeAuditPage(delta: number) {
    this.auditPage = Math.min(this.auditPageCount, Math.max(1, this.auditPage + delta));
    this.loadAudit();
  }

  openAudit(row: any) {
    this.get<any>(`/api/admin/audit-logs/${row.id}`, data => this.selectedAudit = data);
  }

  private save(url: string, body: any, after: () => void, message: string) {
    this.clearMessages();
    this.saving = true;
    this.http.patch<ApiResponse<any>>(url, body).pipe(finalize(() => this.saving = false)).subscribe({
      next: () => { this.success = message; after(); },
      error: e => this.error = e?.error?.message || 'Save failed',
    });
  }

  private clearMessages() {
    this.success = '';
    this.error = '';
  }
}
