import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { RoleAccessService } from '../../core/services/role-access.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog.component';
import { SkeletonKpiCardsComponent } from '../../shared/components/skeleton/skeleton-kpi-cards.component';
import { SkeletonTableComponent } from '../../shared/components/skeleton/skeleton-table.component';
import { getErrorMessage } from '../../core/utils/error-message';

@Component({
  selector: 'app-assets',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, DecimalPipe, ConfirmDialogComponent, SkeletonKpiCardsComponent, SkeletonTableComponent],
  templateUrl: './assets.component.html',
  styleUrl: './assets.component.scss'
})
export class AssetsComponent implements OnInit {
  readonly allAssets = signal<any[]>([]);
  readonly filteredAssets = signal<any[]>([]);
  readonly categories = signal<any[]>([]);
  readonly employees = signal<any[]>([]);
  readonly summary = signal<any | null>(null);
  readonly detail = signal<any | null>(null);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly assigning = signal(false);
  readonly returning = signal(false);
  readonly actionLoading = signal(false);
  readonly requestingReturn = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
  readonly assignError = signal('');
  readonly returnError = signal('');

  readonly formOpen = signal(false);
  readonly assignOpen = signal(false);
  readonly returnOpen = signal(false);
  readonly detailOpen = signal(false);
  readonly retireTarget = signal<any | null>(null);
  readonly editingId = signal<number | null>(null);
  readonly selectedAsset = signal<any | null>(null);

  searchTerm = '';
  filterStatus = '';
  filterCategory = '';
  filterCondition = '';
  filterAssignment = '';
  filterOrgUnit = '';
  longLeaveOnly = false;

  form = this.emptyForm();
  assignForm = this.emptyAssignForm();
  returnForm = this.emptyReturnForm();

  readonly departments = computed(() =>
    Array.from(
      new Set(
        this.allAssets()
          .flatMap(asset => [asset.assignedOrgNodeNameAr, asset.assignedOrgNodeNameEn, asset.assignedDepartmentAr, asset.assignedDepartmentEn])
          .filter(Boolean)
      )
    )
  );

  constructor(
    public auth: AuthService,
    private access: RoleAccessService,
    private api: ApiService,
    private toast: ToastService,
    private router: Router
  ) {}

  get lang() {
    return this.auth.lang;
  }

  get canManage() {
    return this.access.isAny('hradmin', 'superadmin');
  }

  get isEmployee() {
    return this.access.isEmployee();
  }

  get canViewScopedAssets() {
    return this.access.isAny('manager', 'employee', 'payrolladmin');
  }

  ngOnInit() {
    this.loadAll();
  }

  t(ar: string, en: string) {
    return this.lang === 'ar' ? ar : en;
  }

  hasActiveFilters() {
    return !!(
      this.searchTerm.trim() ||
      this.filterStatus ||
      this.filterCategory ||
      this.filterCondition ||
      (!this.isEmployee && this.filterAssignment) ||
      (!this.isEmployee && this.filterOrgUnit) ||
      (!this.isEmployee && this.longLeaveOnly)
    );
  }

  applyFilters() {
    const search = this.searchTerm.trim().toLowerCase();
    const filtered = this.allAssets().filter(asset => {
      const haystack = [
        asset.assetNameAr,
        asset.assetNameEn,
        asset.serialNumber,
        asset.supplier,
        this.isEmployee ? '' : asset.assignedToNameAr,
        this.isEmployee ? '' : asset.assignedToNameEn,
        this.isEmployee ? '' : asset.assignedEmployeeCode,
        this.isEmployee ? '' : asset.assignedOrgNodeNameAr,
        this.isEmployee ? '' : asset.assignedOrgNodeNameEn,
        this.isEmployee ? '' : asset.assignedDepartmentAr,
        this.isEmployee ? '' : asset.assignedDepartmentEn
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = !search || haystack.includes(search);
      const matchesStatus = !this.filterStatus || asset.currentStatus === this.filterStatus;
      const matchesCategory = !this.filterCategory || String(asset.categoryId) === String(this.filterCategory);
      const matchesCondition = !this.filterCondition || String(asset.currentCondition || asset.condition || '').toLowerCase() === this.filterCondition;
      const matchesAssignment =
        !this.filterAssignment ||
        (this.filterAssignment === 'assigned' && asset.currentStatus === 'assigned') ||
        (this.filterAssignment === 'unassigned' && asset.currentStatus !== 'assigned');
      const matchesDepartment =
        !this.filterOrgUnit ||
        asset.assignedOrgNodeNameAr === this.filterOrgUnit ||
        asset.assignedOrgNodeNameEn === this.filterOrgUnit ||
        asset.assignedDepartmentAr === this.filterOrgUnit ||
        asset.assignedDepartmentEn === this.filterOrgUnit;
      const matchesLongLeave = !this.longLeaveOnly || !!asset.employeeOnLongLeave;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesCategory &&
        matchesCondition &&
        matchesAssignment &&
        matchesDepartment &&
        matchesLongLeave
      );
    });

    this.filteredAssets.set(filtered);
  }

  loadAll() {
    this.loadAssets();
    this.loadSummary();
    this.loadCategories();
    if (this.canManage) this.loadEmployees();
  }

  loadAssets() {
    this.loading.set(true);
    this.error.set('');
    this.api.get<any>(this.isEmployee ? '/api/employee/assets' : '/api/assets').subscribe({
      next: response => {
        this.allAssets.set(response.data ?? []);
        this.applyFilters();
        this.loading.set(false);
      },
      error: error => {
        this.error.set(getErrorMessage(error, this.t('تعذر تحميل الأصول.', 'Failed to load assets.')));
        this.filteredAssets.set([]);
        this.loading.set(false);
      }
    });
  }

  loadSummary() {
    this.api.get<any>(this.isEmployee ? '/api/employee/assets/summary' : '/api/assets/summary').subscribe({
      next: response => this.summary.set(response.data ?? null),
      error: () => this.summary.set(null)
    });
  }

  loadCategories() {
    this.api.get<any>('/api/lookups/asset-categories').subscribe({
      next: response => this.categories.set(response.data ?? []),
      error: () => this.categories.set([])
    });
  }

  loadEmployees() {
    this.api.get<any>('/api/employees?status=active').subscribe({
      next: response => this.employees.set(response.data ?? []),
      error: () => this.employees.set([])
    });
  }

  resetFilters() {
    this.searchTerm = '';
    this.filterStatus = '';
    this.filterCategory = '';
    this.filterCondition = '';
    if (!this.isEmployee) {
      this.filterAssignment = '';
      this.filterOrgUnit = '';
      this.longLeaveOnly = false;
    }
    this.applyFilters();
  }

  confirmReceive(asset: any) {
    if (!this.isEmployee || this.actionLoading()) return;
    this.actionLoading.set(true);
    this.api.post(`/api/employee/assets/${asset.id}/confirm-receive`, {}).subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.toast.success(this.t('تم تأكيد الاستلام.', 'Receive confirmed.'));
        this.loadAll();
      },
      error: error => {
        this.actionLoading.set(false);
        this.toast.error(getErrorMessage(error, this.t('تعذر تأكيد الاستلام.', 'Failed to confirm receive.')));
      }
    });
  }

  requestReturn(asset: any) {
    if (!this.isEmployee || this.requestingReturn()) return;
    this.requestingReturn.set(true);
    this.api.post(`/api/employee/assets/${asset.id}/request-return`, {
      returnDate: new Date().toISOString().slice(0, 10),
      notes: this.t('طلب إرجاع من الموظف.', 'Return requested by employee.')
    }).subscribe({
      next: () => {
        this.requestingReturn.set(false);
        this.toast.success(this.t('تم إرسال طلب الإرجاع للموارد البشرية.', 'Return request sent to HR.'));
        this.loadAll();
      },
      error: error => {
        this.requestingReturn.set(false);
        this.toast.error(getErrorMessage(error, this.t('تعذر إرسال طلب الإرجاع.', 'Failed to request return.')));
      }
    });
  }

  openCreateModal() {
    this.editingId.set(null);
    this.form = this.emptyForm();
    this.formError.set('');
    this.formOpen.set(true);
  }

  openEditModal(asset: any) {
    this.editingId.set(asset.id);
    this.form = {
      assetNameAr: asset.assetNameAr ?? '',
      assetNameEn: asset.assetNameEn ?? '',
      categoryId: asset.categoryId ?? 0,
      serialNumber: asset.serialNumber ?? '',
      barcode: asset.barcode ?? '',
      purchaseDate: asset.purchaseDate ? String(asset.purchaseDate).slice(0, 10) : '',
      purchaseValue: asset.purchaseValue ?? 0,
      supplier: asset.supplier ?? '',
      currentStatus: asset.currentStatus ?? 'available',
      condition: asset.currentCondition ?? 'good',
      notes: asset.notes ?? ''
    };
    this.formError.set('');
    this.formOpen.set(true);
  }

  closeForm() {
    if (this.saving()) return;
    this.formOpen.set(false);
    this.formError.set('');
  }

  saveAsset() {
    if (this.saving()) return;
    this.formError.set('');

    if (!this.form.assetNameAr.trim() || !this.form.categoryId) {
      this.formError.set(this.t('يرجى تعبئة الحقول المطلوبة.', 'Please complete the required fields.'));
      return;
    }

    this.saving.set(true);

    const payload = {
      assetNameAr: this.form.assetNameAr.trim(),
      assetNameEn: this.form.assetNameEn.trim() || null,
      categoryId: Number(this.form.categoryId),
      serialNumber: this.form.serialNumber.trim() || null,
      barcode: this.form.barcode.trim() || null,
      purchaseDate: this.form.purchaseDate || null,
      purchaseValue: Number(this.form.purchaseValue || 0),
      supplier: this.form.supplier.trim() || null,
      currentStatus: this.form.currentStatus,
      condition: this.form.condition,
      notes: this.form.notes.trim() || null
    };

    const request$ = this.editingId()
      ? this.api.put(`/api/assets/${this.editingId()}`, payload)
      : this.api.post('/api/assets', payload);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.toast.success(this.t('تم حفظ الأصل بنجاح.', 'Asset saved successfully.'));
        this.loadAll();
      },
      error: error => {
        this.saving.set(false);
        const message = getErrorMessage(error, this.t('تعذر حفظ الأصل.', 'Failed to save asset.'));
        this.formError.set(message);
        this.toast.error(message);
      }
    });
  }

  openAssignModal(asset: any) {
    if (asset.currentStatus === 'assigned') {
      this.toast.warning(this.t('الأصل معيّن بالفعل.', 'This asset is already assigned.'));
      return;
    }

    this.selectedAsset.set(asset);
    this.assignForm = this.emptyAssignForm();
    this.assignError.set('');
    this.assignOpen.set(true);
  }

  closeAssignModal() {
    if (this.assigning()) return;
    this.assignOpen.set(false);
    this.assignError.set('');
  }

  submitAssign() {
    const asset = this.selectedAsset();
    if (!asset || this.assigning()) return;

    this.assignError.set('');
    if (!this.assignForm.employeeId) {
      this.assignError.set(this.t('يرجى اختيار الموظف.', 'Please select an employee.'));
      return;
    }

    this.assigning.set(true);
    this.api.post(`/api/assets/${asset.id}/assign`, {
      employeeId: Number(this.assignForm.employeeId),
      assignedDate: this.assignForm.assignedDate || null,
      expectedReturnDate: this.assignForm.expectedReturnDate || null,
      condition: this.assignForm.condition,
      notes: this.assignForm.notes.trim() || null
    }).subscribe({
      next: () => {
        this.assigning.set(false);
        this.assignOpen.set(false);
        this.toast.success(this.t('تم تعيين الأصل بنجاح.', 'Asset assigned successfully.'));
        this.loadAll();
      },
      error: error => {
        this.assigning.set(false);
        const message = getErrorMessage(error, this.t('تعذر تعيين الأصل.', 'Failed to assign asset.'));
        this.assignError.set(message);
        this.toast.error(message);
      }
    });
  }

  openReturnModal(asset: any) {
    this.selectedAsset.set(asset);
    this.returnForm = this.emptyReturnForm();
    this.returnError.set('');
    this.returnOpen.set(true);
  }

  closeReturnModal() {
    if (this.returning()) return;
    this.returnOpen.set(false);
    this.returnError.set('');
  }

  submitReturn() {
    const asset = this.selectedAsset();
    if (!asset || this.returning()) return;

    this.returnError.set('');
    this.returning.set(true);

    this.api.post(`/api/assets/${asset.id}/return`, {
      returnDate: this.returnForm.returnDate || null,
      condition: this.returnForm.condition,
      notes: this.returnForm.notes.trim() || null,
      isLost: this.returnForm.condition === 'lost',
      deductionAmount: this.returnForm.deductionAmount || null
    }).subscribe({
      next: () => {
        this.returning.set(false);
        this.returnOpen.set(false);
        this.toast.success(this.t('تمت إعادة الأصل بنجاح.', 'Asset returned successfully.'));
        this.loadAll();
      },
      error: error => {
        this.returning.set(false);
        const message = getErrorMessage(error, this.t('تعذر إعادة الأصل.', 'Failed to return asset.'));
        this.returnError.set(message);
        this.toast.error(message);
      }
    });
  }

  promptRetire(asset: any) {
    this.retireTarget.set(asset);
  }

  cancelRetire() {
    if (this.actionLoading()) return;
    this.retireTarget.set(null);
  }

  confirmRetire() {
    const asset = this.retireTarget();
    if (!asset || this.actionLoading()) return;

    this.actionLoading.set(true);
    this.api.post(`/api/assets/${asset.id}/retire`, {
      status: 'retired',
      notes: this.t('تمت أرشفة الأصل من شاشة الأصول.', 'Asset retired from the assets screen.')
    }).subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.retireTarget.set(null);
        this.toast.success(this.t('تمت أرشفة الأصل.', 'Asset retired.'));
        this.loadAll();
      },
      error: error => {
        this.actionLoading.set(false);
        this.toast.error(getErrorMessage(error, this.t('تعذر أرشفة الأصل.', 'Failed to retire asset.')));
      }
    });
  }

  openDetails(asset: any) {
    this.detail.set(null);
    this.detailOpen.set(true);
    this.api.get<any>(`/api/assets/${asset.id}`).subscribe({
      next: response => this.detail.set(response.data ?? null),
      error: error => {
        this.detailOpen.set(false);
        this.toast.error(getErrorMessage(error, this.t('تعذر تحميل تفاصيل الأصل.', 'Failed to load asset details.')));
      }
    });
  }

  closeDetails() {
    this.detailOpen.set(false);
  }

  exportReport() {
    this.api.get<any>('/api/assets/export', this.filterStatus ? { status: this.filterStatus } : {}).subscribe({
      next: response => {
        const items = response.data ?? [];
        const popup = window.open('', '_blank', 'width=1100,height=760');
        if (!popup) return;

        popup.document.write(`
          <html dir="${this.lang === 'ar' ? 'rtl' : 'ltr'}" lang="${this.lang}">
          <head>
            <title>${this.t('تقرير الأصول', 'Assets report')}</title>
            <style>
              body{font-family:Segoe UI,Tahoma,sans-serif;padding:28px;color:#111}
              table{width:100%;border-collapse:collapse;margin-top:16px}
              th,td{border:1px solid #d6d6d6;padding:10px;text-align:start}
              th{background:#f4f7f5}
            </style>
          </head>
          <body>
            <h1>${this.t('تقرير الأصول', 'Assets report')}</h1>
            <table>
              <thead>
                <tr>
                  <th>${this.t('الأصل', 'Asset')}</th>
                  <th>${this.t('الفئة', 'Category')}</th>
                  <th>${this.t('الرقم التسلسلي', 'Serial')}</th>
                  <th>${this.t('الحالة', 'Status')}</th>
                  <th>${this.t('الموظف', 'Employee')}</th>
                  <th>${this.t('القيمة', 'Value')}</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item: any) => `
                  <tr>
                    <td>${this.assetName(item)}</td>
                    <td>${this.categoryName(item)}</td>
                    <td>${item.serialNumber || '—'}</td>
                    <td>${this.assetStatusLabel(item.currentStatus)}</td>
                    <td>${this.assignedEmployee(item)}</td>
                    <td>${Number(item.currentValue || item.purchaseValue || 0).toFixed(3)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </body>
          </html>
        `);
        popup.document.close();
        popup.print();
      },
      error: error => {
        this.toast.error(getErrorMessage(error, this.t('تعذر تصدير تقرير الأصول.', 'Failed to export assets report.')));
      }
    });
  }

  printAssetSlip(asset: any, mode: 'handover' | 'return') {
    const popup = window.open('', '_blank', 'width=960,height=760');
    if (!popup) return;

    popup.document.write(`
      <html dir="${this.lang === 'ar' ? 'rtl' : 'ltr'}" lang="${this.lang}">
      <head>
        <title>${mode === 'handover' ? this.t('نموذج تسليم أصل', 'Asset handover form') : this.t('إيصال إرجاع أصل', 'Asset return receipt')}</title>
        <style>
          body{font-family:Segoe UI,Tahoma,sans-serif;padding:28px;color:#111}
          .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 18px}
          .row{display:grid;gap:4px}
          .label{font-size:12px;color:#666}
          .signatures{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px;padding-top:28px}
          .sig{border-top:1px solid #bbb;padding-top:10px;min-height:50px}
        </style>
      </head>
      <body>
        <h1>${mode === 'handover' ? this.t('نموذج تسليم أصل', 'Asset handover form') : this.t('إيصال إرجاع أصل', 'Asset return receipt')}</h1>
        <div class="grid">
          <div class="row"><div class="label">${this.t('الأصل', 'Asset')}</div><strong>${this.assetName(asset)}</strong></div>
          <div class="row"><div class="label">${this.t('الفئة', 'Category')}</div><strong>${this.categoryName(asset)}</strong></div>
          <div class="row"><div class="label">${this.t('الرقم التسلسلي', 'Serial')}</div><strong>${asset.serialNumber || '—'}</strong></div>
          <div class="row"><div class="label">${this.t('الموظف', 'Employee')}</div><strong>${this.assignedEmployee(asset)}</strong></div>
          <div class="row"><div class="label">${this.t('التاريخ', 'Date')}</div><strong>${asset.assignedDate || asset.expectedReturnDate || '—'}</strong></div>
          <div class="row"><div class="label">${this.t('الحالة / الشرط', 'Status / condition')}</div><strong>${this.conditionLabel(asset.currentCondition || asset.conditionOnAssign)}</strong></div>
        </div>
        <div class="signatures">
          <div class="sig">${this.t('توقيع الموارد البشرية', 'HR signature')}</div>
          <div class="sig">${this.t('توقيع الموظف', 'Employee signature')}</div>
        </div>
      </body></html>
    `);
    popup.document.close();
    popup.print();
  }

  openEmployeeProfile(asset: any) {
    if (!asset.assignedToEmployeeId) return;
    this.router.navigate(['/app/employees', asset.assignedToEmployeeId]);
  }

  assetName(asset: any) {
    return this.lang === 'ar' ? asset.assetNameAr : (asset.assetNameEn || asset.assetNameAr);
  }

  categoryName(asset: any) {
    return this.lang === 'ar' ? asset.categoryNameAr : (asset.categoryNameEn || asset.categoryNameAr);
  }

  assignedEmployee(asset: any) {
    if (!asset.assignedToNameAr && !asset.assignedToNameEn) return '—';
    return this.lang === 'ar' ? asset.assignedToNameAr : (asset.assignedToNameEn || asset.assignedToNameAr);
  }

  statusLabel(status: string) {
    const map: Record<string, [string, string]> = {
      available: ['متاح', 'Available'],
      assigned: ['مُعيّن', 'Assigned'],
      pending_return: ['بانتظار الإرجاع', 'Pending return'],
      maintenance: ['قيد الصيانة', 'Under maintenance'],
      returned: ['تمت الإعادة', 'Returned'],
      retired: ['متقاعد', 'Retired'],
      disposed: ['تم التخلص منه', 'Disposed'],
      damaged: ['تالف', 'Damaged'],
      lost: ['مفقود', 'Lost']
    };
    return this.t(...(map[status] ?? [status, status]));
  }

  assetStatusLabel(status: string) {
    return this.statusLabel(status);
  }

  assetStatusClass(status: string) {
    const map: Record<string, string> = {
      available: 'success',
      assigned: 'info',
      pending_return: 'warning',
      maintenance: 'warning',
      returned: 'neutral',
      retired: 'neutral',
      disposed: 'neutral',
      damaged: 'danger',
      lost: 'danger'
    };
    return `z-badge ${map[status] ?? 'neutral'}`;
  }

  conditionLabel(condition?: string) {
    const normalized = (condition || 'good').toLowerCase();
    const map: Record<string, [string, string]> = {
      new: ['جديد', 'New'],
      good: ['جيد', 'Good'],
      damaged: ['متضرر', 'Damaged'],
      lost: ['مفقود', 'Lost']
    };
    return this.t(...(map[normalized] ?? [condition || '—', condition || '—']));
  }

  emptyForm() {
    return {
      assetNameAr: '',
      assetNameEn: '',
      categoryId: 0,
      serialNumber: '',
      barcode: '',
      purchaseDate: '',
      purchaseValue: 0,
      supplier: '',
      currentStatus: 'available',
      condition: 'new',
      notes: ''
    };
  }

  emptyAssignForm() {
    return {
      employeeId: 0,
      assignedDate: new Date().toISOString().slice(0, 10),
      expectedReturnDate: '',
      condition: 'good',
      notes: ''
    };
  }

  emptyReturnForm() {
    return {
      returnDate: new Date().toISOString().slice(0, 10),
      condition: 'good',
      notes: '',
      deductionAmount: 0
    };
  }
}
