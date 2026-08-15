import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ToastService } from '../../../shared/services/toast.service';
import { buildAiPrompt } from '../../../shared/utils/ai-prompt-builder';
import { AiGenerationSessionService } from '../ai-generation-session.service';
import { AiStreamService } from '../ai-stream.service';

describe('AiGenerationSessionService', () => {
  let service: AiGenerationSessionService;
  let streamText: ReturnType<typeof vi.fn>;
  let stopStream: ReturnType<typeof vi.fn>;
  let warning: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    streamText = vi.fn();
    stopStream = vi.fn().mockResolvedValue(undefined);
    warning = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        AiGenerationSessionService,
        { provide: AiStreamService, useValue: { streamText, stopStream } },
        { provide: ToastService, useValue: { warning } },
      ],
    });

    service = TestBed.inject(AiGenerationSessionService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('accumulates streamed content and reasoning until completion', async () => {
    streamText.mockImplementation(async request => {
      request.onStatusChange?.('thinking');
      request.onReasoningUpdate?.('A plan');
      request.onStatusChange?.('generating');
      request.onToken?.('Hello');
      request.onToken?.(' world');
      return 'Hello world';
    });

    const session = service.start(request('session-1'))!;
    const result = await session.completion;

    expect(result).toEqual({
      status: 'complete',
      content: 'Hello world',
      reasoning: 'A plan',
      error: null,
    });
    expect(session.status()).toBe('complete');
    expect(service.getSession('session-1')).toBe(session);

    service.release('session-1');
    expect(service.sessions()).toEqual([]);
  });

  it('uses the final response when a provider emits no tokens', async () => {
    streamText.mockResolvedValue('Final only');

    const session = service.start(request('session-1'))!;

    await expect(session.completion).resolves.toMatchObject({
      status: 'complete',
      content: 'Final only',
    });
  });

  it('allows different purposes to run concurrently', async () => {
    const completions = new Map<string, (value: string) => void>();
    streamText.mockImplementation(request => new Promise(resolve => {
      completions.set(request.streamId, resolve);
    }));

    const chat = service.start(request('chat-1', 'chat-response'))!;
    const summary = service.start(request('summary-1', 'outline-summary'))!;

    expect(service.hasActiveSession()).toBe(true);
    expect(service.hasActiveSession('chat-response')).toBe(true);
    expect(service.hasActiveSession('outline-summary')).toBe(true);
    expect(service.sessions()).toEqual([chat, summary]);

    completions.get('summary-1')?.('Summary');
    completions.get('chat-1')?.('Reply');

    await expect(summary.completion).resolves.toMatchObject({ content: 'Summary' });
    await expect(chat.completion).resolves.toMatchObject({ content: 'Reply' });
  });

  it('rejects a second active session for the same purpose', () => {
    streamText.mockReturnValue(new Promise(() => undefined));

    const first = service.start(request('session-1'));
    const second = service.start(request('session-2'));

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(warning).toHaveBeenCalledWith(
      'Another AI generation for this purpose is already in progress.',
      'AI Generation',
    );
  });

  it('allows the same purpose to run concurrently for different scopes', async () => {
    const completions = new Map<string, (value: string) => void>();
    streamText.mockImplementation(request => new Promise(resolve => {
      completions.set(request.streamId, resolve);
    }));

    const first = service.start({ ...request('chat-1'), scopeId: 'thread-1' })!;
    const second = service.start({ ...request('chat-2'), scopeId: 'thread-2' })!;

    expect(first.scopeId).toBe('thread-1');
    expect(second.scopeId).toBe('thread-2');
    expect(service.hasActiveScopedSession({
      source: 'chat-response',
      scopeId: 'thread-1',
    })).toBe(true);

    completions.get('chat-1')?.('First');
    completions.get('chat-2')?.('Second');
    await Promise.all([first.completion, second.completion]);
  });

  it('rejects a second active session for the same purpose and scope', () => {
    streamText.mockReturnValue(new Promise(() => undefined));

    const first = service.start({ ...request('chat-1'), scopeId: 'thread-1' });
    const second = service.start({ ...request('chat-2'), scopeId: 'thread-1' });

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(warning).toHaveBeenCalledWith(
      'Another AI generation for this purpose is already in progress.',
      'AI Generation',
    );
  });

  it('stops one scoped session without interrupting a sibling scope', async () => {
    let rejectFirst!: (error: unknown) => void;
    let resolveSecond!: (content: string) => void;
    streamText.mockImplementation(request => {
      if (request.streamId === 'chat-1') {
        request.onToken?.('Partial');
        return new Promise((_, reject) => rejectFirst = reject);
      }

      return new Promise(resolve => resolveSecond = resolve);
    });
    stopStream.mockImplementation(async streamId => {
      if (streamId === 'chat-1') rejectFirst(new Error('aborted'));
    });

    const first = service.start({ ...request('chat-1'), scopeId: 'thread-1' })!;
    const second = service.start({ ...request('chat-2'), scopeId: 'thread-2' })!;
    await service.stop(first.id);

    await expect(first.completion).resolves.toMatchObject({
      status: 'stopped',
      content: 'Partial',
    });
    expect(service.hasActiveScopedSession({
      source: 'chat-response',
      scopeId: 'thread-2',
    })).toBe(true);

    resolveSecond('Done');
    await second.completion;
  });

  it('rejects a reused session ID even for a different purpose', async () => {
    streamText.mockResolvedValue('Done');
    const first = service.start(request('session-1'))!;
    await first.completion;

    const duplicate = service.start(request('session-1', 'outline-summary'));

    expect(duplicate).toBeNull();
    expect(service.getSession('session-1')).toBe(first);
    expect(warning).toHaveBeenCalledWith(
      'This AI generation session is already being managed.',
      'AI Generation',
    );
  });

  it('rejects a reused session ID across different scopes', () => {
    streamText.mockReturnValue(new Promise(() => undefined));

    const first = service.start({ ...request('chat-1'), scopeId: 'thread-1' });
    const duplicate = service.start({ ...request('chat-1'), scopeId: 'thread-2' });

    expect(first).not.toBeNull();
    expect(duplicate).toBeNull();
    expect(warning).toHaveBeenCalledWith(
      'This AI generation session is already being managed.',
      'AI Generation',
    );
  });

  it('marks an aborted request as stopped and preserves partial content', async () => {
    let rejectStream!: (error: unknown) => void;
    streamText.mockImplementation(request => {
      request.onToken?.('Partial');
      return new Promise((_, reject) => rejectStream = reject);
    });
    stopStream.mockImplementation(async () => rejectStream(new Error('aborted')));

    const session = service.start(request('session-1'))!;
    await service.stop('session-1');

    await expect(session.completion).resolves.toEqual({
      status: 'stopped',
      content: 'Partial',
      reasoning: '',
      error: null,
    });
    expect(stopStream).toHaveBeenCalledWith('session-1');
  });

  it('stops one purpose without interrupting another', async () => {
    let rejectChat!: (error: unknown) => void;
    let resolveSummary!: (content: string) => void;
    streamText.mockImplementation(request => {
      if (request.streamId === 'chat-1') {
        request.onToken?.('Partial reply');
        return new Promise((_, reject) => rejectChat = reject);
      }

      return new Promise(resolve => resolveSummary = resolve);
    });
    stopStream.mockImplementation(async streamId => {
      if (streamId === 'chat-1') rejectChat(new Error('aborted'));
    });

    const chat = service.start(request('chat-1', 'chat-response'))!;
    const summary = service.start(request('summary-1', 'outline-summary'))!;
    await service.stop('chat-1');

    await expect(chat.completion).resolves.toMatchObject({
      status: 'stopped',
      content: 'Partial reply',
    });
    expect(service.hasActiveSession('outline-summary')).toBe(true);

    resolveSummary('Finished summary');
    await expect(summary.completion).resolves.toMatchObject({
      status: 'complete',
      content: 'Finished summary',
    });
  });

  it('retains failures until the owner releases the session', async () => {
    const error = new Error('failed');
    streamText.mockRejectedValue(error);

    const session = service.start(request('session-1'))!;

    await expect(session.completion).resolves.toEqual({
      status: 'failed',
      content: '',
      reasoning: '',
      error,
    });
    expect(service.hasActiveSession()).toBe(false);
    expect(service.getSession('session-1')).toBe(session);
  });
});

function request(
  streamId: string,
  source: 'chat-response' | 'outline-summary' = 'chat-response',
) {
  return {
    streamId,
    source,
    bookId: 'book-1',
    aiPrompt: buildAiPrompt({
      requestType: 'chat',
      messages: [{ role: 'user', parts: [{ type: 'text', content: 'Hello' }] }],
    }),
  };
}
