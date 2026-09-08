import type { AiSystemPromptPresetSelection } from '../../../shared/models/system-prompt.model';
import type { AiChatMessage, AiReasoningEffort } from '../../../shared/models/ai.model';
export type { AiChatMessage, AiChatMessageRole } from '../../../shared/models/ai.model';

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
        effort: AiReasoningEffort;
    };
    reasoning_effort?: AiReasoningEffort;
    stream_options?: {
        include_usage: true;
    };
}

export interface AiPromptRequest {
    model: 'openai' | 'gemini' | 'anthropic' | 'openrouter' | 'ollama' | 'lm-studio' | 'venice';
    modelId?: string;
    prompt: string;
    messages?: AiChatMessage[];
    temperature?: number;
    maxTokens?: number;
    systemMessage?: string;
    systemPromptPreset?: AiSystemPromptPresetSelection;
    reasoningMode?: boolean;
    reasoningEffort?: AiReasoningEffort;
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
