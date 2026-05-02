import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { SkeletonCardComponent } from '../../shared/components/skeleton/skeleton-card.component';
import { SkeletonKpiCardsComponent } from '../../shared/components/skeleton/skeleton-kpi-cards.component';
import { SkeletonTableComponent } from '../../shared/components/skeleton/skeleton-table.component';

type HView = 'dashboard' | 'list' | 'calendar' | 'reports';

const TYPES_AR:   Record<string,string> = { national:'وطنية', religious:'دينية', company:'شركة' };
const TYPES_CLR:  Record<string,string> = { national:'#166534', religious:'#15803d', company:'#16a34a' };
const TYPES_BG:   Record<string,string> = { national:'#f0fdf4', religious:'#ecfdf5', company:'#dcfce7' };
const STATUS_AR:  Record<string,string> = { active:'نشط', inactive:'غير نشط' };
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const DAYS_AR   = ['أح','إث','ثل','أر','خم','جم','سب'];

@Component({
  selector: 'app-holidays',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe, SkeletonCardComponent, SkeletonKpiCardsComponent, SkeletonTableComponent],
  template: `
<style>
.ph { min-height:100vh; background:#f8fafc; direction:rtl; }
.ph-head { background:#fff; border-bottom:1px solid #e5e7eb; padding:14px 24px; display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.ph-head h1 { margin:0; font-size:1.15rem; font-weight:800; color:#111827; display:flex; align-items:center; gap:8px; }
.tabs { display:flex; background:#fff; border-bottom:2px solid #e5e7eb; padding:0 24px; gap:0; overflow-x:auto; }
.tab  { padding:12px 16px; font-size:.8rem; font-weight:600; color:#6b7280; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-2px; display:flex; align-items:center; gap:5px; white-space:nowrap; }
.tab.active { color:#16a34a; border-bottom-color:#16a34a; }
.tab:hover:not(.active) { color:#374151; background:#f9fafb; }
.body { padding:20px 24px; }

.stat-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
.stat-box { background:#fff; border-radius:12px; padding:16px; border:1px solid #e5e7eb; border-top:3px solid transparent; }
.stat-box .num { font-size:2rem; font-weight:900; }
.stat-box .lbl { font-size:.75rem; color:#6b7280; margin-top:2px; }

.card { background:#fff; border-radius:12px; border:1px solid #e5e7eb; margin-bottom:16px; box-shadow:0 1px 3px rgba(0,0,0,.04); }
.card-hd { padding:13px 20px; border-bottom:1px solid #f3f4f6; display:flex; align-items:center; justify-content:space-between; }
.card-hd h3 { margin:0; font-size:.92rem; font-weight:700; display:flex; align-items:center; gap:6px; }
.card-bd { padding:18px 20px; }

.btn { display:inline-flex; align-items:center; gap:5px; padding:8px 14px; border-radius:8px; font-size:.82rem; font-weight:600; border:none; cursor:pointer; }
.btn-primary  { background:#16a34a; color:#fff; } .btn-primary:hover  { background:#15803d; }
.btn-success  { background:#16a34a; color:#fff; }
.btn-danger   { background:#dc2626; color:#fff; }
.btn-secondary{ background:#f3f4f6; color:#374151; border:1px solid #e5e7eb; }
.btn-sm { padding:5px 10px; font-size:.73rem; }
.btn:disabled { opacity:.5; cursor:not-allowed; }

.fg { margin-bottom:12px; }
.fg label { display:block; font-size:.78rem; font-weight:700; color:#374151; margin-bottom:4px; }
.fc { width:100%; padding:7px 10px; border:1px solid #d1d5db; border-radius:7px; font-size:.85rem; box-sizing:border-box; }
.fc:focus { outline:none; border-color:#16a34a; }
.fg2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.fg3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }

.tbl-wrap { overflow-x:auto; }
.tbl { width:100%; border-collapse:collapse; min-width:600px; }
.tbl th { background:#f8fafc; font-size:.73rem; font-weight:700; color:#374151; padding:9px 12px; text-align:right; border-bottom:1px solid #e5e7eb; white-space:nowrap; }
.tbl td { padding:9px 12px; font-size:.82rem; border-bottom:1px solid #f3f4f6; vertical-align:middle; }
.tbl tr:hover td { background:#fafafa; }

.badge { display:inline-flex; align-items:center; gap:3px; padding:3px 9px; border-radius:999px; font-size:.72rem; font-weight:700; }

.alert { padding:10px 14px; border-radius:8px; font-size:.83rem; margin-bottom:10px; }
.alert-info    { background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; }
.alert-success { background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; }
.alert-danger  { background:#fef2f2; color:#dc2626; border:1px solid #fecaca; }
.alert-warning { background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; }

.filter-bar { display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; margin-bottom:16px;
  padding:14px 16px; background:#fff; border:1px solid #e5e7eb; border-radius:10px; }
.filter-bar .fc { width:auto; min-width:120px; }
.filter-bar label { font-size:.72rem; font-weight:700; color:#6b7280; display:block; margin-bottom:2px; }

/* Calendar */
.cal-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
.cal-month { background:#fff; border:1px solid #e5e7eb; border-radius:10px; overflow:hidden; }
.cal-month-hd { background:#166534; color:#fff; text-align:center; padding:8px; font-size:.82rem; font-weight:700; }
.cal-week-hd { display:grid; grid-template-columns:repeat(7,1fr); }
.cal-week-hd span { text-align:center; padding:4px 0; font-size:.65rem; font-weight:700; color:#9ca3af; }
.cal-days { display:grid; grid-template-columns:repeat(7,1fr); }
.cal-day { text-align:center; padding:3px 0; font-size:.65rem; cursor:default; min-height:24px; }
.cal-day.other { color:#d1d5db; }
.cal-day.today { background:#dcfce7; color:#166534; font-weight:700; border-radius:50%; }
.cal-day.holiday { border-radius:50%; font-weight:700; color:#fff; }
.cal-day.national  { background:#166534; }
.cal-day.religious { background:#15803d; }
.cal-day.company   { background:#16a34a; }
.cal-day.holiday-end { border-radius:0 50% 50% 0 !important; }
.cal-day.holiday-start { border-radius:50% 0 0 50% !important; }
.cal-day.holiday-mid   { border-radius:0 !important; }
.cal-legend { display:flex; gap:10px; flex-wrap:wrap; padding:8px 12px; border-top:1px solid #f3f4f6; }
.cal-legend span { display:flex; align-items:center; gap:4px; font-size:.7rem; }
.cal-legend .dot { width:10px; height:10px; border-radius:50%; }

/* Timeline */
.timeline { position:relative; padding-right:24px; }
.timeline::before { content:''; position:absolute; right:8px; top:0; bottom:0; width:2px; background:#e5e7eb; }
.tl-item { position:relative; margin-bottom:16px; }
.tl-dot { position:absolute; right:-16px; width:14px; height:14px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 0 1px #e5e7eb; top:4px; }
.tl-card { background:#f8fafc; border:1px solid #e5e7eb; border-radius:8px; padding:10px 12px; margin-right:8px; }

/* Report types */
.rep-types { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px; }
.rep-type { padding:7px 14px; border-radius:8px; font-size:.8rem; font-weight:600; cursor:pointer;
  border:2px solid #e5e7eb; background:#fff; color:#6b7280; }
.rep-type.active { border-color:#16a34a; background:#f0fdf4; color:#166534; }

.empty { text-align:center; padding:32px; color:#9ca3af; }
.upcoming-today { background:#f0fdf4 !important; border-color:#bbf7d0 !important; }
</style>

<div class="ph" [attr.dir]="lang === 'ar' ? 'rtl' : 'ltr'" [attr.lang]="lang">
  <div class="ph-head">
    <h1><span class="material-icons" style="color:#16a34a">celebration</span>الإجازات الرسمية</h1>
    <div style="display:flex; gap:8px; align-items:center; margin-right:auto">
      <select class="fc" [(ngModel)]="filterYear" (change)="onYearChange()" style="width:100px">
        <option *ngFor="let y of years" [value]="y">{{ y }}</option>
      </select>
      <span class="badge" style="background:#f0fdf4;color:#166534" *ngIf="upcoming().length > 0">
        <span class="material-icons" style="font-size:12px">schedule</span>
        {{ upcoming()[0]?.nameAr }} خلال {{ upcoming()[0]?.daysUntil }} يوم
      </span>
    </div>
  </div>

  <!-- Tabs -->
  <div class="tabs">
    <div class="tab" [class.active]="view==='dashboard'" (click)="setView('dashboard')">
      <span class="material-icons" style="font-size:15px">dashboard</span>لوحة الإجازات
    </div>
    <div class="tab" [class.active]="view==='list'" (click)="setView('list')">
      <span class="material-icons" style="font-size:15px">list</span>القائمة
    </div>
    <div class="tab" [class.active]="view==='calendar'" (click)="setView('calendar')">
      <span class="material-icons" style="font-size:15px">calendar_month</span>التقويم
    </div>
    <div class="tab" *ngIf="isHROrPayroll" [class.active]="view==='reports'" (click)="setView('reports')">
      <span class="material-icons" style="font-size:15px">bar_chart</span>التقارير
    </div>
  </div>

  <!-- ════════════════ DASHBOARD ════════════════ -->
  <div class="body" *ngIf="view==='dashboard'">
    <app-skeleton-kpi-cards *ngIf="loading()" [count]="4" />
    <div class="stat-grid" *ngIf="!loading()">
      <div class="stat-box" style="border-top-color:#16a34a">
        <div class="num" style="color:#166534">{{ holidays().length }}</div>
        <div class="lbl">إجمالي الإجازات</div>
      </div>
      <div class="stat-box" style="border-top-color:#16a34a">
        <div class="num" style="color:#16a34a">{{ upcoming().length }}</div>
        <div class="lbl">إجازة قادمة</div>
      </div>
      <div class="stat-box" style="border-top-color:#16a34a">
        <div class="num" style="color:#15803d">{{ religiousCount() }}</div>
        <div class="lbl">إجازات دينية</div>
      </div>
      <div class="stat-box" style="border-top-color:#16a34a">
        <div class="num" style="color:#16a34a">{{ totalDays() }}</div>
        <div class="lbl">إجمالي أيام الإجازة</div>
      </div>
    </div>

    <!-- Next holiday banner -->
    <div class="alert alert-warning" *ngIf="!loading() && upcoming()[0] as next" style="display:flex; align-items:center; gap:12px; padding:14px 18px; margin-bottom:16px;">
      <span class="material-icons" style="font-size:2rem; opacity:.7">celebration</span>
      <div>
        <div style="font-weight:800; font-size:1rem">{{ next.nameAr }}</div>
        <div style="font-size:.82rem">{{ next.date | date:'EEEE، dd MMMM yyyy' }} ·
          {{ next.daysUntil === 0 ? 'اليوم!' : next.daysUntil === 1 ? 'غداً' : 'بعد ' + next.daysUntil + ' يوم' }}
        </div>
      </div>
      <span class="badge" style="margin-right:auto" [style.background]="typeBg(next.type)" [style.color]="typeClr(next.type)">
        {{ typeLabel(next.type) }}
      </span>
    </div>

    <!-- Upcoming timeline -->
    <app-skeleton-card *ngIf="loading()" />
    <div class="card" *ngIf="!loading()">
      <div class="card-hd"><h3><span class="material-icons">upcoming</span>الإجازات القادمة لسنة {{ filterYear }}</h3>
        <button *ngIf="isHR" class="btn btn-primary btn-sm" (click)="startAdd()">
          <span class="material-icons" style="font-size:13px">add</span>إضافة
        </button>
      </div>
      <div class="card-bd">
        <div class="timeline" *ngIf="upcoming().length; else noUpcoming">
          <div class="tl-item" *ngFor="let h of upcoming()">
            <div class="tl-dot" [style.background]="typeClr(h.type)"></div>
            <div class="tl-card" [class.upcoming-today]="h.daysUntil <= 7">
              <div style="display:flex; align-items:center; justify-content:space-between">
                <div>
                  <div style="font-weight:700; font-size:.88rem">{{ h.nameAr }}</div>
                  <div style="font-size:.75rem; color:#6b7280">
                    {{ h.date | date:'dd MMMM yyyy' }}
                    <span *ngIf="h.endDate"> — {{ h.endDate | date:'dd MMMM' }}</span>
                    · {{ daysOfHoliday(h) }} يوم
                  </div>
                </div>
                <div style="display:flex; gap:6px; align-items:center">
                  <span class="badge" [style.background]="typeBg(h.type)" [style.color]="typeClr(h.type)">{{ typeLabel(h.type) }}</span>
                  <span *ngIf="h.daysUntil <= 7" class="badge" style="background:#ecfdf5;color:#166534">{{ h.daysUntil === 0 ? 'اليوم' : h.daysUntil + ' أيام' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <ng-template #noUpcoming>
          <div class="empty"><span class="material-icons" style="font-size:2rem;display:block">event_busy</span>لا توجد إجازات قادمة هذا العام</div>
        </ng-template>
      </div>
    </div>

    <!-- Past holidays this year -->
    <app-skeleton-table *ngIf="loading()" [rows]="6" [cols]="4"></app-skeleton-table>
    <div class="card" *ngIf="!loading() && past().length">
      <div class="card-hd"><h3><span class="material-icons">history</span>إجازات مضت هذا العام ({{ past().length }})</h3></div>
      <div class="card-bd" style="padding:0">
        <table class="tbl">
          <thead><tr><th>المناسبة</th><th>التاريخ</th><th>النوع</th><th>أيام</th></tr></thead>
          <tbody>
            <tr *ngFor="let h of past()">
              <td style="font-weight:600">{{ h.nameAr }}<br><small style="color:#9ca3af; font-size:.72rem">{{ h.nameEn }}</small></td>
              <td style="font-size:.8rem; color:#6b7280">{{ h.date | date:'dd/MM/yyyy' }}</td>
              <td><span class="badge" [style.background]="typeBg(h.type)" [style.color]="typeClr(h.type)">{{ typeLabel(h.type) }}</span></td>
              <td style="text-align:center; font-weight:700; color:#6b7280">{{ daysOfHoliday(h) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ════════════════ LIST ════════════════ -->
  <div class="body" *ngIf="view==='list'">

    <!-- HR actions bar -->
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px" *ngIf="isHR">
      <div style="display:flex; gap:8px">
        <button class="btn btn-primary" (click)="startAdd()">
          <span class="material-icons" style="font-size:14px">add</span>إضافة إجازة
        </button>
        <button class="btn btn-secondary" (click)="generateRecurring()" [disabled]="genLoading()">
          <span class="material-icons" style="font-size:14px">autorenew</span>
          {{ genLoading() ? 'جاري التوليد...' : 'توليد إجازات ' + (filterYear+1) }}
        </button>
      </div>
      <div *ngIf="genResult()" class="alert alert-success" style="margin:0; padding:6px 12px">{{ genResult() }}</div>
    </div>

    <!-- Form (add/edit) -->
    <div class="card" *ngIf="showForm" style="margin-bottom:16px">
      <div class="card-hd">
        <h3><span class="material-icons">{{ editId?'edit':'add_circle' }}</span>{{ editId?'تعديل الإجازة':'إضافة إجازة رسمية' }}</h3>
        <button class="btn btn-secondary btn-sm" (click)="cancelForm()">إلغاء</button>
      </div>
      <div class="card-bd">
        <div class="fg2">
          <div class="fg"><label>الاسم بالعربية <span style="color:#dc2626">*</span></label>
            <input type="text" class="fc" [(ngModel)]="form.nameAr" placeholder="مثال: يوم الاستقلال">
          </div>
          <div class="fg"><label>الاسم بالإنجليزية</label>
            <input type="text" class="fc" [(ngModel)]="form.nameEn" placeholder="Independence Day">
          </div>
          <div class="fg"><label>تاريخ البداية <span style="color:#dc2626">*</span></label>
            <input type="date" class="fc" [(ngModel)]="form.date">
          </div>
          <div class="fg"><label>تاريخ النهاية (للإجازة متعددة الأيام)</label>
            <input type="date" class="fc" [(ngModel)]="form.endDate">
          </div>
          <div class="fg"><label>نوع الإجازة</label>
            <select class="fc" [(ngModel)]="form.type">
              <option value="national">وطنية</option>
              <option value="religious">دينية</option>
              <option value="company">خاصة بالشركة</option>
            </select>
          </div>
          <div class="fg"><label>نطاق التطبيق</label>
            <select class="fc" [(ngModel)]="form.scopeType">
              <option value="all">جميع الموظفين</option>
              <option value="departments">أقسام محددة</option>
            </select>
          </div>
          <div class="fg"><label>الحالة</label>
            <select class="fc" [(ngModel)]="form.status">
              <option value="active">نشطة</option>
              <option value="inactive">غير نشطة</option>
            </select>
          </div>
        </div>
        <div class="fg">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:.85rem; font-weight:600">
            <input type="checkbox" [(ngModel)]="form.isRecurring" style="width:15px; height:15px">
            تتكرر سنوياً في نفس التاريخ (للإجازات ذات التاريخ الثابت)
          </label>
        </div>
        <div class="fg"><label>الوصف</label>
          <textarea class="fc" rows="2" [(ngModel)]="form.description" placeholder="وصف اختياري..."></textarea>
        </div>
        <div class="alert alert-danger"  *ngIf="formError()">{{ formError() }}</div>
        <div class="alert alert-success" *ngIf="formSuccess()">{{ formSuccess() }}</div>
        <button class="btn btn-primary" (click)="saveForm()" [disabled]="saving">
          <span class="material-icons" style="font-size:14px">save</span>{{ saving?'جاري الحفظ...':'حفظ' }}
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <div><label>بحث</label>
        <input type="text" class="fc" [(ngModel)]="listFilter.search" placeholder="اسم الإجازة..." style="width:180px">
      </div>
      <div><label>النوع</label>
        <select class="fc" [(ngModel)]="listFilter.type">
          <option value="">الكل</option>
          <option value="national">وطنية</option>
          <option value="religious">دينية</option>
          <option value="company">شركة</option>
        </select>
      </div>
      <div><label>الحالة</label>
        <select class="fc" [(ngModel)]="listFilter.status">
          <option value="">الكل</option>
          <option value="active">نشطة</option>
          <option value="inactive">غير نشطة</option>
        </select>
      </div>
      <button class="btn btn-primary" (click)="loadHolidays()">
        <span class="material-icons" style="font-size:14px">search</span>بحث
      </button>
    </div>

    <div class="card">
      <div class="card-hd">
        <h3><span class="material-icons">list_alt</span>قائمة الإجازات — {{ filterYear }} ({{ filteredList().length }})</h3>
      </div>
      <div class="card-bd" style="padding:0">
        <table class="tbl">
          <thead><tr>
            <th>المناسبة</th>
            <th>التاريخ</th>
            <th>أيام</th>
            <th>النوع</th>
            <th>النطاق</th>
            <th>متكرر</th>
            <th>الحالة</th>
            <th *ngIf="isHR">إجراء</th>
          </tr></thead>
          <tbody>
            <tr *ngFor="let h of filteredList()" [style.opacity]="h.status==='inactive'?'0.6':'1'">
              <td>
                <div style="font-weight:700; font-size:.88rem">{{ h.nameAr }}</div>
                <div style="font-size:.72rem; color:#9ca3af">{{ h.nameEn }}</div>
                <div *ngIf="h.description" style="font-size:.7rem; color:#6b7280; margin-top:2px">{{ h.description }}</div>
              </td>
              <td style="font-size:.82rem; white-space:nowrap">
                {{ h.date | date:'dd MMMM' }}
                <span *ngIf="h.endDate"> — {{ h.endDate | date:'dd MMMM yyyy' }}</span>
                <span *ngIf="!h.endDate"> {{ h.date | date:'yyyy' }}</span>
                <div style="font-size:.7rem; color:#9ca3af; margin-top:1px">{{ dayOfWeek(h.date) }}</div>
              </td>
              <td style="text-align:center">
                <span style="font-weight:800; font-size:1rem; color:#166534">{{ daysOfHoliday(h) }}</span>
                <span style="font-size:.7rem; color:#6b7280"> يوم</span>
              </td>
              <td>
                <span class="badge" [style.background]="typeBg(h.type)" [style.color]="typeClr(h.type)">
                  {{ typeLabel(h.type) }}
                </span>
              </td>
              <td style="font-size:.78rem; color:#6b7280">
                <span *ngIf="h.scopeType==='all'">الجميع</span>
                <span *ngIf="h.scopeType==='departments'">أقسام محددة</span>
              </td>
              <td style="text-align:center">
                <span *ngIf="h.isRecurring" class="badge" style="background:#f0fdf4;color:#16a34a">
                  <span class="material-icons" style="font-size:11px">autorenew</span>نعم
                </span>
                <span *ngIf="!h.isRecurring" style="color:#d1d5db; font-size:.8rem">—</span>
              </td>
              <td>
                <span class="badge" [style.background]="h.status==='active'?'#f0fdf4':'#f9fafb'"
                  [style.color]="h.status==='active'?'#16a34a':'#9ca3af'">
                  {{ statusLabel(h.status) }}
                </span>
              </td>
              <td *ngIf="isHR">
                <div style="display:flex; gap:4px">
                  <button class="btn btn-secondary btn-sm" (click)="startEdit(h)">
                    <span class="material-icons" style="font-size:12px">edit</span>
                  </button>
                  <button class="btn btn-danger btn-sm" (click)="deleteHoliday(h.id)">
                    <span class="material-icons" style="font-size:12px">delete</span>
                  </button>
                </div>
              </td>
            </tr>
            <tr *ngIf="!filteredList().length">
              <td [attr.colspan]="isHR?8:7" class="empty">لا توجد إجازات</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ════════════════ CALENDAR ════════════════ -->
  <div class="body" *ngIf="view==='calendar'">
    <div class="card" style="margin-bottom:14px">
      <div class="card-bd" style="padding:12px 16px">
        <div class="cal-legend">
          <span><span class="dot" style="background:#166534"></span>وطنية</span>
          <span><span class="dot" style="background:#15803d"></span>دينية</span>
          <span><span class="dot" style="background:#16a34a"></span>خاصة بالشركة</span>
          <span><span class="dot" style="background:#dcfce7; border:1px solid #86efac"></span>اليوم</span>
          <span style="color:#9ca3af; font-size:.72rem">· انقر على اليوم لتفاصيله</span>
        </div>
      </div>
    </div>
    <div class="cal-grid">
      <div class="cal-month" *ngFor="let month of calMonths(); let m=index">
        <div class="cal-month-hd">{{ monthName(m+1) }} {{ filterYear }}</div>
        <div class="cal-week-hd"><span *ngFor="let d of dayNamesAr">{{ d }}</span></div>
        <div class="cal-days">
          <div class="cal-day" *ngFor="let d of month"
            [class.other]="d.other"
            [class.today]="d.isToday"
            [class.holiday]="!!d.holiday"
            [class.national]="d.holiday?.type==='national'"
            [class.religious]="d.holiday?.type==='religious'"
            [class.company]="d.holiday?.type==='company'"
            [title]="d.holiday ? d.holiday.nameAr : ''">
            {{ d.day }}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ════════════════ REPORTS ════════════════ -->
  <div class="body" *ngIf="view==='reports' && isHROrPayroll">
    <div class="card">
      <div class="card-hd"><h3><span class="material-icons">assessment</span>تقارير الإجازات الرسمية</h3></div>
      <div class="card-bd">
        <div class="rep-types">
          <div class="rep-type" [class.active]="repType==='annual'"     (click)="repType='annual';     loadReport()">الملخص السنوي</div>
          <div class="rep-type" [class.active]="repType==='by-type'"    (click)="repType='by-type';    loadReport()">حسب النوع</div>
          <div class="rep-type" [class.active]="repType==='monthly'"    (click)="repType='monthly';    loadReport()">التوزيع الشهري</div>
          <div class="rep-type" [class.active]="repType==='work-report'" (click)="repType='work-report'; loadReport()">من عمل في الإجازات</div>
        </div>

        <!-- Annual summary -->
        <div *ngIf="repType==='annual' && reportData() as r">
          <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:16px">
            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:14px; text-align:center">
              <div style="font-size:2rem; font-weight:900; color:#166534">{{ r.total }}</div>
              <div style="font-size:.75rem; color:#166534">إجمالي الإجازات</div>
            </div>
            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:14px; text-align:center">
              <div style="font-size:2rem; font-weight:900; color:#16a34a">{{ r.totalDays }}</div>
              <div style="font-size:.75rem; color:#16a34a">إجمالي الأيام</div>
            </div>
            <div style="background:#ecfdf5; border:1px solid #bbf7d0; border-radius:10px; padding:14px; text-align:center">
              <div style="font-size:2rem; font-weight:900; color:#166534">{{ r.recurring }}</div>
              <div style="font-size:.75rem; color:#166534">إجازات متكررة سنوياً</div>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:16px">
            <div style="text-align:center; padding:10px; background:#f8fafc; border-radius:8px; border:1px solid #e5e7eb">
              <div style="font-weight:800; color:#166534; font-size:1.2rem">{{ r.national }}</div>
              <div style="font-size:.72rem; color:#6b7280">وطنية</div>
            </div>
            <div style="text-align:center; padding:10px; background:#ecfdf5; border-radius:8px; border:1px solid #bbf7d0">
              <div style="font-weight:800; color:#15803d; font-size:1.2rem">{{ r.religious }}</div>
              <div style="font-size:.72rem; color:#6b7280">دينية</div>
            </div>
            <div style="text-align:center; padding:10px; background:#f0fdf4; border-radius:8px; border:1px solid #bbf7d0">
              <div style="font-weight:800; color:#16a34a; font-size:1.2rem">{{ r.company }}</div>
              <div style="font-size:.72rem; color:#6b7280">خاصة بالشركة</div>
            </div>
          </div>
          <table class="tbl">
            <thead><tr><th>المناسبة</th><th>التاريخ</th><th>النوع</th><th style="text-align:center">أيام</th><th>الحالة</th></tr></thead>
            <tbody>
              <tr *ngFor="let h of r.list">
                <td style="font-weight:600">{{ h.nameAr }}</td>
                <td style="font-size:.8rem">{{ h.date | date:'dd/MM/yyyy' }}</td>
                <td><span class="badge" [style.background]="typeBg(h.type)" [style.color]="typeClr(h.type)">{{ typeLabel(h.type) }}</span></td>
                <td style="text-align:center; font-weight:700; color:#166534">{{ h.days }}</td>
                <td><span class="badge" [style.background]="h.status==='active'?'#f0fdf4':'#f9fafb'" [style.color]="h.status==='active'?'#16a34a':'#9ca3af'">{{ statusLabel(h.status) }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- By type -->
        <div *ngIf="repType==='by-type' && reportData() as groups">
          <div *ngFor="let g of groups" style="margin-bottom:16px">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px">
              <span class="badge" [style.background]="typeBg(g.type)" [style.color]="typeClr(g.type)">{{ typeLabel(g.type) }}</span>
              <span style="font-size:.82rem; color:#6b7280">{{ g.count }} إجازة · {{ g.totalDays }} يوم</span>
            </div>
            <table class="tbl">
              <thead><tr><th>المناسبة</th><th>التاريخ</th></tr></thead>
              <tbody>
                <tr *ngFor="let h of g.holidays">
                  <td style="font-weight:600">{{ h.nameAr }}</td>
                  <td style="font-size:.8rem">{{ h.date | date:'dd MMMM yyyy' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Monthly -->
        <div *ngIf="repType==='monthly'" class="tbl-wrap">
          <table class="tbl">
            <thead><tr><th>الشهر</th><th style="text-align:center">عدد الإجازات</th><th>الإجازات</th></tr></thead>
            <tbody>
              <tr *ngFor="let m of reportData()">
                <td style="font-weight:700">{{ monthName(m.month) }}</td>
                <td style="text-align:center">
                  <span *ngIf="m.count > 0" style="font-weight:800; color:#166534">{{ m.count }}</span>
                  <span *ngIf="!m.count" style="color:#d1d5db">—</span>
                </td>
                <td style="font-size:.78rem; color:#374151">
                  <span *ngFor="let h of m.holidays; let last=last">
                    <span class="badge" [style.background]="typeBg(h.type)" [style.color]="typeClr(h.type)" style="margin-left:4px">{{ h.nameAr }}</span>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Work report -->
        <div *ngIf="repType==='work-report'">
          <div class="alert alert-info" style="margin-bottom:12px">
            <span class="material-icons" style="font-size:14px;vertical-align:middle">info</span>
            الموظفون الذين سُجّل حضورهم في أيام الإجازات الرسمية لسنة {{ filterYear }}.
            العمل في أيام الإجازة يستحق معدل × 2.00 وفق السياسة الافتراضية.
          </div>
          <table class="tbl">
            <thead><tr><th>الموظف</th><th>القسم</th><th style="text-align:center">أيام العمل</th><th style="text-align:center">الساعات الإجمالية</th></tr></thead>
            <tbody>
              <tr *ngFor="let r of reportData()">
                <td style="font-weight:600">{{ r.employeeName }}</td>
                <td style="font-size:.78rem; color:#6b7280">{{ r.dept || '—' }}</td>
                <td style="text-align:center; font-weight:700; color:#dc2626">{{ r.daysWorked }}</td>
                <td style="text-align:center; font-weight:700; color:#166534">{{ r.totalHours | number:'1.1-1' }}س</td>
              </tr>
              <tr *ngIf="!reportData().length"><td colspan="4" class="empty">لم يعمل أحد في الإجازات الرسمية</td></tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  </div>
</div>
  `
})
export class HolidaysComponent implements OnInit {
  view: HView = 'dashboard';
  filterYear = new Date().getFullYear();
  years = [2024, 2025, 2026, 2027, 2028];
  dayNamesAr = DAYS_AR;

  holidays    = signal<any[]>([]);
  upcoming    = signal<any[]>([]);
  reportData  = signal<any>(null);
  loading     = signal(true);
  genLoading  = signal(false);
  genResult   = signal('');
  formError   = signal('');
  formSuccess = signal('');

  saving    = false;
  showForm  = false;
  editId: number | null = null;

  listFilter = { search: '', type: '', status: '' };
  repType = 'annual';

  form = {
    nameAr: '', nameEn: '', date: '', endDate: '', type: 'national',
    isRecurring: false, status: 'active', scopeType: 'all',
    description: '', notes: '', departmentIds: [] as number[]
  };

  filteredList = computed(() => {
    let list = this.holidays();
    if (this.listFilter.search) list = list.filter(h => h.nameAr?.includes(this.listFilter.search) || h.nameEn?.includes(this.listFilter.search));
    if (this.listFilter.type)   list = list.filter(h => h.type === this.listFilter.type);
    if (this.listFilter.status) list = list.filter(h => h.status === this.listFilter.status);
    return list;
  });

  nationalCount  = computed(() => this.holidays().filter(h => h.type === 'national').length);
  religiousCount = computed(() => this.holidays().filter(h => h.type === 'religious').length);
  upcoming_      = computed(() => this.upcoming());
  past           = computed(() => {
    const today = new Date();
    return this.holidays().filter(h => new Date(h.date) < today).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });
  totalDays = computed(() => this.holidays().reduce((sum, h) => sum + (h.days || 1), 0));

  constructor(public auth: AuthService, private api: ApiService) {}
  get lang() { return this.auth.lang; }

  get isHR()          { return this.auth.hasRole('hradmin'); }
  get isHROrPayroll() { return this.auth.hasRole('hradmin', 'payrolladmin', 'manager'); }

  ngOnInit() {
    this.loadHolidays();
    this.loadUpcoming();
  }

  setView(v: HView) {
    this.view = v;
    if (v === 'reports') this.loadReport();
  }

  onYearChange() {
    this.loadHolidays();
    this.loadUpcoming();
  }

  loadHolidays() {
    this.loading.set(true);
    const p: any = { year: this.filterYear };
    this.api.get<any>('/api/public-holidays', p).subscribe({
      next: r => {
        this.holidays.set(r.data || []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  loadUpcoming() {
    this.api.get<any>('/api/public-holidays/upcoming', { days: 90 }).subscribe({
      next: r => this.upcoming.set(r.data || []),
      error: () => {}
    });
  }

  loadReport() {
    this.api.get<any>('/api/public-holidays/reports', { type: this.repType, year: this.filterYear }).subscribe({
      next: r => this.reportData.set(r.data),
      error: () => {}
    });
  }

  generateRecurring() {
    this.genLoading.set(true); this.genResult.set('');
    this.api.post<any>('/api/public-holidays/generate-recurring', { year: this.filterYear + 1 }).subscribe({
      next: r => { this.genLoading.set(false); this.genResult.set(r.message || 'تم التوليد'); },
      error: e => { this.genLoading.set(false); this.genResult.set(e?.error?.message || 'خطأ'); }
    });
  }

  startAdd() {
    this.editId = null;
    this.form = { nameAr:'', nameEn:'', date: new Date().toISOString().slice(0,10), endDate:'',
      type:'national', isRecurring:false, status:'active', scopeType:'all', description:'', notes:'', departmentIds:[] };
    this.showForm = true; this.formError.set(''); this.formSuccess.set('');
    this.view = 'list';
  }

  startEdit(h: any) {
    this.editId = h.id;
    this.form = { nameAr: h.nameAr, nameEn: h.nameEn||'',
      date: h.date?.slice(0,10)||'', endDate: h.endDate?.slice(0,10)||'',
      type: h.type||'national', isRecurring: h.isRecurring||false,
      status: h.status||'active', scopeType: h.scopeType||'all',
      description: h.description||'', notes: h.notes||'', departmentIds:[] };
    this.showForm = true; this.formError.set(''); this.formSuccess.set('');
  }

  cancelForm() { this.showForm = false; this.editId = null; }

  saveForm() {
    this.formError.set(''); this.formSuccess.set('');
    if (!this.form.nameAr) { this.formError.set('اسم الإجازة مطلوب'); return; }
    if (!this.form.date)   { this.formError.set('التاريخ مطلوب'); return; }
    this.saving = true;
    const body = { ...this.form, departmentIds: this.form.departmentIds };
    const call = this.editId
      ? this.api.put<any>(`/api/public-holidays/${this.editId}`, body)
      : this.api.post<any>('/api/public-holidays', body);
    call.subscribe({
      next: () => {
        this.saving = false;
        this.formSuccess.set(this.editId ? 'تم التحديث.' : 'تمت الإضافة.');
        this.showForm = false; this.editId = null;
        this.loadHolidays(); this.loadUpcoming();
      },
      error: e => { this.saving = false; this.formError.set(e?.error?.message || 'خطأ'); }
    });
  }

  deleteHoliday(id: number) {
    if (!confirm('هل أنت متأكد من حذف هذه الإجازة؟')) return;
    this.api.delete<any>(`/api/public-holidays/${id}`).subscribe({
      next: () => this.loadHolidays(), error: () => {}
    });
  }

  // Calendar helpers
  calMonths(): any[][] {
    const today = new Date();
    return Array.from({ length: 12 }, (_, m) => {
      const firstDay = new Date(this.filterYear, m, 1);
      const lastDay  = new Date(this.filterYear, m + 1, 0);
      const cells: any[] = [];
      // Leading blanks (0=Sun, adjust for RTL start=Sat→0 or Sun→0)
      let startDow = firstDay.getDay(); // 0=Sun
      for (let i = 0; i < startDow; i++) cells.push({ day: '', other: true });
      for (let d = 1; d <= lastDay.getDate(); d++) {
        const date = new DateOnly(this.filterYear, m + 1, d);
        const dateStr = `${this.filterYear}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isToday = today.getFullYear() === this.filterYear && today.getMonth() === m && today.getDate() === d;
        const holiday = this.holidays().find(h => {
          const hStart = h.date?.slice(0,10);
          const hEnd   = h.endDate?.slice(0,10) || hStart;
          return dateStr >= hStart && dateStr <= hEnd;
        });
        cells.push({ day: d, isToday, holiday: holiday || null });
      }
      return cells;
    });
  }

  // Label helpers
  typeLabel(t: string)  { return TYPES_AR[t]  || t; }
  typeClr(t: string)    { return TYPES_CLR[t] || '#6b7280'; }
  typeBg(t: string)     { return TYPES_BG[t]  || '#f3f4f6'; }
  statusLabel(s: string){ return STATUS_AR[s] || s; }
  monthName(m: number)  { return MONTHS_AR[m - 1] || ''; }
  dayOfWeek(d: string)  {
    if (!d) return '';
    const wd = new Date(d).getDay();
    return ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][wd];
  }
  daysOfHoliday(h: any): number {
    if (!h.endDate) return 1;
    const s = new Date(h.date); const e = new Date(h.endDate);
    return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
  }
}

// Helper class used in calMonths()
class DateOnly {
  constructor(public year: number, public month: number, public day: number) {}
}


