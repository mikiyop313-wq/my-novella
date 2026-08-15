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
    isTextGenerationModel,
    parseJsonResponse,
    requireModelId,
} from './provider-utils';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const MODEL_LIST_TIMEOUT_MS = 10_000;

export class OpenAiProvider implements AiProvider {
    readonly id = 'openai';
    readonly name = 'OpenAI';

    constructor(private readonly keys: Pick<ApiKeyService, 'getApiKey'> = apiKeyService) {}

    async generate(request: AiPromptRequest): Promise<AiPromptResponse> {
        const apiKey = await this.requireApiKey();
        const modelId = requireModelId(request.modelId, this.name);
        const basePayload = await promptBuilderService.buildChatCompletionPayload(request, modelId);
        const payload = openAiCompatiblePayload(basePayload, request.reasoningMode === true);

        const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
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
        const apiKey = await this.keys.getApiKey('openai');
        if (!apiKey) return [];

        const response = await fetch(`${OPENAI_BASE_URL}/models`, {
            signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS),
            headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        await assertSuccessfulResponse(response, this.name);

        const body = asObject(await parseJsonResponse(response, this.name));
        if (!body || !Array.isArray(body['data'])) {
            throw new Error('OpenAI returned a malformed model list.');
        }

        return body['data']
            .map((rawModel): AiModel => {
                const model = asObject(rawModel);
                if (!model || typeof model['id'] !== 'string' || !model['id'].trim()) {
                    throw new Error('OpenAI returned a malformed model list.');
                }

                const providerModelId = model['id'];
                return {
                    id: `openai/${providerModelId}`,
                    name: providerModelId,
                    provider: 'openai',
                    providerName: 'OpenAI (Direct)',
                    source: 'direct',
                    supportsReasoning: false,
                };
            })
            .filter((model) => isTextGenerationModel(model.id, model.name));
    }

    async testConnection(): Promise<void> {
        await this.requireApiKey('connection test');
        await this.listModels();
    }

    private async requireApiKey(action = 'generation'): Promise<string> {
        const apiKey = await this.keys.getApiKey('openai');
        if (!apiKey) {
            throw new Error(`OpenAI ${action} requires an API key configured in Settings.`);
        }
        return apiKey;
    }
}
