import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { RoleAccessService } from '../../core/services/role-access.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { SkeletonCardComponent } from '../../shared/components/skeleton/skeleton-card.component';
import { SkeletonKpiCardsComponent } from '../../shared/components/skeleton/skeleton-kpi-cards.component';
import { SkeletonTableComponent } from '../../shared/components/skeleton/skeleton-table.component';
import { ConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog.component';
import { RejectReasonDialogComponent } from '../../shared/components/ui/reject-reason-dialog.component';
import { getErrorMessage } from '../../core/utils/error-message';

type AttendanceView = 'dashboard' | 'log' | 'requests' | 'map' | 'devices';

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

interface TrustedDeviceRow {
  id: number;
  employeeId: number;
  employeeCode?: string;
  employeeNameAr?: string;
  employeeNameEn?: string;
  deviceLabel?: string;
  platform?: string;
  browser?: string;
  status: string;
  enrolledAt?: string;
  lastUsedAt?: string;
}

interface EmployeeScheduleDay {
  date: string;
  status: string;
  shift: any;
  location?: WorkLocationRow | null;
  recurrence?: string;
  googleMapsUrl?: string | null;
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
  trustedDevices = signal<TrustedDeviceRow[]>([]);
  mySchedule = signal<{ todayShift: EmployeeScheduleDay | null; upcoming: EmployeeScheduleDay[]; total: number } | null>(null);
  editingLocationId = signal<number | null>(null);

  loading = signal(false);
  logLoading = signal(false);
  requestsLoading = signal(false);
  mapLoading = signal(false);
  clockLoading = signal(false);
  locationSaving = signal(false);
  mapDragging = signal(false);
  openingMapKey = signal<string | null>(null);
  requestSubmitting = signal(false);
  enrollingDevice = signal(false);
  devicesLoading = signal(false);

  feedback = signal('');
  error = signal('');
  logError = signal('');
  requestsError = signal('');
  mapError = signal('');
  locationStatus = signal('');
  biometricStatus = signal('');

  showRequestModal = signal(false);
  showLocationModal = signal(false);
  requestActionIds = signal<number[]>([]);
  confirmAction = signal<{ type: 'approve-request' | 'delete-location'; id: number } | null>(null);
  rejectDialogOpen = signal(false);
  rejectTargetId = signal<number | null>(null);
  rejectDialogError = signal('');

  private clockTimer: any;
  private readonly textCache = new Map<string, string>();
  private mapPointerFrame: number | null = null;
  private lastMapOpenAt = 0;

  logFilter = {
    search: '',
    from: '',
    to: '',
    status: '',
    orgUnit: '',
    attendanceState: '',
    lateMinutes: 0
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

  deviceLabel = '';

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

  readonly todayShift = computed(() => this.mySchedule()?.todayShift ?? null);
  readonly upcomingSchedulePreview = computed(() => (this.mySchedule()?.upcoming ?? []).slice(0, 5));
  readonly primaryScheduleShift = computed(() => this.todayShift() ?? this.upcomingSchedulePreview()[0] ?? null);

  constructor(public auth: AuthService, private access: RoleAccessService, private api: ApiService, private toast: ToastService, private i18n: I18nService) {}

  get lang() {
    return this.auth.lang;
  }

  get isEmployee() {
    return this.access.isEmployee();
  }

  get isHr() {
    return this.access.isHrAdmin();
  }

  get isHrOrManager() {
    return this.access.isAny('hradmin', 'manager');
  }

  get canClockIn() {
    return this.isEmployee && !this.clockLoading() && !this.todayRecord()?.clockIn;
  }

  get canClockOut() {
    return this.isEmployee && !this.clockLoading() && !!this.todayRecord()?.clockIn && !this.todayRecord()?.clockOut;
  }

  get canCreateCorrection() {
    return this.isEmployee || this.access.isManager();
  }

  ngOnInit() {
    this.clockTimer = setInterval(() => this.now.set(new Date()), 30000);
    this.loadDashboard();
    this.loadSummary();
    this.loadTodayRecord();
    this.loadLog();
    this.loadRequests();
    this.loadMySchedule();
    if (this.isHrOrManager) {
      this.loadMap();
    }
    if (this.isEmployee || this.isHr) {
      this.loadTrustedDevices();
    }
  }

  ngOnDestroy() {
    if (this.clockTimer) clearInterval(this.clockTimer);
    if (this.mapPointerFrame != null) cancelAnimationFrame(this.mapPointerFrame);
  }

  t(ar: string, en: string) {
    if (this.lang !== 'ar') return en;
    const key = `${this.lang}|${en}|${ar}`;
    const cached = this.textCache.get(key);
    if (cached != null) return cached;
    const cleanArabic: Record<string, string> = {
      'Status': 'الحالة',
      'Clock in': 'الحضور',
      'Clock out': 'الانصراف',
      'Worked hours': 'ساعات العمل',
      'Late': 'التأخير',
      'Location / type': 'نوع / موقع الحضور',
      'Total records': 'إجمالي السجلات',
      'Present': 'حاضر',
      'Absent': 'غائب',
      'No': 'لا',
      'Failed to load attendance dashboard.': 'تعذر تحميل لوحة الحضور.',
      'Failed to load attendance summary.': 'تعذر تحميل ملخص الحضور.',
      'Failed to load today status.': 'تعذر تحميل حالة اليوم.',
      'Failed to load attendance records.': 'تعذر تحميل سجل الحضور.',
      'Failed to load correction requests.': 'تعذر تحميل طلبات التصحيح.',
      'Failed to load attendance map.': 'تعذر تحميل بيانات الخريطة.',
      'Failed to load work locations.': 'تعذر تحميل مواقع العمل.',
      'Clock-in recorded successfully.': 'تم تسجيل الحضور بنجاح.',
      'Clock-in failed.': 'تعذر تسجيل الحضور.',
      'Clock-out recorded successfully.': 'تم تسجيل الانصراف بنجاح.',
      'Clock-out failed.': 'تعذر تسجيل الانصراف.',
      'Unable to determine location': 'تعذر تحديد الموقع',
      'Please allow location access': 'يجب السماح باستخدام الموقع',
      'Inside allowed work location': 'داخل نطاق الموقع',
      'Outside allowed work location': 'خارج نطاق الموقع',
      'No work locations configured yet.': 'لم يتم ضبط مواقع عمل بعد.',
      'Current location selected.': 'تم تحديد موقعك الحالي.',
      'Work location saved.': 'تم حفظ موقع العمل.',
      'Failed to save work location.': 'تعذر حفظ موقع العمل.',
      'Location deleted.': 'تم حذف الموقع.'
    };
    const result = this.i18n.cleanArabicText(cleanArabic[en] || ar);
    if (this.textCache.size > 1500) this.textCache.clear();
    this.textCache.set(key, result);
    return result;
  }

  loadMySchedule() {
    this.api.get<any>('/api/shifts/my-schedule?days=14').subscribe({
      next: response => this.mySchedule.set(response.data || null),
      error: () => this.mySchedule.set(null)
    });
  }

  scheduleStatusLabel(status: string) {
    if (status === 'active_today') return this.t('نشطة اليوم', 'Active today');
    if (status === 'completed') return this.t('مكتملة', 'Completed');
    if (status === 'missed') return this.t('غائب / فائتة', 'Missed / absent');
    return this.t('مجدولة', 'Scheduled');
  }

  recurrenceLabel(recurrence?: string | null) {
    if (recurrence === 'daily') return this.t('يومي', 'Daily');
    if (recurrence === 'monthly') return this.t('شهري', 'Monthly');
    return this.t('أسبوعي', 'Weekly');
  }

  setView(view: AttendanceView) {
    this.view.set(view);
    if (view === 'log') this.loadLog();
    if (view === 'requests') this.loadRequests();
    if (view === 'map' && this.isHrOrManager) this.loadMap();
    if (view === 'devices') this.loadTrustedDevices();
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
    const lateThreshold = this.logFilter.lateMinutes;

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
      const matchesLate = !lateThreshold || row.lateMinutes >= lateThreshold;

      return matchesSearch && matchesStatus && matchesOrgUnit && matchesFrom && matchesTo && matchesState && matchesLate;
    });

    this.filteredRecords.set(filtered);
  }

  get hasActiveLogFilters() {
    return !!(this.logFilter.search || this.logFilter.from || this.logFilter.to
      || this.logFilter.status || this.logFilter.orgUnit || this.logFilter.attendanceState
      || this.logFilter.lateMinutes);
  }

  get hasActiveRequestFilters() {
    return !!(this.requestFilter.search || this.requestFilter.status);
  }

  resetFilters() {
    this.logFilter = {
      search: '',
      from: '',
      to: '',
      status: '',
      orgUnit: '',
      attendanceState: '',
      lateMinutes: 0
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
    this.secureAttendancePayload('clock_in').then(payload => {
      const coords = { latitude: payload.latitude, longitude: payload.longitude };
      const status = this.evaluateLocalGeofence(coords.latitude, coords.longitude);
      this.locationStatus.set(status.message);
      this.api.post<any>('/api/attendance/clock-in', { attendanceType: 'office', ...coords, biometricAssertion: payload.biometricAssertion }).subscribe({
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
    }).catch(message => {
      this.clockLoading.set(false);
      this.error.set(message);
      this.biometricStatus.set(message);
      this.toast.error(message);
    });
  }

  clockOut() {
    if (!this.canClockOut) return;
    this.clockLoading.set(true);
    this.feedback.set('');
    this.error.set('');
    this.secureAttendancePayload('clock_out').then(payload => {
      const coords = { latitude: payload.latitude, longitude: payload.longitude };
      const status = this.evaluateLocalGeofence(coords.latitude, coords.longitude);
      this.locationStatus.set(status.message);
      this.api.post<any>('/api/attendance/clock-out', { ...coords, biometricAssertion: payload.biometricAssertion }).subscribe({
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
    }).catch(message => {
      this.clockLoading.set(false);
      this.error.set(message);
      this.biometricStatus.set(message);
      this.toast.error(message);
    });
  }

  loadTrustedDevices() {
    if (!this.isEmployee && !this.isHr) return;
    this.devicesLoading.set(true);
    this.api.get<any>('/api/attendance/biometric/devices').subscribe({
      next: response => {
        this.trustedDevices.set(response.data || []);
        this.devicesLoading.set(false);
      },
      error: error => {
        this.devicesLoading.set(false);
        this.error.set(getErrorMessage(error, this.t('تعذر تحميل الأجهزة الموثوقة.', 'Failed to load trusted devices.')));
      }
    });
  }

  enrollDevice() {
    if (!this.isEmployee || this.enrollingDevice()) return;
    if (!this.webAuthnSupported()) {
      const message = this.t('هذا المتصفح لا يدعم مفاتيح المرور.', 'This browser does not support passkeys.');
      this.error.set(message);
      this.toast.error(message);
      return;
    }
    this.enrollingDevice.set(true);
    this.biometricStatus.set(this.t('يجب التحقق بالبصمة أو Face ID', 'Biometric or Face ID verification is required'));
    this.api.post<any>('/api/attendance/biometric/registration/challenge', {}).subscribe({
      next: async response => {
        try {
          const options = this.registrationOptions(response.data);
          const credential = await navigator.credentials.create({ publicKey: options }) as PublicKeyCredential | null;
          if (!credential) throw new Error(this.t('فشل التحقق البيومتري', 'Biometric verification failed'));
          const payload = {
            credential: this.publicKeyCredentialToJSON(credential),
            deviceLabel: this.deviceLabel || this.defaultDeviceLabel(),
            platform: navigator.platform,
            browser: this.browserName()
          };
          this.api.post<any>('/api/attendance/biometric/registration/verify', payload).subscribe({
            next: () => {
              this.enrollingDevice.set(false);
              this.biometricStatus.set(this.t('تم تسجيل الجهاز بنجاح.', 'Device enrolled successfully.'));
              this.toast.success(this.biometricStatus());
              this.loadTrustedDevices();
            },
            error: error => {
              const message = getErrorMessage(error, this.t('فشل التحقق البيومتري', 'Biometric verification failed'));
              this.enrollingDevice.set(false);
              this.error.set(message);
              this.toast.error(message);
            }
          });
        } catch (error: any) {
          const message = error?.message || this.t('فشل التحقق البيومتري', 'Biometric verification failed');
          this.enrollingDevice.set(false);
          this.error.set(message);
          this.toast.error(message);
        }
      },
      error: error => {
        const message = getErrorMessage(error, this.t('جهازك غير مسجل للحضور', 'This device is not registered for attendance'));
        this.enrollingDevice.set(false);
        this.error.set(message);
        this.toast.error(message);
      }
    });
  }

  updateDeviceStatus(device: TrustedDeviceRow, status: 'active' | 'blocked' | 'revoked' | 'pending_reenroll') {
    if (!this.isHr) return;
    this.api.patch<any>(`/api/attendance/biometric/devices/${device.id}/status`, { status }).subscribe({
      next: () => {
        this.toast.success(this.t('تم تحديث حالة الجهاز.', 'Device status updated.'));
        this.loadTrustedDevices();
      },
      error: error => this.toast.error(getErrorMessage(error, this.t('تعذر تحديث حالة الجهاز.', 'Failed to update device status.')))
    });
  }

  private async secureAttendancePayload(action: 'clock_in' | 'clock_out') {
    if (!this.webAuthnSupported()) throw new Error(this.t('يجب التحقق بالبصمة أو Face ID', 'Biometric or Face ID verification is required'));
    const coords = await this.getBrowserLocation();
    const challenge = await this.postPromise<any>('/api/attendance/biometric/attendance/challenge', { action });
    const assertion = await navigator.credentials.get({ publicKey: this.authenticationOptions(challenge.data) }) as PublicKeyCredential | null;
    if (!assertion) throw new Error(this.t('فشل التحقق البيومتري', 'Biometric verification failed'));
    return { ...coords, biometricAssertion: this.publicKeyCredentialToJSON(assertion) };
  }

  private postPromise<T>(url: string, body: unknown): Promise<T> {
    return new Promise((resolve, reject) => this.api.post<T>(url, body).subscribe({ next: resolve, error: reject }));
  }

  private webAuthnSupported() {
    return typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials;
  }

  private registrationOptions(data: any): PublicKeyCredentialCreationOptions {
    return {
      ...data,
      challenge: this.base64UrlToArrayBuffer(data.challenge),
      user: { ...data.user, id: this.base64UrlToArrayBuffer(data.user.id) },
      excludeCredentials: (data.excludeCredentials || []).map((item: any) => ({ ...item, id: this.base64UrlToArrayBuffer(item.id) }))
    };
  }

  private authenticationOptions(data: any): PublicKeyCredentialRequestOptions {
    return {
      ...data,
      challenge: this.base64UrlToArrayBuffer(data.challenge),
      allowCredentials: (data.allowCredentials || []).map((item: any) => ({ ...item, id: this.base64UrlToArrayBuffer(item.id) }))
    };
  }

  private publicKeyCredentialToJSON(credential: PublicKeyCredential) {
    const response: any = credential.response;
    const json: any = {
      id: credential.id,
      rawId: this.arrayBufferToBase64Url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: this.arrayBufferToBase64Url(response.clientDataJSON)
      }
    };
    if (response.attestationObject) json.response.attestationObject = this.arrayBufferToBase64Url(response.attestationObject);
    if (response.authenticatorData) json.response.authenticatorData = this.arrayBufferToBase64Url(response.authenticatorData);
    if (response.signature) json.response.signature = this.arrayBufferToBase64Url(response.signature);
    if (response.userHandle) json.response.userHandle = this.arrayBufferToBase64Url(response.userHandle);
    return json;
  }

  private base64UrlToArrayBuffer(value: string) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  private arrayBufferToBase64Url(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  private defaultDeviceLabel() {
    return this.t('جهازي الموثوق', 'My trusted device');
  }

  private browserName() {
    const ua = navigator.userAgent;
    if (ua.includes('Edg/')) return 'Edge';
    if (ua.includes('Chrome/')) return 'Chrome';
    if (ua.includes('Safari/')) return 'Safari';
    if (ua.includes('Firefox/')) return 'Firefox';
    return 'Browser';
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

  openLocationModal(location?: WorkLocationRow) {
    this.editingLocationId.set(location?.id ?? null);
    this.locationForm = location
      ? {
          nameAr: location.nameAr || '',
          nameEn: location.nameEn || '',
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          radiusMeters: Number(location.radiusMeters || 200),
          address: location.address || ''
        }
      : {
          nameAr: '',
          nameEn: '',
          latitude: 31.95,
          longitude: 35.93,
          radiusMeters: 200,
          address: ''
        };
    this.showLocationModal.set(true);
    this.error.set('');
  }

  pickLocationFromMap(event: MouseEvent) {
    if ((event.target as HTMLElement).closest('button,a')) return;
    this.updateLocationFromPointer(event.currentTarget as HTMLElement, event.clientX, event.clientY);
  }

  startMapDrag(event: PointerEvent) {
    if ((event.target as HTMLElement).closest('button,a')) return;
    const target = event.currentTarget as HTMLElement;
    this.mapDragging.set(true);
    target.setPointerCapture?.(event.pointerId);
    this.updateLocationFromPointer(target, event.clientX, event.clientY);
  }

  dragMapMarker(event: PointerEvent) {
    if (!this.mapDragging()) return;
    const target = event.currentTarget as HTMLElement;
    const clientX = event.clientX;
    const clientY = event.clientY;
    if (this.mapPointerFrame != null) return;
    this.mapPointerFrame = requestAnimationFrame(() => {
      this.mapPointerFrame = null;
      this.updateLocationFromPointer(target, clientX, clientY);
    });
  }

  endMapDrag(event: PointerEvent) {
    this.mapDragging.set(false);
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  }

  nudgeMapMarker(deltaLat: number, deltaLng: number) {
    this.locationForm.latitude = Number((Number(this.locationForm.latitude) + deltaLat).toFixed(6));
    this.locationForm.longitude = Number((Number(this.locationForm.longitude) + deltaLng).toFixed(6));
    this.syncLocationAddressHint();
  }

  private updateLocationFromPointer(target: HTMLElement, clientX: number, clientY: number) {
    const rect = target.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    this.locationForm.latitude = Number((31.95 + (0.5 - y) * 0.18).toFixed(6));
    this.locationForm.longitude = Number((35.93 + (x - 0.5) * 0.24).toFixed(6));
    this.syncLocationAddressHint();
  }

  useDefaultLocation() {
    this.locationForm.latitude = 31.95;
    this.locationForm.longitude = 35.93;
    this.syncLocationAddressHint();
  }

  markerX() {
    return Math.min(95, Math.max(5, 50 + ((Number(this.locationForm.longitude) - 35.93) / 0.24) * 100));
  }

  markerY() {
    return Math.min(95, Math.max(5, 50 - ((Number(this.locationForm.latitude) - 31.95) / 0.18) * 100));
  }

  radiusDiameterPercent() {
    const radius = Math.max(50, Number(this.locationForm.radiusMeters || 0));
    return Math.min(90, Math.max(10, radius / 15));
  }

  useBrowserLocationForPicker() {
    this.getBrowserLocation().then(coords => {
      this.locationForm.latitude = coords.latitude;
      this.locationForm.longitude = coords.longitude;
      this.syncLocationAddressHint();
      this.locationStatus.set(this.t('تم تحديد موقعك الحالي.', 'Current location selected.'));
    }).catch(message => this.locationStatus.set(message));
  }

  syncLocationAddressHint() {
    if (this.locationForm.address?.trim()) return;
    this.locationForm.address = this.t('موقع محدد من الخريطة', 'Map selected location');
  }

  private getBrowserLocation(): Promise<{ latitude: number; longitude: number }> {
    if (!navigator.geolocation) {
      return Promise.reject(this.t('تعذر تحديد الموقع', 'Unable to determine location'));
    }
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        position => resolve({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6))
        }),
        () => reject(this.t('يجب السماح باستخدام الموقع', 'Please allow location access')),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  private evaluateLocalGeofence(latitude: number, longitude: number) {
    const locations = this.workLocations();
    if (!locations.length) return { inside: true, message: this.t('لم يتم ضبط مواقع عمل بعد.', 'No work locations configured yet.') };
    const nearest = locations
      .map(location => ({ location, distance: this.distanceMeters(latitude, longitude, Number(location.latitude), Number(location.longitude)) }))
      .sort((a, b) => a.distance - b.distance)[0];
    const inside = !!nearest && nearest.distance <= Number(nearest.location.radiusMeters || 0);
    return { inside, message: inside ? this.t('داخل نطاق الموقع', 'Inside allowed work location') : this.t('خارج نطاق الموقع', 'Outside allowed work location') };
  }

  private distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
    const toRad = (value: number) => value * Math.PI / 180;
    const r = 6371000;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  saveLocation() {
    if (this.locationSaving()) return;
    this.locationSaving.set(true);
    const payload = { ...this.locationForm, id: this.editingLocationId() };
    this.api.post<any>('/api/attendance/locations', payload).subscribe({
      next: () => {
        this.locationSaving.set(false);
        this.showLocationModal.set(false);
        this.editingLocationId.set(null);
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
    return new Date(value).toLocaleTimeString(this.lang === 'ar' ? 'ar-JO-u-nu-latn' : 'en-US', { hour: '2-digit', minute: '2-digit' });
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

  deviceStatusLabel(status: string) {
    const labels: Record<string, { ar: string; en: string }> = {
      active: { ar: 'نشط', en: 'Active' },
      blocked: { ar: 'محظور', en: 'Blocked' },
      revoked: { ar: 'ملغى', en: 'Revoked' },
      pending_reenroll: { ar: 'بانتظار إعادة التسجيل', en: 'Pending re-enrollment' }
    };
    const label = labels[status];
    return label ? this.t(label.ar, label.en) : status;
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
    return `https://www.google.com/maps?q=${encodeURIComponent(String(lat ?? ''))},${encodeURIComponent(String(lng ?? ''))}`;
  }

  openExternalMap(lat?: number, lng?: number, key = 'map') {
    this.openExternalMapUrl(this.mapsUrl(lat, lng), key);
  }

  openExternalMapUrl(url?: string | null, key = 'map') {
    if (!url || this.openingMapKey()) return;
    const now = Date.now();
    if (now - this.lastMapOpenAt < 1200) return;
    this.lastMapOpenAt = now;
    this.openingMapKey.set(key);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => {
      if (this.openingMapKey() === key) this.openingMapKey.set(null);
    }, 1200);
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
