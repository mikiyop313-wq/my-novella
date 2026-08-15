import {
    AiChatCompletionPayload,
    AiChatMessage,
    AiChatMessageRole,
    AiPromptRequest,
} from './models';
import {
    findBuiltInSystemPromptPreset,
    type BuiltInSystemPromptPreset,
} from '../../../shared/constants/ai-system-prompts';
import type {
    SystemPromptGenerationSettings,
    SystemPromptPresetDto,
} from '../../../shared/models/system-prompt.model';
import type { SystemPromptRepository } from '../../../db/repositories/system-prompt.repository';
import { systemPromptRepository } from '../../../db/repositories/system-prompt.repository';
import { appendRequiredSystemPromptContract } from './required-system-prompt-contracts';

const CHAT_MESSAGE_ROLES = new Set<AiChatMessageRole>(['system', 'user', 'assistant']);

export class PromptBuilderService {
    constructor(
        private readonly presetRepository: Pick<SystemPromptRepository, 'getById'> =
            systemPromptRepository,
    ) {}

    async buildChatCompletionPayload(
        request: AiPromptRequest,
        defaultModelId: string,
    ): Promise<AiChatCompletionPayload> {
        const selectedPreset = await this.resolveSelectedPreset(request);
        const selectedSystemPrompt = selectedPreset && request.systemPromptPreset
            ? appendRequiredSystemPromptContract(
                request.systemPromptPreset.category,
                selectedPreset.systemPrompt,
            )
            : selectedPreset?.systemPrompt;
        const messages = this.resolveMessages(request, selectedSystemPrompt);

        if (!messages.some((message) => message.role !== 'system')) {
            throw new Error('AI prompt requires at least one non-empty message.');
        }

        const generationSettings = selectedPreset ?? {
            temperature: request.temperature ?? 0.5,
            maxOutputTokens: request.maxTokens ?? null,
        };

        return {
            model: request.modelId || defaultModelId,
            messages,
            temperature: generationSettings.temperature,
            ...(selectedPreset ? {
                top_p: selectedPreset.topP,
                presence_penalty: selectedPreset.presencePenalty,
                frequency_penalty: selectedPreset.frequencyPenalty,
            } : {}),
            ...(generationSettings.maxOutputTokens !== null
                ? { max_tokens: generationSettings.maxOutputTokens }
                : {}),
            stream: true,
            ...(request.reasoningMode
                ? { reasoning: { enabled: true as const, effort: 'medium' as const } }
                : {}),
        };
    }

    private async resolveSelectedPreset(
        request: AiPromptRequest,
    ): Promise<ResolvedSystemPromptPreset | undefined> {
        const selection = request.systemPromptPreset;
        if (!selection) return undefined;

        const hasCallerSystemMessage = request.systemMessage?.trim().length
            || request.messages?.some(
                (message) => message.role === 'system' && message.content?.trim().length > 0,
        );
        if (hasCallerSystemMessage) {
            throw new Error(
                'AI prompt cannot combine a preset with a caller-provided system message.',
            );
        }

        const builtInPreset = findBuiltInSystemPromptPreset(selection.presetId);
        const preset = builtInPreset ?? await this.presetRepository.getById(selection.presetId);
        if (!preset) {
            throw new Error(`System prompt preset '${selection.presetId}' does not exist.`);
        }
        if (preset.category !== selection.category) {
            throw new Error(
                `System prompt preset '${selection.presetId}' does not belong to category '${selection.category}'.`,
            );
        }

        return preset;
    }

    private resolveMessages(
        request: AiPromptRequest,
        selectedSystemPrompt?: string,
    ): AiChatMessage[] {
        const resolvedSystemMessage = selectedSystemPrompt?.trim() || request.systemMessage?.trim();
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

type ResolvedSystemPromptPreset = Pick<
    BuiltInSystemPromptPreset | SystemPromptPresetDto,
    'systemPrompt' | keyof SystemPromptGenerationSettings
>;

export const promptBuilderService = new PromptBuilderService();
