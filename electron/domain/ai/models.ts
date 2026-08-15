export interface AiPromptRequest {
    model: 'openai' | 'gemini' | 'claude' | 'openrouter';
    modelId?: string;
    prompt: string;
    temperature?: number;
    maxTokens?: number;
    systemMessage?: string;
    reasoningMode?: boolean;
    onToken?: (token: string) => void;
    onReasoningToken?: (token: string) => void;
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
