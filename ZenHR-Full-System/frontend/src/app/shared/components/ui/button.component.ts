import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      [type]="type"
      [disabled]="disabled || loading"
      [class]="buttonClasses"
      (click)="onClick.emit($event)">
      <span *ngIf="loading" class="animate-spin mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full"></span>
      <ng-content></ng-content>
    </button>
  `
})
export class ButtonComponent {
  @Input() variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' = 'primary';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() disabled = false;
  @Input() loading = false;
  @Input() fullWidth = false;
  @Output() onClick = new EventEmitter<MouseEvent>();

  get buttonClasses(): string {
    const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
    
    const variants = {
      primary: 'bg-primary-500 text-white hover:bg-primary-600 focus:ring-primary-500',
      secondary: 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 focus:ring-neutral-500',
      ghost: 'text-neutral-600 hover:bg-neutral-100 focus:ring-neutral-500',
      danger: 'bg-danger text-white hover:bg-danger-dark focus:ring-danger',
      success: 'bg-success text-white hover:bg-success-dark focus:ring-success',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-5 py-2.5 text-base',
    };

    return `${base} ${variants[this.variant]} ${sizes[this.size]} ${this.fullWidth ? 'w-full' : ''}`;
  }
}