import {
  Component, OnInit, OnDestroy, signal, computed,
  ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { debounceTime, Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ApiService } from '../../../core/services/api.service';
import { FormRendererComponent, DynamicFormDefinition } from '../form-renderer/form-renderer.component';
import { FORM_DEFINITIONS } from '../form-definitions';

@Component({
  selector: 'app-form-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule, FormRendererComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="fv-root" [class.print-mode]="printing">

  <!-- ─── TOOLBAR ─── -->
  <div class="fv-toolbar no-print">
    <button class="fv-btn-back" (click)="goBack()">
      <span class="material-icons">arrow_forward</span>
      {{ lang==='ar' ? 'العودة' : 'Back' }}
    </button>
    <div class="fv-title">{{ lang==='ar' ? formDef?.name_ar : (formDef?.name_en || formDef?.name_ar) }}</div>
    <div class="fv-actions">
      <button class="fv-btn" (click)="saveDraft()" [disabled]="saving()">
        <span class="material-icons">save</span>
        {{ saving() ? '...' : (lang==='ar' ? 'حفظ مسودة' : 'Save Draft') }}
      </button>
      <button class="fv-btn fv-btn-primary" (click)="submitForm()" [disabled]="saving()">
        <span class="material-icons">send</span>
        {{ lang==='ar' ? 'إرسال' : 'Submit' }}
      </button>
      <button class="fv-btn fv-btn-primary" (click)="printForm()">
        <span class="material-icons">print</span>
        {{ lang==='ar' ? 'طباعة' : 'Print' }}
      </button>
    </div>
  </div>

  <ng-container *ngIf="loaded(); else loadingState">
    <ng-container *ngIf="formDef; else notFound">
    <div class="fv-body">

      <!-- ─── RIGHT PANEL: INPUT FIELDS ─── -->
      <div class="fv-fields-panel no-print">
        <div class="fv-panel-head">
          <span class="material-icons">edit_note</span>
          {{ lang==='ar' ? 'بيانات النموذج' : 'Form Data' }}
        </div>
        <div class="fv-fields-scroll">
          <app-form-renderer
            [form]="formDef"
            [lang]="lang"
            [employees]="employees()"
            [disabledEmployeePicker]="role === 'employee'"
            [values]="values"
            (valuesChange)="onValuesChange($event)"
            (validChange)="isValid.set($event)">
          </app-form-renderer>
        </div>

        <!-- Bottom: save status -->
        <div class="fv-save-status" *ngIf="saveMsg()">
          <span class="material-icons fv-status-icon">check_circle</span>
          {{ saveMsg() }}
        </div>
      </div>

      <!-- ─── LEFT PANEL: DOCUMENT PREVIEW ─── -->
      <div class="fv-preview-panel">
        <div class="fv-panel-head no-print">
          <span class="material-icons">visibility</span>
          {{ lang==='ar' ? 'معاينة الوثيقة' : 'Document Preview' }}
        </div>
        <div class="fv-preview-scroll">
          <div class="a4-page" [innerHTML]="previewHtml()"></div>
        </div>
      </div>

    </div>
    </ng-container>
  </ng-container>

  <ng-template #loadingState>
    <div class="fv-not-found">
      <span class="material-icons fv-not-found-icon">hourglass_empty</span>
      <p>{{ lang==='ar' ? 'جاري تحميل النموذج...' : 'Loading form...' }}</p>
    </div>
  </ng-template>

  <ng-template #notFound>
    <div class="fv-not-found">
      <span class="material-icons fv-not-found-icon">description</span>
      <p>{{ lang==='ar' ? 'النموذج غير موجود' : 'Form not found' }}</p>
      <button class="fv-btn" (click)="goBack()">{{ lang==='ar' ? 'العودة' : 'Back' }}</button>
    </div>
  </ng-template>
</div>
`,
  styles: [`
:host { display:block; height:calc(100vh - 60px); overflow:hidden; }

.fv-root { display:flex; flex-direction:column; height:100%; background:#f4f6f8; direction:rtl; }

.fv-toolbar {
  display:flex; align-items:center; gap:12px; padding:10px 20px;
  background:#1e3a5f; color:#fff; flex-shrink:0; box-shadow:0 2px 8px rgba(0,0,0,.2);
}
.fv-btn-back { background:rgba(255,255,255,.15); border:none; color:#fff; padding:6px 14px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:4px; font-size:13px; transition:background .2s; }
.fv-btn-back:hover { background:rgba(255,255,255,.25); }
.fv-title { flex:1; font-size:16px; font-weight:700; text-align:center; }
.fv-actions { display:flex; gap:8px; }
.fv-btn { background:rgba(255,255,255,.15); border:1px solid rgba(255,255,255,.3); color:#fff; padding:7px 16px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:6px; font-size:13px; transition:all .2s; }
.fv-btn:hover { background:rgba(255,255,255,.25); }
.fv-btn:disabled { opacity:.5; cursor:not-allowed; }
.fv-btn-primary { background:#c49a2a; border-color:#c49a2a; }
.fv-btn-primary:hover { background:#b8891e; }

.fv-body { display:flex; flex:1; overflow:hidden; gap:0; }

/* ─── FIELDS PANEL (right in RTL) ─── */
.fv-fields-panel {
  width:340px; flex-shrink:0; background:#fff;
  border-left:1px solid #e8ecf0; display:flex; flex-direction:column;
  box-shadow:2px 0 8px rgba(0,0,0,.06);
}
.fv-panel-head {
  padding:12px 16px; border-bottom:1px solid #f0f0f0;
  font-size:13px; font-weight:700; color:#1e3a5f;
  display:flex; align-items:center; gap:6px; background:#f8f9fa;
}
.fv-fields-scroll { flex:1; overflow-y:auto; padding:12px 16px; }

.fv-field-group { margin-bottom:14px; }
.fv-label { display:block; font-size:12px; font-weight:600; color:#444; margin-bottom:4px; }
.fv-required { color:#e53e3e; margin-right:2px; }
.fv-hint { font-weight:400; color:#888; font-size:11px; }
.fv-input, .fv-select, .fv-textarea {
  width:100%; padding:7px 10px; border:1px solid #ddd; border-radius:6px;
  font-size:13px; font-family:inherit; box-sizing:border-box; transition:border-color .2s;
}
.fv-input:focus, .fv-select:focus, .fv-textarea:focus { border-color:#1e3a5f; outline:none; box-shadow:0 0 0 2px rgba(30,58,95,.1); }
.fv-textarea { resize:vertical; min-height:80px; }
.fv-separator { height:1px; background:#f0f0f0; margin:16px 0; }

.fv-emp-picker { position:relative; }
.emp-icon { position:absolute; top:50%; inset-inline-start:10px; transform:translateY(-50%); color:#1e3a5f; font-size:18px; }
.emp-preview-chip { margin-top:6px; padding:6px 10px; background:#f0f4ff; border-radius:6px; font-size:12px; color:#1e3a5f; }

.fv-save-status { padding:10px 16px; border-top:1px solid #f0f0f0; font-size:12px; color:#388e3c; display:flex; align-items:center; gap:4px; }
.fv-status-icon { font-size:16px; }

/* ─── PREVIEW PANEL (left in RTL) ─── */
.fv-preview-panel { flex:1; display:flex; flex-direction:column; overflow:hidden; }
.fv-preview-scroll { flex:1; overflow-y:auto; padding:24px; display:flex; justify-content:center; background:#e8ecf0; }

/* ─── A4 DOCUMENT ─── */
.a4-page {
  width:210mm; min-height:297mm; background:#fff;
  padding:20mm 18mm; box-shadow:0 4px 24px rgba(0,0,0,.15);
  font-family:'Segoe UI', Arial, sans-serif; direction:rtl; color:#1a1a2e;
  font-size:13px; line-height:1.7;
}

/* Inside the a4 page — injected HTML styles via global styles.scss */

.fv-not-found { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; color:#888; }
.fv-not-found-icon { font-size:64px; color:#ccc; }

/* ─── PRINT ─── */
@media print {
  .no-print { display:none !important; }
  .fv-root { height:auto; background:#fff; }
  .fv-body { display:block; }
  .fv-preview-panel { overflow:visible; }
  .fv-preview-scroll { padding:0; background:#fff; }
  .a4-page { box-shadow:none; width:100%; min-height:auto; margin:0; padding:15mm; }
}
  `]
})
export class FormViewerComponent implements OnInit, OnDestroy {
  formId: string | null = null;
  formDef: DynamicFormDefinition | null = null;
  values: Record<string, any> = {};
  employees = signal<any[]>([]);
  empData = signal<any>(null);
  saving = signal(false);
  saveMsg = signal('');
  recordId: number | null = null;
  printing = false;
  companyInfo: any = null;
  isValid = signal(true);
  loaded = signal(false);

  private destroy$ = new Subject<void>();
  private change$ = new Subject<void>();
  private autoSaveTimer: any = null;
  private lastAutoSavedJson = '';

  previewHtml = signal<SafeHtml>('');

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService,
    private api: ApiService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {}

  get lang() { return this.auth.lang; }
  get role() { return this.auth.currentUser()?.role ?? ''; }

  ngOnInit() {
    this.formId = this.route.snapshot.paramMap.get('formId');
    const formId = this.formId ?? '';
    this.recordId = Number(this.route.snapshot.queryParamMap.get('recordId')) || null;

    const bootstrap = () => {
      this.bootstrapForRole();
      this.loadCompanyInfo();
      this.loadExistingRecordIfAny();
      this.setupAutoSave();
      this.renderPreview();
      this.loaded.set(true);
      this.cdr.markForCheck();
    };

    const fail = () => {
      this.formDef = null;
      this.loaded.set(true);
      this.cdr.markForCheck();
    };

    // Try local FORM_DEFINITIONS first — they have full HTML templates.
    const localDef = FORM_DEFINITIONS.find(d => d.id === formId);
    if (localDef) {
      this.formDef = adaptLocalDef(localDef) as any;
      bootstrap();
      return;
    }

    // Fall back to API for catalog-only forms (no local renderer).
    const handle = (r: any) => {
      const data = r?.data ?? r;
      if (!data?.id) { fail(); return; }
      this.formDef = data;
      bootstrap();
    };

    this.api.get<any>(`/api/forms-catalog/${formId}`).subscribe({
      next: handle,
      error: fail,
    });
  }

  private bootstrapForRole() {
    if (!this.formDef) return;

    if (this.role === 'employee') {
      const currentUser = this.auth.currentUser();
      const employee = currentUser?.employee;
      const employeeId = Number(currentUser?.employeeId ?? employee?.id ?? 0);
      if (employeeId) {
        this.employees.set(employee ? [{ ...employee, id: employeeId }] : [{ id: employeeId }]);
        this.values['employeeId'] = String(employeeId);
        this.loadEmployeeData(employeeId);
      }
    } else {
      this.api.get<any>('/api/employees').subscribe({
        next: r => { this.employees.set(r.data || r || []); this.cdr.markForCheck(); },
        error: () => {}
      });
    }
  }

  private loadCompanyInfo() {
    this.api.get<any>('/api/forms/company-info').subscribe({
      next: r => { this.companyInfo = r.data; this.renderPreview(); this.cdr.markForCheck(); },
      error: () => this.renderPreview()
    });
  }

  private loadExistingRecordIfAny() {
    if (!this.recordId) {
      this.restoreLocalDraft();
      this.setupChangeReRender();
      return;
    }

    this.api.get<any>(`/api/forms/${this.recordId}`).subscribe({
      next: r => {
        const rec = r.data;
        try { this.values = JSON.parse(rec.dataJson || '{}'); } catch { this.values = {}; }
        if (rec.employeeId) this.loadEmployeeData(rec.employeeId);
        this.restoreLocalDraft(); // local draft can still override missing fields
        this.setupChangeReRender();
        this.renderPreview();
        this.cdr.markForCheck();
      },
      error: () => {
        this.restoreLocalDraft();
        this.setupChangeReRender();
      }
    });
  }

  private setupChangeReRender() {
    this.change$.pipe(debounceTime(200), takeUntil(this.destroy$)).subscribe(() => this.renderPreview());
  }

  private setupAutoSave() {
    if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);
    this.autoSaveTimer = setInterval(() => this.autoSaveDraftTick(), 10_000);
  }

  private draftKey() {
    const formId = this.route.snapshot.paramMap.get('formId') ?? '';
    return `zenjo:draft:${formId}`;
  }

  private restoreLocalDraft() {
    try {
      const raw = localStorage.getItem(this.draftKey());
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.values) {
        this.values = { ...this.values, ...parsed.values };
        if (parsed.values.employeeId) this.loadEmployeeData(Number(parsed.values.employeeId));
      }
    } catch {}
  }

  private autoSaveDraftTick() {
    if (!this.formDef) return;
    const dataJson = JSON.stringify(this.values || {});
    if (dataJson === this.lastAutoSavedJson) return;
    this.lastAutoSavedJson = dataJson;

    // local draft (per formId)
    try {
      localStorage.setItem(this.draftKey(), JSON.stringify({ values: this.values, updatedAt: new Date().toISOString() }));
    } catch {}

    // server draft if record already exists (keeps traffic low)
    if (this.recordId) {
      this.api.put<any>(`/api/forms/${this.recordId}`, {
        formType: this.formDef.id,
        employeeId: this.values?.['employeeId'] ? Number(this.values['employeeId']) : null,
        dataJson,
        status: 'draft',
        notes: null
      }).subscribe({ next: () => {}, error: () => {} });
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);
  }

  onValuesChange(v: Record<string, any>) {
    const prevEmp = this.values?.['employeeId'];
    this.values = v;
    if (v?.['employeeId'] && v['employeeId'] !== prevEmp) this.loadEmployeeData(Number(v['employeeId']));
    this.change$.next();
  }

  loadEmployeeData(id: number) {
    this.api.get<any>(`/api/forms/employee-data/${id}`).subscribe({
      next: r => {
        this.empData.set(r.data);
        this.renderPreview();
        this.cdr.markForCheck();
      },
      error: () => {}
    });
  }

  renderPreview() {
    if (!this.formDef) return;
    try {
      let html: string;
      const def = this.formDef as any;
      if (typeof def.getTemplate === 'function') {
        html = def.getTemplate(this.values || {}, this.empData(), this.companyInfo);
      } else {
        html = renderTemplateToHtml(def.template || '', {
          ...this.values,
          employee: this.empData(),
          company: this.companyInfo,
        });
      }
      this.previewHtml.set(this.sanitizer.bypassSecurityTrustHtml(html));
    } catch {
      this.previewHtml.set(this.sanitizer.bypassSecurityTrustHtml('<p>خطأ في المعاينة</p>'));
    }
    this.cdr.markForCheck();
  }

  saveDraft() {
    if (!this.formDef) return;
    if (!this.isValid()) return;
    this.saving.set(true);
    const payload = {
      formId: this.formDef.id,
      employeeId: this.values?.['employeeId'] ? Number(this.values['employeeId']) : null,
      dataJson: JSON.stringify(this.values || {}),
      status: 'draft',
      notes: null
    };

    const req$ = this.api.post<any>('/api/form-submissions', payload);

    req$.subscribe({
      next: r => {
        if (r.data?.id) this.recordId = r.data.id;
        this.saving.set(false);
        this.saveMsg.set(this.lang === 'ar' ? 'تم الحفظ بنجاح' : 'Saved');
        setTimeout(() => this.saveMsg.set(''), 3000);
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving.set(false);
        this.cdr.markForCheck();
      }
    });
  }

  submitForm() {
    if (!this.formDef) return;
    if (!this.isValid()) return;
    this.saving.set(true);
    const payload = {
      formId: this.formDef.id,
      employeeId: this.values?.['employeeId'] ? Number(this.values['employeeId']) : null,
      dataJson: JSON.stringify(this.values || {}),
      status: 'submitted',
      notes: null
    };
    this.api.post<any>('/api/form-submissions', payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.saveMsg.set(this.lang === 'ar' ? 'تم الإرسال' : 'Submitted');
        setTimeout(() => this.saveMsg.set(''), 3000);
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving.set(false);
        this.cdr.markForCheck();
      }
    });
  }

  printForm() {
    window.print();
  }

  goBack() {
    this.router.navigate(['/app/forms']);
  }
}

function adaptLocalDef(def: any): DynamicFormDefinition {
  return {
    id: def.id,
    name_ar: def.nameAr ?? def.name_ar ?? '',
    name_en: def.nameEn ?? def.name_en ?? '',
    category: def.category ?? '',
    fields: (def.fields || [])
      .filter((f: any) => f.type !== 'separator')
      .map((f: any) => ({
        key: f.id,
        label_ar: f.labelAr ?? f.label_ar ?? '',
        label_en: f.labelEn ?? f.label_en ?? '',
        type: f.type,
        required: !!f.required,
        options: f.options
          ? f.options.map((o: any) => ({
              value: o.value,
              label_ar: o.labelAr ?? o.label_ar ?? o.value,
              label_en: o.labelEn ?? o.label_en ?? o.labelAr ?? o.value,
            }))
          : null,
      })),
    template: '',
    getTemplate: def.getTemplate,
  } as any;
}

function getByPath(obj: any, path: string): any {
  if (!obj) return '';
  return path.split('.').reduce((acc, part) => (acc != null ? acc[part] : undefined), obj);
}

function escapeHtml(v: any): string {
  const s = String(v ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderTemplateToHtml(template: string, ctx: any): string {
  // Replace {{path}} with escaped values; keep it safe for innerHTML.
  const replaced = (template || '').replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, p1) => {
    const val = getByPath(ctx, p1);
    return escapeHtml(val ?? '');
  });
  // Simple document formatting: newlines become <br>.
  return `<div style="white-space:pre-wrap">${replaced}</div>`;
}
