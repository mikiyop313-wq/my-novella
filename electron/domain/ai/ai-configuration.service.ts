import type { AppSettingsStore } from '../../../db/repositories/app-settings.repository';
import { appSettingsRepository } from '../../../db/repositories/app-settings.repository';
import {
    AI_CLOUD_PROVIDER_IDS,
    AI_LOCAL_PROVIDER_IDS,
    type AiApiKeyStatus,
    type AiCloudProviderId,
    type AiLocalProviderId,
    type AiProviderConfiguration,
} from '../../../shared/models/ai.model';
import { ApiKeyService, apiKeyService } from './api-key.service';

const SERVER_URL_SETTING_PREFIX = 'ai.serverUrl.';

export class AiConfigurationService {
    constructor(
        private readonly settingsStore: AppSettingsStore = appSettingsRepository,
        private readonly keys: ApiKeyService = apiKeyService,
    ) {}

    async loadConfiguration(): Promise<AiProviderConfiguration> {
        const [apiKeyEntries, serverUrlEntries] = await Promise.all([
            Promise.all(
                AI_CLOUD_PROVIDER_IDS.map(async (providerId) => [
                    providerId,
                    await this.keys.getApiKeyStatus(providerId),
                ] as const),
            ),
            Promise.all(
                AI_LOCAL_PROVIDER_IDS.map(async (providerId) => [
                    providerId,
                    await this.getServerUrl(providerId),
                ] as const),
            ),
        ]);

        return {
            apiKeys: Object.fromEntries(apiKeyEntries) as Record<AiCloudProviderId, AiApiKeyStatus>,
            serverUrls: Object.fromEntries(serverUrlEntries) as Record<AiLocalProviderId, string | null>,
        };
    }

    async saveApiKey(providerId: AiCloudProviderId, apiKey: string): Promise<AiApiKeyStatus> {
        return this.keys.saveApiKey(providerId, apiKey);
    }

    async loadApiKey(providerId: AiCloudProviderId): Promise<string | null> {
        return this.keys.getApiKey(providerId);
    }

    async getServerUrl(providerId: AiLocalProviderId): Promise<string | null> {
        this.assertLocalProviderId(providerId);
        return this.settingsStore.get(this.serverUrlSettingKey(providerId));
    }

    async saveServerUrl(providerId: AiLocalProviderId, rawServerUrl: string): Promise<string> {
        this.assertLocalProviderId(providerId);

        const serverUrl = rawServerUrl.trim();
        if (!serverUrl) {
            throw new Error('Server URL is required.');
        }

        let parsedUrl: URL;
        try {
            parsedUrl = new URL(serverUrl);
        } catch {
            throw new Error('Enter a valid absolute server URL.');
        }

        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            throw new Error('Server URL must use HTTP or HTTPS.');
        }

        await this.settingsStore.set(this.serverUrlSettingKey(providerId), serverUrl);
        return serverUrl;
    }

    private serverUrlSettingKey(providerId: AiLocalProviderId): string {
        return `${SERVER_URL_SETTING_PREFIX}${providerId}`;
    }

    private assertLocalProviderId(providerId: string): asserts providerId is AiLocalProviderId {
        if (!AI_LOCAL_PROVIDER_IDS.some((candidate) => candidate === providerId)) {
            throw new Error(`Unsupported local AI provider: ${providerId}`);
        }
    }
}

export const aiConfigurationService = new AiConfigurationService();
