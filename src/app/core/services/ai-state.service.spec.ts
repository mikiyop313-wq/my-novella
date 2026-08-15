import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ToastService } from '../../shared/services/toast.service';
import { AIStateService, type AiChatMessage } from './ai-state.service';

describe('AIStateService', () => {
  let service: AIStateService;
  let invoke: ReturnType<typeof vi.fn>;
  let toastError: ReturnType<typeof vi.fn>;
  let toastWarning: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invoke = vi.fn().mockResolvedValue({ text: 'Done' });
    toastError = vi.fn();
    toastWarning = vi.fn();

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        invoke,
      },
    });

    TestBed.configureTestingModule({
      providers: [
        AIStateService,
        {
          provide: ToastService,
          useValue: {
            error: toastError,
            warning: toastWarning,
          },
        },
      ],
    });

    service = TestBed.inject(AIStateService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('forwards structured chat messages to ai:generate', async () => {
    const messages: AiChatMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: 'Continue' },
    ];

    await expect(
      service.generate({
        streamId: 'stream-1',
        aiPrompt: {
          systemPromptCategory: 'chat',
          prompt: 'Continue',
          messages,
        },
        model: 'openrouter',
        modelId: 'model-1',
        reasoningMode: true,
        systemPromptPreset: { category: 'chat', presetId: 'custom-chat' },
      }),
    ).resolves.toBe('Done');

    expect(invoke).toHaveBeenCalledWith('ai:generate', {
      streamId: 'stream-1',
      model: 'openrouter',
      modelId: 'model-1',
      prompt: 'Continue',
      reasoningMode: true,
      messages,
      systemPromptPreset: { category: 'chat', presetId: 'custom-chat' },
    });
    expect(invoke.mock.calls[0][1]).not.toHaveProperty('bookId');
  });

  it('aborts only the requested stream', async () => {
    const abortAiGeneration = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { invoke, abortAiGeneration },
    });

    await service.abort('stream-2');

    expect(abortAiGeneration).toHaveBeenCalledWith('stream-2');
  });

  it('reports an aborted IPC result without showing a failure toast', async () => {
    invoke.mockResolvedValue({ text: '', modelUsed: 'model-1', aborted: true });

    await expect(service.generate({
      streamId: 'stream-1',
      aiPrompt: {
        systemPromptCategory: 'chat',
        prompt: 'Continue',
        messages: [{ role: 'user', content: 'Continue' }],
      },
      model: 'openrouter',
    })).rejects.toMatchObject({ name: 'AbortError' });

    expect(toastError).not.toHaveBeenCalled();
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it('suppresses provider failure toasts when requested', async () => {
    invoke.mockRejectedValue(new Error('401 Unauthorized'));

    await expect(service.generate({
      streamId: 'stream-1',
      aiPrompt: {
        systemPromptCategory: 'rephrase',
        prompt: 'Rewrite',
        messages: [{ role: 'user', content: 'Rewrite' }],
      },
      model: 'openrouter',
      suppressErrorToasts: true,
    })).rejects.toThrow('401 Unauthorized');

    expect(toastError).not.toHaveBeenCalled();
    expect(toastWarning).not.toHaveBeenCalled();
  });
});
