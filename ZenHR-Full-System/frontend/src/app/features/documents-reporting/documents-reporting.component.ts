import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { ApiResponse } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { LangService } from '../../core/services/lang.service';
import { ToastService } from '../../core/services/toast.service';

type TabKey = 'dashboard' | 'documents' | 'forms' | 'submissions' | 'templates' | 'reports' | 'scheduled' | 'exports' | 'history' | 'analytics';

@Component({
  selector: 'app-documents-reporting',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './documents-reporting.component.html',
  styleUrl: './documents-reporting.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DocumentsReportingComponent implements OnInit {
  activeTab: TabKey = 'dashboard';
  loading = false;
  saving = false;
  error = '';

  dashboard: any = null;
  analytics: any = null;
  documents: any[] = [];
  formTemplates: any[] = [];
  submissions: any[] = [];
  pdfTemplates: any[] = [];
  reports: any[] = [];
  scheduledReports: any[] = [];
  exports: any[] = [];
  printHistory: any[] = [];

  drawer: '' | 'document' | 'form' | 'submission' | 'pdf' | 'report' | 'schedule' | 'export' = '';

  documentForm = {
    titleAr: '',
    titleEn: '',
    sourceModule: 'hr',
    documentNumber: '',
    status: 'draft',
    tagsText: '',
    issuedAt: '',
    expiresAt: ''
  };

  formTemplateForm = {
    code: '',
    nameAr: '',
    nameEn: '',
    moduleScope: 'hr',
    status: 'draft',
    isPublicSelfService: false
  };

  submissionForm = {
    templateId: null as number | null,
    status: 'submitted',
    payloadText: '{}'
  };

  pdfTemplateForm = {
    code: '',
    nameAr: '',
    nameEn: '',
    templateType: 'letter',
    languageMode: 'bilingual',
    htmlTemplate: '<h1>{{companyName}}</h1><p>{{employeeName}}</p>',
    status: 'draft'
  };

  reportForm = {
    code: '',
    nameAr: '',
    nameEn: '',
    reportType: 'employees',
    moduleScope: 'hr'
  };

  scheduleForm = {
    reportDefinitionId: null as number | null,
    scheduleNameAr: '',
    scheduleNameEn: '',
    cronExpression: '0 8 * * 1',
    exportFormat: 'pdf'
  };

  exportForm = {
    reportDefinitionId: null as number | null,
    exportType: 'employees',
    exportFormat: 'xlsx'
  };

  readonly tabs: Array<{ key: TabKey; ar: string; en: string }> = [
    { key: 'dashboard', ar: 'لوحة الوثائق', en: 'Dashboard' },
    { key: 'documents', ar: 'مركز الوثائق', en: 'Document Center' },
    { key: 'forms', ar: 'منشئ النماذج', en: 'Form Builder' },
    { key: 'submissions', ar: 'إرسالات النماذج', en: 'Submissions' },
    { key: 'templates', ar: 'قوالب PDF', en: 'PDF Templates' },
    { key: 'reports', ar: 'مركز التقارير', en: 'Reports Center' },
    { key: 'scheduled', ar: 'التقارير المجدولة', en: 'Scheduled Reports' },
    { key: 'exports', ar: 'مركز التصدير', en: 'Export Center' },
    { key: 'history', ar: 'سجل الطباعة', en: 'Print History' },
    { key: 'analytics', ar: 'التحليلات', en: 'Analytics' }
  ];

  constructor(
    private api: ApiService,
    public lang: LangService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadAll();
  }

  get isAr() {
    return this.lang.isAr;
  }

  private readonly arByEn: Record<string, string> = {
    Dashboard: 'لوحة الوثائق',
    'Document Center': 'مركز الوثائق',
    'Form Builder': 'منشئ النماذج',
    Submissions: 'إرسالات النماذج',
    'PDF Templates': 'قوالب PDF',
    'Reports Center': 'مركز التقارير',
    'Scheduled Reports': 'التقارير المجدولة',
    'Export Center': 'مركز التصدير',
    'Print History': 'سجل الطباعة',
    Analytics: 'التحليلات'
  };

  t(ar: string, en: string) {
    return this.isAr ? (this.arByEn[en] || ar) : en;
  }

  activeTabLabel() {
    const tab = this.tabs.find(item => item.key === this.activeTab);
    return tab ? this.t(tab.ar, tab.en) : '';
  }

  get currentRole(): string {
    try { return JSON.parse(localStorage.getItem('zenjo_user') || '{}')?.role || ''; } catch { return ''; }
  }

  get canLoadScheduledReports(): boolean {
    return ['hradmin', 'payrolladmin'].includes(this.currentRole);
  }

  label(row: any, arKey = 'nameAr', enKey = 'nameEn') {
    return this.isAr ? (row?.[arKey] || row?.[enKey] || '-') : (row?.[enKey] || row?.[arKey] || '-');
  }

  loadAll() {
    this.loading = true;
    this.error = '';
    forkJoin({
      dashboard: this.safe(this.api.get<ApiResponse<any>>('/api/document-reporting/dashboard')),
      analytics: this.safe(this.api.get<ApiResponse<any>>('/api/document-reporting/analytics')),
      documents: this.safe(this.api.get<ApiResponse<any>>('/api/document-reporting/documents', { page: 1, pageSize: 25 })),
      formTemplates: this.safe(this.api.get<ApiResponse<any[]>>('/api/document-reporting/form-templates')),
      submissions: this.safe(this.api.get<ApiResponse<any[]>>('/api/document-reporting/form-submissions')),
      pdfTemplates: this.safe(this.api.get<ApiResponse<any[]>>('/api/document-reporting/pdf-templates')),
      reports: this.safe(this.api.get<ApiResponse<any[]>>('/api/document-reporting/reports')),
      scheduledReports: this.canLoadScheduledReports ? this.safe(this.api.get<ApiResponse<any[]>>('/api/document-reporting/scheduled-reports')) : of({ success: true, data: [] } as ApiResponse<any[]>),
      exports: this.safe(this.api.get<ApiResponse<any[]>>('/api/document-reporting/exports')),
      printHistory: this.safe(this.api.get<ApiResponse<any[]>>('/api/document-reporting/print-history'))
    }).pipe(finalize(() => {
      this.loading = false;
      this.cdr.markForCheck();
    })).subscribe(r => {
      const data: any = r;
      this.dashboard = data.dashboard?.data ?? null;
      this.analytics = data.analytics?.data ?? null;
      this.documents = data.documents?.data?.items ?? [];
      this.formTemplates = data.formTemplates?.data ?? [];
      this.submissions = data.submissions?.data ?? [];
      this.pdfTemplates = data.pdfTemplates?.data ?? [];
      this.reports = data.reports?.data ?? [];
      this.scheduledReports = data.scheduledReports?.data ?? [];
      this.exports = data.exports?.data ?? [];
      this.printHistory = data.printHistory?.data ?? [];
    });
  }

  setTab(tab: TabKey) {
    this.activeTab = tab;
  }

  openDrawer(type: typeof this.drawer) {
    this.drawer = type;
  }

  closeDrawer() {
    this.drawer = '';
  }

  saveDocument() {
    this.save('/api/document-reporting/documents', {
      ...this.documentForm,
      tags: this.documentForm.tagsText.split(',').map(v => v.trim()).filter(Boolean)
    });
  }

  saveFormTemplate() {
    this.save('/api/document-reporting/form-templates', {
      ...this.formTemplateForm,
      formSchema: { sections: [{ titleAr: 'قسم رئيسي', titleEn: 'Main Section', fields: [] }] }
    });
  }

  saveSubmission() {
    let payload: any = {};
    try {
      payload = JSON.parse(this.submissionForm.payloadText || '{}');
    } catch {
      this.toast.error(this.t('صيغة JSON غير صحيحة', 'Invalid JSON payload'));
      return;
    }
    this.save('/api/document-reporting/form-submissions', { ...this.submissionForm, payload });
  }

  savePdfTemplate() {
    this.save('/api/document-reporting/pdf-templates', this.pdfTemplateForm);
  }

  saveReport() {
    this.save('/api/document-reporting/reports', {
      ...this.reportForm,
      filters: ['dateRange', 'department'],
      columns: ['name', 'status', 'createdAt'],
      visibilityRoles: ['hradmin']
    });
  }

  saveSchedule() {
    this.save('/api/document-reporting/scheduled-reports', this.scheduleForm);
  }

  saveExport() {
    this.save('/api/document-reporting/exports', this.exportForm);
  }

  private save(url: string, body: any) {
    this.saving = true;
    this.api.post<ApiResponse<any>>(url, body)
      .pipe(finalize(() => {
        this.saving = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: () => {
          this.toast.success(this.t('تم الحفظ بنجاح', 'Saved successfully'));
          this.closeDrawer();
          this.loadAll();
        },
        error: e => this.capture(e, true)
      });
  }

  private capture(error: any, toast = false) {
    this.error = error?.error?.message || error?.message || this.t('تعذر تحميل البيانات', 'Failed to load data');
    if (toast) this.toast.error(this.error);
    this.cdr.markForCheck();
  }

  private safe<T>(request: any) {
    return request.pipe(catchError((error: any) => {
      this.capture(error);
      return of(null as T | null);
    }));
  }
}
