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
} from './provider-utils';
import { consumeOpenAiCompatibleStream } from './streaming/openai-compatible-stream';

const DEFAULT_OPENROUTER_MODEL_ID = 'minimax/minimax-m2.5:free';
const MODEL_LIST_TIMEOUT_MS = 10_000;

export class OpenRouterProvider implements AiProvider {
    readonly id = 'openrouter';
    readonly name = 'OpenRouter';

    constructor(private readonly keys: Pick<ApiKeyService, 'getApiKey'> = apiKeyService) {}

    async generate(request: AiPromptRequest): Promise<AiPromptResponse> {
        const apiKey = await this.keys.getApiKey('openrouter');

        if (!apiKey) {
            throw new Error(
                'OpenRouter generation is unavailable until saved provider configuration is connected.',
            );
        }

        console.log(`[OpenRouter] Generating prompt: ${this.getPromptPreview(request).substring(0, 50)}...`);

        try {
            const payload = await promptBuilderService.buildChatCompletionPayload(
                request,
                DEFAULT_OPENROUTER_MODEL_ID,
            );

            console.log('[OpenRouter] Sending payload:', JSON.stringify(payload, null, 2));
            payload.messages.forEach((message, index) => {
                console.log(`[OpenRouter] Message ${index} (${message.role}) content:\n${message.content}`);
            });

            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                signal: request.abortSignal,
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'http://localhost:4200', // Required by OpenRouter for ranking
                    'X-Title': 'My Novella', // Required by OpenRouter for ranking
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            await assertSuccessfulResponse(response, this.name);

            const streamed = await consumeOpenAiCompatibleStream(response.body, {
                onToken: request.onToken,
                onReasoningToken: request.onReasoningToken,
            });

            return {
                ...streamed,
                modelUsed: payload.model,
            };
        } catch (error) {
            console.error('[OpenRouter] Generation failed:', error);
            throw error;
        }
    }

    private getPromptPreview(request: AiPromptRequest): string {
        const prompt = request.prompt?.trim();

        if (prompt) {
            return prompt;
        }

        return request.messages?.find((message) => message.content?.trim())?.content.trim() ?? '';
    }

    async listModels(): Promise<AiModel[]> {
        const apiKey = await this.keys.getApiKey('openrouter');
        if (!apiKey) return [];

        const url = new URL('https://openrouter.ai/api/v1/models');
        url.searchParams.set('output_modalities', 'text');
        const response = await fetch(url, {
            signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS),
            headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        await assertSuccessfulResponse(response, this.name);

        const body = asObject(await parseJsonResponse(response, this.name));
        if (!body || !Array.isArray(body['data'])) {
            throw new Error('OpenRouter returned a malformed model list.');
        }

        return body['data']
            .map((rawModel) => this.parseModel(rawModel))
            .filter((model) => this.hasTextOutput(model))
            .map((model): AiModel => {
                const [providerSlug] = model.id.split('/');
                const [, modelName] = model.name.split(':');
                return {
                    id: model.id,
                    name: modelName ? modelName.trim() : model.name,
                    provider: providerSlug,
                    providerName: `OpenRouter: ${formatProviderSlug(providerSlug)}`,
                    source: 'openrouter',
                    supportsReasoning: model.supportedParameters.includes('reasoning'),
                };
            });
    }

    async testConnection(): Promise<void> {
        const apiKey = await this.keys.getApiKey('openrouter');
        if (!apiKey) {
            throw new Error('OpenRouter connection test requires an API key configured in Settings.');
        }

        const response = await fetch('https://openrouter.ai/api/v1/key', {
            signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS),
            headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        await assertSuccessfulResponse(response, this.name);

        const body = asObject(await parseJsonResponse(response, this.name));
        if (!asObject(body?.['data'])) {
            throw new Error('OpenRouter returned a malformed connection response.');
        }
    }

    private parseModel(rawModel: unknown): OpenRouterModel {
        const model = asObject(rawModel);
        if (!model || typeof model['id'] !== 'string' || typeof model['name'] !== 'string') {
            throw new Error('OpenRouter returned a malformed model list.');
        }

        const architecture = model['architecture'] === undefined || model['architecture'] === null
            ? null
            : asObject(model['architecture']);
        if (model['architecture'] && !architecture) {
            throw new Error('OpenRouter returned a malformed model list.');
        }

        const outputModalities = architecture?.['output_modalities'];
        if (outputModalities !== undefined && !Array.isArray(outputModalities)) {
            throw new Error('OpenRouter returned a malformed model list.');
        }
        const parsedOutputModalities = Array.isArray(outputModalities) ? outputModalities : [];

        const supportedParameters = model['supported_parameters'];
        if (supportedParameters !== undefined && !Array.isArray(supportedParameters)) {
            throw new Error('OpenRouter returned a malformed model list.');
        }
        const parsedSupportedParameters = Array.isArray(supportedParameters)
            ? supportedParameters
            : [];

        return {
            id: model['id'],
            name: model['name'],
            outputModalities: parsedOutputModalities.filter(
                (value): value is string => typeof value === 'string',
            ),
            supportedParameters: parsedSupportedParameters.filter(
                (value): value is string => typeof value === 'string',
            ),
        };
    }

    private hasTextOutput(model: OpenRouterModel): boolean {
        return model.outputModalities.length === 0 || model.outputModalities.includes('text');
    }
}

interface OpenRouterModel {
    id: string;
    name: string;
    outputModalities: string[];
    supportedParameters: string[];
}

function formatProviderSlug(slug: string): string {
    const names: Record<string, string> = {
        openai: 'OpenAI',
        anthropic: 'Anthropic',
        google: 'Google',
        'meta-llama': 'Meta Llama',
        mistralai: 'Mistral AI',
        cohere: 'Cohere',
        deepseek: 'DeepSeek',
        minimax: 'MiniMax',
        microsoft: 'Microsoft',
        perplexity: 'Perplexity',
        nousresearch: 'Nous Research',
        qwen: 'Qwen',
    };
    return names[slug]
        ?? slug.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
