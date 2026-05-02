import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { getErrorMessage } from '../../core/utils/error-message';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface PreEmploymentDetails {
  id: number;
  employeeId: number;
  employeeCode: string;
  employeeNameAr: string;
  employeeNameEn: string;
  departmentAr?: string;
  departmentEn?: string;
  jobTitleAr?: string;
  jobTitleEn?: string;
  probationStartDate: string;
  probationEndDate: string;
  evaluationStatus: string;
  performanceRating?: number | null;
  evaluationDate?: string | null;
  evaluationNotes?: string | null;
  outcome?: string | null;
  sscRegistered: boolean;
  sscStatus?: string | null;
  policeClearanceProvided?: boolean;
  medicalCertificateProvided?: boolean;
}

interface ProbationEvaluationRecord {
  id: number;
  employeeId: number;
  evaluationStage: string;
  evaluationDate?: string;
  commitmentScore: number;
  overallComments?: string | null;
}

interface EvaluationSection {
  key: 'month1' | 'month2' | 'month3';
  labelAr: string;
  labelEn: string;
  evaluationId: number | null;
  rating: number | null;
  notes: string;
}

@Component({
  selector: 'app-pre-employment-evaluation',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './pre-employment-evaluation.component.html',
  styleUrl: './pre-employment-evaluation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PreEmploymentEvaluationComponent implements OnInit {
  record = signal<PreEmploymentDetails | null>(null);
  loading = signal(true);
  saving = signal(false);
  error = signal('');
  formError = signal('');
  attempted = signal(false);

  employeeId = 0;
  sections: EvaluationSection[] = [
    { key: 'month1', labelAr: 'الشهر الأول', labelEn: 'Month 1', evaluationId: null, rating: null, notes: '' },
    { key: 'month2', labelAr: 'الشهر الثاني', labelEn: 'Month 2', evaluationId: null, rating: null, notes: '' },
    { key: 'month3', labelAr: 'الشهر الثالث', labelEn: 'Month 3', evaluationId: null, rating: null, notes: '' }
  ];

  requirements = {
    policeClearance: false,
    medicalCertificate: false,
    socialSecurityRegistered: false
  };

  finalDecision = '';
  summaryNotes = '';

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private route: ActivatedRoute,
    private router: Router,
    private toast: ToastService
  ) {}

  get lang() {
    return this.auth.lang;
  }

  ngOnInit() {
    this.employeeId = Number(this.route.snapshot.paramMap.get('employeeId'));
    this.load();
  }

  t(ar: string, en: string) {
    return this.lang === 'ar' ? ar : en;
  }

  load() {
    if (!this.employeeId) {
      this.error.set(this.t('معرّف الموظف غير صالح.', 'Invalid employee id.'));
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set('');

    forkJoin({
      record: this.api.get<ApiResponse<PreEmploymentDetails>>(`/api/pre-employment/by-employee/${this.employeeId}`),
      evaluations: this.api.get<ApiResponse<ProbationEvaluationRecord[]>>('/api/probation/evaluations', { employeeId: this.employeeId })
    }).subscribe({
      next: ({ record, evaluations }) => {
        const details = record.data;
        this.record.set(details);
        this.requirements = {
          policeClearance: !!details?.policeClearanceProvided,
          medicalCertificate: !!details?.medicalCertificateProvided,
          socialSecurityRegistered: !!details?.sscRegistered
        };
        this.finalDecision = this.toDecision(details?.evaluationStatus, details?.outcome);
        this.summaryNotes = details?.evaluationNotes ?? '';
        this.applyExistingEvaluations(evaluations.data ?? []);
        this.loading.set(false);
      },
      error: apiError => {
        this.error.set(getErrorMessage(apiError, this.t('تعذر تحميل صفحة تقييم التجربة.', 'Failed to load probation evaluation page.')));
        this.loading.set(false);
      }
    });
  }

  applyExistingEvaluations(evaluations: ProbationEvaluationRecord[]) {
    const byStage = new Map(evaluations.map(item => [item.evaluationStage, item]));
    this.sections = this.sections.map(section => {
      const existing = byStage.get(section.key);
      return {
        ...section,
        evaluationId: existing?.id ?? null,
        rating: existing?.commitmentScore ?? null,
        notes: existing?.overallComments ?? ''
      };
    });
  }

  save() {
    this.attempted.set(true);
    this.formError.set('');
    const record = this.record();

    if (!record) {
      return;
    }

    const invalidSection = this.sections.find(section => !section.rating || section.rating < 1 || section.rating > 5);
    if (invalidSection || !this.finalDecision) {
      this.formError.set(this.t('يرجى استكمال تقييم الأشهر الثلاثة واختيار القرار النهائي.', 'Please complete all three monthly evaluations and choose a final decision.'));
      return;
    }

    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    const today = new Date().toISOString().slice(0, 10);
    const stageRequests = this.sections.map(section => {
      const payload = {
        employeeId: this.employeeId,
        evaluationStage: section.key,
        evaluationDate: today,
        commitmentScore: section.rating,
        workQualityScore: section.rating,
        learningScore: section.rating,
        behaviorScore: section.rating,
        teamworkScore: section.rating,
        commitmentNotes: section.notes || null,
        workQualityNotes: section.notes || null,
        learningNotes: section.notes || null,
        behaviorNotes: section.notes || null,
        teamworkNotes: section.notes || null,
        overallComments: section.notes || null,
        evaluatedBy: this.auth.currentUser()?.username ?? null,
        recommendation: section.key === 'month3' ? this.mapDecisionToRecommendation(this.finalDecision) : 'continue'
      };

      return section.evaluationId
        ? this.api.put<ApiResponse<any>>(`/api/probation/evaluations/${section.evaluationId}`, payload)
        : this.api.post<ApiResponse<any>>('/api/probation/evaluations', payload);
    });

    const averageRating = Math.round(
      this.sections.reduce((sum, section) => sum + (section.rating ?? 0), 0) / this.sections.length
    );

    const summaryRequest = this.api.put<ApiResponse<any>>(`/api/pre-employment/${record.id}/evaluate`, {
      evaluationStatus: this.mapDecisionToStatus(this.finalDecision),
      evaluationDate: today,
      performanceRating: averageRating,
      evaluationNotes: this.summaryNotes.trim() || null,
      outcome: this.finalDecision,
      policeClearanceProvided: this.requirements.policeClearance,
      medicalCertificateProvided: this.requirements.medicalCertificate,
      sscRegistered: this.requirements.socialSecurityRegistered
    });

    forkJoin([...stageRequests, summaryRequest]).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(this.t('تم حفظ تقييم فترة التجربة بنجاح.', 'Probation evaluation saved successfully.'));
        this.load();
      },
      error: apiError => {
        this.saving.set(false);
        const message = getErrorMessage(apiError, this.t('تعذر حفظ تقييم فترة التجربة.', 'Failed to save probation evaluation.'));
        this.formError.set(message);
        this.toast.error(message);
      }
    });
  }

  goBack() {
    this.router.navigate(['/app/pre-employment']);
  }

  employeeName() {
    const record = this.record();
    if (!record) {
      return '—';
    }
    return this.lang === 'ar' ? record.employeeNameAr : record.employeeNameEn || record.employeeNameAr;
  }

  departmentName() {
    const record = this.record();
    if (!record) {
      return '—';
    }
    return this.lang === 'ar' ? record.departmentAr || '—' : record.departmentEn || record.departmentAr || '—';
  }

  jobTitle() {
    const record = this.record();
    if (!record) {
      return '—';
    }
    return this.lang === 'ar' ? record.jobTitleAr || '—' : record.jobTitleEn || record.jobTitleAr || '—';
  }

  statusLabel(status?: string | null) {
    const labels: Record<string, { ar: string; en: string }> = {
      pending: { ar: 'قيد التجربة', en: 'In Probation' },
      passed: { ar: 'تم التثبيت', en: 'Confirmed' },
      extended: { ar: 'تمديد', en: 'Extended' },
      failed: { ar: 'مرفوض', en: 'Rejected' }
    };
    const value = status ? labels[status] : null;
    return value ? this.t(value.ar, value.en) : '—';
  }

  statusClass(status?: string | null) {
    const classes: Record<string, string> = {
      pending: 'warning',
      passed: 'success',
      extended: 'info',
      failed: 'danger'
    };
    return status ? classes[status] ?? 'neutral' : 'neutral';
  }

  sectionLabel(section: EvaluationSection) {
    return this.lang === 'ar' ? section.labelAr : section.labelEn;
  }

  private mapDecisionToStatus(decision: string) {
    const map: Record<string, string> = {
      confirm: 'passed',
      extend: 'extended',
      reject: 'failed'
    };
    return map[decision] ?? 'pending';
  }

  private mapDecisionToRecommendation(decision: string) {
    const map: Record<string, string> = {
      confirm: 'confirm',
      extend: 'needs_improvement',
      reject: 'not_recommended'
    };
    return map[decision] ?? 'continue';
  }

  private toDecision(status?: string | null, outcome?: string | null) {
    if (outcome === 'confirm' || outcome === 'extend' || outcome === 'reject') {
      return outcome;
    }

    const map: Record<string, string> = {
      passed: 'confirm',
      extended: 'extend',
      failed: 'reject'
    };

    return status ? map[status] ?? '' : '';
  }
}
