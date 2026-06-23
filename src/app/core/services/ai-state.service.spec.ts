import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ToastService } from '../../shared/services/toast.service';
import { AIStateService, type AiChatMessage } from './ai-state.service';

describe('AIStateService', () => {
  let service: AIStateService;
  let invoke: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invoke = vi.fn().mockResolvedValue({ text: 'Done' });

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
            error: vi.fn(),
            warning: vi.fn(),
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
      service.generate('Continue', 'openrouter', 'model-1', true, messages),
    ).resolves.toBe('Done');

    expect(invoke).toHaveBeenCalledWith('ai:generate', {
      model: 'openrouter',
      modelId: 'model-1',
      prompt: 'Continue',
      reasoningMode: true,
      messages,
    });
  });
});
