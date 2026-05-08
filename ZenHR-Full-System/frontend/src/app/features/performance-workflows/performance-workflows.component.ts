import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiResponse } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { LangService } from '../../core/services/lang.service';
import { ToastService } from '../../core/services/toast.service';

type TabKey = 'dashboard' | 'cycles' | 'goals' | 'evaluations' | 'policies' | 'designer' | 'inbox' | 'escalations' | 'promotions' | 'analytics';

@Component({
  selector: 'app-performance-workflows',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './performance-workflows.component.html',
  styleUrl: './performance-workflows.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PerformanceWorkflowsComponent implements OnInit {
  activeTab: TabKey = 'dashboard';
  loading = false;
  saving = false;
  error = '';

  dashboard: any = null;
  analytics: any = null;
  policies: any[] = [];
  cycles: any[] = [];
  goals: any[] = [];
  evaluations: any[] = [];
  templates: any[] = [];
  inbox: any[] = [];
  escalations: any[] = [];
  promotions: any[] = [];
  employees: any[] = [];

  drawer: '' | 'cycle' | 'goal' | 'evaluation' | 'policy' | 'template' | 'promotion' = '';

  cycleForm = {
    code: '',
    nameAr: '',
    nameEn: '',
    cycleType: 'annual',
    periodStart: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
    periodEnd: new Date(new Date().getFullYear(), 11, 31).toISOString().slice(0, 10),
    dueDate: '',
    status: 'draft'
  };

  goalForm = {
    employeeId: null as number | null,
    scopeType: 'employee',
    titleAr: '',
    titleEn: '',
    targetValue: 100,
    actualValue: 0,
    weight: 20,
    status: 'not_started'
  };

  evaluationForm = {
    employeeId: null as number | null,
    evaluationType: 'manager',
    selfScore: null as number | null,
    managerScore: 80,
    hrScore: null as number | null,
    finalScore: null as number | null,
    recommendation: 'none',
    strengthsAr: '',
    strengthsEn: '',
    improvementAr: '',
    improvementEn: ''
  };

  policyForm = {
    code: '',
    nameAr: '',
    nameEn: '',
    policyType: 'numeric',
    minScore: 0,
    maxScore: 100,
    passingScore: 60
  };

  templateForm = {
    code: '',
    nameAr: '',
    nameEn: '',
    entityType: 'performance_evaluation',
    slaHours: 72
  };

  promotionForm = {
    employeeId: null as number | null,
    evaluationId: null as number | null,
    incrementAmount: 0,
    incrementPercent: 0,
    recommendedSalary: null as number | null,
    effectiveDate: '',
    reasonAr: '',
    reasonEn: ''
  };

  tabs: Array<{ key: TabKey; ar: string; en: string; icon: string }> = [
    { key: 'dashboard', ar: 'لوحة الأداء', en: 'Dashboard', icon: 'analytics' },
    { key: 'cycles', ar: 'دورات التقييم', en: 'Cycles', icon: 'event_repeat' },
    { key: 'goals', ar: 'الأهداف والمؤشرات', en: 'KPIs & Goals', icon: 'track_changes' },
    { key: 'evaluations', ar: 'تقييمات الموظفين', en: 'Evaluations', icon: 'fact_check' },
    { key: 'policies', ar: 'سياسات التقييم', en: 'Rating Policies', icon: 'tune' },
    { key: 'designer', ar: 'مصمم سير العمل', en: 'Workflow Designer', icon: 'account_tree' },
    { key: 'inbox', ar: 'مركز الاعتمادات', en: 'Approvals Center', icon: 'approval' },
    { key: 'escalations', ar: 'التصعيدات', en: 'Escalations', icon: 'priority_high' },
    { key: 'promotions', ar: 'الترقيات والزيادات', en: 'Promotions', icon: 'trending_up' },
    { key: 'analytics', ar: 'تحليلات الأداء', en: 'Analytics', icon: 'query_stats' }
  ];

  constructor(
    private api: ApiService,
    private lang: LangService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadAll();
  }

  get isAr() { return this.lang.isAr; }
  private readonly arByEn: Record<string, string> = {
    Dashboard: 'لوحة الأداء',
    Cycles: 'دورات التقييم',
    'KPIs & Goals': 'الأهداف والمؤشرات',
    Evaluations: 'تقييمات الموظفين',
    'Rating Policies': 'سياسات التقييم',
    'Workflow Designer': 'مصمم سير العمل',
    'Approvals Center': 'مركز الاعتمادات',
    Escalations: 'التصعيدات',
    Promotions: 'الترقيات والزيادات',
    Analytics: 'تحليلات الأداء',
    Approve: 'اعتماد',
    Reject: 'رفض',
    'No pending approvals.': 'لا توجد اعتمادات معلقة.'
  };
  t(ar: string, en: string) { return this.isAr ? (this.arByEn[en] || ar) : en; }
  activeTabLabel() {
    const tab = this.tabs.find(item => item.key === this.activeTab);
    return tab ? this.t(tab.ar, tab.en) : '';
  }
  label(item: any, arKey = 'nameAr', enKey = 'nameEn') { return this.isAr ? (item?.[arKey] || item?.[enKey] || '-') : (item?.[enKey] || item?.[arKey] || '-'); }
  get currentRole(): string {
    try { return JSON.parse(localStorage.getItem('zenjo_user') || '{}')?.role || ''; } catch { return ''; }
  }
  get canLoadApprovalInbox(): boolean { return ['hradmin', 'manager'].includes(this.currentRole); }
  get canLoadEscalations(): boolean { return this.currentRole === 'hradmin'; }
  get canLoadPromotions(): boolean { return ['hradmin', 'payrolladmin'].includes(this.currentRole); }

  setTab(tab: TabKey) {
    this.activeTab = tab;
    this.cdr.markForCheck();
  }

  loadAll() {
    this.loading = true;
    this.error = '';
    const jobs: Array<() => void> = [
      () => this.api.get<ApiResponse<any>>('/api/performance/dashboard').subscribe({ next: r => { this.dashboard = r.data; done(); }, error: fail }),
      () => this.api.get<ApiResponse<any>>('/api/performance/analytics').subscribe({ next: r => { this.analytics = r.data; done(); }, error: fail }),
      () => this.api.get<ApiResponse<any[]>>('/api/performance/rating-policies').subscribe({ next: r => { this.policies = r.data || []; done(); }, error: fail }),
      () => this.api.get<ApiResponse<any[]>>('/api/performance/cycles').subscribe({ next: r => { this.cycles = r.data || []; done(); }, error: fail }),
      () => this.api.get<ApiResponse<any[]>>('/api/performance/goals').subscribe({ next: r => { this.goals = r.data || []; done(); }, error: fail }),
      () => this.api.get<ApiResponse<any[]>>('/api/performance/evaluations').subscribe({ next: r => { this.evaluations = r.data || []; done(); }, error: fail }),
      () => this.api.get<ApiResponse<any[]>>('/api/performance/workflow-templates').subscribe({ next: r => { this.templates = r.data || []; done(); }, error: fail }),
    ];
    if (this.canLoadApprovalInbox) jobs.push(() => this.api.get<ApiResponse<any[]>>('/api/performance/approvals/pending').subscribe({ next: r => { this.inbox = r.data || []; done(); }, error: fail }));
    if (this.canLoadEscalations) jobs.push(() => this.api.get<ApiResponse<any[]>>('/api/performance/escalations').subscribe({ next: r => { this.escalations = r.data || []; done(); }, error: fail }));
    if (this.canLoadPromotions) jobs.push(() => this.api.get<ApiResponse<any[]>>('/api/performance/promotions').subscribe({ next: r => { this.promotions = r.data || []; done(); }, error: fail }));

    let pending = jobs.length;
    const done = () => {
      pending--;
      if (pending <= 0) {
        this.loading = false;
        this.cdr.markForCheck();
      }
    };
    const fail = (e: any) => {
      this.error = e?.error?.message || this.t('تعذر تحميل بيانات الأداء وسير العمل.', 'Failed to load performance workflow data.');
      done();
    };
    jobs.forEach(job => job());
    this.api.get<ApiResponse<any[]>>('/api/employees', { pageSize: 100 }).subscribe({ next: r => { this.employees = r.data || []; this.cdr.markForCheck(); }, error: () => {} });
  }

  open(kind: typeof this.drawer) {
    this.drawer = kind;
    this.cdr.markForCheck();
  }

  close() {
    this.drawer = '';
    this.cdr.markForCheck();
  }

  save() {
    if (!this.drawer) return;
    this.saving = true;
    const map: Record<string, { url: string; body: any; successAr: string; successEn: string }> = {
      cycle: { url: '/api/performance/cycles', body: this.cycleForm, successAr: 'تم إنشاء دورة التقييم.', successEn: 'Evaluation cycle created.' },
      goal: { url: '/api/performance/goals', body: this.goalForm, successAr: 'تم إنشاء الهدف.', successEn: 'Goal created.' },
      evaluation: { url: '/api/performance/evaluations', body: this.evaluationForm, successAr: 'تم إنشاء التقييم.', successEn: 'Evaluation created.' },
      policy: { url: '/api/performance/rating-policies', body: this.policyForm, successAr: 'تم إنشاء سياسة التقييم.', successEn: 'Rating policy created.' },
      template: { url: '/api/performance/workflow-templates', body: this.templateForm, successAr: 'تم إنشاء قالب سير العمل.', successEn: 'Workflow template created.' },
      promotion: { url: '/api/performance/promotions', body: this.promotionForm, successAr: 'تم إنشاء توصية الترقية.', successEn: 'Promotion recommendation created.' }
    };
    const item = map[this.drawer];
    this.api.post<ApiResponse<any>>(item.url, item.body).pipe(finalize(() => {
      this.saving = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => {
        this.toast.success(this.t(item.successAr, item.successEn));
        this.close();
        this.loadAll();
      },
      error: e => this.toast.error(e?.error?.message || this.t('تعذر الحفظ.', 'Save failed.'))
    });
  }

  submitEvaluation(item: any) {
    this.saving = true;
    this.api.post<ApiResponse<any>>(`/api/performance/evaluations/${item.id}/submit`, {}).pipe(finalize(() => {
      this.saving = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => { this.toast.success(this.t('تم إرسال التقييم للاعتماد.', 'Evaluation submitted for approval.')); this.loadAll(); },
      error: e => this.toast.error(e?.error?.message || this.t('تعذر إرسال التقييم.', 'Submit failed.'))
    });
  }

  decide(item: any, action: 'approve' | 'reject') {
    this.saving = true;
    this.api.post<ApiResponse<any>>(`/api/performance/workflow-instances/${item.id}/${action}`, {}).pipe(finalize(() => {
      this.saving = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => { this.toast.success(action === 'approve' ? this.t('تم الاعتماد.', 'Approved.') : this.t('تم الرفض.', 'Rejected.')); this.loadAll(); },
      error: e => this.toast.error(e?.error?.message || this.t('تعذر تنفيذ الإجراء.', 'Action failed.'))
    });
  }

  processEscalations() {
    this.saving = true;
    this.api.post<ApiResponse<any>>('/api/performance/escalations/process', {}).pipe(finalize(() => {
      this.saving = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => { this.toast.success(this.t('تمت معالجة التصعيدات.', 'Escalations processed.')); this.loadAll(); },
      error: e => this.toast.error(e?.error?.message || this.t('تعذر معالجة التصعيدات.', 'Escalation processing failed.'))
    });
  }
}
