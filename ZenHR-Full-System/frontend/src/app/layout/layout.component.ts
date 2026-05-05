import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef,
  HostListener, OnDestroy, OnInit, computed, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../core/services/auth.service';
import { I18nService } from '../core/services/i18n.service';
import { NavGroup, NavItem, RoleAccessService } from '../core/services/role-access.service';
import { ApiResponse, User } from '../core/models';
import { AppSettingsService } from '../core/services/app-settings.service';
import { TenantContextService } from '../core/services/tenant-context.service';
import { ToastContainerComponent } from '../shared/components/toast-container/toast-container.component';

export interface DbNotification {
  id: number;
  notificationType: string;
  titleAr: string;
  titleEn: string;
  messageAr: string;
  messageEn: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'unread' | 'read';
  actionUrl?: string | null;
  createdAt: string;
  readAt?: string | null;
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, TranslateModule, ToastContainerComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LayoutComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elRef = inject(ElementRef);

  user = signal<User | null>(null);
  isMobileView = signal(typeof window !== 'undefined' ? window.innerWidth <= 900 : false);
  mobileNavOpen = signal(false);
  activeGroupKey = signal<string | null>(null);
  dropdownX = signal(0);
  dropdownY = signal(0);
  endingImpersonation = signal(false);
  currentPage = signal<NavItem | null>(null);
  today = signal(new Date());
  notifications = signal<DbNotification[]>([]);
  notificationsOpen = signal(false);
  notificationsLoading = signal(false);
  unreadCount = signal(0);
  markingAllRead = signal(false);
  avatarLoadFailed = signal(false);

  navGroups: NavGroup[] = [];

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private _dropdownCloseTimer: ReturnType<typeof setTimeout> | null = null;

  readonly notificationCount = computed(() => this.unreadCount());

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
    this.loadUnreadCount();

    // Guarantee drawer is closed on initial load regardless of screen size
    this.mobileNavOpen.set(false);
    this.isMobileView.set(typeof window !== 'undefined' ? window.innerWidth <= 900 : false);

    const role = this.user()?.role ?? '';
    if (role !== 'superadmin') {
      this.tenant.load();
    }
    this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(() => {
      this.syncPageMeta();
      this.notificationsOpen.set(false);
      this.mobileNavOpen.set(false);
      this.activeGroupKey.set(null);
    });
    this.pollTimer = setInterval(() => this.loadUnreadCount(), 60_000);
  }

  ngOnDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this._dropdownCloseTimer) clearTimeout(this._dropdownCloseTimer);
  }

  @HostListener('window:resize')
  onResize() {
    const mobile = window.innerWidth <= 900;
    this.isMobileView.set(mobile);
    if (!mobile) {
      this.mobileNavOpen.set(false);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent) {
    const host = this.elRef.nativeElement as HTMLElement;
    const target = e.target as Node;
    const inNavBar = host.querySelector('.top-nav')?.contains(target);
    if (!inNavBar) {
      this.activeGroupKey.set(null);
    }
  }

  openGroup(key: string, event?: MouseEvent) {
    if (this._dropdownCloseTimer) clearTimeout(this._dropdownCloseTimer);
    if (event) {
      const wrap = event.currentTarget as HTMLElement;
      const rect = wrap.getBoundingClientRect();
      if (this.i18n.isRTL()) {
        this.dropdownX.set(window.innerWidth - rect.right);
      } else {
        this.dropdownX.set(rect.left);
      }
      this.dropdownY.set(rect.bottom);
    }
    this.activeGroupKey.set(key);
  }

  toggleGroup(key: string, event: MouseEvent) {
    event.stopPropagation();
    if (this.activeGroupKey() === key) {
      this.activeGroupKey.set(null);
    } else {
      this.openGroup(key, event);
    }
  }

  scheduleCloseGroup() {
    this._dropdownCloseTimer = setTimeout(() => {
      this.activeGroupKey.set(null);
    }, 120);
  }

  cancelCloseGroup() {
    if (this._dropdownCloseTimer) clearTimeout(this._dropdownCloseTimer);
  }

  toggleMobileNav() {
    this.mobileNavOpen.update(open => !open);
  }

  toggleLang() {
    const next = this.i18n.currentLang === 'ar' ? 'en' : 'ar';
    this.setLang(next);
  }

  setLang(lang: 'ar' | 'en') {
    if (lang === this.i18n.currentLang) return;
    this.i18n.setLanguage(lang);
    this.avatarLoadFailed.set(false);
  }

  logout() {
    this.auth.logout();
  }

  toggleNotifications() {
    const wasOpen = this.notificationsOpen();
    this.notificationsOpen.update(open => !open);
    if (!wasOpen) {
      this.loadNotifications();
    }
  }

  endImpersonation() {
    this.endingImpersonation.set(true);
    this.http.post('/api/admin/impersonate/end', {}).subscribe({
      next: () => { this.endingImpersonation.set(false); this.auth.endImpersonation(); },
      error: () => { this.endingImpersonation.set(false); this.auth.endImpersonation(); }
    });
  }

  markRead(notif: DbNotification) {
    if (notif.status === 'read') return;
    this.http.patch(`/api/notifications/${notif.id}/read`, {}).subscribe({
      next: () => {
        this.notifications.update(list =>
          list.map(n => n.id === notif.id ? { ...n, status: 'read' as const } : n)
        );
        this.unreadCount.update(c => Math.max(0, c - 1));
      }
    });
  }

  markAllRead() {
    if (this.markingAllRead()) return;
    this.markingAllRead.set(true);
    this.http.patch('/api/notifications/read-all', {}).subscribe({
      next: () => {
        this.notifications.update(list => list.map(n => ({ ...n, status: 'read' as const })));
        this.unreadCount.set(0);
        this.markingAllRead.set(false);
      },
      error: () => this.markingAllRead.set(false)
    });
  }

  openNotifAction(notif: DbNotification) {
    this.markRead(notif);
    if (notif.actionUrl) {
      this.router.navigateByUrl(notif.actionUrl);
    }
    this.notificationsOpen.set(false);
  }

  getInitials() {
    const source = this.userDisplayName || this.user()?.username || 'U';
    return source.split(' ').filter(Boolean).slice(0, 2).map(p => p.charAt(0).toUpperCase()).join('');
  }

  onAvatarError() {
    this.avatarLoadFailed.set(true);
  }

  isActiveGroup(group: NavGroup): boolean {
    const url = this.router.url;
    return group.items.some(item => url.startsWith(item.path));
  }

  notifIcon(type: string): string {
    if (type.startsWith('leave')) return 'event_note';
    if (type.startsWith('overtime')) return 'more_time';
    if (type.startsWith('employee_action')) return 'manage_accounts';
    if (type.startsWith('workflow')) return 'account_tree';
    return 'notifications';
  }

  notifIconColor(type: string): string {
    if (type.includes('approved')) return 'emerald';
    if (type.includes('rejected')) return 'red';
    return 'blue';
  }

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const lang = this.i18n.currentLang;
    if (mins < 1) return lang === 'ar' ? 'الآن' : 'Just now';
    if (mins < 60) return lang === 'ar' ? `منذ ${mins} د` : `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return lang === 'ar' ? `منذ ${hrs} س` : `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return lang === 'ar' ? `منذ ${days} ي` : `${days}d ago`;
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
    if (!current?.employee) return current?.username ?? '';
    return this.i18n.currentLang === 'ar'
      ? (current.employee.fullNameAr || current.username)
      : (current.employee.fullNameEn || current.username);
  }

  get appTagline() { return this.i18n.instant('app.tagline'); }

  get currentLanguageLabel() { return this.languageLabel(this.i18n.currentLang); }
  get pageEyebrow() { return this.pageGroupTitle; }
  get pageSubtitle() { return this.roleName || this.appTagline; }

  get tenantScopeLabel(): string {
    const role = this.user()?.role ?? '';
    const lang = this.i18n.currentLang;
    if (role === 'superadmin') return lang === 'ar' ? 'مدير المنصة' : 'Platform Admin';
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
      weekday: 'long', day: 'numeric'
    }).format(this.today());
  }

  get todayMonthLabel() {
    return new Intl.DateTimeFormat(this.i18n.currentLang === 'ar' ? 'ar-JO-u-nu-latn' : 'en-US', {
      month: 'long', year: 'numeric'
    }).format(this.today());
  }

  label(ar: string, en: string) {
    return this.i18n.currentLang === 'ar' ? ar : en;
  }

  languageLabel(lang: 'ar' | 'en') {
    return lang === 'ar' ? this.i18n.instant('shell.languageArabic') : this.i18n.instant('shell.languageEnglish');
  }

  private syncPageMeta() {
    const url = this.router.url;
    const page = this.navGroups.flatMap(g => g.items).find(item => url.startsWith(item.path));
    this.currentPage.set(page ?? null);
  }

  private loadUnreadCount() {
    this.http.get<ApiResponse<{ count: number }>>('/api/notifications/unread-count').subscribe({
      next: res => this.unreadCount.set(res.data?.count ?? 0),
      error: () => {}
    });
  }

  private loadNotifications() {
    this.notificationsLoading.set(true);
    this.http.get<ApiResponse<DbNotification[]>>('/api/notifications?limit=15').subscribe({
      next: res => {
        this.notifications.set(res.data ?? []);
        const unread = (res.data ?? []).filter(n => n.status === 'unread').length;
        this.unreadCount.set(unread);
        this.notificationsLoading.set(false);
      },
      error: () => {
        this.notifications.set([]);
        this.notificationsLoading.set(false);
      }
    });
  }
}
