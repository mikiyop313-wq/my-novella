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

  it('rejects a second active session without replacing the first', () => {
    streamText.mockReturnValue(new Promise(() => undefined));

    const first = service.start(request('session-1'));
    const second = service.start(request('session-2'));

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(warning).toHaveBeenCalledWith(
      'Another AI generation is already in progress.',
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

function request(streamId: string) {
  return {
    streamId,
    source: 'chat-response' as const,
    bookId: 'book-1',
    aiPrompt: buildAiPrompt({
      requestType: 'chat',
      messages: [{ role: 'user', parts: [{ type: 'text', content: 'Hello' }] }],
    }),
  };
}
