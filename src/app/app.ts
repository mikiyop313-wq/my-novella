import { Component, inject, signal } from '@angular/core';
import { ChildrenOutletContexts, RouterOutlet } from '@angular/router';
import { ElectronService } from './core/services/electron.service';
import { ThemeService } from './core/services/theme.service';
import { routeAnimations } from './shared/animations/route-animations';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  animations: [routeAnimations]
})
export class App {

  protected readonly title = signal('my-novella');
  private contexts = inject(ChildrenOutletContexts);

  constructor(private electronService: ElectronService, private themeService: ThemeService) {
    this.electronService.on('reply', (data: any) => {
      console.log('Received reply from main:', data);
    });
  }

  sendToMain() {
    this.electronService.send('message', 'Hello from renderer!');
  }

  toggleTheme() {
    this.themeService.toggleTheme();
  }

  getRouteAnimationData() {
    return this.contexts.getContext('primary')?.route?.snapshot?.data?.['animation'];
  }

}
