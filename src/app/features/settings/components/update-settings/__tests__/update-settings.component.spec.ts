import { signal, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UpdateState } from '../../../../../../../shared/models/update.model';
import {
  AppUpdateService,
  type UpdateAction,
} from '../../../../../core/services/app-update.service';
import { UpdateSettingsComponent } from '../update-settings.component';

describe('UpdateSettingsComponent', () => {
  let fixture: ComponentFixture<UpdateSettingsComponent>;
  let state: WritableSignal<UpdateState>;
  let failedAction: WritableSignal<UpdateAction | null>;
  let checkForUpdates: ReturnType<typeof vi.fn>;
  let downloadUpdate: ReturnType<typeof vi.fn>;
  let installUpdate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    state = signal(updateState('idle'));
    failedAction = signal<UpdateAction | null>(null);
    checkForUpdates = vi.fn().mockResolvedValue(undefined);
    downloadUpdate = vi.fn().mockResolvedValue(undefined);
    installUpdate = vi.fn().mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [UpdateSettingsComponent],
      providers: [
        {
          provide: AppUpdateService,
          useValue: {
            state,
            failedAction,
            checkForUpdates,
            downloadUpdate,
            installUpdate,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UpdateSettingsComponent);
    fixture.detectChanges();
  });

  it('shows the installed version and starts a manual check', () => {
    const element = fixture.nativeElement as HTMLElement;
    const checkButton = findButton(element, 'Check for updates');

    expect(element.textContent).toContain('0.1.0');
    checkButton?.click();
    expect(checkForUpdates).toHaveBeenCalledOnce();
  });

  it('explains why checks are unavailable in development builds', () => {
    state.set(updateState('unavailable', { currentVersion: '' }));
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Development build');
    expect(element.textContent).toContain('installed, packaged version');
    expect(findButton(element, 'Check for updates')?.disabled).toBe(true);
  });

  it('renders checking and up-to-date states', () => {
    state.set(updateState('checking'));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Checking for updates');
    expect(findButton(fixture.nativeElement, 'Checking')?.disabled).toBe(true);

    state.set(updateState('up-to-date'));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'latest available version',
    );
  });

  it('shows available release details and downloads the update', () => {
    state.set(
      updateState('available', {
        availableVersion: '0.2.0',
        releaseDate: '2026-08-14T00:00:00.000Z',
        releaseNotes: '<strong>Safer editor</strong>',
      }),
    );
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Version 0.2.0 is available');
    expect(element.textContent).toContain('Aug 14, 2026');
    expect(element.textContent).toContain('<strong>Safer editor</strong>');
    expect(element.querySelector('.inline-release-notes strong')).toBeNull();

    findButton(element, 'Download update')?.click();
    expect(downloadUpdate).toHaveBeenCalledOnce();
  });

  it('reports accessible download progress', () => {
    state.set(
      updateState('downloading', {
        availableVersion: '0.2.0',
        downloadPercent: 47,
      }),
    );
    fixture.detectChanges();

    const progress = (fixture.nativeElement as HTMLElement).querySelector('[role="progressbar"]');
    expect(progress?.getAttribute('aria-valuenow')).toBe('47');
    expect(progress?.querySelector<HTMLElement>('span')?.style.width).toBe('47%');
  });

  it('installs a downloaded update only after an explicit action', () => {
    state.set(updateState('downloaded', { availableVersion: '0.2.0', downloadPercent: 100 }));
    fixture.detectChanges();

    expect(installUpdate).not.toHaveBeenCalled();
    findButton(fixture.nativeElement, 'Restart and install')?.click();
    expect(installUpdate).toHaveBeenCalledOnce();
  });

  it.each([
    ['check', 'Check again', 'check'],
    ['download', 'Retry download', 'download'],
    ['install', 'Retry restart', 'install'],
  ] as const)('retries a failed %s action', (action, label, expectedAction) => {
    failedAction.set(action);
    state.set(
      updateState('error', {
        availableVersion: action === 'check' ? null : '0.2.0',
        errorMessage: 'Update service unavailable',
      }),
    );
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Update service unavailable',
    );
    findButton(element, label)?.click();

    const actions = { check: checkForUpdates, download: downloadUpdate, install: installUpdate };
    expect(actions[expectedAction]).toHaveBeenCalledOnce();
  });
});

function findButton(element: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...element.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes(text),
  );
}

function updateState(
  status: UpdateState['status'],
  overrides: Partial<UpdateState> = {},
): UpdateState {
  return {
    status,
    currentVersion: '0.1.0',
    availableVersion: null,
    releaseNotes: null,
    releaseDate: null,
    downloadPercent: null,
    errorMessage: null,
    ...overrides,
  };
}
