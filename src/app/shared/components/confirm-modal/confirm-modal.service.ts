import { Injectable, signal } from '@angular/core';

export interface ConfirmModalState {
  show: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  checkboxLabel: string | null;
  checkboxChecked: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface ConfirmModalOptions {
  confirmLabel?: string;
  checkboxLabel?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ConfirmModalService {
  state = signal<ConfirmModalState>({
    show: false,
    title: '',
    message: '',
    confirmLabel: 'Delete',
    checkboxLabel: null,
    checkboxChecked: false,
    onConfirm: () => {},
    onCancel: () => {},
  });

  open(
    title: string,
    message: string,
    onConfirm: (checkboxChecked: boolean) => void,
    onCancel?: () => void,
    options: ConfirmModalOptions = {},
  ): void {
    this.state.set({
      show: true,
      title,
      message,
      confirmLabel: options.confirmLabel ?? 'Delete',
      checkboxLabel: options.checkboxLabel ?? null,
      checkboxChecked: false,
      onConfirm: () => {
        onConfirm(this.state().checkboxChecked);
        this.close();
      },
      onCancel: () => {
        if (onCancel) onCancel();
        this.close();
      },
    });
  }

  setCheckboxChecked(checked: boolean): void {
    this.state.update((state) => ({ ...state, checkboxChecked: checked }));
  }

  close(): void {
    this.state.update((s) => ({ ...s, show: false }));
  }
}
