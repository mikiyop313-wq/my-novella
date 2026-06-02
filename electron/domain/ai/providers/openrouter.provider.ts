import { AiProvider } from './ai-provider.interface';
import { AiPromptRequest, AiPromptResponse } from '../models';

export class OpenRouterProvider implements AiProvider {
    readonly id = 'openrouter';
    readonly name = 'OpenRouter';

    async generate(request: AiPromptRequest): Promise<AiPromptResponse> {
        // TODO: Retrieve API key from user settings securely
        //const apiKey = process.env.OPENROUTER_API_KEY; 
        const apiKey = "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";

        if (!apiKey) {
            console.warn('[OpenRouter] Warning: OPENROUTER_API_KEY is not set in environment variables.');
        }

        console.log(`[OpenRouter] Generating prompt: ${request.prompt.substring(0, 50)}...`);

        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                signal: request.abortSignal,
                headers: {
                    'Authorization': `Bearer ${apiKey || ''}`,
                    'HTTP-Referer': 'http://localhost:4200', // Required by OpenRouter for ranking
                    'X-Title': 'My Novella', // Required by OpenRouter for ranking
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: request.modelId || 'minimax/minimax-m2.5:free',
                    messages: [
                        ...(request.systemMessage ? [{ role: 'system', content: request.systemMessage }] : []),
                        { role: 'user', content: request.prompt }
                    ],
                    temperature: request.temperature ?? 0.5,
                    max_tokens: request.maxTokens,
                    stream: true,
                    ...(request.reasoningMode ? { reasoning: { enabled: true, effort: 'medium' } } : {})
                })
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`OpenRouter API Error (${response.status}): ${errorData}`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder("utf-8");
            let fullText = "";
            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    // The API sends chunks formatted as "data: { ...JSON... }\n\n"
                    const lines = chunk.split('\n').filter(line => line.trim() !== '');

                    for (const line of lines) {
                        const dataStr = line.replace(/^data: /, '');
                        if (dataStr === '[DONE]') break;

                        if (line.startsWith('data: ')) {
                            try {
                                const parsed = JSON.parse(dataStr);
                                const token = parsed.choices[0]?.delta?.content || '';
                                const reasoningToken = parsed.choices[0]?.delta?.reasoning || '';
                                fullText += token;

                                if (request.onToken && token) {
                                    request.onToken(token);
                                }
                                
                                if (request.onReasoningToken && reasoningToken) {
                                    request.onReasoningToken(reasoningToken);
                                }
                            } catch (e) {
                                console.error("Failed to parse stream chunk", e);
                            }
                        }
                    }
                }
            }

            return {
                text: fullText,
                modelUsed: request.modelId || 'minimax/minimax-m2.5:free'
            };
        } catch (error) {
            console.error('[OpenRouter] Generation failed:', error);
            throw error;
        }
    }

    async getAvailableModels(): Promise<any[]> {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/models');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const json = await response.json();
            return json.data;
        } catch (error) {
            console.error('[OpenRouter] Failed to fetch available models:', error);
            return [];
        }
    }
}
