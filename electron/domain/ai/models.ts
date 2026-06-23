export type AiChatMessageRole = 'system' | 'user' | 'assistant';

export interface AiChatMessage {
    role: AiChatMessageRole;
    content: string;
}

export interface AiChatCompletionPayload {
    model: string;
    messages: AiChatMessage[];
    temperature: number;
    max_tokens?: number;
    stream: boolean;
    reasoning?: {
        enabled: true;
        effort: 'medium';
    };
}

export interface AiPromptRequest {
    model: 'openai' | 'gemini' | 'claude' | 'openrouter';
    modelId?: string;
    prompt: string;
    messages?: AiChatMessage[];
    temperature?: number;
    maxTokens?: number;
    systemMessage?: string;
    reasoningMode?: boolean;
    abortSignal?: AbortSignal;
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
