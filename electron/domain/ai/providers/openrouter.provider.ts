import { AiProvider } from './ai-provider.interface';
import { AiPromptRequest, AiPromptResponse } from '../models';

export class OpenRouterProvider implements AiProvider {
    readonly id = 'openrouter';
    readonly name = 'OpenRouter';

    async generate(request: AiPromptRequest): Promise<AiPromptResponse> {
        // TODO: Implement OpenRouter SDK call here
        console.log(`[OpenRouter] Generating prompt: ${request.prompt}`);
        
        // Mock response for now
        return {
            text: `Mock OpenRouter response to: "${request.prompt}"`,
            modelUsed: 'openrouter-model',
            usage: {
                promptTokens: 10,
                completionTokens: 20,
                totalTokens: 30
            }
        };
    }
}
