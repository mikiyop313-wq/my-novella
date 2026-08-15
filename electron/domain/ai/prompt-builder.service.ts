import {
    AiChatCompletionPayload,
    AiChatMessage,
    AiChatMessageRole,
    AiPromptRequest,
} from './models';
import { AI_SYSTEM_PROMPTS } from '../../../shared/constants/ai-system-prompts';

const CHAT_MESSAGE_ROLES = new Set<AiChatMessageRole>(['system', 'user', 'assistant']);

export class PromptBuilderService {
    buildChatCompletionPayload(
        request: AiPromptRequest,
        defaultModelId: string,
    ): AiChatCompletionPayload {
        const messages = this.resolveMessages(request);

        if (!messages.some((message) => message.role !== 'system')) {
            throw new Error('AI prompt requires at least one non-empty message.');
        }

        return {
            model: request.modelId || defaultModelId,
            messages,
            temperature: request.temperature ?? 0.5,
            ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
            stream: true,
            ...(request.reasoningMode
                ? { reasoning: { enabled: true as const, effort: 'medium' as const } }
                : {}),
        };
    }

    private resolveMessages(request: AiPromptRequest): AiChatMessage[] {
        const hasStructuredSystemMessage = request.messages?.some(
            (message) => message.role === 'system' && message.content?.trim().length > 0,
        ) ?? false;
        const resolvedSystemMessage = request.systemMessage?.trim()
            || (!hasStructuredSystemMessage ? AI_SYSTEM_PROMPTS.chat.gemma_test : '');
        const systemMessage: AiChatMessage[] = resolvedSystemMessage
            ? [{ role: 'system' as const, content: resolvedSystemMessage }]
            : [];

        if (request.messages !== undefined) {
            return this.sanitizeMessages([...systemMessage, ...request.messages]);
        }

        return this.sanitizeMessages([
            ...systemMessage,
            { role: 'user', content: request.prompt },
        ]);
    }

    private sanitizeMessages(messages: AiChatMessage[]): AiChatMessage[] {
        return messages
            .map((message) => this.sanitizeMessage(message))
            .filter((message): message is AiChatMessage => message !== null);
    }

    private sanitizeMessage(message: AiChatMessage): AiChatMessage | null {
        const role = message.role;
        const content = message.content?.trim() ?? '';

        if (!CHAT_MESSAGE_ROLES.has(role) || content.length === 0) {
            return null;
        }

        return { role, content };
    }
}

export const promptBuilderService = new PromptBuilderService();
