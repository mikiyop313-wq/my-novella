import type { AiModel, AiReasoningEffort } from '../../../../shared/models/ai.model';
import type { FetchTransport } from '../../../../shared/network/fetch-transport';
import { apiKeyService, type ApiKeyService } from '../api-key.service';
import { chatCompletionPayloadBuilderService } from '../chat-completion-payload-builder.service';
import type { AiPromptRequest, AiPromptResponse } from '../models';
import type { AiProvider } from './ai-provider.interface';
import { asObject, assertSuccessfulResponse, parseJsonResponse, requireModelId } from './provider-utils';
import { consumeOpenAiCompatibleStream, openAiCompatiblePayload } from './streaming/openai-compatible-stream';

const VENICE_BASE_URL = 'https://api.venice.ai/api/v1';
const MODEL_LIST_TIMEOUT_MS = 10_000;

export interface VeniceModel extends AiModel {
    supportsReasoning: boolean;
    supportsReasoningEffort: boolean;
}

export class VeniceProvider implements AiProvider {
    readonly id = 'venice';
    readonly name = 'Venice';

    constructor(
        private readonly keys: Pick<ApiKeyService, 'getApiKey'> = apiKeyService,
        private readonly fetchTransport: FetchTransport = globalThis.fetch,
    ) {}

    async generate(request: AiPromptRequest): Promise<AiPromptResponse> {
        const apiKey = await this.requireApiKey();
        const modelId = requireModelId(request.modelId, this.name);
        if (!request.reasoningMode && request.reasoningEffort !== undefined) {
            throw new Error('Venice reasoning effort requires reasoning mode to be enabled.');
        }

        const reasoningEffort = request.reasoningMode
            ? await this.resolveReasoningEffort({ apiKey, modelId, request })
            : undefined;
        const basePayload = await chatCompletionPayloadBuilderService.buildChatCompletionPayload(request, modelId);
        const payload = {
            ...openAiCompatiblePayload(basePayload, reasoningEffort),
            ...(!request.reasoningMode ? { reasoning: { enabled: false } } : {}),
            venice_parameters: { include_venice_system_prompt: false, enable_web_search: 'off' },
        };

        const response = await this.fetchTransport(`${VENICE_BASE_URL}/chat/completions`, {
            method: 'POST',
            signal: request.abortSignal,
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        await assertSuccessfulResponse(response, this.name);
        const result = await consumeOpenAiCompatibleStream(response.body, {
            reasoningField: 'reasoning_content',
            onToken: request.onToken,
            onReasoningToken: request.onReasoningToken,
        });
        return { ...result, modelUsed: modelId };
    }

    async listModels(): Promise<VeniceModel[]> {
        const apiKey = await this.requireApiKey();
        return this.fetchModels({ apiKey });
    }

    async testConnection(): Promise<void> {
        await this.listModels();
    }

    private async requireApiKey(): Promise<string> {
        const apiKey = await this.keys.getApiKey('venice');
        if (!apiKey) throw new Error('Venice requires a configured API key.');
        return apiKey;
    }

    private async resolveReasoningEffort({ apiKey, modelId, request }: {
        apiKey: string;
        modelId: string;
        request: AiPromptRequest;
    }): Promise<AiReasoningEffort | undefined> {
        const models = await this.fetchModels({ apiKey, abortSignal: request.abortSignal });
        const model = models.find((candidate) => candidate.id === `venice/${modelId}`);
        if (!model) throw new Error(`Venice model '${modelId}' was not found in the text model catalog.`);
        if (!model.supportsReasoning) {
            throw new Error(`Venice model '${modelId}' does not support reasoning.`);
        }
        if (!model.supportsReasoningEffort) {
            if (request.reasoningEffort !== undefined) {
                throw new Error(`Venice model '${modelId}' does not support adjustable reasoning effort.`);
            }
            return undefined;
        }
        return request.reasoningEffort ?? 'medium';
    }

    private async fetchModels({ apiKey, abortSignal }: {
        apiKey: string;
        abortSignal?: AbortSignal;
    }): Promise<VeniceModel[]> {
        const timeout = AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS);
        const response = await this.fetchTransport(`${VENICE_BASE_URL}/models?type=text`, {
            signal: abortSignal ? AbortSignal.any([abortSignal, timeout]) : timeout,
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        await assertSuccessfulResponse(response, this.name);
        const body = asObject(await parseJsonResponse(response, this.name));
        if (!body || !Array.isArray(body['data'])) {
            throw new Error('Venice returned a malformed model list.');
        }
        return body['data'].flatMap((rawModel): VeniceModel[] => {
            const model = asObject(rawModel);
            if (!model || typeof model['type'] !== 'string') {
                throw new Error('Venice returned a malformed model list.');
            }
            if (model['type'] !== 'text') return [];
            const spec = asObject(model['model_spec']);
            const capabilities = asObject(spec?.['capabilities']);
            if (
                typeof model['id'] !== 'string' || !model['id'].trim()
                || typeof spec?.['name'] !== 'string' || !spec['name'].trim()
                || typeof capabilities?.['supportsReasoning'] !== 'boolean'
                || typeof capabilities['supportsReasoningEffort'] !== 'boolean'
            ) {
                throw new Error('Venice returned a malformed model list.');
            }
            return [{
                id: `venice/${model['id']}`,
                name: spec['name'],
                provider: 'venice',
                providerName: 'Venice',
                source: 'direct',
                supportsReasoning: capabilities['supportsReasoning'],
                supportsReasoningEffort: capabilities['supportsReasoningEffort'],
            }];
        });
    }
}
