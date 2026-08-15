import { EventEmitter } from 'node:events';

import type { AppUpdater, UpdateInfo } from 'electron-updater';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { normalizeReleaseNotes, UpdateService } from '../update.service';

describe('UpdateService', () => {
  let emitter: EventEmitter;
  let updater: AppUpdater;
  let checkForUpdates: Mock<() => Promise<null>>;
  let downloadUpdate: Mock<() => Promise<string[]>>;
  let quitAndInstall: Mock<(isSilent?: boolean, isForceRunAfter?: boolean) => void>;
  let broadcast: Mock<
    (state: import('../../../../shared/models/update.model').UpdateState) => void
  >;

  beforeEach(() => {
    emitter = new EventEmitter();
    checkForUpdates = vi.fn<() => Promise<null>>().mockResolvedValue(null);
    downloadUpdate = vi.fn<() => Promise<string[]>>().mockResolvedValue([]);
    quitAndInstall = vi.fn<(isSilent?: boolean, isForceRunAfter?: boolean) => void>();
    broadcast =
      vi.fn<(state: import('../../../../shared/models/update.model').UpdateState) => void>();
    updater = Object.assign(emitter, {
      autoDownload: true,
      autoInstallOnAppQuit: false,
      allowPrerelease: true,
      fullChangelog: true,
      checkForUpdates,
      downloadUpdate,
      quitAndInstall,
    }) as unknown as AppUpdater;
  });

  it('stays unavailable and never checks in an unpackaged build', async () => {
    const service = createService({ isPackaged: false });

    service.initialize();
    await service.checkForUpdatesAtStartup();

    expect(service.getState().status).toBe('unavailable');
    expect(checkForUpdates).not.toHaveBeenCalled();
    expect(emitter.listenerCount('update-available')).toBe(0);
  });

  it('configures the updater and performs only one startup check', async () => {
    const service = createService();

    service.initialize();
    service.initialize();
    await service.checkForUpdatesAtStartup();
    await service.checkForUpdatesAtStartup();

    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(updater.allowPrerelease).toBe(false);
    expect(updater.fullChangelog).toBe(false);
    expect(checkForUpdates).toHaveBeenCalledOnce();
    expect(emitter.listenerCount('update-available')).toBe(1);
  });

  it('allows repeated manual update checks in packaged builds', async () => {
    const service = createService();
    service.initialize();

    await service.checkForUpdates();
    await service.checkForUpdates();

    expect(checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it('keeps manual checks unavailable in unpackaged builds', async () => {
    const service = createService({ isPackaged: false });

    await service.checkForUpdates();

    expect(service.getState().status).toBe('unavailable');
    expect(checkForUpdates).not.toHaveBeenCalled();
  });

  it('publishes available, progress, and downloaded states', () => {
    const service = createService();
    service.initialize();

    emitter.emit(
      'update-available',
      updateInfo({
        version: '0.2.0',
        releaseNotes: '<img src=x onerror=alert(1)>Safer editor',
      }),
    );
    expect(service.getState()).toMatchObject({
      status: 'available',
      availableVersion: '0.2.0',
      releaseNotes: '<img src=x onerror=alert(1)>Safer editor',
    });

    emitter.emit('download-progress', { percent: 47.6 });
    expect(service.getState()).toMatchObject({ status: 'downloading', downloadPercent: 48 });

    emitter.emit('update-downloaded', updateInfo({ version: '0.2.0' }));
    expect(service.getState()).toMatchObject({
      status: 'downloaded',
      availableVersion: '0.2.0',
      downloadPercent: 100,
    });
    expect(broadcast).toHaveBeenCalled();
  });

  it('guards duplicate downloads and permits retry after a download error', async () => {
    const service = createService();
    service.initialize();
    emitter.emit('update-available', updateInfo({ version: '0.2.0' }));
    let rejectDownload: (error: Error) => void = () => undefined;
    downloadUpdate.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectDownload = reject;
        }),
    );

    const firstDownload = service.downloadUpdate();
    await expect(service.downloadUpdate()).rejects.toThrow('No update is available');
    rejectDownload(new Error('Network unavailable'));
    await expect(firstDownload).rejects.toThrow('Network unavailable');
    expect(service.getState()).toMatchObject({
      status: 'error',
      availableVersion: '0.2.0',
      errorMessage: 'Network unavailable',
    });

    downloadUpdate.mockResolvedValueOnce([]);
    await expect(service.downloadUpdate()).resolves.toBeUndefined();
    expect(downloadUpdate).toHaveBeenCalledTimes(2);
  });

  it('installs only a fully downloaded update', () => {
    const service = createService();
    service.initialize();

    expect(() => service.assertReadyToInstall()).toThrow('has not finished downloading');
    expect(service.quitAndInstall()).toBe(false);
    expect(quitAndInstall).not.toHaveBeenCalled();

    emitter.emit('update-downloaded', updateInfo({ version: '0.2.0' }));
    expect(() => service.assertReadyToInstall()).not.toThrow();
    expect(service.quitAndInstall()).toBe(true);
    expect(quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it('normalizes multi-version release notes', () => {
    expect(
      normalizeReleaseNotes([
        { version: '0.2.0', note: 'New editor' },
        { version: '0.1.1', note: '  Fixes  ' },
      ]),
    ).toBe('0.2.0\nNew editor\n\n0.1.1\nFixes');
    expect(normalizeReleaseNotes('   ')).toBeNull();
    expect(normalizeReleaseNotes(null)).toBeNull();
  });

  function createService(options: { isPackaged?: boolean } = {}): UpdateService {
    return new UpdateService({
      updater,
      isPackaged: options.isPackaged ?? true,
      currentVersion: '0.1.0',
      broadcast,
    });
  }
});

function updateInfo(overrides: Partial<UpdateInfo> = {}): UpdateInfo {
  return {
    version: '0.2.0',
    files: [],
    path: 'My-Novella-Setup.exe',
    sha512: 'sha512',
    releaseDate: '2026-08-14T00:00:00.000Z',
    ...overrides,
  };
}
