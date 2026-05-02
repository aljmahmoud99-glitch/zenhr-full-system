
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { throwError, catchError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const token = localStorage.getItem('zenjo_token');

  const authReq = token
    ? req.clone({ headers: req.headers.set('Authorization', `Bearer ${token}`) })
    : req;

  // These endpoints must NOT trigger session-clear on 401:
  //  /api/permissions/*  — falls back to legacy role checks (Phase 1)
  //  /api/config         — called at startup by AppSettingsService before auth is established
  const silentOn401 = ['/api/permissions', '/api/config'];
  const isSilent = silentOn401.some(path => req.url.includes(path));

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !req.url.includes('/auth/login') && !isSilent) {
        ['zenjo_token','zenjo_refresh','zenjo_user','zenjo_admin_token','zenjo_admin_user',
         'zenjo_impersonate_token','zenjo_impersonate_user'].forEach(k => localStorage.removeItem(k));
        router.navigate(['/login']);
      }
      if (err.status === 402) {
        router.navigate(['/subscription-expired']);
      }
      return throwError(() => err);
    })
  );
};
