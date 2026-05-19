import { AiProvider } from './ai-provider.interface';
import { AiPromptRequest, AiPromptResponse } from '../models';

export class GeminiProvider implements AiProvider {
    readonly id = 'gemini';
    readonly name = 'Google Gemini';

    async generate(request: AiPromptRequest): Promise<AiPromptResponse> {
        // TODO: Implement Gemini SDK call here
        console.log(`[Gemini] Generating prompt: ${request.prompt}`);
        
        // Mock response for now
        return {
            text: `Mock Gemini response to: "${request.prompt}"`,
            modelUsed: 'gemini-1.5-pro',
            usage: {
                promptTokens: 10,
                completionTokens: 20,
                totalTokens: 30
            }
        };
    }
}
