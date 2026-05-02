import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '../models';

export interface TenantContext {
  companyId: number;
  companyNameAr: string;
  companyNameEn: string;
  branchId: number | null;
  branchNameAr: string | null;
  branchNameEn: string | null;
  deptId: number | null;
  deptNameAr: string | null;
  deptNameEn: string | null;
  orgNodeId: number | null;
  orgNodeNameAr: string | null;
  orgNodeNameEn: string | null;
  orgNodeType: string | null;
}

@Injectable({ providedIn: 'root' })
export class TenantContextService {
  private readonly http = inject(HttpClient);

  readonly context = signal<TenantContext | null>(null);
  readonly loading = signal(false);

  private loaded = false;

  load() {
    if (this.loaded) return;
    this.loaded = true;
    this.loading.set(true);
    this.http.get<ApiResponse<TenantContext>>('/api/auth/context').subscribe({
      next: res => {
        this.context.set(res.data ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  reload() {
    this.loaded = false;
    this.load();
  }

  companyName(lang: 'ar' | 'en'): string {
    const ctx = this.context();
    if (!ctx) return '';
    return lang === 'ar' ? (ctx.companyNameAr || ctx.companyNameEn) : (ctx.companyNameEn || ctx.companyNameAr);
  }

  branchName(lang: 'ar' | 'en'): string {
    const ctx = this.context();
    if (!ctx?.branchId) return '';
    return lang === 'ar' ? (ctx.branchNameAr || ctx.branchNameEn || '') : (ctx.branchNameEn || ctx.branchNameAr || '');
  }

  deptName(lang: 'ar' | 'en'): string {
    const ctx = this.context();
    if (!ctx?.deptId) return '';
    return lang === 'ar' ? (ctx.deptNameAr || ctx.deptNameEn || '') : (ctx.deptNameEn || ctx.deptNameAr || '');
  }

  readonly scopeParts = computed(() => {
    const ctx = this.context();
    if (!ctx) return [];
    const parts: string[] = [];
    if (ctx.companyNameEn) parts.push(ctx.companyNameEn);
    if (ctx.branchNameEn) parts.push(ctx.branchNameEn);
    if (ctx.deptNameEn) parts.push(ctx.deptNameEn);
    return parts;
  });

  readonly scopePartsAr = computed(() => {
    const ctx = this.context();
    if (!ctx) return [];
    const parts: string[] = [];
    if (ctx.companyNameAr) parts.push(ctx.companyNameAr);
    if (ctx.branchNameAr) parts.push(ctx.branchNameAr);
    if (ctx.deptNameAr) parts.push(ctx.deptNameAr);
    return parts;
  });
}
