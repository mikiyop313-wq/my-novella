import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';


@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {

  protected readonly title = signal('my-novella');

  constructor() {
    window.electronAPI.onMessage('reply', (data: any) => {
      console.log('Received reply from main:', data);
    });
  }

  sendToMain() {
    window.electronAPI.sendMessage('message', 'Hello from renderer!');
  }



}
