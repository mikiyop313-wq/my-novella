import type {
  AiChatMessage,
  AiChatMessageRole,
} from '../../../../shared/models/ai.model';
import type { SystemPromptCategory } from '../../../../shared/models/system-prompt.model';

export interface PromptSection {
  name: string;
  content: string;
}

export interface AiPromptTextPart {
  type: 'text';
  content: string;
}

export interface AiPromptSectionPart extends PromptSection {
  type: 'section';
}

export type AiPromptPart = AiPromptTextPart | AiPromptSectionPart;

export interface AiPromptMessageInput {
  role: AiChatMessageRole;
  parts: readonly AiPromptPart[];
}

export interface BuildAiPromptRequest {
  requestType: SystemPromptCategory;
  messages: readonly AiPromptMessageInput[];
}

export interface BuiltAiPrompt {
  systemPromptCategory: SystemPromptCategory;
  prompt: string;
  messages: AiChatMessage[];
}

export function buildAiPrompt(request: BuildAiPromptRequest): BuiltAiPrompt {
  const messages = request.messages
    .map(renderPromptMessage)
    .filter((message): message is AiChatMessage => message !== null);
  const prompt = [...messages]
    .reverse()
    .find(message => message.role === 'user')
    ?.content;

  if (!prompt) throw new Error('AI prompt requires at least one non-empty user message.');

  return {
    systemPromptCategory: request.requestType,
    prompt,
    messages,
  };
}

export function buildPromptSection(section: PromptSection): string {
  const name = section.name.trim();
  const content = section.content.trim();
  if (!content) return '';
  if (!name) throw new Error('AI prompt section requires a non-empty name.');

  return [
    `--- BEGIN ${name} ---`,
    content,
    `--- END ${name} ---`,
  ].join('\n\n');
}

function renderPromptMessage(message: AiPromptMessageInput): AiChatMessage | null {
  const content = message.parts
    .map(renderPromptPart)
    .filter(Boolean)
    .join('\n\n')
    .trim();

  return content ? { role: message.role, content } : null;
}

function renderPromptPart(part: AiPromptPart): string {
  if (part.type === 'section') return buildPromptSection(part);
  return part.content.trim();
}
