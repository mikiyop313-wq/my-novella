import { Component } from '@angular/core';
import { BookCardComponent } from './components/book-card/book-card.component';

@Component({
  selector: 'app-library',
  imports: [BookCardComponent],
  templateUrl: './library.html',
  styleUrl: './library.scss',
})
export class Library {



}
