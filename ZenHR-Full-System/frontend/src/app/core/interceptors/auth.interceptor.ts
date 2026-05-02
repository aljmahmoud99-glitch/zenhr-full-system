
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastService } from '../services/toast.service';
import { throwError, catchError, switchMap, from, of } from 'rxjs';

let refreshPromise: Promise<string | null> | null = null;

function decodeTokenExp(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof claims['exp'] === 'number' ? claims['exp'] : null;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const exp = decodeTokenExp(token);
  if (exp === null) return false;
  return Date.now() / 1000 >= exp - 30;
}

async function attemptRefresh(): Promise<string | null> {
  const refreshToken = localStorage.getItem('zenjo_refresh');
  if (!refreshToken) return null;
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.success && data?.data?.accessToken) {
      localStorage.setItem('zenjo_token', data.data.accessToken);
      return data.data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

function getValidToken(): Promise<string | null> {
  const token = localStorage.getItem('zenjo_token');
  if (!token) return Promise.resolve(null);

  if (!isTokenExpired(token)) return Promise.resolve(token);

  if (!refreshPromise) {
    refreshPromise = attemptRefresh().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const toast = inject(ToastService);

  const isAuthEndpoint = req.url.includes('/auth/login') || req.url.includes('/auth/refresh') || req.url.includes('/auth/register');
  const silentOn401 = ['/api/permissions', '/api/config'];
  const isSilent = silentOn401.some(path => req.url.includes(path));

  if (isAuthEndpoint) {
    return next(req).pipe(
      catchError((err: HttpErrorResponse) => throwError(() => err))
    );
  }

  return from(getValidToken()).pipe(
    switchMap(token => {
      const authReq = token
        ? req.clone({ headers: req.headers.set('Authorization', `Bearer ${token}`) })
        : req;

      return next(authReq).pipe(
        catchError((err: HttpErrorResponse) => {
          if (err.status === 401 && !isSilent) {
            ['zenjo_token', 'zenjo_refresh', 'zenjo_user', 'zenjo_admin_token', 'zenjo_admin_user',
              'zenjo_impersonate_token', 'zenjo_impersonate_user'].forEach(k => localStorage.removeItem(k));
            router.navigate(['/login']);
          }
          if (err.status === 402) {
            router.navigate(['/subscription-expired']);
          }
          if (err.status === 403) {
            toast.warning('You do not have permission to perform this action.');
          }
          return throwError(() => err);
        })
      );
    })
  );
};
