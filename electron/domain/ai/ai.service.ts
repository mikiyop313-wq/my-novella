import type { AiPromptRequest, AiPromptResponse } from './models';
import type { AiModel } from '../../../shared/models/ai.model';
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
    ]) {
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

    async listModels(): Promise<AiModel[]> {
        const providers = [...this.providers.values()];
        const results = await Promise.allSettled(
            providers.map((provider) => provider.listModels()),
        );

        return results.flatMap((result, index) => {
            if (result.status === 'fulfilled') return result.value;

            console.error(
                `[AiService] Failed to list models from ${providers[index].name}:`,
                result.reason,
            );
            return [];
        });
    }
}

// Export a singleton instance
export const aiService = new AiService();
