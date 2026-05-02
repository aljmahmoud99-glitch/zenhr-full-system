import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

@Component({
  selector: 'ui-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => InputComponent),
      multi: true
    }
  ],
  template: `
    <div class="space-y-1.5">
      @if (label) {
        <label class="block text-sm font-medium text-neutral-700">
          {{ label }}
          @if (required) {
            <span class="text-danger">*</span>
          }
        </label>
      }
      <div class="relative">
        @if (icon) {
          <div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
            <lucide-icon [name]="icon" class="w-4 h-4 text-neutral-400"></lucide-icon>
          </div>
        }
        <input
          [type]="type"
          [placeholder]="placeholder"
          [disabled]="disabled"
          [readonly]="readonly"
          [(ngModel)]="value"
          (ngModelChange)="onValueChange($event)"
          (blur)="onTouched()"
          [class]="inputClasses"
        />
        @if (icon) {
          <div class="absolute inset-y-0 end-0 flex items-center pe-3 pointer-events-none">
            <ng-content select="[input-suffix]"></ng-content>
          </div>
        }
      </div>
      @if (hint && !error) {
        <p class="text-xs text-neutral-500">{{ hint }}</p>
      }
      @if (error) {
        <p class="text-xs text-danger">{{ error }}</p>
      }
    </div>
  `
})
export class InputComponent implements ControlValueAccessor {
  @Input() label?: string;
  @Input() placeholder = '';
  @Input() type: 'text' | 'email' | 'password' | 'number' | 'tel' | 'date' = 'text';
  @Input() icon?: string;
  @Input() hint?: string;
  @Input() error?: string;
  @Input() required = false;
  @Input() disabled = false;
  @Input() readonly = false;

  value = '';

  private onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  get inputClasses(): string {
    const base = 'w-full h-10 px-3 rounded-lg border text-sm transition-all duration-150';
    const state = this.error 
      ? 'border-danger focus:border-danger focus:ring-2 focus:ring-danger/20' 
      : 'border-neutral-300 focus:border-primary focus:ring-2 focus:ring-primary/20';
    const icon = this.icon ? 'ps-10' : '';
    const disabled = this.disabled ? 'bg-neutral-100 cursor-not-allowed' : 'bg-white';
    
    return `${base} ${state} ${icon} ${disabled}`;
  }

  writeValue(value: string): void {
    this.value = value || '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onValueChange(value: string): void {
    this.value = value;
    this.onChange(value);
  }
}