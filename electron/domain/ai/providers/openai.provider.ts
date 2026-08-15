import { AiProvider } from './ai-provider.interface';
import { AiPromptRequest, AiPromptResponse } from '../models';

export class OpenAiProvider implements AiProvider {
    readonly id = 'openai';
    readonly name = 'OpenAI';

    async generate(request: AiPromptRequest): Promise<AiPromptResponse> {
        // TODO: Implement OpenAI SDK call here
        console.log(`[OpenAI] Generating prompt: ${request.prompt}`);
        
        // Mock response for now
        return {
            text: `Mock OpenAI response to: "${request.prompt}"`,
            modelUsed: 'gpt-4',
            usage: {
                promptTokens: 10,
                completionTokens: 20,
                totalTokens: 30
            }
        };
    }
}
