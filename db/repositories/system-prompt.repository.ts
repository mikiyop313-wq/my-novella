import { and, asc, eq, or } from 'drizzle-orm';

import type {
  CreateSystemPromptPresetDto,
  SystemPromptOwnership,
  SystemPromptPresetDto,
  UpdateSystemPromptPresetDto,
} from '../../shared/models/system-prompt.model';
import { db } from '../index';
import { systemPromptPresets } from '../schema';

type SystemPromptPresetEntity = typeof systemPromptPresets.$inferSelect;
type SystemPromptPresetInsert = typeof systemPromptPresets.$inferInsert;
type SystemPromptPresetUpdate = Partial<Omit<SystemPromptPresetInsert, 'id' | 'createdAt'>>;

export class SystemPromptRepository {
  private mapToDto(preset: SystemPromptPresetEntity): SystemPromptPresetDto {
    return {
      id: preset.id,
      name: preset.name,
      systemPrompt: preset.systemPrompt,
      category: preset.category,
      scope: preset.scope,
      bookId: preset.bookId,
      temperature: preset.temperature,
      topP: preset.topP,
      maxOutputTokens: preset.maxOutputTokens,
      presencePenalty: preset.presencePenalty,
      frequencyPenalty: preset.frequencyPenalty,
      createdAt: preset.createdAt.toISOString(),
      lastEditedAt: preset.lastEditedAt.toISOString(),
    };
  }

  private mapOwnership(
    ownership: SystemPromptOwnership,
  ): Pick<SystemPromptPresetInsert, 'scope' | 'bookId'> {
    if (ownership.scope === 'global') {
      return { scope: 'global', bookId: null };
    }

    if (
      ownership.scope === 'book' &&
      typeof ownership.bookId === 'string' &&
      ownership.bookId.length > 0
    ) {
      return { scope: 'book', bookId: ownership.bookId };
    }

    throw new Error('Book-scoped system prompt presets require a book ID.');
  }

  async listAvailableForBook(bookId: string): Promise<SystemPromptPresetDto[]> {
    const presets = await db
      .select()
      .from(systemPromptPresets)
      .where(
        or(
          eq(systemPromptPresets.scope, 'global'),
          and(eq(systemPromptPresets.scope, 'book'), eq(systemPromptPresets.bookId, bookId)),
        ),
      )
      .orderBy(
        asc(systemPromptPresets.category),
        asc(systemPromptPresets.createdAt),
        asc(systemPromptPresets.id),
      );

    return presets.map((preset) => this.mapToDto(preset));
  }

  async create(data: CreateSystemPromptPresetDto): Promise<SystemPromptPresetDto> {
    const ownership = this.mapOwnership(data);
    const [created] = await db
      .insert(systemPromptPresets)
      .values({
        ...ownership,
        name: data.name,
        systemPrompt: data.systemPrompt,
        category: data.category,
        temperature: data.temperature,
        topP: data.topP,
        maxOutputTokens: data.maxOutputTokens,
        presencePenalty: data.presencePenalty,
        frequencyPenalty: data.frequencyPenalty,
      })
      .returning();

    return this.mapToDto(created);
  }

  async update(
    id: string,
    data: UpdateSystemPromptPresetDto,
  ): Promise<SystemPromptPresetDto | undefined> {
    const update: SystemPromptPresetUpdate = {
      lastEditedAt: new Date(),
    };

    if (data.name !== undefined) update.name = data.name;
    if (data.systemPrompt !== undefined) update.systemPrompt = data.systemPrompt;
    if (data.category !== undefined) update.category = data.category;
    if (data.temperature !== undefined) update.temperature = data.temperature;
    if (data.topP !== undefined) update.topP = data.topP;
    if (data.maxOutputTokens !== undefined) update.maxOutputTokens = data.maxOutputTokens;
    if (data.presencePenalty !== undefined) update.presencePenalty = data.presencePenalty;
    if (data.frequencyPenalty !== undefined) update.frequencyPenalty = data.frequencyPenalty;
    if (data.ownership !== undefined) {
      Object.assign(update, this.mapOwnership(data.ownership));
    }

    const [updated] = await db
      .update(systemPromptPresets)
      .set(update)
      .where(eq(systemPromptPresets.id, id))
      .returning();

    return updated ? this.mapToDto(updated) : undefined;
  }

  async delete(id: string): Promise<{ success: boolean }> {
    const deleted = await db
      .delete(systemPromptPresets)
      .where(eq(systemPromptPresets.id, id))
      .returning({ id: systemPromptPresets.id });

    return { success: deleted.length > 0 };
  }
}

export const systemPromptRepository = new SystemPromptRepository();
