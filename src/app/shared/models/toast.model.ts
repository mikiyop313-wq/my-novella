export type ToastType = 'warning' | 'error' | 'success' | 'info';

export interface Toast {
  type: ToastType;
  message: string;
  title?: string;
  timeout?: number;
}
