import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { SkeletonKpiCardsComponent } from '../../shared/components/skeleton/skeleton-kpi-cards.component';
import { SkeletonTableComponent } from '../../shared/components/skeleton/skeleton-table.component';

type SView = 'list' | 'form' | 'assign' | 'schedule' | 'exceptions';

const DAY_LABELS: { [k: string]: string } = {
  sun: 'الأحد', mon: 'الاثنين', tue: 'الثلاثاء', wed: 'الأربعاء',
  thu: 'الخميس', fri: 'الجمعة', sat: 'السبت'
};
const ALL_DAYS = ['sun','mon','tue','wed','thu','fri','sat'];
const DEDUCTION_LABELS: { [k: string]: string } = { none: 'بدون خصم', fixed: 'خصم ثابت', salary_based: 'نسبة من الراتب' };
const SHIFT_COLORS = ['#1d4ed8','#7c3aed','#059669','#d97706','#dc2626','#0891b2','#0f172a','#be185d'];

@Component({
  selector: 'app-shifts',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, SkeletonKpiCardsComponent, SkeletonTableComponent],
  template: `
<style>
.sh-container { padding: 0; min-height: 100vh; background: #f8fafc; }
.sh-nav { display:flex; gap:8px; align-items:center; padding:16px 24px; background:#fff; border-bottom:1px solid #e5e7eb; flex-wrap:wrap; }
.sh-nav h1 { font-size:1.15rem; font-weight:800; color:#111827; margin:0; display:flex; align-items:center; gap:8px; }
.tabs-bar { display:flex; background:#fff; border-bottom:2px solid #e5e7eb; padding:0 24px; gap:0; }
.stab { padding:12px 16px; font-size:.8rem; font-weight:600; color:#6b7280; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-2px; display:flex; align-items:center; gap:5px; }
.stab.active { color:#047857; border-bottom-color:#047857; }
.stab:hover:not(.active) { color:#374151; background:#f9fafb; }
.content-area { padding:20px 24px; }
.stats-row { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:18px; }
.stat-box { background:#fff; border-radius:10px; padding:14px 16px; border:1px solid #e5e7eb; text-align:center; }
.stat-box .n { font-size:1.6rem; font-weight:800; }
.stat-box .l { font-size:.72rem; color:#6b7280; }
.card { background:#fff; border-radius:12px; border:1px solid #e5e7eb; margin-bottom:16px; box-shadow:0 1px 3px rgba(0,0,0,.04); }
.card-header { padding:14px 20px; border-bottom:1px solid #f3f4f6; display:flex; align-items:center; justify-content:space-between; }
.card-header h3 { margin:0; font-size:.95rem; font-weight:700; display:flex; align-items:center; gap:6px; }
.card-body { padding:20px; }
.btn { display:inline-flex; align-items:center; gap:5px; padding:8px 14px; border-radius:8px; font-size:.82rem; font-weight:600; border:none; cursor:pointer; transition:all .15s; }
.btn-primary { background:#1d4ed8; color:#fff; } .btn-primary:hover { background:#1e40af; }
.btn-success { background:#16a34a; color:#fff; } .btn-success:hover { background:#15803d; }
.btn-danger { background:#dc2626; color:#fff; }
.btn-warning { background:#d97706; color:#fff; }
.btn-secondary { background:#f3f4f6; color:#374151; border:1px solid #e5e7eb; } .btn-secondary:hover { background:#e5e7eb; }
.btn-sm { padding:5px 10px; font-size:.75rem; }
.btn:disabled { opacity:.5; cursor:not-allowed; }
.form-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.form-grid .full { grid-column:1/-1; }
.form-group label { display:block; font-size:.78rem; font-weight:700; color:#374151; margin-bottom:4px; }
.form-group label .req { color:#dc2626; }
.form-control { width:100%; padding:8px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:.875rem; box-sizing:border-box; background:#fff; }
.form-control:focus { outline:none; border-color:#2563eb; box-shadow:0 0 0 3px rgba(37,99,235,.08); }
.alert { padding:10px 16px; border-radius:8px; font-size:.84rem; margin-bottom:12px; }
.alert-danger { background:#fef2f2; color:#dc2626; border:1px solid #fecaca; }
.alert-success { background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; }
.alert-info { background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; }
.badge { display:inline-flex; align-items:center; padding:3px 10px; border-radius:999px; font-size:.7rem; font-weight:700; }
.badge-success { background:#f0fdf4; color:#15803d; }
.badge-secondary { background:#f3f4f6; color:#6b7280; }
.empty-state { text-align:center; padding:40px 20px; color:#9ca3af; }

/* Shift cards grid */
.shifts-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; }
.shift-card { background:#fff; border-radius:12px; border:1px solid #e5e7eb; overflow:hidden; cursor:pointer; transition:box-shadow .2s, transform .1s; }
.shift-card:hover { box-shadow:0 4px 12px rgba(0,0,0,.1); transform:translateY(-1px); }
.shift-card-header { padding:14px 16px; display:flex; align-items:flex-start; justify-content:space-between; }
.shift-card-name { font-size:.95rem; font-weight:800; }
.shift-card-time { font-size:.78rem; color:#6b7280; margin-top:2px; display:flex; align-items:center; gap:4px; }
.shift-card-body { padding:0 16px 14px; }
.shift-chip { display:inline-flex; align-items:center; padding:2px 8px; border-radius:999px; font-size:.68rem; font-weight:600; margin:2px; }
.rules-row { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
.rule-item { background:#f8fafc; border-radius:8px; padding:6px 10px; font-size:.75rem; text-align:center; border:1px solid #e5e7eb; }
.rule-item .val { font-weight:700; font-size:.875rem; }
.rule-item .key { color:#9ca3af; font-size:.65rem; }
.shift-color-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; display:inline-block; }

/* Color picker */
.color-opts { display:flex; gap:6px; flex-wrap:wrap; margin-top:4px; }
.color-opt { width:28px; height:28px; border-radius:50%; cursor:pointer; border:3px solid transparent; transition:border-color .15s; }
.color-opt.selected { border-color:#1f2937; }

/* Days selector */
.days-grid { display:flex; gap:6px; flex-wrap:wrap; margin-top:4px; }
.day-btn { padding:5px 10px; border-radius:999px; font-size:.75rem; font-weight:600; cursor:pointer; border:2px solid #e5e7eb; background:#fff; color:#6b7280; transition:all .15s; }
.day-btn.selected { background:#1d4ed8; color:#fff; border-color:#1d4ed8; }

/* Schedule grid */
.sched-wrap { overflow-x:auto; }
.sched-table { border-collapse:collapse; min-width:700px; width:100%; }
.sched-table th { padding:8px 12px; font-size:.75rem; font-weight:700; color:#374151; background:#f8fafc; border:1px solid #e5e7eb; text-align:center; white-space:nowrap; }
.sched-table td { padding:6px 8px; border:1px solid #f3f4f6; text-align:center; vertical-align:middle; font-size:.78rem; }
.sched-table td.emp-col { text-align:right; min-width:150px; font-weight:600; }
.sched-badge { display:inline-block; padding:3px 8px; border-radius:6px; font-size:.68rem; font-weight:700; color:#fff; white-space:nowrap; }
.sched-badge.exception { background:#6b7280; }

/* Assignments table */
.data-table { width:100%; border-collapse:collapse; }
.data-table th { background:#f8fafc; font-size:.75rem; font-weight:700; color:#374151; padding:8px 14px; text-align:right; border-bottom:1px solid #e5e7eb; }
.data-table td { padding:9px 14px; font-size:.83rem; border-bottom:1px solid #f3f4f6; }

/* Template cards */
.template-card { border:2px solid #e5e7eb; border-radius:12px; padding:14px; cursor:pointer; transition:all .15s; }
.template-card:hover, .template-card.selected { border-color:#1d4ed8; background:#eff6ff; }
.template-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:12px; margin-bottom:20px; }
</style>

<div class="sh-container" [attr.dir]="lang === 'ar' ? 'rtl' : 'ltr'" [attr.lang]="lang">
  <!-- TOP NAV -->
  <div class="sh-nav">
    <h1><span class="material-icons" style="color:#047857">schedule</span>إدارة الورديات</h1>
    <div style="display:flex;gap:8px;margin-right:auto" *ngIf="isHR">
      <button class="btn btn-secondary btn-sm" (click)="view='form'; editing=null; resetForm()">
        <span class="material-icons" style="font-size:14px">add</span>وردية جديدة
      </button>
    </div>
  </div>

  <!-- TAB BAR -->
  <div class="tabs-bar">
    <div class="stab" [class.active]="view==='list'" (click)="view='list'; editing=null">
      <span class="material-icons" style="font-size:14px">grid_view</span>الورديات
    </div>
    <div class="stab" [class.active]="view==='assign'" (click)="view='assign'; loadAssignments()">
      <span class="material-icons" style="font-size:14px">person_add</span>التعيينات
    </div>
    <div class="stab" [class.active]="view==='schedule'" (click)="view='schedule'; loadSchedule()">
      <span class="material-icons" style="font-size:14px">calendar_view_week</span>الجدول الأسبوعي
    </div>
    <div class="stab" [class.active]="view==='exceptions'" (click)="view='exceptions'; loadExceptions()">
      <span class="material-icons" style="font-size:14px">swap_horiz</span>الاستثناءات
    </div>
  </div>

  <div class="content-area">

    <!-- ═══ LIST ════════════════════════════════════════════════════════ -->
    <ng-container *ngIf="view==='list'">
      <app-skeleton-kpi-cards *ngIf="loading()" [count]="4" />
      <div class="stats-row" *ngIf="!loading()">
        <div class="stat-box">
          <div class="n">{{ shifts().length }}</div>
          <div class="l">إجمالي الورديات</div>
        </div>
        <div class="stat-box" style="border-top:3px solid #16a34a">
          <div class="n" style="color:#16a34a">{{ activeShifts() }}</div>
          <div class="l">ورديات نشطة</div>
        </div>
        <div class="stat-box" style="border-top:3px solid #1d4ed8">
          <div class="n" style="color:#1d4ed8">{{ totalAssigned() }}</div>
          <div class="l">تعيينات حالية</div>
        </div>
        <div class="stat-box" style="border-top:3px solid #7c3aed">
          <div class="n" style="color:#7c3aed">{{ flexibleShifts() }}</div>
          <div class="l">ورديات مرنة</div>
        </div>
      </div>

      <app-skeleton-table *ngIf="loading()" [rows]="6" [cols]="4"></app-skeleton-table>

      <div class="shifts-grid" *ngIf="!loading()">
        <div class="shift-card" *ngFor="let s of shifts()" (click)="openDetail(s)">
          <div class="shift-card-header">
            <div>
              <div class="shift-card-name" [style.color]="s.color">
                <span class="shift-color-dot" [style.background]="s.color" style="margin-left:6px"></span>
                {{ s.nameAr }}
              </div>
              <div class="shift-card-time" *ngIf="!s.isFlexible">
                <span class="material-icons" style="font-size:13px">schedule</span>
                {{ fmtTime(s.startTime) }} — {{ fmtTime(s.endTime) }}
                <span *ngIf="s.isOvernight" style="font-size:.65rem; color:#dc2626">(ليلي)</span>
              </div>
              <div class="shift-card-time" *ngIf="s.isFlexible" style="color:#059669">
                <span class="material-icons" style="font-size:13px">swap_horiz</span> وردية مرنة
              </div>
            </div>
            <span class="badge" [class.badge-success]="s.status==='active'" [class.badge-secondary]="s.status!=='active'">
              {{ s.status==='active'?'نشطة':'غير نشطة' }}
            </span>
          </div>
          <div class="shift-card-body">
            <div style="font-size:.75rem; color:#6b7280; margin-bottom:6px">
              أيام العمل:
              <span *ngFor="let d of parseDays(s.workingDaysJson)" class="shift-chip" style="background:#f3f4f6; color:#374151">{{ d }}</span>
            </div>
            <div class="rules-row">
              <div class="rule-item">
                <div class="val">{{ s.gracePeriodMinutes }}د</div>
                <div class="key">تسامح</div>
              </div>
              <div class="rule-item">
                <div class="val">{{ s.lateThresholdMinutes }}د</div>
                <div class="key">حد التأخر</div>
              </div>
              <div class="rule-item" *ngIf="!s.isFlexible">
                <div class="val">{{ s.totalHours | number:'1.1-1' }}س</div>
                <div class="key">ساعات العمل</div>
              </div>
              <div class="rule-item">
                <div class="val">{{ s.overtimeMultiplier }}×</div>
                <div class="key">معامل إضافي</div>
              </div>
              <div class="rule-item" style="background:#f0fdf4">
                <div class="val" style="color:#16a34a">{{ s.assignmentCount }}</div>
                <div class="key">موظف</div>
              </div>
            </div>
          </div>
        </div>

        <div *ngIf="!shifts().length" class="empty-state" style="grid-column:1/-1">
          <span class="material-icons" style="font-size:2.5rem;display:block">schedule</span>
          لا توجد ورديات. أنشئ وردية جديدة.
        </div>
      </div>
    </ng-container>

    <!-- ═══ FORM ════════════════════════════════════════════════════════ -->
    <ng-container *ngIf="view==='form'">
      <!-- Templates picker (show only on new) -->
      <div class="card" *ngIf="!editing">
        <div class="card-header"><h3><span class="material-icons">auto_awesome</span>ابدأ من قالب جاهز (اختياري)</h3></div>
        <div class="card-body">
          <div class="template-grid">
            <div class="template-card" *ngFor="let t of templates()"
                 [class.selected]="selectedTemplate===t.id"
                 (click)="applyTemplate(t)">
              <strong style="font-size:.875rem">{{ t.nameAr }}</strong>
              <div style="font-size:.75rem; color:#6b7280; margin-top:4px">{{ t.startTime }} — {{ t.endTime }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3><span class="material-icons">{{ editing?'edit':'add_circle' }}</span>{{ editing?'تعديل الوردية':'إنشاء وردية جديدة' }}</h3>
          <button class="btn btn-secondary btn-sm" (click)="view='list'; editing=null">إلغاء</button>
        </div>
        <div class="card-body">

          <!-- Basic info -->
          <p style="font-size:.78rem; color:#6b7280; font-weight:700; margin:0 0 10px; text-transform:uppercase; letter-spacing:.05em">⏰ معلومات الوردية</p>
          <div class="form-grid" style="margin-bottom:20px">
            <div class="form-group">
              <label>اسم الوردية (عربي) <span class="req">*</span></label>
              <input type="text" class="form-control" [(ngModel)]="form.nameAr" placeholder="مثال: وردية الصباح">
            </div>
            <div class="form-group">
              <label>اسم الوردية (إنجليزي)</label>
              <input type="text" class="form-control" [(ngModel)]="form.nameEn" placeholder="Morning Shift">
            </div>
            <div class="form-group">
              <label>وقت البداية <span class="req">*</span></label>
              <input type="time" class="form-control" [(ngModel)]="form.startTime" [disabled]="form.isFlexible">
            </div>
            <div class="form-group">
              <label>وقت النهاية <span class="req">*</span></label>
              <input type="time" class="form-control" [(ngModel)]="form.endTime" [disabled]="form.isFlexible">
            </div>
            <div class="form-group">
              <label>مدة الاستراحة (دقيقة)</label>
              <input type="number" class="form-control" [(ngModel)]="form.breakMinutes" min="0">
            </div>
            <div class="form-group">
              <label>لون الوردية</label>
              <div class="color-opts">
                <div class="color-opt" *ngFor="let c of colorOptions" [style.background]="c"
                     [class.selected]="form.color===c" (click)="form.color=c"></div>
              </div>
            </div>
            <div class="form-group" style="display:flex; align-items:center; gap:12px; padding-top:20px">
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; margin:0">
                <input type="checkbox" [(ngModel)]="form.isOvernight"> وردية ليلية (تتجاوز منتصف الليل)
              </label>
            </div>
            <div class="form-group" style="display:flex; align-items:center; gap:12px; padding-top:20px">
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; margin:0">
                <input type="checkbox" [(ngModel)]="form.isFlexible"> وردية مرنة (بدون وقت محدد)
              </label>
            </div>
          </div>

          <!-- Working days -->
          <p style="font-size:.78rem; color:#6b7280; font-weight:700; margin:0 0 10px; text-transform:uppercase; letter-spacing:.05em">📅 أيام العمل</p>
          <div style="margin-bottom:20px">
            <div class="days-grid">
              <button class="day-btn" *ngFor="let d of allDays"
                      [class.selected]="isDaySelected(d)"
                      (click)="toggleDay(d)">{{ dayLabel(d) }}</button>
            </div>
          </div>

          <!-- Late rules -->
          <p style="font-size:.78rem; color:#6b7280; font-weight:700; margin:0 0 10px; text-transform:uppercase; letter-spacing:.05em">⏳ قواعد التأخر</p>
          <div class="form-grid" style="margin-bottom:20px">
            <div class="form-group">
              <label>فترة السماح (دقيقة)</label>
              <input type="number" class="form-control" [(ngModel)]="form.gracePeriodMinutes" min="0">
              <small style="color:#9ca3af; font-size:.72rem">التأخر ضمن هذه الفترة لا يُحتسب</small>
            </div>
            <div class="form-group">
              <label>حد التأخر (دقيقة)</label>
              <input type="number" class="form-control" [(ngModel)]="form.lateThresholdMinutes" min="0">
              <small style="color:#9ca3af; font-size:.72rem">يُصنَّف الموظف "متأخراً" بعد هذه الدقائق</small>
            </div>
            <div class="form-group">
              <label>سياسة الخصم</label>
              <select class="form-control" [(ngModel)]="form.deductionPolicy">
                <option value="none">بدون خصم</option>
                <option value="fixed">خصم ثابت</option>
                <option value="salary_based">نسبة من الراتب</option>
              </select>
            </div>
            <div class="form-group" *ngIf="form.deductionPolicy!=='none'">
              <label>مبلغ الخصم (دينار)</label>
              <input type="number" class="form-control" [(ngModel)]="form.deductionAmount" step="0.001" min="0">
            </div>
            <div class="form-group">
              <label>حد المغادرة المبكرة (دقيقة)</label>
              <input type="number" class="form-control" [(ngModel)]="form.earlyLeaveThresholdMinutes" min="0">
            </div>
          </div>

          <!-- Overtime rules -->
          <p style="font-size:.78rem; color:#6b7280; font-weight:700; margin:0 0 10px; text-transform:uppercase; letter-spacing:.05em">⏱️ قواعد العمل الإضافي</p>
          <div class="form-grid" style="margin-bottom:20px">
            <div class="form-group">
              <label>بدء الإضافي بعد (دقيقة إضافية)</label>
              <input type="number" class="form-control" [(ngModel)]="form.overtimeStartAfterMinutes" min="0">
              <small style="color:#9ca3af; font-size:.72rem">يُحتسب الإضافي بعد تجاوز ساعات الوردية بهذه الدقائق</small>
            </div>
            <div class="form-group">
              <label>معامل الراتب الإضافي</label>
              <input type="number" class="form-control" [(ngModel)]="form.overtimeMultiplier" step="0.25" min="1">
              <small style="color:#9ca3af; font-size:.72rem">1.5 = مرة ونصف، 2.0 = مرتين</small>
            </div>
          </div>

          <!-- Notes -->
          <div class="form-group">
            <label>ملاحظات</label>
            <textarea class="form-control" rows="2" [(ngModel)]="form.notes"></textarea>
          </div>

          <!-- Preview -->
          <div class="alert alert-info" style="margin-top:12px" *ngIf="form.nameAr && form.startTime && form.endTime && !form.isFlexible">
            <strong>ملخص:</strong> وردية {{ form.nameAr }} من {{ form.startTime }} إلى {{ form.endTime }}
            — صافي ساعات العمل: <strong>{{ calcFormHours() | number:'1.1-1' }} ساعة</strong>
            — التسامح: <strong>{{ form.gracePeriodMinutes }} دقيقة</strong>
            — الإضافي: <strong>{{ form.overtimeMultiplier }}×</strong>
          </div>

          <div *ngIf="formError" class="alert alert-danger">{{ formError }}</div>
          <div style="display:flex; gap:8px; margin-top:16px">
            <button class="btn btn-primary" (click)="saveShift()" [disabled]="saving">
              <span class="material-icons" style="font-size:15px">save</span>
              {{ saving?'جاري الحفظ...':(editing?'حفظ التعديلات':'إنشاء الوردية') }}
            </button>
            <button class="btn btn-secondary" (click)="view='list'; editing=null">إلغاء</button>
          </div>
        </div>
      </div>
    </ng-container>

    <!-- ═══ ASSIGN ════════════════════════════════════════════════════ -->
    <ng-container *ngIf="view==='assign'">
      <div class="card">
        <div class="card-header"><h3><span class="material-icons">person_add</span>تعيين وردية لموظف أو قسم</h3></div>
        <div class="card-body">
          <div class="form-grid">
            <div class="form-group">
              <label>الوردية <span class="req">*</span></label>
              <select class="form-control" [(ngModel)]="assignForm.shiftId">
                <option [value]="0">-- اختر الوردية --</option>
                <option *ngFor="let s of activeShiftList()" [value]="s.id">{{ s.nameAr }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>نوع التعيين</label>
              <select class="form-control" [(ngModel)]="assignType">
                <option value="employee">موظف محدد</option>
                <option value="department">قسم كامل</option>
              </select>
            </div>
            <div class="form-group" *ngIf="assignType==='employee'">
              <label>الموظف <span class="req">*</span></label>
              <select class="form-control" [(ngModel)]="assignForm.employeeId">
                <option [value]="0">-- اختر الموظف --</option>
                <option *ngFor="let e of employees()" [value]="e.id">{{ e.fullNameAr }} ({{ e.employeeCode }})</option>
              </select>
            </div>
            <div class="form-group" *ngIf="assignType==='department'">
              <label>القسم <span class="req">*</span></label>
              <select class="form-control" [(ngModel)]="assignForm.departmentId">
                <option [value]="0">-- اختر القسم --</option>
                <option *ngFor="let d of departments()" [value]="d.id">{{ d.nameAr }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>تاريخ البداية <span class="req">*</span></label>
              <input type="date" class="form-control" [(ngModel)]="assignForm.startDate">
            </div>
            <div class="form-group">
              <label>تاريخ النهاية (اختياري)</label>
              <input type="date" class="form-control" [(ngModel)]="assignForm.endDate">
            </div>
            <div class="form-group full">
              <label>ملاحظات</label>
              <input type="text" class="form-control" [(ngModel)]="assignForm.notes">
            </div>
          </div>
          <div *ngIf="assignError" class="alert alert-danger">{{ assignError }}</div>
          <div *ngIf="assignSuccess" class="alert alert-success">{{ assignSuccess }}</div>
          <button class="btn btn-primary" (click)="saveAssignment()" [disabled]="saving">
            <span class="material-icons" style="font-size:15px">check</span>
            {{ saving?'جاري الحفظ...':'تعيين الوردية' }}
          </button>
        </div>
      </div>

      <!-- Existing assignments table -->
      <div class="card">
        <div class="card-header"><h3><span class="material-icons">list_alt</span>التعيينات الحالية</h3></div>
        <div class="card-body" style="padding:0; overflow-x:auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>الموظف / القسم</th>
                <th>الوردية</th>
                <th>من</th>
                <th>حتى</th>
                <th>ملاحظات</th>
                <th *ngIf="isHR">إجراء</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let a of assignments()">
                <td>
                  <span *ngIf="a.employeeNameAr">
                    <strong>{{ a.employeeNameAr }}</strong>
                    <small style="color:#9ca3af; display:block">{{ a.employeeCode }}</small>
                  </span>
                  <span *ngIf="a.departmentNameAr">
                    <span class="badge" style="background:#eff6ff; color:#1d4ed8">قسم</span>
                    {{ a.departmentNameAr }}
                  </span>
                </td>
                <td>
                  <span class="badge" [style.background]="lighten(a.shiftColor)" [style.color]="a.shiftColor">
                    {{ a.shiftNameAr }}
                  </span>
                </td>
                <td style="font-size:.8rem">{{ a.startDate | date:'dd/MM/yyyy' }}</td>
                <td style="font-size:.8rem; color:#9ca3af">{{ a.endDate ? (a.endDate | date:'dd/MM/yyyy') : 'مفتوح' }}</td>
                <td style="font-size:.78rem; color:#6b7280">{{ a.notes || '—' }}</td>
                <td *ngIf="isHR">
                  <button class="btn btn-danger btn-sm" (click)="removeAssignment(a.id)">
                    <span class="material-icons" style="font-size:13px">delete</span>
                  </button>
                </td>
              </tr>
              <tr *ngIf="!assignments().length">
                <td colspan="6" class="empty-state">لا توجد تعيينات</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </ng-container>

    <!-- ═══ SCHEDULE ═══════════════════════════════════════════════════ -->
    <ng-container *ngIf="view==='schedule'">
      <div class="card">
        <div class="card-header">
          <h3><span class="material-icons">calendar_view_week</span>الجدول الأسبوعي</h3>
          <div style="display:flex; gap:8px; align-items:center">
            <button class="btn btn-secondary btn-sm" (click)="prevWeek()">
              <span class="material-icons" style="font-size:14px">chevron_right</span>
            </button>
            <span style="font-size:.82rem; font-weight:600">{{ weekLabel() }}</span>
            <button class="btn btn-secondary btn-sm" (click)="nextWeek()">
              <span class="material-icons" style="font-size:14px">chevron_left</span>
            </button>
            <button class="btn btn-secondary btn-sm" (click)="goToCurrentWeek()">اليوم</button>
          </div>
        </div>
        <div class="card-body" style="padding:0">
          <div class="sched-wrap">
            <table class="sched-table">
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th *ngFor="let d of weekDays()">
                    {{ d | date:'EEE' }}<br>
                    <span style="font-weight:400; font-size:.7rem">{{ d | date:'dd/MM' }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let row of scheduleData()">
                  <td class="emp-col">
                    {{ row.nameAr }}
                    <small style="color:#9ca3af; display:block; font-weight:400">{{ row.department }}</small>
                  </td>
                  <td *ngFor="let day of row.days">
                    <span *ngIf="day" class="sched-badge" [class.exception]="day.source==='exception'" [style.background]="day.source==='exception'?'#6b7280':(day.color||'#6b7280')">
                      {{ day.shiftNameAr || '—' }}
                    </span>
                    <span *ngIf="!day" style="color:#d1d5db">—</span>
                  </td>
                </tr>
                <tr *ngIf="!scheduleData().length">
                  <td [attr.colspan]="8" class="empty-state">لا يوجد موظفون أو تعيينات لهذا الأسبوع</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ng-container>

    <!-- ═══ EXCEPTIONS ════════════════════════════════════════════════ -->
    <ng-container *ngIf="view==='exceptions'">
      <div class="card" *ngIf="isHR">
        <div class="card-header"><h3><span class="material-icons">swap_horiz</span>إضافة استثناء يومي</h3></div>
        <div class="card-body">
          <div class="form-grid">
            <div class="form-group">
              <label>الموظف <span class="req">*</span></label>
              <select class="form-control" [(ngModel)]="excForm.employeeId">
                <option [value]="0">-- اختر الموظف --</option>
                <option *ngFor="let e of employees()" [value]="e.id">{{ e.fullNameAr }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>التاريخ <span class="req">*</span></label>
              <input type="date" class="form-control" [(ngModel)]="excForm.date">
            </div>
            <div class="form-group full">
              <label>نوع الاستثناء</label>
              <select class="form-control" [(ngModel)]="excType" style="margin-bottom:8px">
                <option value="shift">تغيير إلى وردية أخرى</option>
                <option value="custom">أوقات مخصصة</option>
              </select>
            </div>
            <div class="form-group" *ngIf="excType==='shift'">
              <label>الوردية البديلة</label>
              <select class="form-control" [(ngModel)]="excForm.customShiftId">
                <option [value]="0">-- اختر --</option>
                <option *ngFor="let s of activeShiftList()" [value]="s.id">{{ s.nameAr }}</option>
              </select>
            </div>
            <ng-container *ngIf="excType==='custom'">
              <div class="form-group">
                <label>وقت الحضور المخصص</label>
                <input type="time" class="form-control" [(ngModel)]="excForm.customStartTime">
              </div>
              <div class="form-group">
                <label>وقت الانصراف المخصص</label>
                <input type="time" class="form-control" [(ngModel)]="excForm.customEndTime">
              </div>
            </ng-container>
            <div class="form-group full">
              <label>السبب</label>
              <input type="text" class="form-control" [(ngModel)]="excForm.reason" placeholder="سبب الاستثناء...">
            </div>
          </div>
          <div *ngIf="excError" class="alert alert-danger">{{ excError }}</div>
          <div *ngIf="excSuccess" class="alert alert-success">{{ excSuccess }}</div>
          <button class="btn btn-primary" (click)="saveException()" [disabled]="saving">
            <span class="material-icons" style="font-size:14px">check</span>
            {{ saving?'جاري الحفظ...':'إضافة الاستثناء' }}
          </button>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3><span class="material-icons">list</span>الاستثناءات المسجلة</h3></div>
        <div class="card-body" style="padding:0; overflow-x:auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>الموظف</th>
                <th>التاريخ</th>
                <th>الوردية البديلة / الأوقات</th>
                <th>السبب</th>
                <th *ngIf="isHR">إجراء</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let e of exceptions()">
                <td style="font-weight:600">{{ e.employeeNameAr }}</td>
                <td style="font-size:.82rem">{{ e.date | date:'dd/MM/yyyy' }}</td>
                <td>
                  <span *ngIf="e.customShiftNameAr" class="badge badge-success">{{ e.customShiftNameAr }}</span>
                  <span *ngIf="!e.customShiftNameAr && e.customStartTime" style="font-size:.8rem">
                    {{ e.customStartTime }} — {{ e.customEndTime }}
                  </span>
                </td>
                <td style="font-size:.78rem; color:#6b7280">{{ e.reason || '—' }}</td>
                <td *ngIf="isHR">
                  <button class="btn btn-danger btn-sm" (click)="removeException(e.id)">
                    <span class="material-icons" style="font-size:13px">delete</span>
                  </button>
                </td>
              </tr>
              <tr *ngIf="!exceptions().length">
                <td colspan="5" class="empty-state">لا توجد استثناءات مسجلة</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </ng-container>

  </div>
</div>
  `,
})
export class ShiftsComponent implements OnInit {
  view: SView = 'list';
  loading = signal(true);
  saving = false;
  formError = '';
  assignError = '';
  assignSuccess = '';
  excError = '';
  excSuccess = '';
  editing: any = null;
  selectedTemplate = '';
  assignType = 'employee';
  excType = 'shift';

  shifts = signal<any[]>([]);
  employees = signal<any[]>([]);
  departments = signal<any[]>([]);
  assignments = signal<any[]>([]);
  scheduleData = signal<any[]>([]);
  exceptions = signal<any[]>([]);
  templates = signal<any[]>([]);

  allDays = ALL_DAYS;
  colorOptions = SHIFT_COLORS;
  currentWeekStart: Date = this.getWeekStart(new Date());

  form = this.emptyForm();
  assignForm = { shiftId: 0, employeeId: 0, departmentId: 0, startDate: new Date().toISOString().substring(0, 10), endDate: '', notes: '' };
  excForm = { employeeId: 0, date: new Date().toISOString().substring(0, 10), customShiftId: 0, customStartTime: '', customEndTime: '', reason: '' };

  activeShifts = computed(() => this.shifts().filter(s => s.status === 'active').length);
  flexibleShifts = computed(() => this.shifts().filter(s => s.isFlexible).length);
  totalAssigned = computed(() => this.shifts().reduce((a, s) => a + (s.assignmentCount || 0), 0));
  activeShiftList = computed(() => this.shifts().filter(s => s.status === 'active'));

  constructor(public auth: AuthService, private api: ApiService) {}
  get lang() { return this.auth.lang; }
  get isHR() { return ['hradmin'].includes(this.auth.currentUser()?.role ?? ''); }

  ngOnInit() {
    this.loadShifts();
    this.api.get<any>('/api/employees?status=active').subscribe(r => this.employees.set(r.data || []));
    this.api.get<any>('/api/departments').subscribe(r => this.departments.set(r.data || []));
    this.api.get<any>('/api/shifts/templates').subscribe(r => this.templates.set(r.data || []));
  }

  loadShifts() {
    this.loading.set(true);
    this.api.get<any>('/api/shifts').subscribe({
      next: r => { this.shifts.set(r.data || []); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  loadAssignments() {
    this.api.get<any>('/api/shifts/assignments').subscribe(r => this.assignments.set(r.data || []));
  }

  loadSchedule() {
    const ws = this.currentWeekStart.toISOString().substring(0, 10);
    this.api.get<any>(`/api/shifts/schedule?weekStart=${ws}`).subscribe(r => this.scheduleData.set(r.data || []));
  }

  loadExceptions() {
    this.api.get<any>('/api/shifts/exceptions').subscribe(r => this.exceptions.set(r.data || []));
  }

  openDetail(s: any) {
    this.editing = s;
    this.form = {
      nameAr: s.nameAr, nameEn: s.nameEn, startTime: this.timeToInput(s.startTime),
      endTime: this.timeToInput(s.endTime), breakMinutes: s.breakMinutes,
      isOvernight: s.isOvernight, isFlexible: s.isFlexible,
      workingDays: this.parseDaysArr(s.workingDaysJson), gracePeriodMinutes: s.gracePeriodMinutes,
      lateThresholdMinutes: s.lateThresholdMinutes, deductionPolicy: s.deductionPolicy,
      deductionAmount: s.deductionAmount, earlyLeaveThresholdMinutes: s.earlyLeaveThresholdMinutes,
      overtimeStartAfterMinutes: s.overtimeStartAfterMinutes,
      overtimeMultiplier: s.overtimeMultiplier, color: s.color, notes: s.notes || ''
    };
    this.selectedTemplate = '';
    this.view = 'form';
  }

  applyTemplate(t: any) {
    this.selectedTemplate = t.id;
    this.form.startTime = t.startTime; this.form.endTime = t.endTime;
    this.form.breakMinutes = t.breakMinutes; this.form.isOvernight = t.isOvernight;
    this.form.isFlexible = t.isFlexible; this.form.gracePeriodMinutes = t.gracePeriodMinutes;
    this.form.lateThresholdMinutes = t.lateThresholdMinutes;
    this.form.overtimeStartAfterMinutes = t.overtimeStartAfterMinutes;
    this.form.overtimeMultiplier = t.overtimeMultiplier;
    this.form.color = t.color;
    this.form.nameAr = this.form.nameAr || t.nameAr;
    this.form.nameEn = this.form.nameEn || t.nameEn;
    const days = JSON.parse(t.workingDaysJson || '[]');
    this.form.workingDays = days;
  }

  saveShift() {
    this.formError = '';
    if (!this.form.nameAr) { this.formError = 'يرجى إدخال اسم الوردية'; return; }
    if (!this.form.isFlexible && (!this.form.startTime || !this.form.endTime)) { this.formError = 'يرجى تحديد أوقات الوردية'; return; }
    this.saving = true;
    const payload = {
      nameAr: this.form.nameAr, nameEn: this.form.nameEn || this.form.nameAr,
      startTime: this.form.startTime || '09:00', endTime: this.form.endTime || '17:00',
      breakMinutes: this.form.breakMinutes, isOvernight: this.form.isOvernight,
      isFlexible: this.form.isFlexible,
      workingDaysJson: JSON.stringify(this.form.workingDays),
      gracePeriodMinutes: this.form.gracePeriodMinutes, lateThresholdMinutes: this.form.lateThresholdMinutes,
      deductionPolicy: this.form.deductionPolicy, deductionAmount: this.form.deductionAmount,
      earlyLeaveThresholdMinutes: this.form.earlyLeaveThresholdMinutes,
      overtimeStartAfterMinutes: this.form.overtimeStartAfterMinutes,
      overtimeMultiplier: this.form.overtimeMultiplier, color: this.form.color, notes: this.form.notes
    };
    const req = this.editing
      ? this.api.put<any>(`/api/shifts/${this.editing.id}`, payload)
      : this.api.post<any>('/api/shifts', payload);
    req.subscribe({
      next: () => { this.saving = false; this.view = 'list'; this.editing = null; this.loadShifts(); },
      error: e => { this.saving = false; this.formError = e.error?.message || 'حدث خطأ'; }
    });
  }

  saveAssignment() {
    this.assignError = ''; this.assignSuccess = '';
    if (!this.assignForm.shiftId) { this.assignError = 'يرجى اختيار الوردية'; return; }
    if (this.assignType === 'employee' && !this.assignForm.employeeId) { this.assignError = 'يرجى اختيار الموظف'; return; }
    if (this.assignType === 'department' && !this.assignForm.departmentId) { this.assignError = 'يرجى اختيار القسم'; return; }
    this.saving = true;
    const payload = {
      shiftId: this.assignForm.shiftId,
      employeeId: this.assignType === 'employee' ? this.assignForm.employeeId : null,
      departmentId: this.assignType === 'department' ? this.assignForm.departmentId : null,
      startDate: this.assignForm.startDate, endDate: this.assignForm.endDate || null,
      notes: this.assignForm.notes
    };
    this.api.post<any>('/api/shifts/assignments', payload).subscribe({
      next: () => { this.saving = false; this.assignSuccess = 'تم التعيين بنجاح'; this.loadAssignments(); this.loadShifts(); },
      error: e => { this.saving = false; this.assignError = e.error?.message || 'حدث خطأ'; }
    });
  }

  removeAssignment(id: number) {
    if (!confirm('هل أنت متأكد من حذف هذا التعيين؟')) return;
    this.api.delete<any>(`/api/shifts/assignments/${id}`).subscribe(() => this.loadAssignments());
  }

  saveException() {
    this.excError = ''; this.excSuccess = '';
    if (!this.excForm.employeeId) { this.excError = 'يرجى اختيار الموظف'; return; }
    this.saving = true;
    const payload = {
      employeeId: this.excForm.employeeId, date: this.excForm.date,
      customShiftId: this.excType === 'shift' && this.excForm.customShiftId ? this.excForm.customShiftId : null,
      customStartTime: this.excType === 'custom' ? this.excForm.customStartTime : null,
      customEndTime:   this.excType === 'custom' ? this.excForm.customEndTime : null,
      reason: this.excForm.reason
    };
    this.api.post<any>('/api/shifts/exceptions', payload).subscribe({
      next: () => { this.saving = false; this.excSuccess = 'تم إضافة الاستثناء'; this.loadExceptions(); },
      error: e => { this.saving = false; this.excError = e.error?.message || 'حدث خطأ'; }
    });
  }

  removeException(id: number) {
    if (!confirm('هل أنت متأكد من حذف هذا الاستثناء؟')) return;
    this.api.delete<any>(`/api/shifts/exceptions/${id}`).subscribe(() => this.loadExceptions());
  }

  // Week navigation
  weekDays() {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(this.currentWeekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }

  weekLabel() {
    const end = new Date(this.currentWeekStart);
    end.setDate(end.getDate() + 6);
    return `${this.formatDate(this.currentWeekStart)} — ${this.formatDate(end)}`;
  }

  prevWeek() { this.currentWeekStart = new Date(this.currentWeekStart.getTime() - 7 * 86400000); this.loadSchedule(); }
  nextWeek() { this.currentWeekStart = new Date(this.currentWeekStart.getTime() + 7 * 86400000); this.loadSchedule(); }
  goToCurrentWeek() { this.currentWeekStart = this.getWeekStart(new Date()); this.loadSchedule(); }

  // Days helpers
  parseDays(json: string): string[] {
    const cleanDayLabels: { [k: string]: string } = {
      sun: 'الأحد', mon: 'الاثنين', tue: 'الثلاثاء', wed: 'الأربعاء',
      thu: 'الخميس', fri: 'الجمعة', sat: 'السبت'
    };
    try { return (JSON.parse(json || '[]') as string[]).map(d => cleanDayLabels[d] || DAY_LABELS[d] || d); } catch { return []; }
  }
  parseDaysArr(json: string): string[] {
    try { return JSON.parse(json || '[]'); } catch { return []; }
  }
  isDaySelected(d: string) { return this.form.workingDays.includes(d); }
  toggleDay(d: string) {
    const idx = this.form.workingDays.indexOf(d);
    if (idx >= 0) this.form.workingDays.splice(idx, 1); else this.form.workingDays.push(d);
  }
  dayLabel(d: string) {
    const cleanDayLabels: { [k: string]: string } = {
      sun: 'الأحد', mon: 'الاثنين', tue: 'الثلاثاء', wed: 'الأربعاء',
      thu: 'الخميس', fri: 'الجمعة', sat: 'السبت'
    };
    return cleanDayLabels[d] || DAY_LABELS[d] || d;
  }

  // Time helpers
  fmtTime(t: string) { if (!t) return '—'; const p = t.split(':'); return `${p[0]}:${p[1]}`; }
  timeToInput(t: string) { if (!t) return ''; const p = t.split(':'); return `${p[0]}:${p[1]}`; }

  calcFormHours() {
    if (!this.form.startTime || !this.form.endTime) return 0;
    const [sh, sm] = this.form.startTime.split(':').map(Number);
    const [eh, em] = this.form.endTime.split(':').map(Number);
    let endMins = eh * 60 + em;
    if (this.form.isOvernight) endMins += 1440;
    return Math.max(0, (endMins - (sh * 60 + sm) - this.form.breakMinutes) / 60);
  }

  resetForm() {
    this.form = this.emptyForm();
    this.selectedTemplate = '';
    this.formError = '';
  }

  emptyForm() {
    return {
      nameAr: '', nameEn: '', startTime: '08:00', endTime: '17:00', breakMinutes: 60,
      isOvernight: false, isFlexible: false,
      workingDays: ['sun','mon','tue','wed','thu'],
      gracePeriodMinutes: 10, lateThresholdMinutes: 30, deductionPolicy: 'none',
      deductionAmount: 0, earlyLeaveThresholdMinutes: 30,
      overtimeStartAfterMinutes: 30, overtimeMultiplier: 1.5,
      color: '#1d4ed8', notes: ''
    };
  }

  lighten(hex: string) {
    if (!hex) return '#f3f4f6';
    return hex + '22';
  }

  getWeekStart(d: Date) {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 0);
    const start = new Date(d);
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  formatDate(d: Date) {
    return d.toLocaleDateString('ar-JO', { day: '2-digit', month: '2-digit' });
  }
}
