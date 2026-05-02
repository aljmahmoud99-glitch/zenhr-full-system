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
  showQualModal = false;
  qualSaving = false;
  qualForm: any = {
    qualificationType: 'education',
    degree: '',
    institution: '',
    year: '',
    jobTitle: '',
    company: '',
    years: '',
    description: '',
    name: '',
    level: null,
    provider: '',
    date: ''
  };
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

  activeTab = signal<'personal' | 'employment' | 'probation' | 'attendance' | 'leave' | 'advances' | 'compliance' | 'documents' | 'assets' | 'payslips' | 'bank-ssc' | 'disciplinary' | 'qualifications'>('personal');
  loadedTabs = signal<string[]>(['personal']);

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

  onTabChange(tab: 'personal' | 'employment' | 'probation' | 'attendance' | 'leave' | 'advances' | 'compliance' | 'documents' | 'assets' | 'payslips' | 'bank-ssc' | 'disciplinary' | 'qualifications') {
    this.activeTab.set(tab);
    if (tab === 'qualifications') this.loadQualifications(this.employeeId);
    if (this.loadedTabs().includes(tab)) return;

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

    this.loadedTabs.set([...this.loadedTabs(), tab]);
  }

  canSeeTab(tab: 'personal' | 'employment' | 'probation' | 'attendance' | 'leave' | 'advances' | 'compliance' | 'documents' | 'assets' | 'bank-ssc' | 'salary' | 'payslips' | 'disciplinary' | 'qualifications') {
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
    return false;
  }

  loadQualifications(empId: number): void {
    this.http.get<any>(`/api/employees/${empId}/qualifications`).subscribe(r => this.qualifications = r.data ?? []);
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

  openAddQual(type: string) {
    this.qualForm = {
      qualificationType: type,
      degree: '',
      institution: '',
      year: '',
      jobTitle: '',
      company: '',
      years: '',
      description: '',
      name: '',
      level: null,
      provider: '',
      date: ''
    };
    this.showQualModal = true;
  }

  closeQualModal() {
    this.showQualModal = false;
    this.qualSaving = false;
  }

  saveQualification() {
    const type = this.qualForm.qualificationType;
    const data = this.qualificationPayload(type);
    this.qualSaving = true;
    this.http.post<any>(`/api/employees/${this.employeeId}/qualifications`, {
      qualificationType: type,
      dataJson: JSON.stringify(data)
    }).subscribe({
      next: () => {
        this.closeQualModal();
        this.loadQualifications(this.employeeId);
      },
      error: () => this.qualSaving = false
    });
  }

  qualificationPayload(type: string) {
    if (type === 'education') {
      return { degree: this.qualForm.degree, institution: this.qualForm.institution, year: this.qualForm.year };
    }
    if (type === 'experience') {
      return {
        jobTitle: this.qualForm.jobTitle,
        company: this.qualForm.company,
        years: this.qualForm.years,
        description: this.qualForm.description
      };
    }
    if (type === 'skill') {
      return { name: this.qualForm.name, level: this.qualForm.level };
    }
    return { name: this.qualForm.name, provider: this.qualForm.provider, date: this.qualForm.date };
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

  addQualification() {
    const qualificationType = prompt('Qualification type');
    if (!qualificationType) return;
    const dataJson = prompt('Data JSON', '{}') || '{}';
    this.http.post<any>(`/api/employees/${this.employeeId}/qualifications`, { qualificationType, dataJson })
      .subscribe(() => this.loadQualifications(this.employeeId));
  }

  deleteQualification(qualId: number) {
    this.http.delete<any>(`/api/employees/${this.employeeId}/qualifications/${qualId}`)
      .subscribe(() => this.loadQualifications(this.employeeId));
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
      }
    });
  }

  formatAttendanceTime(value?: string | null) {
    if (!value) return '—';
    return new Date(value).toLocaleTimeString(this.lang === 'ar' ? 'ar-JO' : 'en-US', { hour: '2-digit', minute: '2-digit' });
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

  goBack() {
    this.router.navigate(['/app/employees']);
  }
}
