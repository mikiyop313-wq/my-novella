import { Routes } from '@angular/router';


export const routes: Routes = [
  { path: '', redirectTo: 'library', pathMatch: 'full' },
  { path: 'library/create', loadComponent: () => import('./features/library/pages/book-create/book-create').then(m => m.BookCreate), data: { animation: 'CreatePage' } },
  { path: 'library', loadComponent: () => import('./features/library/library').then(m => m.Library), data: { animation: 'LibraryPage' } }
];
