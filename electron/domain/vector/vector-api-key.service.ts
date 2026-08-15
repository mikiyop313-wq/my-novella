import { safeStorage } from 'electron';

import type { AppSettingsStore } from '../../../db/repositories/app-settings.repository';
import { appSettingsRepository } from '../../../db/repositories/app-settings.repository';
import {
    VECTOR_CLOUD_PROVIDER_IDS,
    type VectorApiKeyStatus,
    type VectorCloudProviderId,
} from '../../../shared/models/vector.model';

const API_KEY_SETTING_PREFIX = 'vectors.apiKey.';

export class VectorApiKeyService {
    constructor(private readonly settingsStore: AppSettingsStore = appSettingsRepository) {}

    async saveApiKey(
        providerId: VectorCloudProviderId,
        rawApiKey: string,
    ): Promise<VectorApiKeyStatus> {
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

    async getApiKeyStatus(providerId: VectorCloudProviderId): Promise<VectorApiKeyStatus> {
        const apiKey = await this.getApiKey(providerId);
        return apiKey === null
            ? { configured: false, suffix: null }
            : this.statusForKey(apiKey);
    }

    async getApiKey(providerId: VectorCloudProviderId): Promise<string | null> {
        this.assertProviderId(providerId);

        const encryptedKey = await this.settingsStore.get(this.settingKey(providerId));
        if (encryptedKey === null) return null;
        return this.decryptKey(encryptedKey);
    }

    private encryptKey(apiKey: string): string {
        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error('Secure credential storage is unavailable on this system.');
        }
        return safeStorage.encryptString(apiKey).toString('base64');
    }

    private decryptKey(encryptedKeyBase64: string): string {
        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error('Secure credential storage is unavailable on this system.');
        }

        try {
            return safeStorage.decryptString(Buffer.from(encryptedKeyBase64, 'base64'));
        } catch {
            throw new Error('The saved API key could not be decrypted.');
        }
    }

    private settingKey(providerId: VectorCloudProviderId): string {
        return `${API_KEY_SETTING_PREFIX}${providerId}`;
    }

    private statusForKey(apiKey: string): VectorApiKeyStatus {
        return { configured: true, suffix: apiKey.slice(-4) };
    }

    private assertProviderId(providerId: string): asserts providerId is VectorCloudProviderId {
        if (!VECTOR_CLOUD_PROVIDER_IDS.some(candidate => candidate === providerId)) {
            throw new Error(`Unsupported cloud vector provider: ${providerId}`);
        }
    }
}

export const vectorApiKeyService = new VectorApiKeyService();
