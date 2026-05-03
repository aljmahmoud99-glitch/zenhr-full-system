import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { SkeletonKpiCardsComponent } from '../../shared/components/skeleton/skeleton-kpi-cards.component';
import { SkeletonTableComponent } from '../../shared/components/skeleton/skeleton-table.component';
import { ConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog.component';
import { getErrorMessage } from '../../core/utils/error-message';
import { openPrintDoc } from '../../core/utils/print-doc.util';

interface ClearanceRow {
  id: number;
  employeeId: number;
  employeeCode: string;
  employeeNameAr: string;
  departmentAr: string;
  terminationReason: string;
  clearanceStatus: string;
  salary: number;
  yearsOfService: number;
  gratuity: number;
  finalSettlementAmount: number;
  leaveBalanceCompensation: number;
  pendingSalary: number;
  penalties: number;
  advances: number;
  additions: number;
  deductions: number;
  pendingAssetsCount?: number;
}

interface Calculation {
  salary: number;
  yearsOfService: number;
  gratuity: number;
  leaveBalanceCompensation: number;
  pendingSalary: number;
  penalties: number;
  advances: number;
  additions: number;
  deductions: number;
  finalSettlement: number;
}

@Component({
  selector: 'app-clearance',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, SkeletonKpiCardsComponent, SkeletonTableComponent, ConfirmDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .clearance-page { display: grid; gap: 24px; }
    .header-actions, .table-actions, .modal-actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .filters-head, .table-toolbar, .modal-head, .detail-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    .summary-grid, .details-grid, .calc-grid, .form-grid { display: grid; gap: 16px; }
    .summary-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .form-grid.two-col, .details-grid, .calc-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .field, .metric-card, .calc-card, .detail-card { display: grid; gap: 8px; }
    .field-full { grid-column: 1 / -1; }
    .metric-card, .calc-card, .detail-card, .print-sheet { padding: 18px; border: 1px solid var(--z-border); border-radius: 18px; background: rgba(247,250,248,.9); }
    .metric-value { font-size: 28px; font-weight: 800; line-height: 1; }
    .metric-label, .muted { color: var(--z-text-secondary); }
    .modal-overlay { position: fixed; inset: 0; background: rgba(8, 18, 14, 0.34); display: grid; place-items: center; padding: 24px; z-index: 90; }
    .modal-panel { width: min(100%, 960px); max-height: min(90vh, 920px); overflow: auto; border-radius: 28px; background: rgba(255,255,255,.98); box-shadow: 0 32px 80px rgba(12, 29, 22, 0.16); border: 1px solid rgba(206, 217, 210, 0.9); padding: 24px; display: grid; gap: 20px; }
    .table-scroll { overflow-x: auto; }
    .row-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
    .empty-state { padding: 28px; display: grid; gap: 8px; place-items: center; text-align: center; color: var(--z-text-secondary); }
    .print-sheet { display: grid; gap: 18px; background: #fff; color: #111; }
    .print-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 18px; }
    .print-row { display: grid; gap: 4px; }
    .print-label { font-size: 12px; color: #666; }
    .signature-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; padding-top: 24px; }
    .signature-box { border-top: 1px solid #bbb; padding-top: 10px; min-height: 52px; }
    @media (max-width: 1100px) {
      .summary-grid, .form-grid.two-col, .details-grid, .calc-grid, .print-grid, .signature-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 760px) {
      .summary-grid, .form-grid.two-col, .details-grid, .calc-grid, .print-grid, .signature-row { grid-template-columns: 1fr; }
      .filters-head, .table-toolbar, .modal-head, .detail-head { flex-direction: column; }
      .modal-panel { padding: 18px; }
    }
  `],
  template: `
  <section class="z-page clearance-page" [attr.dir]="lang === 'ar' ? 'rtl' : 'ltr'" [attr.lang]="lang">
    <header class="z-page-header">
      <div>
        <h1 class="z-title">{{ t('نهاية الخدمة / براءة الذمة', 'End of Service / Clearance') }}</h1>
        <p class="z-body">{{ t('إدارة احتساب مكافأة نهاية الخدمة والتسوية النهائية ضمن مسار واضح وقابل للطباعة.', 'Manage end-of-service benefits and final settlement in a structured printable workflow.') }}</p>
      </div>
      <div class="header-actions">
        <button class="z-btn-primary" type="button" (click)="openCreateModal()">{{ t('إنشاء براءة ذمة', 'Create Clearance') }}</button>
      </div>
    </header>

    <div class="alert alert-danger" *ngIf="error()">{{ error() }}</div>

    <app-skeleton-kpi-cards *ngIf="loading()" [count]="4" />

    <section class="summary-grid" *ngIf="!loading()">
      <article class="z-card metric-card"><div class="metric-value">{{ clearances().length }}</div><div class="metric-label">{{ t('السجلات', 'Records') }}</div></article>
      <article class="z-card metric-card"><div class="metric-value">{{ pendingCount() }}</div><div class="metric-label">{{ t('قيد التنفيذ', 'Pending') }}</div></article>
      <article class="z-card metric-card"><div class="metric-value">{{ completedCount() }}</div><div class="metric-label">{{ t('مكتملة', 'Completed') }}</div></article>
      <article class="z-card metric-card"><div class="metric-value">{{ totalFinalSettlement() | number:'1.3-3' }}</div><div class="metric-label">{{ t('إجمالي التسويات', 'Total Settlements') }}</div></article>
    </section>

    <section class="z-table-container">
      <div class="table-toolbar">
        <div>
          <h2 class="z-heading">{{ t('سجل براءات الذمة', 'Clearance Register') }}</h2>
          <p class="z-small">{{ t('السجلات الحالية مع تفاصيل الخدمة والتسوية.', 'Current records with service and settlement details.') }}</p>
        </div>
      </div>

      <app-skeleton-table *ngIf="loading()" [rows]="8" [cols]="9" />

      <div class="empty-state" *ngIf="!loading() && clearances().length === 0">
        <span class="material-icons">fact_check</span>
        <div>{{ t('لا توجد سجلات براءة ذمة حالياً.', 'No clearance records yet.') }}</div>
      </div>

      <div class="table-scroll" *ngIf="!loading() && clearances().length > 0">
        <table class="z-table">
          <thead>
            <tr>
              <th>{{ t('الموظف', 'Employee') }}</th>
              <th>{{ t('القسم', 'Department') }}</th>
              <th>{{ t('سنوات الخدمة', 'Years of Service') }}</th>
              <th>{{ t('الراتب', 'Salary') }}</th>
              <th>{{ t('المكافأة', 'Gratuity') }}</th>
              <th>{{ t('التسوية النهائية', 'Final Settlement') }}</th>
              <th>{{ t('الحالة', 'Status') }}</th>
              <th>{{ t('الإجراءات', 'Actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of clearances()">
              <td>
                <strong>{{ row.employeeNameAr }}</strong>
                <div class="muted">{{ row.employeeCode }}</div>
              </td>
              <td>{{ row.departmentAr || '—' }}</td>
              <td>{{ row.yearsOfService | number:'1.2-2' }}</td>
              <td>{{ row.salary | number:'1.3-3' }}</td>
              <td>{{ row.gratuity | number:'1.3-3' }}</td>
              <td>{{ row.finalSettlementAmount | number:'1.3-3' }}</td>
              <td><span [class]="statusBadge(row.clearanceStatus)">{{ statusLabel(row.clearanceStatus) }}</span></td>
              <td>
                <div class="row-actions">
                  <button class="z-btn-secondary" type="button" (click)="openDetails(row)">{{ t('عرض', 'View') }}</button>
                  <button class="z-btn-secondary" type="button" (click)="printClearance(row)">{{ t('طباعة', 'Print') }}</button>
                  <button class="z-btn-primary" type="button" *ngIf="row.clearanceStatus !== 'completed'" (click)="openCompleteDialog(row)">{{ t('إتمام', 'Complete') }}</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div class="modal-overlay" *ngIf="createModalOpen()" (click)="closeCreateModal()">
      <section class="modal-panel" (click)="$event.stopPropagation()">
        <div class="modal-head">
          <div>
            <h2 class="z-heading">{{ t('إنشاء براءة ذمة', 'Create Clearance') }}</h2>
            <p class="z-small">{{ t('اختر الموظف وسيتم احتساب البيانات تلقائياً.', 'Select the employee and the settlement will be calculated automatically.') }}</p>
          </div>
          <button class="z-btn-secondary" type="button" (click)="closeCreateModal()">{{ t('إغلاق', 'Close') }}</button>
        </div>

        <div class="form-grid two-col">
          <label class="field">
            <span class="z-label">{{ t('الموظف', 'Employee') }}</span>
            <select class="z-input" [(ngModel)]="form.employeeId" (ngModelChange)="onEmployeeChange()">
              <option [ngValue]="0">{{ t('اختر الموظف', 'Select employee') }}</option>
              <option *ngFor="let e of employees()" [ngValue]="e.id">{{ e.fullNameAr }} ({{ e.employeeCode }})</option>
            </select>
          </label>
          <label class="field">
            <span class="z-label">{{ t('سبب إنهاء الخدمة', 'Termination reason') }}</span>
            <select class="z-input" [(ngModel)]="form.terminationReason" (ngModelChange)="refreshCalculation()">
              <option value="resignation">{{ t('استقالة', 'Resignation') }}</option>
              <option value="termination">{{ t('إنهاء من الشركة', 'Termination') }}</option>
              <option value="contract_end">{{ t('انتهاء العقد', 'Contract End') }}</option>
              <option value="retirement">{{ t('تقاعد', 'Retirement') }}</option>
            </select>
          </label>
          <label class="field field-full">
            <span class="z-label">{{ t('ملاحظات', 'Notes') }}</span>
            <textarea class="z-input" rows="4" [(ngModel)]="form.hrNotes"></textarea>
          </label>
        </div>

        <div class="calc-grid" *ngIf="calculation() as calc">
          <article class="calc-card"><span class="z-label">{{ t('سنوات الخدمة', 'Years of Service') }}</span><strong>{{ calc.yearsOfService | number:'1.2-2' }}</strong></article>
          <article class="calc-card"><span class="z-label">{{ t('الراتب', 'Salary') }}</span><strong>{{ calc.salary | number:'1.3-3' }}</strong></article>
          <article class="calc-card"><span class="z-label">{{ t('مكافأة نهاية الخدمة', 'Gratuity') }}</span><strong>{{ calc.gratuity | number:'1.3-3' }}</strong></article>
          <article class="calc-card"><span class="z-label">{{ t('بدل رصيد الإجازات', 'Leave balance compensation') }}</span><strong>{{ calc.leaveBalanceCompensation | number:'1.3-3' }}</strong></article>
          <article class="calc-card"><span class="z-label">{{ t('الراتب المستحق', 'Pending salary') }}</span><strong>{{ calc.pendingSalary | number:'1.3-3' }}</strong></article>
          <article class="calc-card"><span class="z-label">{{ t('الإضافات', 'Additions') }}</span><strong>{{ calc.additions | number:'1.3-3' }}</strong></article>
          <article class="calc-card"><span class="z-label">{{ t('الخصومات / العقوبات', 'Penalties') }}</span><strong>{{ calc.penalties | number:'1.3-3' }}</strong></article>
          <article class="calc-card"><span class="z-label">{{ t('السلف', 'Advances') }}</span><strong>{{ calc.advances | number:'1.3-3' }}</strong></article>
          <article class="calc-card"><span class="z-label">{{ t('إجمالي الخصومات', 'Total deductions') }}</span><strong>{{ calc.deductions | number:'1.3-3' }}</strong></article>
          <article class="calc-card"><span class="z-label">{{ t('صافي التسوية النهائية', 'Final settlement') }}</span><strong>{{ calc.finalSettlement | number:'1.3-3' }}</strong></article>
        </div>

        <div class="z-card" *ngIf="createPendingAssets().length > 0">
          <div class="z-card-header">
            <div>
              <h3 class="z-heading">{{ t('أصول بانتظار الإرجاع', 'Assets pending return') }}</h3>
              <p class="z-small">{{ t('لا يمكن إتمام براءة الذمة إلا بعد إرجاع هذه الأصول.', 'Clearance cannot be completed until these assets are returned.') }}</p>
            </div>
          </div>
          <div class="table-scroll">
            <table class="z-table">
              <thead>
                <tr>
                  <th>{{ t('الأصل', 'Asset') }}</th>
                  <th>{{ t('الرقم التسلسلي', 'Serial') }}</th>
                  <th>{{ t('الفئة', 'Category') }}</th>
                  <th>{{ t('تاريخ التعيين', 'Assigned date') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let asset of createPendingAssets()">
                  <td>{{ asset.assetNameAr }}</td>
                  <td>{{ asset.serialNumber || '—' }}</td>
                  <td>{{ asset.categoryNameAr || '—' }}</td>
                  <td>{{ asset.assignedDate ? (asset.assignedDate | date:'dd/MM/yyyy') : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="alert alert-danger" *ngIf="formError">{{ formError }}</div>

        <div class="modal-actions">
          <button class="z-btn-secondary" type="button" (click)="closeCreateModal()">{{ t('إلغاء', 'Cancel') }}</button>
          <button class="z-btn-primary" type="button" (click)="submit()" [disabled]="submitting">
            {{ submitting ? t('جارٍ الحفظ...', 'Saving...') : t('حفظ', 'Save') }}
          </button>
        </div>
      </section>
    </div>

    <div class="modal-overlay" *ngIf="detailsModalOpen()" (click)="closeDetails()">
      <section class="modal-panel" (click)="$event.stopPropagation()">
        <div class="detail-head">
          <div>
            <h2 class="z-heading">{{ selectedClearance()?.employee?.nameAr || selectedClearanceRow()?.employeeNameAr }}</h2>
            <p class="z-small">{{ selectedClearance()?.employee?.employeeCode || selectedClearanceRow()?.employeeCode }} · {{ statusLabel(selectedClearance()?.clearanceStatus || selectedClearanceRow()?.clearanceStatus || '') }}</p>
          </div>
          <div class="table-actions">
            <button class="z-btn-secondary" type="button" (click)="printClearance(selectedClearance() || selectedClearanceRow())">{{ t('طباعة', 'Print') }}</button>
            <button class="z-btn-secondary" type="button" (click)="closeDetails()">{{ t('إغلاق', 'Close') }}</button>
          </div>
        </div>

        <div class="details-grid" *ngIf="selectedClearance() as detail">
          <article class="detail-card"><span class="z-label">{{ t('القسم', 'Department') }}</span><strong>{{ detail.employee?.departmentAr || '—' }}</strong></article>
          <article class="detail-card"><span class="z-label">{{ t('سبب الإنهاء', 'Termination reason') }}</span><strong>{{ reasonLabel(detail.terminationReason) }}</strong></article>
          <article class="detail-card"><span class="z-label">{{ t('سنوات الخدمة', 'Years of Service') }}</span><strong>{{ detail.calculation?.yearsOfService | number:'1.2-2' }}</strong></article>
          <article class="detail-card"><span class="z-label">{{ t('الراتب', 'Salary') }}</span><strong>{{ detail.calculation?.salary | number:'1.3-3' }}</strong></article>
          <article class="detail-card"><span class="z-label">{{ t('المكافأة', 'Gratuity') }}</span><strong>{{ detail.calculation?.gratuity | number:'1.3-3' }}</strong></article>
          <article class="detail-card"><span class="z-label">{{ t('صافي التسوية', 'Final settlement') }}</span><strong>{{ detail.calculation?.finalSettlement | number:'1.3-3' }}</strong></article>
          <article class="detail-card"><span class="z-label">{{ t('بدل الإجازات', 'Leave compensation') }}</span><strong>{{ detail.calculation?.leaveBalanceCompensation | number:'1.3-3' }}</strong></article>
          <article class="detail-card"><span class="z-label">{{ t('الراتب المستحق', 'Pending salary') }}</span><strong>{{ detail.calculation?.pendingSalary | number:'1.3-3' }}</strong></article>
          <article class="detail-card"><span class="z-label">{{ t('العقوبات', 'Penalties') }}</span><strong>{{ detail.calculation?.penalties | number:'1.3-3' }}</strong></article>
          <article class="detail-card"><span class="z-label">{{ t('السلف', 'Advances') }}</span><strong>{{ detail.calculation?.advances | number:'1.3-3' }}</strong></article>
          <article class="detail-card field-full"><span class="z-label">{{ t('ملاحظات', 'Notes') }}</span><strong>{{ detail.hrNotes || '—' }}</strong></article>
        </div>

        <div class="z-card" *ngIf="selectedClearance()?.pendingAssets?.length">
          <div class="z-card-header">
            <div>
              <h3 class="z-heading">{{ t('الأصول المعلقة', 'Pending assets') }}</h3>
              <p class="z-small">{{ t('يجب إرجاع هذه الأصول قبل إتمام براءة الذمة.', 'These assets must be returned before clearance can be completed.') }}</p>
            </div>
          </div>
          <div class="table-scroll">
            <table class="z-table">
              <thead>
                <tr>
                  <th>{{ t('الأصل', 'Asset') }}</th>
                  <th>{{ t('الرقم التسلسلي', 'Serial') }}</th>
                  <th>{{ t('الفئة', 'Category') }}</th>
                  <th>{{ t('تاريخ التعيين', 'Assigned date') }}</th>
                  <th>{{ t('الإرجاع المتوقع', 'Expected return') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let asset of selectedClearance()?.pendingAssets">
                  <td>{{ asset.assetNameAr }}</td>
                  <td>{{ asset.serialNumber || '—' }}</td>
                  <td>{{ asset.categoryNameAr || '—' }}</td>
                  <td>{{ asset.assignedDate ? (asset.assignedDate | date:'dd/MM/yyyy') : '—' }}</td>
                  <td>{{ asset.expectedReturnDate ? (asset.expectedReturnDate | date:'dd/MM/yyyy') : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>

    <app-confirm-dialog
      [open]="completeDialogOpen()"
      [title]="t('إتمام براءة الذمة', 'Complete clearance')"
      [message]="t('هل تريد تعليم براءة الذمة كمكتملة؟', 'Do you want to mark this clearance as completed?')"
      [confirmLabel]="t('إتمام', 'Complete')"
      [cancelLabel]="t('إلغاء', 'Cancel')"
      [loading]="actionLoading()"
      [tone]="'primary'"
      (confirm)="submitComplete()"
      (cancel)="closeCompleteDialog()"
    />
  </section>
  `
})
export class ClearanceComponent implements OnInit {
  clearances = signal<ClearanceRow[]>([]);
  employees = signal<any[]>([]);
  selectedClearance = signal<any | null>(null);
  selectedClearanceRow = signal<ClearanceRow | null>(null);
  calculation = signal<Calculation | null>(null);
  createPendingAssets = signal<any[]>([]);
  loading = signal(true);
  error = signal('');
  createModalOpen = signal(false);
  detailsModalOpen = signal(false);
  completeDialogOpen = signal(false);
  pendingCompleteId = signal<number | null>(null);
  actionLoading = signal(false);
  submitting = false;
  formError = '';

  form = { employeeId: 0, terminationReason: 'resignation', hrNotes: '' };

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  get lang() { return this.auth.lang; }

  ngOnInit() {
    this.load();
    this.api.get<any>('/api/employees?status=active').subscribe({ next: r => this.employees.set(r.data || []) });
  }

  t(ar: string, en: string) { return this.lang === 'ar' ? ar : en; }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.api.get<any>('/api/clearance').subscribe({
      next: r => {
        this.clearances.set(r.data || []);
        this.loading.set(false);
      },
      error: error => {
        this.loading.set(false);
        this.error.set(getErrorMessage(error, this.t('تعذر تحميل براءات الذمة.', 'Failed to load clearance records.')));
      }
    });
  }

  pendingCount() { return this.clearances().filter(c => c.clearanceStatus !== 'completed').length; }
  completedCount() { return this.clearances().filter(c => c.clearanceStatus === 'completed').length; }
  totalFinalSettlement() { return this.clearances().reduce((sum, row) => sum + Number(row.finalSettlementAmount || 0), 0); }

  openCreateModal() {
    this.form = { employeeId: 0, terminationReason: 'resignation', hrNotes: '' };
    this.calculation.set(null);
    this.createPendingAssets.set([]);
    this.formError = '';
    this.createModalOpen.set(true);
  }

  closeCreateModal() {
    if (!this.submitting) this.createModalOpen.set(false);
  }

  onEmployeeChange() {
    this.refreshCalculation();
    this.loadPendingAssetsForCreate();
  }

  refreshCalculation() {
    this.formError = '';
    if (!this.form.employeeId) {
      this.calculation.set(null);
      return;
    }
    this.api.get<any>(`/api/clearance/calculate-eosb/${this.form.employeeId}`, { reason: this.form.terminationReason }).subscribe({
      next: r => this.calculation.set(r.data || null),
      error: error => {
        this.calculation.set(null);
        this.toast.error(getErrorMessage(error, this.t('تعذر احتساب التسوية.', 'Failed to calculate settlement.')));
      }
    });
  }

  loadPendingAssetsForCreate() {
    if (!this.form.employeeId) {
      this.createPendingAssets.set([]);
      return;
    }
    this.api.get<any>('/api/assets', { employeeId: this.form.employeeId, status: 'assigned' }).subscribe({
      next: response => this.createPendingAssets.set(response.data ?? []),
      error: () => this.createPendingAssets.set([])
    });
  }

  submit() {
    if (this.submitting) return;
    this.formError = '';
    if (!this.form.employeeId) {
      this.formError = this.t('يرجى اختيار الموظف.', 'Please select an employee.');
      return;
    }
    if (!this.calculation()) {
      this.formError = this.t('يرجى الانتظار حتى اكتمال الاحتساب.', 'Please wait for calculation to complete.');
      return;
    }

    this.submitting = true;
    this.api.post<any>('/api/clearance', { ...this.form }).subscribe({
      next: () => {
        this.submitting = false;
        this.createModalOpen.set(false);
        this.toast.success(this.t('تم إنشاء براءة الذمة بنجاح.', 'Clearance created successfully.'));
        this.load();
      },
      error: error => {
        this.submitting = false;
        this.formError = getErrorMessage(error, this.t('تعذر إنشاء براءة الذمة.', 'Failed to create clearance.'));
        this.toast.error(this.formError);
      }
    });
  }

  openDetails(row: ClearanceRow) {
    this.selectedClearanceRow.set(row);
    this.api.get<any>(`/api/clearance/${row.id}`).subscribe({
      next: r => {
        this.selectedClearance.set(r.data || null);
        this.detailsModalOpen.set(true);
      },
      error: error => {
        this.toast.error(getErrorMessage(error, this.t('تعذر تحميل تفاصيل براءة الذمة.', 'Failed to load clearance details.')));
      }
    });
  }

  closeDetails() {
    this.detailsModalOpen.set(false);
  }

  openCompleteDialog(row: ClearanceRow) {
    if ((row.pendingAssetsCount || 0) > 0) {
      this.toast.warning(this.t('لا يمكن إتمام براءة الذمة مع وجود أصول معلقة.', 'Clearance cannot be completed while assets are still pending return.'));
      return;
    }
    this.pendingCompleteId.set(row.id);
    this.completeDialogOpen.set(true);
  }

  closeCompleteDialog() {
    if (!this.actionLoading()) this.completeDialogOpen.set(false);
  }

  submitComplete() {
    const id = this.pendingCompleteId();
    if (!id || this.actionLoading()) return;
    this.actionLoading.set(true);
    this.api.put<any>(`/api/clearance/${id}`, { clearanceStatus: 'completed' }).subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.completeDialogOpen.set(false);
        this.pendingCompleteId.set(null);
        this.toast.success(this.t('تم إتمام براءة الذمة.', 'Clearance completed.'));
        this.load();
        if (this.selectedClearance()?.id === id) {
          this.openDetails(this.clearances().find(c => c.id === id) || this.selectedClearanceRow()!);
        }
      },
      error: error => {
        this.actionLoading.set(false);
        this.toast.error(getErrorMessage(error, this.t('تعذر إتمام براءة الذمة.', 'Failed to complete clearance.')));
      }
    });
  }

  printClearance(source: any) {
    if (!source?.employee && source?.id) {
      this.api.get<any>(`/api/clearance/${source.id}`).subscribe({
        next: r => this.printClearance(r.data),
        error: error => this.toast.error(getErrorMessage(error, this.t('تعذر تحميل بيانات الطباعة.', 'Failed to load print data.')))
      });
      return;
    }

    const detail = source;
    if (!detail) return;

    const fmt3 = (v: any) => `${Number(v ?? 0).toFixed(3)} JOD`;
    const calc = detail.calculation ?? {};

    const gratuity = Number(calc.gratuity ?? detail.gratuity ?? 0);
    const leaveComp = Number(calc.leaveBalanceCompensation ?? detail.leaveBalanceCompensation ?? 0);
    const pendingSalary = Number(calc.pendingSalary ?? detail.pendingSalary ?? 0);
    const additions = Number(calc.additions ?? detail.additions ?? 0);
    const deductions = Number(calc.deductions ?? detail.deductions ?? 0);
    const advances = Number(calc.advances ?? detail.advances ?? 0);
    const penalties = Number(calc.penalties ?? detail.penalties ?? 0);
    const finalSettlement = Number(calc.finalSettlement ?? detail.finalSettlementAmount ?? 0);

    openPrintDoc({
      lang: this.lang as 'ar' | 'en',
      docType: 'CLEAR',
      title: this.t('نموذج براءة ذمة / نهاية خدمة', 'End of Service / Clearance Form'),
      subtitle: this.statusLabel(detail.clearanceStatus || detail.status || ''),
      fields: [
        { label: this.t('الموظف', 'Employee'), value: detail.employee?.nameAr || detail.employee?.fullNameAr || detail.employeeNameAr || '—' },
        { label: this.t('الرمز الوظيفي', 'Employee Code'), value: detail.employee?.employeeCode || detail.employeeCode || '—' },
        { label: this.t('القسم', 'Department'), value: detail.employee?.departmentAr || detail.departmentAr || '—' },
        { label: this.t('سبب إنهاء الخدمة', 'Termination Reason'), value: this.reasonLabel(detail.terminationReason) },
        { label: this.t('الراتب الأساسي', 'Basic Salary'), value: fmt3(calc.salary ?? detail.salary) },
        { label: this.t('سنوات الخدمة', 'Years of Service'), value: Number(calc.yearsOfService ?? detail.yearsOfService ?? 0).toFixed(2) },
        { label: this.t('مكافأة نهاية الخدمة', 'End-of-Service Gratuity'), value: fmt3(gratuity) },
        { label: this.t('بدل رصيد الإجازات', 'Leave Balance Compensation'), value: fmt3(leaveComp) },
        { label: this.t('الراتب المستحق', 'Pending Salary'), value: fmt3(pendingSalary) },
        { label: this.t('إضافات أخرى', 'Other Additions'), value: fmt3(additions) },
        { label: this.t('الخصومات', 'Deductions'), value: fmt3(deductions) },
        { label: this.t('السلف', 'Advances'), value: fmt3(advances) },
        { label: this.t('الغرامات', 'Penalties'), value: fmt3(penalties) },
      ],
      notes: detail.hrNotes || undefined,
      summaryLabel: this.t('التسوية النهائية', 'Final Settlement Amount'),
      summaryValue: fmt3(finalSettlement),
      signatures: [
        { label: this.t('توقيع مدير الموارد البشرية', 'HR Manager Signature') },
        { label: this.t('توقيع المدير المالي', 'Finance Director Signature') },
        { label: this.t('توقيع الموظف / إقرار الاستلام', 'Employee Signature / Receipt Acknowledgement') },
      ],
    });
  }

  reasonLabel(reason: string) {
    const map: Record<string, [string, string]> = {
      resignation: ['استقالة', 'Resignation'],
      termination: ['إنهاء من الشركة', 'Termination'],
      contract_end: ['انتهاء العقد', 'Contract End'],
      retirement: ['تقاعد', 'Retirement']
    };
    return this.t(...(map[reason] ?? [reason, reason]));
  }

  statusLabel(status: string) {
    const map: Record<string, [string, string]> = {
      pending: ['قيد التنفيذ', 'Pending'],
      completed: ['مكتملة', 'Completed']
    };
    return this.t(...(map[status] ?? [status, status]));
  }

  statusBadge(status: string) {
    return status === 'completed' ? 'z-badge success' : 'z-badge warning';
  }
}
