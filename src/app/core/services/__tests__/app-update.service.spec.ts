import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UpdateState } from '../../../../../shared/models/update.model';
import { AppUpdateService } from '../app-update.service';
import { ElectronService } from '../electron.service';

describe('AppUpdateService', () => {
  let invoke: ReturnType<typeof vi.fn>;
  let updateListener: (state: UpdateState) => void;
  let service: AppUpdateService;

  beforeEach(async () => {
    updateListener = () => undefined;
    invoke = vi.fn((channel: string) => {
      if (channel === 'update:get-state') return Promise.resolve(updateState('idle'));
      return Promise.resolve(undefined);
    });

    TestBed.configureTestingModule({
      providers: [
        AppUpdateService,
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
    });

    service = TestBed.inject(AppUpdateService);
    await vi.waitFor(() => expect(service.state().status).toBe('idle'));
  });

  it('loads initial state and follows update events', () => {
    updateListener(updateState('available', { availableVersion: '0.2.0' }));

    expect(service.state()).toMatchObject({ status: 'available', availableVersion: '0.2.0' });
    expect(service.automaticPromptAllowed()).toBe(true);
  });

  it('marks manual checks so their result stays inline', async () => {
    await service.checkForUpdates();
    updateListener(updateState('up-to-date'));

    expect(invoke).toHaveBeenCalledWith('update:check');
    expect(service.automaticPromptAllowed()).toBe(false);
  });

  it('delegates download and installation actions', async () => {
    await service.downloadUpdate();
    await service.installUpdate();

    expect(invoke).toHaveBeenCalledWith('update:download');
    expect(invoke).toHaveBeenCalledWith('update:install');
  });

  it('reports IPC action failures in shared state', async () => {
    invoke.mockRejectedValueOnce(new Error('Network unavailable'));

    await service.checkForUpdates();

    expect(service.state()).toMatchObject({
      status: 'error',
      errorMessage: 'Network unavailable',
    });
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
