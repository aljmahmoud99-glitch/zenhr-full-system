import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, throwError } from 'rxjs';
import { User, ApiResponse } from '../models';
import { I18nService, Lang } from './i18n.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user = signal<User | null>(null);
  private _impersonating = signal<boolean>(false);
  private _impersonatedBy = signal<string | null>(null);

  currentUser = this._user.asReadonly();
  isLoggedIn = computed(() => this._user() !== null);
  requiresPasswordChange = computed(() => this._user()?.mustChangePassword === true);
  isImpersonating = this._impersonating.asReadonly();
  impersonatedBy = this._impersonatedBy.asReadonly();

  constructor(private http: HttpClient, private router: Router, private i18n: I18nService) {
    const stored = localStorage.getItem('zenjo_user');
    const token = this.getToken();
    if (stored && token) {
      const parsedUser = JSON.parse(stored) as User;
      this._user.set(parsedUser);
      this._checkImpersonation(token);
      this.repairSessionContext(parsedUser, token);
    }
  }

  getToken() { return localStorage.getItem('zenjo_token'); }
  getRefreshToken() { return localStorage.getItem('zenjo_refresh'); }

  /** Decode JWT payload (base64url) without verification */
  decodeToken(token: string): Record<string, any> | null {
    try {
      const payload = token.split('.')[1];
      return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    } catch { return null; }
  }

  private _checkImpersonation(token: string) {
    const claims = this.decodeToken(token);
    if (claims?.['impersonatedBy']) {
      this._impersonating.set(true);
      this._impersonatedBy.set(claims['impersonatedBy']);
    } else {
      this._impersonating.set(false);
      this._impersonatedBy.set(null);
    }
  }

  login(username: string, password: string) {
    return this.http.post<ApiResponse<{ accessToken: string; refreshToken: string; user: User }>>('/api/auth/login', { username, password }).pipe(
      tap(res => {
        if (res.success) {
          const claims = this.decodeToken(res.data.accessToken);
          const enrichedUser: User = {
            ...res.data.user,
            companyId: claims?.['companyId'] ? Number(claims['companyId']) : undefined
          };
          localStorage.setItem('zenjo_token', res.data.accessToken);
          localStorage.setItem('zenjo_refresh', res.data.refreshToken);
          localStorage.setItem('zenjo_user', JSON.stringify(enrichedUser));
          this._user.set(enrichedUser);
          this._checkImpersonation(res.data.accessToken);
        }
      })
    );
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.http.patch<ApiResponse<{ user: User }>>('/api/auth/change-password', { currentPassword, newPassword }).pipe(
      tap(res => {
        if (res.success && res.data?.user) {
          const mergedUser: User = { ...(this._user() ?? {} as User), ...res.data.user, mustChangePassword: false };
          localStorage.setItem('zenjo_user', JSON.stringify(mergedUser));
          this._user.set(mergedUser);
        }
      })
    );
  }

  /** Store an impersonation token (issued by SuperAdmin) without replacing refresh token */
  setImpersonationToken(accessToken: string, user: User) {
    const claims = this.decodeToken(accessToken);
    const enriched: User = { ...user, companyId: claims?.['companyId'] ? Number(claims['companyId']) : undefined };
    localStorage.setItem('zenjo_impersonate_token', accessToken);
    localStorage.setItem('zenjo_impersonate_user', JSON.stringify(enriched));
    localStorage.setItem('zenjo_token', accessToken);
    localStorage.setItem('zenjo_user', JSON.stringify(enriched));
    this._user.set(enriched);
    this._checkImpersonation(accessToken);
    this.router.navigateByUrl(this.defaultHomeUrl(enriched.role));
  }

  /** End impersonation — restore the SuperAdmin session */
  endImpersonation() {
    const adminToken = localStorage.getItem('zenjo_admin_token');
    const adminUser = localStorage.getItem('zenjo_admin_user');
    if (adminToken && adminUser) {
      localStorage.setItem('zenjo_token', adminToken);
      localStorage.setItem('zenjo_user', adminUser);
      localStorage.removeItem('zenjo_admin_token');
      localStorage.removeItem('zenjo_admin_user');
      localStorage.removeItem('zenjo_impersonate_token');
      localStorage.removeItem('zenjo_impersonate_user');
      this._user.set(JSON.parse(adminUser));
      this._impersonating.set(false);
      this._impersonatedBy.set(null);
      this.router.navigateByUrl(this.defaultHomeUrl('superadmin'));
    } else {
      this.logout();
    }
  }

  refreshToken() {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return throwError(() => 'No refresh token');
    return this.http.post<ApiResponse<{ accessToken: string; refreshToken: string }>>('/api/auth/refresh', { refreshToken }).pipe(
      tap(res => {
        if (res.success) {
          localStorage.setItem('zenjo_token', res.data.accessToken);
          localStorage.setItem('zenjo_refresh', res.data.refreshToken);
        }
      })
    );
  }

  private repairSessionContext(user: User, token: string) {
    const claims = this.decodeToken(token);
    const role = claims?.['role'] ?? user.role;
    const companyId = Number(claims?.['companyId'] ?? user.companyId ?? 0);

    if (role === 'superadmin' || companyId > 0 || !this.getRefreshToken()) {
      if (companyId > 0 && user.companyId !== companyId) {
        const mergedUser: User = { ...user, companyId };
        localStorage.setItem('zenjo_user', JSON.stringify(mergedUser));
        this._user.set(mergedUser);
      }
      return;
    }

    this.refreshToken().subscribe({
      next: res => {
        if (!res?.success) return;

        const nextToken = res.data.accessToken;
        const nextClaims = this.decodeToken(nextToken);
        const mergedUser: User = {
          ...user,
          companyId: nextClaims?.['companyId'] ? Number(nextClaims['companyId']) : user.companyId
        };

        localStorage.setItem('zenjo_user', JSON.stringify(mergedUser));
        this._user.set(mergedUser);
        this._checkImpersonation(nextToken);
      },
      error: () => {
        ['zenjo_token', 'zenjo_refresh', 'zenjo_user', 'zenjo_admin_token', 'zenjo_admin_user',
         'zenjo_impersonate_token', 'zenjo_impersonate_user'].forEach(k => localStorage.removeItem(k));
        this._user.set(null);
        this._impersonating.set(false);
        this._impersonatedBy.set(null);
      }
    });
  }

  logout() {
    this.http.post('/api/auth/logout', {}).subscribe();
    ['zenjo_token','zenjo_refresh','zenjo_user','zenjo_admin_token','zenjo_admin_user',
     'zenjo_impersonate_token','zenjo_impersonate_user'].forEach(k => localStorage.removeItem(k));
    this._user.set(null);
    this._impersonating.set(false);
    this._impersonatedBy.set(null);
    this.router.navigate(['/login']);
  }

  hasRole(...roles: string[]): boolean {
    const user = this._user();
    return user ? roles.includes(user.role) : false;
  }

  defaultHomeUrl(role = this._user()?.role ?? ''): string {
    if (role === 'superadmin') return '/admin/companies';
    if (role === 'recruiter') return '/app/recruitment';
    return '/app/dashboard';
  }

  get isSuperAdmin(): boolean { return this._user()?.role === 'superadmin'; }

  get lang(): Lang {
    return this.i18n.currentLang;
  }

  setLang(l: Lang) {
    this.i18n.setLanguage(l);
  }
}
