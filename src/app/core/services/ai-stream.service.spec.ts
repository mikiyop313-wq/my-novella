import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { SystemPromptSelectionService } from '../../shared/services/system-prompt-selection.service';
import { ToastService } from '../../shared/services/toast.service';
import { AIStateService } from './ai-state.service';
import { AiStreamService } from './ai-stream.service';
import { SystemPromptModelService } from '../../shared/services/system-prompt-model.service';
import { buildAiPrompt } from '../../shared/utils/ai-prompt-builder';

describe('AiStreamService', () => {
  let service: AiStreamService;
  let generate: ReturnType<typeof vi.fn>;
  let abort: ReturnType<typeof vi.fn>;
  let getActivePresetId: ReturnType<typeof vi.fn>;
  let toastError: ReturnType<typeof vi.fn>;
  let onMessage: ReturnType<typeof vi.fn>;
  let listeners: Map<string, Set<(...args: any[]) => void>>;
  let emitMessage: (channel: string, payload: unknown) => void;
  let cleanupFns: ReturnType<typeof vi.fn>[];
  let resolveActiveModel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listeners = new Map();
    emitMessage = (channel, payload) => {
      for (const listener of listeners.get(channel) ?? []) listener(payload);
    };
    cleanupFns = [];
    generate = vi.fn().mockResolvedValue('');
    abort = vi.fn().mockResolvedValue(undefined);
    getActivePresetId = vi.fn().mockResolvedValue('chat-preset');
    toastError = vi.fn();
    resolveActiveModel = vi.fn().mockResolvedValue({
      status: 'ready',
      selectorId: 'openai/gpt-5',
      provider: 'openai',
      modelId: 'gpt-5',
    });
    onMessage = vi.fn((channel: string, callback: (...args: any[]) => void) => {
      const channelListeners = listeners.get(channel) ?? new Set();
      channelListeners.add(callback);
      listeners.set(channel, channelListeners);

      const cleanup = vi.fn(() => {
        channelListeners.delete(callback);
        if (channelListeners.size === 0) listeners.delete(channel);
      });
      cleanupFns.push(cleanup);

      return cleanup;
    });

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        onMessage,
      },
    });

    TestBed.configureTestingModule({
      providers: [
        AiStreamService,
        { provide: AIStateService, useValue: { generate, abort } },
        { provide: SystemPromptSelectionService, useValue: { getActivePresetId } },
        { provide: ToastService, useValue: { error: toastError } },
        {
          provide: SystemPromptModelService,
          useValue: { resolveActiveModel },
        },
      ],
    });

    service = TestBed.inject(AiStreamService);
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('streams content tokens in order while normalizing CRLF', async () => {
    generate.mockImplementation(async () => {
      emitMessage('ai:generate-stream', { streamId: 'stream-1', token: 'Hel' });
      emitMessage('ai:generate-stream', { streamId: 'stream-1', token: 'lo\r\n\nthere' });
      return 'Hello there';
    });

    const tokens: string[] = [];

    await service.streamText({
      streamId: 'stream-1',
      bookId: 'book-1',
      aiPrompt: textPrompt('chat', 'Write'),
      provider: 'openrouter',
      modelId: 'model-1',
      onToken: token => tokens.push(token),
    });

    expect(tokens.join('')).toBe('Hello\n\nthere');
    expect(generate).toHaveBeenCalledWith({
      streamId: 'stream-1',
      aiPrompt: textPrompt('chat', 'Write'),
      model: 'openrouter',
      modelId: 'model-1',
      reasoningMode: undefined,
      systemPromptPreset: { category: 'chat', presetId: 'chat-preset' },
    });
  });

  it('uses the active prompt preset model when the caller does not supply one', async () => {
    await service.streamText({
      streamId: 'stream-1',
      bookId: 'book-1',
      aiPrompt: textPrompt('summary', 'Summarize'),
    });

    expect(resolveActiveModel).toHaveBeenCalledWith('book-1', 'summary');
    expect(generate).toHaveBeenCalledWith({
      streamId: 'stream-1',
      aiPrompt: textPrompt('summary', 'Summarize'),
      model: 'openai',
      modelId: 'gpt-5',
      reasoningMode: undefined,
      systemPromptPreset: { category: 'summary', presetId: 'chat-preset' },
    });
  });

  it('passes structured chat messages to AIStateService', async () => {
    const messages = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi there' },
      { role: 'user' as const, content: 'Continue' },
    ];

    const aiPrompt = buildAiPrompt({
      requestType: 'chat',
      messages: messages.map(message => ({
        role: message.role,
        parts: [{ type: 'text' as const, content: message.content }],
      })),
    });

    await service.streamText({
      streamId: 'stream-1',
      bookId: 'book-1',
      aiPrompt,
      provider: 'openrouter',
    });

    expect(generate).toHaveBeenCalledWith({
      streamId: 'stream-1',
      aiPrompt,
      model: 'openrouter',
      modelId: undefined,
      reasoningMode: undefined,
      systemPromptPreset: { category: 'chat', presetId: 'chat-preset' },
    });
  });

  it('switches status to generating when content tokens arrive', async () => {
    generate.mockImplementation(async () => {
      emitMessage('ai:generate-stream', { streamId: 'stream-1', token: 'A' });
      return 'A';
    });

    const statuses: string[] = [];

    await service.streamText({
      streamId: 'stream-1',
      bookId: 'book-1',
      aiPrompt: textPrompt('chat', 'Write'),
      onToken: vi.fn(),
      onStatusChange: status => statuses.push(status),
    });

    expect(statuses).toEqual(['loading', 'generating', 'idle']);
  });

  it('switches status to thinking when reasoning tokens arrive', async () => {
    generate.mockImplementation(async () => {
      emitMessage('ai:generate-reasoning-stream', {
        streamId: 'stream-1',
        token: 'Considering',
      });
      return '';
    });

    const statuses: string[] = [];

    await service.streamText({
      streamId: 'stream-1',
      bookId: 'book-1',
      aiPrompt: textPrompt('chat', 'Write'),
      reasoningMode: true,
      onReasoningUpdate: vi.fn(),
      onStatusChange: status => statuses.push(status),
    });

    expect(statuses).toEqual(['loading', 'thinking', 'idle']);
  });

  it('emits throttled reasoning updates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    generate.mockImplementation(async () => {
      emitMessage('ai:generate-reasoning-stream', { streamId: 'stream-1', token: 'a' });
      vi.setSystemTime(201);
      emitMessage('ai:generate-reasoning-stream', { streamId: 'stream-1', token: 'b' });
      vi.setSystemTime(402);
      emitMessage('ai:generate-reasoning-stream', { streamId: 'stream-1', token: 'c' });
      return '';
    });

    const updates: string[] = [];

    await service.streamText({
      streamId: 'stream-1',
      bookId: 'book-1',
      aiPrompt: textPrompt('chat', 'Think'),
      reasoningMode: true,
      onReasoningUpdate: reasoning => updates.push(reasoning),
    });

    expect(updates).toEqual(['a', 'ab', 'abc']);
  });

  it('calls AIStateService.abort when stopped', async () => {
    await service.stopStream('stream-1');

    expect(abort).toHaveBeenCalledWith('stream-1');
  });

  it('isolates interleaved content and reasoning events by stream ID', async () => {
    const completions = new Map<string, (content: string) => void>();
    generate.mockImplementation(request => new Promise(resolve => {
      completions.set(request.streamId, resolve);
    }));
    const firstContent: string[] = [];
    const secondContent: string[] = [];
    const firstReasoning: string[] = [];
    const secondReasoning: string[] = [];

    const first = service.streamText({
      streamId: 'stream-1',
      bookId: 'book-1',
      aiPrompt: textPrompt('chat', 'First'),
      reasoningMode: true,
      onToken: token => firstContent.push(token),
      onReasoningUpdate: reasoning => firstReasoning.push(reasoning),
    });
    const second = service.streamText({
      streamId: 'stream-2',
      bookId: 'book-1',
      aiPrompt: textPrompt('summary', 'Second'),
      reasoningMode: true,
      onToken: token => secondContent.push(token),
      onReasoningUpdate: reasoning => secondReasoning.push(reasoning),
    });

    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
    emitMessage('ai:generate-stream', { streamId: 'stream-2', token: 'B' });
    emitMessage('ai:generate-reasoning-stream', { streamId: 'stream-1', token: 'Think A' });
    emitMessage('ai:generate-stream', { streamId: 'stream-1', token: 'A' });
    emitMessage('ai:generate-reasoning-stream', { streamId: 'stream-2', token: 'Think B' });
    completions.get('stream-1')?.('A');
    completions.get('stream-2')?.('B');

    await Promise.all([first, second]);

    expect(firstContent.join('')).toBe('A');
    expect(secondContent.join('')).toBe('B');
    expect(firstReasoning.at(-1)).toBe('Think A');
    expect(secondReasoning.at(-1)).toBe('Think B');
  });

  it('cleans up listeners after success', async () => {
    generate.mockResolvedValue('Done');

    await service.streamText({
      streamId: 'stream-1',
      bookId: 'book-1',
      aiPrompt: textPrompt('chat', 'Write'),
      reasoningMode: true,
      onToken: vi.fn(),
      onReasoningUpdate: vi.fn(),
    });

    expect(cleanupFns).toHaveLength(2);
    expect(cleanupFns.every(cleanup => cleanup.mock.calls.length === 1)).toBe(true);
    expect(listeners.size).toBe(0);
  });

  it('cleans up listeners and rethrows generation errors', async () => {
    const error = new Error('Generation failed');
    generate.mockRejectedValue(error);

    await expect(service.streamText({
      streamId: 'stream-1',
      bookId: 'book-1',
      aiPrompt: textPrompt('chat', 'Write'),
      reasoningMode: true,
      onToken: vi.fn(),
      onReasoningUpdate: vi.fn(),
    })).rejects.toBe(error);

    expect(cleanupFns).toHaveLength(2);
    expect(cleanupFns.every(cleanup => cleanup.mock.calls.length === 1)).toBe(true);
    expect(listeners.size).toBe(0);
  });

  it('does not register listeners or generate when preset lookup fails', async () => {
    const error = new Error('Selection unavailable');
    getActivePresetId.mockRejectedValue(error);
    const statuses: string[] = [];

    await expect(service.streamText({
      streamId: 'stream-1',
      bookId: 'book-1',
      aiPrompt: textPrompt('chat', 'Write'),
      onToken: vi.fn(),
      onStatusChange: status => statuses.push(status),
    })).rejects.toBe(error);

    expect(getActivePresetId).toHaveBeenCalledWith('book-1', 'chat');
    expect(onMessage).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      'Unable to load the active system prompt preset.',
      'AI Generation',
    );
    expect(statuses).toEqual(['loading', 'idle']);
  });

  it('suppresses preset lookup error toasts when requested', async () => {
    const error = new Error('Selection unavailable');
    getActivePresetId.mockRejectedValue(error);

    await expect(service.streamText({
      streamId: 'stream-1',
      bookId: 'book-1',
      aiPrompt: textPrompt('chat', 'Write'),
      suppressErrorToasts: true,
    })).rejects.toBe(error);

    expect(toastError).not.toHaveBeenCalled();
  });
});

function textPrompt(
  requestType: 'chat' | 'summary',
  content: string,
) {
  return buildAiPrompt({
    requestType,
    messages: [{
      role: 'user',
      parts: [{ type: 'text', content }],
    }],
  });
}
