import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ElectronService } from '../../../core/services/electron.service';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  let service: ChatService;
  let electronService: { invoke: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    electronService = {
      invoke: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        ChatService,
        { provide: ElectronService, useValue: electronService },
      ],
    });

    service = TestBed.inject(ChatService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('maps chat operations to chat IPC channels', async () => {
    const result = { id: 'result-1' };
    electronService.invoke.mockResolvedValue(result);

    await expect(service.getThreads('book-1')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('chat:get-threads', {
      bookId: 'book-1',
      includeArchived: false,
    });

    await expect(service.getThreads('book-1', true)).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('chat:get-threads', {
      bookId: 'book-1',
      includeArchived: true,
    });

    await expect(service.getThread('thread-1')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('chat:get-thread', { id: 'thread-1' });

    await expect(service.createThread({ bookId: 'book-1', title: 'Draft chat' })).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('chat:create-thread', {
      data: { bookId: 'book-1', title: 'Draft chat' },
    });

    await expect(service.updateThread('thread-1', { title: 'Renamed' })).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('chat:update-thread', {
      id: 'thread-1',
      data: { title: 'Renamed' },
    });

    await expect(service.archiveThread('thread-1')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('chat:archive-thread', { id: 'thread-1' });

    await expect(service.deleteThread('thread-1')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('chat:delete-thread', { id: 'thread-1' });

    await expect(service.createMessage({
      threadId: 'thread-1',
      role: 'user',
      content: 'Hello',
    })).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('chat:create-message', {
      data: {
        threadId: 'thread-1',
        role: 'user',
        content: 'Hello',
      },
    });

    await expect(service.updateMessage('message-1', { content: 'Updated' })).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('chat:update-message', {
      id: 'message-1',
      data: { content: 'Updated' },
    });

    await expect(service.deleteMessage('message-1')).resolves.toBe(result);
    expect(electronService.invoke).toHaveBeenLastCalledWith('chat:delete-message', { id: 'message-1' });
  });
});
