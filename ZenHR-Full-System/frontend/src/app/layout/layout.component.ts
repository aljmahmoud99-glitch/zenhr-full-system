import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef,
  HostListener, OnDestroy, OnInit, computed, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, filter, finalize, forkJoin, map, of, Subject, switchMap } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../core/services/auth.service';
import { I18nService } from '../core/services/i18n.service';
import { NavGroup, NavItem, RoleAccessService } from '../core/services/role-access.service';
import { ApiResponse, User } from '../core/models';
import { AppSettingsService } from '../core/services/app-settings.service';
import { TenantContextService } from '../core/services/tenant-context.service';
import { ThemeService } from '../core/services/theme.service';
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

interface GlobalSearchResult {
  id?: number | string;
  type: string;
  title?: string;
  subtitle?: string;
  titleAr?: string;
  titleEn?: string;
  subtitleAr?: string;
  subtitleEn?: string;
  icon: string;
  url?: string;
  route?: string;
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
  searchQuery = signal('');
  searchOpen = signal(false);
  searchLoading = signal(false);
  searchResults = signal<GlobalSearchResult[]>([]);
  selectedSearchIndex = signal(0);
  recentSearches = signal<string[]>([]);

  navGroups: NavGroup[] = [];

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private _dropdownCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly searchTerms = new Subject<string>();

  readonly notificationCount = computed(() => this.unreadCount());

  constructor(
    public auth: AuthService,
    public access: RoleAccessService,
    public i18n: I18nService,
    public tenant: TenantContextService,
    public theme: ThemeService,
    private router: Router,
    private http: HttpClient,
    private settings: AppSettingsService
  ) {}

  ngOnInit() {
    this.user.set(this.auth.currentUser());
    this.navGroups = this.access.getNavGroups();
    this.syncPageMeta();
    this.loadUnreadCount();
    this.restoreRecentSearches();
    this.bindSearch();

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
    const inSearch = host.querySelector('.topbar-center')?.contains(target);
    if (!inSearch) {
      this.searchOpen.set(false);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'k') {
      event.preventDefault();
      this.openSearch();
      return;
    }
    if (!this.searchOpen()) return;
    if (event.key === 'Escape') {
      this.searchOpen.set(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.selectedSearchIndex.update(i => Math.min(i + 1, Math.max(0, this.searchResults().length - 1)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectedSearchIndex.update(i => Math.max(0, i - 1));
      return;
    }
    if (event.key === 'Enter') {
      const item = this.searchResults()[this.selectedSearchIndex()];
      if (item) {
        event.preventDefault();
        this.openSearchResult(item);
      }
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
    this.http.patch(`/api/notifications/center/${notif.id}/read`, {}).subscribe({
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
    this.http.patch('/api/notifications/center/read-all', {}).subscribe({
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
    return parts.join(' / ');
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

  get dashboardRoute(): string {
    const role = this.user()?.role ?? '';
    if (role === 'superadmin') return '/admin/companies';
    return '/app/dashboard';
  }

  label(ar: string, en: string) {
    return this.i18n.currentLang === 'ar' ? ar : en;
  }

  toggleTheme() {
    this.theme.toggle();
  }

  openSearch() {
    this.searchOpen.set(true);
    setTimeout(() => {
      const input = (this.elRef.nativeElement as HTMLElement).querySelector('.top-search-input') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  onSearchInput(value: string) {
    this.searchQuery.set(value);
    this.searchOpen.set(true);
    this.searchTerms.next(value);
  }

  openSearchResult(result: GlobalSearchResult) {
    const target = result.url || result.route;
    if (!target) {
      if (result.type === 'action' && result.icon === 'notifications') this.toggleNotifications();
      return;
    }
    const query = this.searchQuery().trim();
    if (query) this.rememberSearch(query);
    this.searchOpen.set(false);
    this.router.navigateByUrl(target);
  }

  openSelectedSearchResult(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    const item = this.searchResults()[this.selectedSearchIndex()] || this.searchResults()[0];
    if (item) this.openSearchResult(item);
  }

  runRecentSearch(term: string) {
    this.searchQuery.set(term);
    this.searchTerms.next(term);
    this.openSearch();
  }

  ui(ar: string, en: string) {
    return this.label(ar, en);
  }

  languageLabel(lang: 'ar' | 'en') {
    return lang === 'ar' ? this.i18n.instant('shell.languageArabic') : this.i18n.instant('shell.languageEnglish');
  }

  groupedSearchResults() {
    const groups = new Map<string, GlobalSearchResult[]>();
    for (const item of this.searchResults()) {
      const label = this.searchGroupLabel(item.type);
      groups.set(label, [...(groups.get(label) ?? []), item]);
    }
    return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
  }

  searchGroupLabel(type: GlobalSearchResult['type']) {
    const labels: Record<GlobalSearchResult['type'], string> = {
      employee: this.ui('الموظفون', 'Employees'),
      company: this.ui('الشركات', 'Companies'),
      user: this.ui('المستخدمون', 'Users'),
      department: this.ui('الأقسام', 'Departments'),
      job_description: this.ui('الملفات الوظيفية', 'Job profiles'),
      document: this.ui('الوثائق', 'Documents'),
      workflow: this.ui('سير العمل', 'Workflows'),
      payroll_run: this.ui('مسيرات الرواتب', 'Payroll runs'),
      plan: this.ui('الخطط', 'Plans'),
      subscription: this.ui('الاشتراكات', 'Subscriptions'),
      audit: this.ui('سجلات التدقيق', 'Audit logs'),
      background_job: this.ui('المهام الخلفية', 'Background jobs'),
      report: this.ui('التقارير', 'Reports'),
      action: this.ui('إجراءات سريعة', 'Quick actions'),
    } as Record<string, string>;
    return labels[type] || type;
  }

  private syncPageMeta() {
    const url = this.router.url;
    const page = this.navGroups.flatMap(g => g.items).find(item => url.startsWith(item.path));
    this.currentPage.set(page ?? null);
  }

  private bindSearch() {
    this.searchTerms.pipe(
      debounceTime(220),
      map(term => term.trim()),
      distinctUntilChanged(),
      switchMap(term => {
        if (!term) {
          this.searchResults.set(this.quickActions(''));
          this.searchLoading.set(false);
          return of(null);
        }
        this.searchLoading.set(true);
        return this.performGlobalSearch(term).pipe(finalize(() => this.searchLoading.set(false)));
      })
    ).subscribe(results => {
      if (results) {
        this.searchResults.set(results);
        this.selectedSearchIndex.set(0);
      }
    });
    this.searchResults.set(this.quickActions(''));
  }

  private performGlobalSearch(term: string) {
    return forkJoin([
      this.http.get<ApiResponse<GlobalSearchResult[]>>(`/api/search?q=${encodeURIComponent(term)}`).pipe(
        map(res => res.data ?? []),
        catchError(() => of([] as GlobalSearchResult[]))
      ),
      of(this.quickActions(term))
    ]).pipe(map(groups => groups.flat().slice(0, 30)));
  }

  private quickActions(term: string): GlobalSearchResult[] {
    const actions: GlobalSearchResult[] = [
      { type: 'report', title: this.ui('تقرير عدد الموظفين', 'Headcount report'), subtitle: this.ui('افتح مركز الوثائق والتقارير', 'Open Documents & Reporting'), icon: 'monitoring', url: '/app/documents-reporting' },
      { type: 'action', title: this.ui('لوحة التحكم', 'Dashboard'), subtitle: this.ui('العودة إلى الصفحة الرئيسية', 'Return to home'), icon: 'dashboard', url: this.dashboardRoute },
      { type: 'action', title: this.ui('الإشعارات', 'Notifications'), subtitle: this.ui('افتح مركز الإشعارات', 'Open notification center'), icon: 'notifications' },
    ];
    if (this.user()?.role === 'superadmin') {
      actions.push(
        { type: 'action', title: this.ui('تحليلات المنصة', 'Platform analytics'), subtitle: this.ui('لوحة مؤشرات النظام', 'System KPI dashboard'), icon: 'analytics', url: '/admin/analytics' },
        { type: 'action', title: this.ui('الخطط والاشتراكات', 'Plans and subscriptions'), subtitle: this.ui('إدارة الباقات', 'Manage billing plans'), icon: 'credit_card', url: '/admin/plans-subscriptions' }
      );
    }
    return term ? actions.filter(a => this.matchesTerm(term, a.title, a.subtitle)) : actions;
  }

  private matchesTerm(term: string, ...values: unknown[]) {
    const q = term.toLowerCase();
    return values.some(value => String(value ?? '').toLowerCase().includes(q));
  }

  private restoreRecentSearches() {
    try {
      const raw = localStorage.getItem('zenjo_recent_searches');
      this.recentSearches.set(raw ? JSON.parse(raw).slice(0, 5) : []);
    } catch {
      this.recentSearches.set([]);
    }
  }

  private rememberSearch(term: string) {
    const next = [term, ...this.recentSearches().filter(item => item !== term)].slice(0, 5);
    this.recentSearches.set(next);
    try {
      localStorage.setItem('zenjo_recent_searches', JSON.stringify(next));
    } catch {}
  }

  private loadUnreadCount() {
    this.http.get<ApiResponse<{ count: number }>>('/api/notifications/center/unread-count').subscribe({
      next: res => this.unreadCount.set(res.data?.count ?? 0),
      error: () => {}
    });
  }

  private loadNotifications() {
    this.notificationsLoading.set(true);
    this.http.get<ApiResponse<{ items: DbNotification[] }>>('/api/notifications/center?pageSize=15').subscribe({
      next: res => {
        const items = res.data?.items ?? [];
        this.notifications.set(items);
        const unread = items.filter(n => n.status === 'unread').length;
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
