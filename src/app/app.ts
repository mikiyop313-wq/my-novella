import { Component, inject, signal } from '@angular/core';
import { ChildrenOutletContexts, RouterOutlet } from '@angular/router';
import { ElectronService } from './core/services/electron.service';
import { ThemeService } from './core/services/theme.service';
import { routeAnimations } from './shared/animations/route-animations';
import { ToastService } from './shared/services/toast.service';
import { ConfirmModalComponent } from './shared/components/confirm-modal/confirm-modal.component';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConfirmModalComponent, ToastContainerComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  animations: [routeAnimations]
})
export class App {

  protected readonly title = signal('my-novella');
  readonly isAnimating = signal(false);
  private contexts = inject(ChildrenOutletContexts);
  toastService = inject(ToastService);

  onAnimationStart(event: any) {
    if (event.fromState && event.toState && event.fromState !== event.toState) {
      this.isAnimating.set(true);
    }
  }

  onAnimationDone(event: any) {
    this.isAnimating.set(false);
  }

  constructor(private electronService: ElectronService, private themeService: ThemeService) {
    this.electronService.on('reply', (data: any) => {
      console.log('Received reply from main:', data);
    });
  }

  sendToMain() {
    this.electronService.send('message', 'Hello from renderer!');
    this.toastService.error('Connection failed! Please try again later.', 'Network Error');
    this.toastService.warning('Your session will expire in 5 minutes.', 'Session Warning');
  }

  toggleTheme() {
    if (!document.startViewTransition) {
      this.themeService.toggleTheme();
      return;
    }

    document.documentElement.classList.add('theme-transition');

    const transition = document.startViewTransition(() => {
      this.themeService.toggleTheme();
    });

    transition.ready.then(() => {
      const endRadius = Math.hypot(window.innerWidth, window.innerHeight);
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at 0px 0px)`,
            `circle(${endRadius}px at 0px 0px)`
          ]
        },
        {
          duration: 500,
          easing: 'ease-in-out',
          pseudoElement: '::view-transition-new(root)'
        }
      );
    });

    transition.finished.finally(() => {
      document.documentElement.classList.remove('theme-transition');
    });
  }

  getRouteAnimationData() {
    return this.contexts.getContext('primary')?.route?.snapshot?.data?.['animation'];
  }

}
