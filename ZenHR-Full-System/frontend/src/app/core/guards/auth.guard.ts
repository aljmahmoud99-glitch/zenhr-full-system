
import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { SCREEN_ACCESS } from '../services/role-access.service';

export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) {
    if (auth.requiresPasswordChange() && state.url !== '/change-password') {
      router.navigate(['/change-password']);
      return false;
    }
    return true;
  }
  router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
  return false;
};

export const guestGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) return true;
  if (auth.requiresPasswordChange()) {
    router.navigate(['/change-password']);
    return false;
  }
  router.navigateByUrl(auth.defaultHomeUrl());
  return false;
};

/**
 * Role guard — reads the route's data.pathKey property and checks SCREEN_ACCESS.
 * If the user's role is not allowed on this page, redirect to dashboard.
 */
export const roleGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const http = inject(HttpClient);
  const page: string = route.data?.['pathKey'] ?? route.data?.['page'] ?? '';
  const roles: string[] = route.data?.['roles'] ?? [];
  const role = auth.currentUser()?.role ?? '';
  const allowed = roles.length ? roles : (SCREEN_ACCESS[page] ?? []);
  const denied = () => router.createUrlTree(['/access-denied'], { queryParams: { returnUrl: state.url } });
  if (auth.requiresPasswordChange()) {
    router.navigate(['/change-password']);
    return false;
  }
  if (!page || allowed.includes(role)) {
    if (role === 'employee' && page === '/app/employees/:id') {
      const routeEmployeeId = Number(route.paramMap.get('id') ?? 0);
      const myEmployeeId = Number(auth.currentUser()?.employeeId ?? auth.currentUser()?.employee?.id ?? 0);
      if (!routeEmployeeId || !myEmployeeId || routeEmployeeId !== myEmployeeId) {
        return denied();
      }
    }
    if (role === 'manager' && page === '/app/employees/:id') {
      const routeEmployeeId = Number(route.paramMap.get('id') ?? 0);
      const myEmployeeId = Number(auth.currentUser()?.employeeId ?? auth.currentUser()?.employee?.id ?? 0);
      if (!routeEmployeeId) return denied();
      if (routeEmployeeId === myEmployeeId) return true;
      return http.get(`/api/employees/${routeEmployeeId}`, { headers: { 'x-silent-authz': '1' } }).pipe(
        map(() => true),
        catchError(() => of(denied()))
      );
    }
    return true;
  }
  return denied();
};
