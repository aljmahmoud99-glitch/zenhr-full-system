import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

type ReportCard = {
  key: string;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  descriptionEn: string;
  icon: string;
  group: 'hr' | 'financial';
};

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReportsComponent implements OnInit {
  loading = signal(false);
  reportData = signal<any>(null);
  activeReport = signal('headcount');
  filterMonth = new Date().getMonth() + 1;
  filterYear = new Date().getFullYear();
  filterFrom = `${new Date().getFullYear()}-01-01`;
  filterTo = `${new Date().getFullYear()}-12-31`;

  monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  monthsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  reportCards: ReportCard[] = [
    { key: 'headcount', labelAr: 'تقرير القوى العاملة', labelEn: 'Headcount', descriptionAr: 'تحليل التوزيع حسب الحالة والقسم', descriptionEn: 'Workforce distribution by status and department', icon: 'groups', group: 'hr' },
    { key: 'leave', labelAr: 'تحليل الإجازات', labelEn: 'Leave Summary', descriptionAr: 'أنواع الإجازات وعدد الأيام المستخدمة', descriptionEn: 'Leave type usage and total days', icon: 'event_available', group: 'hr' },
    { key: 'attendance', labelAr: 'الحضور والغياب', labelEn: 'Attendance', descriptionAr: 'ملخص الحضور والغياب والتأخير', descriptionEn: 'Attendance, absence, and lateness summary', icon: 'schedule', group: 'hr' },
    { key: 'overtime', labelAr: 'العمل الإضافي', labelEn: 'Overtime', descriptionAr: 'ساعات العمل الإضافي وتكلفتها', descriptionEn: 'Overtime hours and cost by employee', icon: 'timer', group: 'hr' },
    { key: 'compliance', labelAr: 'الامتثال', labelEn: 'Compliance', descriptionAr: 'حالة الوثائق والتسجيلات النظامية', descriptionEn: 'Compliance posture and document alerts', icon: 'verified_user', group: 'hr' },
    { key: 'disciplinary', labelAr: 'المخالفات التأديبية', labelEn: 'Disciplinary', descriptionAr: 'تحليل القضايا والمخالفات التأديبية', descriptionEn: 'Disciplinary case breakdown', icon: 'gavel', group: 'hr' },
    { key: 'payroll', labelAr: 'ملخص الرواتب', labelEn: 'Payroll Summary', descriptionAr: 'الإجمالي والصافي والاستقطاعات الشهرية', descriptionEn: 'Monthly payroll totals and deductions', icon: 'payments', group: 'financial' },
    { key: 'ssc', labelAr: 'الضمان الاجتماعي', labelEn: 'SSC Contributions', descriptionAr: 'بيانات اشتراكات الضمان الشهرية', descriptionEn: 'Monthly SSC contributions', icon: 'shield', group: 'financial' },
    { key: 'income-tax', labelAr: 'ضريبة الدخل', labelEn: 'Income Tax', descriptionAr: 'إجمالي الدخل السنوي والضريبة', descriptionEn: 'Annual gross income and tax summary', icon: 'receipt_long', group: 'financial' },
    { key: 'turnover', labelAr: 'الدوران الوظيفي', labelEn: 'Turnover', descriptionAr: 'التعيينات والمغادرون ومعدل الدوران', descriptionEn: 'Hires, exits, and turnover rate', icon: 'trending_down', group: 'hr' }
  ];

  constructor(public auth: AuthService, private api: ApiService) {}

  get lang() { return this.auth.lang; }
  get isPayrollViewer() { return this.auth.hasRole('payrolladmin'); }

  get visibleReports() {
    return this.isPayrollViewer
      ? this.reportCards.filter(r => r.group === 'financial' || r.key === 'overtime')
      : this.reportCards;
  }

  ngOnInit() {
    if (this.isPayrollViewer && !this.visibleReports.some(r => r.key === this.activeReport())) {
      this.activeReport.set('payroll');
    }
    this.loadReport();
  }

  selectReport(key: string) {
    this.activeReport.set(key);
    this.loadReport();
  }

  currentCard() {
    return this.visibleReports.find(r => r.key === this.activeReport());
  }

  endpointForActive() {
    const m = this.filterMonth;
    const y = this.filterYear;
    const from = this.filterFrom;
    const to = this.filterTo;

    const map: Record<string, string> = {
      headcount: '/api/reports/headcount',
      leave: `/api/reports/leave-summary?year=${y}&month=${m}`,
      attendance: `/api/reports/attendance-summary?month=${m}&year=${y}`,
      overtime: `/api/reports/overtime-summary?from=${from}&to=${to}`,
      compliance: '/api/reports/compliance-summary',
      disciplinary: `/api/reports/disciplinary-summary?from=${from}&to=${to}`,
      payroll: `/api/reports/payroll-summary?month=${m}&year=${y}`,
      ssc: `/api/reports/ssc-contributions?month=${m}&year=${y}`,
      'income-tax': `/api/reports/income-tax-summary?year=${y}`,
      turnover: `/api/reports/turnover?from=${from}&to=${to}`
    };

    return map[this.activeReport()];
  }

  usesMonthFilter() {
    return ['leave', 'attendance', 'payroll', 'ssc'].includes(this.activeReport());
  }

  usesYearFilter() {
    return ['leave', 'attendance', 'payroll', 'ssc', 'income-tax'].includes(this.activeReport());
  }

  usesDateRange() {
    return ['overtime', 'disciplinary', 'turnover'].includes(this.activeReport());
  }

  loadReport() {
    this.loading.set(true);
    this.api.get<any>(this.endpointForActive()).subscribe({
      next: r => {
        this.reportData.set(r.data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  maxDept() {
    const data = this.reportData()?.byDept || [];
    return data.length ? Math.max(...data.map((x: any) => x.count)) : 1;
  }

  orgUnitLabel(row: any) {
    return (this.lang === 'ar' ? (row.orgNodeNameAr ?? row.OrgNodeNameAr) : (row.orgNodeNameEn ?? row.OrgNodeNameEn))
      || row.orgNodeNameAr
      || row.OrgNodeNameAr
      || row.orgNodeNameEn
      || row.OrgNodeNameEn
      || (this.lang === 'ar' ? (row.deptAr ?? row.departmentAr ?? row.DepartmentAr) : (row.deptEn ?? row.departmentEn ?? row.DepartmentEn))
      || row.deptAr
      || row.departmentAr
      || row.DepartmentAr
      || '';
  }

  statusLabel(status: string) {
    const map: Record<string, string> = {
      active: 'نشط',
      inactive: 'غير نشط',
      resigned: 'مستقيل',
      terminated: 'منتهي الخدمة',
      draft: 'مسودة',
      approved: 'معتمد',
      pending: 'معلق',
      rejected: 'مرفوض',
      manager_approved: 'موافقة المدير'
    };
    return this.lang === 'ar' ? (map[status] ?? status) : status;
  }
}
