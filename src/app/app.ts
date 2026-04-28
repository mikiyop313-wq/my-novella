import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ElectronService } from './core/services/electron.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {

  protected readonly title = signal('my-novella');

  constructor(private electronService: ElectronService) {
    this.electronService.on('reply', (data: any) => {
      console.log('Received reply from main:', data);
    });
  }

  sendToMain() {
    this.electronService.send('message', 'Hello from renderer!');
  }

}
