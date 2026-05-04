import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { AppSettingsService } from '../../core/services/app-settings.service';
import { getErrorMessage } from '../../core/utils/error-message';

type ConfigItem = {
  key: string;
  value: string;
  category?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  dataType?: string;
  isEditable?: boolean;
};

// Keys that render as a textarea (long JSON content)
const TEXTAREA_KEYS = new Set(['income_tax_brackets']);

// Keys whose values are numeric — rendered with type="number"
const NUMERIC_KEYS = new Set([
  'working_hours_per_day', 'working_days_per_week',
  'overtime_rate_weekday', 'overtime_rate_weekend',
  'income_tax_exempt_annual', 'ssc_employee_rate', 'ssc_employer_rate',
  'ssc_insurable_salary_cap', 'probation_period_months', 'notice_period_days',
  'annual_leave_days', 'sick_leave_days', 'compliance_warning_days',
]);

// Subset of numeric keys that must be whole numbers (step=1)
const INTEGER_KEYS = new Set([
  'working_hours_per_day', 'working_days_per_week', 'probation_period_months',
  'notice_period_days', 'annual_leave_days', 'sick_leave_days', 'compliance_warning_days',
]);

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsComponent implements OnInit {
  configs = signal<ConfigItem[]>([]);
  loading = signal(true);
  saving = signal(false);
  successMsg = signal('');
  errorMsg = signal('');
  activeCategory = signal('payroll');

  // Signal-backed edit map so computed() reacts to changes
  editValues = signal<Record<string, string>>({});
  // Original (last-saved) values for dirty tracking
  originalValues: Record<string, string> = {};

  categories = [
    { key: 'general',       labelAr: 'الإعدادات العامة',         labelEn: 'General',        icon: 'domain' },
    { key: 'attendance',    labelAr: 'الحضور والدوام',            labelEn: 'Attendance',      icon: 'schedule' },
    { key: 'payroll',       labelAr: 'الرواتب وضريبة الدخل',     labelEn: 'Payroll',         icon: 'payments' },
    { key: 'hr',            labelAr: 'الموارد البشرية',           labelEn: 'HR',              icon: 'groups' },
    { key: 'leave',         labelAr: 'سياسات الإجازات',           labelEn: 'Leave Policies',  icon: 'event_available' },
    { key: 'compliance',    labelAr: 'الامتثال',                  labelEn: 'Compliance',      icon: 'verified_user' },
    { key: 'notifications', labelAr: 'الإشعارات',                 labelEn: 'Notifications',   icon: 'notifications' },
  ];

  filteredConfigs = computed(() =>
    this.configs().filter(c => (c.category ?? 'general') === this.activeCategory())
  );

  // True only when at least one field differs from the last-saved state
  hasChanges = computed(() => {
    const vals = this.editValues();
    for (const [key, value] of Object.entries(vals)) {
      if (value !== this.originalValues[key]) return true;
    }
    return false;
  });

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private toast: ToastService,
    private settings: AppSettingsService
  ) {}

  get lang() { return this.auth.lang; }

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.errorMsg.set('');
    this.api.get<any>('/api/config/catalog').subscribe({
      next: r => {
        const groups = r.data || [];
        const flat = groups.flatMap((g: any) => g.items ?? []);
        this.configs.set(flat);
        const values: Record<string, string> = {};
        flat.forEach((c: ConfigItem) => { values[c.key] = c.value; });
        this.editValues.set({ ...values });
        this.originalValues = { ...values };
        this.loading.set(false);
      },
      error: error => {
        this.loading.set(false);
        this.errorMsg.set(getErrorMessage(error, this.lang === 'ar' ? 'تعذر تحميل الإعدادات' : 'Unable to load settings'));
      }
    });
  }

  fieldLabel(cfg: ConfigItem) {
    return this.lang === 'ar'
      ? (cfg.descriptionAr || cfg.descriptionEn || cfg.key)
      : (cfg.descriptionEn || cfg.key);
  }

  isBoolean(cfg: ConfigItem) { return cfg.dataType === 'boolean'; }
  isNumeric(cfg: ConfigItem) { return NUMERIC_KEYS.has(cfg.key); }
  isInteger(cfg: ConfigItem) { return INTEGER_KEYS.has(cfg.key); }
  isTextarea(cfg: ConfigItem) { return TEXTAREA_KEYS.has(cfg.key); }

  isFieldChanged(key: string) {
    return this.editValues()[key] !== this.originalValues[key];
  }

  categoryCount(key: string) {
    return this.configs().filter(c => (c.category ?? 'general') === key).length;
  }

  categoryHasChanges(key: string) {
    const vals = this.editValues();
    return this.configs()
      .filter(c => (c.category ?? 'general') === key)
      .some(c => vals[c.key] !== this.originalValues[c.key]);
  }

  currentCategoryLabel() {
    const current = this.categories.find(c => c.key === this.activeCategory());
    return this.lang === 'ar' ? current?.labelAr : current?.labelEn;
  }

  setValue(key: string, value: string) {
    this.editValues.update(prev => ({ ...prev, [key]: value }));
  }

  setBooleanValue(key: string, checked: boolean) {
    this.setValue(key, checked ? 'true' : 'false');
  }

  saveAll() {
    if (this.saving() || !this.hasChanges()) return;

    // Send only changed keys — not the full map
    const changedUpdates: Record<string, string> = {};
    const vals = this.editValues();
    for (const [key, value] of Object.entries(vals)) {
      if (value !== this.originalValues[key]) changedUpdates[key] = value;
    }
    if (Object.keys(changedUpdates).length === 0) return;

    this.saving.set(true);
    this.successMsg.set('');
    this.errorMsg.set('');

    this.api.patch<any>('/api/config/bulk', { updates: changedUpdates }).subscribe({
      next: async () => {
        await this.settings.refresh();
        // Commit new baseline
        this.originalValues = { ...this.editValues() };
        this.saving.set(false);
        const message = this.lang === 'ar' ? 'تم حفظ الإعدادات بنجاح' : 'Settings saved successfully';
        this.successMsg.set(message);
        this.toast.success(message);
        setTimeout(() => this.successMsg.set(''), 3000);
      },
      error: error => {
        this.saving.set(false);
        const message = getErrorMessage(error, this.lang === 'ar' ? 'حدث خطأ أثناء الحفظ' : 'Error saving settings');
        this.errorMsg.set(message);
        this.toast.error(message);
      }
    });
  }

  discardChanges() {
    this.editValues.set({ ...this.originalValues });
    this.errorMsg.set('');
    this.successMsg.set('');
  }
}
