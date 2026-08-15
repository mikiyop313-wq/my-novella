import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UpdateState } from '../../../../../../shared/models/update.model';
import { AppUpdateService } from '../../../../core/services/app-update.service';
import { ElectronService } from '../../../../core/services/electron.service';
import { UpdateDialogComponent } from '../update-dialog.component';

describe('UpdateDialogComponent', () => {
  let fixture: ComponentFixture<UpdateDialogComponent>;
  let component: UpdateDialogComponent;
  let invoke: ReturnType<typeof vi.fn>;
  let updateListener: (state: UpdateState) => void;

  beforeEach(async () => {
    invoke = vi.fn((channel: string) => {
      if (channel === 'update:get-state') return Promise.resolve(updateState('unavailable'));
      return Promise.resolve(undefined);
    });
    updateListener = () => undefined;

    await TestBed.configureTestingModule({
      imports: [UpdateDialogComponent],
      providers: [
        {
          provide: ElectronService,
          useValue: {
            invoke,
            on: vi.fn((_channel: string, listener: (state: UpdateState) => void) => {
              updateListener = listener;
              return () => undefined;
            }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UpdateDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('shows an available update once and renders release notes as text', () => {
    updateListener(
      updateState('available', {
        availableVersion: '0.2.0',
        releaseNotes: '<img src=x onerror=alert(1)>Safer editor',
      }),
    );
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[role="dialog"]')).toBeTruthy();
    expect(element.querySelector('.release-notes-copy')?.textContent).toContain(
      '<img src=x onerror=alert(1)>Safer editor',
    );
    expect(element.querySelector('.release-notes-copy img')).toBeNull();

    element.querySelector<HTMLButtonElement>('.secondary-action')?.click();
    fixture.detectChanges();
    expect(component.visible()).toBe(false);

    updateListener(updateState('available', { availableVersion: '0.2.0' }));
    fixture.detectChanges();
    expect(component.visible()).toBe(false);
  });

  it('accepts an update and locks dismissal while download progress is visible', async () => {
    updateListener(updateState('available', { availableVersion: '0.2.0' }));
    fixture.detectChanges();

    await component.acceptUpdate();
    updateListener(
      updateState('downloading', {
        availableVersion: '0.2.0',
        downloadPercent: 42,
      }),
    );
    fixture.detectChanges();

    expect(invoke).toHaveBeenCalledWith('update:download');
    const progress = (fixture.nativeElement as HTMLElement).querySelector('[role="progressbar"]');
    expect(progress?.getAttribute('aria-valuenow')).toBe('42');

    component.onBackdropClick();
    component.onEscape(new Event('keydown'));
    expect(component.visible()).toBe(true);
  });

  it('ignores duplicate accept actions while the download request is pending', async () => {
    let resolveDownload: () => void = () => undefined;
    invoke.mockImplementation((channel: string) => {
      if (channel !== 'update:download') return Promise.resolve(undefined);

      return new Promise<void>((resolve) => {
        resolveDownload = resolve;
      });
    });
    updateListener(updateState('available', { availableVersion: '0.2.0' }));

    const firstRequest = component.acceptUpdate();
    const duplicateRequest = component.acceptUpdate();

    expect(invoke.mock.calls.filter(([channel]) => channel === 'update:download')).toHaveLength(1);
    resolveDownload();
    await Promise.all([firstRequest, duplicateRequest]);
  });

  it('retries an interrupted download in the same dialog', async () => {
    updateListener(updateState('available', { availableVersion: '0.2.0' }));
    fixture.detectChanges();
    await component.acceptUpdate();
    updateListener(
      updateState('error', {
        availableVersion: '0.2.0',
        errorMessage: 'Network unavailable',
      }),
    );
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Network unavailable');
    await component.retryDownload();
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(invoke).toHaveBeenLastCalledWith('update:download');
  });

  it('requests installation once after an accepted download completes', async () => {
    updateListener(updateState('available', { availableVersion: '0.2.0' }));
    fixture.detectChanges();
    await component.acceptUpdate();

    updateListener(
      updateState('downloaded', {
        availableVersion: '0.2.0',
        downloadPercent: 100,
      }),
    );
    updateListener(
      updateState('downloaded', {
        availableVersion: '0.2.0',
        downloadPercent: 100,
      }),
    );
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Applying update');
    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('update:install');
    });
    expect(invoke.mock.calls.filter(([channel]) => channel === 'update:install')).toHaveLength(1);
  });

  it('does not open for an update found by a manual settings check', async () => {
    const updateService = TestBed.inject(AppUpdateService);

    await updateService.checkForUpdates();
    updateListener(updateState('available', { availableVersion: '0.2.0' }));
    fixture.detectChanges();

    expect(component.visible()).toBe(false);
  });
});

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
