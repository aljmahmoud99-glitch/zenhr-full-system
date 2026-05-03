import { ChangeDetectionStrategy, Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog.component';
import { getErrorMessage } from '../../core/utils/error-message';

interface SalaryComponent {
  id: number;
  companyId: number;
  code: string;
  nameAr: string;
  nameEn: string;
  componentType: 'earning' | 'deduction';
  calculationType: 'fixed' | 'percentage' | 'formula';
  defaultValue: string;
  formulaExpression: string | null;
  percentageBase: 'basic' | 'gross' | null;
  isTaxable: boolean;
  isSscApplicable: boolean;
  isRecurring: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  isReferenced: boolean;
}

const BLANK_FORM = () => ({
  code: '',
  nameAr: '',
  nameEn: '',
  componentType: 'earning' as 'earning' | 'deduction',
  calculationType: 'fixed' as 'fixed' | 'percentage' | 'formula',
  defaultValue: '0',
  formulaExpression: '',
  percentageBase: 'basic' as 'basic' | 'gross',
  isTaxable: true,
  isSscApplicable: false,
  isRecurring: true,
  isActive: true,
  sortOrder: 0,
});

@Component({
  selector: 'app-salary-components',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent],
  templateUrl: './salary-components.component.html',
  styleUrl: './salary-components.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalaryComponentsComponent implements OnInit {
  components = signal<SalaryComponent[]>([]);
  loading = signal(true);
  saving = signal(false);
  error = signal('');

  showModal = signal(false);
  editingId = signal<number | null>(null);
  confirmDeleteId = signal<number | null>(null);
  form = signal<ReturnType<typeof BLANK_FORM>>(BLANK_FORM());
  formulaPreview = signal<string | null>(null);
  search = '';

  readonly filtered = computed(() => {
    const q = this.search.trim().toLowerCase();
    return this.components().filter(c =>
      !q ||
      c.code.toLowerCase().includes(q) ||
      c.nameEn.toLowerCase().includes(q) ||
      c.nameAr.includes(q)
    );
  });

  readonly earnings = computed(() => this.filtered().filter(c => c.componentType === 'earning'));
  readonly deductions = computed(() => this.filtered().filter(c => c.componentType === 'deduction'));

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private toast: ToastService,
  ) {}

  get lang() { return this.auth.lang; }
  label(ar: string, en: string) { return this.lang === 'ar' ? ar : en; }

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.api.get<any>('/api/salary-components').subscribe({
      next: r => { this.components.set(r.data ?? []); this.loading.set(false); },
      error: e => { this.error.set(getErrorMessage(e, 'Failed to load')); this.loading.set(false); }
    });
  }

  openCreate() {
    this.editingId.set(null);
    this.form.set(BLANK_FORM());
    this.error.set('');
    this.formulaPreview.set(null);
    this.showModal.set(true);
  }

  openEdit(comp: SalaryComponent) {
    this.editingId.set(comp.id);
    this.form.set({
      code: comp.code,
      nameAr: comp.nameAr,
      nameEn: comp.nameEn,
      componentType: comp.componentType,
      calculationType: comp.calculationType,
      defaultValue: comp.defaultValue,
      formulaExpression: comp.formulaExpression ?? '',
      percentageBase: comp.percentageBase ?? 'basic',
      isTaxable: comp.isTaxable,
      isSscApplicable: comp.isSscApplicable,
      isRecurring: comp.isRecurring,
      isActive: comp.isActive,
      sortOrder: comp.sortOrder,
    });
    this.error.set('');
    this.formulaPreview.set(null);
    this.showModal.set(true);
  }

  closeModal() {
    if (this.saving()) return;
    this.showModal.set(false);
  }

  get f() { return this.form(); }
  patchForm(patch: Partial<ReturnType<typeof BLANK_FORM>>) {
    this.form.update(cur => ({ ...cur, ...patch }));
    this.formulaPreview.set(null);
  }

  previewFormula() {
    const expr = this.f.formulaExpression?.trim() ?? '';
    if (!expr) { this.formulaPreview.set(this.label('أدخل تعبير الصيغة أولاً', 'Enter a formula expression first')); return; }
    const sampleVars = { basic: 1000, gross: 1500, hours: 160, rate: 6.25 };
    const result = this.evalFormula(expr, sampleVars);
    if (result === null) {
      this.formulaPreview.set(this.label('صيغة غير صالحة', 'Invalid formula'));
    } else {
      this.formulaPreview.set(
        this.label(
          `النتيجة (أساسي=1000، إجمالي=1500): ${result.toFixed(3)} دينار`,
          `Result (basic=1000, gross=1500): ${result.toFixed(3)} JOD`
        )
      );
    }
  }

  evalFormula(expr: string, vars: Record<string, number>): number | null {
    const substituted = expr.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (m) =>
      vars[m] !== undefined ? String(vars[m]) : 'INVALID'
    );
    if (substituted.includes('INVALID')) return null;
    if (!/^[\d\s\.\+\-\*\/\(\)]+$/.test(substituted)) return null;
    let pos = 0;
    const len = substituted.length;
    const skipWS = () => { while (pos < len && /\s/.test(substituted[pos])) pos++; };
    const parseFactor = (): number => {
      skipWS();
      if (pos < len && substituted[pos] === '(') {
        pos++;
        const v = parseExpr();
        skipWS();
        if (pos < len && substituted[pos] === ')') pos++;
        return v;
      }
      if (pos < len && substituted[pos] === '-') {
        pos++;
        return -parseFactor();
      }
      const start = pos;
      while (pos < len && /[\d\.]/.test(substituted[pos])) pos++;
      const s = substituted.slice(start, pos);
      return s ? parseFloat(s) : 0;
    };
    const parseTerm = (): number => {
      let left = parseFactor();
      skipWS();
      while (pos < len && (substituted[pos] === '*' || substituted[pos] === '/')) {
        const op = substituted[pos++];
        const right = parseFactor();
        left = op === '*' ? left * right : (right !== 0 ? left / right : 0);
        skipWS();
      }
      return left;
    };
    const parseExpr = (): number => {
      let left = parseTerm();
      skipWS();
      while (pos < len && (substituted[pos] === '+' || substituted[pos] === '-')) {
        const op = substituted[pos++];
        left = op === '+' ? left + parseTerm() : left - parseTerm();
        skipWS();
      }
      return left;
    };
    try { return parseExpr(); } catch { return null; }
  }

  save() {
    if (this.saving()) return;
    const f = this.form();
    if (!f.nameEn?.trim() || !f.nameAr?.trim()) {
      this.error.set(this.label('يرجى تعبئة الاسم بالعربية والإنجليزية.', 'Please enter both Arabic and English names.'));
      return;
    }
    if (!this.editingId() && !f.code?.trim()) {
      this.error.set(this.label('يرجى تعبئة كود المكوّن.', 'Please enter the component code.'));
      return;
    }
    if (f.calculationType === 'formula' && !f.formulaExpression?.trim()) {
      this.error.set(this.label('يرجى تعبئة تعبير الصيغة.', 'Please enter the formula expression.'));
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const payload: any = {
      nameAr: f.nameAr,
      nameEn: f.nameEn,
      componentType: f.componentType,
      calculationType: f.calculationType,
      defaultValue: String(f.defaultValue ?? '0'),
      formulaExpression: f.calculationType === 'formula' ? (f.formulaExpression || null) : null,
      percentageBase: f.calculationType === 'percentage' ? (f.percentageBase || 'basic') : null,
      isTaxable: f.isTaxable,
      isSscApplicable: f.isSscApplicable,
      isRecurring: f.isRecurring,
      isActive: f.isActive,
      sortOrder: +f.sortOrder,
    };
    const id = this.editingId();
    if (!id) payload['code'] = f.code.toUpperCase();
    const req = id
      ? this.api.put<any>(`/api/salary-components/${id}`, payload)
      : this.api.post<any>('/api/salary-components', payload);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeModal();
        this.toast.success(this.label('تم الحفظ بنجاح', 'Saved successfully'));
        this.load();
      },
      error: e => {
        this.saving.set(false);
        this.error.set(getErrorMessage(e, this.label('حدث خطأ', 'An error occurred')));
      }
    });
  }

  confirmDelete(id: number) { this.confirmDeleteId.set(id); }

  submitDelete() {
    const id = this.confirmDeleteId();
    if (!id) return;
    this.api.delete<any>(`/api/salary-components/${id}`).subscribe({
      next: () => {
        this.confirmDeleteId.set(null);
        this.toast.success(this.label('تم إلغاء التفعيل', 'Deactivated'));
        this.load();
      },
      error: e => {
        this.confirmDeleteId.set(null);
        const msg = getErrorMessage(e, 'Failed');
        this.toast.error(msg);
      }
    });
  }

  typeLabel(t: string) {
    const map: Record<string, { ar: string; en: string }> = {
      earning:   { ar: 'استحقاق', en: 'Earning' },
      deduction: { ar: 'استقطاع', en: 'Deduction' },
    };
    return this.lang === 'ar' ? (map[t]?.ar ?? t) : (map[t]?.en ?? t);
  }

  calcTypeLabel(t: string) {
    const map: Record<string, { ar: string; en: string }> = {
      fixed:      { ar: 'مبلغ ثابت',     en: 'Fixed Amount' },
      percentage: { ar: 'نسبة مئوية',    en: 'Percentage' },
      formula:    { ar: 'صيغة حسابية',   en: 'Formula' },
    };
    return this.lang === 'ar' ? (map[t]?.ar ?? t) : (map[t]?.en ?? t);
  }

  defaultValDisplay(comp: SalaryComponent): string {
    if (comp.calculationType === 'fixed') return `${parseFloat(comp.defaultValue).toFixed(3)} JOD`;
    if (comp.calculationType === 'percentage') return `${comp.defaultValue}%`;
    return comp.formulaExpression ?? '—';
  }

  boolLabel(v: boolean) { return this.lang === 'ar' ? (v ? 'نعم' : 'لا') : (v ? 'Yes' : 'No'); }
}
