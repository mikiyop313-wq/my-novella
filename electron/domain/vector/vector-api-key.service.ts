import { safeStorage } from 'electron';

import type { AppSettingsStore } from '../../../db/repositories/app-settings.repository';
import { appSettingsRepository } from '../../../db/repositories/app-settings.repository';
import {
    VECTOR_CONFIGURATION_PROVIDER_IDS,
    type VectorApiKeyStatus,
    type VectorConfigurationProviderId,
} from '../../../shared/models/vector.model';

const API_KEY_SETTING_PREFIX = 'vectors.apiKey.';

export const VECTOR_API_KEY_PROVIDER_IDS = VECTOR_CONFIGURATION_PROVIDER_IDS;

export type VectorApiKeyProviderId = VectorConfigurationProviderId;

export class VectorApiKeyService {
    constructor(private readonly settingsStore: AppSettingsStore = appSettingsRepository) {}

    async saveApiKey(
        providerId: VectorApiKeyProviderId,
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

    async getApiKeyStatus(providerId: VectorApiKeyProviderId): Promise<VectorApiKeyStatus> {
        const apiKey = await this.getApiKey(providerId);
        return apiKey === null
            ? { configured: false, suffix: null }
            : this.statusForKey(apiKey);
    }

    async getApiKey(providerId: VectorApiKeyProviderId): Promise<string | null> {
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

    private settingKey(providerId: VectorApiKeyProviderId): string {
        return `${API_KEY_SETTING_PREFIX}${providerId}`;
    }

    private statusForKey(apiKey: string): VectorApiKeyStatus {
        return { configured: true, suffix: apiKey.slice(-4) };
    }

    private assertProviderId(providerId: string): asserts providerId is VectorApiKeyProviderId {
        if (!VECTOR_API_KEY_PROVIDER_IDS.some(candidate => candidate === providerId)) {
            throw new Error(`Unsupported cloud vector provider: ${providerId}`);
        }
    }
}

export const vectorApiKeyService = new VectorApiKeyService();
