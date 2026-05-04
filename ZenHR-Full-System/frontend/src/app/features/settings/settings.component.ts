import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { forkJoin, catchError, of } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { AppSettingsService } from '../../core/services/app-settings.service';
import { BrandingService } from '../../core/services/branding.service';
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

type BrandingValues = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string;
};

const BRANDING_DEFAULT: BrandingValues = {
  primaryColor:   '#2d9e6b',
  secondaryColor: '#475569',
  accentColor:    '#52d9a0',
  logoUrl:        '',
};

const TEXTAREA_KEYS = new Set(['income_tax_brackets']);

const NUMERIC_KEYS = new Set([
  'working_hours_per_day', 'working_days_per_week',
  'overtime_rate_weekday', 'overtime_rate_weekend',
  'income_tax_exempt_annual', 'ssc_employee_rate', 'ssc_employer_rate',
  'ssc_insurable_salary_cap', 'probation_period_months', 'notice_period_days',
  'annual_leave_days', 'sick_leave_days', 'compliance_warning_days',
]);

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
  configs  = signal<ConfigItem[]>([]);
  loading  = signal(true);
  saving   = signal(false);
  successMsg = signal('');
  errorMsg   = signal('');
  activeCategory = signal('payroll');

  editValues     = signal<Record<string, string>>({});
  originalValues: Record<string, string> = {};

  // ── Branding state ────────────────────────────────────────────────────────
  brandingValues   = signal<BrandingValues>({ ...BRANDING_DEFAULT });
  brandingOriginal: BrandingValues = { ...BRANDING_DEFAULT };
  uploadingLogo    = signal(false);
  logoUploadError  = signal('');
  logoPreviewUrl   = signal('');
  generatedPalette = signal<{ primaryColor: string; secondaryColor: string; accentColor: string } | null>(null);

  categories = [
    { key: 'general',       labelAr: 'الإعدادات العامة',         labelEn: 'General',          icon: 'domain' },
    { key: 'attendance',    labelAr: 'الحضور والدوام',            labelEn: 'Attendance',        icon: 'schedule' },
    { key: 'payroll',       labelAr: 'الرواتب وضريبة الدخل',     labelEn: 'Payroll',           icon: 'payments' },
    { key: 'hr',            labelAr: 'الموارد البشرية',           labelEn: 'HR',                icon: 'groups' },
    { key: 'leave',         labelAr: 'سياسات الإجازات',           labelEn: 'Leave Policies',    icon: 'event_available' },
    { key: 'compliance',    labelAr: 'الامتثال',                  labelEn: 'Compliance',        icon: 'verified_user' },
    { key: 'notifications', labelAr: 'الإشعارات',                 labelEn: 'Notifications',     icon: 'notifications' },
    { key: 'branding',      labelAr: 'الهوية البصرية',            labelEn: 'Branding',          icon: 'palette' },
  ];

  filteredConfigs = computed(() =>
    this.configs().filter(c => (c.category ?? 'general') === this.activeCategory())
  );

  hasChanges = computed(() => {
    const vals = this.editValues();
    for (const [key, value] of Object.entries(vals)) {
      if (value !== this.originalValues[key]) return true;
    }
    const b = this.brandingValues();
    if (b.primaryColor   !== this.brandingOriginal.primaryColor)   return true;
    if (b.secondaryColor !== this.brandingOriginal.secondaryColor) return true;
    if (b.accentColor    !== this.brandingOriginal.accentColor)    return true;
    return false;
  });

  brandingDark  = computed(() => this.brandingService.darken(this.brandingValues().primaryColor, 0.5));
  brandingLight = computed(() => this.brandingService.lighten(this.brandingValues().primaryColor, 0.42));

  constructor(
    public  auth:            AuthService,
    private api:             ApiService,
    private http:            HttpClient,
    private toast:           ToastService,
    private settings:        AppSettingsService,
    public  brandingService: BrandingService,
  ) {}

  get lang() { return this.auth.lang; }

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.errorMsg.set('');

    forkJoin({
      configs:  this.api.get<any>('/api/config/catalog'),
      branding: this.api.get<any>('/api/branding').pipe(catchError(() => of({ success: false }))),
    }).subscribe({
      next: ({ configs, branding }) => {
        const groups = configs.data || [];
        const flat   = groups.flatMap((g: any) => g.items ?? []);
        this.configs.set(flat);
        const values: Record<string, string> = {};
        flat.forEach((c: ConfigItem) => { values[c.key] = c.value; });
        this.editValues.set({ ...values });
        this.originalValues = { ...values };

        if (branding?.success && branding.data) {
          const d = branding.data;
          const b: BrandingValues = {
            primaryColor:   d.primaryColor   ?? BRANDING_DEFAULT.primaryColor,
            secondaryColor: d.secondaryColor ?? BRANDING_DEFAULT.secondaryColor,
            accentColor:    d.accentColor    ?? BRANDING_DEFAULT.accentColor,
            logoUrl:        d.logoUrl        ?? '',
          };
          this.brandingValues.set(b);
          this.brandingOriginal = { ...b };
          this.logoPreviewUrl.set(d.logoUrl ?? '');
        }

        this.loading.set(false);
      },
      error: err => {
        this.loading.set(false);
        this.errorMsg.set(getErrorMessage(err, this.lang === 'ar' ? 'تعذر تحميل الإعدادات' : 'Unable to load settings'));
      },
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
    if (key === 'branding') return 4;
    return this.configs().filter(c => (c.category ?? 'general') === key).length;
  }

  categoryHasChanges(key: string) {
    if (key === 'branding') {
      const b = this.brandingValues();
      return b.primaryColor   !== this.brandingOriginal.primaryColor   ||
             b.secondaryColor !== this.brandingOriginal.secondaryColor ||
             b.accentColor    !== this.brandingOriginal.accentColor;
    }
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

  // ── Branding methods ──────────────────────────────────────────────────────

  setBrandingColor(field: keyof Omit<BrandingValues, 'logoUrl'>, value: string) {
    this.brandingValues.update(prev => ({ ...prev, [field]: value }));
    this.brandingService.applyToDocument(this.brandingValues());
  }

  onHexInput(field: keyof Omit<BrandingValues, 'logoUrl'>, value: string) {
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      this.setBrandingColor(field, value);
    }
  }

  onLogoUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      this.logoUploadError.set(this.lang === 'ar' ? 'حجم الملف يتجاوز 5 ميغابايت' : 'File exceeds 5 MB limit');
      input.value = '';
      return;
    }
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      this.logoUploadError.set(this.lang === 'ar' ? 'نوع الملف غير مدعوم. PNG أو JPG أو WEBP فقط' : 'Invalid type — PNG, JPG, WEBP only');
      input.value = '';
      return;
    }

    this.logoUploadError.set('');
    this.uploadingLogo.set(true);

    const fd = new FormData();
    fd.append('logo', file);

    this.http.post<any>('/api/branding/logo', fd).subscribe({
      next: r => {
        this.uploadingLogo.set(false);
        if (r?.success) {
          this.logoPreviewUrl.set(r.data.logoUrl);
          this.brandingValues.update(prev => ({ ...prev, logoUrl: r.data.logoUrl }));
          this.brandingOriginal = { ...this.brandingOriginal, logoUrl: r.data.logoUrl };
          if (r.data.palette) this.generatedPalette.set(r.data.palette);
          this.toast.success(this.lang === 'ar' ? 'تم رفع الشعار بنجاح' : 'Logo uploaded successfully');
        }
        input.value = '';
      },
      error: err => {
        this.uploadingLogo.set(false);
        this.logoUploadError.set(getErrorMessage(err, this.lang === 'ar' ? 'فشل رفع الشعار' : 'Logo upload failed'));
        input.value = '';
      },
    });
  }

  applyGeneratedPalette() {
    const p = this.generatedPalette();
    if (!p) return;
    this.brandingValues.update(prev => ({
      ...prev,
      primaryColor:   p.primaryColor,
      secondaryColor: p.secondaryColor,
      accentColor:    p.accentColor,
    }));
    this.brandingService.applyToDocument(this.brandingValues());
    this.generatedPalette.set(null);
  }

  // ── Save / Discard ────────────────────────────────────────────────────────

  saveAll() {
    if (this.saving() || !this.hasChanges()) return;
    if (this.activeCategory() === 'branding') {
      this.saveBranding();
    } else {
      this.saveConfigs();
    }
  }

  private saveBranding() {
    const b = this.brandingValues();
    this.saving.set(true);
    this.successMsg.set('');
    this.errorMsg.set('');

    this.api.patch<any>('/api/branding', {
      primaryColor:   b.primaryColor,
      secondaryColor: b.secondaryColor,
      accentColor:    b.accentColor,
    }).subscribe({
      next: () => {
        this.brandingOriginal = { ...b };
        this.brandingService.applyToDocument(b);
        this.saving.set(false);
        const msg = this.lang === 'ar' ? 'تم حفظ الهوية البصرية بنجاح' : 'Branding saved successfully';
        this.successMsg.set(msg);
        this.toast.success(msg);
        setTimeout(() => this.successMsg.set(''), 3000);
      },
      error: err => {
        this.saving.set(false);
        const msg = getErrorMessage(err, this.lang === 'ar' ? 'حدث خطأ أثناء حفظ الهوية البصرية' : 'Error saving branding');
        this.errorMsg.set(msg);
        this.toast.error(msg);
      },
    });
  }

  private saveConfigs() {
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
      },
    });
  }

  resetBranding() {
    this.saving.set(true);
    this.api.patch<any>('/api/branding', {
      primaryColor:   BRANDING_DEFAULT.primaryColor,
      secondaryColor: BRANDING_DEFAULT.secondaryColor,
      accentColor:    BRANDING_DEFAULT.accentColor,
      logoUrl:        '',
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.brandingValues.set({ ...BRANDING_DEFAULT });
        this.brandingOriginal = { ...BRANDING_DEFAULT };
        this.logoPreviewUrl.set('');
        this.generatedPalette.set(null);
        this.brandingService.resetToDefault();
        this.toast.success(this.lang === 'ar' ? 'تم إعادة تعيين المظهر للقيم الافتراضية' : 'Branding reset to defaults');
      },
      error: () => {
        this.saving.set(false);
        this.toast.error(this.lang === 'ar' ? 'فشل إعادة التعيين' : 'Reset failed');
      },
    });
  }

  discardChanges() {
    if (this.activeCategory() === 'branding') {
      this.brandingValues.set({ ...this.brandingOriginal });
      this.brandingService.applyToDocument(this.brandingOriginal);
      this.generatedPalette.set(null);
    } else {
      this.editValues.set({ ...this.originalValues });
    }
    this.errorMsg.set('');
    this.successMsg.set('');
  }
}
