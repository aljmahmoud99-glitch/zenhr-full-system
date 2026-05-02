import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';

type ApiCategory = { id: string; name_ar: string; name_en: string; icon?: string };
type ApiForm = { id: string; name_ar: string; name_en: string; category: string };

@Component({
  selector: 'app-forms',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
<section class="z-page forms-page" [attr.dir]="lang === 'ar' ? 'rtl' : 'ltr'" [attr.lang]="lang">
  <header class="z-page-header">
    <div class="header-copy">
      <span class="eyebrow">{{ t('النماذج والوثائق الرسمية', 'Forms & official documents') }}</span>
      <h1 class="z-title">{{ t('النماذج', 'Forms') }}</h1>
      <p class="z-body">{{ t('وصول منظم إلى النماذج الرسمية مع معاينة مباشرة وسجل سريع لآخر العناصر.', 'A structured catalog of official forms with live preview and a quick recent history.') }}</p>
    </div>
  </header>

  <section class="z-card forms-toolbar-card">
    <div class="forms-toolbar">
      <label class="toolbar-search">
        <span class="z-label">{{ t('بحث', 'Search') }}</span>
        <div class="search-shell">
          <span class="material-icons search-icon">search</span>
          <input
            class="z-input form-search-input"
            type="text"
            [(ngModel)]="searchQuery"
            [placeholder]="t('ابحث في النماذج...', 'Search forms...')">
        </div>
      </label>

      <div class="toolbar-categories">
        <span class="z-label">{{ t('الفئات', 'Categories') }}</span>
        <div class="cat-pills">
          <button type="button" class="cat-pill" [class.active]="activeCategory === 'all'" (click)="activeCategory = 'all'">
            {{ t('الكل', 'All') }}
          </button>
          <button
            type="button"
            *ngFor="let cat of categories"
            class="cat-pill"
            [class.active]="activeCategory === cat.id"
            (click)="activeCategory = cat.id">
            <span class="material-icons cat-pill-icon">{{ cat.icon }}</span>
            {{ lang === 'ar' ? cat.name_ar : cat.name_en }}
          </button>
        </div>
      </div>
    </div>
  </section>

  <section class="z-card recent-forms-card" *ngIf="filteredRecentForms().length > 0 && activeCategory === 'all'">
    <div class="z-card-header">
      <div>
        <h2 class="z-heading">{{ t('النماذج الأخيرة', 'Recent forms') }}</h2>
        <p class="z-small">{{ t('أحدث النماذج التي تم فتحها أو حفظها مؤخرًا.', 'Most recent forms you opened or saved.') }}</p>
      </div>
    </div>

    <div class="recent-forms-list">
      <button type="button" *ngFor="let record of filteredRecentForms()" class="recent-item" (click)="openRecent(record)">
        <span class="material-icons recent-icon">description</span>
        <div class="recent-info">
          <div class="recent-name">{{ getFormNameForRecord(record) }}</div>
          <div class="recent-meta">{{ record.employeeName || '—' }} • {{ record.createdAt | date:'dd/MM/yyyy' }}</div>
        </div>
        <span class="badge" [class]="statusClass(record.status)">{{ statusLabel(record.status) }}</span>
      </button>
    </div>
  </section>

  <ng-container *ngFor="let cat of visibleCategories()">
    <section class="z-card forms-category-section">
      <div class="z-card-header">
        <div class="category-header">
          <span class="material-icons cat-icon">{{ getCatIcon(cat) }}</span>
          <div>
            <h2 class="z-heading category-title">{{ getCategoryName(cat) }}</h2>
            <p class="z-small">{{ t('نماذج جاهزة ضمن هذه الفئة.', 'Available forms in this category.') }}</p>
          </div>
        </div>
        <span class="cat-count">{{ getCatForms(cat).length }}</span>
      </div>

      <div class="forms-grid">
        <button type="button" *ngFor="let form of getCatForms(cat)" class="form-card" (click)="openForm(form.id)">
          <div class="form-card-icon">
            <span class="material-icons">description</span>
          </div>
          <div class="form-card-body">
            <div class="form-card-name">{{ getFormName(form.id) }}</div>
          </div>
          <span class="material-icons form-card-arrow">{{ lang === 'ar' ? 'chevron_left' : 'chevron_right' }}</span>
        </button>
      </div>

      <div *ngIf="getCatForms(cat).length === 0" class="empty-state" style="padding: 18px 20px;">
        <span class="material-icons empty-icon" style="font-size:28px;margin:0 0 6px 0;">description</span>
        <p style="margin:0">{{ t('لا توجد نماذج متاحة ضمن هذه الفئة حالياً.', 'No forms available in this category yet.') }}</p>
      </div>
    </section>
  </ng-container>

  <div *ngIf="visibleCategories().length === 0" class="empty-state">
    <span class="material-icons empty-icon">search_off</span>
    <p>{{ t('لا توجد نماذج مطابقة', 'No forms match your search') }}</p>
  </div>
</section>
`,
  styles: [`
.forms-page { gap: var(--z-space-6); }
.header-copy { display: grid; gap: var(--z-space-2); }
.forms-toolbar-card { padding: var(--z-space-5); }
.forms-toolbar { display: grid; gap: var(--z-space-4); }
.toolbar-search,
.toolbar-categories { display: grid; gap: 8px; }

.search-shell { position: relative; display: flex; align-items: center; }
.search-icon {
  position: absolute;
  inset-inline-start: 14px;
  color: var(--z-text-muted);
  font-size: 20px;
  pointer-events: none;
}

.form-search-input { padding-inline-start: 42px; }

.cat-pills { display: flex; flex-wrap: wrap; gap: 8px; }
.cat-pill {
  min-height: 38px;
  padding: 8px 14px;
  border: 1px solid var(--z-border);
  border-radius: 999px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: all .2s;
  display: flex;
  align-items: center;
  gap: 6px;
}
.cat-pill.active { background: var(--z-emerald); color: #fff; border-color: var(--z-emerald); }
.cat-pill-icon { font-size: 18px; }

.recent-forms-list { display: flex; flex-direction: column; }
.recent-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 0;
  border-bottom: 1px solid #f0f0f0;
  background: transparent;
  cursor: pointer;
  transition: background .15s;
  text-align: start;
}
.recent-item:hover { background: #f8f9fa; }
.recent-icon, .cat-icon { color: var(--z-emerald); }
.recent-info { flex: 1; min-width: 0; }
.recent-name { font-size: 14px; font-weight: 600; }
.recent-meta { font-size: 12px; color: var(--z-text-muted); }

.forms-category-section { display: grid; gap: var(--z-space-4); }
.category-header { display: flex; align-items: center; gap: 10px; }
.category-title { margin: 0; }
.cat-count {
  background: #ecfdf5;
  color: var(--z-emerald);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 600;
}

.forms-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.form-card {
  background: #fff;
  border: 1px solid var(--z-border);
  border-radius: var(--z-radius-md);
  padding: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: all .2s;
  box-shadow: var(--z-shadow-card);
  text-align: start;
}
.form-card:hover { border-color: var(--z-emerald); box-shadow: var(--z-shadow-lg); transform: translateY(-1px); }
.form-card-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: #ecfdf5;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.form-card-icon .material-icons { color: var(--z-emerald); font-size: 24px; }
.form-card-body { flex: 1; min-width: 0; }
.form-card-name { font-size: 14px; font-weight: 600; color: #1a1a2e; line-height: 1.4; }
.form-card-arrow { color: #cbd5e1; font-size: 20px; }

.empty-state { text-align: center; padding: 48px 20px; color: var(--z-text-muted); }
.empty-state .empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.6; }

@media (max-width: 768px) {
  .cat-pills { gap: 6px; }
  .form-card { padding: 14px; }
}
  `]
})
export class FormsComponent implements OnInit {
  recentForms = signal<any[]>([]);
  searchQuery = '';
  activeCategory = 'all';
  categories: ApiCategory[] = [];
  allForms: ApiForm[] = [];
  private catalogLoaded = false;

  // Legacy form keys in old records → new catalog ids (so recents show friendly names)
  private readonly legacyIdMap: Record<string, string> = {
    leave: 'leave_request',
    'salary-advance': 'loan_request',
    resignation: 'resignation_letter',
    'passport-request': 'passport_request'
  };

  // Employee self-service (safe default if backend doesn't provide role access)
  private readonly employeeAllowedIds = new Set([
    'leave_request',
    'loan_request',
    'resignation_letter',
    'passport_request'
  ]);

  private readonly fallbackCategories: ApiCategory[] = [
    { id: 'employee', name_ar: 'نماذج الموظفين', name_en: 'Employee Forms', icon: 'person' },
    { id: 'recruitment', name_ar: 'التوظيف والتعيين', name_en: 'Recruitment & Hiring', icon: 'work' },
    { id: 'assets', name_ar: 'العهد والتصاريح', name_en: 'Assets & Permits', icon: 'inventory_2' },
    { id: 'legal', name_ar: 'قانونية وإدارية', name_en: 'Legal & Administrative', icon: 'gavel' },
    { id: 'certificates', name_ar: 'خطابات وشهادات', name_en: 'Letters & Certificates', icon: 'workspace_premium' }
  ];

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private router: Router
  ) {}

  get lang() {
    return this.auth.lang;
  }

  get role() {
    return this.auth.currentUser()?.role ?? '';
  }

  ngOnInit() {
    // Recent submissions (draft/submitted) - existing endpoint
    this.api.get<any>('/api/forms').subscribe({
      next: response => this.recentForms.set((response.data || []).slice(0, 50)),
      error: () => {}
    });

    // Catalog: categories + forms come from backend (no hardcoded frontend logic).
    // Dev proxy setups often forward only `/api/*`, so try `/api/forms-catalog` first then fallback to `/forms`.
    const handleCatalog = (r: any) => {
      const data = r?.data ?? r;
      const rawCats = data?.categories ?? data?.Categories ?? [];
      const rawForms = data?.forms ?? data?.Forms ?? [];
      this.categories = this.normalizeCategories(rawCats);
      this.allForms = this.normalizeForms(rawForms);
      this.catalogLoaded = true;
      // Temporary debug
      // eslint-disable-next-line no-console
      console.log('[FormsCatalog]', { categories: this.categories, forms: this.allForms });
    };

    this.api.get<any>('/api/forms-catalog').subscribe({
      next: handleCatalog,
      error: () => this.api.get<any>('/forms').subscribe({ next: handleCatalog, error: () => {} })
    });
  }

  t(ar: string, en: string) {
    return this.lang === 'ar' ? ar : en;
  }

  visibleCategories(): string[] {
    // Categories should not disappear: always show configured categories (even if empty)
    const ids = (this.categories || []).map(c => c.id);
    const base = ids.length ? ids : ['__all__'];
    return base.filter(category => this.activeCategory === 'all' || category === this.activeCategory);
  }

  getCatForms(category: string): ApiForm[] {
    const query = this.searchQuery.trim().toLowerCase();
    return this.allowedForms().filter(form => {
      if (category !== '__all__' && form.category !== category) return false;
      if (!query) return true;
      const ar = (form.name_ar || '').toLowerCase();
      const en = (form.name_en || '').toLowerCase();
      return ar.includes(query) || en.includes(query);
    });
  }

  private allowedForms(): ApiForm[] {
    // Employee role should only see self-service forms.
    if (this.role === 'employee') {
      return (this.allForms || []).filter(f => this.employeeAllowedIds.has(f.id));
    }
    return this.allForms || [];
  }

  getCatIcon(category: string) {
    if (category === '__all__') return 'folder';
    return this.categories.find(item => item.id === category)?.icon ?? 'folder';
  }

  getCategoryName(category: string) {
    if (category === '__all__') return this.t('الكل', 'All');
    const found = this.categories.find(item => item.id === category);
    return found ? (this.lang === 'ar' ? found.name_ar : found.name_en) : category;
  }

  getFormName(formId: string) {
    const form = this.allForms.find(f => f.id === formId);
    if (!form) return formId;
    return this.lang === 'ar' ? (form.name_ar || formId) : (form.name_en || form.name_ar || formId);
  }

  // Recent drafts/search helpers
  filteredRecentForms(): any[] {
    const query = this.searchQuery.trim().toLowerCase();
    const list = this.recentForms() || [];
    const filtered = query
      ? list.filter(r => (this.getFormNameForRecord(r)?.toLowerCase() || '').includes(query))
      : list;
    return filtered.slice(0, 5);
  }

  getFormNameForRecord(record: any): string {
    const rawType = record?.formType || '';
    const mapped = this.legacyIdMap[rawType] || rawType;
    const form = this.allForms.find(f => f.id === mapped);
    if (form) return this.lang === 'ar' ? (form.name_ar || mapped) : (form.name_en || form.name_ar || mapped);
    // If catalog not loaded yet, avoid showing internal keys.
    if (!this.catalogLoaded) return this.lang === 'ar' ? '...' : '...';
    return this.lang === 'ar' ? 'نموذج غير معروف' : 'Unknown form';
  }

  openForm(formId: string) {
    this.router.navigate(['/app/forms', formId]);
  }

  openRecent(record: any) {
    const rawType = record?.formType || '';
    const mapped = this.legacyIdMap[rawType] || rawType;
    this.router.navigate(['/app/forms', mapped], { queryParams: { recordId: record.id } });
  }

  private normalizeCategories(raw: any[]): ApiCategory[] {
    const cats = (raw || [])
      .map((c: any) => ({
        id: String(c.id ?? c.key ?? c.category_key ?? c.categoryKey ?? ''),
        name_ar: String(c.name_ar ?? c.nameAr ?? c.title_ar ?? c.titleAr ?? c.name ?? ''),
        name_en: String(c.name_en ?? c.nameEn ?? c.title_en ?? c.titleEn ?? ''),
        icon: String(c.icon ?? 'folder')
      }))
      .filter(c => !!c.id);

    return cats.length ? cats : this.fallbackCategories;
  }

  private normalizeForms(raw: any[]): ApiForm[] {
    return (raw || [])
      .map((f: any) => ({
        id: String(f.id ?? f.formId ?? f.key ?? ''),
        name_ar: String(f.name_ar ?? f.nameAr ?? f.title_ar ?? f.titleAr ?? f.name ?? ''),
        name_en: String(f.name_en ?? f.nameEn ?? f.title_en ?? f.titleEn ?? ''),
        category: String(f.category ?? f.category_key ?? f.categoryKey ?? f.type ?? 'employee')
      }))
      .filter(f => !!f.id && (f.name_ar || f.name_en));
  }

  statusLabel(status: string) {
    const map: Record<string, { ar: string; en: string }> = {
      draft: { ar: 'مسودة', en: 'Draft' },
      submitted: { ar: 'مرسل', en: 'Submitted' },
      printed: { ar: 'مطبوع', en: 'Printed' }
    };
    const found = map[status];
    return found ? (this.lang === 'ar' ? found.ar : found.en) : status;
  }

  statusClass(status: string) {
    const map: Record<string, string> = {
      draft: 'badge-warning',
      submitted: 'badge-success',
      printed: 'badge-info'
    };
    return map[status] ?? 'badge-secondary';
  }
}
