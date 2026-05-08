import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { debounceTime, finalize, Subject } from 'rxjs';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';

type ApiResponse<T> = { success: boolean; data: T; meta?: { total: number; page: number; pageSize: number }; message?: string };
type FieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'json-list';

interface MasterField {
  key: string;
  labelAr: string;
  labelEn: string;
  type: FieldType;
  required?: boolean;
  module?: string;
  full?: boolean;
}

interface MasterModule {
  route: string;
  icon: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  fields: MasterField[];
  defaultSort: string;
}

interface MasterRecord {
  id: number;
  code: string;
  name_ar: string;
  name_en: string;
  description_ar?: string | null;
  description_en?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

const ACTIVE_FIELD: MasterField = { key: 'isActive', labelAr: 'نشط', labelEn: 'Active', type: 'boolean' };

const COMMON_FIELDS: MasterField[] = [
  { key: 'code', labelAr: 'الكود', labelEn: 'Code', type: 'text', required: true },
  { key: 'nameAr', labelAr: 'الاسم العربي', labelEn: 'Arabic name', type: 'text', required: true },
  { key: 'nameEn', labelAr: 'الاسم الإنجليزي', labelEn: 'English name', type: 'text', required: true },
  { key: 'descriptionAr', labelAr: 'الوصف العربي', labelEn: 'Arabic description', type: 'textarea', full: true },
  { key: 'descriptionEn', labelAr: 'الوصف الإنجليزي', labelEn: 'English description', type: 'textarea', full: true },
  ACTIVE_FIELD,
];

const MODULES: MasterModule[] = [
  {
    route: 'responsibility-groups',
    icon: 'category',
    titleAr: 'مجموعات المسؤوليات',
    titleEn: 'Responsibility Groups',
    descriptionAr: 'تصنيف المسؤوليات القابلة لإعادة الاستخدام في الوصف الوظيفي والمسارات.',
    descriptionEn: 'Classify reusable responsibilities for job descriptions and paths.',
    defaultSort: 'name_en',
    fields: COMMON_FIELDS,
  },
  {
    route: 'responsibilities',
    icon: 'task_alt',
    titleAr: 'المسؤوليات',
    titleEn: 'Responsibilities',
    descriptionAr: 'مسؤوليات قابلة لإعادة الاستخدام مع ترتيب وأولوية.',
    descriptionEn: 'Reusable responsibilities with grouping and priority.',
    defaultSort: 'priority_order',
    fields: [
      { key: 'responsibilityGroupId', labelAr: 'مجموعة المسؤوليات', labelEn: 'Responsibility group', type: 'select', required: true, module: 'responsibility-groups' },
      ...COMMON_FIELDS.slice(0, 5),
      { key: 'priorityOrder', labelAr: 'الترتيب', labelEn: 'Order', type: 'number' },
      ACTIVE_FIELD,
    ],
  },
  {
    route: 'job-grades',
    icon: 'military_tech',
    titleAr: 'الدرجات الوظيفية',
    titleEn: 'Job Grades',
    descriptionAr: 'درجات وظيفية مع نطاقات رواتب وترتيب مستويات.',
    descriptionEn: 'Job grades with salary bands and level ordering.',
    defaultSort: 'level_order',
    fields: [
      COMMON_FIELDS[0],
      { key: 'gradeCode', labelAr: 'رمز الدرجة', labelEn: 'Grade code', type: 'text', required: true },
      ...COMMON_FIELDS.slice(1, 5),
      { key: 'salaryBandMin', labelAr: 'الحد الأدنى للراتب', labelEn: 'Salary min', type: 'number' },
      { key: 'salaryBandMax', labelAr: 'الحد الأعلى للراتب', labelEn: 'Salary max', type: 'number' },
      { key: 'levelOrder', labelAr: 'ترتيب المستوى', labelEn: 'Level order', type: 'number' },
      ACTIVE_FIELD,
    ],
  },
  {
    route: 'educational-qualifications',
    icon: 'school',
    titleAr: 'المؤهلات العلمية',
    titleEn: 'Educational Qualifications',
    descriptionAr: 'درجات ومؤهلات تعليمية قابلة للربط بالملفات والتوظيف.',
    descriptionEn: 'Education qualifications for profiles and recruiting.',
    defaultSort: 'level_order',
    fields: [...COMMON_FIELDS.slice(0, 5), { key: 'levelOrder', labelAr: 'ترتيب المستوى', labelEn: 'Level order', type: 'number' }, ACTIVE_FIELD],
  },
  {
    route: 'specializations',
    icon: 'hub',
    titleAr: 'التخصصات',
    titleEn: 'Specializations',
    descriptionAr: 'تخصصات أكاديمية ومهنية للترشيح والتقييم.',
    descriptionEn: 'Academic and professional specializations.',
    defaultSort: 'name_en',
    fields: COMMON_FIELDS,
  },
  {
    route: 'universities',
    icon: 'account_balance',
    titleAr: 'الجامعات',
    titleEn: 'Universities',
    descriptionAr: 'جامعات ومعاهد مع الدولة والمدينة.',
    descriptionEn: 'Universities and institutes with country and city.',
    defaultSort: 'name_en',
    fields: [...COMMON_FIELDS.slice(0, 5), { key: 'country', labelAr: 'الدولة', labelEn: 'Country', type: 'text' }, { key: 'city', labelAr: 'المدينة', labelEn: 'City', type: 'text' }, ACTIVE_FIELD],
  },
  {
    route: 'training-courses',
    icon: 'workspace_premium',
    titleAr: 'الدورات التدريبية',
    titleEn: 'Training Courses',
    descriptionAr: 'دورات تدريبية مع الجهة المقدمة وعدد الساعات.',
    descriptionEn: 'Training courses with provider and duration.',
    defaultSort: 'name_en',
    fields: [...COMMON_FIELDS.slice(0, 5), { key: 'providerAr', labelAr: 'الجهة بالعربية', labelEn: 'Provider AR', type: 'text' }, { key: 'providerEn', labelAr: 'الجهة بالإنجليزية', labelEn: 'Provider EN', type: 'text' }, { key: 'durationHours', labelAr: 'عدد الساعات', labelEn: 'Duration hours', type: 'number' }, ACTIVE_FIELD],
  },
  {
    route: 'skills',
    icon: 'psychology',
    titleAr: 'المهارات',
    titleEn: 'Skills',
    descriptionAr: 'مهارات فنية وسلوكية قابلة للاستخدام في التوظيف والتقييم.',
    descriptionEn: 'Technical and behavioral skills for hiring and evaluation.',
    defaultSort: 'name_en',
    fields: [...COMMON_FIELDS.slice(0, 5), { key: 'skillCategory', labelAr: 'تصنيف المهارة', labelEn: 'Skill category', type: 'text' }, ACTIVE_FIELD],
  },
  {
    route: 'languages',
    icon: 'translate',
    titleAr: 'اللغات',
    titleEn: 'Languages',
    descriptionAr: 'لغات ومستويات إتقان مع دعم اتجاه الكتابة.',
    descriptionEn: 'Languages and proficiency levels with RTL support.',
    defaultSort: 'name_en',
    fields: [...COMMON_FIELDS.slice(0, 5), { key: 'proficiencyLevels', labelAr: 'مستويات الإتقان', labelEn: 'Proficiency levels', type: 'json-list', full: true }, { key: 'isRtl', labelAr: 'لغة من اليمين لليسار', labelEn: 'RTL language', type: 'boolean' }, ACTIVE_FIELD],
  },
  {
    route: 'experience-levels',
    icon: 'timeline',
    titleAr: 'مستويات الخبرة',
    titleEn: 'Experience Levels',
    descriptionAr: 'شرائح خبرة مثل 0-1 و2-4 و10+ سنوات.',
    descriptionEn: 'Experience bands such as 0-1, 2-4, and 10+ years.',
    defaultSort: 'level_order',
    fields: [...COMMON_FIELDS.slice(0, 5), { key: 'minYears', labelAr: 'أدنى سنوات', labelEn: 'Min years', type: 'number' }, { key: 'maxYears', labelAr: 'أعلى سنوات', labelEn: 'Max years', type: 'number' }, { key: 'levelOrder', labelAr: 'ترتيب المستوى', labelEn: 'Level order', type: 'number' }, ACTIVE_FIELD],
  },
];

@Component({
  selector: 'app-hr-master-data',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './hr-master-data.component.html',
  styleUrl: './hr-master-data.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HrMasterDataComponent implements OnInit {
  modules = MODULES;
  active = MODULES[0];
  rows: MasterRecord[] = [];
  total = 0;
  page = 1;
  pageSize = 20;
  search = '';
  activeFilter: '' | 'true' | 'false' = '';
  sortBy = this.active.defaultSort;
  sortDir: 'asc' | 'desc' = 'asc';
  loading = false;
  saving = false;
  error = '';
  drawerOpen = false;
  editing: MasterRecord | null = null;
  form: Record<string, any> = {};
  formErrors: Record<string, string> = {};
  dropdowns: Record<string, any[]> = {};
  inlineGroupOpen = false;
  inlineGroup = { code: '', nameAr: '', nameEn: '' };
  private searchTerms = new Subject<string>();

  constructor(
    private http: HttpClient,
    public i18n: I18nService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.searchTerms.pipe(debounceTime(260)).subscribe(() => {
      this.page = 1;
      this.load();
    });
    this.loadDropdowns();
    this.load();
  }

  t(ar: string, en: string) { return this.i18n.currentLang === 'ar' ? ar : en; }
  label(item: { titleAr?: string; titleEn?: string; labelAr?: string; labelEn?: string }) {
    return this.i18n.currentLang === 'ar' ? (item.titleAr || item.labelAr || '') : (item.titleEn || item.labelEn || '');
  }
  pages() { return Math.max(1, Math.ceil(this.total / this.pageSize)); }

  setModule(module: MasterModule) {
    if (this.active.route === module.route) return;
    this.active = module;
    this.page = 1;
    this.search = '';
    this.activeFilter = '';
    this.sortBy = module.defaultSort;
    this.sortDir = 'asc';
    this.closeDrawer();
    this.loadDropdowns();
    this.load();
  }

  load() {
    this.loading = true;
    this.error = '';
    let params = new HttpParams()
      .set('page', this.page)
      .set('pageSize', this.pageSize)
      .set('sortBy', this.sortBy)
      .set('sortDir', this.sortDir);
    if (this.search.trim()) params = params.set('q', this.search.trim());
    if (this.activeFilter) params = params.set('active', this.activeFilter);
    this.http.get<ApiResponse<MasterRecord[]>>(`/api/${this.active.route}`, { params })
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: res => {
          this.rows = res.data ?? [];
          this.total = res.meta?.total ?? this.rows.length;
        },
        error: err => {
          this.rows = [];
          this.total = 0;
          this.error = err?.error?.message || this.t('تعذر تحميل البيانات.', 'Failed to load data.');
        }
      });
  }

  loadDropdowns() {
    for (const field of this.active.fields.filter(f => f.type === 'select' && f.module)) {
      this.http.get<ApiResponse<any[]>>(`/api/${field.module}/dropdown`, { params: { active: 'true', limit: 100 } }).subscribe({
        next: res => { this.dropdowns[field.module!] = res.data ?? []; this.cdr.markForCheck(); },
        error: () => { this.dropdowns[field.module!] = []; this.cdr.markForCheck(); }
      });
    }
  }

  onSearch(value: string) {
    this.search = value;
    this.searchTerms.next(value);
  }

  changePage(delta: number) {
    const next = Math.min(this.pages(), Math.max(1, this.page + delta));
    if (next !== this.page) {
      this.page = next;
      this.load();
    }
  }

  sort(field: string) {
    if (this.sortBy === field) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    else { this.sortBy = field; this.sortDir = 'asc'; }
    this.load();
  }

  openAdd() {
    this.editing = null;
    this.formErrors = {};
    this.form = { isActive: true };
    if (this.active.route === 'languages') this.form['proficiencyLevels'] = ['Basic', 'Intermediate', 'Advanced', 'Native'];
    this.drawerOpen = true;
  }

  openEdit(row: MasterRecord) {
    this.editing = row;
    this.formErrors = {};
    this.form = this.rowToForm(row);
    this.drawerOpen = true;
  }

  duplicate(row: MasterRecord) {
    this.editing = null;
    this.formErrors = {};
    this.form = this.rowToForm(row);
    this.form['code'] = `${this.form['code'] || row.code}-COPY`;
    this.drawerOpen = true;
  }

  closeDrawer() {
    this.drawerOpen = false;
    this.editing = null;
    this.formErrors = {};
    this.inlineGroupOpen = false;
  }

  rowToForm(row: MasterRecord) {
    const f: Record<string, any> = {
      code: row.code,
      nameAr: row.name_ar,
      nameEn: row.name_en,
      descriptionAr: row.description_ar || '',
      descriptionEn: row.description_en || '',
      isActive: row.is_active,
    };
    const map: Record<string, string> = {
      responsibilityGroupId: 'responsibility_group_id',
      priorityOrder: 'priority_order',
      gradeCode: 'grade_code',
      salaryBandMin: 'salary_band_min',
      salaryBandMax: 'salary_band_max',
      levelOrder: 'level_order',
      providerAr: 'provider_ar',
      providerEn: 'provider_en',
      durationHours: 'duration_hours',
      skillCategory: 'skill_category',
      proficiencyLevels: 'proficiency_levels_json',
      isRtl: 'is_rtl',
      minYears: 'min_years',
      maxYears: 'max_years',
      country: 'country',
      city: 'city',
    };
    for (const field of this.active.fields) {
      if (map[field.key] && row[map[field.key]] !== undefined) f[field.key] = row[map[field.key]];
    }
    return f;
  }

  validate() {
    this.formErrors = {};
    for (const field of this.active.fields) {
      if (field.required && (this.form[field.key] === undefined || this.form[field.key] === null || String(this.form[field.key]).trim() === '')) {
        this.formErrors[field.key] = this.t('هذا الحقل مطلوب', 'Required');
      }
    }
    return Object.keys(this.formErrors).length === 0;
  }

  save() {
    if (this.saving || !this.validate()) return;
    this.saving = true;
    const payload = { ...this.form };
    const req = this.editing
      ? this.http.patch<ApiResponse<MasterRecord>>(`/api/${this.active.route}/${this.editing.id}`, payload)
      : this.http.post<ApiResponse<MasterRecord>>(`/api/${this.active.route}`, payload);
    req.pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); })).subscribe({
      next: () => {
        this.toast.success(this.t('تم الحفظ بنجاح', 'Saved successfully'));
        this.closeDrawer();
        this.load();
      },
      error: err => {
        this.toast.error(err?.error?.message || this.t('تعذر الحفظ', 'Save failed'));
      }
    });
  }

  toggleActive(row: MasterRecord) {
    this.http.patch<ApiResponse<MasterRecord>>(`/api/${this.active.route}/${row.id}`, { isActive: !row.is_active }).subscribe({
      next: () => this.load(),
      error: err => this.toast.error(err?.error?.message || this.t('تعذر تحديث الحالة', 'Status update failed'))
    });
  }

  remove(row: MasterRecord) {
    if (!confirm(this.t('هل تريد حذف هذا السجل؟', 'Delete this record?'))) return;
    this.http.delete<ApiResponse<MasterRecord>>(`/api/${this.active.route}/${row.id}`).subscribe({
      next: () => { this.toast.success(this.t('تم الحذف', 'Deleted')); this.load(); },
      error: err => this.toast.error(err?.error?.message || this.t('تعذر الحذف', 'Delete failed'))
    });
  }

  addInlineGroup() {
    if (!this.inlineGroup.code || !this.inlineGroup.nameAr || !this.inlineGroup.nameEn) return;
    this.http.post<ApiResponse<MasterRecord>>('/api/responsibility-groups', {
      code: this.inlineGroup.code,
      nameAr: this.inlineGroup.nameAr,
      nameEn: this.inlineGroup.nameEn,
      isActive: true,
    }).subscribe({
      next: res => {
        this.inlineGroup = { code: '', nameAr: '', nameEn: '' };
        this.inlineGroupOpen = false;
        this.loadDropdowns();
        this.form['responsibilityGroupId'] = res.data.id;
        this.toast.success(this.t('تمت إضافة المجموعة', 'Group added'));
      },
      error: err => this.toast.error(err?.error?.message || this.t('تعذرت إضافة المجموعة', 'Failed to add group'))
    });
  }

  value(row: MasterRecord, field: string) {
    return row[field] ?? row[field.replace(/[A-Z]/g, m => '_' + m.toLowerCase())] ?? '';
  }
}
