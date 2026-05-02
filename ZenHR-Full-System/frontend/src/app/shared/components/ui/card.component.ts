import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div [class]="cardClasses">
      <div *ngIf="title || action" class="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
        <h3 *ngIf="title" class="font-semibold text-neutral-800">{{ title }}</h3>
        <ng-content select="[card-header]"></ng-content>
      </div>
      <div class="p-5" [class.p-0]="noPadding">
        <ng-content></ng-content>
      </div>
      <div *ngIf="$any(this).hasFooter" class="px-5 py-3 border-t border-neutral-200 bg-neutral-50">
        <ng-content select="[card-footer]"></ng-content>
      </div>
    </div>
  `
})
export class CardComponent {
  @Input() title = '';
  @Input() elevated = false;
  @Input() noPadding = false;
  @Input() compact = false;

  get cardClasses(): string {
    const base = 'bg-white rounded-xl border border-neutral-200';
    const elevation = this.elevated ? 'shadow-card hover:shadow-card-hover' : 'shadow-sm';
    const compact = this.compact ? 'p-3' : '';
    return `${base} ${elevation} ${compact}`;
  }
}