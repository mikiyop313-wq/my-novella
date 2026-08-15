import type { AiModel } from '../../../../shared/models/ai.model';
import { apiKeyService } from '../api-key.service';
import type { ApiKeyService } from '../api-key.service';
import type { AiPromptRequest, AiPromptResponse } from '../models';
import { promptBuilderService } from '../prompt-builder.service';
import type { AiProvider } from './ai-provider.interface';
import {
    consumeOpenAiCompatibleStream,
    openAiCompatiblePayload,
} from './streaming/openai-compatible-stream';
import {
    asObject,
    assertSuccessfulResponse,
    parseJsonResponse,
    requireModelId,
} from './provider-utils';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_OPENAI_BASE_URL = `${GEMINI_BASE_URL}/openai`;
const MODEL_LIST_TIMEOUT_MS = 10_000;

export class GeminiProvider implements AiProvider {
    readonly id = 'gemini';
    readonly name = 'Google Gemini';

    constructor(private readonly keys: Pick<ApiKeyService, 'getApiKey'> = apiKeyService) {}

    async generate(request: AiPromptRequest): Promise<AiPromptResponse> {
        const apiKey = await this.requireApiKey();
        const modelId = requireModelId(request.modelId, this.name);
        const basePayload = await promptBuilderService.buildChatCompletionPayload(request, modelId);
        const payload = openAiCompatiblePayload(basePayload, request.reasoningMode === true);

        const response = await fetch(`${GEMINI_OPENAI_BASE_URL}/chat/completions`, {
            method: 'POST',
            signal: request.abortSignal,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        await assertSuccessfulResponse(response, this.name);

        const result = await consumeOpenAiCompatibleStream(response.body, {
            onToken: request.onToken,
        });
        return { ...result, modelUsed: modelId };
    }

    async listModels(): Promise<AiModel[]> {
        const apiKey = await this.keys.getApiKey('google');
        if (!apiKey) return [];

        const signal = AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS);
        const models: AiModel[] = [];
        let pageToken: string | null = null;

        do {
            const url = new URL(`${GEMINI_BASE_URL}/models`);
            url.searchParams.set('pageSize', '1000');
            if (pageToken) url.searchParams.set('pageToken', pageToken);

            const response = await fetch(url, {
                signal,
                headers: { 'x-goog-api-key': apiKey },
            });
            await assertSuccessfulResponse(response, this.name);

            const body = asObject(await parseJsonResponse(response, this.name));
            if (!body || !Array.isArray(body['models'])) {
                throw new Error('Google Gemini returned a malformed model list.');
            }

            for (const rawModel of body['models']) {
                const model = asObject(rawModel);
                if (
                    !model
                    || typeof model['name'] !== 'string'
                    || !Array.isArray(model['supportedGenerationMethods'])
                ) {
                    throw new Error('Google Gemini returned a malformed model list.');
                }
                if (!model['supportedGenerationMethods'].includes('generateContent')) continue;

                const providerModelId = model['name'].replace(/^models\//, '');
                if (!providerModelId) {
                    throw new Error('Google Gemini returned a malformed model list.');
                }

                models.push({
                    id: `gemini/${providerModelId}`,
                    name: typeof model['displayName'] === 'string'
                        ? model['displayName']
                        : providerModelId,
                    provider: 'google',
                    providerName: 'Google Gemini (Direct)',
                    source: 'direct',
                    supportsReasoning: model['thinking'] === true,
                });
            }

            const nextPageToken = body['nextPageToken'];
            if (nextPageToken !== undefined && typeof nextPageToken !== 'string') {
                throw new Error('Google Gemini returned a malformed model list.');
            }
            pageToken = typeof nextPageToken === 'string' && nextPageToken
                ? nextPageToken
                : null;
        } while (pageToken);

        return models;
    }

    private async requireApiKey(): Promise<string> {
        const apiKey = await this.keys.getApiKey('google');
        if (!apiKey) {
            throw new Error('Google Gemini generation requires an API key configured in Settings.');
        }
        return apiKey;
    }
}
