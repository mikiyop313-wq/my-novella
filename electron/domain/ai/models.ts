import type { AiSystemPromptPresetSelection } from '../../../shared/models/system-prompt.model';

export type AiChatMessageRole = 'system' | 'user' | 'assistant';

export interface AiChatMessage {
    role: AiChatMessageRole;
    content: string;
}

export interface AiChatCompletionPayload {
    model: string;
    messages: AiChatMessage[];
    temperature: number;
    top_p?: number;
    max_tokens?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
    stream: boolean;
    reasoning?: {
        enabled: true;
        effort: 'medium';
    };
    reasoning_effort?: 'medium';
    stream_options?: {
        include_usage: true;
    };
}

export interface AiPromptRequest {
    model: 'openai' | 'gemini' | 'anthropic' | 'openrouter' | 'ollama' | 'lm-studio';
    modelId?: string;
    prompt: string;
    messages?: AiChatMessage[];
    temperature?: number;
    maxTokens?: number;
    systemMessage?: string;
    systemPromptPreset?: AiSystemPromptPresetSelection;
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
