import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { RoleAccessService } from '../../core/services/role-access.service';
import { LeaveBalance, LeavePolicy, LeaveRequest, LeaveType, ApiResponse } from '../../core/models';
import { ToastService } from '../../core/services/toast.service';
import { SkeletonCardComponent } from '../../shared/components/skeleton/skeleton-card.component';
import { SkeletonKpiCardsComponent } from '../../shared/components/skeleton/skeleton-kpi-cards.component';
import { ConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog.component';
import { RejectReasonDialogComponent } from '../../shared/components/ui/reject-reason-dialog.component';
import { getErrorMessage } from '../../core/utils/error-message';
import { openPrintDoc } from '../../core/utils/print-doc.util';

type LeaveActionType = 'approve' | 'cancel';

@Component({
  selector: 'app-leave',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DatePipe, SkeletonCardComponent, SkeletonKpiCardsComponent, ConfirmDialogComponent, RejectReasonDialogComponent],
  templateUrl: './leave.component.html',
  styleUrl: './leave.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LeaveComponent implements OnInit {
  allRequests = signal<LeaveRequest[]>([]);
  filteredLeaveRequests = signal<LeaveRequest[]>([]);
  leaveTypes = signal<LeaveType[]>([]);
  balances = signal<LeaveBalance[]>([]);
  policies = signal<LeavePolicy[]>([]);
  employeeBalances = signal<LeaveBalance[]>([]);
  selectedRequest = signal<LeaveRequest | null>(null);

  loading = signal(true);
  policiesLoading = signal(false);
  balancesLoading = signal(false);
  saving = signal(false);
  rejectSubmitting = signal(false);
  policySaving = signal(false);
  policyError = signal('');
  formError = signal('');
  error = signal('');
  processingIds = signal<number[]>([]);

  showCreateModal = signal(false);
  showPolicyModal = signal(false);
  showDetailsModal = signal(false);
  showRejectModal = signal(false);
  rejectId = signal<number | null>(null);
  confirmAction = signal<{ type: LeaveActionType; id: number } | null>(null);

  filter = {
    search: '',
    employeeSearch: '',
    employeeId: '',
    statusList: [] as string[],
    leaveTypeCodes: [] as string[],
    orgUnit: '',
    from: '',
    to: ''
  };

  form: { leaveTypeId: number | null; startDate: string; endDate: string; reason: string; attachmentUrl: string } = {
    leaveTypeId: null,
    startDate: '',
    endDate: '',
    reason: '',
    attachmentUrl: ''
  };

  rejectReason = '';
  policyForm: LeavePolicy[] = [];

  readonly summaryCards = computed(() => {
    const requests = this.allRequests();
    const today = new Date().toISOString().slice(0, 10);
    return [
      { labelAr: this.t('', 'Total requests'), labelEn: 'Total requests', value: requests.length },
      { labelAr: this.t('', 'Pending'), labelEn: 'Pending', value: requests.filter(r => r.status === 'pending' || r.status === 'manager_approved').length },
      { labelAr: this.t('', 'Approved'), labelEn: 'Approved', value: requests.filter(r => r.status === 'approved').length },
      { labelAr: this.t('', 'Rejected'), labelEn: 'Rejected', value: requests.filter(r => r.status === 'rejected').length },
      { labelAr: this.t('', 'Currently on leave'), labelEn: 'Currently on leave', value: requests.filter(r => r.status === 'approved' && r.startDate <= today && r.endDate >= today).length }
    ];
  });

  readonly currentPolicy = computed(() => {
    const leaveTypeId = this.form.leaveTypeId;
    return this.policies().find(item => item.leaveTypeId === leaveTypeId) ?? null;
  });

  readonly selectedBalance = computed(() => {
    const leaveTypeId = this.form.leaveTypeId;
    return this.balances().find(item => item.leaveTypeId === leaveTypeId) ?? null;
  });

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService, private access: RoleAccessService) {}

  get lang() { return this.auth.lang; }
  get canManagePolicies() { return this.access.isHrAdmin(); }
  get canApprove() { return this.access.isAny('hradmin', 'manager'); }
  get isEmployee() { return this.access.isEmployee(); }
  get isEmployeeSelfService() { return this.access.isEmployee(); }
  get isManagerOnly() { return this.access.isManager() && !this.access.isHrAdmin(); }

  ngOnInit() {
    this.loadTypes();
    this.loadPolicies();
    this.loadRequests();
    this.loadBalances();
  }

  t(ar: string, en: string) {
    if (this.lang !== 'ar') return en;
    const sprint3Arabic: Record<string, string> = {
      'Self-service leave': 'الخدمة الذاتية للإجازات',
      'Leave management': 'إدارة طلبات الإجازات',
      'Leave': 'الإجازات',
      'Manage leave policies, requests, and balances in one printable approval workflow.': 'إدارة سياسات الإجازات والطلبات والأرصدة ضمن مسار اعتماد واضح وقابل للطباعة.',
      'Leave settings': 'سياسات الإجازات',
      'Request leave': 'طلب إجازة جديد',
      'Total requests': 'إجمالي الطلبات',
      'Pending': 'قيد الانتظار',
      'Approved': 'موافق عليه',
      'Rejected': 'مرفوض',
      'Currently on leave': 'في إجازة حاليا',
      'Remaining balance': 'الرصيد المتبقي',
      'Used': 'المستخدم',
      'Total': 'الإجمالي',
      'Manager approval': 'اعتماد المدير',
      'HR approval': 'اعتماد الموارد البشرية',
      'Required': 'مطلوب',
      'Not required': 'غير مطلوب',
      'Attachment': 'المرفق',
      'Max request': 'حد الطلب',
      'Notice days': 'الإشعار المسبق',
      'Policy summary': 'ملخص السياسات',
      'Active company policy rules controlling requests and balances.': 'سياسات الشركة الفعلية التي تتحكم في الطلبات والأرصدة.',
      'Yearly balance': 'الرصيد السنوي',
      'Max days per request': 'أقصى أيام للطلب',
      'Attachment required': 'مرفق مطلوب',
      'Yes': 'نعم',
      'No': 'لا',
      'Search & Filters': 'البحث والفلاتر',
      'Filter requests by status, type, and date range': 'تصفية الطلبات حسب الحالة والنوع والتاريخ',
      'Reset filters': 'مسح الفلاتر',
      'Search': 'بحث',
      'Code, org unit, or reason': 'الكود أو الوحدة أو السبب',
      'Employee': 'الموظف',
      'All employees': 'كل الموظفين',
      'Leave type': 'نوع الإجازة',
      'All leave types': 'كل أنواع الإجازات',
      'Status': 'الحالة',
      'All statuses': 'كل الحالات',
      'Manager approved': 'موافقة المدير',
      'Cancelled': 'ملغي',
      'Org Unit': 'الوحدة التنظيمية',
      'All org units': 'كل الوحدات',
      'From': 'من تاريخ',
      'To': 'إلى تاريخ',
      'Search:': 'بحث:',
      'Employee:': 'موظف:',
      'Org:': 'وحدة:',
      'From:': 'من:',
      'To:': 'إلى:',
      'requests shown': 'طلب معروض',
      'No matching requests yet': 'لا توجد طلبات مطابقة حتى الآن',
      'Leave requests will appear here with status and approval trail.': 'ستظهر طلبات الإجازة هنا مع الحالة ومسار الاعتماد.',
      'Period': 'الفترة',
      'Days': 'عدد الأيام',
      'Reason': 'السبب',
      'View': 'عرض',
      'Print': 'طباعة',
      'Cancel request': 'إلغاء الطلب',
      'Approve': 'موافقة',
      'Reject': 'رفض',
      'New leave request': 'طلب إجازة جديد',
      'The request will be validated against company policy before submission.': 'سيتم التحقق من الطلب وفق سياسة الشركة قبل الإرسال.',
      'Start date': 'تاريخ البداية',
      'End date': 'تاريخ النهاية',
      'Attachment reference': 'مرجع المرفق',
      'Leave policies saved.': 'تم حفظ سياسات الإجازات.',
      'Failed to save leave policies.': 'تعذر حفظ سياسات الإجازات.',
      'Leave request submitted.': 'تم إرسال طلب الإجازة.',
      'Failed to submit request.': 'تعذر إرسال الطلب.',
      'Request approved.': 'تمت الموافقة على الطلب.',
      'Failed to approve request.': 'تعذر اعتماد الطلب.',
      'Request cancelled.': 'تم إلغاء الطلب.',
      'Failed to cancel request.': 'تعذر إلغاء الطلب.',
      'Request rejected.': 'تم رفض الطلب.',
      'Failed to reject request.': 'تعذر رفض الطلب.',
      'Please complete the required fields.': 'يرجى تعبئة الحقول المطلوبة.',
      'Start date must be before end date.': 'تاريخ البداية يجب أن يسبق تاريخ النهاية.',
      'Selected date range is not valid.': 'الفترة المختارة غير صالحة.',
      'Attachment is required for this leave type.': 'المرفق مطلوب لهذا النوع من الإجازات.',
      'Please provide a rejection reason.': 'يرجى إدخال سبب الرفض.',
      'Employee Code': 'الرقم الوظيفي',
      'Department': 'القسم',
      'Job Title': 'المسمى الوظيفي',
      'Requested Days': 'الأيام المطلوبة',
      'Attached': 'مرفق',
      'None': 'لا يوجد',
      'Approval Trail': 'مسار الاعتماد',
      'Employee Signature': 'توقيع الموظف',
      'Direct Manager Signature': 'توقيع المدير المباشر',
      'HR Signature': 'توقيع الموارد البشرية'
      ,
      'Compatibility screen': 'شاشة توافق قديمة',
      'The operational leave source of truth is Leave Management. This route remains available for old links and self-service compatibility only.': 'مصدر الإجازات التشغيلي هو مركز إدارة الإجازات. هذا المسار متاح للروابط القديمة والخدمة الذاتية فقط.',
      'Open Leave Management': 'فتح إدارة الإجازات'
    };
    const cleanArabic: Record<string, string> = {
      'Self-service leave': 'الخدمة الذاتية للإجازات',
      'Leave management': 'إدارة طلبات الإجازة',
      'Leave': 'الإجازات',
      'Manage leave policies, requests, and balances in one printable approval workflow.': 'إدارة سياسات الإجازات والطلبات والأرصدة ضمن مسار اعتماد واضح وقابل للطباعة.',
      'Leave settings': 'سياسات الإجازات',
      'Request leave': 'طلب إجازة جديد',
      'Total requests': 'إجمالي الطلبات',
      'Pending': 'قيد الانتظار',
      'Approved': 'موافق عليه',
      'Rejected': 'مرفوض',
      'Currently on leave': 'في إجازة حالياً',
      'Remaining balance': 'الرصيد المتبقي',
      'Used': 'المستخدم',
      'Total': 'الإجمالي',
      'Manager approval': 'اعتماد المدير',
      'HR approval': 'اعتماد الموارد البشرية',
      'Required': 'مطلوب',
      'Not required': 'غير مطلوب',
      'Attachment': 'المرفق',
      'Max request': 'حد الطلب',
      'Notice days': 'الإشعار المسبق',
      'Policy summary': 'ملخص السياسات',
      'Active company policy rules controlling requests and balances.': 'سياسات الشركة الفعلية التي تتحكم في الطلبات والأرصدة.',
      'Yearly balance': 'الرصيد السنوي',
      'Max days per request': 'أقصى أيام للطلب',
      'Attachment required': 'مرفق مطلوب',
      'Yes': 'نعم',
      'No': 'لا',
      'Search & Filters': 'بحث وفلاتر',
      'Filter requests by status, type, and date range': 'فلترة الطلبات حسب الحالة والنوع والتاريخ',
      'Reset filters': 'مسح الفلاتر',
      'Search': 'بحث',
      'Code, org unit, or reason': 'الكود أو الوحدة أو السبب',
      'Employee': 'الموظف',
      'All employees': 'كل الموظفين',
      'Leave type': 'نوع الإجازة',
      'All leave types': 'كل أنواع الإجازات',
      'Status': 'الحالة',
      'All statuses': 'كل الحالات',
      'Manager approved': 'موافقة المدير',
      'Cancelled': 'ملغي',
      'Org Unit': 'الوحدة التنظيمية',
      'All org units': 'كل الوحدات',
      'From': 'من تاريخ',
      'To': 'إلى تاريخ',
      'Search:': 'بحث:',
      'Employee:': 'موظف:',
      'Org:': 'وحدة:',
      'From:': 'من:',
      'To:': 'إلى:',
      'requests shown': 'طلب معروض',
      'No matching requests yet': 'لا توجد طلبات مطابقة حتى الآن',
      'Leave requests will appear here with status and approval trail.': 'ستظهر طلبات الإجازة هنا مع الحالة ومسار التقدم.',
      'Period': 'الفترة',
      'Days': 'عدد الأيام',
      'Reason': 'السبب',
      'View': 'عرض',
      'Print': 'طباعة',
      'Cancel request': 'إلغاء الطلب',
      'Approve': 'موافقة',
      'Reject': 'رفض',
      'New leave request': 'طلب إجازة جديد',
      'The request will be validated against company policy before submission.': 'سيتم التحقق من الطلب وفق سياسة الشركة قبل الإرسال.',
      'Start date': 'تاريخ البداية',
      'End date': 'تاريخ النهاية',
      'Attachment reference': 'مرجع المرفق',
      'Leave policies saved.': 'تم حفظ سياسات الإجازات.',
      'Failed to save leave policies.': 'تعذر حفظ سياسات الإجازات.',
      'Leave request submitted.': 'تم إرسال طلب الإجازة.',
      'Failed to submit request.': 'تعذر إرسال الطلب.',
      'Request approved.': 'تمت الموافقة على الطلب.',
      'Failed to approve request.': 'تعذر اعتماد الطلب.',
      'Request cancelled.': 'تم إلغاء الطلب.',
      'Failed to cancel request.': 'تعذر إلغاء الطلب.',
      'Request rejected.': 'تم رفض الطلب.',
      'Failed to reject request.': 'تعذر رفض الطلب.'
    };
    return sprint3Arabic[en] || cleanArabic[en] || ar;
  }

  loadTypes() {
    this.api.get<ApiResponse<LeaveType[]>>('/api/leave/types').subscribe({
      next: response => this.leaveTypes.set(response.data ?? []),
      error: () => this.leaveTypes.set([])
    });
  }

  loadPolicies() {
    this.policiesLoading.set(true);
    this.api.get<ApiResponse<LeavePolicy[]>>('/api/leave/policies').subscribe({
      next: response => {
        const data = response.data ?? [];
        this.policies.set(data);
        this.policyForm = data.map(item => ({ ...item }));
        this.policiesLoading.set(false);
      },
      error: error => {
        this.policyError.set(getErrorMessage(error, this.t('تعذر تحميل سياسات الإجازات.', 'Failed to load leave policies.')));
        this.policiesLoading.set(false);
      }
    });
  }

  loadRequests() {
    this.loading.set(true);
    this.error.set('');
    this.api.get<ApiResponse<LeaveRequest[]>>(this.requestsEndpoint()).subscribe({
      next: response => {
        this.allRequests.set(response.data ?? []);
        this.applyFilters();
        this.loading.set(false);
      },
      error: error => {
        this.error.set(getErrorMessage(error, this.t('تعذر تحميل طلبات الإجازة.', 'Failed to load leave requests.')));
        this.loading.set(false);
      }
    });
  }

  loadBalances() {
    this.balancesLoading.set(true);
    this.api.get<ApiResponse<LeaveBalance[]>>(this.balancesEndpoint()).subscribe({
      next: response => {
        this.balances.set(response.data ?? []);
        this.balancesLoading.set(false);
      },
      error: () => {
        this.balances.set([]);
        this.balancesLoading.set(false);
      }
    });
  }

  applyFilters() {
    const term = this.filter.search.trim().toLowerCase();
    const empTerm = this.filter.employeeSearch.trim().toLowerCase();
    const filtered = this.allRequests().filter(request => {
      const haystack = (this.isEmployeeSelfService
        ? [
            request.reason,
            request.leaveTypeNameAr,
            request.leaveTypeNameEn,
            request.status,
            request.startDate,
            request.endDate
          ]
        : [
            request.fullNameAr,
            request.fullNameEn,
            request.employeeCode,
            request.reason,
            request.leaveTypeNameAr,
            request.leaveTypeNameEn,
            request.departmentAr,
            request.departmentEn,
            request.orgNodeNameAr,
            request.orgNodeNameEn
          ]).join(' ').toLowerCase();

      const matchesSearch = !term || haystack.includes(term);
      const matchesEmployeeId = this.isEmployeeSelfService || !this.filter.employeeId || String(request.employeeId) === this.filter.employeeId;
      const matchesEmpSearch = this.isEmployeeSelfService || !empTerm
        || [request.fullNameAr, request.fullNameEn, request.employeeCode].join(' ').toLowerCase().includes(empTerm);
      const matchesStatus = this.filter.statusList.length === 0 || this.filter.statusList.includes(request.status);
      const requestTypeKeys = [
        (request as any).leaveTypeCode,
        (request as any).leaveType,
        String(request.leaveTypeId ?? '')
      ].filter(Boolean);
      const matchesType = this.filter.leaveTypeCodes.length === 0
        || requestTypeKeys.some(key => this.filter.leaveTypeCodes.includes(String(key)));
      const requestOrgKeys = [request.orgNodeNameAr, request.orgNodeNameEn, request.departmentAr, request.departmentEn].filter(Boolean);
      const matchesOrgUnit = this.isEmployeeSelfService || !this.filter.orgUnit || requestOrgKeys.includes(this.filter.orgUnit);
      const matchesFrom = !this.filter.from || request.startDate >= this.filter.from;
      const matchesTo = !this.filter.to || request.endDate <= this.filter.to;

      return matchesSearch && matchesEmployeeId && matchesEmpSearch && matchesStatus && matchesType && matchesOrgUnit && matchesFrom && matchesTo;
    });

    this.filteredLeaveRequests.set(filtered);
  }

  get hasActiveLeaveFilters() {
    return !!(this.filter.search || this.filter.employeeSearch || this.filter.employeeId
      || this.filter.statusList.length || this.filter.leaveTypeCodes.length
      || this.filter.orgUnit || this.filter.from || this.filter.to);
  }

  resetFilters() {
    this.filter = { search: '', employeeSearch: '', employeeId: '', statusList: [], leaveTypeCodes: [], orgUnit: '', from: '', to: '' };
    this.applyFilters();
  }

  openCreate() {
    this.form = { leaveTypeId: null, startDate: '', endDate: '', reason: '', attachmentUrl: '' };
    this.formError.set('');
    this.showCreateModal.set(true);
  }

  closeCreate() {
    if (!this.saving()) {
      this.showCreateModal.set(false);
      this.formError.set('');
    }
  }

  openPolicies() {
    this.policyForm = this.policies().map(item => ({ ...item }));
    this.policyError.set('');
    this.showPolicyModal.set(true);
  }

  closePolicies() {
    if (!this.policySaving()) {
      this.showPolicyModal.set(false);
      this.policyError.set('');
    }
  }

  savePolicies() {
    if (this.policySaving()) return;
    this.policySaving.set(true);
    this.policyError.set('');
    this.api.put<ApiResponse<unknown>>('/api/leave/policies', this.policyForm).subscribe({
      next: () => {
        this.policySaving.set(false);
        this.showPolicyModal.set(false);
        this.toast.success(this.t('تم حفظ سياسات الإجازات.', 'Leave policies saved.'));
        this.loadPolicies();
        this.loadBalances();
      },
      error: error => {
        this.policySaving.set(false);
        this.policyError.set(getErrorMessage(error, this.t('تعذر حفظ سياسات الإجازات.', 'Failed to save leave policies.')));
        this.toast.error(this.policyError());
      }
    });
  }

  submit() {
    if (this.saving()) return;
    this.formError.set('');

    const policy = this.currentPolicy();
    const balance = this.selectedBalance();
    if (!this.form.leaveTypeId || !this.form.startDate || !this.form.endDate) {
      this.formError.set(this.t('يرجى تعبئة الحقول المطلوبة.', 'Please complete the required fields.'));
      return;
    }

    if (this.form.startDate > this.form.endDate) {
      this.formError.set(this.t('تاريخ البداية يجب أن يسبق تاريخ النهاية.', 'Start date must be before end date.'));
      return;
    }

    const requestedDays = this.calcDays();
    if (requestedDays <= 0) {
      this.formError.set(this.t('الفترة المختارة غير صالحة.', 'Selected date range is not valid.'));
      return;
    }

    if (policy?.maxConsecutiveDays && requestedDays > policy.maxConsecutiveDays) {
      this.formError.set(this.t(`الحد الأقصى لهذا الطلب هو ${policy.maxConsecutiveDays} يوم.`, `Maximum allowed days for this request is ${policy.maxConsecutiveDays}.`));
      return;
    }

    if (policy?.noticeDaysRequired) {
      const start = new Date(this.form.startDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((start.getTime() - today.getTime()) / 86400000);
      if (diffDays < policy.noticeDaysRequired) {
        this.formError.set(this.t(`يجب تقديم الطلب قبل ${policy.noticeDaysRequired} يوم على الأقل.`, `The request must be submitted at least ${policy.noticeDaysRequired} days in advance.`));
        return;
      }
    }

    if (policy?.requiresAttachment && !this.form.attachmentUrl.trim()) {
      this.formError.set(this.t('المرفق مطلوب لهذا النوع من الإجازات.', 'Attachment is required for this leave type.'));
      return;
    }

    this.saving.set(true);
    this.api.post<ApiResponse<unknown>>(this.requestsEndpoint(), this.form).subscribe({
      next: () => {
        this.saving.set(false);
        this.showCreateModal.set(false);
        this.toast.success(this.t('تم إرسال طلب الإجازة.', 'Leave request submitted.'));
        this.loadRequests();
        this.loadBalances();
      },
      error: error => {
        this.saving.set(false);
        this.formError.set(getErrorMessage(error, this.t('تعذر إرسال الطلب.', 'Failed to submit request.')));
        this.toast.error(this.formError());
      }
    });
  }

  openDetails(request: LeaveRequest) {
    this.selectedRequest.set(request);
    this.showDetailsModal.set(true);
    if (!this.isEmployeeSelfService) {
      this.loadEmployeeBalances(request.employeeId);
    }
  }

  closeDetails() {
    this.showDetailsModal.set(false);
    this.selectedRequest.set(null);
    this.employeeBalances.set([]);
  }

  loadEmployeeBalances(employeeId: number) {
    this.api.get<ApiResponse<LeaveBalance[]>>(`/api/leave/balances/${employeeId}`).subscribe({
      next: response => this.employeeBalances.set(response.data ?? []),
      error: () => this.employeeBalances.set([])
    });
  }

  approve(id: number) {
    if (this.isProcessing(id)) return;
    this.confirmAction.set({ type: 'approve', id });
  }

  cancel(id: number) {
    if (this.isProcessing(id)) return;
    this.confirmAction.set({ type: 'cancel', id });
  }

  closeConfirmAction() {
    this.confirmAction.set(null);
  }

  confirmActionSubmit() {
    const action = this.confirmAction();
    if (!action || this.isProcessing(action.id)) return;
    if (action.type === 'approve') this.runApprove(action.id);
    else this.runCancel(action.id);
  }

  openReject(id: number) {
    this.rejectId.set(id);
    this.rejectReason = '';
    this.showRejectModal.set(true);
    this.formError.set('');
  }

  closeReject() {
    if (!this.rejectSubmitting()) {
      this.showRejectModal.set(false);
      this.rejectSubmitting.set(false);
      this.rejectId.set(null);
      this.rejectReason = '';
    }
  }

  confirmReject(reason: string) {
    const id = this.rejectId();
    if (!id || this.rejectSubmitting()) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      this.formError.set(this.t('يرجى إدخال سبب الرفض.', 'Please provide a rejection reason.'));
      return;
    }

    this.rejectSubmitting.set(true);
    this.setProcessing(id, true);
    this.api.post<ApiResponse<unknown>>(`/api/leave/requests/${id}/reject`, { reason: trimmedReason }).subscribe({
      next: () => {
        this.closeReject();
        this.toast.info(this.t('تم رفض الطلب.', 'Request rejected.'));
        this.loadRequests();
        this.loadBalances();
        this.setProcessing(id, false);
      },
      error: error => {
        const message = getErrorMessage(error, this.t('تعذر رفض الطلب.', 'Failed to reject request.'));
        this.toast.error(message);
        this.formError.set(message);
        this.rejectSubmitting.set(false);
        this.setProcessing(id, false);
      }
    });
  }

  printRequest(request: LeaveRequest) {
    const policy = this.policies().find(item => item.leaveTypeId === request.leaveTypeId);
    const approvalTrail: string[] = [];
    if (request.managerApprovedAt) {
      approvalTrail.push(`${this.t('موافقة المدير', 'Manager approval')}: ${this.formatDate(request.managerApprovedAt)}${request.managerApproverName ? ` — ${request.managerApproverName}` : ''}`);
    } else {
      approvalTrail.push(`${this.t('موافقة المدير', 'Manager approval')}: ${this.t('قيد الانتظار', 'Pending')}`);
    }
    if (request.hrApprovedAt) {
      approvalTrail.push(`${this.t('موافقة الموارد البشرية', 'HR approval')}: ${this.formatDate(request.hrApprovedAt)}${request.hrApproverName ? ` — ${request.hrApproverName}` : ''}`);
    } else {
      approvalTrail.push(`${this.t('موافقة الموارد البشرية', 'HR approval')}: ${policy?.requiresHrApproval ? this.t('قيد الانتظار', 'Pending') : this.t('غير مطلوبة', 'Not required')}`);
    }
    if (request.rejectionReason) {
      approvalTrail.push(`${this.t('سبب الرفض', 'Rejection reason')}: ${request.rejectionReason}`);
    }

    openPrintDoc({
      lang: this.lang as 'ar' | 'en',
      docType: 'LEAVE',
      title: this.t('طلب إجازة', 'Leave Request'),
      subtitle: this.requestTitle(request),
      fields: [
        { label: this.t('الموظف', 'Employee'), value: this.employeeName(request) },
        { label: this.t('الرقم الوظيفي', 'Employee Code'), value: request.employeeCode || '—' },
        { label: this.t('القسم', 'Department'), value: request.departmentAr || request.departmentEn || '—' },
        { label: this.t('المسمى الوظيفي', 'Job Title'), value: (this.lang === 'ar' ? request.jobTitleAr : request.jobTitleEn) || request.jobTitleAr || request.jobTitleEn || '—' },
        { label: this.t('نوع الإجازة', 'Leave Type'), value: this.requestTitle(request) },
        { label: this.t('الحالة', 'Status'), value: this.statusLabel(request.status) },
        { label: this.t('من', 'From'), value: request.startDate },
        { label: this.t('إلى', 'To'), value: request.endDate },
        { label: this.t('عدد الأيام المطلوبة', 'Requested Days'), value: String(request.totalDays) },
        { label: this.t('المرفق', 'Attachment'), value: request.attachmentUrl ? this.t('مرفق', 'Attached') : this.t('لا يوجد', 'None') },
        { label: this.t('السبب', 'Reason'), value: request.reason || '—', span: true },
        { label: this.t('مسار الاعتماد', 'Approval Trail'), value: approvalTrail.join(' | '), span: true },
      ],
      signatures: [
        { label: this.t('توقيع الموظف', 'Employee Signature') },
        { label: this.t('توقيع المدير المباشر', 'Direct Manager Signature') },
        { label: this.t('توقيع الموارد البشرية', 'HR Signature') },
      ],
    });
  }

  calcDays() {
    if (!this.form.startDate || !this.form.endDate) return 0;
    const start = new Date(this.form.startDate);
    const end = new Date(this.form.endDate);
    return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
  }

  formPolicyWarning() {
    const policy = this.currentPolicy();
    const balance = this.selectedBalance();
    const requestedDays = this.calcDays();

    if (!this.form.leaveTypeId || !this.form.startDate || !this.form.endDate || requestedDays <= 0) {
      return '';
    }

    if (policy?.requiresAttachment && !this.form.attachmentUrl.trim()) {
      return this.t('هذا النوع يتطلب إرفاق مرجع أو مستند قبل الإرسال.', 'This leave type requires an attachment reference before submission.');
    }

    if (policy?.maxConsecutiveDays && requestedDays > policy.maxConsecutiveDays) {
      return this.t(`عدد الأيام المختار يتجاوز الحد الأقصى (${policy.maxConsecutiveDays}) لهذا الطلب.`, `Selected days exceed the maximum allowed (${policy.maxConsecutiveDays}) for this request.`);
    }

    if (policy?.noticeDaysRequired) {
      const start = new Date(this.form.startDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((start.getTime() - today.getTime()) / 86400000);
      if (diffDays < policy.noticeDaysRequired) {
        return this.t(`هذا النوع يحتاج إلى إشعار مسبق لا يقل عن ${policy.noticeDaysRequired} يوم.`, `This leave type requires at least ${policy.noticeDaysRequired} days notice.`);
      }
    }

    if (balance && requestedDays > Number(balance.remainingDays || 0)) {
      return this.t('عدد الأيام المطلوب يتجاوز الرصيد المتاح، وسيتم التحقق النهائي حسب سياسة الشركة.', 'Requested days exceed the available balance. Final validation will follow company policy.');
    }

    return '';
  }

  requestTitle(request: LeaveRequest) {
    return this.lang === 'ar'
      ? (request.leaveTypeNameAr || this.typeName(request.leaveTypeId))
      : (request.leaveTypeNameEn || this.typeName(request.leaveTypeId));
  }

  employeeName(request: LeaveRequest) {
    return this.lang === 'ar' ? (request.fullNameAr || '--') : (request.fullNameEn || request.fullNameAr || '--');
  }

  typeName(id: number) {
    const type = this.leaveTypes().find(item => item.id === id);
    return type ? (this.lang === 'ar' ? type.nameAr : type.nameEn) : '';
  }

  usedPercent(balance: LeaveBalance) {
    if (!balance.totalDays) return 0;
    return Math.min(100, Math.round((Number(balance.usedDays) / Number(balance.totalDays)) * 100));
  }

  policyName(policy: LeavePolicy) {
    return this.lang === 'ar' ? (policy.leaveTypeNameAr || '') : (policy.leaveTypeNameEn || policy.leaveTypeNameAr || '');
  }

  statusTone(status: string) {
    const map: Record<string, string> = {
      pending: 'warning',
      manager_approved: 'info',
      approved: 'success',
      rejected: 'danger',
      cancelled: 'neutral'
    };
    return map[status] || 'neutral';
  }

  statusLabel(status: string) {
    const labels: Record<string, { ar: string; en: string }> = {
      pending: { ar: 'قيد الانتظار', en: 'Pending' },
      manager_approved: { ar: 'موافقة المدير', en: 'Manager approved' },
      approved: { ar: 'موافق عليه', en: 'Approved' },
      rejected: { ar: 'مرفوض', en: 'Rejected' },
      cancelled: { ar: 'ملغي', en: 'Cancelled' }
    };
    const label = labels[status];
    return label ? this.t(label.ar, label.en) : status;
  }

  pipelineSteps(request: LeaveRequest) {
    const policy = this.policies().find(item => item.leaveTypeId === request.leaveTypeId);
    return [
      { labelAr: 'الموظف', labelEn: 'Employee', state: 'done' },
      {
        labelAr: 'المدير',
        labelEn: 'Manager',
        visible: policy?.requiresManagerApproval ?? true,
        state: request.managerApprovedAt ? 'done' : request.status === 'pending' ? 'current' : request.rejectionStep === 'manager' ? 'rejected' : 'idle'
      },
      {
        labelAr: 'الموارد البشرية',
        labelEn: 'HR',
        visible: policy?.requiresHrApproval ?? true,
        state: request.hrApprovedAt ? 'done' : request.status === 'manager_approved' || (!policy?.requiresManagerApproval && request.status === 'pending') ? 'current' : request.rejectionStep === 'hr' ? 'rejected' : 'idle'
      }
    ].filter(step => step.visible !== false);
  }

  departments() {
    return [...new Set(this.allRequests().map(item => item.departmentAr || item.departmentEn).filter((item): item is string => !!item))];
  }

  orgUnits() {
    return [...new Set(this.allRequests().map(item => item.orgNodeNameAr || item.orgNodeNameEn || item.departmentAr || item.departmentEn).filter((item): item is string => !!item))];
  }

  employeeOptions() {
    const seen = new Map<number, LeaveRequest>();
    for (const request of this.allRequests()) {
      if (request.employeeId && !seen.has(request.employeeId)) {
        seen.set(request.employeeId, request);
      }
    }
    return [...seen.values()].sort((a, b) => this.employeeName(a).localeCompare(this.employeeName(b)));
  }

  setSingleStatus(status: string) {
    this.filter.statusList = status ? [status] : [];
    this.applyFilters();
  }

  setSingleLeaveType(code: string) {
    this.filter.leaveTypeCodes = code ? [code] : [];
    this.applyFilters();
  }

  isProcessing(id: number) {
    return this.processingIds().includes(id);
  }

  formatDate(value?: string) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString(this.lang === 'ar' ? 'ar-JO-u-nu-latn' : 'en-US');
  }

  private runApprove(id: number) {
    this.setProcessing(id, true);
    this.api.post<ApiResponse<unknown>>(`/api/leave/requests/${id}/approve`, {}).subscribe({
      next: () => {
        this.closeConfirmAction();
        this.toast.success(this.t('تمت الموافقة على الطلب.', 'Request approved.'));
        this.loadRequests();
        this.loadBalances();
        this.setProcessing(id, false);
      },
      error: error => {
        this.toast.error(getErrorMessage(error, this.t('تعذر اعتماد الطلب.', 'Failed to approve request.')));
        this.setProcessing(id, false);
      }
    });
  }

  private runCancel(id: number) {
    this.setProcessing(id, true);
    this.api.post<ApiResponse<unknown>>(`/api/leave/requests/${id}/cancel`, {}).subscribe({
      next: () => {
        this.closeConfirmAction();
        this.toast.info(this.t('تم إلغاء الطلب.', 'Request cancelled.'));
        this.loadRequests();
        this.loadBalances();
        this.setProcessing(id, false);
      },
      error: error => {
        this.toast.error(getErrorMessage(error, this.t('تعذر إلغاء الطلب.', 'Failed to cancel request.')));
        this.setProcessing(id, false);
      }
    });
  }

  private setProcessing(id: number, processing: boolean) {
    const current = this.processingIds();
    this.processingIds.set(processing ? [...current, id] : current.filter(item => item !== id));
  }

  private requestsEndpoint() {
    return this.isEmployeeSelfService ? '/api/leave/me/requests' : '/api/leave/requests';
  }

  private balancesEndpoint() {
    return this.isEmployeeSelfService ? '/api/leave/me/balances' : '/api/leave/balances';
  }
}

