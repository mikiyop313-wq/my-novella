import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it, beforeEach } from 'vitest';

import { WorkspaceStore } from '../../../../features/workspace/workspace.store';
import { SettingsSection } from './settings-section';

@Component({ template: '' })
class SettingsTestPage {}

describe('SettingsSection', () => {
  let fixture: ComponentFixture<SettingsSection>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsSection],
      providers: [
        provideRouter([
          {
            path: 'workspace/:bookId/settings',
            component: SettingsTestPage,
          },
        ]),
        {
          provide: WorkspaceStore,
          useValue: {
            bookId: signal('book-1'),
            sidebarOpen: signal(true),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsSection);
    fixture.detectChanges();
  });

  it('links to settings for the active workspace book', () => {
    const link = fixture.nativeElement.querySelector('.section-toggle') as HTMLAnchorElement;

    expect(link.getAttribute('href')).toBe('/workspace/book-1/settings');
  });

  it('navigates to the book settings route', async () => {
    const router = TestBed.inject(Router);
    const link = fixture.nativeElement.querySelector('.section-toggle') as HTMLAnchorElement;

    link.click();
    await fixture.whenStable();

    expect(router.url).toBe('/workspace/book-1/settings');
  });
});
