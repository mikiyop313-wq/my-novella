import { randomUUID } from 'crypto';

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
import type {
  NewSystemPromptPresetRow,
  SystemPromptPresetUpdate,
} from '../schema';
import { toSqliteTimestamp } from '../core/sqlite-values';
import { mapSystemPromptPresetRow } from '../mappers/system-prompt.mapper';
import { appSettingsRepository, type AppSettingsStore } from './app-settings.repository';

const builtInModelSettingKey = (presetId: string): string =>
  `system-prompt-built-in-model:${presetId}`;

export class SystemPromptRepository {
  constructor(private readonly settingsStore: AppSettingsStore = appSettingsRepository) {}

  private mapOwnership(
    ownership: SystemPromptOwnership,
  ): Pick<NewSystemPromptPresetRow, 'scope' | 'bookId'> {
    if (ownership.scope === 'global') return { scope: 'global', bookId: null };
    if (ownership.scope === 'book' && typeof ownership.bookId === 'string' && ownership.bookId.length > 0) {
      return { scope: 'book', bookId: ownership.bookId };
    }
    throw new Error('Book-scoped system prompt presets require a book ID.');
  }

  async listAvailableForBook(bookId: string): Promise<SystemPromptPresetDto[]> {
    const rows = await db
      .selectFrom('systemPromptPresets')
      .selectAll()
      .where((expression) =>
        expression.or([
          expression('scope', '=', 'global'),
          expression.and([expression('scope', '=', 'book'), expression('bookId', '=', bookId)]),
        ]),
      )
      .orderBy('category')
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
    return rows.map(mapSystemPromptPresetRow);
  }

  async listGlobal(): Promise<SystemPromptPresetDto[]> {
    const rows = await db.selectFrom('systemPromptPresets').selectAll().where('scope', '=', 'global').orderBy('category').orderBy('createdAt').orderBy('id').execute();
    return rows.map(mapSystemPromptPresetRow);
  }

  async getById(id: string): Promise<SystemPromptPresetDto | undefined> {
    const row = await db.selectFrom('systemPromptPresets').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? mapSystemPromptPresetRow(row) : undefined;
  }

  async listActivePresetIdsForBook(bookId: string): Promise<ActiveSystemPromptPresetIds> {
    const rows = await db.selectFrom('activeSystemPromptPresets').select(['category', 'presetId']).where('bookId', '=', bookId).execute();
    const activePresetIds = createDefaultSystemPromptPresetIds();
    for (const row of rows) activePresetIds[row.category] = row.presetId;
    return activePresetIds;
  }

  async setActivePreset(bookId: string, category: SystemPromptCategory, presetId: string): Promise<ActiveSystemPromptPresetIds> {
    const preset = await this.getById(presetId);
    if (!preset) throw new Error('System prompt preset does not exist.');
    if (preset.category !== category) throw new Error('System prompt preset category does not match the active category.');
    if (preset.scope === 'book' && preset.bookId !== bookId) throw new Error('Book-scoped system prompt preset belongs to another book.');
    await db
      .insertInto('activeSystemPromptPresets')
      .values({ bookId, category, presetId })
      .onConflict((conflict) => conflict.columns(['bookId', 'category']).doUpdateSet({ presetId }))
      .execute();
    return this.listActivePresetIdsForBook(bookId);
  }

  async resetActivePreset(bookId: string, category: SystemPromptCategory): Promise<ActiveSystemPromptPresetIds> {
    await db.deleteFrom('activeSystemPromptPresets').where('bookId', '=', bookId).where('category', '=', category).execute();
    return this.listActivePresetIdsForBook(bookId);
  }

  async create(data: CreateSystemPromptPresetDto): Promise<SystemPromptPresetDto> {
    const timestamp = toSqliteTimestamp();
    const created = await db
      .insertInto('systemPromptPresets')
      .values({
        id: randomUUID(),
        ...this.mapOwnership(data),
        name: data.name,
        systemPrompt: data.systemPrompt,
        category: data.category,
        temperature: data.temperature,
        topP: data.topP,
        maxOutputTokens: data.maxOutputTokens,
        presencePenalty: data.presencePenalty,
        frequencyPenalty: data.frequencyPenalty,
        defaultModelId: data.defaultModelId,
        createdAt: timestamp,
        lastEditedAt: timestamp,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return mapSystemPromptPresetRow(created);
  }

  async update(id: string, data: UpdateSystemPromptPresetDto): Promise<SystemPromptPresetDto | undefined> {
    const update: SystemPromptPresetUpdate = { lastEditedAt: toSqliteTimestamp() };
    if (data.name !== undefined) update.name = data.name;
    if (data.systemPrompt !== undefined) update.systemPrompt = data.systemPrompt;
    if (data.category !== undefined) update.category = data.category;
    if (data.temperature !== undefined) update.temperature = data.temperature;
    if (data.topP !== undefined) update.topP = data.topP;
    if (data.maxOutputTokens !== undefined) update.maxOutputTokens = data.maxOutputTokens;
    if (data.presencePenalty !== undefined) update.presencePenalty = data.presencePenalty;
    if (data.frequencyPenalty !== undefined) update.frequencyPenalty = data.frequencyPenalty;
    if (data.defaultModelId !== undefined) update.defaultModelId = data.defaultModelId;
    if (data.ownership !== undefined) Object.assign(update, this.mapOwnership(data.ownership));

    const updated = await db.updateTable('systemPromptPresets').set(update).where('id', '=', id).returningAll().executeTakeFirst();
    if (!updated) return undefined;

    await db.deleteFrom('activeSystemPromptPresets').where('presetId', '=', id).where('category', '!=', updated.category).execute();
    if (updated.scope === 'book' && updated.bookId) {
      await db.deleteFrom('activeSystemPromptPresets').where('presetId', '=', id).where('bookId', '!=', updated.bookId).execute();
    }
    return mapSystemPromptPresetRow(updated);
  }

  async delete(id: string): Promise<{ success: boolean }> {
    const result = await db.deleteFrom('systemPromptPresets').where('id', '=', id).executeTakeFirst();
    return { success: result.numDeletedRows > 0n };
  }

  async getBuiltInDefaultModelId(presetId: string): Promise<string | null> {
    const preset = findBuiltInSystemPromptPreset(presetId);
    if (!preset) throw new Error('Built-in system prompt preset does not exist.');
    return (await this.settingsStore.get(builtInModelSettingKey(presetId))) ?? preset.defaultModelId;
  }

  async setBuiltInDefaultModelId(presetId: string, defaultModelId: string): Promise<string> {
    const preset = findBuiltInSystemPromptPreset(presetId);
    if (!preset || preset.defaultModelId === null) throw new Error('This built-in system prompt does not support a default model.');
    const normalizedModelId = defaultModelId.trim();
    if (!normalizedModelId) throw new Error('A default model is required.');
    await this.settingsStore.set(builtInModelSettingKey(presetId), normalizedModelId);
    return normalizedModelId;
  }

  async resolveActiveModel(bookId: string, category: SystemPromptCategory): Promise<ResolvedActiveSystemPromptModelDto> {
    const presetId = (await this.listActivePresetIdsForBook(bookId))[category];
    const builtIn = findBuiltInSystemPromptPreset(presetId);
    if (builtIn) return { presetId, defaultModelId: await this.getBuiltInDefaultModelId(presetId) };
    const preset = await this.getById(presetId);
    if (!preset || preset.category !== category) throw new Error('The active system prompt preset is unavailable.');
    if (preset.defaultModelId) return { presetId, defaultModelId: preset.defaultModelId };
    const defaultPresetId = createDefaultSystemPromptPresetIds()[category];
    return { presetId, defaultModelId: await this.getBuiltInDefaultModelId(defaultPresetId) };
  }
}

export const systemPromptRepository = new SystemPromptRepository();
