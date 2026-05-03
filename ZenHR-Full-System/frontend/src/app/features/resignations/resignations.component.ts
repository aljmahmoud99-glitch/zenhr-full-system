import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { SkeletonKpiCardsComponent } from '../../shared/components/skeleton/skeleton-kpi-cards.component';
import { SkeletonTableComponent } from '../../shared/components/skeleton/skeleton-table.component';
import { ConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog.component';
import { RejectReasonDialogComponent } from '../../shared/components/ui/reject-reason-dialog.component';
import { getErrorMessage } from '../../core/utils/error-message';

type ViewMode = 'list' | 'create' | 'detail';
type DetailTab = 'overview' | 'approvals' | 'interview' | 'clearance' | 'settlement';

interface ResignationItem {
  id: number;
  employeeId: number;
  employeeCode: string;
  employeeNameAr: string;
  departmentAr: string;
  departmentEn?: string;
  departmentId?: number;
  orgNodeId?: number;
  orgNodeNameAr?: string;
  orgNodeNameEn?: string;
  orgNodeType?: string;
  jobTitleAr: string;
  resignationDate: string;
  lastWorkingDay: string;
  noticePeriodDays: number;
  noticeTimerStart: string;
  noticeTimerEnd: string;
  reason?: string;
  status: string;
  noticeProgress: number;
  currentApprovalStep?: number;
  currentApprovalLabel?: string;
  canCurrentUserApprove?: boolean;
  canCurrentUserReject?: boolean;
}

const STATUS_LABELS_AR: Record<string, string> = {
  pending: 'قيد المراجعة',
  hr_approved: 'اعتماد الموارد البشرية',
  manager_approved: 'اعتماد المدير',
  active_notice: 'اعتماد المالية / فترة الإشعار',
  clearance: 'إجراءات التسليم',
  completed: 'مكتملة',
  rejected: 'مرفوضة',
  withdrawn: 'مسحوبة'
};

const STATUS_LABELS_EN: Record<string, string> = {
  pending: 'Pending',
  hr_approved: 'HR Approved',
  manager_approved: 'Manager Approved',
  active_notice: 'Finance Approved / Notice',
  clearance: 'Clearance',
  completed: 'Completed',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn'
};

const STATUS_BADGES: Record<string, string> = {
  pending: 'z-badge warning',
  hr_approved: 'z-badge info',
  manager_approved: 'z-badge info',
  active_notice: 'z-badge success',
  clearance: 'z-badge neutral',
  completed: 'z-badge success',
  rejected: 'z-badge danger',
  withdrawn: 'z-badge neutral'
};

@Component({
  selector: 'app-resignations',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, SkeletonKpiCardsComponent, SkeletonTableComponent, ConfirmDialogComponent, RejectReasonDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .resignations-page { display: grid; gap: 24px; }
    .header-actions, .detail-actions, .action-stack { display: flex; gap: 12px; flex-wrap: wrap; }
    .kpi-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; }
    .filter-grid, .form-grid, .overview-grid { display: grid; gap: 16px; }
    .filter-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .form-grid.two-col, .overview-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .field, .info-card { display: grid; gap: 8px; }
    .field-full { grid-column: 1 / -1; }
    .row-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
    .table-toolbar, .filters-head, .detail-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    .detail-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
    .detail-tab { min-height: 38px; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--z-border); background: rgba(255,255,255,.96); color: var(--z-text-secondary); font-weight: 700; }
    .detail-tab.active { color: var(--z-emerald); border-color: rgba(47,157,105,.35); background: rgba(47,157,105,.12); }
    .approval-list, .section-stack { display: grid; gap: 14px; }
    .approval-card, .info-card, .print-sheet { padding: 18px; border: 1px solid var(--z-border); border-radius: 18px; background: rgba(247,250,248,.88); }
    .approval-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    .badge-row { display: flex; gap: 8px; flex-wrap: wrap; }
    .empty-state { padding: 24px; display: grid; gap: 8px; place-items: center; text-align: center; color: var(--z-text-secondary); }
    .muted { color: var(--z-text-muted); }
    .small { font-size: 12px; }
    .print-sheet { display: grid; gap: 18px; color: #111; background: white; }
    .print-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 18px; }
    .print-row { display: grid; gap: 4px; }
    @media (max-width: 1100px) {
      .kpi-grid, .filter-grid, .form-grid.two-col, .overview-grid, .print-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 720px) {
      .kpi-grid, .filter-grid, .form-grid.two-col, .overview-grid, .print-grid { grid-template-columns: 1fr; }
      .table-toolbar, .filters-head, .detail-head { flex-direction: column; }
    }
  `],
  template: `
  <section class="z-page resignations-page" [attr.dir]="lang === 'ar' ? 'rtl' : 'ltr'" [attr.lang]="lang">
    <header class="z-page-header">
      <div>
        <h1 class="z-title">{{ t('إدارة الاستقالات', 'Resignations') }}</h1>
        <p class="z-body">{{ t('إدارة طلبات الاستقالة والموافقات والتسليم والتسوية ضمن مسار واضح.', 'Manage resignation requests, approvals, clearance, and settlement in one workflow.') }}</p>
      </div>
      <div class="header-actions">
        <button class="z-btn-secondary" type="button" *ngIf="view() !== 'list'" (click)="backToList()">{{ t('رجوع', 'Back') }}</button>
        <button class="z-btn-primary" type="button" *ngIf="canCreate()" (click)="openCreate()" [disabled]="view() === 'create'">{{ t('تسجيل استقالة', 'Create Resignation') }}</button>
      </div>
    </header>

    <div class="alert alert-danger" *ngIf="error()">{{ error() }}</div>

    <ng-container *ngIf="view() === 'list'">
      <app-skeleton-kpi-cards *ngIf="loading()" [count]="5" />

      <section class="kpi-grid" *ngIf="!loading()">
        <article class="z-card z-kpi-card"><div class="metric-value">{{ stats().total || 0 }}</div><div class="metric-label">{{ t('الإجمالي', 'Total') }}</div></article>
        <article class="z-card z-kpi-card"><div class="metric-value">{{ stats().pending || 0 }}</div><div class="metric-label">{{ t('قيد المراجعة', 'Pending') }}</div></article>
        <article class="z-card z-kpi-card"><div class="metric-value">{{ stats().activeNotice || 0 }}</div><div class="metric-label">{{ t('فترة الإشعار', 'In Notice') }}</div></article>
        <article class="z-card z-kpi-card"><div class="metric-value">{{ stats().clearance || 0 }}</div><div class="metric-label">{{ t('التسليم', 'Clearance') }}</div></article>
        <article class="z-card z-kpi-card"><div class="metric-value">{{ stats().completed || 0 }}</div><div class="metric-label">{{ t('مكتملة', 'Completed') }}</div></article>
      </section>

      <section class="z-card">
        <div class="filters-head">
          <div>
            <h2 class="z-heading">{{ t('البحث والتصفية', 'Search & Filters') }}</h2>
            <p class="z-small">{{ t('ابحث بالموظف أو صفِّ حسب الحالة والوحدة والتاريخ.', 'Search by employee and filter by status, org unit, and date.') }}</p>
          </div>
          <div class="action-stack">
            <button class="z-btn-secondary" type="button" *ngIf="hasActiveFilters()" (click)="resetFilters()">{{ t('مسح الفلاتر', 'Reset') }}</button>
            <button class="z-btn-secondary" type="button" *ngIf="error()" (click)="reloadList()">{{ t('إعادة المحاولة', 'Retry') }}</button>
          </div>
        </div>

        <div class="filter-grid">
          <label class="field">
            <span class="z-label">{{ t('بحث', 'Search') }}</span>
            <input class="z-input" [(ngModel)]="filterSearch" (ngModelChange)="applyFilters()" [placeholder]="t('اسم الموظف أو الكود', 'Employee name or code')" />
          </label>
          <label class="field">
            <span class="z-label">{{ t('الحالة', 'Status') }}</span>
            <select class="z-input" [(ngModel)]="filterStatus" (ngModelChange)="applyFilters()">
              <option value="">{{ t('كل الحالات', 'All statuses') }}</option>
              <option *ngFor="let status of listStatuses" [value]="status">{{ statusLabel(status) }}</option>
            </select>
          </label>
          <label class="field">
            <span class="z-label">{{ t('الوحدة', 'Org Unit') }}</span>
            <select class="z-input" [(ngModel)]="filterDepartment" (ngModelChange)="applyFilters()">
              <option value="">{{ t('كل الوحدات', 'All org units') }}</option>
              <option *ngFor="let dept of departments()" [value]="dept">{{ dept }}</option>
            </select>
          </label>
          <label class="field">
            <span class="z-label">{{ t('تاريخ الاستقالة', 'Resignation date') }}</span>
            <input class="z-input" type="date" [(ngModel)]="filterDate" (ngModelChange)="applyFilters()" />
          </label>
        </div>
      </section>

      <section class="z-table-container">
        <div class="table-toolbar">
          <div>
            <h2 class="z-heading">{{ t('قائمة الاستقالات', 'Resignations List') }}</h2>
            <p class="z-small">{{ t(filteredResignations().length + ' سجل معروض', filteredResignations().length + ' records shown') }}</p>
          </div>
        </div>

        <app-skeleton-table *ngIf="loading()" [rows]="8" [cols]="8" />

        <div class="empty-state" *ngIf="!loading() && filteredResignations().length === 0">
          <span class="material-icons">logout</span>
          <div>{{ t('لا توجد استقالات مطابقة.', 'No matching resignations.') }}</div>
        </div>

        <div class="table-scroll" *ngIf="!loading() && filteredResignations().length > 0">
          <table class="z-table">
            <thead>
              <tr>
                <th>{{ t('الموظف', 'Employee') }}</th>
                <th>{{ t('الوحدة', 'Org Unit') }}</th>
                <th>{{ t('تاريخ الاستقالة', 'Resignation Date') }}</th>
                <th>{{ t('آخر يوم عمل', 'Last Working Day') }}</th>
                <th>{{ t('المرحلة الحالية', 'Current Stage') }}</th>
                <th>{{ t('الحالة', 'Status') }}</th>
                <th>{{ t('الإجراءات', 'Actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of filteredResignations()">
                <td>
                  <strong>{{ item.employeeNameAr }}</strong>
                  <div class="muted small">{{ item.employeeCode }} · {{ item.jobTitleAr || '—' }}</div>
                </td>
                <td>{{ orgUnitLabel(item) || '—' }}</td>
                <td>{{ item.resignationDate | date:'dd/MM/yyyy' }}</td>
                <td>{{ item.lastWorkingDay | date:'dd/MM/yyyy' }}</td>
                <td>{{ item.currentApprovalLabel || currentStageLabel(item) }}</td>
                <td><span [class]="statusBadge(item.status)">{{ statusLabel(item.status) }}</span></td>
                <td>
                  <div class="row-actions">
                    <button class="z-btn-secondary" type="button" (click)="openDetail(item.id)">{{ t('عرض', 'View') }}</button>
                    <button class="z-btn-primary" type="button" *ngIf="item.canCurrentUserApprove" (click)="openApproveDialog(item); $event.stopPropagation()" [disabled]="actionLoading()">{{ t('اعتماد', 'Approve') }}</button>
                    <button class="z-btn-danger" type="button" *ngIf="item.canCurrentUserReject" (click)="openRejectDialog(item); $event.stopPropagation()" [disabled]="actionLoading()">{{ t('رفض', 'Reject') }}</button>
                    <button class="z-btn-secondary" type="button" (click)="printResignation(item); $event.stopPropagation()">{{ t('طباعة', 'Print') }}</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </ng-container>

    <ng-container *ngIf="view() === 'create'">
      <section class="z-card">
        <div class="z-card-header">
          <div>
            <h2 class="z-heading">{{ t('تسجيل استقالة', 'Create resignation') }}</h2>
            <p class="z-small">{{ t('أدخل بيانات الاستقالة ثم احفظ الطلب.', 'Enter resignation details and submit the request.') }}</p>
          </div>
        </div>

        <div class="form-grid two-col">
          <label class="field" *ngIf="canSelectEmployee()">
            <span class="z-label">{{ t('الموظف', 'Employee') }}</span>
            <select class="z-input" [(ngModel)]="form.employeeId" (ngModelChange)="onEmployeeChange()">
              <option [ngValue]="0">{{ t('اختر الموظف', 'Select employee') }}</option>
              <option *ngFor="let e of employees()" [ngValue]="e.id">{{ e.fullNameAr }} ({{ e.employeeCode }})</option>
            </select>
          </label>
          <label class="field">
            <span class="z-label">{{ t('تاريخ الاستقالة', 'Resignation date') }}</span>
            <input class="z-input" type="date" [(ngModel)]="form.resignationDate" (ngModelChange)="calculateNotice()" />
          </label>
          <label class="field">
            <span class="z-label">{{ t('مدة الإشعار', 'Notice period days') }}</span>
            <input class="z-input" type="number" min="1" [(ngModel)]="form.noticePeriodDays" (ngModelChange)="calculateNotice()" />
          </label>
          <label class="field">
            <span class="z-label">{{ t('آخر يوم عمل', 'Last working day') }}</span>
            <input class="z-input" type="date" [(ngModel)]="form.lastWorkingDay" />
          </label>
          <label class="field field-full">
            <span class="z-label">{{ t('سبب الاستقالة', 'Reason') }}</span>
            <textarea class="z-input" rows="5" [(ngModel)]="form.reason"></textarea>
          </label>
        </div>

        <div class="alert alert-danger" *ngIf="formError">{{ formError }}</div>

        <div class="detail-actions">
          <button class="z-btn-secondary" type="button" (click)="backToList()">{{ t('إلغاء', 'Cancel') }}</button>
          <button class="z-btn-primary" type="button" (click)="submitResignation()" [disabled]="submitting">
            {{ submitting ? t('جارٍ الحفظ...', 'Saving...') : t('تقديم الاستقالة', 'Submit resignation') }}
          </button>
        </div>
      </section>
    </ng-container>

    <ng-container *ngIf="view() === 'detail' && detail() as d">
      <section class="z-card section-stack">
        <div class="detail-head">
          <div>
            <h2 class="z-heading">{{ d.employee.nameAr }}</h2>
            <div class="badge-row">
              <span class="z-badge neutral">{{ d.employee.code }}</span>
              <span [class]="statusBadge(d.status)">{{ statusLabel(d.status) }}</span>
              <span class="z-badge info">{{ currentStageLabel(d) }}</span>
            </div>
          </div>
          <div class="detail-actions">
            <button class="z-btn-secondary" type="button" (click)="printResignation(d)">{{ t('طباعة', 'Print') }}</button>
            <button class="z-btn-secondary" type="button" *ngIf="d.status === 'active_notice' && isHR()" (click)="startClearance()" [disabled]="actionLoading()">{{ t('بدء التسليم', 'Start clearance') }}</button>
            <button class="z-btn-primary" type="button" *ngIf="d.status === 'clearance' && isHR()" (click)="openCompleteDialog()" [disabled]="actionLoading()">{{ t('إنهاء الاستقالة', 'Complete resignation') }}</button>
          </div>
        </div>

        <div class="detail-tabs">
          <button class="detail-tab" [class.active]="detailTab() === 'overview'" (click)="detailTab.set('overview')">{{ t('نظرة عامة', 'Overview') }}</button>
          <button class="detail-tab" [class.active]="detailTab() === 'approvals'" (click)="detailTab.set('approvals')">{{ t('الموافقات', 'Approvals') }}</button>
          <button class="detail-tab" [class.active]="detailTab() === 'interview'" (click)="detailTab.set('interview')">{{ t('المقابلة', 'Interview') }}</button>
          <button class="detail-tab" [class.active]="detailTab() === 'clearance'" (click)="detailTab.set('clearance')">{{ t('التسليم', 'Clearance') }}</button>
          <button class="detail-tab" [class.active]="detailTab() === 'settlement'" (click)="detailTab.set('settlement')">{{ t('التسوية', 'Settlement') }}</button>
        </div>

        <div class="overview-grid" *ngIf="detailTab() === 'overview'">
          <article class="info-card"><span class="z-label">{{ t('الأصول المعلقة', 'Pending assets') }}</span><strong>{{ d.pendingAssetsCount || 0 }}</strong></article>
          <article class="info-card"><span class="z-label">{{ t('حالة الأصول', 'Asset return status') }}</span><strong>{{ (d.pendingAssetsCount || 0) > 0 ? t('أصول بانتظار الإرجاع', 'Assets pending return') : t('تم إرجاع كل الأصول', 'All assets returned') }}</strong></article>
          <article class="info-card"><span class="z-label">{{ t('الوحدة', 'Org Unit') }}</span><strong>{{ orgUnitLabel(d.employee) || '—' }}</strong></article>
          <article class="info-card"><span class="z-label">{{ t('المسمى الوظيفي', 'Job title') }}</span><strong>{{ d.employee.jobTitle || '—' }}</strong></article>
          <article class="info-card"><span class="z-label">{{ t('تاريخ الاستقالة', 'Resignation date') }}</span><strong>{{ d.resignationDate | date:'dd/MM/yyyy' }}</strong></article>
          <article class="info-card"><span class="z-label">{{ t('آخر يوم عمل', 'Last working day') }}</span><strong>{{ d.lastWorkingDay | date:'dd/MM/yyyy' }}</strong></article>
          <article class="info-card field-full"><span class="z-label">{{ t('السبب', 'Reason') }}</span><strong>{{ d.reason || '—' }}</strong></article>
        </div>

        <div class="approval-list" *ngIf="detailTab() === 'approvals'">
          <article class="approval-card" *ngFor="let approval of d.approvals">
            <div class="approval-head">
              <div>
                <h3 class="z-heading">{{ approval.stepLabel }}</h3>
                <div class="muted">{{ approval.approverRole }}</div>
                <div class="small muted" *ngIf="approval.notes">{{ approval.notes }}</div>
              </div>
              <div class="action-stack">
                <span [class]="approvalBadge(approval.decision)">{{ approvalLabel(approval.decision) }}</span>
                <button class="z-btn-primary" type="button" *ngIf="approval.canAct" (click)="openApproveDialog(d, approval)" [disabled]="actionLoading()">{{ t('اعتماد', 'Approve') }}</button>
                <button class="z-btn-danger" type="button" *ngIf="approval.canAct" (click)="openRejectDialog(d, approval)" [disabled]="actionLoading()">{{ t('رفض', 'Reject') }}</button>
              </div>
            </div>
          </article>
        </div>

        <div class="section-stack" *ngIf="detailTab() === 'interview'">
          <div class="form-grid two-col">
            <label class="field field-full"><span class="z-label">{{ t('سبب المغادرة', 'Leaving reason') }}</span><textarea class="z-input" rows="4" [(ngModel)]="interviewForm.leavingReason"></textarea></label>
            <label class="field field-full"><span class="z-label">{{ t('ملاحظات إضافية', 'Additional notes') }}</span><textarea class="z-input" rows="4" [(ngModel)]="interviewForm.companyFeedback"></textarea></label>
          </div>
          <div class="detail-actions">
            <button class="z-btn-primary" type="button" *ngIf="isHR()" (click)="saveInterview()" [disabled]="saving">
              {{ saving ? t('جارٍ الحفظ...', 'Saving...') : t('حفظ المقابلة', 'Save interview') }}
            </button>
          </div>
        </div>

        <div class="section-stack" *ngIf="detailTab() === 'clearance'">
          <div class="z-card" *ngIf="d.pendingAssets?.length">
            <div class="z-card-header">
              <div>
                <h3 class="z-heading">{{ t('الأصول بانتظار الإرجاع', 'Assets pending return') }}</h3>
                <p class="z-small">{{ t('يجب إرجاع هذه الأصول قبل إنهاء الاستقالة.', 'These assets must be returned before the resignation can be completed.') }}</p>
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
                  <tr *ngFor="let asset of d.pendingAssets">
                    <td>{{ asset.assetNameAr || asset.assetNameEn || '—' }}</td>
                    <td>{{ asset.serialNumber || '—' }}</td>
                    <td>{{ asset.categoryNameAr || asset.categoryNameEn || '—' }}</td>
                    <td>{{ asset.assignedDate ? (asset.assignedDate | date:'dd/MM/yyyy') : '—' }}</td>
                    <td>{{ asset.expectedReturnDate ? (asset.expectedReturnDate | date:'dd/MM/yyyy') : '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="detail-actions">
            <button class="z-btn-primary" type="button" *ngIf="isHR()" (click)="saveClearance()" [disabled]="saving">
              {{ saving ? t('جارٍ الحفظ...', 'Saving...') : t('حفظ التسليم', 'Save clearance') }}
            </button>
          </div>
          <div class="z-table-container" *ngIf="clearanceItems().length > 0">
            <table class="z-table">
              <thead>
                <tr>
                  <th>{{ t('البند', 'Item') }}</th>
                  <th>{{ t('الحالة', 'Status') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let item of clearanceItems()">
                  <td>{{ item.nameAr }}</td>
                  <td>
                    <select class="z-input" *ngIf="isHR()" [(ngModel)]="item.status">
                      <option value="pending">{{ t('معلق', 'Pending') }}</option>
                      <option value="done">{{ t('مكتمل', 'Done') }}</option>
                      <option value="na">{{ t('لا ينطبق', 'N/A') }}</option>
                    </select>
                    <span *ngIf="!isHR()">{{ item.status }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="empty-state" *ngIf="clearanceItems().length === 0">{{ t('لا توجد بنود تسليم.', 'No clearance items.') }}</div>
        </div>

        <div class="section-stack" *ngIf="detailTab() === 'settlement'">
          <div class="form-grid two-col">
            <label class="field"><span class="z-label">{{ t('الراتب المتبقي', 'Remaining salary') }}</span><input class="z-input" type="number" [(ngModel)]="settlement.remainingSalary" /></label>
            <label class="field"><span class="z-label">{{ t('بدل الإجازة', 'Leave payout') }}</span><input class="z-input" type="number" [(ngModel)]="settlement.leavePayout" /></label>
            <label class="field"><span class="z-label">{{ t('مكافأة نهاية الخدمة', 'EOSB') }}</span><input class="z-input" type="number" [(ngModel)]="settlement.eosbAmount" /></label>
            <label class="field"><span class="z-label">{{ t('تعويض الإشعار', 'Notice compensation') }}</span><input class="z-input" type="number" [(ngModel)]="settlement.noticeCompensation" /></label>
            <label class="field"><span class="z-label">{{ t('خصومات أخرى', 'Other deductions') }}</span><input class="z-input" type="number" [(ngModel)]="settlement.otherDeductions" /></label>
            <label class="field field-full"><span class="z-label">{{ t('ملاحظات التسوية', 'Settlement notes') }}</span><textarea class="z-input" rows="4" [(ngModel)]="settlement.settlementNotes"></textarea></label>
          </div>
          <div class="detail-actions">
            <button class="z-btn-primary" type="button" *ngIf="canEditSettlement()" (click)="saveSettlement()" [disabled]="saving">
              {{ saving ? t('جارٍ الحفظ...', 'Saving...') : t('حفظ التسوية', 'Save settlement') }}
            </button>
          </div>
        </div>
      </section>
    </ng-container>

    <app-confirm-dialog
      [open]="approveDialogOpen()"
      [title]="t('اعتماد المرحلة', 'Approve step')"
      [message]="t('هل تريد اعتماد هذه المرحلة؟', 'Do you want to approve this step?')"
      [confirmLabel]="t('اعتماد', 'Approve')"
      [cancelLabel]="t('إلغاء', 'Cancel')"
      [loading]="actionLoading()"
      [tone]="'primary'"
      (confirm)="submitApprove()"
      (cancel)="closeApproveDialog()"
    />

    <app-confirm-dialog
      [open]="completeDialogOpen()"
      [title]="t('إنهاء الاستقالة', 'Complete resignation')"
      [message]="t('هل تريد إنهاء هذه الاستقالة الآن؟', 'Do you want to complete this resignation now?')"
      [confirmLabel]="t('إنهاء', 'Complete')"
      [cancelLabel]="t('إلغاء', 'Cancel')"
      [loading]="actionLoading()"
      [tone]="'primary'"
      (confirm)="submitComplete()"
      (cancel)="closeCompleteDialog()"
    />

    <app-reject-reason-dialog
      [open]="rejectDialogOpen()"
      [title]="t('رفض المرحلة', 'Reject step')"
      [message]="t('يرجى إدخال سبب الرفض قبل المتابعة.', 'Please provide a rejection reason before continuing.')"
      [placeholder]="t('سبب الرفض', 'Rejection reason')"
      [confirmLabel]="t('رفض', 'Reject')"
      [cancelLabel]="t('إلغاء', 'Cancel')"
      [loading]="actionLoading()"
      [error]="rejectDialogError()"
      (confirm)="submitReject($event)"
      (cancel)="closeRejectDialog()"
    />
  </section>
  `
})
export class ResignationsComponent implements OnInit {
  view = signal<ViewMode>('list');
  detailTab = signal<DetailTab>('overview');

  allResignations = signal<ResignationItem[]>([]);
  filteredResignations = signal<ResignationItem[]>([]);
  departments = signal<string[]>([]);
  employees = signal<any[]>([]);
  stats = signal<any>({ total: 0, pending: 0, activeNotice: 0, clearance: 0, completed: 0 });
  detail = signal<any | null>(null);
  loading = signal(true);
  error = signal('');
  saving = false;
  submitting = false;
  formError = '';
  actionLoading = signal(false);

  approveDialogOpen = signal(false);
  completeDialogOpen = signal(false);
  rejectDialogOpen = signal(false);
  rejectDialogError = signal('');
  pendingApproval = signal<{ resignationId: number; step: number; stepLabel: string } | null>(null);

  filterSearch = '';
  filterStatus = '';
  filterDepartment = '';
  filterDate = '';
  readonly listStatuses = ['pending', 'hr_approved', 'manager_approved', 'active_notice', 'clearance', 'completed', 'rejected'];

  form = this.emptyForm();
  interviewForm = { leavingReason: '', companyFeedback: '', interviewDate: '' };
  settlement = { remainingSalary: 0, leavePayout: 0, eosbAmount: 0, noticeCompensation: 0, otherDeductions: 0, settlementNotes: '' };
  clearanceItemsLocal = signal<any[]>([]);

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() {
    this.reloadList();
    if (this.canSelectEmployee()) {
      this.api.get<any>('/api/employees?status=active').subscribe({ next: r => this.employees.set(r.data || []) });
    }
  }

  get lang() { return this.auth.lang; }
  isHR() { return this.auth.currentUser()?.role === 'hradmin'; }
  isManager() { return this.auth.currentUser()?.role === 'manager'; }
  isFinance() { return this.auth.currentUser()?.role === 'payrolladmin'; }
  canCreate() { return this.isHR() || this.auth.currentUser()?.role === 'employee'; }
  canSelectEmployee() { return this.isHR(); }
  canEditSettlement() { return this.isHR() || this.isFinance(); }

  t(ar: string, en: string) { return this.lang === 'ar' ? ar : en; }

  reloadList() {
    this.loadList();
    this.loadStats();
  }

  loadList() {
    this.loading.set(true);
    this.error.set('');
    this.api.get<any>('/api/resignations').subscribe({
      next: r => {
        const list = r.data || [];
        this.allResignations.set(list);
        this.departments.set(Array.from(new Set(list.map((item: ResignationItem) => this.orgUnitLabel(item)).filter(Boolean))));
        this.applyFilters();
        this.loading.set(false);
      },
      error: error => {
        this.loading.set(false);
        this.error.set(getErrorMessage(error, this.t('تعذر تحميل الاستقالات.', 'Failed to load resignations.')));
      }
    });
  }

  loadStats() {
    if (!(this.isHR() || this.isManager() || this.isFinance())) return;
    this.api.get<any>('/api/resignations/stats').subscribe({ next: r => this.stats.set(r.data || {}) });
  }

  applyFilters() {
    let list = [...this.allResignations()];
    const search = this.filterSearch.trim().toLowerCase();

    if (search) {
      list = list.filter(item =>
        [item.employeeNameAr, item.employeeCode, item.orgNodeNameAr, item.orgNodeNameEn, item.departmentAr, item.departmentEn, item.jobTitleAr]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(search)
      );
    }
    if (this.filterStatus) list = list.filter(item => item.status === this.filterStatus);
    if (this.filterDepartment) list = list.filter(item => this.orgUnitLabel(item) === this.filterDepartment);
    if (this.filterDate) list = list.filter(item => String(item.resignationDate).slice(0, 10) === this.filterDate);

    this.filteredResignations.set(list);
  }

  hasActiveFilters() {
    return !!(this.filterSearch || this.filterStatus || this.filterDepartment || this.filterDate);
  }

  resetFilters() {
    this.filterSearch = '';
    this.filterStatus = '';
    this.filterDepartment = '';
    this.filterDate = '';
    this.applyFilters();
  }

  orgUnitLabel(item: any) {
    return (this.lang === 'ar' ? item?.orgNodeNameAr : item?.orgNodeNameEn)
      || item?.orgNodeNameAr
      || item?.orgNodeNameEn
      || (this.lang === 'ar' ? item?.departmentAr : item?.departmentEn)
      || item?.departmentAr
      || item?.departmentEn
      || item?.department
      || '';
  }

  openCreate() {
    this.form = this.emptyForm();
    this.formError = '';
    this.view.set('create');
  }

  backToList() {
    this.view.set('list');
    this.detail.set(null);
    this.detailTab.set('overview');
    this.reloadList();
  }

  onEmployeeChange() {
    const employee = this.employees().find(e => e.id === Number(this.form.employeeId));
    if (employee?.noticePeriodDays) {
      this.form.noticePeriodDays = employee.noticePeriodDays;
    }
    this.calculateNotice();
  }

  calculateNotice() {
    if (!this.form.resignationDate || !this.form.noticePeriodDays) return;
    const date = new Date(this.form.resignationDate);
    date.setDate(date.getDate() + Number(this.form.noticePeriodDays));
    this.form.lastWorkingDay = date.toISOString().substring(0, 10);
  }

  submitResignation() {
    if (this.submitting) return;
    this.formError = '';

    if (this.canSelectEmployee() && !this.form.employeeId) {
      this.formError = this.t('يرجى اختيار الموظف.', 'Please select an employee.');
      return;
    }
    if (!this.form.resignationDate) {
      this.formError = this.t('يرجى تحديد تاريخ الاستقالة.', 'Please select the resignation date.');
      return;
    }
    if (!this.form.reason.trim()) {
      this.formError = this.t('يرجى إدخال سبب الاستقالة.', 'Please enter a resignation reason.');
      return;
    }

    this.submitting = true;
    this.api.post<any>('/api/resignations', {
      employeeId: Number(this.form.employeeId || 0),
      resignationDate: this.form.resignationDate,
      lastWorkingDay: this.form.lastWorkingDay || null,
      noticePeriodDays: Number(this.form.noticePeriodDays || 0),
      reason: this.form.reason.trim()
    }).subscribe({
      next: () => {
        this.submitting = false;
        this.toast.success(this.t('تم تسجيل الاستقالة بنجاح.', 'Resignation submitted successfully.'));
        this.view.set('list');
        this.reloadList();
      },
      error: error => {
        this.submitting = false;
        this.formError = getErrorMessage(error, this.t('تعذر تسجيل الاستقالة.', 'Failed to submit resignation.'));
        this.toast.error(this.formError);
      }
    });
  }

  openDetail(id: number) {
    this.error.set('');
    this.api.get<any>(`/api/resignations/${id}`).subscribe({
      next: r => {
        const d = r.data;
        this.detail.set(d);
        this.detailTab.set('overview');
        const interview = d.exitInterview || {};
        this.interviewForm = {
          leavingReason: interview.leavingReason || '',
          companyFeedback: interview.companyFeedback || '',
          interviewDate: interview.interviewDate ? String(interview.interviewDate).substring(0, 10) : new Date().toISOString().substring(0, 10)
        };
        const settlement = d.clearance || {};
        this.settlement = {
          remainingSalary: settlement.remainingSalary || 0,
          leavePayout: settlement.leavePayout || 0,
          eosbAmount: settlement.eosbAmount || 0,
          noticeCompensation: settlement.noticeCompensation || 0,
          otherDeductions: settlement.otherDeductions || 0,
          settlementNotes: settlement.settlementNotes || ''
        };
        try {
          this.clearanceItemsLocal.set(JSON.parse(d.clearance?.clearanceItemsJson || '[]'));
        } catch {
          this.clearanceItemsLocal.set([]);
        }
        this.view.set('detail');
      },
      error: error => {
        this.error.set(getErrorMessage(error, this.t('تعذر تحميل تفاصيل الاستقالة.', 'Failed to load resignation details.')));
      }
    });
  }

  currentStageLabel(item: any) {
    if (item.currentApprovalLabel) return item.currentApprovalLabel;
    return this.statusLabel(item.status);
  }

  statusLabel(status: string) {
    return this.lang === 'ar' ? (STATUS_LABELS_AR[status] ?? status) : (STATUS_LABELS_EN[status] ?? status);
  }

  statusBadge(status: string) {
    return STATUS_BADGES[status] ?? 'z-badge neutral';
  }

  approvalLabel(decision: string) {
    return decision === 'approved'
      ? this.t('معتمد', 'Approved')
      : decision === 'rejected'
        ? this.t('مرفوض', 'Rejected')
        : this.t('بانتظار القرار', 'Pending');
  }

  approvalBadge(decision: string) {
    return decision === 'approved' ? 'z-badge success' : decision === 'rejected' ? 'z-badge danger' : 'z-badge warning';
  }

  openApproveDialog(source: any, approval?: any) {
    if (this.actionLoading()) return;
    const step = approval?.approvalStep ?? source.currentApprovalStep;
    const stepLabel = approval?.stepLabel ?? source.currentApprovalLabel;
    if (!step) return;
    this.pendingApproval.set({ resignationId: source.id ?? this.detail()!.id, step, stepLabel });
    this.approveDialogOpen.set(true);
  }

  closeApproveDialog() {
    if (!this.actionLoading()) this.approveDialogOpen.set(false);
  }

  submitApprove() {
    const pending = this.pendingApproval();
    if (!pending || this.actionLoading()) return;
    this.actionLoading.set(true);
    this.api.put<any>(`/api/resignations/${pending.resignationId}/approve`, { step: pending.step, stepLabel: pending.stepLabel, notes: '' }).subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.approveDialogOpen.set(false);
        this.pendingApproval.set(null);
        this.toast.success(this.t('تم اعتماد المرحلة بنجاح.', 'Step approved successfully.'));
        this.afterActionRefresh(pending.resignationId);
      },
      error: error => {
        this.actionLoading.set(false);
        this.toast.error(getErrorMessage(error, this.t('تعذر اعتماد المرحلة.', 'Failed to approve step.')));
      }
    });
  }

  openRejectDialog(source: any, approval?: any) {
    if (this.actionLoading()) return;
    const step = approval?.approvalStep ?? source.currentApprovalStep;
    const stepLabel = approval?.stepLabel ?? source.currentApprovalLabel;
    if (!step) return;
    this.pendingApproval.set({ resignationId: source.id ?? this.detail()!.id, step, stepLabel });
    this.rejectDialogError.set('');
    this.rejectDialogOpen.set(true);
  }

  closeRejectDialog() {
    if (!this.actionLoading()) {
      this.rejectDialogOpen.set(false);
      this.rejectDialogError.set('');
    }
  }

  submitReject(reason: string) {
    const pending = this.pendingApproval();
    if (!pending || this.actionLoading()) return;
    const notes = reason.trim();
    if (!notes) {
      this.rejectDialogError.set(this.t('يرجى إدخال سبب الرفض.', 'Please provide a rejection reason.'));
      return;
    }
    this.actionLoading.set(true);
    this.api.put<any>(`/api/resignations/${pending.resignationId}/reject`, { step: pending.step, stepLabel: pending.stepLabel, notes }).subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.rejectDialogOpen.set(false);
        this.pendingApproval.set(null);
        this.toast.success(this.t('تم رفض المرحلة.', 'Step rejected.'));
        this.afterActionRefresh(pending.resignationId);
      },
      error: error => {
        this.actionLoading.set(false);
        const message = getErrorMessage(error, this.t('تعذر رفض المرحلة.', 'Failed to reject step.'));
        this.rejectDialogError.set(message);
        this.toast.error(message);
      }
    });
  }

  startClearance() {
    if (this.actionLoading()) return;
    this.actionLoading.set(true);
    this.api.put<any>(`/api/resignations/${this.detail()!.id}/start-clearance`, {}).subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.toast.success(this.t('تم بدء إجراءات التسليم.', 'Clearance process started.'));
        this.afterActionRefresh(this.detail()!.id);
      },
      error: error => {
        this.actionLoading.set(false);
        this.toast.error(getErrorMessage(error, this.t('تعذر بدء إجراءات التسليم.', 'Failed to start clearance.')));
      }
    });
  }

  openCompleteDialog() {
    if (!this.actionLoading()) this.completeDialogOpen.set(true);
  }

  closeCompleteDialog() {
    if (!this.actionLoading()) this.completeDialogOpen.set(false);
  }

  submitComplete() {
    if (this.actionLoading()) return;
    this.actionLoading.set(true);
    this.api.put<any>(`/api/resignations/${this.detail()!.id}/complete`, {}).subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.completeDialogOpen.set(false);
        this.toast.success(this.t('تم إنهاء الاستقالة بنجاح.', 'Resignation completed successfully.'));
        this.backToList();
      },
      error: error => {
        this.actionLoading.set(false);
        this.toast.error(getErrorMessage(error, this.t('تعذر إنهاء الاستقالة.', 'Failed to complete resignation.')));
      }
    });
  }

  saveInterview() {
    if (this.saving) return;
    this.saving = true;
    this.api.put<any>(`/api/resignations/${this.detail()!.id}/exit-interview`, this.interviewForm).subscribe({
      next: () => {
        this.saving = false;
        this.toast.success(this.t('تم حفظ المقابلة بنجاح.', 'Interview saved successfully.'));
        this.afterActionRefresh(this.detail()!.id);
      },
      error: error => {
        this.saving = false;
        this.toast.error(getErrorMessage(error, this.t('تعذر حفظ المقابلة.', 'Failed to save interview.')));
      }
    });
  }

  saveClearance() {
    if (this.saving) return;
    this.saving = true;
    this.api.put<any>(`/api/resignations/${this.detail()!.id}/clearance`, { clearanceItemsJson: JSON.stringify(this.clearanceItems()) }).subscribe({
      next: () => {
        this.saving = false;
        this.toast.success(this.t('تم حفظ التسليم بنجاح.', 'Clearance saved successfully.'));
        this.afterActionRefresh(this.detail()!.id);
      },
      error: error => {
        this.saving = false;
        this.toast.error(getErrorMessage(error, this.t('تعذر حفظ التسليم.', 'Failed to save clearance.')));
      }
    });
  }

  saveSettlement() {
    if (this.saving) return;
    this.saving = true;
    this.api.put<any>(`/api/resignations/${this.detail()!.id}/settlement`, this.settlement).subscribe({
      next: response => {
        this.saving = false;
        const amount = response.data?.finalAmount ?? 0;
        this.toast.success(this.t(`تم حفظ التسوية. الإجمالي النهائي: ${amount}`, `Settlement saved. Final total: ${amount}`));
        this.afterActionRefresh(this.detail()!.id);
      },
      error: error => {
        this.saving = false;
        this.toast.error(getErrorMessage(error, this.t('تعذر حفظ التسوية.', 'Failed to save settlement.')));
      }
    });
  }

  afterActionRefresh(id: number) {
    this.loadList();
    this.loadStats();
    if (this.view() === 'detail') {
      this.openDetail(id);
    }
  }

  printResignation(source: any) {
    if (!source?.employee && !source?.approvals && source?.id) {
      this.api.get<any>(`/api/resignations/${source.id}`).subscribe({
        next: response => this.printResignation(response.data),
        error: error => this.toast.error(getErrorMessage(error, this.t('تعذر تحميل بيانات الطباعة.', 'Failed to load print data.')))
      });
      return;
    }

    const detail = source.employee ? source : this.detail();
    if (!detail) return;
    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup) return;

    const approvals = (detail.approvals || []).map((a: any) => `
      <tr>
        <td>${a.stepLabel}</td>
        <td>${this.approvalLabel(a.decision)}</td>
        <td>${a.notes || '—'}</td>
      </tr>
    `).join('');

    popup.document.write(`
      <html dir="${this.lang === 'ar' ? 'rtl' : 'ltr'}" lang="${this.lang}">
      <head>
        <title>${this.t('طباعة الاستقالة', 'Print Resignation')}</title>
        <style>
          body{font-family:Segoe UI,Tahoma,sans-serif;padding:32px;color:#111}
          h1,h2{margin:0 0 12px}
          .sheet{display:grid;gap:18px}
          .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 18px}
          .row{display:grid;gap:4px}
          .label{font-size:12px;color:#666}
          table{width:100%;border-collapse:collapse}
          th,td{border:1px solid #ddd;padding:10px;text-align:start}
        </style>
      </head>
      <body>
        <div class="sheet">
          <h1>${this.t('نموذج استقالة', 'Resignation Form')}</h1>
          <div class="grid">
            <div class="row"><div class="label">${this.t('الموظف', 'Employee')}</div><strong>${detail.employee?.nameAr || detail.employeeNameAr || '—'}</strong></div>
            <div class="row"><div class="label">${this.t('الوحدة', 'Org Unit')}</div><strong>${this.orgUnitLabel(detail.employee || detail) || '—'}</strong></div>
            <div class="row"><div class="label">${this.t('تاريخ الاستقالة', 'Resignation date')}</div><strong>${this.formatDate(detail.resignationDate)}</strong></div>
            <div class="row"><div class="label">${this.t('آخر يوم عمل', 'Last working day')}</div><strong>${this.formatDate(detail.lastWorkingDay)}</strong></div>
            <div class="row"><div class="label">${this.t('الحالة', 'Status')}</div><strong>${this.statusLabel(detail.status)}</strong></div>
            <div class="row"><div class="label">${this.t('السبب', 'Reason')}</div><strong>${detail.reason || '—'}</strong></div>
          </div>
          <h2>${this.t('الموافقات', 'Approvals')}</h2>
          <table>
            <thead><tr><th>${this.t('المرحلة', 'Stage')}</th><th>${this.t('القرار', 'Decision')}</th><th>${this.t('الملاحظات', 'Notes')}</th></tr></thead>
            <tbody>${approvals || `<tr><td colspan="3">${this.t('لا توجد موافقات بعد.', 'No approvals yet.')}</td></tr>`}</tbody>
          </table>
        </div>
      </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  formatDate(value: string) {
    return value ? new Date(value).toLocaleDateString(this.lang === 'ar' ? 'ar-JO-u-nu-latn' : 'en-US') : '—';
  }

  emptyForm() {
    return { employeeId: 0, resignationDate: '', noticePeriodDays: 30, lastWorkingDay: '', reason: '' };
  }

  clearanceItems() {
    return this.clearanceItemsLocal();
  }
}
