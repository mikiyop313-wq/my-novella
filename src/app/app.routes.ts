import { Routes } from '@angular/router';


export const routes: Routes = [
  { path: '', redirectTo: 'library', pathMatch: 'full' },
  { path: 'library/create', loadComponent: () => import('./features/library/pages/book-create/book-create').then(m => m.BookCreate) },
  { path: 'library', loadComponent: () => import('./features/library/library').then(m => m.Library) }
];
