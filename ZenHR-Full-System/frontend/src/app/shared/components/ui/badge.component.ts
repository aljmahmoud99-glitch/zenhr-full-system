import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span [class]="badgeClasses">
      <span *ngIf="dot" class="w-1.5 h-1.5 rounded-full bg-current mr-1.5"></span>
      <ng-content></ng-content>
    </span>
  `
})
export class BadgeComponent {
  @Input() variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple' = 'neutral';
  @Input() size: 'sm' | 'md' = 'md';
  @Input() dot = false;
  @Input() pulse = false;

  get badgeClasses(): string {
    const variants = {
      success: 'bg-success-light text-success-dark border-success/20',
      warning: 'bg-warning-light text-warning-dark border-warning/20',
      danger: 'bg-danger-light text-danger-dark border-danger/20',
      info: 'bg-info-light text-info-dark border-info/20',
      neutral: 'bg-neutral-100 text-neutral-600 border-neutral-200',
      purple: 'bg-purple-light text-purple-dark border-purple/20',
    };

    const sizes = {
      sm: 'px-2 py-0.5 text-xs',
      md: 'px-2.5 py-1 text-xs',
    };

    const pulseClass = this.pulse ? 'animate-pulse' : '';
    return `inline-flex items-center font-medium rounded-full border ${variants[this.variant]} ${sizes[this.size]} ${pulseClass}`;
  }
}