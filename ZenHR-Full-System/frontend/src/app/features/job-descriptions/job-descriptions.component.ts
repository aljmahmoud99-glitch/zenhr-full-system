import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { LangService } from '../../core/services/lang.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslatePipe } from '../../core/pipes/translate.pipe';

@Component({
  selector: 'app-job-descriptions',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './job-descriptions.component.html',
  styleUrl: './job-descriptions.component.scss'
})
export class JobDescriptionsComponent implements OnInit {
  activeTab: 'jobs' | 'paths' = 'jobs';
  jobs: any[] = [];
  filteredJobs: any[] = [];
  paths: any[] = [];
  loading = false;
  saving = false;
  showModal = false;
  showPathModal = false;
  showDrawer = false;
  editingJob: any = null;
  viewingJob: any = null;
  form: any = this.emptyForm();
  pathForm: any = { fromJobId: null, toJobId: null, minMonthsRequired: 12, notes: '' };
  orgNodes: any[] = [];
  searchTerm = '';
  filterGrade = '';
  responsibilitiesText = '';
  requirementsText = '';
  skillsText = '';
  qualificationsText = '';
  drawerSections = [
    { label: { ar: 'المسؤوليات', en: 'Responsibilities' }, field: 'responsibilitiesJson' },
    { label: { ar: 'المتطلبات', en: 'Requirements' }, field: 'requirementsJson' },
    { label: { ar: 'المهارات', en: 'Skills' }, field: 'skillsJson' },
    { label: { ar: 'المؤهلات', en: 'Qualifications' }, field: 'qualificationsJson' },
  ];

  constructor(
    public lang: LangService,
    private http: HttpClient,
    private auth: AuthService,
    private toast: ToastService
  ) {}

  get canCreate(): boolean {
    return this.auth.hasRole('hradmin');
  }

  get grades(): string[] {
    return Array.from(new Set(this.jobs.map(job => job.grade).filter(Boolean))).sort();
  }

  ngOnInit(): void {
    this.loadJobs();
    this.loadOrgNodes();
    this.loadPaths();
  }

  loadJobs(): void {
    this.loading = true;
    this.http.get<any>('/api/job-descriptions').subscribe({
      next: response => {
        this.jobs = response.data ?? [];
        this.applyFilter();
        this.loading = false;
      },
      error: () => {
        this.jobs = [];
        this.filteredJobs = [];
        this.loading = false;
      }
    });
  }

  loadOrgNodes(): void {
    this.http.get<any>('/api/org-nodes').subscribe({
      next: response => this.orgNodes = this.flattenNodes(response.data ?? []),
      error: () => this.orgNodes = []
    });
  }

  loadPaths(): void {
    this.http.get<{success:boolean; data:any[]}>('/api/career-paths').subscribe({
      next: res => { this.paths = res.data ?? []; },
      error: err => {
        console.error('Career paths:', err.status);
        this.paths = [];
      }
    });
  }

  openAdd(): void {
    this.form = this.emptyForm();
    this.responsibilitiesText = '';
    this.requirementsText = '';
    this.skillsText = '';
    this.qualificationsText = '';
    this.editingJob = null;
    this.showModal = true;
  }

  openEdit(job: any): void {
    this.form = {
      titleAr: job.titleAr ?? '',
      titleEn: job.titleEn ?? '',
      grade: job.grade ?? '',
      minSalary: job.minSalary ?? 0,
      maxSalary: job.maxSalary ?? 0,
      orgNodeId: job.orgNodeId ?? null,
      responsibilitiesJson: job.responsibilitiesJson ?? '[]',
      requirementsJson: job.requirementsJson ?? '[]',
      skillsJson: job.skillsJson ?? '[]',
      qualificationsJson: job.qualificationsJson ?? '[]',
      isActive: job.isActive ?? true
    };
    this.responsibilitiesText = this.jsonToText(this.form.responsibilitiesJson);
    this.requirementsText = this.jsonToText(this.form.requirementsJson);
    this.skillsText = this.jsonToText(this.form.skillsJson);
    this.qualificationsText = this.jsonToText(this.form.qualificationsJson);
    this.editingJob = job;
    this.showModal = true;
  }

  openView(job: any): void {
    this.viewingJob = job;
    this.showDrawer = true;
  }

  closeDrawer(): void {
    this.showDrawer = false;
    this.viewingJob = null;
  }

  save(): void {
    this.saving = true;
    const payload = {
      ...this.form,
      orgNodeId: this.form.orgNodeId ? Number(this.form.orgNodeId) : null,
      responsibilitiesJson: this.textToJson(this.responsibilitiesText),
      requirementsJson: this.textToJson(this.requirementsText),
      skillsJson: this.textToJson(this.skillsText),
      qualificationsJson: this.textToJson(this.qualificationsText)
    };
    const request = this.editingJob
      ? this.http.put<any>(`/api/job-descriptions/${this.editingJob.id}`, payload)
      : this.http.post<any>('/api/job-descriptions', payload);

    request.subscribe({
      next: () => {
        this.saving = false;
        this.closeModal();
        this.loadJobs();
      },
      error: err => {
        this.saving = false;
        console.error('Save job failed:', err);
        alert(err.error?.message || 'فشل حفظ المسمى الوظيفي');
      }
    });
  }

  delete(id: number): void {
    if (!confirm(this.lang.t('هل أنت متأكد من حذف هذا المسمى؟', 'Are you sure you want to delete this job?'))) return;
    this.http.delete<any>(`/api/job-descriptions/${id}`).subscribe({
      next: () => {
        this.loadJobs();
        this.toast.success(this.lang.t('تم حذف المسمى الوظيفي', 'Job description deleted'));
      },
      error: err => {
        if (err.status === 409) {
          alert(err.error?.message || 'لا يمكن الحذف — المسمى مرتبط ببيانات أخرى');
          return;
        }
        const msg = err.error?.message || err.error?.title || this.lang.t('تعذر حذف المسمى الوظيفي', 'Failed to delete job description');
        console.error('Delete job failed:', err.status, msg);
        this.toast.error(msg);
      }
    });
  }

  savePath(): void {
    const body = {
      fromJobDescriptionId: this.pathForm.fromJobId,
      toJobDescriptionId: this.pathForm.toJobId,
      minMonthsRequired: this.pathForm.minMonthsRequired,
      notes: this.pathForm.notes || null
    };
    this.http.post<{success:boolean; data:any}>('/api/career-paths', body).subscribe({
      next: () => {
        this.showPathModal = false;
        this.loadPaths();
      },
      error: err => {
        const msg = err.error?.message || 'فشل الحفظ';
        alert(msg);
      }
    });
  }

  deletePath(id: number): void {
    if (!confirm(this.lang.t('هل أنت متأكد من حذف هذا المسار؟', 'Are you sure you want to delete this path?'))) return;
    this.http.delete('/api/career-paths/' + id).subscribe({
      next: () => this.loadPaths(),
      error: err => { console.error('Delete path:', err.status); }
    });
  }

  closeModal(): void {
    this.showModal = false;
    this.saving = false;
  }

  applyFilter(): void {
    const term = this.searchTerm.trim().toLowerCase();
    this.filteredJobs = this.jobs.filter(job => {
      const matchesTerm = !term ||
        (job.titleAr ?? '').toLowerCase().includes(term) ||
        (job.titleEn ?? '').toLowerCase().includes(term) ||
        (job.grade ?? '').toLowerCase().includes(term);
      const matchesGrade = !this.filterGrade || job.grade === this.filterGrade;
      return matchesTerm && matchesGrade;
    });
  }

  getNodeName(id: number | string | null): string {
    const node = this.orgNodes.find(item => Number(item.id) === Number(id));
    if (!node) return '—';
    return this.lang.isAr ? (node.nameAr ?? node.nameEn ?? '—') : (node.nameEn ?? node.nameAr ?? '—');
  }

  getJobLabel(id: number | string | null): string {
    const job = this.jobs.find(item => Number(item.id) === Number(id));
    if (!job) return '—';
    return this.lang.isAr ? (job.titleAr ?? job.titleEn ?? '—') : (job.titleEn ?? job.titleAr ?? '—');
  }

  parseJson(str: string | null | undefined): string[] {
    try {
      const parsed = JSON.parse(str || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private emptyForm(): any {
    return {
      titleAr: '',
      titleEn: '',
      grade: '',
      minSalary: 0,
      maxSalary: 0,
      orgNodeId: null,
      responsibilitiesJson: '[]',
      requirementsJson: '[]',
      skillsJson: '[]',
      qualificationsJson: '[]',
      isActive: true
    };
  }

  private textToJson(value: string): string {
    return JSON.stringify(value.split(/\r?\n/).map(item => item.trim()).filter(Boolean));
  }

  private jsonToText(value: string): string {
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed.join('\n') : '';
    } catch {
      return '';
    }
  }

  private flattenNodes(nodes: any[]): any[] {
    return nodes.flatMap(node => [node, ...this.flattenNodes(node.children ?? [])]);
  }
}
