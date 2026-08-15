import type { AiModel, AiLocalProviderId } from '../../../../shared/models/ai.model';
import { aiConfigurationService } from '../ai-configuration.service';
import type { AiConfigurationService } from '../ai-configuration.service';
import type { AiPromptRequest, AiPromptResponse } from '../models';
import { promptBuilderService } from '../prompt-builder.service';
import type { AiProvider } from './ai-provider.interface';
import {
    asObject,
    assertSuccessfulResponse,
    isTextGenerationModel,
    parseJsonResponse,
    requireModelId,
} from './provider-utils';
import {
    consumeOpenAiCompatibleStream,
    openAiCompatiblePayload,
} from './streaming/openai-compatible-stream';

const MODEL_LIST_TIMEOUT_MS = 10_000;

export interface LocalOpenAiCompatibleProviderOptions {
    id: AiLocalProviderId;
    name: string;
    apiPath?: string;
}

export class LocalOpenAiCompatibleProvider implements AiProvider {
    readonly id: AiLocalProviderId;
    readonly name: string;

    private readonly apiPath?: string;

    constructor(
        options: LocalOpenAiCompatibleProviderOptions,
        private readonly configuration: Pick<AiConfigurationService, 'getServerUrl'> =
            aiConfigurationService,
    ) {
        this.id = options.id;
        this.name = options.name;
        this.apiPath = options.apiPath;
    }

    async generate(request: AiPromptRequest): Promise<AiPromptResponse> {
        const serverUrl = await this.requireServerUrl();
        const modelId = requireModelId(request.modelId, this.name);
        const basePayload = await promptBuilderService.buildChatCompletionPayload(request, modelId);
        const payload = openAiCompatiblePayload(basePayload, false);

        const response = await fetch(this.endpoint(serverUrl, 'chat/completions'), {
            method: 'POST',
            signal: request.abortSignal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        await assertSuccessfulResponse(response, this.name);

        const result = await consumeOpenAiCompatibleStream(response.body, {
            onToken: request.onToken,
        });
        return { ...result, modelUsed: modelId };
    }

    async listModels(): Promise<AiModel[]> {
        const serverUrl = await this.configuration.getServerUrl(this.id);
        if (!serverUrl) return [];

        const response = await fetch(this.endpoint(serverUrl, 'models'), {
            signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS),
        });
        await assertSuccessfulResponse(response, this.name);

        const body = asObject(await parseJsonResponse(response, this.name));
        if (!body || !Array.isArray(body['data'])) {
            throw new Error(`${this.name} returned a malformed model list.`);
        }

        return body['data']
            .map((rawModel): AiModel => {
                const model = asObject(rawModel);
                if (!model || typeof model['id'] !== 'string' || !model['id'].trim()) {
                    throw new Error(`${this.name} returned a malformed model list.`);
                }

                const modelId = model['id'];
                return {
                    id: `${this.id}/${modelId}`,
                    name: modelId,
                    provider: this.id,
                    providerName: `${this.name} (Local)`,
                    source: 'local',
                    supportsReasoning: false,
                };
            })
            .filter((model) => isTextGenerationModel(model.id, model.name));
    }

    async testConnection(): Promise<void> {
        await this.requireServerUrl('connection test');
        await this.listModels();
    }

    private async requireServerUrl(action = 'generation'): Promise<string> {
        const serverUrl = await this.configuration.getServerUrl(this.id);
        if (!serverUrl) {
            throw new Error(`${this.name} ${action} requires a server URL configured in Settings.`);
        }
        return serverUrl;
    }

    private endpoint(serverUrl: string, resourcePath: string): string {
        const url = new URL(serverUrl);
        const pathParts = [
            url.pathname.replace(/\/+$/, ''),
            this.apiPath,
            resourcePath,
        ].filter((part): part is string => !!part);

        url.pathname = pathParts.join('/');
        url.search = '';
        url.hash = '';
        return url.toString();
    }
}
