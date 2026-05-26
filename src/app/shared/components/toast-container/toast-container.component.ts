import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../services/toast.service';
import { ToastComponent } from '../toast/toast.component';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule, ToastComponent],
  template: `
    <div class="toast-container-overlay">
      @for (toast of toastService.toasts(); track toast) {
        <app-toast [toast]="toast" (close)="toastService.remove(toast)"></app-toast>
      }
    </div>
  `,
  styles: [`
    .toast-container-overlay {
      position: fixed;
      top: 1.5rem;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: none; /* Let clicks pass through the overlay itself */
      width: 100%;
      max-width: 400px;
      padding: 0 1rem;
    }
  `]
})
export class ToastContainerComponent {
  toastService = inject(ToastService);
}
