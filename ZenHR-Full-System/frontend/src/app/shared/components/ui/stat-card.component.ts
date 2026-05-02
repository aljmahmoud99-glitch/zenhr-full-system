import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-neutral-500">{{ label }}</p>
          <p class="mt-1 text-2xl font-semibold text-neutral-900">{{ value }}</p>
        </div>
        <div [class]="iconBgClass">
          <ng-content select="[icon]"></ng-content>
        </div>
      </div>
      <div *ngIf="change !== undefined" class="mt-3 flex items-center text-sm">
        <span [class]="change >= 0 ? 'text-success' : 'text-danger'">
          {{ change >= 0 ? '+' : '' }}{{ change }}%
        </span>
        <span class="mr-2 text-neutral-400">vs last month</span>
      </div>
    </div>
  `
})
export class StatCardComponent {
  @Input() label = '';
  @Input() value = '';
  @Input() change?: number;
  @Input() variant: 'blue' | 'green' | 'yellow' | 'red' | 'purple' = 'blue';

  get iconBgClass(): string {
    const variants = {
      blue: 'w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center',
      green: 'w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center',
      yellow: 'w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center',
      red: 'w-12 h-12 rounded-lg bg-danger/10 flex items-center justify-center',
      purple: 'w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center',
    };
    return variants[this.variant];
  }
}