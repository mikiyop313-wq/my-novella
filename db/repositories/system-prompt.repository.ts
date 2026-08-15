import { and, asc, eq, ne, or } from 'drizzle-orm';

import {
  createDefaultSystemPromptPresetIds,
  findBuiltInSystemPromptPreset,
} from '../../shared/constants/ai-system-prompts';
import type {
  ActiveSystemPromptPresetIds,
  CreateSystemPromptPresetDto,
  ResolvedActiveSystemPromptModelDto,
  SystemPromptCategory,
  SystemPromptOwnership,
  SystemPromptPresetDto,
  UpdateSystemPromptPresetDto,
} from '../../shared/models/system-prompt.model';
import { db } from '../index';
import { activeSystemPromptPresets, systemPromptPresets } from '../schema';
import {
  appSettingsRepository,
  type AppSettingsStore,
} from './app-settings.repository';

const builtInModelSettingKey = (presetId: string): string =>
  `system-prompt-built-in-model:${presetId}`;

type SystemPromptPresetEntity = typeof systemPromptPresets.$inferSelect;
type SystemPromptPresetInsert = typeof systemPromptPresets.$inferInsert;
type SystemPromptPresetUpdate = Partial<Omit<SystemPromptPresetInsert, 'id' | 'createdAt'>>;

export class SystemPromptRepository {
  constructor(private readonly settingsStore: AppSettingsStore = appSettingsRepository) {}

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
      defaultModelId: preset.defaultModelId,
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

  async listGlobal(): Promise<SystemPromptPresetDto[]> {
    const presets = await db
      .select()
      .from(systemPromptPresets)
      .where(eq(systemPromptPresets.scope, 'global'))
      .orderBy(
        asc(systemPromptPresets.category),
        asc(systemPromptPresets.createdAt),
        asc(systemPromptPresets.id),
      );

    return presets.map((preset) => this.mapToDto(preset));
  }

  async getById(id: string): Promise<SystemPromptPresetDto | undefined> {
    const preset = await db.query.systemPromptPresets.findFirst({
      where: eq(systemPromptPresets.id, id),
    });

    return preset ? this.mapToDto(preset) : undefined;
  }

  async listActivePresetIdsForBook(bookId: string): Promise<ActiveSystemPromptPresetIds> {
    const rows = await db
      .select({
        category: activeSystemPromptPresets.category,
        presetId: activeSystemPromptPresets.presetId,
      })
      .from(activeSystemPromptPresets)
      .where(eq(activeSystemPromptPresets.bookId, bookId));
    const activePresetIds = createDefaultSystemPromptPresetIds();

    for (const row of rows) {
      activePresetIds[row.category] = row.presetId;
    }

    return activePresetIds;
  }

  async setActivePreset(
    bookId: string,
    category: SystemPromptCategory,
    presetId: string,
  ): Promise<ActiveSystemPromptPresetIds> {
    const preset = await this.getById(presetId);
    if (!preset) throw new Error('System prompt preset does not exist.');
    if (preset.category !== category) {
      throw new Error('System prompt preset category does not match the active category.');
    }
    if (preset.scope === 'book' && preset.bookId !== bookId) {
      throw new Error('Book-scoped system prompt preset belongs to another book.');
    }

    await db
      .insert(activeSystemPromptPresets)
      .values({ bookId, category, presetId })
      .onConflictDoUpdate({
        target: [activeSystemPromptPresets.bookId, activeSystemPromptPresets.category],
        set: { presetId },
      });

    return this.listActivePresetIdsForBook(bookId);
  }

  async resetActivePreset(
    bookId: string,
    category: SystemPromptCategory,
  ): Promise<ActiveSystemPromptPresetIds> {
    await db
      .delete(activeSystemPromptPresets)
      .where(
        and(
          eq(activeSystemPromptPresets.bookId, bookId),
          eq(activeSystemPromptPresets.category, category),
        ),
      );

    return this.listActivePresetIdsForBook(bookId);
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
        defaultModelId: data.defaultModelId,
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
    if (data.defaultModelId !== undefined) update.defaultModelId = data.defaultModelId;
    if (data.ownership !== undefined) {
      Object.assign(update, this.mapOwnership(data.ownership));
    }

    const [updated] = await db
      .update(systemPromptPresets)
      .set(update)
      .where(eq(systemPromptPresets.id, id))
      .returning();

    if (!updated) return undefined;

    await db
      .delete(activeSystemPromptPresets)
      .where(
        and(
          eq(activeSystemPromptPresets.presetId, id),
          ne(activeSystemPromptPresets.category, updated.category),
        ),
      );
    if (updated.scope === 'book' && updated.bookId) {
      await db
        .delete(activeSystemPromptPresets)
        .where(
          and(
            eq(activeSystemPromptPresets.presetId, id),
            ne(activeSystemPromptPresets.bookId, updated.bookId),
          ),
        );
    }

    return this.mapToDto(updated);
  }

  async delete(id: string): Promise<{ success: boolean }> {
    const deleted = await db
      .delete(systemPromptPresets)
      .where(eq(systemPromptPresets.id, id))
      .returning({ id: systemPromptPresets.id });

    return { success: deleted.length > 0 };
  }

  async getBuiltInDefaultModelId(presetId: string): Promise<string | null> {
    const preset = findBuiltInSystemPromptPreset(presetId);
    if (!preset) throw new Error('Built-in system prompt preset does not exist.');

    return (await this.settingsStore.get(builtInModelSettingKey(presetId)))
      ?? preset.defaultModelId;
  }

  async setBuiltInDefaultModelId(presetId: string, defaultModelId: string): Promise<string> {
    const preset = findBuiltInSystemPromptPreset(presetId);
    if (!preset || preset.defaultModelId === null) {
      throw new Error('This built-in system prompt does not support a default model.');
    }
    const normalizedModelId = defaultModelId.trim();
    if (!normalizedModelId) throw new Error('A default model is required.');

    await this.settingsStore.set(builtInModelSettingKey(presetId), normalizedModelId);
    return normalizedModelId;
  }

  async resolveActiveModel(
    bookId: string,
    category: SystemPromptCategory,
  ): Promise<ResolvedActiveSystemPromptModelDto> {
    const presetId = (await this.listActivePresetIdsForBook(bookId))[category];
    const builtIn = findBuiltInSystemPromptPreset(presetId);
    if (builtIn) {
      return { presetId, defaultModelId: await this.getBuiltInDefaultModelId(presetId) };
    }

    const preset = await this.getById(presetId);
    if (!preset || preset.category !== category) {
      throw new Error('The active system prompt preset is unavailable.');
    }
    if (preset.defaultModelId) {
      return { presetId, defaultModelId: preset.defaultModelId };
    }

    const defaultPresetId = createDefaultSystemPromptPresetIds()[category];
    return {
      presetId,
      defaultModelId: await this.getBuiltInDefaultModelId(defaultPresetId),
    };
  }
}

export const systemPromptRepository = new SystemPromptRepository();
