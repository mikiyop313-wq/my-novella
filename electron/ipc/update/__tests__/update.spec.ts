import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    }),
  },
}));

import type { UpdateService } from '../../../domain/update/update.service';
import { setupUpdateHandlers } from '../update';

describe('update IPC handlers', () => {
  const state = {
    status: 'available',
    currentVersion: '0.1.0',
    availableVersion: '0.2.0',
    releaseNotes: 'Changes',
    releaseDate: null,
    downloadPercent: null,
    errorMessage: null,
  } as const;
  let getState: Mock<() => typeof state>;
  let downloadUpdate: Mock<() => Promise<void>>;
  let assertReadyToInstall: Mock<() => void>;
  let requestUpdateInstall: Mock<() => void>;

  beforeEach(() => {
    mocks.handlers.clear();
    getState = vi.fn<() => typeof state>(() => state);
    downloadUpdate = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    assertReadyToInstall = vi.fn<() => void>();
    requestUpdateInstall = vi.fn<() => void>();
    setupUpdateHandlers({
      updateService: {
        getState,
        downloadUpdate,
        assertReadyToInstall,
      } as unknown as UpdateService,
      requestUpdateInstall,
    });
  });

  it('registers and delegates state and download operations', async () => {
    expect(invoke('update:get-state')).toEqual(state);
    await expect(invoke('update:download')).resolves.toBeUndefined();
    expect(downloadUpdate).toHaveBeenCalledOnce();
  });

  it('validates installation before starting the close handshake', () => {
    invoke('update:install');

    expect(assertReadyToInstall).toHaveBeenCalledOnce();
    expect(requestUpdateInstall).toHaveBeenCalledOnce();
  });

  it('does not request installation when validation fails', () => {
    assertReadyToInstall.mockImplementation(() => {
      throw new Error('Not downloaded');
    });

    expect(() => invoke('update:install')).toThrow('Not downloaded');
    expect(requestUpdateInstall).not.toHaveBeenCalled();
  });
});

function invoke(channel: string): unknown {
  const handler = mocks.handlers.get(channel);
  if (!handler) throw new Error(`Expected handler for ${channel}.`);
  return handler({});
}
