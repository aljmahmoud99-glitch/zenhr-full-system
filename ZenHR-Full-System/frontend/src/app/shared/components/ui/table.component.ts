import { Component, Input, Output, EventEmitter, ContentChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
}

@Component({
  selector: 'ui-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-card">
      @if (hasToolbar) {
        <div class="px-5 py-3 border-b border-neutral-200 flex items-center justify-between gap-4">
          <ng-content select="[table-toolbar]"></ng-content>
        </div>
      }
      
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="bg-neutral-50">
              @for (col of columns; track col.key) {
                <th 
                  [style.width]="col.width"
                  class="px-4 py-3 text-start text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {{ col.label }}
                </th>
              }
              @if (hasActions) {
                <th class="px-4 py-3 text-end text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {{ actionsLabel }}
                </th>
              }
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-200">
            @if (loading) {
              @for (i of [1,2,3,4,5]; track i) {
                <tr>
                  @for (col of columns; track col.key) {
                    <td class="px-4 py-4">
                      <div class="h-4 bg-neutral-100 rounded animate-pulse w-full"></div>
                    </td>
                  }
                </tr>
              }
            } @else if (data.length === 0) {
              <tr>
                <td [attr.colspan]="columns.length + (hasActions ? 1 : 0)" class="px-4 py-12 text-center">
                  <div class="flex flex-col items-center gap-2 text-neutral-400">
                    <lucide-icon name="inbox" class="w-8 h-8"></lucide-icon>
                    <p class="text-sm">{{ emptyMessage }}</p>
                  </div>
                </td>
              </tr>
            } @else {
              @for (row of data; track $index) {
                <tr class="hover:bg-neutral-50 transition-colors">
                  <ng-container *ngTemplateOutlet="rowTemplate; context: { $implicit: row }"></ng-container>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
      
      @if (hasFooter) {
        <div class="px-5 py-3 border-t border-neutral-200 flex items-center justify-between text-sm text-neutral-500">
          <ng-content select="[table-footer-left]"></ng-content>
          <ng-content select="[table-footer-right]"></ng-content>
        </div>
      }
    </div>
  `
})
export class TableComponent {
  @Input() columns: TableColumn[] = [];
  @Input() data: any[] = [];
  @Input() loading = false;
  @Input() emptyMessage = 'No data found';
  @Input() hasToolbar = false;
  @Input() hasActions = false;
  @Input() actionsLabel = 'Actions';
  @Input() hasFooter = false;

  @ContentChild('rowTemplate') rowTemplate!: TemplateRef<any>;
}