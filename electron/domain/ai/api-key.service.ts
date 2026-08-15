import { safeStorage } from 'electron';

import type { AppSettingsStore } from '../../../db/repositories/app-settings.repository';
import { appSettingsRepository } from '../../../db/repositories/app-settings.repository';
import {
    AI_CLOUD_PROVIDER_IDS,
    type AiApiKeyStatus,
    type AiCloudProviderId,
} from '../../../shared/models/ai.model';

const API_KEY_SETTING_PREFIX = 'ai.apiKey.';

export class ApiKeyService {
    constructor(private readonly settingsStore: AppSettingsStore = appSettingsRepository) {}

    async saveApiKey(providerId: AiCloudProviderId, rawApiKey: string): Promise<AiApiKeyStatus> {
        this.assertProviderId(providerId);

        const apiKey = rawApiKey.trim();
        if (!apiKey) {
            await this.settingsStore.delete(this.settingKey(providerId));
            return { configured: false, suffix: null };
        }

        const encryptedKey = this.encryptKey(apiKey);
        await this.settingsStore.set(this.settingKey(providerId), encryptedKey);

        return this.statusForKey(apiKey);
    }

    async getApiKeyStatus(providerId: AiCloudProviderId): Promise<AiApiKeyStatus> {
        const apiKey = await this.getApiKey(providerId);
        return apiKey === null
            ? { configured: false, suffix: null }
            : this.statusForKey(apiKey);
    }

    async getApiKey(providerId: AiCloudProviderId): Promise<string | null> {
        this.assertProviderId(providerId);

        const encryptedKey = await this.settingsStore.get(this.settingKey(providerId));
        if (encryptedKey === null) {
            return null;
        }

        return this.decryptKey(encryptedKey);
    }

    private encryptKey(apiKey: string): string {
        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error('Secure credential storage is unavailable on this system.');
        }

        const encryptedBuffer = safeStorage.encryptString(apiKey);
        return encryptedBuffer.toString('base64');
    }

    private decryptKey(encryptedKeyBase64: string): string {
        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error('Secure credential storage is unavailable on this system.');
        }

        try {
            const buffer = Buffer.from(encryptedKeyBase64, 'base64');
            return safeStorage.decryptString(buffer);
        } catch {
            throw new Error('The saved API key could not be decrypted.');
        }
    }

    private settingKey(providerId: AiCloudProviderId): string {
        return `${API_KEY_SETTING_PREFIX}${providerId}`;
    }

    private statusForKey(apiKey: string): AiApiKeyStatus {
        return {
            configured: true,
            suffix: apiKey.slice(-4),
        };
    }

    private assertProviderId(providerId: string): asserts providerId is AiCloudProviderId {
        if (!AI_CLOUD_PROVIDER_IDS.some((candidate) => candidate === providerId)) {
            throw new Error(`Unsupported cloud AI provider: ${providerId}`);
        }
    }
}

export const apiKeyService = new ApiKeyService();
