import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { Employee, ProbationEvaluation, ApiResponse, LeaveRequest, LeaveBalance } from '../../core/models';
import { ToastService } from '../../core/services/toast.service';
import { SkeletonCardComponent } from '../../shared/components/skeleton/skeleton-card.component';
import { SkeletonKpiCardsComponent } from '../../shared/components/skeleton/skeleton-kpi-cards.component';
import { getErrorMessage } from '../../core/utils/error-message';
import { AppSettingsService } from '../../core/services/app-settings.service';
import { RoleAccessService } from '../../core/services/role-access.service';
import { AccordionComponent, AccordionPanelComponent } from '../../shared/components/accordion/accordion.component';
import { OrgNodesService } from '../../core/services/org-nodes.service';

@Component({
  selector: 'app-employee-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, SkeletonCardComponent, SkeletonKpiCardsComponent, AccordionComponent, AccordionPanelComponent],
  templateUrl: './employee-profile.component.html',
  styleUrl: './employee-profile.component.scss'
})
export class EmployeeProfileComponent implements OnInit {
  employee = signal<Employee | null>(null);
  evaluations = signal<ProbationEvaluation[]>([]);
  disciplinaryCases = signal<any[]>([]);
  attendanceRecords = signal<any[]>([]);
  leaveRequests = signal<LeaveRequest[]>([]);
  leaveBalances = signal<LeaveBalance[]>([]);
  complianceProfile = signal<any | null>(null);
  documents = signal<any[]>([]);
  assets = signal<any[]>([]);
  payslips = signal<any[]>([]);
  advances = signal<any[]>([]);
  orgNodesFlat: any[] = [];
  qualifications: any[] = [];
  inlineQualMode: { type: string; id: number | null } | null = null;
  inlineQualSaving = false;
  inlineQualForm: any = {};
  careerHistory: any[] = [];
  loadingCareerHistory = signal(false);
  employeeId = 0;
  loading = signal(true);
  loadingEvals = signal(false);
  loadingDisciplinary = signal(false);
  loadingAttendance = signal(false);
  loadingLeave = signal(false);
  loadingCompliance = signal(false);
  loadingDocuments = signal(false);
  loadingAssets = signal(false);
  loadingAdvances = signal(false);
  loadingPayslips = signal(false);
  loadingQualifications = signal(false);
  tabErrors = signal<Record<string, string>>({});
  error = signal('');

  showEvalModal = signal(false);
  evalStage: 'month1' | 'month2' | 'final' = 'month1';
  evalError = signal('');
  evalSaving = signal(false);
  editingEvalId: number | null = null;

  evalForm: { [k: string]: any } = {
    commitmentScore: 3,
    workQualityScore: 3,
    learningScore: 3,
    behaviorScore: 3,
    teamworkScore: 3,
    recommendation: 'continue'
  };

  activeTab = signal<'personal' | 'employment' | 'probation' | 'attendance' | 'leave' | 'advances' | 'compliance' | 'documents' | 'assets' | 'payslips' | 'bank-ssc' | 'disciplinary' | 'qualifications' | 'actions'>('personal');
  loadedTabs = signal<string[]>(['personal']);

  showActionDropdown = signal(false);
  confirmStep = signal(false);
  departments: any[] = [];
  jobTitles: any[] = [];

  employeeActions = signal<any[]>([]);
  loadingActions = signal(false);
  showActionModal = signal(false);
  actionSaving = signal(false);
  actionForm: {
    actionType: string; effectiveDate: string; notes: string;
    orgNodeId: number | null; departmentId: number | null;
    jobTitleId: number | null; changeSalary: boolean;
    basicSalary: number | null; housingAllowance: number | null;
    transportAllowance: number | null; mobileAllowance: number | null;
    mealAllowance: number | null; otherAllowances: number | null;
  } = {
    actionType: 'transfer', effectiveDate: new Date().toISOString().slice(0, 10), notes: '',
    orgNodeId: null, departmentId: null, jobTitleId: null, changeSalary: false,
    basicSalary: null, housingAllowance: null, transportAllowance: null,
    mobileAllowance: null, mealAllowance: null, otherAllowances: null,
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    public auth: AuthService,
    private api: ApiService,
    private toast: ToastService,
    public settings: AppSettingsService,
    private access: RoleAccessService,
    private orgNodesService: OrgNodesService
  ) {}

  get lang() {
    return this.auth.lang;
  }

  get canManage() {
    return this.access.isHrAdmin();
  }

  get canEvaluate() {
    return this.access.isAny('hradmin', 'manager');
  }

  ngOnInit() {
    this.loadOrgNodes();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      const targetId = +id;
      this.employeeId = targetId;
      if (this.access.isEmployee() && this.auth.currentUser()?.employeeId && this.auth.currentUser()?.employeeId !== targetId) {
        this.error.set(this.lang === 'ar' ? 'لا يمكنك عرض ملف موظف آخر.' : 'You cannot view another employee profile.');
        return;
      }
      this.loadEmployee(targetId);
    }
  }

  loadEmployee(id: number) {
    this.loading.set(true);
    this.api.get<ApiResponse<Employee>>(`/api/employees/${id}`).subscribe({
      next: r => {
        this.employee.set(r.data);
        this.loading.set(false);
      },
      error: error => {
        this.error.set(getErrorMessage(error, this.lang === 'ar' ? 'فشل تحميل بيانات الموظف.' : 'Failed to load employee profile.'));
        this.loading.set(false);
      }
    });
  }

  loadEvaluations(empId: number) {
    this.loadingEvals.set(true);
    this.api.get<ApiResponse<ProbationEvaluation[]>>('/api/probation/evaluations', { employeeId: empId }).subscribe({
      next: r => {
        this.evaluations.set(r.data);
        this.loadingEvals.set(false);
      },
      error: () => this.loadingEvals.set(false)
    });
  }

  onTabChange(tab: 'personal' | 'employment' | 'probation' | 'attendance' | 'leave' | 'advances' | 'compliance' | 'documents' | 'assets' | 'payslips' | 'bank-ssc' | 'disciplinary' | 'qualifications' | 'actions') {
    this.activeTab.set(tab);
    if (tab === 'qualifications') this.loadQualifications(this.employeeId);
    if (this.loadedTabs().includes(tab)) return;
    if (tab === 'employment' && this.employeeId) this.loadCareerHistory(this.employeeId);

    const emp = this.employee();
    if (tab === 'probation' && emp && (emp.employmentStatus === 'probation' || emp.probationEndDate)) {
      this.loadEvaluations(emp.id);
    }
    if (tab === 'attendance' && emp) {
      this.loadAttendance(emp.id);
    }
    if (tab === 'leave' && emp) {
      this.loadLeave(emp.id);
    }
    if (tab === 'advances' && emp) {
      this.loadAdvances(emp.id);
    }
    if (tab === 'compliance' && emp) {
      this.loadCompliance(emp.id);
    }
    if (tab === 'documents' && emp) {
      this.loadDocuments(emp.id);
    }
    if (tab === 'assets' && emp) {
      this.loadAssets(emp.id);
    }
    if (tab === 'payslips' && emp) {
      this.loadPayslips(emp.id);
    }
    if (tab === 'disciplinary' && emp) {
      this.loadDisciplinary(emp.id);
    }
    if (tab === 'actions' && emp) {
      this.loadActions(emp.id);
    }

    this.loadedTabs.set([...this.loadedTabs(), tab]);
  }

  canSeeTab(tab: 'personal' | 'employment' | 'probation' | 'attendance' | 'leave' | 'advances' | 'compliance' | 'documents' | 'assets' | 'bank-ssc' | 'salary' | 'payslips' | 'disciplinary' | 'qualifications' | 'actions') {
    if (tab === 'personal' || tab === 'employment' || tab === 'probation') return true;
    if (tab === 'attendance') return this.access.isAny('hradmin', 'manager', 'employee');
    if (tab === 'leave') return this.access.isAny('hradmin', 'manager', 'employee');
    if (tab === 'advances') return this.access.isAny('hradmin', 'employee', 'payrolladmin', 'manager');
    if (tab === 'compliance') return this.access.isAny('hradmin', 'manager', 'employee', 'payrolladmin');
    if (tab === 'documents') return this.access.isAny('hradmin', 'manager', 'employee', 'payrolladmin');
    if (tab === 'assets') return this.access.isAny('hradmin', 'manager', 'employee', 'payrolladmin');
    if (tab === 'bank-ssc' || tab === 'salary') return this.access.isAny('hradmin', 'payrolladmin');
    if (tab === 'payslips') return this.access.isAny('hradmin', 'payrolladmin', 'employee');
    if (tab === 'disciplinary') return this.access.isAny('hradmin', 'manager', 'employee');
    if (tab === 'qualifications') return this.access.isAny('hradmin', 'manager', 'employee');
    if (tab === 'actions') return this.access.isAny('hradmin', 'manager', 'payrolladmin', 'employee');
    return false;
  }

  loadQualifications(empId: number): void {
    this.loadingQualifications.set(true);
    this.http.get<any>(`/api/employees/${empId}/qualifications`).subscribe({
      next: r => {
        this.qualifications = r.data ?? [];
        this.loadingQualifications.set(false);
      },
      error: () => {
        this.qualifications = [];
        this.loadingQualifications.set(false);
        this.setTabError('qualifications', this.lang === 'ar' ? 'فشل تحميل المؤهلات.' : 'Failed to load qualifications.');
      }
    });
  }

  setTabError(tab: string, msg: string): void {
    this.tabErrors.update(e => ({ ...e, [tab]: msg }));
  }

  clearTabError(tab: string): void {
    this.tabErrors.update(e => { const n = { ...e }; delete n[tab]; return n; });
  }

  loadOrgNodes(): void {
    this.orgNodesService.getFlat().subscribe({
      next: r => this.orgNodesFlat = r.data ?? [],
      error: () => this.orgNodesFlat = []
    });
  }

  getOrgBreadcrumb(node: any): string {
    const emp = this.employee();
    const flat = this.orgNodesFlat;
    const nodeId = node?.id ?? node?.orgNodeId ?? emp?.orgNodeId;
    let current = node?.id ? node : flat.find(n => n.id === nodeId) ?? null;
    if (!current && emp?.orgNodeId) {
      current = {
        id: emp.orgNodeId,
        parentId: null,
        nameAr: emp.orgNodeNameAr,
        nameEn: emp.orgNodeNameEn
      };
    }

    const path: string[] = [];
    while (current) {
      path.unshift(this.lang === 'ar' ? current.nameAr : current.nameEn);
      current = flat.find(n => n.id === current.parentId) ?? null;
    }
    return path.filter(Boolean).join(' → ');
  }

  canDo(screen: string, action: string) {
    return screen === 'employees' && action === 'update' && this.access.isHrAdmin();
  }

  get canEdit() {
    return this.access.isHrAdmin();
  }

  getQuals(type: string): any[] {
    return (this.qualifications || [])
      .filter(q => q.qualificationType === type || q.QualificationType === type)
      .map(q => ({ ...q, data: this.safeParseJson(q.dataJson ?? q.DataJson) }));
  }

  getQualCount(type: string): number {
    return this.getQuals(type).length;
  }

  safeParseJson(s: string): any {
    try {
      return typeof s === 'string' ? JSON.parse(s) : (s ?? {});
    } catch {
      return {};
    }
  }

  qualificationGroups() {
    const groups = new Map<string, any[]>();
    for (const item of this.qualifications) {
      const key = item.qualificationType ?? item.QualificationType ?? 'General';
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return Array.from(groups.entries()).map(([type, items]) => ({ type, items }));
  }

  qualificationFields(item: any) {
    const raw = item.dataJson ?? item.DataJson ?? '{}';
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Object.entries(parsed ?? {}).map(([key, value]) => ({ key, value }));
    } catch {
      return [{ key: 'dataJson', value: raw }];
    }
  }

  deleteQualification(qualId: number) {
    if (!confirm(this.lang === 'ar' ? 'هل تريد حذف هذا العنصر؟' : 'Delete this item?')) return;
    this.api.delete<any>(`/api/employees/${this.employeeId}/qualifications/${qualId}`)
      .subscribe(() => this.loadQualifications(this.employeeId));
  }

  startInlineAdd(type: string) {
    this.inlineQualMode = { type, id: null };
    this.inlineQualForm = this.blankInlineForm(type);
  }

  startInlineEdit(item: any) {
    const type = item.qualificationType ?? item.QualificationType;
    const data = this.safeParseJson(item.dataJson ?? item.DataJson);
    this.inlineQualMode = { type, id: item.id ?? item.Id };
    this.inlineQualForm = { ...this.blankInlineForm(type), ...data };
  }

  cancelInline() {
    this.inlineQualMode = null;
    this.inlineQualForm = {};
    this.inlineQualSaving = false;
  }

  isInlineEditing(item: any): boolean {
    return !!this.inlineQualMode && this.inlineQualMode.id === (item.id ?? item.Id);
  }

  isInlineAdding(type: string): boolean {
    return !!this.inlineQualMode && this.inlineQualMode.type === type && this.inlineQualMode.id === null;
  }

  blankInlineForm(type: string): any {
    if (type === 'education') return { degree: '', institution: '', field_of_study: '', graduation_year: null, gpa: null };
    if (type === 'experience') return { jobTitle: '', company: '', startDate: '', endDate: '', isCurrent: false, description: '' };
    if (type === 'skill') return { name: '', level: 3 };
    if (type === 'course') return { name: '', provider: '', date: '', has_certificate: false, certificate_number: '' };
    return {};
  }

  saveInline() {
    if (!this.inlineQualMode) return;
    const { type, id } = this.inlineQualMode;
    const dataJson = JSON.stringify(this.inlineQualForm);
    this.inlineQualSaving = true;
    const obs = id == null
      ? this.http.post<any>(`/api/employees/${this.employeeId}/qualifications`, { qualificationType: type, dataJson })
      : this.http.put<any>(`/api/employees/${this.employeeId}/qualifications/${id}`, { dataJson });
    obs.subscribe({
      next: () => { this.cancelInline(); this.loadQualifications(this.employeeId); },
      error: () => { this.inlineQualSaving = false; }
    });
  }

  setSkillLevel(n: number) { this.inlineQualForm.level = n; }

  proficiencyDots(level: number | null | undefined): string {
    const lv = Math.max(0, Math.min(5, +(level || 0)));
    return '●'.repeat(lv) + '○'.repeat(5 - lv);
  }

  getAge(): string {
    const dob = this.employee()?.dateOfBirth;
    if (!dob) return '—';
    const d = new Date(dob); const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return this.lang === 'ar' ? `${age} سنة` : `${age} yrs`;
  }

  experienceDuration(item: any): string {
    const d = item.data || {};
    if (d.years) return this.lang === 'ar' ? `${d.years} سنوات` : `${d.years} yrs`;
    if (d.startDate) {
      const end = d.isCurrent ? (this.lang === 'ar' ? 'الحالي' : 'Present') : (d.endDate || '—');
      return `${d.startDate} → ${end}`;
    }
    return '—';
  }

  loadCareerHistory(empId: number) {
    this.loadingCareerHistory.set(true);
    this.api.get<any>(`/api/employees/${empId}/career-history`).subscribe({
      next: r => { this.careerHistory = r.data ?? []; this.loadingCareerHistory.set(false); },
      error: () => { this.careerHistory = []; this.loadingCareerHistory.set(false); }
    });
  }

  getInitials(): string {
    const emp = this.employee();
    if (!emp) return '';
    const f = (emp.firstNameEn || emp.firstNameAr || '')[0] ?? '';
    const l = (emp.lastNameEn || emp.lastNameAr || '')[0] ?? '';
    return (f + l).toUpperCase();
  }

  getTenure(): string {
    const emp = this.employee();
    if (!emp?.hireDate) return '—';
    const hire = new Date(emp.hireDate);
    const now = new Date();
    const months = (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth());
    const years = Math.floor(months / 12);
    const rem = months % 12;
    if (years === 0) return this.lang === 'ar' ? `${rem} شهر` : `${rem} mo`;
    if (rem === 0) return this.lang === 'ar' ? `${years} سنة` : `${years} yr${years > 1 ? 's' : ''}`;
    return this.lang === 'ar' ? `${years} سنة ${rem} شهر` : `${years}y ${rem}m`;
  }

  contractTypeLabel(type: string | null | undefined): string {
    const map: Record<string, { ar: string; en: string }> = {
      permanent: { ar: 'دائم', en: 'Permanent' },
      fixed_term: { ar: 'محدد المدة', en: 'Fixed Term' },
      part_time: { ar: 'دوام جزئي', en: 'Part-Time' },
      freelance: { ar: 'مستقل', en: 'Freelance' },
    };
    const key = type ?? 'permanent';
    const l = map[key];
    return l ? (this.lang === 'ar' ? l.ar : l.en) : (type || '—');
  }

  loadDisciplinary(empId: number) {
    this.loadingDisciplinary.set(true);
    this.api.get<any>('/api/disciplinary', { employeeId: empId }).subscribe({
      next: response => {
        this.disciplinaryCases.set(response.data ?? []);
        this.loadingDisciplinary.set(false);
      },
      error: () => {
        this.disciplinaryCases.set([]);
        this.loadingDisciplinary.set(false);
        this.setTabError('disciplinary', this.lang === 'ar' ? 'فشل تحميل السجل التأديبي.' : 'Failed to load disciplinary record.');
      }
    });
  }

  loadAttendance(empId: number) {
    this.loadingAttendance.set(true);
    this.api.get<any>('/api/attendance', { employeeId: empId }).subscribe({
      next: response => {
        this.attendanceRecords.set(response.data ?? []);
        this.loadingAttendance.set(false);
      },
      error: () => {
        this.attendanceRecords.set([]);
        this.loadingAttendance.set(false);
        this.setTabError('attendance', this.lang === 'ar' ? 'فشل تحميل سجل الحضور.' : 'Failed to load attendance records.');
      }
    });
  }

  loadLeave(empId: number) {
    this.loadingLeave.set(true);

    this.api.get<ApiResponse<LeaveRequest[]>>('/api/leave/requests', { employeeId: empId }).subscribe({
      next: response => {
        this.leaveRequests.set(response.data ?? []);
        this.loadingLeave.set(false);
      },
      error: () => {
        this.leaveRequests.set([]);
        this.loadingLeave.set(false);
        this.setTabError('leave', this.lang === 'ar' ? 'فشل تحميل بيانات الإجازات.' : 'Failed to load leave data.');
      }
    });

    const balancesRequest = this.access.isEmployee() && this.auth.currentUser()?.employeeId === empId
      ? this.api.get<ApiResponse<LeaveBalance[]>>('/api/leave/balances')
      : this.api.get<ApiResponse<LeaveBalance[]>>(`/api/leave/balances/${empId}`);

    balancesRequest.subscribe({
      next: response => this.leaveBalances.set(response.data ?? []),
      error: () => this.leaveBalances.set([])
    });
  }

  loadCompliance(empId: number) {
    this.loadingCompliance.set(true);
    this.api.get<any>(`/api/compliance/employee/${empId}`).subscribe({
      next: response => {
        this.complianceProfile.set(response.data ?? null);
        this.loadingCompliance.set(false);
      },
      error: () => {
        this.complianceProfile.set(null);
        this.loadingCompliance.set(false);
        this.setTabError('compliance', this.lang === 'ar' ? 'فشل تحميل ملف الامتثال.' : 'Failed to load compliance profile.');
      }
    });
  }

  loadAdvances(empId: number) {
    this.loadingAdvances.set(true);
    this.api.get<any>('/api/salary-advances', { employeeId: empId }).subscribe({
      next: response => {
        this.advances.set(response.data ?? []);
        this.loadingAdvances.set(false);
      },
      error: () => {
        this.advances.set([]);
        this.loadingAdvances.set(false);
        this.setTabError('advances', this.lang === 'ar' ? 'فشل تحميل السلف.' : 'Failed to load salary advances.');
      }
    });
  }

  loadDocuments(empId: number) {
    this.loadingDocuments.set(true);
    this.api.get<any>('/api/documents', { employeeId: empId }).subscribe({
      next: response => {
        this.documents.set(response.data ?? []);
        this.loadingDocuments.set(false);
      },
      error: () => {
        this.documents.set([]);
        this.loadingDocuments.set(false);
        this.setTabError('documents', this.lang === 'ar' ? 'فشل تحميل المستندات.' : 'Failed to load documents.');
      }
    });
  }

  loadAssets(empId: number) {
    this.loadingAssets.set(true);
    this.api.get<any>('/api/assets', { employeeId: empId }).subscribe({
      next: response => {
        this.assets.set(response.data ?? []);
        this.loadingAssets.set(false);
      },
      error: () => {
        this.assets.set([]);
        this.loadingAssets.set(false);
        this.setTabError('assets', this.lang === 'ar' ? 'فشل تحميل الأصول.' : 'Failed to load assets.');
      }
    });
  }

  loadPayslips(empId: number) {
    this.loadingPayslips.set(true);
    this.api.get<any>('/api/payroll/slips', { employeeId: empId }).subscribe({
      next: response => {
        this.payslips.set(response.data ?? []);
        this.loadingPayslips.set(false);
      },
      error: () => {
        this.payslips.set([]);
        this.loadingPayslips.set(false);
        this.setTabError('payslips', this.lang === 'ar' ? 'فشل تحميل قسائم الراتب.' : 'Failed to load payslips.');
      }
    });
  }

  formatAttendanceTime(value?: string | null) {
    if (!value) return '—';
    return new Date(value).toLocaleTimeString(this.lang === 'ar' ? 'ar-JO-u-nu-latn' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  }

  formatWorkedHours(minutes?: number | null) {
    if (!minutes) return '—';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return this.lang === 'ar' ? `${hours} س ${mins} د` : `${hours}h ${mins}m`;
  }

  documentStatusLabel(status: string) {
    const map: Record<string, { ar: string; en: string }> = {
      valid: { ar: 'ساري', en: 'Valid' },
      expiring_soon: { ar: 'ينتهي قريباً', en: 'Expiring soon' },
      expired: { ar: 'منتهي', en: 'Expired' },
      missing: { ar: 'مفقود', en: 'Missing' }
    };
    const label = map[status];
    return label ? (this.lang === 'ar' ? label.ar : label.en) : status;
  }

  documentStatusClass(status: string) {
    if (status === 'valid') return 'badge-success';
    if (status === 'expiring_soon') return 'badge-warning';
    return 'badge-danger';
  }

  documentTypeLabel(item: any) {
    return this.lang === 'ar' ? item.documentTypeNameAr : (item.documentTypeNameEn || item.documentTypeNameAr);
  }

  documentDaysLeftLabel(days?: number | null) {
    if (days == null) return '—';
    if (days < 0) return this.lang === 'ar' ? 'منتهي' : 'Expired';
    return this.lang === 'ar' ? `${days} يوم` : `${days} days`;
  }

  assetStatusLabel(status: string) {
    const map: Record<string, { ar: string; en: string }> = {
      available: { ar: 'متاح', en: 'Available' },
      assigned: { ar: 'مُعيّن', en: 'Assigned' },
      maintenance: { ar: 'قيد الصيانة', en: 'Under maintenance' },
      returned: { ar: 'تمت الإعادة', en: 'Returned' },
      retired: { ar: 'مؤرشف', en: 'Retired' },
      damaged: { ar: 'تالف', en: 'Damaged' },
      lost: { ar: 'مفقود', en: 'Lost' }
    };
    const label = map[status];
    return label ? (this.lang === 'ar' ? label.ar : label.en) : status;
  }

  assetStatusClass(status: string) {
    if (status === 'assigned') return 'badge-info';
    if (status === 'maintenance') return 'badge-warning';
    if (status === 'damaged' || status === 'lost') return 'badge-danger';
    return 'badge-success';
  }

  assetConditionLabel(condition?: string | null) {
    const map: Record<string, { ar: string; en: string }> = {
      new: { ar: 'جديد', en: 'New' },
      good: { ar: 'جيد', en: 'Good' },
      damaged: { ar: 'متضرر', en: 'Damaged' },
      lost: { ar: 'مفقود', en: 'Lost' }
    };
    const key = String(condition || 'good').toLowerCase();
    const label = map[key];
    return label ? (this.lang === 'ar' ? label.ar : label.en) : (condition || '—');
  }

  advanceStatusLabel(status: string) {
    const map: Record<string, { ar: string; en: string }> = {
      pending: { ar: 'معلقة', en: 'Pending' },
      approved: { ar: 'معتمدة', en: 'Approved' },
      rejected: { ar: 'مرفوضة', en: 'Rejected' },
      deducted: { ar: 'مخصومة', en: 'Deducted' },
      partially_deducted: { ar: 'خصم جزئي', en: 'Partially Deducted' }
    };
    return this.lang === 'ar' ? (map[status]?.ar ?? status) : (map[status]?.en ?? status);
  }

  advanceStatusClass(status: string) {
    const map: Record<string, string> = {
      pending: 'badge-warning',
      approved: 'badge-success',
      rejected: 'badge-danger',
      deducted: 'badge-neutral',
      partially_deducted: 'badge-info'
    };
    return `badge ${map[status] ?? 'badge-neutral'}`;
  }

  advanceRepaymentLabel(method: string) {
    if (method === 'one_time') return this.lang === 'ar' ? 'دفعة واحدة' : 'One-Time';
    return this.lang === 'ar' ? 'خصم شهري' : 'Monthly';
  }

  payslipStatusLabel(status: string) {
    const map: Record<string, { ar: string; en: string }> = {
      approved: { ar: 'معتمد', en: 'Approved' },
      paid: { ar: 'مدفوع', en: 'Paid' },
      unpaid: { ar: 'غير مدفوع', en: 'Unpaid' }
    };
    return this.lang === 'ar' ? (map[status]?.ar ?? status) : (map[status]?.en ?? status);
  }

  payslipStatusClass(status: string) {
    const map: Record<string, string> = {
      approved: 'badge-success',
      paid: 'badge-success',
      unpaid: 'badge-neutral'
    };
    return `badge ${map[status] ?? 'badge-neutral'}`;
  }

  payrollMoney(value: number | undefined | null) {
    return this.settings.formatMoney(value);
  }

  attendanceStatusLabel(status: string) {
    const map: Record<string, { ar: string; en: string }> = {
      present: { ar: 'حاضر', en: 'Present' },
      late: { ar: 'متأخر', en: 'Late' },
      absent: { ar: 'غائب', en: 'Absent' },
      on_leave: { ar: 'في إجازة', en: 'On leave' }
    };
    const label = map[status];
    return label ? (this.lang === 'ar' ? label.ar : label.en) : status;
  }

  attendanceBadgeClass(status: string) {
    if (status === 'present') return 'badge-success';
    if (status === 'late') return 'badge-warning';
    if (status === 'absent') return 'badge-danger';
    return 'badge-info';
  }

  leaveStatusLabel(status: string) {
    const map: Record<string, { ar: string; en: string }> = {
      pending: { ar: 'قيد الانتظار', en: 'Pending' },
      manager_approved: { ar: 'موافقة المدير', en: 'Manager approved' },
      approved: { ar: 'معتمد', en: 'Approved' },
      rejected: { ar: 'مرفوض', en: 'Rejected' },
      cancelled: { ar: 'ملغي', en: 'Cancelled' }
    };
    const label = map[status];
    return label ? (this.lang === 'ar' ? label.ar : label.en) : status;
  }

  leaveBadgeClass(status: string) {
    if (status === 'approved') return 'badge-success';
    if (status === 'rejected' || status === 'cancelled') return 'badge-danger';
    if (status === 'manager_approved') return 'badge-info';
    return 'badge-warning';
  }

  leaveApprovalProgress(item: LeaveRequest) {
    if (item.status === 'approved') {
      return this.lang === 'ar' ? 'اكتمل الاعتماد' : 'Approval completed';
    }
    if (item.status === 'manager_approved') {
      return this.lang === 'ar' ? 'بانتظار اعتماد الموارد البشرية' : 'Waiting for HR approval';
    }
    if (item.status === 'rejected') {
      return this.lang === 'ar' ? 'تم رفض الطلب' : 'Request rejected';
    }
    if (item.status === 'cancelled') {
      return this.lang === 'ar' ? 'تم إلغاء الطلب' : 'Request cancelled';
    }
    return this.lang === 'ar' ? 'بانتظار المراجعة' : 'Awaiting review';
  }

  get probationProgress() {
    const emp = this.employee();
    if (!emp?.hireDate || !emp?.probationEndDate) return null;

    const start = new Date(emp.hireDate).getTime();
    const end = new Date(emp.probationEndDate).getTime();
    const now = Date.now();
    const total = end - start;
    const elapsed = now - start;
    const pct = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
    const daysLeft = Math.round((end - now) / (1000 * 60 * 60 * 24));
    const daysPassed = Math.round((now - start) / (1000 * 60 * 60 * 24));

    let alertLevel: 'normal' | 'warning' | 'critical' | 'overdue' = 'normal';
    if (daysLeft < 0) alertLevel = 'overdue';
    else if (daysLeft <= 7) alertLevel = 'critical';
    else if (daysLeft <= 14) alertLevel = 'warning';

    return { pct, daysLeft, daysPassed, alertLevel, start: emp.hireDate, end: emp.probationEndDate };
  }

  stageEval(stage: string): ProbationEvaluation | null {
    return this.evaluations().find(e => e.evaluationStage === stage) ?? null;
  }

  stageAvailable(stage: string) {
    const emp = this.employee();
    if (!emp?.hireDate) return false;
    const hired = new Date(emp.hireDate);
    const now = new Date();
    const daysSince = Math.round((now.getTime() - hired.getTime()) / (1000 * 60 * 60 * 24));
    if (stage === 'month1') return daysSince >= 30;
    if (stage === 'month2') return daysSince >= 60;
    if (stage === 'final') return daysSince >= 75;
    return false;
  }

  openEvalModalStr(stage: string, existing?: ProbationEvaluation | null) {
    this.openEvalModal(stage as 'month1' | 'month2' | 'final', existing ?? undefined);
  }

  openEvalModal(stage: 'month1' | 'month2' | 'final', existing?: ProbationEvaluation) {
    this.evalStage = stage;
    this.evalError.set('');
    this.editingEvalId = existing?.id ?? null;
    if (existing) {
      this.evalForm = { ...existing };
    } else {
      this.evalForm = {
        commitmentScore: 3,
        workQualityScore: 3,
        learningScore: 3,
        behaviorScore: 3,
        teamworkScore: 3,
        recommendation: 'continue',
        evaluationDate: new Date().toISOString().slice(0, 10)
      };
    }
    this.showEvalModal.set(true);
  }

  closeEvalModal() {
    this.showEvalModal.set(false);
    this.editingEvalId = null;
  }

  saveEval() {
    const emp = this.employee();
    if (!emp) return;
    this.evalSaving.set(true);
    this.evalError.set('');
    const payload = { ...this.evalForm, employeeId: emp.id, evaluationStage: this.evalStage };
    const obs = this.editingEvalId
      ? this.api.put<ApiResponse<any>>(`/api/probation/evaluations/${this.editingEvalId}`, payload)
      : this.api.post<ApiResponse<any>>('/api/probation/evaluations', payload);
    obs.subscribe({
      next: () => {
        this.evalSaving.set(false);
        this.closeEvalModal();
        this.toast.success(this.lang === 'ar' ? 'تم حفظ التقييم بنجاح.' : 'Evaluation saved successfully.');
        this.loadEvaluations(emp.id);
      },
      error: e => {
        this.evalSaving.set(false);
        this.evalError.set(getErrorMessage(e, this.lang === 'ar' ? 'حدث خطأ أثناء حفظ التقييم.' : 'An error occurred while saving the evaluation.'));
        this.toast.error(this.evalError());
      }
    });
  }

  deleteEval(id: number) {
    if (!confirm(this.lang === 'ar' ? 'هل تريد حذف هذا التقييم؟' : 'Delete this evaluation?')) return;
    const emp = this.employee();
    if (!emp) return;
    this.api.delete<ApiResponse<any>>(`/api/probation/evaluations/${id}`).subscribe({
      next: () => this.loadEvaluations(emp.id)
    });
  }

  get complianceStatus(): { status: 'compliant' | 'warning' | 'critical'; alertCount: number; items: { type: string; status: string; daysLeft: number | null }[] } {
    const apiCompliance = this.complianceProfile();
    if (apiCompliance?.summary && Array.isArray(apiCompliance?.items)) {
      return {
        status: apiCompliance.summary.overallStatus,
        alertCount: apiCompliance.items.filter((item: any) => item.status !== 'valid').length,
        items: apiCompliance.items.map((item: any) => ({ type: item.category, status: item.status, daysLeft: item.daysRemaining }))
      };
    }

    const emp = this.employee();
    if (!emp) return { status: 'compliant', alertCount: 0, items: [] };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const warn30 = new Date(today);
    warn30.setDate(warn30.getDate() + 30);
    const warn60 = new Date(today);
    warn60.setDate(warn60.getDate() + 60);
    const isNonJo = emp.nationalityCode !== 'JO';

    const items: { type: string; status: string; daysLeft: number | null }[] = [];
    let worstLevel = 0;

    const check = (type: string, expiryStr: string | null | undefined, mandatory = false) => {
      if (!expiryStr) {
        if (mandatory && isNonJo) {
          items.push({ type, status: 'missing', daysLeft: null });
          if (worstLevel < 2) worstLevel = 2;
        }
        return;
      }

      const exp = new Date(expiryStr);
      exp.setHours(0, 0, 0, 0);
      const days = Math.round((exp.getTime() - today.getTime()) / 86400000);
      const status = days < 0 ? 'expired' : exp <= warn30 ? 'expiring_soon' : exp <= warn60 ? 'expiring' : 'valid';
      const level = status === 'expired' || status === 'expiring_soon' ? 2 : status === 'expiring' ? 1 : 0;
      if (level > worstLevel) worstLevel = level;
      if (level > 0 || mandatory) items.push({ type, status, daysLeft: days });
    };

    if (isNonJo) {
      check('work_permit', emp.workPermitExpiry, true);
      check('residency', emp.residencyExpiry, false);
      check('passport', emp.passportExpiry, false);
    }
    check('health_certificate', emp.healthCertificateExpiry, false);

    if (!emp.isSscEnrolled && !emp.isSscExempt) {
      items.push({ type: 'ssc', status: 'missing', daysLeft: null });
      if (worstLevel < 1) worstLevel = 1;
    }

    const status = worstLevel === 0 ? 'compliant' : worstLevel === 1 ? 'warning' : 'critical';
    return { status, alertCount: items.length, items };
  }

  complianceItemLabel(type: string) {
    const map: Record<string, { ar: string; en: string }> = {
      work_permit: { ar: 'تصريح العمل', en: 'Work Permit' },
      residency: { ar: 'الإقامة', en: 'Residency' },
      passport: { ar: 'جواز السفر', en: 'Passport' },
      health_certificate: { ar: 'الشهادة الصحية', en: 'Health Certificate' },
      ssc: { ar: 'الضمان الاجتماعي', en: 'SSC' }
    };
    const l = map[type];
    return l ? (this.lang === 'ar' ? l.ar : l.en) : type;
  }

  complianceItemStatusCls(status: string) {
    return status === 'valid' ? 'badge-success' : status === 'missing' || status === 'expired' ? 'badge-danger' : 'badge-warning';
  }

  complianceItemStatusLabel(status: string) {
    const map: Record<string, { ar: string; en: string }> = {
      valid: { ar: 'ساري', en: 'Valid' },
      expired: { ar: 'منتهي', en: 'Expired' },
      expiring_soon: { ar: 'ينتهي قريباً', en: 'Expiring Soon' },
      expiring: { ar: 'ينتهي لاحقاً', en: 'Expiring' },
      missing: { ar: 'غير متوفر', en: 'Missing' }
    };
    const l = map[status];
    return l ? (this.lang === 'ar' ? l.ar : l.en) : status;
  }

  scoreLabel(score: number) {
    const labels: Record<number, string> = {
      1: '١ - ضعيف جداً',
      2: '٢ - ضعيف',
      3: '٣ - مقبول',
      4: '٤ - جيد',
      5: '٥ - ممتاز'
    };
    return labels[score] || String(score);
  }

  scoreLabelEn(score: number) {
    const labels: Record<number, string> = { 1: '1 - Very Poor', 2: '2 - Poor', 3: '3 - Fair', 4: '4 - Good', 5: '5 - Excellent' };
    return labels[score] || String(score);
  }

  recLabel(rec: string) {
    const map: Record<string, { ar: string; en: string; cls: string }> = {
      continue: { ar: 'استمرار فترة التجربة', en: 'Continue Probation', cls: 'badge-info' },
      needs_improvement: { ar: 'يحتاج إلى تحسين', en: 'Needs Improvement', cls: 'badge-warning' },
      confirm: { ar: 'تثبيت الموظف', en: 'Confirm Employee', cls: 'badge-success' },
      not_recommended: { ar: 'غير موصى بالتثبيت', en: 'Not Recommended', cls: 'badge-danger' }
    };
    return map[rec] || { ar: rec, en: rec, cls: 'badge-secondary' };
  }

  stageLabel(stage: string) {
    const map: Record<string, { ar: string; en: string }> = {
      month1: { ar: 'تقييم الشهر الأول', en: 'Month 1 Evaluation' },
      month2: { ar: 'تقييم الشهر الثاني', en: 'Month 2 Evaluation' },
      final: { ar: 'التقييم النهائي', en: 'Final Evaluation' }
    };
    return map[stage] || { ar: stage, en: stage };
  }

  empTypeLabel(t: string) {
    const map: Record<string, string> = { fulltime: 'دوام كامل', parttime: 'دوام جزئي', contract: 'عقد' };
    return this.lang === 'ar' ? (map[t] || t) : t;
  }

  statusClass(s: string) {
    const m: Record<string, string> = { active: 'badge-success', probation: 'badge-warning', suspended: 'badge-danger', terminated: 'badge-danger' };
    return m[s] || 'badge-secondary';
  }

  statusLabel(s: string) {
    const map: Record<string, { ar: string; en: string }> = {
      active: { ar: 'نشط', en: 'Active' },
      probation: { ar: 'تجريبي', en: 'Probation' },
      suspended: { ar: 'موقوف', en: 'Suspended' },
      terminated: { ar: 'منتهي الخدمة', en: 'Terminated' }
    };
    const l = map[s];
    return l ? (this.lang === 'ar' ? l.ar : l.en) : s;
  }

  loadActions(empId: number) {
    this.loadingActions.set(true);
    this.api.get<any>('/api/employee-actions', { employeeId: empId }).subscribe({
      next: r => { this.employeeActions.set(r.data ?? []); this.loadingActions.set(false); },
      error: () => { this.employeeActions.set([]); this.loadingActions.set(false); }
    });
  }

  loadDepartmentsForActions() {
    if (this.departments.length) return;
    this.api.get<any>('/api/departments').subscribe({
      next: r => this.departments = r.data ?? [],
      error: () => {}
    });
  }

  loadJobTitlesForActions() {
    if (this.jobTitles.length) return;
    this.api.get<any>('/api/job-titles').subscribe({
      next: r => this.jobTitles = r.data ?? [],
      error: () => {}
    });
  }

  actionTypeLabel(type: string): { en: string; ar: string; icon: string; cls: string } {
    const map: Record<string, { en: string; ar: string; icon: string; cls: string }> = {
      hire:               { en: 'Hired',               ar: 'تعيين',           icon: 'person_add',    cls: 'action-hire' },
      probation_start:    { en: 'Probation Started',   ar: 'بدء التجربة',     icon: 'timer',         cls: 'action-probation' },
      probation_complete: { en: 'Probation Completed', ar: 'اجتياز التجربة',  icon: 'verified',      cls: 'action-confirm' },
      probation_fail:     { en: 'Probation Failed',    ar: 'فشل التجربة',     icon: 'cancel',        cls: 'action-demotion' },
      transfer:           { en: 'Transfer',            ar: 'نقل',             icon: 'swap_horiz',    cls: 'action-transfer' },
      promotion:          { en: 'Promotion',           ar: 'ترقية',           icon: 'trending_up',   cls: 'action-promotion' },
      demotion:           { en: 'Demotion',            ar: 'خفض درجة',        icon: 'trending_down', cls: 'action-demotion' },
      salary_change:      { en: 'Salary Change',       ar: 'تعديل الراتب',    icon: 'payments',      cls: 'action-salary' },
      suspension:         { en: 'Suspension',          ar: 'إيقاف',           icon: 'pause_circle',  cls: 'action-suspension' },
      suspension_lift:    { en: 'Suspension Lifted',   ar: 'رفع الإيقاف',     icon: 'play_circle',   cls: 'action-return' },
      termination:        { en: 'Termination',         ar: 'إنهاء خدمة',      icon: 'person_remove', cls: 'action-termination' },
      resignation:        { en: 'Resignation',         ar: 'استقالة',         icon: 'exit_to_app',   cls: 'action-resignation' },
      leave_of_absence:   { en: 'Leave of Absence',   ar: 'إجازة بدون راتب', icon: 'beach_access',  cls: 'action-leave' },
      return_from_leave:  { en: 'Returned from Leave', ar: 'عودة من الإجازة', icon: 'login',         cls: 'action-return' },
      warning_issued:     { en: 'Warning Issued',      ar: 'إنذار',           icon: 'warning',       cls: 'action-warning' },
      document_expired:   { en: 'Document Expired',    ar: 'وثيقة منتهية',    icon: 'description',   cls: 'action-warning' },
      contract_renewal:   { en: 'Contract Renewal',    ar: 'تجديد عقد',       icon: 'autorenew',     cls: 'action-hire' },
    };
    return map[type] ?? { en: type, ar: type, icon: 'history', cls: 'action-custom' };
  }

  ACTION_TYPE_GROUPS = [
    { labelAr: 'التوظيف',  labelEn: 'Employment', types: ['transfer', 'promotion', 'demotion'] },
    { labelAr: 'الراتب',   labelEn: 'Salary',      types: ['salary_change'] },
    { labelAr: 'الحالة',   labelEn: 'Status',      types: ['suspension', 'suspension_lift', 'termination'] },
    { labelAr: 'الإجراءات', labelEn: 'Actions',    types: ['warning_issued', 'contract_renewal'] },
  ];

  toggleActionDropdown() { this.showActionDropdown.update(v => !v); }

  private readonly CAREER_TYPES = ['transfer', 'promotion', 'demotion'];
  private readonly SALARY_TYPES = ['salary_change'];
  private readonly STATUS_TYPES = ['suspension', 'suspension_lift', 'termination', 'resignation', 'contract_renewal', 'leave_of_absence', 'return_from_leave', 'warning_issued'];

  openActionType(type: string) {
    this.showActionDropdown.set(false);
    const empId = this.employee()?.id;
    if (!empId) return;
    if (this.CAREER_TYPES.includes(type)) {
      this.router.navigate(['/app/employee-actions/career-movements'], { queryParams: { employeeId: empId, actionType: type } });
    } else if (this.SALARY_TYPES.includes(type)) {
      this.router.navigate(['/app/employee-actions/salary-changes'], { queryParams: { employeeId: empId } });
    } else if (this.STATUS_TYPES.includes(type)) {
      this.router.navigate(['/app/employee-actions/status-changes'], { queryParams: { employeeId: empId, actionType: type } });
    } else {
      this.router.navigate(['/app/employee-actions/career-movements'], { queryParams: { employeeId: empId, actionType: type } });
    }
  }

  openActionModal() { this.openActionType('transfer'); }

  closeActionModal() { this.showActionModal.set(false); this.confirmStep.set(false); }

  requestConfirm() {
    const f = this.actionForm;
    if (!f.actionType || !f.effectiveDate) return;
    this.confirmStep.set(true);
  }

  buildConfirmSummary(): { labelAr: string; labelEn: string; from?: string; to: string }[] {
    const f = this.actionForm;
    const emp = this.employee();
    const items: { labelAr: string; labelEn: string; from?: string; to: string }[] = [];

    if (f.actionType === 'transfer') {
      const newOrg = this.orgNodesFlat.find((n: any) => n.id === +f.orgNodeId!);
      const newDept = this.departments.find((d: any) => d.id === +f.departmentId!);
      if (newOrg) items.push({ labelAr: 'الوحدة التنظيمية', labelEn: 'Org Unit',
        from: emp?.orgNodeNameAr ?? undefined,
        to: this.lang === 'ar' ? (newOrg.nameAr || newOrg.nameEn) : (newOrg.nameEn || newOrg.nameAr) });
      if (newDept) items.push({ labelAr: 'القسم', labelEn: 'Department',
        from: this.lang === 'ar' ? (emp?.departmentNameAr ?? undefined) : (emp?.departmentNameEn ?? undefined),
        to: this.lang === 'ar' ? (newDept.nameAr || newDept.nameEn) : (newDept.nameEn || newDept.nameAr) });
    } else if (f.actionType === 'promotion' || f.actionType === 'demotion') {
      const newTitle = this.jobTitles.find((t: any) => t.id === +f.jobTitleId!);
      if (newTitle) items.push({ labelAr: 'المسمى الوظيفي', labelEn: 'Job Title',
        from: this.lang === 'ar' ? (emp?.jobTitleAr ?? undefined) : (emp?.jobTitleEn ?? undefined),
        to: this.lang === 'ar' ? (newTitle.titleAr || newTitle.nameAr || newTitle.title) : (newTitle.titleEn || newTitle.nameEn || newTitle.title) });
      if (f.changeSalary && f.basicSalary != null)
        items.push({ labelAr: 'الراتب الأساسي', labelEn: 'Basic Salary', from: `${emp?.basicSalary} JOD`, to: `${f.basicSalary} JOD` });
    } else if (f.actionType === 'salary_change') {
      if (f.basicSalary != null) items.push({ labelAr: 'الراتب الأساسي', labelEn: 'Basic Salary', from: `${emp?.basicSalary} JOD`, to: `${f.basicSalary} JOD` });
      if (f.housingAllowance != null) items.push({ labelAr: 'بدل السكن', labelEn: 'Housing', from: `${emp?.housingAllowance} JOD`, to: `${f.housingAllowance} JOD` });
      if (f.transportAllowance != null) items.push({ labelAr: 'بدل المواصلات', labelEn: 'Transport', from: `${emp?.transportAllowance} JOD`, to: `${f.transportAllowance} JOD` });
      if (f.mobileAllowance != null) items.push({ labelAr: 'بدل الجوال', labelEn: 'Mobile', from: `${emp?.mobileAllowance} JOD`, to: `${f.mobileAllowance} JOD` });
      if (f.mealAllowance != null) items.push({ labelAr: 'بدل الوجبات', labelEn: 'Meal', from: `${emp?.mealAllowance} JOD`, to: `${f.mealAllowance} JOD` });
      if (f.otherAllowances != null) items.push({ labelAr: 'بدلات أخرى', labelEn: 'Other', from: `${emp?.otherAllowances} JOD`, to: `${f.otherAllowances} JOD` });
    } else if (f.actionType === 'suspension') {
      items.push({ labelAr: 'الحالة الوظيفية', labelEn: 'Status',
        from: this.statusLabel(emp?.employmentStatus ?? ''), to: this.lang === 'ar' ? 'موقوف' : 'Suspended' });
    } else if (f.actionType === 'suspension_lift') {
      items.push({ labelAr: 'الحالة الوظيفية', labelEn: 'Status',
        from: this.statusLabel(emp?.employmentStatus ?? ''), to: this.lang === 'ar' ? 'نشط' : 'Active' });
    } else if (f.actionType === 'termination') {
      items.push({ labelAr: 'الحالة الوظيفية', labelEn: 'Status',
        from: this.statusLabel(emp?.employmentStatus ?? ''), to: this.lang === 'ar' ? 'منتهي الخدمة' : 'Terminated' });
      items.push({ labelAr: 'تاريخ الإنهاء', labelEn: 'Termination Date', to: f.effectiveDate });
    } else if (f.actionType === 'warning_issued') {
      items.push({ labelAr: 'الإجراء', labelEn: 'Action', to: this.lang === 'ar' ? 'إصدار إنذار رسمي' : 'Official warning issued' });
    } else if (f.actionType === 'contract_renewal') {
      items.push({ labelAr: 'الإجراء', labelEn: 'Action', to: this.lang === 'ar' ? 'تجديد عقد العمل' : 'Employment contract renewed' });
    }
    return items;
  }

  parseJsonChanges(json: string | null | undefined): { key: string; fromVal: string; toVal: string }[] {
    if (!json) return [];
    try {
      const obj = JSON.parse(json);
      return Object.entries(obj ?? {}).map(([key, value]) => ({ key, fromVal: '', toVal: String(value) }));
    } catch { return []; }
  }

  parseBeforeAfter(before: string | null, after: string | null): { key: string; from: string; to: string }[] {
    if (!before && !after) return [];
    try {
      const b = before ? JSON.parse(before) : {};
      const a = after ? JSON.parse(after) : {};
      const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
      const result: { key: string; from: string; to: string }[] = [];
      keys.forEach(k => {
        const fromV = b[k] != null ? String(b[k]) : '—';
        const toV = a[k] != null ? String(a[k]) : '—';
        if (fromV !== toV) result.push({ key: k, from: fromV, to: toV });
      });
      return result;
    } catch { return []; }
  }

  formatChangeKey(key: string): string {
    const map: Record<string, { ar: string; en: string }> = {
      orgNodeId:           { ar: 'الوحدة التنظيمية', en: 'Org Unit' },
      departmentId:        { ar: 'القسم',             en: 'Department' },
      jobTitleId:          { ar: 'المسمى الوظيفي',   en: 'Job Title' },
      basicSalary:         { ar: 'الراتب الأساسي',    en: 'Basic Salary' },
      housingAllowance:    { ar: 'بدل السكن',         en: 'Housing' },
      transportAllowance:  { ar: 'بدل المواصلات',     en: 'Transport' },
      mobileAllowance:     { ar: 'بدل الجوال',        en: 'Mobile' },
      mealAllowance:       { ar: 'بدل الوجبات',       en: 'Meal' },
      otherAllowances:     { ar: 'بدلات أخرى',        en: 'Other' },
      employmentStatus:    { ar: 'الحالة الوظيفية',   en: 'Status' },
      terminationDate:     { ar: 'تاريخ الإنهاء',     en: 'Termination Date' },
    };
    const l = map[key];
    return l ? (this.lang === 'ar' ? l.ar : l.en) : key;
  }

  saveAction() {
    const emp = this.employee();
    if (!emp) return;
    this.actionSaving.set(true);
    const f = this.actionForm;
    const payload: Record<string, any> = {
      employeeId: emp.id,
      actionType: f.actionType,
      effectiveDate: f.effectiveDate,
      notes: f.notes || null,
    };
    if (f.actionType === 'transfer') {
      if (f.orgNodeId) payload['orgNodeId'] = f.orgNodeId;
      if (f.departmentId) payload['departmentId'] = f.departmentId;
    } else if (f.actionType === 'promotion' || f.actionType === 'demotion') {
      if (f.jobTitleId) payload['jobTitleId'] = f.jobTitleId;
      if (f.changeSalary) {
        if (f.basicSalary != null) payload['basicSalary'] = f.basicSalary;
        if (f.housingAllowance != null) payload['housingAllowance'] = f.housingAllowance;
        if (f.transportAllowance != null) payload['transportAllowance'] = f.transportAllowance;
        if (f.mobileAllowance != null) payload['mobileAllowance'] = f.mobileAllowance;
        if (f.mealAllowance != null) payload['mealAllowance'] = f.mealAllowance;
        if (f.otherAllowances != null) payload['otherAllowances'] = f.otherAllowances;
      }
    } else if (f.actionType === 'salary_change') {
      if (f.basicSalary != null) payload['basicSalary'] = f.basicSalary;
      if (f.housingAllowance != null) payload['housingAllowance'] = f.housingAllowance;
      if (f.transportAllowance != null) payload['transportAllowance'] = f.transportAllowance;
      if (f.mobileAllowance != null) payload['mobileAllowance'] = f.mobileAllowance;
      if (f.mealAllowance != null) payload['mealAllowance'] = f.mealAllowance;
      if (f.otherAllowances != null) payload['otherAllowances'] = f.otherAllowances;
    }
    this.api.post<any>('/api/employee-actions', payload).subscribe({
      next: () => {
        this.actionSaving.set(false);
        this.closeActionModal();
        this.toast.success(this.lang === 'ar' ? 'تم إرسال الإجراء بانتظار الاعتماد.' : 'Action submitted and awaiting approval.');
        this.loadActions(emp.id);
        // Link to disciplinary module for warning/suspension actions
        if (f.actionType === 'warning_issued' || f.actionType === 'suspension') {
          const discPayload: Record<string, any> = {
            employeeId: emp.id,
            violationDate: f.effectiveDate,
            violationNameAr: f.actionType === 'warning_issued' ? 'إنذار رسمي' : 'إيقاف عن العمل',
            violationNameEn: f.actionType === 'warning_issued' ? 'Official Warning' : 'Work Suspension',
            penaltyType: f.actionType === 'warning_issued' ? 'warning' : 'suspension',
            notes: f.notes || null,
            status: 'pending',
          };
          this.api.post<any>('/api/disciplinary', discPayload).subscribe({ error: () => {} });
        }
      },
      error: e => {
        this.actionSaving.set(false);
        this.confirmStep.set(false);
        this.toast.error(getErrorMessage(e, this.lang === 'ar' ? 'حدث خطأ أثناء حفظ الإجراء.' : 'Failed to save action.'));
      }
    });
  }

  approvingId = signal<number | null>(null);
  rejectingId = signal<number | null>(null);

  approveAction(actionId: number) {
    this.approvingId.set(actionId);
    this.api.post<any>(`/api/employee-actions/${actionId}/approve`, {}).subscribe({
      next: () => {
        this.approvingId.set(null);
        this.toast.success(this.lang === 'ar' ? 'تم اعتماد الإجراء وتطبيقه.' : 'Action approved and applied.');
        const emp = this.employee();
        if (emp) { this.loadActions(emp.id); this.loadEmployee(emp.id); }
      },
      error: e => {
        this.approvingId.set(null);
        this.toast.error(getErrorMessage(e, this.lang === 'ar' ? 'فشل اعتماد الإجراء.' : 'Failed to approve action.'));
      }
    });
  }

  rejectAction(actionId: number) {
    this.rejectingId.set(actionId);
    this.api.post<any>(`/api/employee-actions/${actionId}/reject`, {}).subscribe({
      next: () => {
        this.rejectingId.set(null);
        this.toast.success(this.lang === 'ar' ? 'تم رفض الإجراء.' : 'Action rejected.');
        const emp = this.employee();
        if (emp) this.loadActions(emp.id);
      },
      error: e => {
        this.rejectingId.set(null);
        this.toast.error(getErrorMessage(e, this.lang === 'ar' ? 'فشل رفض الإجراء.' : 'Failed to reject action.'));
      }
    });
  }

  actionStatusLabel(status: string | null | undefined): string {
    const s = status ?? 'applied';
    if (s === 'pending')  return this.lang === 'ar' ? 'بانتظار الاعتماد' : 'Pending';
    if (s === 'rejected') return this.lang === 'ar' ? 'مرفوض' : 'Rejected';
    return this.lang === 'ar' ? 'مطبّق' : 'Applied';
  }

  actionStatusClass(status: string | null | undefined): string {
    const s = status ?? 'applied';
    if (s === 'pending')  return 'action-status-badge status-pending';
    if (s === 'rejected') return 'action-status-badge status-rejected';
    return 'action-status-badge status-applied';
  }

  goToEdit() {
    const emp = this.employee();
    if (!emp) return;
    this.router.navigate(['/app/employees'], { queryParams: { edit: emp.id } });
  }

  ACTION_TYPES = [
    'hire','probation_start','probation_complete','probation_fail',
    'transfer','promotion','demotion','salary_change',
    'suspension','suspension_lift','termination','resignation',
    'leave_of_absence','return_from_leave','warning_issued',
    'document_expired','contract_renewal',
  ];

  goBack() {
    this.router.navigate(['/app/employees']);
  }
}
