import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { RoleAccessService } from '../../core/services/role-access.service';
import { LangService } from '../../core/services/lang.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { ApiResponse } from '../../core/models';
import { SkeletonTableComponent } from '../../shared/components/skeleton/skeleton-table.component';

const GRADES = ['G1','G2','G3','G4','G5','G6','G7','G8','G9','G10'];

interface JobDescription {
  id: number;
  companyId: number;
  orgNodeId: number | null;
  titleAr: string;
  titleEn: string;
  grade: string | null;
  minSalary: string | null;
  maxSalary: string | null;
  responsibilities: string | null;
  requirements: string | null;
  skills: string | null;
  qualifications: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CareerPath {
  id: number;
  companyId: number;
  fromJobDescriptionId: number;
  toJobDescriptionId: number;
  minMonthsRequired: number;
  notes: string | null;
  fromJob: { titleAr: string; titleEn: string; grade: string | null } | null;
  toJob: { titleAr: string; titleEn: string; grade: string | null } | null;
}

interface OrgNode { id: number; nameAr: string; nameEn: string; children?: OrgNode[]; }

@Component({
  selector: 'app-job-descriptions',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, SkeletonTableComponent],
  templateUrl: './job-descriptions.component.html',
  styleUrl: './job-descriptions.component.scss'
})
export class JobDescriptionsComponent implements OnInit {
  readonly allGrades = GRADES;

  activeTab: 'jobs' | 'paths' = 'jobs';

  jobs: JobDescription[] = [];
  filteredJobs: JobDescription[] = [];
  jobsLoading = false;
  jobsError = false;

  paths: CareerPath[] = [];
  pathsLoading = false;
  pathsError = false;

  showModal = false;
  showPathModal = false;
  showDrawer = false;

  saving = false;
  pathSaving = false;

  editingJob: JobDescription | null = null;
  viewingJob: JobDescription | null = null;

  drawerEmployees: any[] = [];
  drawerEmployeesLoading = false;
  drawerPathsFrom: CareerPath[] = [];
  drawerPathsTo: CareerPath[] = [];

  orgNodes: OrgNode[] = [];

  searchTerm = '';
  filterGrade = '';
  filterOrgNode = '';
  filterStatus = '';

  form: any = this.emptyForm();
  formErrors: Record<string, string> = {};

  responsibilitiesText = '';
  requirementsText = '';
  skillsText = '';
  qualificationsText = '';

  pathForm: { fromJobId: number | null; toJobId: number | null; minMonthsRequired: number; notes: string } = {
    fromJobId: null, toJobId: null, minMonthsRequired: 12, notes: ''
  };
  pathFormErrors: Record<string, string> = {};

  readonly drawerSections: { label: { ar: string; en: string }; field: keyof JobDescription }[] = [
    { label: { ar: 'المسؤوليات', en: 'Responsibilities' }, field: 'responsibilities' },
    { label: { ar: 'المتطلبات', en: 'Requirements' }, field: 'requirements' },
    { label: { ar: 'المهارات', en: 'Skills' }, field: 'skills' },
    { label: { ar: 'المؤهلات', en: 'Qualifications' }, field: 'qualifications' },
  ];

  constructor(
    public lang: LangService,
    private api: ApiService,
    private auth: AuthService,
    private toast: ToastService,
    private access: RoleAccessService
  ) {}

  get canCreate(): boolean { return this.access.isHrAdmin(); }

  get usedGrades(): string[] {
    return Array.from(new Set(this.jobs.map(j => j.grade).filter(Boolean) as string[])).sort();
  }

  get usedOrgNodes(): OrgNode[] {
    const used = new Set(this.jobs.map(j => j.orgNodeId).filter(Boolean));
    return this.orgNodes.filter(n => used.has(n.id));
  }

  ngOnInit(): void {
    this.loadJobs();
    this.loadOrgNodes();
    this.loadPaths();
  }

  loadJobs(): void {
    this.jobsLoading = true;
    this.jobsError = false;
    this.api.get<ApiResponse<JobDescription[]>>('/api/job-descriptions').subscribe({
      next: res => {
        this.jobs = res.data ?? [];
        this.applyFilter();
        this.jobsLoading = false;
      },
      error: () => {
        this.jobsError = true;
        this.jobsLoading = false;
        this.toast.error(this.lang.t('تعذر تحميل المسميات الوظيفية', 'Failed to load job descriptions'));
      }
    });
  }

  loadOrgNodes(): void {
    this.api.get<ApiResponse<OrgNode[]>>('/api/org-nodes').subscribe({
      next: res => { this.orgNodes = this.flattenNodes(res.data ?? []); },
      error: () => {}
    });
  }

  loadPaths(): void {
    this.pathsLoading = true;
    this.pathsError = false;
    this.api.get<ApiResponse<CareerPath[]>>('/api/career-paths').subscribe({
      next: res => {
        this.paths = res.data ?? [];
        this.pathsLoading = false;
      },
      error: () => {
        this.pathsError = true;
        this.pathsLoading = false;
        this.toast.error(this.lang.t('تعذر تحميل مسارات المسيرة', 'Failed to load career paths'));
      }
    });
  }

  openAdd(): void {
    this.form = this.emptyForm();
    this.responsibilitiesText = '';
    this.requirementsText = '';
    this.skillsText = '';
    this.qualificationsText = '';
    this.formErrors = {};
    this.editingJob = null;
    this.showModal = true;
  }

  openEdit(job: JobDescription): void {
    this.form = {
      titleAr: job.titleAr,
      titleEn: job.titleEn,
      grade: job.grade ?? '',
      minSalary: job.minSalary ? parseFloat(job.minSalary) : null,
      maxSalary: job.maxSalary ? parseFloat(job.maxSalary) : null,
      orgNodeId: job.orgNodeId ?? null,
      isActive: job.isActive
    };
    this.responsibilitiesText = this.jsonToText(job.responsibilities);
    this.requirementsText = this.jsonToText(job.requirements);
    this.skillsText = this.jsonToText(job.skills);
    this.qualificationsText = this.jsonToText(job.qualifications);
    this.formErrors = {};
    this.editingJob = job;
    this.showModal = true;
  }

  openView(job: JobDescription): void {
    this.viewingJob = job;
    this.drawerEmployees = [];
    this.drawerEmployeesLoading = true;
    this.drawerPathsFrom = this.paths.filter(p => p.fromJobDescriptionId === job.id);
    this.drawerPathsTo = this.paths.filter(p => p.toJobDescriptionId === job.id);
    this.showDrawer = true;
    this.api.get<ApiResponse<any[]>>('/api/employees', { jobDescriptionId: job.id, pageSize: 100 }).subscribe({
      next: res => { this.drawerEmployees = res.data ?? []; this.drawerEmployeesLoading = false; },
      error: () => { this.drawerEmployeesLoading = false; }
    });
  }

  closeDrawer(): void { this.showDrawer = false; this.viewingJob = null; }

  save(): void {
    this.formErrors = {};
    if (!this.form.titleAr?.trim()) this.formErrors['titleAr'] = this.lang.t('الاسم بالعربية مطلوب', 'Arabic name is required');
    if (!this.form.titleEn?.trim()) this.formErrors['titleEn'] = this.lang.t('الاسم بالإنجليزية مطلوب', 'English name is required');
    if (Object.keys(this.formErrors).length > 0) return;

    this.saving = true;
    const payload = {
      ...this.form,
      orgNodeId: this.form.orgNodeId ? Number(this.form.orgNodeId) : null,
      responsibilities: this.textToJson(this.responsibilitiesText),
      requirements: this.textToJson(this.requirementsText),
      skills: this.textToJson(this.skillsText),
      qualifications: this.textToJson(this.qualificationsText),
    };

    const req$ = this.editingJob
      ? this.api.put<ApiResponse<JobDescription>>(`/api/job-descriptions/${this.editingJob.id}`, payload)
      : this.api.post<ApiResponse<JobDescription>>('/api/job-descriptions', payload);

    req$.subscribe({
      next: () => {
        this.saving = false;
        const msg = this.editingJob
          ? this.lang.t('تم تعديل المسمى بنجاح', 'Job description updated')
          : this.lang.t('تم إضافة المسمى بنجاح', 'Job description created');
        this.closeModal();
        this.loadJobs();
        this.toast.success(msg);
      },
      error: err => {
        this.saving = false;
        this.toast.error(err.error?.message || this.lang.t('فشل الحفظ', 'Save failed'));
      }
    });
  }

  delete(job: JobDescription): void {
    if (!confirm(this.lang.t('هل أنت متأكد من حذف هذا المسمى؟', 'Delete this job description?'))) return;
    this.api.delete<any>(`/api/job-descriptions/${job.id}`).subscribe({
      next: () => {
        this.loadJobs();
        this.loadPaths();
        this.toast.success(this.lang.t('تم حذف المسمى الوظيفي', 'Job description deleted'));
      },
      error: err => {
        if (err.status === 409) {
          this.toast.warning(err.error?.message || this.lang.t('لا يمكن الحذف — المسمى مرتبط ببيانات أخرى', 'Cannot delete — job is in use'));
        } else {
          this.toast.error(err.error?.message || this.lang.t('تعذر حذف المسمى الوظيفي', 'Failed to delete'));
        }
      }
    });
  }

  openAddPath(): void {
    this.pathForm = { fromJobId: null, toJobId: null, minMonthsRequired: 12, notes: '' };
    this.pathFormErrors = {};
    this.showPathModal = true;
  }

  savePath(): void {
    this.pathFormErrors = {};
    if (!this.pathForm.fromJobId) this.pathFormErrors['fromJobId'] = this.lang.t('مطلوب', 'Required');
    if (!this.pathForm.toJobId) this.pathFormErrors['toJobId'] = this.lang.t('مطلوب', 'Required');
    if (this.pathForm.fromJobId && this.pathForm.toJobId && Number(this.pathForm.fromJobId) === Number(this.pathForm.toJobId)) {
      this.pathFormErrors['toJobId'] = this.lang.t('لا يمكن اختيار نفس المسمى', 'Cannot be the same job');
    }
    if (Object.keys(this.pathFormErrors).length > 0) return;

    this.pathSaving = true;
    const body = {
      fromJobDescriptionId: Number(this.pathForm.fromJobId),
      toJobDescriptionId: Number(this.pathForm.toJobId),
      minMonthsRequired: this.pathForm.minMonthsRequired || 12,
      notes: this.pathForm.notes || null
    };
    this.api.post<ApiResponse<CareerPath>>('/api/career-paths', body).subscribe({
      next: () => {
        this.pathSaving = false;
        this.showPathModal = false;
        this.loadPaths();
        this.toast.success(this.lang.t('تم إضافة المسار بنجاح', 'Career path added'));
      },
      error: err => {
        this.pathSaving = false;
        const msg = err.error?.message || this.lang.t('فشل الحفظ', 'Save failed');
        if (err.status === 409) { this.toast.warning(msg); } else { this.toast.error(msg); }
      }
    });
  }

  deletePath(id: number): void {
    if (!confirm(this.lang.t('هل أنت متأكد من حذف هذا المسار؟', 'Delete this career path?'))) return;
    this.api.delete<any>(`/api/career-paths/${id}`).subscribe({
      next: () => { this.loadPaths(); this.toast.success(this.lang.t('تم حذف المسار', 'Career path deleted')); },
      error: () => { this.toast.error(this.lang.t('تعذر حذف المسار', 'Failed to delete career path')); }
    });
  }

  closeModal(): void { this.showModal = false; this.saving = false; this.formErrors = {}; }

  applyFilter(): void {
    const term = this.searchTerm.trim().toLowerCase();
    this.filteredJobs = this.jobs.filter(job => {
      const matchTerm = !term ||
        (job.titleAr ?? '').toLowerCase().includes(term) ||
        (job.titleEn ?? '').toLowerCase().includes(term) ||
        (job.grade ?? '').toLowerCase().includes(term);
      const matchGrade = !this.filterGrade || job.grade === this.filterGrade;
      const matchOrg = !this.filterOrgNode || String(job.orgNodeId) === this.filterOrgNode;
      const matchStatus = !this.filterStatus ||
        (this.filterStatus === 'active' ? job.isActive : !job.isActive);
      return matchTerm && matchGrade && matchOrg && matchStatus;
    });
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.filterGrade = '';
    this.filterOrgNode = '';
    this.filterStatus = '';
    this.applyFilter();
  }

  get hasFilters(): boolean {
    return !!(this.searchTerm || this.filterGrade || this.filterOrgNode || this.filterStatus);
  }

  getNodeName(id: number | null): string {
    if (!id) return '—';
    const node = this.orgNodes.find(n => n.id === Number(id));
    if (!node) return '—';
    return this.lang.isAr ? (node.nameAr ?? node.nameEn) : (node.nameEn ?? node.nameAr);
  }

  getJobLabel(id: number): string {
    const job = this.jobs.find(j => j.id === id);
    if (!job) return `#${id}`;
    return this.lang.isAr ? job.titleAr : job.titleEn;
  }

  getJobGrade(id: number): string | null {
    return this.jobs.find(j => j.id === id)?.grade ?? null;
  }

  parseJson(val: string | null | undefined): string[] {
    try { const p = JSON.parse(val || '[]'); return Array.isArray(p) ? p : []; }
    catch { return []; }
  }

  getSectionItems(job: JobDescription | null, field: keyof JobDescription): string[] {
    if (!job) return [];
    return this.parseJson(job[field] as string | null);
  }

  getEmployeeFullName(emp: any): string {
    return this.lang.isAr
      ? [emp.firstNameAr, emp.lastNameAr].filter(Boolean).join(' ')
      : [emp.firstNameEn, emp.lastNameEn].filter(Boolean).join(' ');
  }

  private emptyForm(): any {
    return { titleAr: '', titleEn: '', grade: '', minSalary: null, maxSalary: null, orgNodeId: null, isActive: true };
  }

  private textToJson(text: string): string {
    return JSON.stringify(text.split(/\r?\n/).map(s => s.trim()).filter(Boolean));
  }

  private jsonToText(val: string | null): string {
    try { const p = JSON.parse(val || '[]'); return Array.isArray(p) ? p.join('\n') : ''; }
    catch { return ''; }
  }

  private flattenNodes(nodes: OrgNode[]): OrgNode[] {
    return nodes.flatMap(n => [n, ...this.flattenNodes(n.children ?? [])]);
  }
}
