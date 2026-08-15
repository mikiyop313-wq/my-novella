export type ToastType = 'warning' | 'error' | 'success' | 'info';

export interface ToastAction {
  label: string;
  handler: () => void | Promise<void>;
}

export interface Toast {
  type: ToastType;
  message: string;
  title?: string;
  timeout?: number;
  action?: ToastAction;
}
