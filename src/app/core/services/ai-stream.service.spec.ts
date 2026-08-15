import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { SystemPromptSelectionService } from '../../shared/services/system-prompt-selection.service';
import { ToastService } from '../../shared/services/toast.service';
import { AIStateService } from './ai-state.service';
import { AiStreamService } from './ai-stream.service';

describe('AiStreamService', () => {
  let service: AiStreamService;
  let generate: ReturnType<typeof vi.fn>;
  let abort: ReturnType<typeof vi.fn>;
  let getActivePresetId: ReturnType<typeof vi.fn>;
  let toastError: ReturnType<typeof vi.fn>;
  let onMessage: ReturnType<typeof vi.fn>;
  let listeners: Map<string, (...args: any[]) => void>;
  let cleanupFns: ReturnType<typeof vi.fn>[];

  beforeEach(() => {
    listeners = new Map();
    cleanupFns = [];
    generate = vi.fn().mockResolvedValue('');
    abort = vi.fn().mockResolvedValue(undefined);
    getActivePresetId = vi.fn().mockResolvedValue('chat-preset');
    toastError = vi.fn();
    onMessage = vi.fn((channel: string, callback: (...args: any[]) => void) => {
      listeners.set(channel, callback);

      const cleanup = vi.fn(() => listeners.delete(channel));
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
      ],
    });

    service = TestBed.inject(AiStreamService);
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('streams content tokens in order with CR/newline normalization', async () => {
    generate.mockImplementation(async () => {
      listeners.get('ai:generate-stream')?.('Hel');
      listeners.get('ai:generate-stream')?.('lo\r\n\nthere');
      return 'Hello there';
    });

    const tokens: string[] = [];

    await service.streamText({
      streamId: 'stream-1',
      bookId: 'book-1',
      systemPromptCategory: 'chat',
      prompt: 'Write',
      provider: 'openrouter',
      modelId: 'model-1',
      onToken: token => tokens.push(token),
    });

    expect(tokens.join('')).toBe('Hello\nthere');
    expect(generate).toHaveBeenCalledWith(
      'Write',
      'openrouter',
      'model-1',
      undefined,
      undefined,
      { category: 'chat', presetId: 'chat-preset' },
    );
  });

  it('passes structured chat messages to AIStateService', async () => {
    const messages = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi there' },
      { role: 'user' as const, content: 'Continue' },
    ];

    await service.streamText({
      streamId: 'stream-1',
      bookId: 'book-1',
      systemPromptCategory: 'chat',
      prompt: 'Continue',
      provider: 'openrouter',
      messages,
    });

    expect(generate).toHaveBeenCalledWith(
      'Continue',
      'openrouter',
      undefined,
      undefined,
      messages,
      { category: 'chat', presetId: 'chat-preset' },
    );
  });

  it('switches status to generating when content tokens arrive', async () => {
    generate.mockImplementation(async () => {
      listeners.get('ai:generate-stream')?.('A');
      return 'A';
    });

    const statuses: string[] = [];

    await service.streamText({
      streamId: 'stream-1',
      bookId: 'book-1',
      systemPromptCategory: 'chat',
      prompt: 'Write',
      onToken: vi.fn(),
      onStatusChange: status => statuses.push(status),
    });

    expect(statuses).toEqual(['loading', 'generating', 'idle']);
    expect(service.getLoadingSignal('stream-1')()).toBe('idle');
  });

  it('switches status to thinking when reasoning tokens arrive', async () => {
    generate.mockImplementation(async () => {
      listeners.get('ai:generate-reasoning-stream')?.('Considering');
      return '';
    });

    const statuses: string[] = [];

    await service.streamText({
      streamId: 'stream-1',
      bookId: 'book-1',
      systemPromptCategory: 'chat',
      prompt: 'Write',
      reasoningMode: true,
      onReasoningUpdate: vi.fn(),
      onStatusChange: status => statuses.push(status),
    });

    expect(statuses).toEqual(['loading', 'thinking', 'idle']);
    expect(service.getLoadingSignal('stream-1')()).toBe('idle');
  });

  it('emits throttled reasoning updates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    generate.mockImplementation(async () => {
      listeners.get('ai:generate-reasoning-stream')?.('a');
      vi.setSystemTime(201);
      listeners.get('ai:generate-reasoning-stream')?.('b');
      vi.setSystemTime(402);
      listeners.get('ai:generate-reasoning-stream')?.('c');
      return '';
    });

    const updates: string[] = [];

    await service.streamText({
      streamId: 'stream-1',
      bookId: 'book-1',
      systemPromptCategory: 'chat',
      prompt: 'Think',
      reasoningMode: true,
      onReasoningUpdate: reasoning => updates.push(reasoning),
    });

    expect(updates).toEqual(['a', 'ab', 'abc']);
  });

  it('calls AIStateService.abort when stopped', async () => {
    service.getLoadingSignal('stream-1').set('generating');

    await service.stopStream('stream-1');

    expect(abort).toHaveBeenCalledOnce();
    expect(service.getLoadingSignal('stream-1')()).toBe('idle');
  });

  it('cleans up listeners after success', async () => {
    generate.mockResolvedValue('Done');

    await service.streamText({
      streamId: 'stream-1',
      bookId: 'book-1',
      systemPromptCategory: 'chat',
      prompt: 'Write',
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
      systemPromptCategory: 'chat',
      prompt: 'Write',
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
      systemPromptCategory: 'chat',
      prompt: 'Write',
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
    expect(service.getLoadingSignal('stream-1')()).toBe('idle');
  });
});
