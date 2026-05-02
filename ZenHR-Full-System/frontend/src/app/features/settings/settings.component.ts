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
  editValues: Record<string, string> = {};

  categories = [
    { key: 'general', labelAr: 'الإعدادات العامة', labelEn: 'General', icon: 'domain' },
    { key: 'attendance', labelAr: 'الحضور والدوام', labelEn: 'Attendance', icon: 'schedule' },
    { key: 'payroll', labelAr: 'الرواتب وضريبة الدخل', labelEn: 'Payroll', icon: 'payments' },
    { key: 'hr', labelAr: 'الموارد البشرية', labelEn: 'HR', icon: 'groups' },
    { key: 'leave', labelAr: 'سياسات الإجازات', labelEn: 'Leave Policies', icon: 'event_available' },
    { key: 'compliance', labelAr: 'الامتثال', labelEn: 'Compliance', icon: 'verified_user' },
    { key: 'notifications', labelAr: 'الإشعارات', labelEn: 'Notifications', icon: 'notifications' }
  ];

  filteredConfigs = computed(() =>
    this.configs().filter(c => (c.category ?? 'general') === this.activeCategory())
  );

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private toast: ToastService,
    private settings: AppSettingsService
  ) {}

  get lang() {
    return this.auth.lang;
  }

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.errorMsg.set('');
    this.api.get<any>('/api/config/catalog').subscribe({
      next: r => {
        const groups = r.data || [];
        const flat = groups.flatMap((g: any) => g.items ?? []);
        this.configs.set(flat);
        this.editValues = {};
        flat.forEach((c: ConfigItem) => {
          this.editValues[c.key] = c.value;
        });
        this.loading.set(false);
      },
      error: error => {
        this.loading.set(false);
        this.errorMsg.set(getErrorMessage(error, this.lang === 'ar' ? 'تعذر تحميل الإعدادات' : 'Unable to load settings'));
      }
    });
  }

  fieldLabel(cfg: ConfigItem) {
    return this.lang === 'ar' ? (cfg.descriptionAr || cfg.key) : (cfg.descriptionEn || cfg.key);
  }

  isBoolean(cfg: ConfigItem) {
    return cfg.dataType === 'boolean';
  }

  isLongText(cfg: ConfigItem) {
    return cfg.dataType === 'string' && (this.editValues[cfg.key]?.length ?? 0) > 40;
  }

  categoryCount(key: string) {
    return this.configs().filter(c => (c.category ?? 'general') === key).length;
  }

  currentCategoryLabel() {
    const current = this.categories.find(c => c.key === this.activeCategory());
    return this.lang === 'ar' ? current?.labelAr : current?.labelEn;
  }

  setBooleanValue(key: string, checked: boolean) {
    this.editValues[key] = checked ? 'true' : 'false';
  }

  saveAll() {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.successMsg.set('');
    this.errorMsg.set('');

    this.api.patch<any>('/api/config/bulk', { updates: { ...this.editValues } }).subscribe({
      next: async () => {
        await this.settings.refresh();
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
}
