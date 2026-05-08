import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiResponse } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { LangService } from '../../core/services/lang.service';
import { RoleAccessService } from '../../core/services/role-access.service';
import { ToastService } from '../../core/services/toast.service';

type TabKey = 'dashboard' | 'requests' | 'candidates' | 'pipeline' | 'interviews' | 'offers' | 'approvals' | 'reports';

type PagedResponse<T> = ApiResponse<T> & {
  meta?: { total?: number; page?: number; pageSize?: number; totalPages?: number };
};

interface Stage {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string;
  stageOrder: number;
  isHired?: boolean;
  isRejected?: boolean;
}

interface RecruitmentRequest {
  id: number;
  requestNumber: string;
  titleAr: string;
  titleEn: string;
  status: string;
  urgency: string;
  requiredHeadcount: number;
  filledHeadcount: number;
  departmentNameAr?: string;
  departmentNameEn?: string;
  jobProfileTitleAr?: string;
  jobProfileTitleEn?: string;
}

interface Candidate {
  id: number;
  candidateNumber: string;
  fullNameAr: string;
  fullNameEn: string;
  email?: string;
  phone?: string;
  source?: string;
  rating?: number;
  status: string;
  stageCode?: string;
  stageNameAr?: string;
  stageNameEn?: string;
  requestTitleAr?: string;
  requestTitleEn?: string;
}

interface Interview {
  id: number;
  candidateNameAr?: string;
  candidateNameEn?: string;
  interviewType: string;
  scheduledAt: string;
  status: string;
}

interface Offer {
  id: number;
  candidateNameAr?: string;
  candidateNameEn?: string;
  salary: string;
  joiningDate: string;
  status: string;
}

interface Dashboard {
  openPositions: number;
  totalCandidates: number;
  upcomingInterviews: number;
  hiredCandidates: number;
  offerAcceptanceRate: number;
  candidatesByStage: Array<Stage & { count: number }>;
  offersByStatus: Array<{ status: string; count: number }>;
}

interface Option {
  id: number;
  titleAr?: string;
  titleEn?: string;
  nameAr?: string;
  nameEn?: string;
  code?: string;
}

@Component({
  selector: 'app-recruitment',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './recruitment.component.html',
  styleUrl: './recruitment.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecruitmentComponent implements OnInit {
  activeTab: TabKey = 'dashboard';
  loading = false;
  saving = false;
  error = '';
  query = '';

  dashboard: Dashboard | null = null;
  requests: RecruitmentRequest[] = [];
  candidates: Candidate[] = [];
  stages: Stage[] = [];
  interviews: Interview[] = [];
  offers: Offer[] = [];
  approvals: any[] = [];
  reports: any = null;
  jobProfiles: Option[] = [];
  departments: Option[] = [];
  employees: Option[] = [];

  candidateDrawer = false;
  requestDrawer = false;
  interviewDrawer = false;
  offerDrawer = false;
  selectedCandidate: any = null;

  page = 1;
  pageSize = 20;
  total = 0;
  totalPages = 1;

  candidateForm = {
    fullNameAr: '',
    fullNameEn: '',
    email: '',
    phone: '',
    nationality: 'أردني',
    source: 'referral',
    yearsOfExperience: 3,
    expectedSalary: 900,
    recruitmentRequestId: null as number | null,
  };

  requestForm = {
    titleAr: '',
    titleEn: '',
    jobProfileId: null as number | null,
    departmentId: null as number | null,
    managerEmployeeId: null as number | null,
    requiredHeadcount: 1,
    hiringReason: 'growth',
    employmentType: 'full_time',
    minSalary: 600,
    maxSalary: 1200,
    urgency: 'normal',
    expectedJoiningDate: '',
  };

  interviewForm = {
    candidateId: null as number | null,
    interviewType: 'hr',
    scheduledAt: '',
    durationMinutes: 60,
    location: '',
    meetingUrl: '',
  };

  offerForm = {
    candidateId: null as number | null,
    salary: 900,
    joiningDate: '',
    status: 'pending_approval',
  };

  readonly tabs: Array<{ key: TabKey; icon: string; ar: string; en: string }> = [
    { key: 'dashboard', icon: 'dashboard', ar: 'لوحة التوظيف', en: 'Dashboard' },
    { key: 'requests', icon: 'assignment', ar: 'طلبات التوظيف', en: 'Requests' },
    { key: 'candidates', icon: 'person_search', ar: 'المرشحون', en: 'Candidates' },
    { key: 'pipeline', icon: 'view_kanban', ar: 'مسار التوظيف', en: 'Pipeline' },
    { key: 'interviews', icon: 'event', ar: 'المقابلات', en: 'Interviews' },
    { key: 'offers', icon: 'local_offer', ar: 'العروض', en: 'Offers' },
    { key: 'approvals', icon: 'approval', ar: 'الاعتمادات', en: 'Approvals' },
    { key: 'reports', icon: 'monitoring', ar: 'التقارير', en: 'Reports' },
  ];

  private readonly tabArByKey: Record<TabKey, string> = {
    dashboard: 'لوحة التوظيف',
    requests: 'طلبات التوظيف',
    candidates: 'المرشحون',
    pipeline: 'مسار التوظيف',
    interviews: 'المقابلات',
    offers: 'العروض',
    approvals: 'الاعتمادات',
    reports: 'التقارير',
  };

  private readonly stageArByCode: Record<string, string> = {
    applied: 'تم التقديم',
    screening: 'الفرز الأولي',
    hr_interview: 'مقابلة الموارد البشرية',
    technical_interview: 'المقابلة الفنية',
    manager_interview: 'مقابلة المدير',
    offer: 'العرض الوظيفي',
    hired: 'تم التعيين',
    rejected: 'مرفوض',
    withdrawn: 'منسحب',
  };

  private readonly arByEn: Record<string, string> = {
    'HR / Recruitment': 'الموارد البشرية / التوظيف',
    'Recruitment & Hiring Center': 'مركز التوظيف والتعيين',
    'Manage hiring requests, candidates, interviews, and offers in an ATS flow connected to job profiles.': 'إدارة طلبات التوظيف والمرشحين والمقابلات والعروض ضمن مسار توظيف متكامل مرتبط بالملفات الوظيفية.',
    'Refresh': 'تحديث',
    'Hiring request': 'طلب توظيف',
    'New candidate': 'مرشح جديد',
    'Search name, email, or request number...': 'ابحث بالاسم أو البريد أو رقم الطلب...',
    'Search': 'بحث',
    'Open positions': 'الوظائف المفتوحة',
    'Candidates': 'المرشحون',
    'Upcoming interviews': 'المقابلات القادمة',
    'Offer acceptance': 'قبول العروض',
    'Candidates by stage': 'المرشحون حسب المرحلة',
    'Hiring requests': 'طلبات التوظيف',
    'Request': 'الطلب',
    'Job': 'الوظيفة',
    'Department': 'القسم',
    'Urgency': 'الأولوية',
    'Headcount': 'العدد',
    'Status': 'الحالة',
    'Interviews': 'المقابلات',
    'Schedule interview': 'جدولة مقابلة',
    'Job offers': 'العروض الوظيفية',
    'Create offer': 'إنشاء عرض',
    'Candidate': 'المرشح',
    'Salary': 'الراتب',
    'Joining': 'المباشرة',
    'Hiring approvals': 'اعتمادات التوظيف',
    'Approve': 'اعتماد',
    'Source effectiveness': 'فعالية مصادر المرشحين',
    'Average time to hire': 'متوسط مدة التعيين',
    'Previous': 'السابق',
    'Page': 'صفحة',
    'Next': 'التالي',
    'Arabic name': 'الاسم العربي',
    'English name': 'الاسم الإنجليزي',
    'Email': 'البريد الإلكتروني',
    'Phone': 'الهاتف',
    'Source': 'المصدر',
    'Referral': 'ترشيح',
    'Career site': 'موقع الوظائف',
    'Saving...': 'حفظ...',
    'Save': 'حفظ',
    'Convert to employee': 'تحويل إلى موظف',
    'Move stage': 'تغيير المرحلة',
    'Timeline': 'الخط الزمني',
    'New hiring request': 'طلب توظيف جديد',
    'Arabic title': 'العنوان العربي',
    'English title': 'العنوان الإنجليزي',
    'Job profile': 'الملف الوظيفي',
    'Manager': 'المدير',
    'Min salary': 'أدنى راتب',
    'Max salary': 'أعلى راتب',
    'Interview type': 'نوع المقابلة',
    'HR': 'موارد بشرية',
    'Technical': 'فنية',
    'Scheduled at': 'الموعد',
    'Location': 'المكان',
    'New job offer': 'عرض وظيفي جديد',
    'Joining date': 'تاريخ المباشرة',
    'Enter Arabic and English candidate names': 'أدخل اسم المرشح بالعربية والإنجليزية',
    'Candidate created': 'تم إنشاء المرشح',
    'Enter Arabic and English request titles': 'أدخل عنوان الطلب بالعربية والإنجليزية',
    'Hiring request created': 'تم إنشاء طلب التوظيف',
    'Candidate stage updated': 'تم تحديث مرحلة المرشح',
    'Select candidate and interview time': 'اختر المرشح ووقت المقابلة',
    'Interview scheduled': 'تمت جدولة المقابلة',
    'Enter candidate, salary, and joining date': 'أدخل المرشح والراتب وتاريخ المباشرة',
    'Offer created': 'تم إنشاء العرض',
    'Approved': 'تم الاعتماد',
    'Convert candidate to employee?': 'تحويل المرشح إلى موظف؟',
    'Candidate converted to employee': 'تم تحويل المرشح إلى موظف',
    'Unable to complete the action': 'تعذر تنفيذ العملية',
  };

  constructor(
    public lang: LangService,
    public access: RoleAccessService,
    private api: ApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
  ) {}

  get canManage(): boolean {
    return this.access.isAny('hradmin', 'recruiter') || this.access.isSuperAdmin();
  }

  get canOffer(): boolean {
    return this.access.isAny('hradmin', 'payrolladmin') || this.access.isSuperAdmin();
  }

  get canViewApprovals(): boolean {
    return this.access.isAny('hradmin', 'payrolladmin', 'manager') || this.access.isSuperAdmin();
  }

  get visibleTabs(): Array<{ key: TabKey; icon: string; ar: string; en: string }> {
    return this.tabs.filter(tab => tab.key !== 'approvals' || this.canViewApprovals);
  }

  ngOnInit(): void {
    this.loadBootstrap();
    this.loadAll();
  }

  t(ar: string, en: string): string {
    return this.lang.isAr ? (this.arByEn[en] ?? ar) : en;
  }

  tabLabel(tab: { key: TabKey; ar: string; en: string }): string {
    return this.lang.isAr ? this.tabArByKey[tab.key] : tab.en;
  }

  label(item: any): string {
    if (!item) return '';
    if (this.lang.isAr && item.code && this.stageArByCode[item.code]) return this.stageArByCode[item.code];
    return this.lang.isAr
      ? (item.nameAr || item.titleAr || item.fullNameAr || item.nameEn || item.titleEn || item.fullNameEn || item.code)
      : (item.nameEn || item.titleEn || item.fullNameEn || item.nameAr || item.titleAr || item.fullNameAr || item.code);
  }

  setTab(tab: TabKey): void {
    this.activeTab = tab;
    this.page = 1;
    this.loadActive();
  }

  loadBootstrap(): void {
    this.api.get<ApiResponse<Option[]>>('/api/job-profiles/dropdown', { limit: 100 }).subscribe({ next: r => { this.jobProfiles = r.data ?? []; this.cdr.markForCheck(); } });
    this.api.get<ApiResponse<Option[]>>('/api/departments').subscribe({ next: r => { this.departments = r.data ?? []; this.cdr.markForCheck(); } });
    this.api.get<ApiResponse<any[]>>('/api/employees').subscribe({ next: r => { this.employees = (r.data ?? []).map(e => ({ id: e.id, nameAr: e.fullNameAr || `${e.firstNameAr ?? ''} ${e.lastNameAr ?? ''}`.trim(), nameEn: e.fullNameEn || `${e.firstNameEn ?? ''} ${e.lastNameEn ?? ''}`.trim(), code: e.employeeCode })); this.cdr.markForCheck(); } });
  }

  loadAll(): void {
    this.loadDashboard();
    this.loadStages();
    this.loadRequests();
    this.loadCandidates();
    this.loadInterviews();
    this.loadOffers();
    if (this.canViewApprovals) this.loadApprovals();
    this.loadReports();
  }

  loadActive(): void {
    const loaders: Record<TabKey, () => void> = {
      dashboard: () => this.loadDashboard(),
      requests: () => this.loadRequests(),
      candidates: () => this.loadCandidates(),
      pipeline: () => { this.loadStages(); this.loadCandidates(); },
      interviews: () => this.loadInterviews(),
      offers: () => this.loadOffers(),
      approvals: () => this.loadApprovals(),
      reports: () => this.loadReports(),
    };
    loaders[this.activeTab]();
  }

  loadDashboard(): void {
    this.loading = this.activeTab === 'dashboard';
    this.api.get<ApiResponse<Dashboard>>('/api/recruitment/dashboard')
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({ next: r => this.dashboard = r.data, error: e => this.setError(e) });
  }

  loadStages(): void {
    this.api.get<ApiResponse<Stage[]>>('/api/recruitment/pipeline/stages')
      .subscribe({ next: r => { this.stages = r.data ?? []; this.cdr.markForCheck(); }, error: e => this.setError(e) });
  }

  loadRequests(): void {
    this.loading = this.activeTab === 'requests';
    this.api.get<PagedResponse<RecruitmentRequest[]>>('/api/recruitment/requests', { page: this.page, pageSize: this.pageSize, q: this.query })
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({ next: r => this.applyPage(r, 'requests'), error: e => this.setError(e) });
  }

  loadCandidates(): void {
    this.loading = this.activeTab === 'candidates' || this.activeTab === 'pipeline';
    this.api.get<PagedResponse<Candidate[]>>('/api/recruitment/candidates', { page: this.page, pageSize: this.pageSize, q: this.query })
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({ next: r => this.applyPage(r, 'candidates'), error: e => this.setError(e) });
  }

  loadInterviews(): void {
    this.loading = this.activeTab === 'interviews';
    this.api.get<PagedResponse<Interview[]>>('/api/recruitment/interviews', { page: this.page, pageSize: this.pageSize })
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({ next: r => this.applyPage(r, 'interviews'), error: e => this.setError(e) });
  }

  loadOffers(): void {
    this.loading = this.activeTab === 'offers';
    this.api.get<ApiResponse<Offer[]>>('/api/recruitment/offers')
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({ next: r => this.offers = r.data ?? [], error: e => this.setError(e) });
  }

  loadApprovals(): void {
    if (!this.canViewApprovals) {
      this.approvals = [];
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }
    this.loading = this.activeTab === 'approvals';
    this.api.get<ApiResponse<any[]>>('/api/recruitment/approvals')
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({ next: r => this.approvals = r.data ?? [], error: e => this.setError(e) });
  }

  loadReports(): void {
    this.loading = this.activeTab === 'reports';
    this.api.get<ApiResponse<any>>('/api/recruitment/reports')
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({ next: r => this.reports = r.data, error: e => this.setError(e) });
  }

  applyPage<T>(res: PagedResponse<T[]>, target: 'requests' | 'candidates' | 'interviews'): void {
    (this as any)[target] = res.data ?? [];
    this.total = res.meta?.total ?? (res.data?.length ?? 0);
    this.totalPages = res.meta?.totalPages ?? Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  search(): void {
    this.page = 1;
    this.loadActive();
  }

  changePage(delta: number): void {
    const next = Math.max(1, Math.min(this.totalPages, this.page + delta));
    if (next === this.page) return;
    this.page = next;
    this.loadActive();
  }

  openCandidate(candidate?: Candidate): void {
    this.selectedCandidate = null;
    if (!candidate) {
      this.candidateForm = { fullNameAr: '', fullNameEn: '', email: '', phone: '', nationality: 'أردني', source: 'referral', yearsOfExperience: 3, expectedSalary: 900, recruitmentRequestId: null };
      this.candidateDrawer = true;
      return;
    }
    this.candidateDrawer = true;
    this.api.get<ApiResponse<any>>(`/api/recruitment/candidates/${candidate.id}`).subscribe({
      next: r => { this.selectedCandidate = r.data; this.cdr.markForCheck(); },
      error: e => this.setError(e)
    });
  }

  createCandidate(): void {
    if (!this.candidateForm.fullNameAr.trim() || !this.candidateForm.fullNameEn.trim()) {
      this.toast.warning(this.t('أدخل اسم المرشح بالعربية والإنجليزية', 'Enter Arabic and English candidate names'));
      return;
    }
    this.saving = true;
    this.api.post<ApiResponse<Candidate>>('/api/recruitment/candidates', this.candidateForm)
      .pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => { this.toast.success(this.t('تم إنشاء المرشح', 'Candidate created')); this.candidateDrawer = false; this.loadCandidates(); this.loadDashboard(); },
        error: e => this.setError(e)
      });
  }

  createRequest(): void {
    if (!this.requestForm.titleAr.trim() || !this.requestForm.titleEn.trim()) {
      this.toast.warning(this.t('أدخل عنوان الطلب بالعربية والإنجليزية', 'Enter Arabic and English request titles'));
      return;
    }
    this.saving = true;
    this.api.post<ApiResponse<RecruitmentRequest>>('/api/recruitment/requests', this.requestForm)
      .pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => { this.toast.success(this.t('تم إنشاء طلب التوظيف', 'Hiring request created')); this.requestDrawer = false; this.loadRequests(); this.loadDashboard(); this.loadApprovals(); },
        error: e => this.setError(e)
      });
  }

  moveCandidate(candidate: Candidate, stage: Stage): void {
    this.api.patch<ApiResponse<Candidate>>(`/api/recruitment/candidates/${candidate.id}/move`, { toStageId: stage.id })
      .subscribe({
        next: () => { this.toast.success(this.t('تم تحديث مرحلة المرشح', 'Candidate stage updated')); this.loadCandidates(); this.loadDashboard(); },
        error: e => this.setError(e)
      });
  }

  scheduleInterview(): void {
    if (!this.interviewForm.candidateId || !this.interviewForm.scheduledAt) {
      this.toast.warning(this.t('اختر المرشح ووقت المقابلة', 'Select candidate and interview time'));
      return;
    }
    this.saving = true;
    this.api.post<ApiResponse<Interview>>('/api/recruitment/interviews', this.interviewForm)
      .pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => { this.toast.success(this.t('تمت جدولة المقابلة', 'Interview scheduled')); this.interviewDrawer = false; this.loadInterviews(); this.loadDashboard(); },
        error: e => this.setError(e)
      });
  }

  createOffer(): void {
    if (!this.offerForm.candidateId || !this.offerForm.joiningDate || !this.offerForm.salary) {
      this.toast.warning(this.t('أدخل المرشح والراتب وتاريخ المباشرة', 'Enter candidate, salary, and joining date'));
      return;
    }
    this.saving = true;
    this.api.post<ApiResponse<Offer>>('/api/recruitment/offers', this.offerForm)
      .pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => { this.toast.success(this.t('تم إنشاء العرض', 'Offer created')); this.offerDrawer = false; this.loadOffers(); },
        error: e => this.setError(e)
      });
  }

  approveRequest(row: any): void {
    this.api.patch<ApiResponse<any>>(`/api/recruitment/requests/${row.recruitmentRequestId}/approve`, {})
      .subscribe({ next: () => { this.toast.success(this.t('تم الاعتماد', 'Approved')); this.loadApprovals(); this.loadRequests(); }, error: e => this.setError(e) });
  }

  convert(candidate: any): void {
    if (!confirm(this.t('تحويل المرشح إلى موظف؟', 'Convert candidate to employee?'))) return;
    this.api.post<ApiResponse<any>>(`/api/recruitment/candidates/${candidate.id}/convert-to-employee`, {})
      .subscribe({ next: () => { this.toast.success(this.t('تم تحويل المرشح إلى موظف', 'Candidate converted to employee')); this.candidateDrawer = false; this.loadCandidates(); }, error: e => this.setError(e) });
  }

  candidatesForStage(stage: Stage): Candidate[] {
    return this.candidates.filter(c => c.stageCode === stage.code || c.stageNameEn === stage.nameEn || c.stageNameAr === stage.nameAr);
  }

  closeDrawers(): void {
    this.candidateDrawer = false;
    this.requestDrawer = false;
    this.interviewDrawer = false;
    this.offerDrawer = false;
    this.selectedCandidate = null;
  }

  private setError(err: any): void {
    this.error = err?.error?.message || this.t('تعذر تنفيذ العملية', 'Unable to complete the action');
    this.toast.error(this.error);
  }
}
