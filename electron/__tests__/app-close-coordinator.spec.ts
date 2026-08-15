import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { AppCloseCoordinator } from '../app-close-coordinator';

describe('AppCloseCoordinator', () => {
  let close: Mock<() => void>;
  let send: Mock<(channel: string) => void>;
  let installUpdate: Mock<() => boolean>;

  beforeEach(() => {
    vi.useFakeTimers();
    close = vi.fn<() => void>();
    send = vi.fn<(channel: string) => void>();
    installUpdate = vi.fn<() => boolean>(() => true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for renderer saving before a normal close', () => {
    const coordinator = createCoordinator();
    const event = { preventDefault: vi.fn() };

    coordinator.handleWindowClose(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith('app:before-close');
    expect(close).not.toHaveBeenCalled();

    coordinator.handleRendererReady();
    expect(close).toHaveBeenCalledOnce();
    expect(installUpdate).not.toHaveBeenCalled();
  });

  it('installs an accepted update after renderer saving', () => {
    const coordinator = createCoordinator();
    const event = { preventDefault: vi.fn() };

    coordinator.requestUpdateInstall();
    expect(close).toHaveBeenCalledOnce();
    coordinator.handleWindowClose(event);
    coordinator.handleRendererReady();

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(installUpdate).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('uses the existing timeout to complete an update restart', () => {
    const coordinator = createCoordinator();

    coordinator.requestUpdateInstall();
    coordinator.handleWindowClose({ preventDefault: vi.fn() });
    vi.advanceTimersByTime(3000);

    expect(installUpdate).toHaveBeenCalledOnce();
  });

  it('returns to the guarded state if update installation cannot start', () => {
    installUpdate.mockReturnValue(false);
    const coordinator = createCoordinator();
    const firstEvent = { preventDefault: vi.fn() };
    const secondEvent = { preventDefault: vi.fn() };

    coordinator.requestUpdateInstall();
    coordinator.handleWindowClose(firstEvent);
    coordinator.handleRendererReady();
    coordinator.handleWindowClose(secondEvent);

    expect(secondEvent.preventDefault).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledTimes(2);
  });

  function createCoordinator(): AppCloseCoordinator {
    return new AppCloseCoordinator({
      getWindow: () => ({ close, webContents: { send } }),
      installUpdate,
    });
  }
});
