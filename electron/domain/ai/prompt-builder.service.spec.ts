import { beforeEach, describe, expect, it, vi } from 'vitest';

const getById = vi.hoisted(() => vi.fn());

vi.mock('../../../db/repositories/system-prompt.repository', () => ({
    systemPromptRepository: { getById },
}));

import {
    BUILT_IN_SYSTEM_PROMPT_PRESETS,
} from '../../../shared/constants/ai-system-prompts';
import type { SystemPromptPresetDto } from '../../../shared/models/system-prompt.model';
import type { AiPromptRequest } from './models';
import { PromptBuilderService } from './prompt-builder.service';

describe('PromptBuilderService', () => {
    const service = new PromptBuilderService({ getById });

    beforeEach(() => {
        getById.mockReset();
    });

    function makeRequest(overrides: Partial<AiPromptRequest> = {}): AiPromptRequest {
        return {
            model: 'openrouter',
            prompt: 'Draft a tense opening scene.',
            ...overrides,
        };
    }

    it('builds a legacy user prompt without injecting a default system prompt', async () => {
        const payload = await service.buildChatCompletionPayload(makeRequest({
            modelId: 'openai/gpt-4o-mini',
        }), 'fallback-model');

        expect(payload).toEqual({
            model: 'openai/gpt-4o-mini',
            messages: [{ role: 'user', content: 'Draft a tense opening scene.' }],
            temperature: 0.5,
            stream: true,
        });
    });

    it('preserves a caller system message for a legacy request', async () => {
        const payload = await service.buildChatCompletionPayload(makeRequest({
            systemMessage: 'You are a fiction writing assistant.',
            prompt: 'Suggest a plot turn.',
        }), 'fallback-model');

        expect(payload.messages).toEqual([
            { role: 'system', content: 'You are a fiction writing assistant.' },
            { role: 'user', content: 'Suggest a plot turn.' },
        ]);
    });

    it('preserves structured messages for a legacy request', async () => {
        const payload = await service.buildChatCompletionPayload(makeRequest({
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

    it('filters empty content and trims retained messages', async () => {
        const payload = await service.buildChatCompletionPayload(makeRequest({
            messages: [
                { role: 'system', content: '   ' },
                { role: 'user', content: '  Keep this.  ' },
                { role: 'assistant', content: '\n\t' },
            ],
        }), 'fallback-model');

        expect(payload.messages).toEqual([{ role: 'user', content: 'Keep this.' }]);
    });

    it('resolves a built-in preset and applies all of its generation settings', async () => {
        const preset = BUILT_IN_SYSTEM_PROMPT_PRESETS.summary;
        const payload = await service.buildChatCompletionPayload(makeRequest({
            systemPromptPreset: { category: 'summary', presetId: preset.id },
        }), 'fallback-model');

        expect(payload).toMatchObject({
            messages: [
                { role: 'system', content: preset.systemPrompt },
                { role: 'user', content: 'Draft a tense opening scene.' },
            ],
            temperature: preset.temperature,
            top_p: preset.topP,
            presence_penalty: preset.presencePenalty,
            frequency_penalty: preset.frequencyPenalty,
        });
        expect(payload.max_tokens).toBeUndefined();
        expect(getById).not.toHaveBeenCalled();
    });

    it('loads a stored preset by ID and replaces request generation settings', async () => {
        const preset = storedPreset({
            scope: 'book',
            bookId: 'book-1',
            temperature: 1.1,
            topP: 0.65,
            maxOutputTokens: 900,
            presencePenalty: 0.4,
            frequencyPenalty: -0.2,
        });
        getById.mockResolvedValue(preset);

        const payload = await service.buildChatCompletionPayload(makeRequest({
            temperature: 0.1,
            maxTokens: 50,
            systemPromptPreset: { category: 'chat', presetId: preset.id },
        }), 'fallback-model');

        expect(getById).toHaveBeenCalledWith(preset.id);
        expect(payload).toMatchObject({
            messages: [
                { role: 'system', content: preset.systemPrompt },
                { role: 'user', content: 'Draft a tense opening scene.' },
            ],
            temperature: 1.1,
            top_p: 0.65,
            max_tokens: 900,
            presence_penalty: 0.4,
            frequency_penalty: -0.2,
        });
    });

    it('omits max tokens when the selected preset uses the provider default', async () => {
        const preset = storedPreset({ maxOutputTokens: null });
        getById.mockResolvedValue(preset);

        const payload = await service.buildChatCompletionPayload(makeRequest({
            maxTokens: 50,
            systemPromptPreset: { category: 'chat', presetId: preset.id },
        }), 'fallback-model');

        expect(payload.max_tokens).toBeUndefined();
    });

    it('rejects missing and category-mismatched presets', async () => {
        getById.mockResolvedValueOnce(undefined);
        await expect(service.buildChatCompletionPayload(makeRequest({
            systemPromptPreset: { category: 'chat', presetId: 'missing' },
        }), 'fallback-model')).rejects.toThrow("preset 'missing' does not exist");

        getById.mockResolvedValueOnce(storedPreset({ category: 'summary' }));
        await expect(service.buildChatCompletionPayload(makeRequest({
            systemPromptPreset: { category: 'chat', presetId: 'stored-preset' },
        }), 'fallback-model')).rejects.toThrow("does not belong to category 'chat'");

        await expect(service.buildChatCompletionPayload(makeRequest({
            systemPromptPreset: {
                category: 'chat',
                presetId: BUILT_IN_SYSTEM_PROMPT_PRESETS.summary.id,
            },
        }), 'fallback-model')).rejects.toThrow("does not belong to category 'chat'");
    });

    it('rejects selected presets combined with caller-provided system messages', async () => {
        const selection = {
            category: 'chat' as const,
            presetId: BUILT_IN_SYSTEM_PROMPT_PRESETS.chat.id,
        };

        await expect(service.buildChatCompletionPayload(makeRequest({
            systemMessage: 'Caller system prompt.',
            systemPromptPreset: selection,
        }), 'fallback-model')).rejects.toThrow('cannot combine a preset');

        await expect(service.buildChatCompletionPayload(makeRequest({
            messages: [
                { role: 'system', content: 'Caller system prompt.' },
                { role: 'user', content: 'Write.' },
            ],
            systemPromptPreset: selection,
        }), 'fallback-model')).rejects.toThrow('cannot combine a preset');
    });

    it('does not mutate the source request while resolving a preset', async () => {
        const request = makeRequest({
            systemPromptPreset: {
                category: 'chat',
                presetId: BUILT_IN_SYSTEM_PROMPT_PRESETS.chat.id,
            },
        });
        const original = structuredClone(request);

        await service.buildChatCompletionPayload(request, 'fallback-model');

        expect(request).toEqual(original);
    });

    it('uses legacy model, token, temperature, and reasoning options without a preset', async () => {
        const payload = await service.buildChatCompletionPayload(makeRequest({
            temperature: 0.8,
            maxTokens: 1200,
            reasoningMode: true,
        }), 'fallback-model');

        expect(payload).toMatchObject({
            model: 'fallback-model',
            temperature: 0.8,
            max_tokens: 1200,
            reasoning: { enabled: true, effort: 'medium' },
        });
        expect(payload.top_p).toBeUndefined();
    });

    it('rejects requests without any non-empty non-system message', async () => {
        await expect(service.buildChatCompletionPayload(makeRequest({
            prompt: '   ',
        }), 'fallback-model')).rejects.toThrow('AI prompt requires at least one non-empty message.');
    });
});

function storedPreset(
    overrides: Partial<SystemPromptPresetDto> = {},
): SystemPromptPresetDto {
    return {
        id: 'stored-preset',
        name: 'Stored Preset',
        systemPrompt: 'Use the stored system instructions.',
        category: 'chat',
        scope: 'global',
        bookId: null,
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 500,
        presencePenalty: 0,
        frequencyPenalty: 0,
        defaultModelId: null,
        createdAt: new Date(0).toISOString(),
        lastEditedAt: new Date(0).toISOString(),
        ...overrides,
    };
}
