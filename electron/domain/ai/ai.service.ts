import type { AiPromptRequest, AiPromptResponse } from './models';
import {
    AI_PROVIDER_IDS,
    type AiModelProviderGroup,
    type AiProviderConfiguration,
    type AiProviderId,
} from '../../../shared/models/ai.model';
import { aiConfigurationService } from './ai-configuration.service';
import type { AiConfigurationService } from './ai-configuration.service';
import type { AiProvider } from './providers/ai-provider.interface';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { LmStudioProvider } from './providers/lm-studio.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';

export class AiService {
    private providers: Map<string, AiProvider>;

    constructor(providers: AiProvider[] = [
        new OpenAiProvider(),
        new GeminiProvider(),
        new AnthropicProvider(),
        new OpenRouterProvider(),
        new OllamaProvider(),
        new LmStudioProvider(),
    ], private readonly configuration: Pick<AiConfigurationService, 'loadConfiguration'> =
        aiConfigurationService) {
        this.providers = new Map();

        providers.forEach((provider) => this.registerProvider(provider));
    }

    private registerProvider(provider: AiProvider) {
        this.providers.set(provider.id, provider);
    }

    async generatePrompt(request: AiPromptRequest): Promise<AiPromptResponse> {
        const provider = this.providers.get(request.model);

        if (!provider) {
            throw new Error(`AI Provider for model '${request.model}' is not registered or supported.`);
        }

        try {
            return await provider.generate(request);
        } catch (error) {
            console.error(`[AiService] Error generating prompt with ${provider.name}:`, error);
            throw error;
        }
    }

    async listModels(): Promise<AiModelProviderGroup[]> {
        const configuration = await this.configuration.loadConfiguration();

        return Promise.all(AI_PROVIDER_IDS.flatMap((providerId) => {
            const provider = this.providers.get(this.registeredProviderId(providerId));
            if (!provider) return [];

            return [this.listProviderModels(providerId, provider, configuration)];
        }));
    }

    async testConnection(providerId: AiProviderId): Promise<void> {
        const registeredProviderId = this.registeredProviderId(providerId);
        const provider = this.providers.get(registeredProviderId);

        if (!provider) {
            throw new Error(`Unsupported AI provider: ${providerId}.`);
        }

        await provider.testConnection();
    }

    private async listProviderModels(
        providerId: AiProviderId,
        provider: AiProvider,
        configuration: AiProviderConfiguration,
    ): Promise<AiModelProviderGroup> {
        if (!this.isConfigured(providerId, configuration)) {
            return { id: providerId, name: provider.name, state: 'unconfigured', models: [] };
        }

        try {
            return {
                id: providerId,
                name: provider.name,
                state: 'ready',
                models: await provider.listModels(),
            };
        } catch (error) {
            console.error(`[AiService] Failed to list models from ${provider.name}:`, error);
            return { id: providerId, name: provider.name, state: 'error', models: [] };
        }
    }

    private isConfigured(
        providerId: AiProviderId,
        configuration: AiProviderConfiguration,
    ): boolean {
        if (providerId === 'ollama' || providerId === 'lm-studio') {
            return Boolean(configuration.serverUrls[providerId]);
        }
        return configuration.apiKeys[providerId].configured;
    }

    private registeredProviderId(providerId: AiProviderId): string {
        return providerId === 'google' ? 'gemini' : providerId;
    }
}

// Export a singleton instance
export const aiService = new AiService();
