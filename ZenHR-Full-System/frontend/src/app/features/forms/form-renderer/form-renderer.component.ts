import { Component, EventEmitter, Input, Output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export type DynamicFieldType = 'text' | 'textarea' | 'date' | 'select' | 'number' | 'employee';

export interface DynamicFormOption {
  value: string;
  label_ar: string;
  label_en: string;
}

export interface DynamicFormField {
  key: string;
  label_ar: string;
  label_en: string;
  type: DynamicFieldType | string;
  required?: boolean;
  options?: DynamicFormOption[] | null;
}

export interface DynamicFormDefinition {
  id: string;
  name_ar: string;
  name_en: string;
  category: string;
  fields: DynamicFormField[];
  template: string;
}

@Component({
  selector: 'app-form-renderer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="fr">
    <ng-container *ngFor="let field of form?.fields || []">
      <div class="fr-field">
        <label class="fr-label">
          {{ lang === 'ar' ? field.label_ar : (field.label_en || field.label_ar) }}
          <span *ngIf="field.required" class="fr-req">*</span>
        </label>

        <!-- Employee -->
        <select *ngIf="field.type === 'employee'" class="fr-input"
          [(ngModel)]="values[field.key]"
          (ngModelChange)="emitChange()"
          [disabled]="disabledEmployeePicker">
          <option value="">{{ lang === 'ar' ? '-- اختر --' : '-- Select --' }}</option>
          <option *ngFor="let e of employees" [value]="e.id">
            {{ e.firstNameAr }} {{ e.lastNameAr }} — {{ e.employeeCode }}
          </option>
        </select>

        <!-- Select -->
        <select *ngIf="field.type === 'select'" class="fr-input"
          [(ngModel)]="values[field.key]" (ngModelChange)="emitChange()">
          <option value="">{{ lang === 'ar' ? '-- اختر --' : '-- Select --' }}</option>
          <option *ngFor="let opt of (field.options || [])" [value]="opt.value">
            {{ lang === 'ar' ? opt.label_ar : (opt.label_en || opt.label_ar) }}
          </option>
        </select>

        <!-- Date -->
        <input *ngIf="field.type === 'date'" class="fr-input" type="date"
          [(ngModel)]="values[field.key]" (ngModelChange)="emitChange()">

        <!-- Number -->
        <input *ngIf="field.type === 'number'" class="fr-input" type="number"
          [(ngModel)]="values[field.key]" (ngModelChange)="emitChange()">

        <!-- Text -->
        <input *ngIf="field.type === 'text'" class="fr-input" type="text"
          [(ngModel)]="values[field.key]" (ngModelChange)="emitChange()">

        <!-- Textarea -->
        <textarea *ngIf="field.type === 'textarea'" class="fr-input fr-textarea" rows="3"
          [(ngModel)]="values[field.key]" (ngModelChange)="emitChange()"></textarea>

        <div *ngIf="errors()[field.key]" class="fr-err">{{ errors()[field.key] }}</div>
      </div>
    </ng-container>
  </div>
  `,
  styles: [`
    .fr { display:flex; flex-direction:column; gap: 12px; }
    .fr-field { display:flex; flex-direction:column; gap: 6px; }
    .fr-label { font-size:12px; font-weight:600; color:#374151; }
    .fr-req { color:#dc2626; margin-inline-start:4px; }
    .fr-input { width:100%; border:1px solid #e5e7eb; border-radius:8px; padding:8px 10px; font-size:13px; }
    .fr-input:focus { outline:none; border-color:#16a34a; box-shadow:0 0 0 2px rgba(22,163,74,.12); }
    .fr-textarea { resize:vertical; }
    .fr-err { font-size:12px; color:#dc2626; }
  `]
})
export class FormRendererComponent {
  @Input() form: DynamicFormDefinition | null = null;
  @Input() lang: 'ar' | 'en' = 'ar';
  @Input() employees: any[] = [];
  @Input() disabledEmployeePicker = false;
  @Input() values: Record<string, any> = {};

  @Output() valuesChange = new EventEmitter<Record<string, any>>();
  @Output() validChange = new EventEmitter<boolean>();

  private _errors = signal<Record<string, string>>({});
  errors = computed(() => this._errors());

  validate(): boolean {
    const errs: Record<string, string> = {};
    const fields = this.form?.fields || [];
    for (const f of fields) {
      if (!f.required) continue;
      const v = this.values?.[f.key];
      if (v == null || v === '') {
        errs[f.key] = this.lang === 'ar' ? 'هذا الحقل مطلوب' : 'Required';
      }
    }
    this._errors.set(errs);
    const ok = Object.keys(errs).length === 0;
    this.validChange.emit(ok);
    return ok;
  }

  emitChange() {
    // Keep validation lightweight; validate required fields only.
    this.validate();
    this.valuesChange.emit({ ...this.values });
  }
}

