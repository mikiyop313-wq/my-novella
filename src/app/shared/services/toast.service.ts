import { Injectable, signal } from '@angular/core';
import { Toast, ToastType } from '../models/toast.model';

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  toasts = signal<Toast[]>([]);

  show(toast: Toast) {
    this.toasts.update((current) => [...current, toast]);

    if (toast.timeout !== 0) {
      setTimeout(() => {
        this.remove(toast);
      }, toast.timeout || 5000);
    }
  }

  error(message: string, title?: string, timeout?: number) {
    this.show({ type: 'error', message, title, timeout });
  }

  warning(message: string, title?: string, timeout?: number) {
    this.show({ type: 'warning', message, title, timeout });
  }

  success(message: string, title?: string, timeout?: number) {
    this.show({ type: 'success', message, title, timeout });
  }

  info(message: string, title?: string, timeout?: number) {
    this.show({ type: 'info', message, title, timeout });
  }

  remove(toastToRemove: Toast) {
    this.toasts.update((current) => current.filter((t) => t !== toastToRemove));
  }
}
