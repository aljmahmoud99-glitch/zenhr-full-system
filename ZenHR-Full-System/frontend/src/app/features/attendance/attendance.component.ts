import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { SkeletonCardComponent } from '../../shared/components/skeleton/skeleton-card.component';
import { SkeletonKpiCardsComponent } from '../../shared/components/skeleton/skeleton-kpi-cards.component';
import { SkeletonTableComponent } from '../../shared/components/skeleton/skeleton-table.component';
import { ConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog.component';
import { RejectReasonDialogComponent } from '../../shared/components/ui/reject-reason-dialog.component';
import { getErrorMessage } from '../../core/utils/error-message';

type AttendanceView = 'dashboard' | 'log' | 'requests' | 'map';

interface AttendanceRecordRow {
  id: number;
  employeeId: number;
  employeeCode?: string;
  fullNameAr?: string;
  fullNameEn?: string;
  date: string;
  clockIn?: string;
  clockOut?: string;
  status: string;
  lateMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
  attendanceType?: string;
  latitude?: number;
  longitude?: number;
  isVerified?: boolean;
  isSuspicious?: boolean;
  departmentAr?: string;
  departmentEn?: string;
  orgNodeId?: number;
  orgNodeNameAr?: string;
  orgNodeNameEn?: string;
  orgNodeType?: string;
}

interface AttendanceRequestRow {
  id: number;
  employeeId: number;
  employeeNameAr?: string;
  employeeNameEn?: string;
  employeeCode?: string;
  requestType: string;
  requestDate: string;
  requestedClockIn?: string;
  requestedClockOut?: string;
  reason?: string;
  status: string;
  managerApproval?: string;
  hrApproval?: string;
  managerNotes?: string;
  hrNotes?: string;
}

interface WorkLocationRow {
  id: number;
  nameAr?: string;
  nameEn?: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  isActive?: boolean;
  address?: string;
}

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule, SkeletonCardComponent, SkeletonKpiCardsComponent, SkeletonTableComponent, ConfirmDialogComponent, RejectReasonDialogComponent],
  templateUrl: './attendance.component.html',
  styleUrl: './attendance.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AttendanceComponent implements OnInit, OnDestroy {
  view = signal<AttendanceView>('dashboard');
  now = signal(new Date());

  dashboard = signal<any>(null);
  summary = signal<any>(null);
  todayRecord = signal<AttendanceRecordRow | null>(null);

  allRecords = signal<AttendanceRecordRow[]>([]);
  filteredRecords = signal<AttendanceRecordRow[]>([]);
  requests = signal<AttendanceRequestRow[]>([]);
  filteredRequests = signal<AttendanceRequestRow[]>([]);
  mapRecords = signal<AttendanceRecordRow[]>([]);
  workLocations = signal<WorkLocationRow[]>([]);

  loading = signal(false);
  logLoading = signal(false);
  requestsLoading = signal(false);
  mapLoading = signal(false);
  clockLoading = signal(false);
  locationSaving = signal(false);
  requestSubmitting = signal(false);

  feedback = signal('');
  error = signal('');
  logError = signal('');
  requestsError = signal('');
  mapError = signal('');

  showRequestModal = signal(false);
  showLocationModal = signal(false);
  requestActionIds = signal<number[]>([]);
  confirmAction = signal<{ type: 'approve-request' | 'delete-location'; id: number } | null>(null);
  rejectDialogOpen = signal(false);
  rejectTargetId = signal<number | null>(null);
  rejectDialogError = signal('');

  private clockTimer: any;

  logFilter = {
    search: '',
    from: '',
    to: '',
    status: '',
    orgUnit: '',
    attendanceState: ''
  };

  requestFilter = {
    search: '',
    status: ''
  };

  requestForm = {
    requestType: 'correction',
    requestDate: new Date().toISOString().slice(0, 10),
    requestedClockIn: '',
    requestedClockOut: '',
    reason: ''
  };

  locationForm = {
    nameAr: '',
    nameEn: '',
    latitude: 31.95,
    longitude: 35.93,
    radiusMeters: 200,
    address: ''
  };

  readonly pendingRequests = computed(() =>
    this.requests().filter(item => item.status === 'pending' || item.status === 'manager_approved').length
  );

  readonly orgUnitOptions = computed(() =>
    [...new Set(this.allRecords().map(item => this.orgUnitLabel(item)).filter((value): value is string => !!value))].sort()
  );

  readonly todaySummaryCards = computed(() => {
    const today = this.todayRecord();
    const summary = this.summary();
    const status = today?.status || summary?.todayStatus || 'pending';
    const workedMinutes = today?.workedMinutes ?? 0;
    const lateMinutes = today?.lateMinutes ?? 0;
    const locationStatus = today?.attendanceType
      ? this.attendanceTypeLabel(today.attendanceType)
      : this.t('—', '—');

    return [
      { labelAr: 'الحالة', labelEn: 'Status', value: this.attendanceStatusLabel(status), tone: this.statusTone(status) },
      { labelAr: 'الحضور', labelEn: 'Clock in', value: this.fmtTime(today?.clockIn) },
      { labelAr: 'الانصراف', labelEn: 'Clock out', value: this.fmtTime(today?.clockOut) },
      { labelAr: 'ساعات العمل', labelEn: 'Worked hours', value: this.formatWorkedHours(workedMinutes) },
      { labelAr: 'التأخير', labelEn: 'Late', value: lateMinutes > 0 ? this.formatLateMinutes(lateMinutes) : this.t('لا', 'No') },
      { labelAr: 'نوع / موقع الحضور', labelEn: 'Location / type', value: locationStatus }
    ];
  });

  readonly monthlySummaryCards = computed(() => {
    const summary = this.summary();
    if (!summary) return [];
    return [
      { labelAr: 'إجمالي السجلات', labelEn: 'Total records', value: summary.total ?? 0 },
      { labelAr: 'حاضر', labelEn: 'Present', value: summary.present ?? 0 },
      { labelAr: 'متأخر', labelEn: 'Late', value: summary.late ?? 0 },
      { labelAr: 'غائب', labelEn: 'Absent', value: summary.absent ?? 0 }
    ];
  });

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  get lang() {
    return this.auth.lang;
  }

  get isEmployee() {
    return this.auth.hasRole('employee');
  }

  get isHr() {
    return this.auth.hasRole('hradmin');
  }

  get isHrOrManager() {
    return this.auth.hasRole('hradmin', 'manager');
  }

  get canClockIn() {
    return this.isEmployee && !this.clockLoading() && !this.todayRecord()?.clockIn;
  }

  get canClockOut() {
    return this.isEmployee && !this.clockLoading() && !!this.todayRecord()?.clockIn && !this.todayRecord()?.clockOut;
  }

  get canCreateCorrection() {
    return this.isEmployee || this.auth.hasRole('manager');
  }

  ngOnInit() {
    this.clockTimer = setInterval(() => this.now.set(new Date()), 1000);
    this.loadDashboard();
    this.loadSummary();
    this.loadTodayRecord();
    this.loadLog();
    this.loadRequests();
    if (this.isHrOrManager) {
      this.loadMap();
    }
  }

  ngOnDestroy() {
    if (this.clockTimer) clearInterval(this.clockTimer);
  }

  t(ar: string, en: string) {
    return this.lang === 'ar' ? ar : en;
  }

  setView(view: AttendanceView) {
    this.view.set(view);
    if (view === 'log') this.loadLog();
    if (view === 'requests') this.loadRequests();
    if (view === 'map' && this.isHrOrManager) this.loadMap();
  }

  loadDashboard() {
    if (!this.isHrOrManager) return;
    this.api.get<any>('/api/attendance/dashboard').subscribe({
      next: response => this.dashboard.set(response.data || null),
      error: error => {
        this.error.set(getErrorMessage(error, this.t('تعذر تحميل لوحة الحضور.', 'Failed to load attendance dashboard.')));
      }
    });
  }

  loadSummary() {
    this.loading.set(true);
    this.error.set('');
    this.api.get<any>('/api/attendance/summary').subscribe({
      next: response => {
        this.summary.set(response.data || null);
        this.loading.set(false);
      },
      error: error => {
        this.error.set(getErrorMessage(error, this.t('تعذر تحميل ملخص الحضور.', 'Failed to load attendance summary.')));
        this.loading.set(false);
      }
    });
  }

  loadTodayRecord() {
    if (!this.isEmployee) {
      this.todayRecord.set(null);
      return;
    }

    this.api.get<any>('/api/attendance/my-today').subscribe({
      next: response => this.todayRecord.set(response.data || null),
      error: error => {
        this.error.set(getErrorMessage(error, this.t('تعذر تحميل حالة اليوم.', 'Failed to load today status.')));
      }
    });
  }

  loadLog() {
    this.logLoading.set(true);
    this.logError.set('');
    this.api.get<any>(this.isEmployee ? '/api/attendance/me' : '/api/attendance').subscribe({
      next: response => {
        this.allRecords.set(response.data || []);
        this.applyFilters();
        this.logLoading.set(false);
      },
      error: error => {
        this.logError.set(getErrorMessage(error, this.t('تعذر تحميل سجل الحضور.', 'Failed to load attendance records.')));
        this.allRecords.set([]);
        this.filteredRecords.set([]);
        this.logLoading.set(false);
      }
    });
  }

  applyFilters() {
    const term = this.logFilter.search.trim().toLowerCase();
    const from = this.logFilter.from;
    const to = this.logFilter.to;
    const status = this.logFilter.status;
    const orgUnit = this.logFilter.orgUnit;
    const attendanceState = this.logFilter.attendanceState;

    const filtered = this.allRecords().filter(row => {
      const rowOrgUnit = this.orgUnitLabel(row);
      const haystack = this.isEmployee
        ? [row.date, row.status, row.attendanceType].join(' ').toLowerCase()
        : [row.fullNameAr, row.fullNameEn, row.employeeCode, row.orgNodeNameAr, row.orgNodeNameEn, row.departmentAr, row.departmentEn].join(' ').toLowerCase();
      const matchesSearch = !term || haystack.includes(term);
      const matchesStatus = !status || row.status === status;
      const matchesOrgUnit = !orgUnit || rowOrgUnit === orgUnit;
      const matchesFrom = !from || row.date >= from;
      const matchesTo = !to || row.date <= to;

      const state = row.status === 'absent'
        ? 'absent'
        : row.lateMinutes > 0 || row.status === 'late'
          ? 'late'
          : 'present';
      const matchesState = !attendanceState || state === attendanceState;

      return matchesSearch && matchesStatus && matchesOrgUnit && matchesFrom && matchesTo && matchesState;
    });

    this.filteredRecords.set(filtered);
  }

  resetFilters() {
    this.logFilter = {
      search: '',
      from: '',
      to: '',
      status: '',
      orgUnit: '',
      attendanceState: ''
    };
    this.applyFilters();
  }

  orgUnitLabel(row: AttendanceRecordRow) {
    return (this.lang === 'ar' ? row.orgNodeNameAr : row.orgNodeNameEn)
      || row.orgNodeNameAr
      || row.orgNodeNameEn
      || (this.lang === 'ar' ? row.departmentAr : row.departmentEn)
      || row.departmentAr
      || row.departmentEn
      || '';
  }

  loadRequests() {
    this.requestsLoading.set(true);
    this.requestsError.set('');
    this.api.get<any>(this.isEmployee ? '/api/attendance/me/requests' : '/api/attendance/requests').subscribe({
      next: response => {
        this.requests.set(response.data || []);
        this.applyRequestFilters();
        this.requestsLoading.set(false);
      },
      error: error => {
        this.requestsError.set(getErrorMessage(error, this.t('تعذر تحميل طلبات التصحيح.', 'Failed to load correction requests.')));
        this.requests.set([]);
        this.filteredRequests.set([]);
        this.requestsLoading.set(false);
      }
    });
  }

  applyRequestFilters() {
    const status = this.requestFilter.status;
    const term = this.requestFilter.search.trim().toLowerCase();
    this.filteredRequests.set(
      this.requests().filter(request => {
        const matchesStatus = !status || request.status === status;
        const haystack = [
          this.isEmployee ? '' : request.employeeNameAr,
          this.isEmployee ? '' : request.employeeNameEn,
          this.isEmployee ? '' : request.employeeCode,
          request.requestType,
          request.reason
        ].join(' ').toLowerCase();
        const matchesSearch = !term || haystack.includes(term);
        return matchesStatus && matchesSearch;
      })
    );
  }

  resetRequestFilters() {
    this.requestFilter = { search: '', status: '' };
    this.applyRequestFilters();
  }

  loadMap() {
    if (!this.isHrOrManager) return;
    this.mapLoading.set(true);
    this.mapError.set('');
    this.api.get<any>('/api/attendance/map').subscribe({
      next: response => {
        this.mapRecords.set(response.data || []);
        this.workLocations.set(response.workLocations || []);
        this.mapLoading.set(false);
      },
      error: error => {
        this.mapError.set(getErrorMessage(error, this.t('تعذر تحميل بيانات الخريطة.', 'Failed to load attendance map.')));
        this.mapLoading.set(false);
      }
    });

    if (this.isHr) {
      this.api.get<any>('/api/attendance/locations').subscribe({
        next: response => this.workLocations.set(response.data || []),
        error: error => {
          this.mapError.set(getErrorMessage(error, this.t('تعذر تحميل مواقع العمل.', 'Failed to load work locations.')));
        }
      });
    }
  }

  clockIn() {
    if (!this.canClockIn) return;
    this.clockLoading.set(true);
    this.feedback.set('');
    this.error.set('');
    this.api.post<any>('/api/attendance/clock-in', { attendanceType: 'office' }).subscribe({
      next: () => {
        const message = this.t('تم تسجيل الحضور بنجاح.', 'Clock-in recorded successfully.');
        this.clockLoading.set(false);
        this.feedback.set(message);
        this.toast.success(message);
        this.refreshAttendanceState();
      },
      error: error => {
        const message = getErrorMessage(error, this.t('تعذر تسجيل الحضور.', 'Clock-in failed.'));
        this.clockLoading.set(false);
        this.error.set(message);
        this.toast.error(message);
      }
    });
  }

  clockOut() {
    if (!this.canClockOut) return;
    this.clockLoading.set(true);
    this.feedback.set('');
    this.error.set('');
    this.api.post<any>('/api/attendance/clock-out', {}).subscribe({
      next: () => {
        const message = this.t('تم تسجيل الانصراف بنجاح.', 'Clock-out recorded successfully.');
        this.clockLoading.set(false);
        this.feedback.set(message);
        this.toast.success(message);
        this.refreshAttendanceState();
      },
      error: error => {
        const message = getErrorMessage(error, this.t('تعذر تسجيل الانصراف.', 'Clock-out failed.'));
        this.clockLoading.set(false);
        this.error.set(message);
        this.toast.error(message);
      }
    });
  }

  refreshAttendanceState() {
    this.loadTodayRecord();
    this.loadSummary();
    this.loadLog();
  }

  openRequestModal() {
    this.requestForm = {
      requestType: 'correction',
      requestDate: new Date().toISOString().slice(0, 10),
      requestedClockIn: '',
      requestedClockOut: '',
      reason: ''
    };
    this.error.set('');
    this.showRequestModal.set(true);
  }

  submitRequest() {
    if (this.requestSubmitting()) return;
    this.error.set('');
    if (!this.requestForm.requestType) {
      this.error.set(this.t('نوع الطلب مطلوب.', 'Request type is required.'));
      return;
    }
    if (!this.requestForm.requestDate) {
      this.error.set(this.t('التاريخ مطلوب.', 'Date is required.'));
      return;
    }
    if (this.requestForm.requestDate > new Date().toISOString().slice(0, 10)) {
      this.error.set(this.t('لا يمكن إرسال طلب لتاريخ مستقبلي.', 'Future dates are not allowed.'));
      return;
    }
    if (!this.requestForm.requestedClockIn && !this.requestForm.requestedClockOut) {
      this.error.set(this.t('يجب إدخال وقت حضور أو انصراف واحد على الأقل.', 'At least one requested time is required.'));
      return;
    }
    if (!this.requestForm.reason.trim()) {
      this.error.set(this.t('السبب مطلوب.', 'Reason is required.'));
      return;
    }

    const duplicatePending = this.requests().some(item =>
      item.status === 'pending' &&
      item.requestType === this.requestForm.requestType &&
      item.requestDate === this.requestForm.requestDate
    );
    if (duplicatePending) {
      this.error.set(this.t('يوجد طلب تصحيح معلق لنفس التاريخ ونفس النوع.', 'A pending correction request already exists for this date and type.'));
      return;
    }

    this.requestSubmitting.set(true);
    const payload = {
      requestType: this.requestForm.requestType,
      requestDate: this.requestForm.requestDate,
      requestedClockIn: this.requestForm.requestedClockIn ? `${this.requestForm.requestDate}T${this.requestForm.requestedClockIn}:00` : null,
      requestedClockOut: this.requestForm.requestedClockOut ? `${this.requestForm.requestDate}T${this.requestForm.requestedClockOut}:00` : null,
      reason: this.requestForm.reason.trim()
    };

    this.api.post<any>(this.isEmployee ? '/api/attendance/me/requests' : '/api/attendance/requests', payload).subscribe({
      next: () => {
        const message = this.t('تم إرسال الطلب بنجاح.', 'Request submitted successfully.');
        this.requestSubmitting.set(false);
        this.showRequestModal.set(false);
        this.feedback.set(message);
        this.toast.success(message);
        this.loadRequests();
        this.loadSummary();
      },
      error: error => {
        const message = getErrorMessage(error, this.t('تعذر إرسال الطلب.', 'Failed to submit request.'));
        this.requestSubmitting.set(false);
        this.error.set(message);
        this.toast.error(message);
      }
    });
  }

  approveRequest(id: number) {
    if (this.isRequestActionLoading(id)) return;
    this.confirmAction.set({ type: 'approve-request', id });
  }

  rejectRequest(id: number) {
    if (this.isRequestActionLoading(id)) return;
    this.rejectTargetId.set(id);
    this.rejectDialogError.set('');
    this.rejectDialogOpen.set(true);
  }

  openLocationModal() {
    this.showLocationModal.set(true);
    this.error.set('');
  }

  saveLocation() {
    if (this.locationSaving()) return;
    this.locationSaving.set(true);
    this.api.post<any>('/api/attendance/locations', this.locationForm).subscribe({
      next: () => {
        this.locationSaving.set(false);
        this.showLocationModal.set(false);
        this.toast.success(this.t('تم حفظ موقع العمل.', 'Work location saved.'));
        this.loadMap();
      },
      error: error => {
        const message = getErrorMessage(error, this.t('تعذر حفظ موقع العمل.', 'Failed to save work location.'));
        this.locationSaving.set(false);
        this.error.set(message);
        this.toast.error(message);
      }
    });
  }

  deleteLocation(id: number) {
    if (this.isRequestActionLoading(id)) return;
    this.confirmAction.set({ type: 'delete-location', id });
  }

  closeConfirmDialog() {
    const current = this.confirmAction();
    if (current && !this.isRequestActionLoading(current.id)) {
      this.confirmAction.set(null);
    }
  }

  submitConfirmAction() {
    const current = this.confirmAction();
    if (!current || this.isRequestActionLoading(current.id)) return;

    this.setRequestActionLoading(current.id, true);
    const request = current.type === 'approve-request'
      ? this.api.put<any>(`/api/attendance/requests/${current.id}/approve`, { notes: null })
      : this.api.delete<any>(`/api/attendance/locations/${current.id}`);

    request.subscribe({
      next: () => {
        const message = current.type === 'approve-request'
          ? this.t('تمت الموافقة على الطلب.', 'Request approved.')
          : this.t('تم حذف الموقع.', 'Location deleted.');
        this.setRequestActionLoading(current.id, false);
        this.confirmAction.set(null);
        this.toast.success(message);
        if (current.type === 'approve-request') {
          this.loadRequests();
          this.loadLog();
        } else {
          this.loadMap();
        }
      },
      error: error => {
        const message = current.type === 'approve-request'
          ? getErrorMessage(error, this.t('تعذر اعتماد الطلب.', 'Failed to approve request.'))
          : getErrorMessage(error, this.t('تعذر حذف الموقع.', 'Failed to delete location.'));
        this.setRequestActionLoading(current.id, false);
        this.error.set(message);
        this.toast.error(message);
      }
    });
  }

  closeRejectDialog() {
    const id = this.rejectTargetId();
    if (id && !this.isRequestActionLoading(id)) {
      this.rejectDialogOpen.set(false);
      this.rejectTargetId.set(null);
      this.rejectDialogError.set('');
    }
  }

  submitRejectReason(reason: string) {
    const id = this.rejectTargetId();
    if (!id || this.isRequestActionLoading(id)) return;

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      this.rejectDialogError.set(this.t('الرجاء إدخال سبب الرفض.', 'Please provide a rejection reason.'));
      return;
    }

    this.setRequestActionLoading(id, true);
    this.api.put<any>(`/api/attendance/requests/${id}/reject`, { notes: trimmedReason }).subscribe({
      next: () => {
        this.setRequestActionLoading(id, false);
        this.rejectDialogOpen.set(false);
        this.rejectTargetId.set(null);
        this.rejectDialogError.set('');
        this.toast.info(this.t('تم رفض الطلب.', 'Request rejected.'));
        this.loadRequests();
      },
      error: error => {
        const message = getErrorMessage(error, this.t('تعذر رفض الطلب.', 'Failed to reject request.'));
        this.setRequestActionLoading(id, false);
        this.rejectDialogError.set(message);
        this.toast.error(message);
      }
    });
  }

  employeeName(row: { fullNameAr?: string; fullNameEn?: string; employeeNameAr?: string; employeeNameEn?: string }) {
    const en = (row as any).fullNameEn || (row as any).employeeNameEn;
    const ar = (row as any).fullNameAr || (row as any).employeeNameAr;
    return this.lang === 'ar' ? (ar || '—') : (en || ar || '—');
  }

  locationName(location: WorkLocationRow) {
    return this.lang === 'ar' ? (location.nameAr || location.nameEn || '—') : (location.nameEn || location.nameAr || '—');
  }

  fmtTime(value?: string | null) {
    if (!value) return '—';
    return new Date(value).toLocaleTimeString(this.lang === 'ar' ? 'ar-JO' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  }

  formatWorkedHours(minutes?: number | null) {
    if (!minutes) return '—';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return this.lang === 'ar' ? `${hours} س ${mins} د` : `${hours}h ${mins}m`;
  }

  formatLateMinutes(minutes?: number | null) {
    if (!minutes) return this.t('لا', 'No');
    return this.lang === 'ar' ? `${minutes} دقيقة` : `${minutes} min`;
  }

  attendanceStatusLabel(status: string) {
    const labels: Record<string, { ar: string; en: string }> = {
      present: { ar: 'حاضر', en: 'Present' },
      late: { ar: 'متأخر', en: 'Late' },
      absent: { ar: 'غائب', en: 'Absent' },
      pending: { ar: 'قيد الانتظار', en: 'Pending' },
      manager_approved: { ar: 'موافقة المدير', en: 'Manager approved' },
      approved: { ar: 'موافق عليه', en: 'Approved' },
      rejected: { ar: 'مرفوض', en: 'Rejected' },
      on_leave: { ar: 'في إجازة', en: 'On leave' }
    };
    const label = labels[status];
    return label ? this.t(label.ar, label.en) : status;
  }

  attendanceTypeLabel(type: string) {
    const labels: Record<string, { ar: string; en: string }> = {
      office: { ar: 'مكتبي', en: 'Office' },
      mobile: { ar: 'ميداني', en: 'Mobile' },
      manual: { ar: 'يدوي', en: 'Manual' }
    };
    const label = labels[type];
    return label ? this.t(label.ar, label.en) : type;
  }

  statusTone(status: string) {
    if (status === 'present') return 'success';
    if (status === 'late' || status === 'pending') return 'warning';
    if (status === 'absent' || status === 'rejected') return 'danger';
    return 'info';
  }

  requestTypeLabel(type: string) {
    const labels: Record<string, { ar: string; en: string }> = {
      correction: { ar: 'تصحيح وقت', en: 'Time correction' },
      missing_punch: { ar: 'بصمة مفقودة', en: 'Missing punch' }
    };
    const label = labels[type];
    return label ? this.t(label.ar, label.en) : type;
  }

  correctionStatusFor(row: AttendanceRecordRow) {
    const request = this.requests().find(item => item.requestDate === row.date);
    return request ? this.attendanceStatusLabel(request.status) : '—';
  }

  mapsUrl(lat?: number, lng?: number) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }

  isRequestActionLoading(id: number) {
    return this.requestActionIds().includes(id);
  }

  retryCurrentView() {
    if (this.view() === 'log') this.loadLog();
    else if (this.view() === 'requests') this.loadRequests();
    else if (this.view() === 'map') this.loadMap();
    else {
      this.loadSummary();
      this.loadTodayRecord();
      this.loadDashboard();
    }
  }

  private setRequestActionLoading(id: number, loading: boolean) {
    const current = this.requestActionIds();
    this.requestActionIds.set(loading ? [...current, id] : current.filter(item => item !== id));
  }
}
