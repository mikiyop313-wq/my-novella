import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ElectronService } from '../../../core/services/electron.service';
import { ChatWindowService } from './chat-window.service';

describe('ChatWindowService', () => {
  let service: ChatWindowService;
  let electronService: {
    invoke: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };
  let detachedWindowClosedCallback: ((event: { bookId: string; sessionId: string }) => void) | null;

  beforeEach(() => {
    detachedWindowClosedCallback = null;
    electronService = {
      invoke: vi.fn(),
      on: vi.fn((channel: string, callback: (event: { bookId: string; sessionId: string }) => void) => {
        if (channel === 'chat-window:closed' && !detachedWindowClosedCallback) {
          detachedWindowClosedCallback = callback;
        }

        return () => undefined;
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        ChatWindowService,
        { provide: ElectronService, useValue: electronService },
      ],
    });

    service = TestBed.inject(ChatWindowService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('opens a detached chat window through IPC', async () => {
    electronService.invoke.mockResolvedValueOnce({ sessionId: 'session-1' });

    await expect(service.openDetachedWindow({
      bookId: 'book-1',
      selectedThreadId: 'thread-1',
    })).resolves.toBe('session-1');

    expect(electronService.invoke).toHaveBeenCalledWith('chat-window:open', {
      bookId: 'book-1',
      selectedThreadId: 'thread-1',
    });
    expect(service.isBookDetached('book-1')).toBe(true);
  });

  it('loads a detached chat session through IPC', async () => {
    const session = {
      sessionId: 'session-1',
      bookId: 'book-1',
      selectedThreadId: null,
    };
    electronService.invoke.mockResolvedValueOnce(session);

    await expect(service.getDetachedSession('session-1')).resolves.toBe(session);

    expect(electronService.invoke).toHaveBeenCalledWith('chat-window:get-session', {
      sessionId: 'session-1',
    });
  });

  it('subscribes to detached chat window close events', () => {
    const cleanup = () => undefined;
    const callback = vi.fn();
    electronService.on.mockReturnValueOnce(cleanup);

    expect(service.onDetachedWindowClosed(callback)).toBe(cleanup);

    expect(electronService.on).toHaveBeenLastCalledWith('chat-window:closed', callback);
  });

  it('clears tracked detached state when a detached chat window closes', async () => {
    electronService.invoke.mockResolvedValueOnce({ sessionId: 'session-1' });

    await service.openDetachedWindow({
      bookId: 'book-1',
      selectedThreadId: null,
    });
    expect(service.isBookDetached('book-1')).toBe(true);

    detachedWindowClosedCallback?.({ bookId: 'book-1', sessionId: 'session-1' });

    expect(service.isBookDetached('book-1')).toBe(false);
  });
});
