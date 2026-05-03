import { ChangeDetectionStrategy, Component, HostListener, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../core/services/auth.service';
import { I18nService } from '../core/services/i18n.service';
import { NavGroup, NavItem, RoleAccessService } from '../core/services/role-access.service';
import { ApiResponse, DashboardSummary, User } from '../core/models';
import { AppSettingsService } from '../core/services/app-settings.service';
import { TenantContextService } from '../core/services/tenant-context.service';
import { ToastContainerComponent } from '../shared/components/toast-container/toast-container.component';

type LayoutNotification = {
  id: string;
  titleAr: string;
  titleEn: string;
  metaAr: string;
  metaEn: string;
  icon: string;
};

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, TranslateModule, ToastContainerComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LayoutComponent implements OnInit {
  user = signal<User | null>(null);
  isMobileView = signal(typeof window !== 'undefined' ? window.innerWidth <= 980 : false);
  sidebarOpen = signal(typeof window !== 'undefined' ? window.innerWidth > 980 : true);
  endingImpersonation = signal(false);
  currentPage = signal<NavItem | null>(null);
  today = signal(new Date());
  notifications = signal<LayoutNotification[]>([]);
  notificationsOpen = signal(false);
  notificationsLoading = signal(false);
  avatarLoadFailed = signal(false);

  navGroups: NavGroup[] = [];

  readonly notificationCount = computed(() => this.notifications().length);

  constructor(
    public auth: AuthService,
    public access: RoleAccessService,
    public i18n: I18nService,
    public tenant: TenantContextService,
    private router: Router,
    private http: HttpClient,
    private settings: AppSettingsService
  ) {}

  ngOnInit() {
    this.user.set(this.auth.currentUser());
    this.navGroups = this.access.getNavGroups();
    this.syncPageMeta();
    this.loadNotifications();
    const role = this.user()?.role ?? '';
    if (role !== 'superadmin') {
      this.tenant.load();
    }
    this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(() => {
      this.syncPageMeta();
      this.notificationsOpen.set(false);
    });
  }

  @HostListener('window:resize')
  onResize() {
    const mobile = window.innerWidth <= 980;
    this.isMobileView.set(mobile);
    if (!mobile && !this.sidebarOpen()) {
      this.sidebarOpen.set(true);
    }
  }

  toggleSidebar() {
    this.sidebarOpen.update(open => !open);
  }

  toggleLang() {
    const next = this.i18n.currentLang === 'ar' ? 'en' : 'ar';
    this.setLang(next);
  }

  setLang(lang: 'ar' | 'en') {
    if (lang === this.i18n.currentLang) {
      return;
    }

    this.i18n.setLanguage(lang);
    this.avatarLoadFailed.set(false);
    this.loadNotifications();
  }

  logout() {
    this.auth.logout();
  }

  toggleNotifications() {
    this.notificationsOpen.update(open => !open);
  }

  endImpersonation() {
    this.endingImpersonation.set(true);
    this.http.post('/api/admin/impersonate/end', {}).subscribe({
      next: () => {
        this.endingImpersonation.set(false);
        this.auth.endImpersonation();
      },
      error: () => {
        this.endingImpersonation.set(false);
        this.auth.endImpersonation();
      }
    });
  }

  getInitials() {
    const source = this.userDisplayName || this.user()?.username || 'U';
    return source
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('');
  }

  onAvatarError() {
    this.avatarLoadFailed.set(true);
  }

  get pageTitle() {
    const page = this.currentPage();
    return page ? this.label(page.labelAr, page.labelEn) : this.i18n.instant('shell.dashboard');
  }

  get pageGroupTitle() {
    const page = this.currentPage();
    const group = this.navGroups.find(navGroup => navGroup.items.some(item => item.path === page?.path));
    return group ? this.label(group.labelAr, group.labelEn) : this.i18n.instant('shell.dashboard');
  }

  get roleName() {
    const role = this.user()?.role ?? '';
    return role ? this.i18n.instant(`roles.${role}`) : '';
  }

  get avatarUrl() {
    return this.user()?.employee?.profilePhoto || '';
  }

  get userDisplayName() {
    const current = this.user();
    if (!current?.employee) {
      return current?.username ?? '';
    }

    return this.i18n.currentLang === 'ar'
      ? (current.employee.fullNameAr || current.username)
      : (current.employee.fullNameEn || current.username);
  }

  get sidebarBadgeLabel() {
    return this.i18n.instant('app.tagline');
  }

  get sidebarToggleLabel() {
    return this.i18n.currentLang === 'ar'
      ? (this.sidebarOpen() ? 'تصغير القائمة' : 'توسيع القائمة')
      : (this.sidebarOpen() ? 'Collapse menu' : 'Expand menu');
  }

  get currentLanguageLabel() {
    return this.languageLabel(this.i18n.currentLang);
  }

  get nextLanguageLabel() {
    return this.languageLabel(this.i18n.currentLang === 'ar' ? 'en' : 'ar');
  }

  get pageEyebrow() {
    return this.pageGroupTitle;
  }

  get pageSubtitle() {
    return this.roleName || this.sidebarBadgeLabel;
  }

  get tenantScopeLabel(): string {
    const role = this.user()?.role ?? '';
    const lang = this.i18n.currentLang;
    if (role === 'superadmin') {
      return lang === 'ar' ? 'مدير المنصة' : 'Platform Admin';
    }
    const ctx = this.tenant.context();
    if (!ctx) return '';
    const parts: string[] = [];
    if (lang === 'ar') {
      if (ctx.companyNameAr) parts.push(ctx.companyNameAr);
      if ((role === 'manager' || role === 'employee') && ctx.branchNameAr) parts.push(ctx.branchNameAr);
      if ((role === 'manager' || role === 'employee') && ctx.deptNameAr) parts.push(ctx.deptNameAr);
    } else {
      if (ctx.companyNameEn) parts.push(ctx.companyNameEn);
      if ((role === 'manager' || role === 'employee') && ctx.branchNameEn) parts.push(ctx.branchNameEn);
      if ((role === 'manager' || role === 'employee') && ctx.deptNameEn) parts.push(ctx.deptNameEn);
    }
    return parts.join(' › ');
  }

  get todayDayLabel() {
    return new Intl.DateTimeFormat(this.i18n.currentLang === 'ar' ? 'ar-JO-u-nu-latn' : 'en-US', {
      weekday: 'long',
      day: 'numeric'
    }).format(this.today());
  }

  get todayMonthLabel() {
    return new Intl.DateTimeFormat(this.i18n.currentLang === 'ar' ? 'ar-JO-u-nu-latn' : 'en-US', {
      month: 'long',
      year: 'numeric'
    }).format(this.today());
  }

  label(ar: string, en: string) {
    return this.i18n.currentLang === 'ar' ? ar : en;
  }

  languageLabel(lang: 'ar' | 'en') {
    return lang === 'ar'
      ? this.i18n.instant('shell.languageArabic')
      : this.i18n.instant('shell.languageEnglish');
  }

  notificationLabel(item: LayoutNotification) {
    return this.label(item.titleAr, item.titleEn);
  }

  notificationMeta(item: LayoutNotification) {
    return this.label(item.metaAr, item.metaEn);
  }

  private syncPageMeta() {
    const url = this.router.url;
    const page = this.navGroups.flatMap(group => group.items).find(item => url.startsWith(item.path));
    this.currentPage.set(page ?? null);
  }

  private loadNotifications() {
    this.notificationsLoading.set(true);
    this.notificationsOpen.set(false);

    const role = this.user()?.role ?? '';
    if (['superadmin', 'hradmin', 'payrolladmin'].includes(role)) {
      this.http.get<ApiResponse<any[]>>('/api/dashboard/recent-activity').subscribe({
        next: response => {
          const feed = (response.data ?? []).slice(0, 6).map(item => ({
            id: `activity-${item.id}`,
            titleAr: item.descriptionAr || item.entityType || 'نشاط جديد',
            titleEn: item.descriptionEn || item.entityType || 'New activity',
            metaAr: this.formatDateTime(item.createdAt),
            metaEn: this.formatDateTime(item.createdAt),
            icon: 'notifications'
          }));

          if (feed.length) {
            this.notifications.set(feed);
            this.notificationsLoading.set(false);
            return;
          }

          this.loadSummaryNotifications();
        },
        error: () => this.loadSummaryNotifications()
      });
      return;
    }

    this.loadSummaryNotifications();
  }

  private loadSummaryNotifications() {
    this.http.get<ApiResponse<DashboardSummary>>('/api/dashboard/summary').subscribe({
      next: response => {
        this.notifications.set(this.buildSummaryNotifications(response.data));
        this.notificationsLoading.set(false);
      },
      error: () => {
        this.notifications.set([]);
        this.notificationsLoading.set(false);
      }
    });
  }

  private buildSummaryNotifications(summary?: DashboardSummary | null): LayoutNotification[] {
    if (!summary) {
      return [];
    }

    const items: LayoutNotification[] = [];

    if (this.settings.boolValue('notify_leave_requests', true) && summary.pendingLeaves > 0) {
      items.push({
        id: 'pending-leaves',
        titleAr: `طلبات الإجازة المعلقة: ${summary.pendingLeaves}`,
        titleEn: `Pending leave requests: ${summary.pendingLeaves}`,
        metaAr: 'تحتاج إلى متابعة',
        metaEn: 'Needs attention',
        icon: 'event_note'
      });
    }

    if (this.settings.boolValue('notify_overtime_requests', true) && summary.pendingOvertimes > 0) {
      items.push({
        id: 'pending-overtime',
        titleAr: `طلبات العمل الإضافي المعلقة: ${summary.pendingOvertimes}`,
        titleEn: `Pending overtime requests: ${summary.pendingOvertimes}`,
        metaAr: 'تنتظر الإجراء',
        metaEn: 'Awaiting action',
        icon: 'more_time'
      });
    }

    if (this.settings.boolValue('notify_advance_requests', true) && summary.pendingAdvances > 0) {
      items.push({
        id: 'pending-advances',
        titleAr: `طلبات السلف المعلقة: ${summary.pendingAdvances}`,
        titleEn: `Pending advances: ${summary.pendingAdvances}`,
        metaAr: 'تحتاج إلى مراجعة مالية',
        metaEn: 'Needs finance review',
        icon: 'payments'
      });
    }

    const complianceCount = (summary.sscNotEnrolled || 0) + (summary.wpExpiringSoon || 0) + (summary.healthExpiringSoon || 0);
    if (this.settings.boolValue('notify_expiring_documents', true) && complianceCount > 0) {
      items.push({
        id: 'compliance-alerts',
        titleAr: `تنبيهات الامتثال: ${complianceCount}`,
        titleEn: `Compliance alerts: ${complianceCount}`,
        metaAr: 'تحتاج إلى متابعة مباشرة',
        metaEn: 'Needs direct follow-up',
        icon: 'verified_user'
      });
    }

    return items.slice(0, 6);
  }

  private formatDateTime(value?: string) {
    if (!value) {
      return this.label('الآن', 'Now');
    }

    return new Intl.DateTimeFormat(this.i18n.currentLang === 'ar' ? 'ar-JO-u-nu-latn' : 'en-US', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  }
}
