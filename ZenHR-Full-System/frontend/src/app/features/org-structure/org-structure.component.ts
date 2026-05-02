import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../../core/services/toast.service';
import { I18nService } from '../../core/services/i18n.service';
import { getErrorMessage } from '../../core/utils/error-message';

interface OrgNode {
  id: number;
  nameAr: string;
  nameEn: string;
  nodeType: string;
  parentId: number | null;
  companyId: number;
  code?: string;
  sortOrder?: number;
  isDeleted: boolean;
  children?: OrgNode[];
}

@Component({
  selector: 'app-org-structure',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-6 space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">{{ lang === 'ar' ? 'الهيكل التنظيمي' : 'Organizational Structure' }}</h1>
          <p class="text-sm text-gray-500 mt-1">{{ lang === 'ar' ? 'إدارة الهيكل التنظيمي للشركة' : 'Manage company organizational structure' }}</p>
        </div>
        <button (click)="openAddModal(null)" class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          <span class="material-symbols-rounded text-lg">add</span>
          {{ lang === 'ar' ? 'إضافة وحدة' : 'Add Unit' }}
        </button>
      </div>

      <!-- Loading -->
      <div *ngIf="loading()" class="flex items-center justify-center py-20">
        <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>

      <!-- Error -->
      <div *ngIf="error()" class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">{{ error() }}</div>

      <!-- Tree -->
      <div *ngIf="!loading() && !error()" class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div *ngIf="tree().length === 0" class="text-center py-16 text-gray-500">
          <span class="material-symbols-rounded text-5xl text-gray-300">account_tree</span>
          <p class="mt-2">{{ lang === 'ar' ? 'لا توجد وحدات تنظيمية بعد' : 'No organizational units yet' }}</p>
        </div>
        <ul *ngIf="tree().length > 0" class="divide-y divide-gray-100">
          <ng-container *ngFor="let node of tree()">
            <ng-container *ngTemplateOutlet="nodeTemplate; context: { node: node, depth: 0 }"></ng-container>
          </ng-container>
        </ul>
      </div>
    </div>

    <!-- Node Template -->
    <ng-template #nodeTemplate let-node="node" let-depth="depth">
      <li class="hover:bg-gray-50 transition-colors">
        <div class="flex items-center justify-between px-4 py-3" [style.paddingInlineStart.px]="16 + depth * 24">
          <div class="flex items-center gap-3">
            <span class="material-symbols-rounded text-lg" [class]="nodeTypeIcon(node.nodeType)">{{ nodeTypeIconName(node.nodeType) }}</span>
            <div>
              <div class="font-medium text-gray-900">{{ lang === 'ar' ? node.nameAr : node.nameEn }}</div>
              <div class="text-xs text-gray-500">{{ nodeTypeLabel(node.nodeType) }} {{ node.code ? '· ' + node.code : '' }}</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button (click)="openAddModal(node)" class="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600" title="{{ lang === 'ar' ? 'إضافة وحدة فرعية' : 'Add child' }}">
              <span class="material-symbols-rounded text-base">add</span>
            </button>
            <button (click)="openEditModal(node)" class="p-1.5 rounded-lg hover:bg-yellow-50 text-yellow-600" title="{{ lang === 'ar' ? 'تعديل' : 'Edit' }}">
              <span class="material-symbols-rounded text-base">edit</span>
            </button>
            <button (click)="deleteNode(node)" class="p-1.5 rounded-lg hover:bg-red-50 text-red-600" title="{{ lang === 'ar' ? 'حذف' : 'Delete' }}">
              <span class="material-symbols-rounded text-base">delete</span>
            </button>
          </div>
        </div>
        <ul *ngIf="node.children && node.children.length > 0" class="divide-y divide-gray-100">
          <ng-container *ngFor="let child of node.children">
            <ng-container *ngTemplateOutlet="nodeTemplate; context: { node: child, depth: depth + 1 }"></ng-container>
          </ng-container>
        </ul>
      </li>
    </ng-template>

    <!-- Modal -->
    <div *ngIf="showModal()" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div class="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 class="text-lg font-semibold text-gray-900">{{ editingNode() ? (lang === 'ar' ? 'تعديل الوحدة' : 'Edit Unit') : (lang === 'ar' ? 'إضافة وحدة جديدة' : 'Add New Unit') }}</h2>
          <button (click)="closeModal()" class="p-2 hover:bg-gray-100 rounded-lg">
            <span class="material-symbols-rounded text-xl text-gray-500">close</span>
          </button>
        </div>
        <form (ngSubmit)="saveNode()" class="p-5 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ lang === 'ar' ? 'الاسم بالعربية' : 'Arabic Name' }} *</label>
            <input [(ngModel)]="form.nameAr" name="nameAr" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" dir="rtl">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ lang === 'ar' ? 'الاسم بالإنجليزية' : 'English Name' }} *</label>
            <input [(ngModel)]="form.nameEn" name="nameEn" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ lang === 'ar' ? 'النوع' : 'Type' }} *</label>
            <select [(ngModel)]="form.nodeType" name="nodeType" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="company">{{ lang === 'ar' ? 'شركة' : 'Company' }}</option>
              <option value="branch">{{ lang === 'ar' ? 'فرع' : 'Branch' }}</option>
              <option value="department">{{ lang === 'ar' ? 'قسم' : 'Department' }}</option>
              <option value="section">{{ lang === 'ar' ? 'شعبة' : 'Section' }}</option>
              <option value="unit">{{ lang === 'ar' ? 'وحدة' : 'Unit' }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ lang === 'ar' ? 'الكود' : 'Code' }}</label>
            <input [(ngModel)]="form.code" name="code" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div class="flex gap-3 pt-2">
            <button type="submit" [disabled]="saving()" class="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {{ saving() ? (lang === 'ar' ? 'جارٍ الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ' : 'Save') }}
            </button>
            <button type="button" (click)="closeModal()" class="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
              {{ lang === 'ar' ? 'إلغاء' : 'Cancel' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `
})
export class OrgStructureComponent implements OnInit {
  tree = signal<OrgNode[]>([]);
  loading = signal(true);
  error = signal('');
  showModal = signal(false);
  saving = signal(false);
  editingNode = signal<OrgNode | null>(null);
  parentNode = signal<OrgNode | null>(null);

  form = { nameAr: '', nameEn: '', nodeType: 'department', code: '' };

  constructor(private http: HttpClient, private toast: ToastService, private i18n: I18nService) {}

  get lang() { return this.i18n.currentLang; }

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.http.get<{ success: boolean; data: OrgNode[] }>('/api/org-nodes/tree').subscribe({
      next: res => {
        this.tree.set(res.data ?? []);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(getErrorMessage(err, 'Failed to load org structure'));
        this.loading.set(false);
      }
    });
  }

  openAddModal(parent: OrgNode | null) {
    this.editingNode.set(null);
    this.parentNode.set(parent);
    this.form = { nameAr: '', nameEn: '', nodeType: 'department', code: '' };
    this.showModal.set(true);
  }

  openEditModal(node: OrgNode) {
    this.editingNode.set(node);
    this.parentNode.set(null);
    this.form = { nameAr: node.nameAr, nameEn: node.nameEn, nodeType: node.nodeType, code: node.code ?? '' };
    this.showModal.set(true);
  }

  closeModal() { this.showModal.set(false); }

  saveNode() {
    if (!this.form.nameAr || !this.form.nameEn) return;
    this.saving.set(true);
    const editing = this.editingNode();
    const parent = this.parentNode();
    const body = { ...this.form, parentId: parent?.id ?? null };

    const req = editing
      ? this.http.put<{ success: boolean; data: OrgNode }>(`/api/org-nodes/${editing.id}`, body)
      : this.http.post<{ success: boolean; data: OrgNode }>('/api/org-nodes', body);

    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeModal();
        this.toast.success(this.lang === 'ar' ? 'تم الحفظ بنجاح' : 'Saved successfully');
        this.load();
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(getErrorMessage(err, 'Save failed'));
      }
    });
  }

  deleteNode(node: OrgNode) {
    const msg = this.lang === 'ar'
      ? `هل أنت متأكد من حذف "${node.nameAr}"؟`
      : `Are you sure you want to delete "${node.nameEn}"?`;
    if (!confirm(msg)) return;
    this.http.delete(`/api/org-nodes/${node.id}`).subscribe({
      next: () => {
        this.toast.success(this.lang === 'ar' ? 'تم الحذف' : 'Deleted');
        this.load();
      },
      error: err => this.toast.error(getErrorMessage(err, 'Delete failed'))
    });
  }

  nodeTypeLabel(type: string): string {
    const map: Record<string, [string, string]> = {
      company: ['شركة', 'Company'],
      branch: ['فرع', 'Branch'],
      department: ['قسم', 'Department'],
      section: ['شعبة', 'Section'],
      unit: ['وحدة', 'Unit'],
    };
    const pair = map[type];
    if (!pair) return type;
    return this.lang === 'ar' ? pair[0] : pair[1];
  }

  nodeTypeIconName(type: string): string {
    const icons: Record<string, string> = { company: 'domain', branch: 'store', department: 'business', section: 'folder', unit: 'group' };
    return icons[type] ?? 'circle';
  }

  nodeTypeIcon(type: string): string {
    const colors: Record<string, string> = { company: 'text-blue-600', branch: 'text-green-600', department: 'text-purple-600', section: 'text-orange-600', unit: 'text-gray-500' };
    return colors[type] ?? 'text-gray-400';
  }
}
