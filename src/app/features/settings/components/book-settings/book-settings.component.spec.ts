import { signal, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { WorkspaceStore } from '../../../workspace/workspace.store';
import { BookSettingsComponent } from './book-settings.component';

describe('BookSettingsComponent', () => {
  let fixture: ComponentFixture<BookSettingsComponent>;
  let bookId: WritableSignal<string | null>;
  let lastWorkspaceUrl: WritableSignal<string | null>;
  let navigateByUrl: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    bookId = signal<string | null>('book-1');
    lastWorkspaceUrl = signal<string | null>(
      '/workspace/book-1/manuscript/book/book-1',
    );
    navigateByUrl = vi.fn().mockResolvedValue(true);

    await TestBed.configureTestingModule({
      imports: [BookSettingsComponent],
      providers: [
        {
          provide: WorkspaceStore,
          useValue: { bookId, lastWorkspaceUrl },
        },
        {
          provide: Router,
          useValue: { navigateByUrl },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookSettingsComponent);
    fixture.detectChanges();
  });

  it('keeps the content title and subtitle without the tag or saved badge', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.content-title')?.textContent).toContain('General Settings');
    expect(element.querySelector('.content-subtitle')?.textContent).toContain(
      "Manage your book's primary metadata",
    );
    expect(element.querySelector('.section-tag')).toBeNull();
    expect(element.querySelector('.status-badge')).toBeNull();
  });

  it('renders a simple placeholder without settings cards or actions', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.placeholder-panel')?.textContent).toContain(
      'Settings will appear here soon.',
    );
    expect(element.querySelector('.setting-card')).toBeNull();
    expect(element.querySelector('.content-footer')).toBeNull();
  });

  it('renders only the first two sections and the settings divider', () => {
    const element = fixture.nativeElement as HTMLElement;
    const activeSections = element.querySelectorAll('.section-item.is-active');
    const sections = element.querySelectorAll('.section-item');

    expect(sections).toHaveLength(2);
    expect(activeSections).toHaveLength(1);
    expect(activeSections[0]?.getAttribute('aria-current')).toBe('page');
    expect(element.querySelector('.settings-divider')).not.toBeNull();
  });

  it('focuses the back button when settings opens', () => {
    const backButton = fixture.nativeElement.querySelector(
      '.settings-back-button',
    ) as HTMLButtonElement;

    expect(document.activeElement).toBe(backButton);
  });

  it('returns to the latest workspace route from the back button', () => {
    const backButton = fixture.nativeElement.querySelector(
      '.settings-back-button',
    ) as HTMLButtonElement;

    backButton.click();

    expect(navigateByUrl).toHaveBeenCalledWith(
      '/workspace/book-1/manuscript/book/book-1',
    );
  });

  it('returns to the latest workspace route when Escape is pressed', () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(navigateByUrl).toHaveBeenCalledWith(
      '/workspace/book-1/manuscript/book/book-1',
    );
  });

  it('falls back to the book outline when no safe return route exists', () => {
    lastWorkspaceUrl.set('/workspace/another-book/outline');

    fixture.componentInstance.closeSettings();

    expect(navigateByUrl).toHaveBeenCalledWith('/workspace/book-1/outline');
  });
});
