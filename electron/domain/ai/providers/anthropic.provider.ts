import type { AiModel } from '../../../../shared/models/ai.model';
import { apiKeyService } from '../api-key.service';
import type { ApiKeyService } from '../api-key.service';
import type { AiPromptRequest, AiPromptResponse } from '../models';
import { promptBuilderService } from '../prompt-builder.service';
import type { AiProvider } from './ai-provider.interface';
import {
    asObject,
    assertSuccessfulResponse,
    parseJsonResponse,
    requireModelId,
} from './provider-utils';
import { consumeAnthropicStream } from './streaming/anthropic-stream';

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;
const MODEL_LIST_TIMEOUT_MS = 10_000;

export class AnthropicProvider implements AiProvider {
    readonly id = 'anthropic';
    readonly name = 'Anthropic';

    constructor(private readonly keys: Pick<ApiKeyService, 'getApiKey'> = apiKeyService) {}

    async generate(request: AiPromptRequest): Promise<AiPromptResponse> {
        const apiKey = await this.requireApiKey();
        const modelId = requireModelId(request.modelId, this.name);
        const normalized = await promptBuilderService.buildChatCompletionPayload(request, modelId);
        const systemMessages = normalized.messages
            .filter((message) => message.role === 'system')
            .map((message) => message.content);
        const messages = normalized.messages.filter((message) => message.role !== 'system');

        const response = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
            method: 'POST',
            signal: request.abortSignal,
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': ANTHROPIC_VERSION,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: modelId,
                messages,
                max_tokens: normalized.max_tokens ?? DEFAULT_MAX_TOKENS,
                stream: true,
                ...(systemMessages.length > 0 ? { system: systemMessages.join('\n\n') } : {}),
                ...(request.reasoningMode
                    ? { thinking: { type: 'adaptive', display: 'summarized' } }
                    : {}),
            }),
        });
        await assertSuccessfulResponse(response, this.name);

        const streamed = await consumeAnthropicStream(response.body, {
            onToken: request.onToken,
            onReasoningToken: request.onReasoningToken,
        });
        return { ...streamed, modelUsed: modelId };
    }

    async listModels(): Promise<AiModel[]> {
        const apiKey = await this.keys.getApiKey('anthropic');
        if (!apiKey) return [];

        const signal = AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS);
        const models: AiModel[] = [];
        let afterId: string | null = null;

        do {
            const url = new URL(`${ANTHROPIC_BASE_URL}/models`);
            url.searchParams.set('limit', '1000');
            if (afterId) url.searchParams.set('after_id', afterId);

            const response = await fetch(url, {
                signal,
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': ANTHROPIC_VERSION,
                },
            });
            await assertSuccessfulResponse(response, this.name);

            const body = asObject(await parseJsonResponse(response, this.name));
            if (!body || !Array.isArray(body['data']) || typeof body['has_more'] !== 'boolean') {
                throw new Error('Anthropic returned a malformed model list.');
            }

            for (const rawModel of body['data']) {
                const model = asObject(rawModel);
                if (
                    !model
                    || typeof model['id'] !== 'string'
                    || !model['id'].trim()
                    || typeof model['display_name'] !== 'string'
                ) {
                    throw new Error('Anthropic returned a malformed model list.');
                }

                const capabilities = asObject(model['capabilities']);
                const thinking = asObject(capabilities?.['thinking']);
                const types = asObject(thinking?.['types']);
                const adaptive = asObject(types?.['adaptive']);
                models.push({
                    id: `anthropic/${model['id']}`,
                    name: model['display_name'],
                    provider: 'anthropic',
                    providerName: 'Anthropic (Direct)',
                    source: 'direct',
                    supportsReasoning: adaptive?.['supported'] === true,
                });
            }

            if (body['has_more']) {
                if (typeof body['last_id'] !== 'string' || !body['last_id']) {
                    throw new Error('Anthropic returned a malformed model list.');
                }
                afterId = body['last_id'];
            } else {
                afterId = null;
            }
        } while (afterId);

        return models;
    }

    async testConnection(): Promise<void> {
        await this.requireApiKey('connection test');
        await this.listModels();
    }

    private async requireApiKey(action = 'generation'): Promise<string> {
        const apiKey = await this.keys.getApiKey('anthropic');
        if (!apiKey) {
            throw new Error(`Anthropic ${action} requires an API key configured in Settings.`);
        }
        return apiKey;
    }
}
