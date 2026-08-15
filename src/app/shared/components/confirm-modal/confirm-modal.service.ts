import { Injectable, signal } from '@angular/core';

export interface ConfirmModalState {
  show: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

@Injectable({
  providedIn: 'root'
})
export class ConfirmModalService {
  state = signal<ConfirmModalState>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
    onCancel: () => {}
  });

  open(title: string, message: string, onConfirm: () => void, onCancel?: () => void) {
    this.state.set({
      show: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        this.close();
      },
      onCancel: () => {
        if (onCancel) onCancel();
        this.close();
      }
    });
  }

  close() {
    this.state.update(s => ({ ...s, show: false }));
  }
}
