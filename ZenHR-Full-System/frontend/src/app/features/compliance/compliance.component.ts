import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { RoleAccessService } from '../../core/services/role-access.service';
import { ToastService } from '../../core/services/toast.service';
import { getErrorMessage } from '../../core/utils/error-message';

type ComplianceCategory = 'social_security' | 'work_permit' | 'health_certificate' | 'criminal_record';
type ComplianceStatus = 'valid' | 'expiring_soon' | 'expired' | 'missing';

@Component({
  selector: 'app-compliance',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './compliance.component.html',
  styleUrl: './compliance.component.scss'
})
export class ComplianceComponent implements OnInit {
  readonly activeTab = signal<ComplianceCategory>('social_security');
  readonly loading = signal(true);
  readonly savingSettings = signal(false);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly overview = signal<any | null>(null);
  readonly allItems = signal<any[]>([]);
  readonly employeeDetail = signal<any | null>(null);
  readonly employeeDetailOpen = signal(false);
  readonly employeeDetailLoading = signal(false);
  readonly settingsOpen = signal(false);
  readonly editModalOpen = signal(false);
  readonly editSaving = signal(false);
  readonly editError = signal('');

  readonly searchTerm = signal('');
  readonly employeeFilter = signal('');
  readonly orgUnitFilter = signal('');
  readonly nationalityFilter = signal('');
  readonly statusFilter = signal('');
  readonly expiringWithinFilter = signal('');

  readonly settings = signal({
    health_certificate_required: 'true',
    criminal_record_required: 'true',
    work_permit_required_non_jordanian: 'true',
    residency_required_non_jordanian: 'true',
    passport_required_non_jordanian: 'true',
    social_security_required_active: 'true',
    compliance_warning_days: '30',
    social_security_portal_url: '',
    ministry_of_health_portal_url: ''
  });

  editForm = {
    employeeId: '',
    sscNumber: '',
    registrationDate: '',
    sscStatus: 'registered',
    workPermitNumber: '',
    workPermitIssueDate: '',
    workPermitExpiryDate: '',
    workPermitCategory: '',
    residencyNumber: '',
    residencyType: '',
    residencyExpiry: '',
    passportNumber: '',
    passportExpiry: '',
    passportCountry: '',
    healthCertificateNumber: '',
    healthIssueDate: '',
    healthExpiryDate: '',
    healthStatus: 'valid',
    healthIssuedBy: '',
    criminalReferenceNumber: '',
    criminalIssueDate: '',
    criminalExpiryDate: '',
    notes: ''
  };

  readonly tabOptions: { key: ComplianceCategory; icon: string; ar: string; en: string }[] = [
    { key: 'social_security', icon: 'security', ar: 'الضمان الاجتماعي', en: 'Social Security' },
    { key: 'work_permit', icon: 'badge', ar: 'تصاريح العمل', en: 'Work Permits' },
    { key: 'health_certificate', icon: 'health_and_safety', ar: 'الشهادات الصحية', en: 'Health Certificates' },
    { key: 'criminal_record', icon: 'gavel', ar: 'براءة الذمة', en: 'Criminal Record' }
  ];

  readonly quickAddActions: { key: ComplianceCategory; icon: string; ar: string; en: string }[] = [
    { key: 'social_security', icon: 'security', ar: 'إضافة الضمان الاجتماعي', en: 'Add social security' },
    { key: 'work_permit', icon: 'badge', ar: 'إضافة تصريح عمل', en: 'Add work permit' },
    { key: 'health_certificate', icon: 'health_and_safety', ar: 'إضافة شهادة صحية', en: 'Add health certificate' },
    { key: 'criminal_record', icon: 'gavel', ar: 'إضافة عدم محكومية', en: 'Add criminal record' }
  ];

  readonly filteredItems = computed(() => {
    const tab = this.activeTab();
    const term = this.searchTerm().trim().toLowerCase();
    const employeeId = this.employeeFilter();
    const orgUnit = this.orgUnitFilter();
    const nationality = this.nationalityFilter();
    const status = this.statusFilter();
    const expiringWithin = Number(this.expiringWithinFilter() || 0);

    return this.allItems().filter(item => {
      const matchesTab = item.category === tab;
      const matchesEmployee = !employeeId || String(item.employeeId) === String(employeeId);
      const itemOrgUnit = this.orgUnitLabel(item);
      const matchesOrgUnit = !orgUnit || itemOrgUnit.toLowerCase() === orgUnit.toLowerCase();
      const matchesNationality = !nationality || (item.nationalityCode ?? '') === nationality;
      const matchesStatus = !status || item.status === status;
      const matchesExpiringWithin = !expiringWithin || ((item.daysRemaining ?? Number.MAX_SAFE_INTEGER) <= expiringWithin && (item.daysRemaining ?? Number.MAX_SAFE_INTEGER) >= 0);
      const haystack = [
        item.employeeNameAr,
        item.employeeNameEn,
        item.employeeCode,
        item.orgNodeNameAr,
        item.orgNodeNameEn,
        item.departmentAr,
        item.departmentEn,
        item.referenceNumber,
        item.notes,
        item.labelAr,
        item.labelEn
      ].join(' ').toLowerCase();
      const matchesSearch = !term || haystack.includes(term);
      return matchesTab && matchesEmployee && matchesOrgUnit && matchesNationality && matchesStatus && matchesExpiringWithin && matchesSearch;
    });
  });

  readonly criticalAlerts = computed(() =>
    [...(this.overview()?.alerts ?? [])].sort((a, b) => {
      const severityDiff = this.statusWeight(b.status) - this.statusWeight(a.status);
      if (severityDiff !== 0) return severityDiff;
      return (a.daysRemaining ?? Number.MAX_SAFE_INTEGER) - (b.daysRemaining ?? Number.MAX_SAFE_INTEGER);
    })
  );

  readonly orgUnitOptions = computed(() =>
    Array.from(new Set(this.allItems().map(item => this.orgUnitLabel(item)).filter(Boolean)))
  );

  readonly nationalityOptions = computed(() =>
    Array.from(new Set(this.allItems().map(item => item.nationalityCode).filter(Boolean)))
  );

  readonly employeeOptions = computed(() =>
    Array.from(new Map(this.allItems().map(item => [item.employeeId, { id: item.employeeId, name: this.employeeLabel(item) }])).values())
  );

  readonly hasFilters = computed(() => !!(this.searchTerm() || this.employeeFilter() || this.orgUnitFilter() || this.nationalityFilter() || this.statusFilter() || this.expiringWithinFilter()));

  constructor(
    public auth: AuthService,
    private access: RoleAccessService,
    private api: ApiService,
    private toast: ToastService
  ) {}

  get lang() {
    return this.auth.lang;
  }

  get isHr() {
    return this.access.isAny('hradmin', 'superadmin');
  }

  ngOnInit() {
    this.loadDashboard();
    this.loadItems();
    if (this.isHr) {
      this.loadSettings();
    }
  }

  loadDashboard() {
    this.loading.set(true);
    this.error.set('');
    this.api.get<any>('/api/compliance/overview').subscribe({
      next: response => {
        this.overview.set(response.data ?? null);
        this.loading.set(false);
      },
      error: error => {
        const message = getErrorMessage(error, this.lang === 'ar' ? 'تعذر تحميل لوحة الامتثال.' : 'Failed to load compliance dashboard.');
        this.error.set(message);
        this.toast.error(message);
        this.loading.set(false);
      }
    });
  }

  loadItems() {
    this.api.get<any>('/api/compliance/items').subscribe({
      next: response => this.allItems.set(response.data ?? []),
      error: error => {
        const message = getErrorMessage(error, this.lang === 'ar' ? 'تعذر تحميل بيانات الامتثال.' : 'Failed to load compliance items.');
        this.error.set(message);
        this.toast.error(message);
      }
    });
  }

  loadSettings() {
    this.api.get<any>('/api/config?category=compliance').subscribe({
      next: response => {
        const updates: Record<string, string> = { ...this.settings() };
        for (const item of response.data ?? []) {
          updates[item.key] = item.value;
        }
        this.settings.set({ ...this.settings(), ...updates });
      }
    });
  }

  saveSettings() {
    if (!this.isHr || this.savingSettings()) return;
    this.savingSettings.set(true);
    this.api.patch<any>('/api/config/bulk', {
      updates: this.settings()
    }).subscribe({
      next: () => {
        this.savingSettings.set(false);
        this.toast.success(this.lang === 'ar' ? 'تم حفظ إعدادات الامتثال.' : 'Compliance settings saved.');
        this.loadDashboard();
        this.loadItems();
      },
      error: error => {
        this.savingSettings.set(false);
        this.toast.error(getErrorMessage(error, this.lang === 'ar' ? 'تعذر حفظ إعدادات الامتثال.' : 'Failed to save compliance settings.'));
      }
    });
  }

  openEmployeeCompliance(employeeId: number) {
    this.employeeDetailLoading.set(true);
    this.employeeDetailOpen.set(true);
    this.api.get<any>(`/api/compliance/employee/${employeeId}`).subscribe({
      next: response => {
        this.employeeDetail.set(response.data ?? null);
        this.employeeDetailLoading.set(false);
      },
      error: error => {
        this.employeeDetailLoading.set(false);
        this.toast.error(getErrorMessage(error, this.lang === 'ar' ? 'تعذر تحميل ملف الامتثال للموظف.' : 'Failed to load employee compliance view.'));
      }
    });
  }

  closeEmployeeCompliance() {
    this.employeeDetailOpen.set(false);
    this.employeeDetail.set(null);
    this.employeeDetailLoading.set(false);
  }

  openCreateModal(item?: any) {
    this.editError.set('');
    this.editForm = {
      employeeId: item ? String(item.employeeId) : '',
      sscNumber: item?.category === 'social_security' ? (item.referenceNumber || '') : '',
      registrationDate: item?.category === 'social_security' && item.issueDate ? this.asDateInput(item.issueDate) : '',
      sscStatus: item?.category === 'social_security' ? (item.status === 'missing' ? 'pending' : 'registered') : 'registered',
      workPermitNumber: item?.category === 'work_permit' ? (item.referenceNumber || '') : '',
      workPermitIssueDate: item?.category === 'work_permit' && item.issueDate ? this.asDateInput(item.issueDate) : '',
      workPermitExpiryDate: item?.category === 'work_permit' && item.expiryDate ? this.asDateInput(item.expiryDate) : '',
      workPermitCategory: '',
      residencyNumber: '',
      residencyType: '',
      residencyExpiry: '',
      passportNumber: '',
      passportExpiry: '',
      passportCountry: '',
      healthCertificateNumber: item?.category === 'health_certificate' ? (item.referenceNumber || '') : '',
      healthIssueDate: item?.category === 'health_certificate' && item.issueDate ? this.asDateInput(item.issueDate) : '',
      healthExpiryDate: item?.category === 'health_certificate' && item.expiryDate ? this.asDateInput(item.expiryDate) : '',
      healthStatus: 'valid',
      healthIssuedBy: '',
      criminalReferenceNumber: item?.category === 'criminal_record' ? (item.referenceNumber || '') : '',
      criminalIssueDate: item?.category === 'criminal_record' && item.issueDate ? this.asDateInput(item.issueDate) : '',
      criminalExpiryDate: item?.category === 'criminal_record' && item.expiryDate ? this.asDateInput(item.expiryDate) : '',
      notes: item?.notes || ''
    };
    this.editModalOpen.set(true);
  }

  openCreateModalFor(category: ComplianceCategory, item?: any) {
    this.activeTab.set(category);
    this.openCreateModal(item);
  }

  closeCreateModal() {
    this.editModalOpen.set(false);
    this.editSaving.set(false);
    this.editError.set('');
  }

  saveComplianceRecord() {
    if (this.editSaving()) return;
    if (!this.editForm.employeeId) {
      this.editError.set(this.lang === 'ar' ? 'يرجى اختيار الموظف.' : 'Please choose an employee.');
      return;
    }

    const employeeId = Number(this.editForm.employeeId);
    const category = this.activeTab();
    let request$;

    if (category === 'social_security') {
      if (!this.editForm.registrationDate && this.editForm.sscStatus === 'registered') {
        this.editError.set(this.lang === 'ar' ? 'يرجى إدخال تاريخ التسجيل.' : 'Registration date is required.');
        return;
      }
      request$ = this.api.put(`/api/compliance/employees/${employeeId}/social-security`, {
        sscNumber: this.editForm.sscNumber || null,
        registrationDate: this.editForm.registrationDate || null,
        status: this.editForm.sscStatus,
        notes: this.editForm.notes || null
      });
    } else if (category === 'work_permit') {
      if (!this.editForm.workPermitNumber || !this.editForm.workPermitExpiryDate) {
        this.editError.set(this.lang === 'ar' ? 'رقم التصريح وتاريخ الانتهاء مطلوبان.' : 'Permit number and expiry date are required.');
        return;
      }
      request$ = this.api.put(`/api/compliance/employees/${employeeId}/work-permit`, {
        workPermitNumber: this.editForm.workPermitNumber,
        issueDate: this.editForm.workPermitIssueDate || null,
        expiryDate: this.editForm.workPermitExpiryDate || null,
        category: this.editForm.workPermitCategory || null,
        residencyNumber: this.editForm.residencyNumber || null,
        residencyType: this.editForm.residencyType || null,
        residencyExpiry: this.editForm.residencyExpiry || null,
        passportNumber: this.editForm.passportNumber || null,
        passportExpiry: this.editForm.passportExpiry || null,
        passportCountry: this.editForm.passportCountry || null,
        notes: this.editForm.notes || null
      });
    } else if (category === 'health_certificate') {
      if (!this.editForm.healthCertificateNumber || !this.editForm.healthExpiryDate) {
        this.editError.set(this.lang === 'ar' ? 'رقم الشهادة وتاريخ الانتهاء مطلوبان.' : 'Certificate number and expiry date are required.');
        return;
      }
      request$ = this.api.put(`/api/compliance/employees/${employeeId}/health-certificate`, {
        certificateNumber: this.editForm.healthCertificateNumber,
        issueDate: this.editForm.healthIssueDate || null,
        expiryDate: this.editForm.healthExpiryDate || null,
        status: this.editForm.healthStatus,
        issuedBy: this.editForm.healthIssuedBy || null,
        notes: this.editForm.notes || null
      });
    } else {
      if (!this.editForm.criminalReferenceNumber || !this.editForm.criminalExpiryDate) {
        this.editError.set(this.lang === 'ar' ? 'رقم المرجع وتاريخ الانتهاء مطلوبان.' : 'Reference number and expiry date are required.');
        return;
      }
      request$ = this.api.put(`/api/compliance/employees/${employeeId}/criminal-record`, {
        referenceNumber: this.editForm.criminalReferenceNumber,
        issueDate: this.editForm.criminalIssueDate || null,
        expiryDate: this.editForm.criminalExpiryDate || null,
        notes: this.editForm.notes || null
      });
    }

    this.editSaving.set(true);
    this.editError.set('');
    request$.subscribe({
      next: () => {
        this.editSaving.set(false);
        this.closeCreateModal();
        this.toast.success(this.lang === 'ar' ? 'تم حفظ بيانات الامتثال.' : 'Compliance record saved.');
        this.loadDashboard();
        this.loadItems();
        if (this.employeeDetailOpen() && this.employeeDetail()?.employee?.id) {
          this.openEmployeeCompliance(this.employeeDetail().employee.id);
        }
      },
      error: error => {
        this.editSaving.set(false);
        this.editError.set(getErrorMessage(error, this.lang === 'ar' ? 'تعذر حفظ البيانات.' : 'Failed to save compliance data.'));
        this.toast.error(this.editError());
      }
    });
  }

  resetFilters() {
    this.searchTerm.set('');
    this.employeeFilter.set('');
    this.orgUnitFilter.set('');
    this.nationalityFilter.set('');
    this.statusFilter.set('');
    this.expiringWithinFilter.set('');
  }

  exportReport() {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.api.get<any>('/api/compliance/export').subscribe({
      next: response => {
        this.exporting.set(false);
        const rows = response.data ?? [];
        const reportHtml = `
          <html dir="${this.lang === 'ar' ? 'rtl' : 'ltr'}" lang="${this.lang}">
            <head>
              <title>${this.lang === 'ar' ? 'تقرير الامتثال' : 'Compliance report'}</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 24px; color: #172420; }
                h1 { margin: 0 0 18px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #dbe5df; padding: 10px; text-align: start; }
                th { background: #f1f8f4; }
              </style>
            </head>
            <body>
              <h1>${this.lang === 'ar' ? 'تقرير الامتثال' : 'Compliance report'}</h1>
              <table>
                <thead>
                  <tr>
                    <th>${this.lang === 'ar' ? 'الموظف' : 'Employee'}</th>
                    <th>${this.lang === 'ar' ? 'الوحدة' : 'Org Unit'}</th>
                    <th>${this.lang === 'ar' ? 'الجنسية' : 'Nationality'}</th>
                    <th>${this.lang === 'ar' ? 'عدد المفقود/المنتهي' : 'Missing / expired count'}</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.map((row: any) => `
                    <tr>
                      <td>${this.lang === 'ar' ? row.employeeNameAr : row.employeeNameEn}</td>
                      <td>${this.orgUnitLabel(row) || '—'}</td>
                      <td>${row.nationality ?? '—'}</td>
                      <td>${row.missingOrExpiredCount}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </body>
          </html>`;

        const popup = window.open('', '_blank', 'width=980,height=760');
        if (popup) {
          popup.document.open();
          popup.document.write(reportHtml);
          popup.document.close();
          popup.focus();
          popup.print();
        }
      },
      error: error => {
        this.exporting.set(false);
        this.toast.error(getErrorMessage(error, this.lang === 'ar' ? 'تعذر تصدير تقرير الامتثال.' : 'Failed to export compliance report.'));
      }
    });
  }

  employeeLabel(item: any) {
    return this.lang === 'ar' ? item.employeeNameAr : item.employeeNameEn;
  }

  orgUnitLabel(item: any) {
    return (this.lang === 'ar' ? item.orgNodeNameAr : item.orgNodeNameEn)
      || item.orgNodeNameAr
      || item.orgNodeNameEn
      || (this.lang === 'ar' ? item.departmentAr : item.departmentEn)
      || item.departmentAr
      || item.departmentEn
      || '';
  }

  itemLabel(item: any) {
    return this.lang === 'ar' ? item.labelAr : item.labelEn;
  }

  statusLabel(status: ComplianceStatus) {
    const map: Record<ComplianceStatus, { ar: string; en: string }> = {
      valid: { ar: 'ساري', en: 'Valid' },
      expiring_soon: { ar: 'ينتهي قريباً', en: 'Expiring soon' },
      expired: { ar: 'منتهي', en: 'Expired' },
      missing: { ar: 'مفقود', en: 'Missing' }
    };
    const label = map[status];
    return this.lang === 'ar' ? label.ar : label.en;
  }

  statusClass(status: ComplianceStatus) {
    if (status === 'valid') return 'badge-success';
    if (status === 'expiring_soon') return 'badge-warning';
    if (status === 'expired' || status === 'missing') return 'badge-danger';
    return 'badge-secondary';
  }

  alertSummary(alert: any) {
    if (alert.daysRemaining == null) {
      return this.lang === 'ar' ? 'إجراء مطلوب الآن' : 'Action required now';
    }
    if (alert.daysRemaining < 0) {
      return this.lang === 'ar' ? `منتهي منذ ${Math.abs(alert.daysRemaining)} يوم` : `Expired ${Math.abs(alert.daysRemaining)} days ago`;
    }
    return this.lang === 'ar' ? `${alert.daysRemaining} يوم متبقي` : `${alert.daysRemaining} days left`;
  }

  itemDaysLabel(item: any) {
    if (item.daysRemaining == null) return '—';
    if (item.daysRemaining < 0) return this.lang === 'ar' ? `منتهي` : 'Expired';
    return this.lang === 'ar' ? `${item.daysRemaining} يوم` : `${item.daysRemaining} days`;
  }

  statusWeight(status: string) {
    if (status === 'missing') return 4;
    if (status === 'expired') return 3;
    if (status === 'expiring_soon') return 2;
    return 1;
  }

  portalLink(type: 'social' | 'health') {
    return type === 'social'
      ? this.settings().social_security_portal_url || this.overview()?.links?.socialSecurityPortalUrl
      : this.settings().ministry_of_health_portal_url || this.overview()?.links?.ministryOfHealthPortalUrl;
  }

  onSettingsChange(key: keyof ReturnType<typeof this.settings>) {
    return (value: string) => this.settings.set({ ...this.settings(), [key]: value });
  }

  currentTabLabel() {
    const tab = this.tabOptions.find(item => item.key === this.activeTab());
    return this.lang === 'ar' ? tab?.ar : tab?.en;
  }

  private asDateInput(value: string) {
    return String(value).slice(0, 10);
  }
}
