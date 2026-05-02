import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: number;
  type: ToastType;
  text: string;
  duration: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly _toasts = signal<ToastMessage[]>([]);

  readonly toasts = this._toasts.asReadonly();

  success(text: string, duration = 3500) {
    this.push('success', text, duration);
  }

  error(text: string, duration = 5000) {
    this.push('error', text, duration);
  }

  info(text: string, duration = 3500) {
    this.push('info', text, duration);
  }

  warning(text: string, duration = 4000) {
    this.push('warning', text, duration);
  }

  dismiss(id: number) {
    this._toasts.update(current => current.filter(toast => toast.id !== id));
  }

  private push(type: ToastType, text: string, duration: number) {
    const toast: ToastMessage = { id: this.nextId++, type, text, duration };
    this._toasts.update(current => [toast, ...current]);
    setTimeout(() => this.dismiss(toast.id), duration);
  }
}
