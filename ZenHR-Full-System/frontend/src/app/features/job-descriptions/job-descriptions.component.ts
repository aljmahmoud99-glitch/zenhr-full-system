import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debounceTime, finalize, Subject } from 'rxjs';
import { ApiResponse } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { LangService } from '../../core/services/lang.service';
import { RoleAccessService } from '../../core/services/role-access.service';
import { ToastService } from '../../core/services/toast.service';

interface JobProfile {
  id: number;
  code: string;
  titleAr: string;
  titleEn: string;
  grade: string | null;
  gradeId: number | null;
  gradeNameAr?: string | null;
  gradeNameEn?: string | null;
  orgNodeId: number | null;
  orgNodeNameAr?: string | null;
  orgNodeNameEn?: string | null;
  responsibilityGroupId: number | null;
  responsibilityGroupNameAr?: string | null;
  responsibilityGroupNameEn?: string | null;
  minSalary: string | null;
  maxSalary: string | null;
  minExperienceYears: number | null;
  maxExperienceYears: number | null;
  reportingToJobDescriptionId: number | null;
  employmentType: string | null;
  jobSummaryAr: string | null;
  jobSummaryEn: string | null;
  responsibilitiesTextAr: string | null;
  responsibilitiesTextEn: string | null;
  requirementsAr: string | null;
  requirementsEn: string | null;
  status: string;
  version: number;
  isTemplate: boolean;
  isActive: boolean;
  responsibilitiesCount: number;
  skillsCount: number;
  languagesCount: number;
  qualificationsCount: number;
  responsibilities?: MasterOption[];
  qualifications?: MasterOption[];
  specializations?: MasterOption[];
  universities?: MasterOption[];
  courses?: MasterOption[];
  skillsList?: MasterOption[];
  languagesList?: MasterOption[];
  experienceLevels?: MasterOption[];
}

interface MasterOption {
  id: number;
  code: string;
  nameAr?: string;
  nameEn?: string;
  titleAr?: string;
  titleEn?: string;
  raw?: any;
}

type PagedApiResponse<T> = ApiResponse<T> & {
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
  };
};

interface OrgNode {
  id: number;
  nameAr: string;
  nameEn: string;
  children?: OrgNode[];
}

interface MasterPicker {
  key: string;
  route: string;
  labelAr: string;
  labelEn: string;
  idsKey: keyof JobProfileForm;
  allowAdd: boolean;
}

interface JobProfileForm {
  code: string;
  titleAr: string;
  titleEn: string;
  orgNodeId: number | null;
  gradeId: number | null;
  grade: string;
  responsibilityGroupId: number | null;
  minSalary: number | null;
  maxSalary: number | null;
  minExperienceYears: number | null;
  maxExperienceYears: number | null;
  reportingToJobDescriptionId: number | null;
  employmentType: string;
  status: string;
  isActive: boolean;
  isTemplate: boolean;
  jobSummaryAr: string;
  jobSummaryEn: string;
  responsibilitiesTextAr: string;
  responsibilitiesTextEn: string;
  requirementsAr: string;
  requirementsEn: string;
  responsibilityIds: number[];
  qualificationIds: number[];
  specializationIds: number[];
  universityIds: number[];
  courseIds: number[];
  skillIds: number[];
  languageIds: number[];
  experienceLevelIds: number[];
}

@Component({
  selector: 'app-job-descriptions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './job-descriptions.component.html',
  styleUrl: './job-descriptions.component.scss'
})
export class JobDescriptionsComponent implements OnInit {
  jobs: JobProfile[] = [];
  orgNodes: OrgNode[] = [];
  profileOptions: MasterOption[] = [];
  options: Record<string, MasterOption[]> = {};

  loading = false;
  saving = false;
  detailLoading = false;
  error = '';

  page = 1;
  pageSize = 20;
  total = 0;
  totalPages = 1;
  search = '';
  statusFilter = '';
  gradeFilter = '';
  groupFilter = '';

  drawerOpen = false;
  viewing: JobProfile | null = null;
  editing: JobProfile | null = null;
  form: JobProfileForm = this.emptyForm();
  formErrors: Record<string, string> = {};

  addFlyOpenFor: string | null = null;
  addFlySaving = false;
  addFlyForm = { code: '', nameAr: '', nameEn: '' };

  private searchTerms = new Subject<string>();

  readonly pickers: MasterPicker[] = [
    { key: 'responsibilities', route: 'responsibilities', labelAr: 'المسؤوليات', labelEn: 'Responsibilities', idsKey: 'responsibilityIds', allowAdd: true },
    { key: 'qualifications', route: 'educational-qualifications', labelAr: 'المؤهلات العلمية', labelEn: 'Educational Qualifications', idsKey: 'qualificationIds', allowAdd: true },
    { key: 'specializations', route: 'specializations', labelAr: 'التخصصات', labelEn: 'Specializations', idsKey: 'specializationIds', allowAdd: true },
    { key: 'universities', route: 'universities', labelAr: 'الجامعات', labelEn: 'Universities', idsKey: 'universityIds', allowAdd: true },
    { key: 'courses', route: 'training-courses', labelAr: 'الدورات والشهادات', labelEn: 'Courses & Certifications', idsKey: 'courseIds', allowAdd: true },
    { key: 'skillsList', route: 'skills', labelAr: 'المهارات', labelEn: 'Skills', idsKey: 'skillIds', allowAdd: true },
    { key: 'languagesList', route: 'languages', labelAr: 'اللغات', labelEn: 'Languages', idsKey: 'languageIds', allowAdd: true },
    { key: 'experienceLevels', route: 'experience-levels', labelAr: 'مستويات الخبرة', labelEn: 'Experience Levels', idsKey: 'experienceLevelIds', allowAdd: true },
  ];

  constructor(
    public lang: LangService,
    private api: ApiService,
    private toast: ToastService,
    private access: RoleAccessService,
    private cdr: ChangeDetectorRef,
  ) {}

  get canMutate(): boolean {
    return this.access.isHrAdmin();
  }

  ngOnInit(): void {
    this.searchTerms.pipe(debounceTime(300)).subscribe(() => {
      this.page = 1;
      this.loadProfiles();
    });
    this.loadBootstrapData();
    this.loadProfiles();
  }

  loadBootstrapData(): void {
    this.loadOrgNodes();
    this.loadProfileOptions();
    this.loadMasterOptions();
  }

  loadProfiles(): void {
    this.loading = true;
    this.error = '';
    this.api.get<PagedApiResponse<JobProfile[]>>('/api/job-profiles', {
      page: this.page,
      pageSize: this.pageSize,
      q: this.search,
      status: this.statusFilter,
      gradeId: this.gradeFilter,
      responsibilityGroupId: this.groupFilter,
      sortBy: 'titleEn',
      sortDir: 'asc',
    }).pipe(finalize(() => {
      this.loading = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: res => {
        this.jobs = res.data ?? [];
        this.total = res.meta?.total ?? this.jobs.length;
        this.totalPages = (res.meta as any)?.totalPages ?? Math.max(1, Math.ceil(this.total / this.pageSize));
      },
      error: err => {
        this.jobs = [];
        this.total = 0;
        this.totalPages = 1;
        this.error = err?.error?.message || this.lang.t('تعذر تحميل الملفات الوظيفية', 'Failed to load job profiles');
      }
    });
  }

  loadOrgNodes(): void {
    this.api.get<ApiResponse<OrgNode[]>>('/api/org-nodes').subscribe({
      next: res => { this.orgNodes = this.flattenNodes(res.data ?? []); },
      error: () => { this.orgNodes = []; }
    });
  }

  loadProfileOptions(): void {
    this.api.get<ApiResponse<MasterOption[]>>('/api/job-profiles/dropdown', { limit: 100 }).subscribe({
      next: res => { this.profileOptions = res.data ?? []; },
      error: () => { this.profileOptions = []; }
    });
  }

  loadMasterOptions(route?: string): void {
    const routes = route ? [route] : ['job-grades', 'responsibility-groups', ...this.pickers.map(p => p.route)];
    for (const r of routes) {
      this.api.get<ApiResponse<MasterOption[]>>(`/api/${r}/dropdown`, { active: true, limit: 100 }).subscribe({
        next: res => { this.options[r] = res.data ?? []; this.cdr.markForCheck(); },
        error: () => { this.options[r] = []; this.cdr.markForCheck(); }
      });
    }
  }

  onSearch(value: string): void {
    this.search = value;
    this.searchTerms.next(value);
  }

  changePage(delta: number): void {
    const next = Math.min(this.totalPages, Math.max(1, this.page + delta));
    if (next === this.page) return;
    this.page = next;
    this.loadProfiles();
  }

  openCreate(): void {
    this.editing = null;
    this.viewing = null;
    this.form = this.emptyForm();
    this.formErrors = {};
    this.drawerOpen = true;
  }

  openEdit(job: JobProfile): void {
    this.detailLoading = true;
    this.drawerOpen = true;
    this.editing = job;
    this.viewing = null;
    this.api.get<ApiResponse<JobProfile>>(`/api/job-profiles/${job.id}`)
      .pipe(finalize(() => { this.detailLoading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: res => {
          const detail = res.data;
          this.editing = detail;
          this.form = this.profileToForm(detail);
          this.formErrors = {};
        },
        error: err => {
          this.toast.error(err?.error?.message || this.lang.t('تعذر تحميل الملف الوظيفي', 'Failed to load job profile'));
          this.closeDrawer();
        }
      });
  }

  openView(job: JobProfile): void {
    this.detailLoading = true;
    this.drawerOpen = true;
    this.viewing = null;
    this.editing = null;
    this.api.get<ApiResponse<JobProfile>>(`/api/job-profiles/${job.id}`)
      .pipe(finalize(() => { this.detailLoading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: res => { this.viewing = res.data; },
        error: err => {
          this.toast.error(err?.error?.message || this.lang.t('تعذر تحميل الملف الوظيفي', 'Failed to load job profile'));
          this.closeDrawer();
        }
      });
  }

  closeDrawer(): void {
    this.drawerOpen = false;
    this.viewing = null;
    this.editing = null;
    this.formErrors = {};
    this.addFlyOpenFor = null;
    this.addFlyForm = { code: '', nameAr: '', nameEn: '' };
  }

  save(): void {
    if (this.saving || !this.validate()) return;
    this.saving = true;
    const payload = { ...this.form };
    const request = this.editing
      ? this.api.patch<ApiResponse<JobProfile>>(`/api/job-profiles/${this.editing.id}`, payload)
      : this.api.post<ApiResponse<JobProfile>>('/api/job-profiles', payload);
    request.pipe(finalize(() => {
      this.saving = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => {
        this.toast.success(this.editing ? this.lang.t('تم تحديث الملف الوظيفي', 'Job profile updated') : this.lang.t('تم إنشاء الملف الوظيفي', 'Job profile created'));
        this.closeDrawer();
        this.loadProfiles();
        this.loadProfileOptions();
      },
      error: err => {
        this.toast.error(err?.error?.message || this.lang.t('تعذر الحفظ', 'Save failed'));
      }
    });
  }

  remove(job: JobProfile): void {
    if (!confirm(this.lang.t('هل تريد حذف هذا الملف الوظيفي؟', 'Delete this job profile?'))) return;
    this.api.delete<ApiResponse<JobProfile>>(`/api/job-profiles/${job.id}`).subscribe({
      next: () => {
        this.toast.success(this.lang.t('تم حذف الملف الوظيفي', 'Job profile deleted'));
        this.loadProfiles();
      },
      error: err => this.toast.error(err?.error?.message || this.lang.t('تعذر الحذف', 'Delete failed'))
    });
  }

  validate(): boolean {
    this.formErrors = {};
    if (!this.form.titleAr.trim()) this.formErrors['titleAr'] = this.lang.t('العنوان العربي مطلوب', 'Arabic title is required');
    if (!this.form.titleEn.trim()) this.formErrors['titleEn'] = this.lang.t('العنوان الإنجليزي مطلوب', 'English title is required');
    if (this.form.minSalary != null && this.form.maxSalary != null && Number(this.form.minSalary) > Number(this.form.maxSalary)) {
      this.formErrors['salary'] = this.lang.t('الحد الأدنى للراتب لا يمكن أن يتجاوز الحد الأعلى', 'Minimum salary cannot exceed maximum salary');
    }
    if (this.form.minExperienceYears != null && this.form.maxExperienceYears != null && Number(this.form.minExperienceYears) > Number(this.form.maxExperienceYears)) {
      this.formErrors['experience'] = this.lang.t('أدنى سنوات الخبرة لا يمكن أن يتجاوز الأعلى', 'Minimum experience cannot exceed maximum experience');
    }
    return Object.keys(this.formErrors).length === 0;
  }

  toggleSelection(idsKey: keyof JobProfileForm, id: number, checked: boolean): void {
    const current = Array.isArray(this.form[idsKey]) ? [...this.form[idsKey] as number[]] : [];
    this.form[idsKey] = (checked ? Array.from(new Set([...current, id])) : current.filter(v => v !== id)) as never;
  }

  isSelected(idsKey: keyof JobProfileForm, id: number): boolean {
    const current = this.form[idsKey];
    return Array.isArray(current) && current.includes(id);
  }

  openAddFly(route: string): void {
    this.addFlyOpenFor = this.addFlyOpenFor === route ? null : route;
    this.addFlyForm = { code: '', nameAr: '', nameEn: '' };
  }

  addOnTheFly(route: string): void {
    if (this.addFlySaving) return;
    if (!this.addFlyForm.code.trim() || !this.addFlyForm.nameAr.trim() || !this.addFlyForm.nameEn.trim()) {
      this.toast.warning(this.lang.t('أدخل الكود والاسمين العربي والإنجليزي', 'Enter code, Arabic name, and English name'));
      return;
    }
    this.addFlySaving = true;
    const body: any = {
      code: this.addFlyForm.code.trim(),
      nameAr: this.addFlyForm.nameAr.trim(),
      nameEn: this.addFlyForm.nameEn.trim(),
      isActive: true,
    };
    if (route === 'job-grades') {
      body.gradeCode = body.code;
      body.levelOrder = 0;
    }
    this.api.post<ApiResponse<any>>(`/api/${route}`, body)
      .pipe(finalize(() => {
        this.addFlySaving = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: res => {
          this.toast.success(this.lang.t('تمت الإضافة', 'Added successfully'));
          this.addFlyOpenFor = null;
          this.addFlyForm = { code: '', nameAr: '', nameEn: '' };
          this.loadMasterOptions(route);
          const id = res.data?.id;
          if (id) this.selectNewOption(route, id);
        },
        error: err => this.toast.error(err?.error?.message || this.lang.t('تعذرت الإضافة', 'Add failed'))
      });
  }

  selectNewOption(route: string, id: number): void {
    if (route === 'job-grades') this.form.gradeId = id;
    if (route === 'responsibility-groups') this.form.responsibilityGroupId = id;
    const picker = this.pickers.find(p => p.route === route);
    if (picker) this.toggleSelection(picker.idsKey, id, true);
  }

  profileToForm(profile: JobProfile): JobProfileForm {
    const ids = (items?: MasterOption[]) => (items ?? []).map(i => i.id);
    return {
      code: profile.code || '',
      titleAr: profile.titleAr || '',
      titleEn: profile.titleEn || '',
      orgNodeId: profile.orgNodeId,
      gradeId: profile.gradeId,
      grade: profile.grade || '',
      responsibilityGroupId: profile.responsibilityGroupId,
      minSalary: profile.minSalary != null ? Number(profile.minSalary) : null,
      maxSalary: profile.maxSalary != null ? Number(profile.maxSalary) : null,
      minExperienceYears: profile.minExperienceYears,
      maxExperienceYears: profile.maxExperienceYears,
      reportingToJobDescriptionId: profile.reportingToJobDescriptionId,
      employmentType: profile.employmentType || '',
      status: profile.status || 'active',
      isActive: profile.isActive !== false,
      isTemplate: profile.isTemplate === true,
      jobSummaryAr: profile.jobSummaryAr || '',
      jobSummaryEn: profile.jobSummaryEn || '',
      responsibilitiesTextAr: profile.responsibilitiesTextAr || '',
      responsibilitiesTextEn: profile.responsibilitiesTextEn || '',
      requirementsAr: profile.requirementsAr || '',
      requirementsEn: profile.requirementsEn || '',
      responsibilityIds: ids(profile.responsibilities),
      qualificationIds: ids(profile.qualifications),
      specializationIds: ids(profile.specializations),
      universityIds: ids(profile.universities),
      courseIds: ids(profile.courses),
      skillIds: ids(profile.skillsList),
      languageIds: ids(profile.languagesList),
      experienceLevelIds: ids(profile.experienceLevels),
    };
  }

  emptyForm(): JobProfileForm {
    return {
      code: '',
      titleAr: '',
      titleEn: '',
      orgNodeId: null,
      gradeId: null,
      grade: '',
      responsibilityGroupId: null,
      minSalary: null,
      maxSalary: null,
      minExperienceYears: null,
      maxExperienceYears: null,
      reportingToJobDescriptionId: null,
      employmentType: 'full_time',
      status: 'active',
      isActive: true,
      isTemplate: false,
      jobSummaryAr: '',
      jobSummaryEn: '',
      responsibilitiesTextAr: '',
      responsibilitiesTextEn: '',
      requirementsAr: '',
      requirementsEn: '',
      responsibilityIds: [],
      qualificationIds: [],
      specializationIds: [],
      universityIds: [],
      courseIds: [],
      skillIds: [],
      languageIds: [],
      experienceLevelIds: [],
    };
  }

  optionLabel(option: MasterOption | undefined | null): string {
    if (!option) return '';
    return this.lang.isAr
      ? (option.nameAr || option.titleAr || option.nameEn || option.titleEn || option.code)
      : (option.nameEn || option.titleEn || option.nameAr || option.titleAr || option.code);
  }

  jobTitle(job: JobProfile | MasterOption | undefined | null): string {
    if (!job) return '';
    const anyJob = job as any;
    return this.lang.isAr ? (anyJob.titleAr || anyJob.nameAr || anyJob.titleEn || anyJob.nameEn) : (anyJob.titleEn || anyJob.nameEn || anyJob.titleAr || anyJob.nameAr);
  }

  orgName(id: number | null): string {
    if (!id) return '—';
    const node = this.orgNodes.find(n => n.id === Number(id));
    return node ? (this.lang.isAr ? node.nameAr : node.nameEn) : '—';
  }

  selectedNames(picker: MasterPicker, profile: JobProfile | null): string {
    if (!profile) return '—';
    const items = ((profile as any)[picker.key] ?? []) as MasterOption[];
    if (!items.length) return '—';
    return items.map(item => this.optionLabel(item)).join(', ');
  }

  private flattenNodes(nodes: OrgNode[]): OrgNode[] {
    return nodes.flatMap(n => [n, ...this.flattenNodes(n.children ?? [])]);
  }
}
