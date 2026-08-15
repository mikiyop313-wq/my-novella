export interface AiPromptRequest {
    model: 'openai' | 'gemini' | 'claude' | 'openrouter';
    prompt: string;
    temperature?: number;
    maxTokens?: number;
    systemMessage?: string;
}

export interface AiPromptResponse {
    text: string;
    modelUsed: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}
