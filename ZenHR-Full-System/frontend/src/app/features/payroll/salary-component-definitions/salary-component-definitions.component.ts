import { ChangeDetectionStrategy, Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogComponent } from '../../../shared/components/ui/confirm-dialog.component';
import { getErrorMessage } from '../../../core/utils/error-message';

interface SalaryComponentDef {
  id: number;
  companyId: number;
  componentKey: string;
  nameAr: string;
  nameEn: string;
  componentType: 'fixed' | 'percentage';
  percentage: string | null;
  baseRef: string | null;
  isBasic: boolean;
  isInsurable: boolean;
  isTaxable: boolean;
  isDeduction: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

const BLANK_FORM = (): Partial<SalaryComponentDef> & { percentage: string; sortOrder: number } => ({
  componentKey: '',
  nameAr: '',
  nameEn: '',
  componentType: 'fixed',
  percentage: '',
  baseRef: 'basic_salary',
  isBasic: false,
  isInsurable: true,
  isTaxable: true,
  isDeduction: false,
  sortOrder: 0,
});

@Component({
  selector: 'app-salary-component-definitions',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent],
  templateUrl: './salary-component-definitions.component.html',
  styleUrl: './salary-component-definitions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SalaryComponentDefinitionsComponent implements OnInit {
  definitions = signal<SalaryComponentDef[]>([]);
  loading = signal(true);
  saving = signal(false);
  error = signal('');

  showModal = signal(false);
  editingId = signal<number | null>(null);
  confirmDeleteId = signal<number | null>(null);
  form = signal<ReturnType<typeof BLANK_FORM>>(BLANK_FORM());
  search = '';

  readonly filtered = computed(() => {
    const q = this.search.trim().toLowerCase();
    return this.definitions().filter(d =>
      !q || d.nameEn.toLowerCase().includes(q) || d.nameAr.includes(q) || d.componentKey.toLowerCase().includes(q)
    );
  });

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
    this.api.get<any>('/api/salary-components/definitions').subscribe({
      next: r => { this.definitions.set(r.data ?? []); this.loading.set(false); },
      error: e => { this.error.set(getErrorMessage(e, 'Failed to load')); this.loading.set(false); }
    });
  }

  openCreate() {
    this.editingId.set(null);
    this.form.set(BLANK_FORM());
    this.error.set('');
    this.showModal.set(true);
  }

  openEdit(def: SalaryComponentDef) {
    this.editingId.set(def.id);
    this.form.set({
      componentKey: def.componentKey,
      nameAr: def.nameAr,
      nameEn: def.nameEn,
      componentType: def.componentType,
      percentage: def.percentage ?? '',
      baseRef: def.baseRef ?? 'basic_salary',
      isBasic: def.isBasic,
      isInsurable: def.isInsurable,
      isTaxable: def.isTaxable,
      isDeduction: def.isDeduction,
      sortOrder: def.sortOrder,
    });
    this.error.set('');
    this.showModal.set(true);
  }

  closeModal() {
    if (this.saving()) return;
    this.showModal.set(false);
  }

  save() {
    if (this.saving()) return;
    const f = this.form();
    if (!f.componentKey?.trim() || !f.nameAr?.trim() || !f.nameEn?.trim()) {
      this.error.set(this.label('يرجى تعبئة جميع الحقول المطلوبة.', 'Please fill in all required fields.'));
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const payload = {
      ...f,
      percentage: f.componentType === 'percentage' && f.percentage ? f.percentage : null,
    };

    const id = this.editingId();
    const req = id
      ? this.api.patch<any>(`/api/salary-components/definitions/${id}`, payload)
      : this.api.post<any>('/api/salary-components/definitions', payload);

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
    this.api.delete<any>(`/api/salary-components/definitions/${id}`).subscribe({
      next: () => {
        this.confirmDeleteId.set(null);
        this.toast.success(this.label('تم إلغاء التفعيل', 'Deactivated'));
        this.load();
      },
      error: e => this.toast.error(getErrorMessage(e, 'Failed'))
    });
  }

  typeLabel(t: string) {
    const map: Record<string, { ar: string; en: string }> = {
      fixed:      { ar: 'ثابت',   en: 'Fixed' },
      percentage: { ar: 'نسبة مئوية', en: 'Percentage' },
    };
    return this.lang === 'ar' ? (map[t]?.ar ?? t) : (map[t]?.en ?? t);
  }

  boolLabel(v: boolean) { return this.lang === 'ar' ? (v ? 'نعم' : 'لا') : (v ? 'Yes' : 'No'); }

  get f() { return this.form(); }
  patchForm(patch: Partial<ReturnType<typeof BLANK_FORM>>) {
    this.form.update(cur => ({ ...cur, ...patch }));
  }
}
