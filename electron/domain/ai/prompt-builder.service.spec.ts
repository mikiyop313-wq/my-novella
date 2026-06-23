import { describe, expect, it } from 'vitest';

import { PromptBuilderService } from './prompt-builder.service';
import { AiPromptRequest } from './models';

describe('PromptBuilderService', () => {
    const service = new PromptBuilderService();

    function makeRequest(overrides: Partial<AiPromptRequest> = {}): AiPromptRequest {
        return {
            model: 'openrouter',
            prompt: 'Draft a tense opening scene.',
            ...overrides,
        };
    }

    it('builds a user prompt payload', () => {
        const payload = service.buildChatCompletionPayload(makeRequest({
            modelId: 'openai/gpt-4o-mini',
        }), 'fallback-model');

        expect(payload).toEqual({
            model: 'openai/gpt-4o-mini',
            messages: [
                { role: 'user', content: 'Draft a tense opening scene.' },
            ],
            temperature: 0.5,
            stream: true,
        });
    });

    it('includes the system message before the user prompt', () => {
        const payload = service.buildChatCompletionPayload(makeRequest({
            systemMessage: 'You are a fiction writing assistant.',
            prompt: 'Suggest a plot turn.',
        }), 'fallback-model');

        expect(payload.messages).toEqual([
            { role: 'system', content: 'You are a fiction writing assistant.' },
            { role: 'user', content: 'Suggest a plot turn.' },
        ]);
    });

    it('uses structured messages when provided', () => {
        const payload = service.buildChatCompletionPayload(makeRequest({
            prompt: 'Ignored fallback prompt.',
            messages: [
                { role: 'system', content: 'Stay concise.' },
                { role: 'user', content: 'What should happen next?' },
                { role: 'assistant', content: 'Raise the stakes.' },
            ],
        }), 'fallback-model');

        expect(payload.messages).toEqual([
            { role: 'system', content: 'Stay concise.' },
            { role: 'user', content: 'What should happen next?' },
            { role: 'assistant', content: 'Raise the stakes.' },
        ]);
    });

    it('filters empty message content and trims retained messages', () => {
        const payload = service.buildChatCompletionPayload(makeRequest({
            messages: [
                { role: 'system', content: '   ' },
                { role: 'user', content: '  Keep this.  ' },
                { role: 'assistant', content: '\n\t' },
            ],
        }), 'fallback-model');

        expect(payload.messages).toEqual([
            { role: 'user', content: 'Keep this.' },
        ]);
    });

    it('uses the default model when no model ID is provided', () => {
        const payload = service.buildChatCompletionPayload(makeRequest(), 'fallback-model');

        expect(payload.model).toBe('fallback-model');
    });

    it('adds max tokens and custom temperature when provided', () => {
        const payload = service.buildChatCompletionPayload(makeRequest({
            temperature: 0.8,
            maxTokens: 1200,
        }), 'fallback-model');

        expect(payload.temperature).toBe(0.8);
        expect(payload.max_tokens).toBe(1200);
    });

    it('adds reasoning only when enabled', () => {
        const withoutReasoning = service.buildChatCompletionPayload(makeRequest({
            reasoningMode: false,
        }), 'fallback-model');
        const withReasoning = service.buildChatCompletionPayload(makeRequest({
            reasoningMode: true,
        }), 'fallback-model');

        expect(withoutReasoning.reasoning).toBeUndefined();
        expect(withReasoning.reasoning).toEqual({
            enabled: true,
            effort: 'medium',
        });
    });

    it('rejects requests without any non-empty message', () => {
        expect(() => service.buildChatCompletionPayload(makeRequest({
            prompt: '   ',
        }), 'fallback-model')).toThrow('AI prompt requires at least one non-empty message.');
    });
});
