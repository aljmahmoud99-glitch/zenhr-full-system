import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { RoleAccessService } from '../../core/services/role-access.service';
import { AppSettingsService } from '../../core/services/app-settings.service';
import { TenantContextService } from '../../core/services/tenant-context.service';
import { ApiResponse, DashboardSummary, LeaveBalance, LeaveRequest, OvertimeRequest, PayrollRun, Payslip } from '../../core/models';
import { SkeletonCardComponent } from '../../shared/components/skeleton/skeleton-card.component';
import { SkeletonKpiCardsComponent } from '../../shared/components/skeleton/skeleton-kpi-cards.component';

type Tone = 'emerald' | 'blue' | 'amber' | 'danger' | 'purple' | 'gold';

type InsightCard = {
  labelAr: string;
  labelEn: string;
  value: string | number;
  icon: string;
  tone: Tone;
  route?: string;
  metaAr?: string;
  metaEn?: string;
};

type HeroAction = {
  labelAr: string;
  labelEn: string;
  icon: string;
  route: string;
  variant: 'primary' | 'secondary';
};

type DepartmentHeadcount = {
  departmentId: number;
  nameAr: string;
  nameEn: string;
  count: number;
};

type ActivityItem = {
  id: number;
  actionType?: string;
  entityType?: string;
  entityId?: number;
  descriptionAr?: string;
  descriptionEn?: string;
  createdAt: string;
};

type ComplianceAlert = {
  type: string;
  severity: 'warning' | 'expired';
  employeeId: number;
  nameAr: string;
  message: string;
  daysRemaining?: number | null;
};

type ProbationItem = {
  id: number;
  employeeCode: string;
  nameAr: string;
  deptAr?: string;
  probationEndDate?: string;
  daysRemaining: number;
};

type ManagerQueueItem = {
  id: number;
  kind: 'leave' | 'overtime';
  employeeName: string;
  details: string;
  status: string;
};

type EmployeeQuickAction = {
  labelAr: string;
  labelEn: string;
  icon: string;
  route: string;
};

type EmployeeWidgetKey = 'attendance' | 'requests' | 'leave' | 'payslip' | 'compliance' | 'assets';
type AttendanceDay = { date: string; present: number; total: number };
type LeaveTypeRow = { leaveTypeId: number; nameAr: string; nameEn: string; count: number };
type PayrollStatusRow = { status: string; count: number };

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, SkeletonCardComponent, SkeletonKpiCardsComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit {
  summary = signal<DashboardSummary | null>(null);
  deptData = signal<DepartmentHeadcount[]>([]);
  recentActivity = signal<ActivityItem[]>([]);
  complianceAlerts = signal<ComplianceAlert[]>([]);
  employeeComplianceSummary = signal<any | null>(null);
  upcomingProbations = signal<ProbationItem[]>([]);
  managerQueue = signal<ManagerQueueItem[]>([]);
  payrollRuns = signal<PayrollRun[]>([]);
  pendingAdvances = signal<any[]>([]);
  todayStatus = signal<any | null>(null);
  latestPayslip = signal<Payslip | null>(null);
  leaveBalances = signal<LeaveBalance[]>([]);
  leaveRequests = signal<LeaveRequest[]>([]);
  overtimeRequests = signal<OvertimeRequest[]>([]);
  employeeAdvances = signal<any[]>([]);
  employeeAssets = signal<any[]>([]);
  loading = signal(true);
  attendanceTrend = signal<AttendanceDay[]>([]);
  leaveTypeBreakdown = signal<LeaveTypeRow[]>([]);
  payrollStatusBreakdown = signal<PayrollStatusRow[]>([]);
  employeeStatusData = signal<{status: string; count: number}[]>([]);
  myAttendanceMonth = signal<{status: string; count: number}[]>([]);
  myPayslipTrend = signal<{month: number; year: number; net: string; gross: string; deductions: string}[]>([]);
  payrollMonthlyTrend = signal<{month: number; year: number; totalNet: string; totalGross: string; status: string; employeeCount: number}[]>([]);
  usersByRole = signal<{role: string; count: number}[]>([]);
  activityByModule = signal<{module: string; count: number}[]>([]);
  employeeWidgetLoading = signal<Record<EmployeeWidgetKey, boolean>>({
    attendance: false,
    requests: false,
    leave: false,
    payslip: false,
    compliance: false,
    assets: false
  });
  employeeWidgetErrors = signal<Record<EmployeeWidgetKey, string | null>>({
    attendance: null,
    requests: null,
    leave: null,
    payslip: null,
    compliance: null,
    assets: null
  });

  constructor(
    public auth: AuthService,
    public access: RoleAccessService,
    public tenant: TenantContextService,
    private api: ApiService,
    private settings: AppSettingsService
  ) {}

  readonly headerTitle = computed(() => {
    const firstNameAr = this.auth.currentUser()?.employee?.firstNameAr ?? this.auth.currentUser()?.username ?? '';
    const firstNameEn = this.auth.currentUser()?.employee?.firstNameEn ?? this.auth.currentUser()?.username ?? '';
    const map: Record<string, { ar: string; en: string }> = {
      superadmin: { ar: 'رؤية تشغيلية شاملة للمنصة', en: 'Full platform operations view' },
      hradmin: { ar: `مرحبًا، ${firstNameAr}`, en: `Welcome back, ${firstNameEn}` },
      payrolladmin: { ar: 'تشغيل الرواتب والمهام المالية', en: 'Payroll and finance operations' },
      manager: { ar: `مرحبًا ${firstNameAr}، فريقك جاهز`, en: `Welcome ${firstNameEn}, your team is in focus` },
      employee: { ar: `مرحبًا ${firstNameAr}، يومك منظم`, en: `Welcome ${firstNameEn}, your day is organized` }
    };

    return map[this.role] ?? { ar: 'لوحة التحكم', en: 'Dashboard' };
  });

  readonly headerSubtitle = computed(() => {
    const map: Record<string, { ar: string; en: string }> = {
      superadmin: { ar: 'تابع الشركات والمستخدمين وصحة التشغيل من شاشة واحدة متماسكة.', en: 'Track companies, users, and platform health from one cohesive workspace.' },
      hradmin: { ar: 'ملخص الموارد البشرية اليومي مع أهم الإجراءات والتنبيهات والملفات المفتوحة.', en: 'Daily HR pulse with the most important actions, alerts, and open workflows.' },
      payrolladmin: { ar: 'سلف ورواتب ومستحقات في واجهة تشغيلية هادئة وواضحة.', en: 'Advances, payroll runs, and financial tasks in one calm operational workspace.' },
      manager: { ar: 'اعتمادات الفريق وحضوره وتحركاته اليومية في مكان واحد.', en: 'Team approvals, attendance, and daily movement in one place.' },
      employee: { ar: 'حضوري وإجازاتي وخدماتي الذاتية بواجهة بسيطة وواضحة.', en: 'My attendance, leave, and self-service actions in one simple, clear workspace.' }
    };

    return map[this.role] ?? { ar: 'نظرة تنفيذية على أعمال اليوم', en: 'An executive view of today’s work' };
  });

  readonly heroActions = computed<HeroAction[]>(() => {
    switch (this.role) {
      case 'superadmin':
        return [
          { labelAr: 'الشركات', labelEn: 'Companies', icon: 'domain', route: '/admin/companies', variant: 'primary' },
          { labelAr: 'المستخدمون', labelEn: 'Users', icon: 'manage_accounts', route: '/admin/users', variant: 'secondary' }
        ];
      case 'hradmin':
        return [
          { labelAr: 'إضافة موظف', labelEn: 'Add employee', icon: 'person_add', route: '/app/employees', variant: 'primary' },
          { labelAr: 'تقرير', labelEn: 'Report', icon: 'bar_chart', route: '/app/documents-reporting', variant: 'secondary' }
        ];
      case 'payrolladmin':
        return [
          { labelAr: 'مسيرات الرواتب', labelEn: 'Payroll runs', icon: 'receipt_long', route: '/app/payroll/runs', variant: 'primary' },
          { labelAr: 'السلف', labelEn: 'Advances', icon: 'payments', route: '/app/advances', variant: 'secondary' }
        ];
      case 'manager':
        return [
          { labelAr: 'طلبات الفريق', labelEn: 'Team requests', icon: 'pending_actions', route: '/app/leave-management', variant: 'primary' },
          { labelAr: 'حضور الفريق', labelEn: 'Team attendance', icon: 'fact_check', route: '/app/attendance', variant: 'secondary' }
        ];
      default:
        return [];
    }
  });

  readonly topCards = computed<InsightCard[]>(() => {
    const s = this.summary();
    if (!s) return [];

    if (this.role === 'payrolladmin') {
      const currentRun = this.payrollRuns()[0];
      const pendingAdvanceCount = this.pendingAdvances().length;

      return [
        this.card('المسير الحالي', 'Current run', currentRun ? `${this.monthName(currentRun.runMonth)} ${currentRun.runYear}` : this.t('لم يتم إنشاء مسير بعد', 'No payroll run yet'), 'receipt_long', 'gold', '/app/payroll/runs',
          currentRun ? this.t(`الحالة: ${this.statusLabel(currentRun.status)}`, `Status: ${this.statusLabel(currentRun.status)}`) : this.t('ابدأ أول مسير رواتب', 'Create the first payroll run'),
          currentRun ? this.t(`الحالة: ${this.statusLabel(currentRun.status)}`, `Status: ${this.statusLabel(currentRun.status)}`) : this.t('ابدأ أول مسير رواتب', 'Create the first payroll run')),
        this.card('صافي الرواتب', 'Net payroll', currentRun ? this.money(currentRun.totalNet) : this.money(0), 'payments', 'blue', '/app/payroll/runs', 'صافي المسير الأخير', 'Net amount of the latest run'),
        this.card('السلف المعلقة', 'Pending advances', pendingAdvanceCount, 'account_balance_wallet', 'amber', '/app/advances', 'بانتظار القرار المالي', 'Awaiting financial action')
      ];
    }

    if (this.role === 'employee') {
      const myToday = this.todayStatus();
      const latestSlip = this.latestPayslip();

      return [
        this.card('حالتي اليوم', 'Today status', this.employeeTodayLabel(myToday?.status), 'schedule', 'emerald', '/app/attendance',
          myToday?.clockIn ? this.t(`تم تسجيل الحضور ${this.formatWhen(myToday.clockIn)}`, `Clocked in ${this.formatWhen(myToday.clockIn)}`) : this.t('افتح الحضور للتسجيل', 'Open attendance to clock in'),
          myToday?.clockIn ? this.t(`تم تسجيل الحضور ${this.formatWhen(myToday.clockIn)}`, `Clocked in ${this.formatWhen(myToday.clockIn)}`) : this.t('افتح الحضور للتسجيل', 'Open attendance to clock in')),
        this.card('طلباتي المعلقة', 'My pending requests', s.pendingLeaves + s.pendingOvertimes, 'pending_actions', 'blue', '/app/leave-management', 'إجازات وإضافي', 'Leave and overtime requests'),
        this.card('آخر كشف راتب', 'Latest payslip', latestSlip ? this.money(latestSlip.netSalary) : this.t('لم يصدر بعد', 'Not issued yet'), 'receipt_long', 'purple', '/app/payroll/slips',
          latestSlip ? `${this.monthName(latestSlip.periodMonth)} ${latestSlip.periodYear}` : this.t('سيظهر هنا عند إصداره', 'It will appear here once issued'),
          latestSlip ? `${this.monthName(latestSlip.periodMonth)} ${latestSlip.periodYear}` : this.t('سيظهر هنا عند إصداره', 'It will appear here once issued'))
      ];
    }

    switch (this.role) {
      case 'hradmin':
        return [
          this.card('حاضرون اليوم', 'Present today', s.presentToday, 'fact_check', 'blue', '/app/attendance', `${s.absentToday} غائب`, `${s.absentToday} absent`),
          this.card('طلبات معلقة', 'Pending requests', s.pendingLeaves + s.pendingOvertimes + s.pendingAdvances, 'pending_actions', 'amber', '/app/leave-management', 'إجازات وإضافي وسلف', 'Leave, overtime, and advances'),
          this.card('تنبيهات الامتثال', 'Compliance alerts', s.sscNotEnrolled + s.wpExpiringSoon + s.healthExpiringSoon, 'verified_user', 'danger', '/app/compliance-contracts', 'تحتاج إجراء فوري', 'Need immediate action')
        ];
      case 'payrolladmin':
        return [
          this.card('الموظفون المشمولون', 'Covered employees', s.totalEmployees, 'groups', 'gold', '/app/employees', 'أساس التشغيل الشهري', 'Monthly payroll scope'),
          this.card('السلف المعلقة', 'Pending advances', s.pendingAdvances, 'payments', 'amber', '/app/advances', 'بانتظار القرار المالي', 'Awaiting financial action'),
          this.card('إضافي معلق', 'Pending overtime', s.pendingOvertimes, 'more_time', 'purple', '/app/overtime', 'يؤثر على المسير القادم', 'Affects the next payroll')
        ];
      case 'manager':
        return [
          this.card('حاضرون اليوم', 'Present today', s.presentToday, 'fact_check', 'blue', '/app/attendance', `${s.onLeaveToday} في إجازة`, `${s.onLeaveToday} on leave`),
          this.card('طلبات إجازة', 'Leave approvals', s.pendingLeaves, 'event_note', 'amber', '/app/leave-management', 'بانتظار قرارك', 'Waiting for your approval'),
          this.card('طلبات إضافي', 'Overtime approvals', s.pendingOvertimes, 'more_time', 'danger', '/app/overtime', 'تحتاج مراجعة اليوم', 'Needs review today')
        ];
      case 'employee':
        return [
          this.card('حالتي اليوم', 'Today status', s.presentToday > 0 ? this.t('حاضر', 'Present') : this.t('لم أسجل بعد', 'Not clocked in'), 'schedule', 'emerald', '/app/attendance', this.t('سجّل حضورك من هنا', 'Open attendance to clock in'), this.t('سجّل حضورك من هنا', 'Open attendance to clock in')),
          this.card('إجازاتي المعلقة', 'Pending leave', s.pendingLeaves, 'event_note', 'blue', '/app/leave-management', 'آخر طلباتك قيد المعالجة', 'Your latest requests are in progress'),
          this.card('إضافي معلق', 'Pending overtime', s.pendingOvertimes, 'more_time', 'purple', '/app/overtime', 'ساعات بانتظار الاعتماد', 'Hours waiting for approval')
        ];
      default:
        return [
          this.card('الشركات النشطة', 'Active companies', s.totalEmployees, 'domain', 'emerald', '/admin/companies', 'متابعة تشغيلية مباشرة', 'Operational visibility'),
          this.card('موافقات معلقة', 'Pending approvals', s.pendingLeaves + s.pendingOvertimes + s.pendingAdvances, 'pending_actions', 'amber', '/admin/users', 'مستخدمون وحالات بانتظار المتابعة', 'Users and items awaiting follow-up'),
          this.card('تنبيهات الامتثال', 'Compliance alerts', s.sscNotEnrolled + s.wpExpiringSoon + s.healthExpiringSoon, 'verified_user', 'danger', '/app/compliance-contracts', 'عرض عابر للمنصة', 'Cross-platform visibility')
        ];
    }
  });

  get lang() {
    return this.auth.lang;
  }

  get role() {
    return this.auth.currentUser()?.role ?? '';
  }

  readonly employeeQuickActions = computed<EmployeeQuickAction[]>(() => {
    if (this.role !== 'employee') {
      return [];
    }

    return [
      { labelAr: 'تسجيل الحضور والانصراف', labelEn: 'Clock in / out', icon: 'schedule', route: '/app/attendance' },
      { labelAr: 'طلب إجازة', labelEn: 'Request leave', icon: 'event_note', route: '/app/leave-management' },
      { labelAr: 'طلب عمل إضافي', labelEn: 'Request overtime', icon: 'more_time', route: '/app/overtime' },
      { labelAr: 'طلب سلفة', labelEn: 'Request advance', icon: 'payments', route: '/app/advances' },
      { labelAr: 'عرض قسيمة الراتب', labelEn: 'View payslip', icon: 'receipt_long', route: '/app/payroll/slips' },
      { labelAr: 'عرض الوثائق', labelEn: 'View documents', icon: 'folder_open', route: '/app/documents' }
    ].filter(action => this.access.canSeePage(action.route));
  });

  readonly attendanceDonutGradient = computed(() => {
    const s = this.summary();
    if (!s || s.totalEmployees === 0) return 'conic-gradient(#e2e8f0 0% 100%)';
    const total = s.totalEmployees || 1;
    const p = (s.presentToday / total) * 100;
    const l = (s.onLeaveToday / total) * 100;
    return `conic-gradient(var(--app-primary, #2d9e6b) 0% ${p}%, #f59e0b ${p}% ${p + l}%, #ef4444 ${p + l}% 100%)`;
  });

  readonly payrollGradient = computed(() => {
    const rows = this.payrollStatusBreakdown();
    if (!rows.length) return 'conic-gradient(#e2e8f0 0% 100%)';
    const total = rows.reduce((s, r) => s + r.count, 0) || 1;
    const colorMap: Record<string, string> = { draft: '#94a3b8', approved: '#f59e0b', paid: '#2d9e6b', unpaid: '#ef4444' };
    let acc = 0;
    const stops = rows.map(r => {
      const pct = (r.count / total) * 100;
      const stop = `${colorMap[r.status] ?? '#94a3b8'} ${acc.toFixed(1)}% ${(acc + pct).toFixed(1)}%`;
      acc += pct;
      return stop;
    });
    return `conic-gradient(${stops.join(', ')})`;
  });

  readonly attendanceTrendMax = computed(() => {
    const days = this.attendanceTrend();
    return Math.max(...days.map(d => d.present), 1);
  });

  readonly leaveTypeMax = computed(() => {
    return Math.max(...this.leaveTypeBreakdown().map(r => r.count), 1);
  });

  readonly payrollTotal = computed(() => {
    return this.payrollStatusBreakdown().reduce((s, r) => s + r.count, 0);
  });

  readonly leaveBalanceBars = computed(() => {
    return this.leaveBalances()
      .map(b => ({
        nameAr: b.leaveTypeNameAr ?? 'إجازة',
        nameEn: b.leaveTypeNameEn ?? 'Leave',
        used: Number(b.usedDays || 0),
        remaining: Number(b.remainingDays || 0),
        total: Number(b.usedDays || 0) + Number(b.remainingDays || 0),
      }))
      .filter(b => b.total > 0);
  });

  readonly leaveBalanceMax = computed(() => {
    return Math.max(...this.leaveBalanceBars().map(b => b.total), 1);
  });

  readonly pendingItemsData = computed(() => {
    const s = this.summary();
    const advCount = this.pendingAdvances().length;
    const otCount = s?.pendingOvertimes ?? 0;
    const leaveCount = s?.pendingLeaves ?? 0;
    const maxVal = Math.max(advCount, otCount, leaveCount, 1);
    return [
      { labelAr: 'إجازات', labelEn: 'Leaves', count: leaveCount, pct: (leaveCount / maxVal) * 100 },
      { labelAr: 'عمل إضافي', labelEn: 'Overtime', count: otCount, pct: (otCount / maxVal) * 100 },
      { labelAr: 'سلف', labelEn: 'Advances', count: advCount, pct: (advCount / maxVal) * 100 },
    ];
  });

  readonly employeeStatusGradient = computed(() => {
    const rows = this.employeeStatusData();
    if (!rows.length) return 'conic-gradient(#e2e8f0 0% 100%)';
    const total = rows.reduce((s, r) => s + r.count, 0) || 1;
    const colorMap: Record<string, string> = { active: '#2d9e6b', probation: '#3b82f6', inactive: '#94a3b8', terminated: '#ef4444' };
    let acc = 0;
    const stops = rows.map(r => {
      const pct = (r.count / total) * 100;
      const stop = `${colorMap[r.status] ?? '#94a3b8'} ${acc.toFixed(1)}% ${(acc + pct).toFixed(1)}%`;
      acc += pct;
      return stop;
    });
    return `conic-gradient(${stops.join(', ')})`;
  });

  readonly employeeStatusTotal = computed(() => this.employeeStatusData().reduce((s, r) => s + r.count, 0));

  readonly usersByRoleGradient = computed(() => {
    const rows = this.usersByRole();
    if (!rows.length) return 'conic-gradient(#e2e8f0 0% 100%)';
    const total = rows.reduce((s, r) => s + r.count, 0) || 1;
    const colors = ['#2d9e6b', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
    let acc = 0;
    const stops = rows.map((r, i) => {
      const pct = (r.count / total) * 100;
      const stop = `${colors[i % colors.length]} ${acc.toFixed(1)}% ${(acc + pct).toFixed(1)}%`;
      acc += pct;
      return stop;
    });
    return `conic-gradient(${stops.join(', ')})`;
  });

  readonly usersByRoleTotal = computed(() => this.usersByRole().reduce((s, r) => s + r.count, 0));

  readonly payrollMonthlyMax = computed(() =>
    Math.max(...this.payrollMonthlyTrend().map(r => Number(r.totalNet) || 0), 1)
  );

  readonly myPayslipMax = computed(() =>
    Math.max(...this.myPayslipTrend().map(r => Number(r.gross) || 0), 1)
  );

  readonly myAttendanceMonthData = computed(() => {
    const rows = this.myAttendanceMonth();
    const colorMap: Record<string, string> = { present: '#2d9e6b', late: '#f59e0b', absent: '#ef4444', on_leave: '#3b82f6' };
    const labelAr: Record<string, string> = { present: 'حاضر', late: 'متأخر', absent: 'غائب', on_leave: 'إجازة' };
    const labelEn: Record<string, string> = { present: 'Present', late: 'Late', absent: 'Absent', on_leave: 'Leave' };
    const max = Math.max(...rows.map(r => r.count), 1);
    return rows.map(r => ({
      status: r.status,
      count: r.count,
      pct: (r.count / max) * 100,
      color: colorMap[r.status] ?? '#94a3b8',
      labelAr: labelAr[r.status] ?? r.status,
      labelEn: labelEn[r.status] ?? r.status,
    }));
  });

  readonly activityModuleMax = computed(() =>
    Math.max(...this.activityByModule().map(r => r.count), 1)
  );

  readonly latestPayrollRun = computed(() => {
    const t = this.payrollMonthlyTrend();
    return t.length ? t[t.length - 1]! : null;
  });

  readonly latestRunNetRatio = computed(() => {
    const r = this.latestPayrollRun();
    if (!r) return 0;
    const g = Number(r.totalGross); const n = Number(r.totalNet);
    return g > 0 ? (n / g) * 100 : 0;
  });

  readonly latestRunDeductionRatio = computed(() => {
    const r = this.latestPayrollRun();
    if (!r) return 0;
    const g = Number(r.totalGross); const n = Number(r.totalNet);
    return g > 0 ? ((g - n) / g) * 100 : 0;
  });

  ngOnInit() {
    if (this.role !== 'superadmin') {
      this.tenant.load();
    }
    if (this.role === 'employee') {
      this.loading.set(false);
      this.loadEmployeeComplianceSummary();
      this.loadTodayStatus();
      this.loadLatestPayslip();
      this.loadEmployeeLeaveData();
      this.loadEmployeeOvertimeData();
      this.loadEmployeeAdvances();
      this.loadEmployeeAssets();
      this.loadMyAttendanceMonth();
      this.loadMyPayslipTrend();
      return;
    }

    this.loadSummary();
    this.loadDepartmentData();
    this.loadRecentActivity();
    this.loadComplianceAlerts();
    this.loadUpcomingProbations();
    this.loadManagerQueue();
    this.loadPayrollRuns();
    this.loadPendingAdvances();
    this.loadAttendanceTrend();
    this.loadLeaveTypeBreakdown();
    this.loadPayrollStatusBreakdown();
    this.loadEmployeeStatusData();
    this.loadPayrollMonthlyTrend();
    this.loadUsersByRole();
    this.loadActivityByModule();
  }

  t(ar: string, en: string) {
    return this.lang === 'ar' ? ar : en;
  }

  icon(name: string) {
    const map: Record<string, string> = {
      people: 'groups',
      groups: 'groups',
      fact_check: 'fact_check',
      schedule: 'schedule',
      event_note: 'event_note',
      pending_actions: 'pending_actions',
      receipt_long: 'receipt_long',
      more_time: 'more_time',
      payments: 'payments',
      verified_user: 'verified_user',
      domain: 'domain'
    };
    return map[name] || name;
  }

  maxDept() {
    const arr = this.deptData();
    return arr.length ? Math.max(...arr.map(item => item.count)) : 1;
  }

  formatWhen(value?: string) {
    if (!value) {
      return this.t('الآن', 'Now');
    }

    const date = new Date(value);
    return new Intl.DateTimeFormat(this.lang === 'ar' ? 'ar-JO-u-nu-latn' : 'en-US', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  activityText(item: ActivityItem) {
    return this.lang === 'ar'
      ? (item.descriptionAr || item.entityType || 'نشاط جديد')
      : (item.descriptionEn || item.entityType || 'New activity');
  }

  alertText(alert: ComplianceAlert) {
    const days = alert.daysRemaining;
    if (days == null) {
      return this.t(`${alert.nameAr} يحتاج متابعة`, `${alert.nameAr} needs follow-up`);
    }

    if (days <= 0) {
      return this.t(`${alert.nameAr} منتهي الصلاحية`, `${alert.nameAr} is expired`);
    }

    return this.t(`${alert.nameAr} خلال ${days} يوم`, `${alert.nameAr} in ${days} days`);
  }

  probationTone(daysRemaining: number) {
    if (daysRemaining <= 7) return 'danger';
    if (daysRemaining <= 15) return 'amber';
    return 'blue';
  }

  queueBadge(kind: 'leave' | 'overtime') {
    return kind === 'leave' ? this.t('إجازة', 'Leave') : this.t('إضافي', 'OT');
  }

  monthName(month?: number) {
    if (!month) return '';
    const ar = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const en = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return this.lang === 'ar' ? ar[month] : en[month];
  }

  money(value: number | undefined | null) {
    return this.settings.formatMoney(value);
  }

  statusLabel(status: string) {
    const ar: Record<string, string> = { draft: 'مسودة', approved: 'موافق عليه', paid: 'مدفوع', unpaid: 'غير مدفوع' };
    const en: Record<string, string> = { draft: 'Draft', approved: 'Approved', paid: 'Paid', unpaid: 'Unpaid' };
    return this.lang === 'ar' ? (ar[status] || status) : (en[status] || status);
  }

  employeeStatusColor(status: string): string {
    const m: Record<string, string> = { active: '#2d9e6b', probation: '#3b82f6', inactive: '#94a3b8', terminated: '#ef4444' };
    return m[status] ?? '#94a3b8';
  }

  employeeStatusLabelAr(status: string): string {
    const m: Record<string, string> = { active: 'نشط', probation: 'فترة تجربة', inactive: 'غير نشط', terminated: 'منتهي' };
    return m[status] ?? status;
  }

  roleColorIndex(role: string): string {
    const colors = ['#2d9e6b', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
    const roles = ['hradmin', 'employee', 'manager', 'payrolladmin', 'superadmin', 'recruiter'];
    const idx = roles.indexOf(role);
    return colors[idx >= 0 ? idx : 0]!;
  }

  roleLabelAr(role: string): string {
    const m: Record<string, string> = { superadmin: 'مدير النظام', hradmin: 'موارد بشرية', payrolladmin: 'مدير الرواتب', manager: 'مدير قسم', employee: 'موظف', recruiter: 'مسؤول تعيين' };
    return m[role] ?? role;
  }

  roleLabelEn(role: string): string {
    const m: Record<string, string> = { superadmin: 'Superadmin', hradmin: 'HR Admin', payrolladmin: 'Payroll Admin', manager: 'Manager', employee: 'Employee', recruiter: 'Recruiter' };
    return m[role] ?? role;
  }

  moduleLabel(module: string): string {
    const m: Record<string, string> = {
      leave: this.t('إجازات', 'Leave'), overtime: this.t('عمل إضافي', 'Overtime'),
      attendance: this.t('حضور', 'Attendance'), payroll: this.t('رواتب', 'Payroll'),
      employee: this.t('موظفون', 'Employees'), compliance: this.t('امتثال', 'Compliance'),
      asset: this.t('أصول', 'Assets'), advance: this.t('سلف', 'Advances'),
    };
    return m[module] ?? module;
  }

  payrollMonthBarHeight(totalNet: string): number {
    const max = this.payrollMonthlyMax();
    return max > 0 ? (Number(totalNet) / max) * 100 : 0;
  }

  payslipMonthBarHeight(gross: string): number {
    const max = this.myPayslipMax();
    return max > 0 ? (Number(gross) / max) * 100 : 0;
  }

  monthYearLabel(month: number, year: number): string {
    const ar = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const en = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const m = this.lang === 'ar' ? (ar[month] ?? '') : (en[month] ?? '');
    return `${m} ${String(year).slice(2)}`;
  }

  latestRunGross(): string { const r = this.latestPayrollRun(); return r ? this.money(Number(r.totalGross)) : '—'; }
  latestRunNet(): string { const r = this.latestPayrollRun(); return r ? this.money(Number(r.totalNet)) : '—'; }
  latestRunDeduction(): string {
    const r = this.latestPayrollRun();
    return r ? this.money(Number(r.totalGross) - Number(r.totalNet)) : '—';
  }

  employeeTodayLabel(status?: string) {
    const ar: Record<string, string> = { present: 'حاضر', late: 'متأخر', absent: 'غائب', on_leave: 'في إجازة' };
    const en: Record<string, string> = { present: 'Present', late: 'Late', absent: 'Absent', on_leave: 'On leave' };
    if (!status) return this.t('لم أسجل بعد', 'Not clocked in');
    return this.lang === 'ar' ? (ar[status] || status) : (en[status] || status);
  }

  employeeWidgetLabel(key: EmployeeWidgetKey) {
    const map: Record<EmployeeWidgetKey, { ar: string; en: string }> = {
      attendance: { ar: 'حالة الحضور اليوم', en: 'Today attendance' },
      requests: { ar: 'طلباتي المعلقة', en: 'Pending requests' },
      leave: { ar: 'رصيد الإجازات', en: 'Leave balance' },
      payslip: { ar: 'آخر قسيمة راتب', en: 'Latest payslip' },
      compliance: { ar: 'تنبيهات الوثائق والامتثال', en: 'Compliance alerts' },
      assets: { ar: 'الأصول المعيّنة لي', en: 'Assigned assets' }
    };

    return this.lang === 'ar' ? map[key].ar : map[key].en;
  }

  employeeWidgetRoute(key: EmployeeWidgetKey) {
    const map: Record<EmployeeWidgetKey, string> = {
      attendance: '/app/attendance',
      requests: '/app/leave-management',
      leave: '/app/leave-management',
      payslip: '/app/payroll/slips',
      compliance: this.access.canSeePage('/app/documents-reporting') ? '/app/documents-reporting' : '/app/documents',
      assets: '/app/assets'
    };

    return map[key];
  }

  employeeWidgetIcon(key: EmployeeWidgetKey) {
    const map: Record<EmployeeWidgetKey, string> = {
      attendance: 'schedule',
      requests: 'pending_actions',
      leave: 'event_note',
      payslip: 'receipt_long',
      compliance: 'verified_user',
      assets: 'inventory_2'
    };

    return map[key];
  }

  employeeWidgetTone(key: EmployeeWidgetKey) {
    if (key === 'compliance' && this.employeeComplianceCriticalCount() > 0) return 'danger';
    if (key === 'requests' && this.employeePendingRequestsCount() > 0) return 'amber';
    if (key === 'attendance' && this.todayStatus()?.status === 'late') return 'amber';
    if (key === 'attendance' && this.todayStatus()?.status === 'absent') return 'danger';
    return key === 'leave' || key === 'payslip' || key === 'assets' || key === 'attendance' ? 'emerald' : 'neutral';
  }

  employeeWidgetValue(key: EmployeeWidgetKey) {
    switch (key) {
      case 'attendance':
        return this.employeeTodayLabel(this.todayStatus()?.status);
      case 'requests':
        return `${this.employeePendingRequestsCount()}`;
      case 'leave':
        return this.totalRemainingLeaveDays() > 0 ? this.t(`${this.totalRemainingLeaveDays()} يوم`, `${this.totalRemainingLeaveDays()} days`) : '—';
      case 'payslip':
        return this.latestPayslip() ? this.money(this.latestPayslip()?.netSalary) : '—';
      case 'compliance':
        return `${this.employeeComplianceCriticalCount()}`;
      case 'assets':
        return `${this.assignedAssetsCount()}`;
    }
  }

  employeeWidgetMeta(key: EmployeeWidgetKey) {
    switch (key) {
      case 'attendance': {
        const today = this.todayStatus();
        if (!today) return this.t('لا توجد بيانات حضور لهذا اليوم', 'No attendance record for today');
        if (today.clockIn && today.clockOut) {
          return this.t(
            `حضور ${this.formatShortTime(today.clockIn)} • انصراف ${this.formatShortTime(today.clockOut)}`,
            `Clock in ${this.formatShortTime(today.clockIn)} • Clock out ${this.formatShortTime(today.clockOut)}`
          );
        }
        if (today.clockIn) {
          return this.t(`تم تسجيل الحضور ${this.formatShortTime(today.clockIn)}`, `Clocked in at ${this.formatShortTime(today.clockIn)}`);
        }
        return this.t('افتح شاشة الحضور لتسجيل بداية الدوام', 'Open attendance to start your day');
      }
      case 'requests':
        return this.t(
          `إجازات ${this.pendingLeaveRequestsCount()} • إضافي ${this.pendingOvertimeRequestsCount()} • سلف ${this.pendingAdvanceRequestsCount()}`,
          `Leave ${this.pendingLeaveRequestsCount()} • OT ${this.pendingOvertimeRequestsCount()} • Advances ${this.pendingAdvanceRequestsCount()}`
        );
      case 'leave':
        return this.t(
          `مستخدم ${this.totalUsedLeaveDays()} يوم • معلق ${this.totalPendingLeaveDays()} يوم`,
          `Used ${this.totalUsedLeaveDays()} days • Pending ${this.totalPendingLeaveDays()} days`
        );
      case 'payslip': {
        const slip = this.latestPayslip();
        return slip
          ? `${this.monthName(slip.periodMonth)} ${slip.periodYear}`
          : this.t('ستظهر هنا عند إصدار قسيمة راتب معتمدة', 'It will appear here once an approved payslip is issued');
      }
      case 'compliance': {
        const summary = this.employeeComplianceSummary()?.summary;
        if (!summary) return this.t('لا توجد تنبيهات امتثال حالية', 'No compliance alerts right now');
        return this.t(
          `مفقود ${summary.missing || 0} • منتهي ${summary.expired || 0} • قريب ${summary.expiringSoon || 0}`,
          `Missing ${summary.missing || 0} • Expired ${summary.expired || 0} • Soon ${summary.expiringSoon || 0}`
        );
      }
      case 'assets':
        return this.t(
          `معاد ${this.returnedAssetsCount()} • يحتاج متابعة ${this.assetsNeedingAttentionCount()}`,
          `Returned ${this.returnedAssetsCount()} • Needs attention ${this.assetsNeedingAttentionCount()}`
        );
    }
  }

  employeeWidgetLoadingState(key: EmployeeWidgetKey) {
    return this.employeeWidgetLoading()[key];
  }

  employeeWidgetErrorState(key: EmployeeWidgetKey) {
    return this.employeeWidgetErrors()[key];
  }

  hasEmployeeWidgetData(key: EmployeeWidgetKey) {
    switch (key) {
      case 'attendance':
        return !!this.todayStatus();
      case 'requests':
        return this.employeePendingRequestsCount() > 0;
      case 'leave':
        return this.leaveBalances().length > 0;
      case 'payslip':
        return !!this.latestPayslip();
      case 'compliance':
        return !!this.employeeComplianceSummary();
      case 'assets':
        return this.employeeAssets().length > 0;
    }
  }

  employeeWidgetEmptyText(key: EmployeeWidgetKey) {
    const map: Record<EmployeeWidgetKey, { ar: string; en: string }> = {
      attendance: { ar: 'لا يوجد سجل حضور لليوم بعد', en: 'No attendance record for today yet' },
      requests: { ar: 'لا توجد طلبات معلقة حاليًا', en: 'No pending requests right now' },
      leave: { ar: 'لا توجد أرصدة إجازات معروضة بعد', en: 'No leave balances available yet' },
      payslip: { ar: 'لا توجد قسيمة راتب معتمدة بعد', en: 'No approved payslip yet' },
      compliance: { ar: 'لا توجد تنبيهات امتثال حالية', en: 'No compliance alerts right now' },
      assets: { ar: 'لا توجد أصول معيّنة لك حاليًا', en: 'No assigned assets right now' }
    };

    return this.lang === 'ar' ? map[key].ar : map[key].en;
  }

  retryEmployeeWidget(key: EmployeeWidgetKey) {
    switch (key) {
      case 'attendance':
        this.loadTodayStatus();
        break;
      case 'requests':
        this.loadEmployeeLeaveData();
        this.loadEmployeeOvertimeData();
        this.loadEmployeeAdvances();
        break;
      case 'leave':
        this.loadEmployeeLeaveData();
        break;
      case 'payslip':
        this.loadLatestPayslip();
        break;
      case 'compliance':
        this.loadEmployeeComplianceSummary();
        break;
      case 'assets':
        this.loadEmployeeAssets();
        break;
    }
  }

  employeeQuickActionLabel(action: EmployeeQuickAction) {
    return this.lang === 'ar' ? action.labelAr : action.labelEn;
  }

  formatShortTime(value?: string | null) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(value));
  }

  totalRemainingLeaveDays() {
    return this.leaveBalances().reduce((sum, item) => sum + Number(item.remainingDays || 0), 0);
  }

  totalUsedLeaveDays() {
    return this.leaveBalances().reduce((sum, item) => sum + Number(item.usedDays || 0), 0);
  }

  totalPendingLeaveDays() {
    return this.leaveBalances().reduce((sum, item) => sum + Number(item.pendingDays || 0), 0);
  }

  pendingLeaveRequestsCount() {
    return this.leaveRequests().filter(item => item.status === 'pending' || item.status === 'manager_approved').length;
  }

  pendingOvertimeRequestsCount() {
    return this.overtimeRequests().filter(item => item.status === 'pending' || item.status === 'manager_approved').length;
  }

  pendingAdvanceRequestsCount() {
    return this.employeeAdvances().filter(item => item.status === 'pending').length;
  }

  employeePendingRequestsCount() {
    return this.pendingLeaveRequestsCount() + this.pendingOvertimeRequestsCount() + this.pendingAdvanceRequestsCount();
  }

  employeeComplianceCriticalCount() {
    const summary = this.employeeComplianceSummary()?.summary;
    if (!summary) return 0;
    return Number(summary.missing || 0) + Number(summary.expired || 0) + Number(summary.expiringSoon || 0);
  }

  assignedAssetsCount() {
    return this.employeeAssets().filter(item => item.currentStatus === 'assigned').length;
  }

  returnedAssetsCount() {
    return this.employeeAssets().filter(item => item.currentStatus === 'returned').length;
  }

  assetsNeedingAttentionCount() {
    return this.employeeAssets().filter(item => item.currentStatus === 'maintenance' || item.currentStatus === 'damaged' || item.currentStatus === 'lost').length;
  }

  private loadSummary() {
    this.api.get<ApiResponse<DashboardSummary>>('/api/dashboard/summary').subscribe({
      next: response => {
        this.summary.set(response.data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  private loadDepartmentData() {
    if (!this.access.isAny('superadmin', 'hradmin', 'payrolladmin', 'manager')) return;
    this.api.get<ApiResponse<DepartmentHeadcount[]>>('/api/dashboard/headcount-by-department').subscribe({
      next: response => this.deptData.set(response.data ?? [])
    });
  }

  private loadRecentActivity() {
    if (!this.access.isAny('superadmin', 'hradmin', 'payrolladmin')) return;
    this.api.get<ApiResponse<ActivityItem[]>>('/api/dashboard/recent-activity').subscribe({
      next: response => this.recentActivity.set((response.data ?? []).slice(0, 5))
    });
  }

  private loadComplianceAlerts() {
    if (!this.access.isAny('superadmin', 'hradmin')) return;
    this.api.get<ApiResponse<ComplianceAlert[]>>('/api/dashboard/compliance-alerts').subscribe({
      next: response => this.complianceAlerts.set((response.data ?? []).slice(0, 5))
    });
  }

  private loadEmployeeComplianceSummary() {
    if (!this.access.isAny('employee')) return;
    this.updateEmployeeWidgetLoading('compliance', true);
    this.updateEmployeeWidgetError('compliance', null);
    this.api.get<ApiResponse<any>>('/api/compliance/my-summary').subscribe({
      next: response => {
        this.employeeComplianceSummary.set(response.data ?? null);
        this.updateEmployeeWidgetLoading('compliance', false);
      },
      error: () => {
        this.employeeComplianceSummary.set(null);
        this.updateEmployeeWidgetError('compliance', this.t('تعذر تحميل حالة الامتثال.', 'Failed to load compliance status.'));
        this.updateEmployeeWidgetLoading('compliance', false);
      }
    });
  }

  private loadUpcomingProbations() {
    if (!this.access.isAny('superadmin', 'hradmin')) return;
    this.api.get<ApiResponse<ProbationItem[]>>('/api/dashboard/upcoming-probations').subscribe({
      next: response => this.upcomingProbations.set((response.data ?? []).slice(0, 5))
    });
  }

  private loadManagerQueue() {
    if (!this.access.isAny('manager')) return;

    this.api.get<ApiResponse<any[]>>('/api/leave/requests', { status: 'pending' }).subscribe({
      next: response => {
        const leaveItems = (response.data ?? []).slice(0, 3).map(item => ({
          id: item.id,
          kind: 'leave' as const,
          employeeName: item.fullNameAr || item.employeeNameEn || '--',
          details: `${item.startDate || ''} - ${item.endDate || ''}`.trim(),
          status: item.status
        }));

        this.api.get<ApiResponse<any[]>>('/api/overtime/requests', { status: 'pending' }).subscribe({
          next: overtimeResponse => {
            const overtimeItems = (overtimeResponse.data ?? []).slice(0, 3).map(item => ({
              id: item.id,
              kind: 'overtime' as const,
              employeeName: item.fullNameAr || item.fullNameEn || '--',
              details: `${item.hours || 0} ${this.t('ساعة', 'hrs')}`,
              status: item.status
            }));

            this.managerQueue.set([...leaveItems, ...overtimeItems].slice(0, 6));
          }
        });
      }
    });
  }

  private loadPayrollRuns() {
    if (!this.access.isAny('payrolladmin')) return;
    this.api.get<ApiResponse<PayrollRun[]>>('/api/payroll/runs').subscribe({
      next: response => {
        const sorted = [...(response.data ?? [])].sort((a, b) => (b.runYear - a.runYear) || (b.runMonth - a.runMonth));
        this.payrollRuns.set(sorted);
      }
    });
  }

  private loadPendingAdvances() {
    if (!this.access.isAny('payrolladmin')) return;
    this.api.get<ApiResponse<any[]>>('/api/salary-advances', { status: 'pending' }).subscribe({
      next: response => this.pendingAdvances.set(response.data ?? [])
    });
  }

  private loadTodayStatus() {
    if (!this.access.isAny('employee')) return;
    this.updateEmployeeWidgetLoading('attendance', true);
    this.updateEmployeeWidgetError('attendance', null);
    this.api.get<ApiResponse<any>>('/api/attendance/my-today').subscribe({
      next: response => {
        this.todayStatus.set(response.data ?? null);
        this.updateEmployeeWidgetLoading('attendance', false);
      },
      error: () => {
        this.todayStatus.set(null);
        this.updateEmployeeWidgetError('attendance', this.t('تعذر تحميل حضور اليوم.', 'Failed to load today attendance.'));
        this.updateEmployeeWidgetLoading('attendance', false);
      }
    });
  }

  private loadLatestPayslip() {
    if (!this.access.isAny('employee')) return;
    this.updateEmployeeWidgetLoading('payslip', true);
    this.updateEmployeeWidgetError('payslip', null);
    this.api.get<ApiResponse<Payslip[]>>('/api/payroll/slips/my').subscribe({
      next: response => {
        this.latestPayslip.set((response.data ?? [])[0] ?? null);
        this.updateEmployeeWidgetLoading('payslip', false);
      },
      error: () => {
        this.latestPayslip.set(null);
        this.updateEmployeeWidgetError('payslip', this.t('تعذر تحميل آخر قسيمة راتب.', 'Failed to load the latest payslip.'));
        this.updateEmployeeWidgetLoading('payslip', false);
      }
    });
  }

  private loadEmployeeLeaveData() {
    if (!this.access.isAny('employee')) return;
    this.updateEmployeeWidgetLoading('requests', true);
    this.updateEmployeeWidgetLoading('leave', true);
    this.updateEmployeeWidgetError('requests', null);
    this.updateEmployeeWidgetError('leave', null);

    this.api.get<ApiResponse<LeaveRequest[]>>('/api/leave/requests').subscribe({
      next: response => {
        this.leaveRequests.set(response.data ?? []);
        this.updateEmployeeWidgetLoading('requests', false);
      },
      error: () => {
        this.leaveRequests.set([]);
        this.updateEmployeeWidgetError('requests', this.t('تعذر تحميل طلبات الإجازات.', 'Failed to load leave requests.'));
        this.updateEmployeeWidgetLoading('requests', false);
      }
    });

    this.api.get<ApiResponse<LeaveBalance[]>>('/api/leave/balances').subscribe({
      next: response => {
        this.leaveBalances.set(response.data ?? []);
        this.updateEmployeeWidgetLoading('leave', false);
      },
      error: () => {
        this.leaveBalances.set([]);
        this.updateEmployeeWidgetError('leave', this.t('تعذر تحميل أرصدة الإجازات.', 'Failed to load leave balances.'));
        this.updateEmployeeWidgetLoading('leave', false);
      }
    });
  }

  private loadEmployeeOvertimeData() {
    if (!this.access.isAny('employee')) return;
    this.updateEmployeeWidgetLoading('requests', true);
    this.updateEmployeeWidgetError('requests', null);

    this.api.get<ApiResponse<OvertimeRequest[]>>('/api/overtime/requests').subscribe({
      next: response => {
        this.overtimeRequests.set(response.data ?? []);
        this.updateEmployeeWidgetLoading('requests', false);
      },
      error: () => {
        this.overtimeRequests.set([]);
        this.updateEmployeeWidgetError('requests', this.t('تعذر تحميل طلبات العمل الإضافي.', 'Failed to load overtime requests.'));
        this.updateEmployeeWidgetLoading('requests', false);
      }
    });
  }

  private loadEmployeeAdvances() {
    if (!this.access.isAny('employee')) return;
    this.updateEmployeeWidgetLoading('requests', true);
    this.updateEmployeeWidgetError('requests', null);

    this.api.get<ApiResponse<any[]>>('/api/salary-advances').subscribe({
      next: response => {
        this.employeeAdvances.set(response.data ?? []);
        this.updateEmployeeWidgetLoading('requests', false);
      },
      error: () => {
        this.employeeAdvances.set([]);
        this.updateEmployeeWidgetError('requests', this.t('تعذر تحميل طلبات السلف.', 'Failed to load advance requests.'));
        this.updateEmployeeWidgetLoading('requests', false);
      }
    });
  }

  private loadEmployeeAssets() {
    if (!this.access.isAny('employee')) return;
    this.updateEmployeeWidgetLoading('assets', true);
    this.updateEmployeeWidgetError('assets', null);
    this.api.get<ApiResponse<any[]>>('/api/assets').subscribe({
      next: response => {
        this.employeeAssets.set(response.data ?? []);
        this.updateEmployeeWidgetLoading('assets', false);
      },
      error: () => {
        this.employeeAssets.set([]);
        this.updateEmployeeWidgetError('assets', this.t('تعذر تحميل الأصول المعيّنة.', 'Failed to load assigned assets.'));
        this.updateEmployeeWidgetLoading('assets', false);
      }
    });
  }

  private updateEmployeeWidgetLoading(key: EmployeeWidgetKey, value: boolean) {
    this.employeeWidgetLoading.update(current => ({ ...current, [key]: value }));
  }

  private updateEmployeeWidgetError(key: EmployeeWidgetKey, value: string | null) {
    this.employeeWidgetErrors.update(current => ({ ...current, [key]: value }));
  }

  dayLabel(date: string): string {
    try {
      return new Intl.DateTimeFormat(this.lang === 'ar' ? 'ar-JO' : 'en-US', { weekday: 'short' }).format(new Date(date));
    } catch {
      return date.slice(5);
    }
  }

  payrollStatusColor(status: string): string {
    const map: Record<string, string> = { draft: '#94a3b8', approved: '#f59e0b', paid: '#2d9e6b', unpaid: '#ef4444' };
    return map[status] ?? '#94a3b8';
  }

  payrollStatusLabelAr(status: string): string {
    const ar: Record<string, string> = { draft: 'مسودة', approved: 'موافق عليه', paid: 'مدفوع', unpaid: 'غير مدفوع' };
    return ar[status] ?? status;
  }

  private loadAttendanceTrend() {
    if (!this.access.isAny('superadmin', 'hradmin', 'payrolladmin', 'manager')) return;
    this.api.get<ApiResponse<AttendanceDay[]>>('/api/dashboard/attendance-trend').subscribe({
      next: r => this.attendanceTrend.set(r.data ?? []),
    });
  }

  private loadLeaveTypeBreakdown() {
    if (!this.access.isAny('superadmin', 'hradmin', 'manager')) return;
    this.api.get<ApiResponse<LeaveTypeRow[]>>('/api/dashboard/leave-type-breakdown').subscribe({
      next: r => this.leaveTypeBreakdown.set(r.data ?? []),
    });
  }

  private loadPayrollStatusBreakdown() {
    if (!this.access.isAny('superadmin', 'hradmin', 'payrolladmin')) return;
    this.api.get<ApiResponse<PayrollStatusRow[]>>('/api/dashboard/payroll-status-breakdown').subscribe({
      next: r => this.payrollStatusBreakdown.set(r.data ?? []),
    });
  }

  private loadEmployeeStatusData() {
    if (!this.access.isAny('superadmin', 'hradmin', 'manager')) return;
    this.api.get<ApiResponse<{status: string; count: number}[]>>('/api/dashboard/charts/employee-status').subscribe({
      next: r => this.employeeStatusData.set(r.data ?? []),
    });
  }

  private loadMyAttendanceMonth() {
    this.api.get<ApiResponse<{status: string; count: number}[]>>('/api/dashboard/charts/my-attendance-month').subscribe({
      next: r => this.myAttendanceMonth.set(r.data ?? []),
    });
  }

  private loadMyPayslipTrend() {
    this.api.get<ApiResponse<any[]>>('/api/dashboard/charts/my-payslip-trend').subscribe({
      next: r => this.myPayslipTrend.set(r.data ?? []),
    });
  }

  private loadPayrollMonthlyTrend() {
    if (!this.access.isAny('superadmin', 'hradmin', 'payrolladmin')) return;
    this.api.get<ApiResponse<any[]>>('/api/dashboard/charts/payroll-monthly-trend').subscribe({
      next: r => this.payrollMonthlyTrend.set(r.data ?? []),
    });
  }

  private loadUsersByRole() {
    if (!this.access.isAny('superadmin', 'hradmin')) return;
    this.api.get<ApiResponse<{role: string; count: number}[]>>('/api/dashboard/charts/superadmin-users-by-role').subscribe({
      next: r => this.usersByRole.set(r.data ?? []),
    });
  }

  private loadActivityByModule() {
    if (!this.access.isAny('superadmin', 'hradmin', 'payrolladmin')) return;
    this.api.get<ApiResponse<{module: string; count: number}[]>>('/api/dashboard/charts/activity-by-module').subscribe({
      next: r => this.activityByModule.set(r.data ?? []),
    });
  }

  private card(
    labelAr: string,
    labelEn: string,
    value: string | number,
    icon: string,
    tone: Tone,
    route?: string,
    metaAr?: string,
    metaEn?: string
  ): InsightCard {
    return { labelAr, labelEn, value, icon, tone, route, metaAr, metaEn };
  }
}
