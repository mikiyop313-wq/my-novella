import { Routes } from '@angular/router';


export const routes: Routes = [
  { path: '', redirectTo: 'library', pathMatch: 'full' },
  { path: 'codex-detached/:sessionId', loadComponent: () => import('./features/codex/pages/codex-detached/codex-detached').then(m => m.CodexDetached) },
  { path: 'chat-detached/:sessionId', loadComponent: () => import('./features/chat/chat').then(m => m.Chat) },
  { path: 'library/create', loadComponent: () => import('./features/library/pages/book-create/book-create').then(m => m.BookCreate), data: { animation: 'CreatePage' } },
  { path: 'library', loadComponent: () => import('./features/library/library').then(m => m.Library), data: { animation: 'LibraryPage' } },
  { path: 'settings', loadComponent: () => import('./features/settings/components/book-settings/book-settings.component').then(m => m.BookSettingsComponent), data: { animation: 'SettingsPage' } },
  {
    path: 'workspace/:bookId',
    loadComponent: () => import('./features/workspace/workspace').then(m => m.Workspace),
    data: { animation: 'WorkspacePage' },
    children: [
      { path: 'outline', loadComponent: () => import('./features/outline/outline').then(m => m.Outline), data: { animation: 'OutlinePage' } },
      { path: 'manuscript/:mode/:id', loadComponent: () => import('./features/manuscript/manuscript').then(m => m.Manuscript), data: { animation: 'ManuscriptPage' } },
      { path: 'threads', loadComponent: () => import('./features/chat/chat').then(m => m.Chat), data: { animation: 'ChatPage' } },
      { path: 'new-chat', redirectTo: 'thread/new-chat', pathMatch: 'full' },
      { path: 'thread/:threadId', loadComponent: () => import('./features/chat/chat').then(m => m.Chat), data: { animation: 'ChatPage' } },
      { path: 'chat', redirectTo: 'threads', pathMatch: 'full' },
      { path: 'settings', loadComponent: () => import('./features/settings/components/book-settings/book-settings.component').then(m => m.BookSettingsComponent), data: { animation: 'SettingsPage' } },
    ],
  }
];
