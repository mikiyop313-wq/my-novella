import { AiPromptRequest, AiPromptResponse } from './models';
import { AiProvider } from './providers/ai-provider.interface';
import { OpenAiProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';

export class AiService {
    private providers: Map<string, AiProvider>;

    constructor() {
        this.providers = new Map();

        // Register providers
        this.registerProvider(new OpenAiProvider());
        this.registerProvider(new GeminiProvider());
        this.registerProvider(new OpenRouterProvider());
        // Add Claude or others here
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
}

// Export a singleton instance
export const aiService = new AiService();
