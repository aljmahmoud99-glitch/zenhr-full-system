import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, ToastType } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast-container.component.html',
  styleUrl: './toast-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToastContainerComponent {
  readonly toast = inject(ToastService);
  readonly items = this.toast.toasts;

  readonly iconMap = computed<Record<ToastType, string>>(() => ({
    success: 'check_circle',
    error: 'error',
    info: 'info',
    warning: 'warning_amber'
  }));

  iconFor(type: ToastType) {
    return this.iconMap()[type];
  }

  progressStyle(duration: number) {
    return { 'animation-duration': `${duration}ms` };
  }
}
