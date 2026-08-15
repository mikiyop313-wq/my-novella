import { Component, input, output, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Toast } from '../../models/toast.model';
import { trigger, state, style, animate, transition } from '@angular/animations';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.scss',
  animations: [
    trigger('flyInOut', [
      state('in', style({ transform: 'translateY(0)', opacity: 1 })),
      transition('void => *', [
        style({ transform: 'translateY(-100%)', opacity: 0 }),
        animate('300ms cubic-bezier(0.2, 1, 0.2, 1)')
      ]),
      transition('* => void', [
        animate('250ms cubic-bezier(0.4, 0, 1, 1)', style({ transform: 'translateY(-100%)', opacity: 0 }))
      ])
    ])
  ]
})
export class ToastComponent {
  toast = input.required<Toast>();
  close = output<void>();

  getIconName(type: string): string {
    switch (type) {
      case 'error': return 'error';
      case 'warning': return 'warning';
      case 'success': return 'check_circle';
      case 'info': return 'info';
      default: return 'info';
    }
  }
}
