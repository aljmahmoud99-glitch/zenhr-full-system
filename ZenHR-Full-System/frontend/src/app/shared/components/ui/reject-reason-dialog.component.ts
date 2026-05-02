import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-reject-reason-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-overlay" *ngIf="open" (click)="cancel.emit()">
      <section class="modal-card z-card" (click)="$event.stopPropagation()">
        <header class="modal-head">
          <div>
            <h2 class="z-heading">{{ title }}</h2>
            <p class="z-small" *ngIf="message">{{ message }}</p>
          </div>
          <button class="close-btn" type="button" (click)="cancel.emit()">
            <span class="material-icons">close</span>
          </button>
        </header>

        <div class="alert-error" *ngIf="error">{{ error }}</div>

        <textarea
          class="z-input text-area"
          [(ngModel)]="reason"
          [placeholder]="placeholder"
          rows="4"></textarea>

        <footer class="modal-actions">
          <button class="z-btn-secondary" type="button" (click)="cancel.emit()" [disabled]="loading">
            {{ cancelLabel }}
          </button>
          <button class="z-btn-danger" type="button" (click)="confirmReason()" [disabled]="loading || (required && !reason.trim())">
            {{ loading ? loadingLabel : confirmLabel }}
          </button>
        </footer>
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RejectReasonDialogComponent implements OnChanges {
  @Input() open = false;
  @Input() title = '';
  @Input() message = '';
  @Input() placeholder = '';
  @Input() cancelLabel = 'Cancel';
  @Input() confirmLabel = 'Confirm';
  @Input() loadingLabel = '...';
  @Input() error = '';
  @Input() loading = false;
  @Input() required = true;
  @Input() initialValue = '';

  @Output() cancel = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<string>();

  reason = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue) {
      this.reason = this.initialValue;
    }
  }

  confirmReason() {
    this.confirm.emit(this.reason.trim());
  }
}
