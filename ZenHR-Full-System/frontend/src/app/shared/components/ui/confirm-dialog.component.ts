import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
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

        <footer class="modal-actions">
          <button class="z-btn-secondary" type="button" (click)="cancel.emit()" [disabled]="loading">
            {{ cancelLabel }}
          </button>
          <button [class]="confirmButtonClass" type="button" (click)="confirm.emit()" [disabled]="loading">
            {{ loading ? loadingLabel : confirmLabel }}
          </button>
        </footer>
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConfirmDialogComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() message = '';
  @Input() confirmLabel = 'Confirm';
  @Input() cancelLabel = 'Cancel';
  @Input() loadingLabel = '...';
  @Input() loading = false;
  @Input() tone: 'primary' | 'danger' = 'primary';

  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  get confirmButtonClass() {
    return this.tone === 'danger' ? 'z-btn-danger' : 'z-btn-primary';
  }
}
