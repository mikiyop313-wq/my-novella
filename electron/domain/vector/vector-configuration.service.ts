import {
    VECTOR_CONFIGURATION_PROVIDER_IDS,
    type VectorApiKeyStatus,
    type VectorConfigurationProviderId,
    type VectorProviderConfiguration,
} from '../../../shared/models/vector.model';
import { assertEmbeddingDimensions } from '../../../vectors/embeddings/types';
import { getCloudEmbeddingProvider } from '../../../vectors/embeddings/factory';
import { testOpenRouterConnection } from './openrouter-connection';
import { VectorApiKeyService, vectorApiKeyService } from './vector-api-key.service';

export class VectorConfigurationService {
    constructor(private readonly keys: VectorApiKeyService = vectorApiKeyService) {}

    async loadConfiguration(): Promise<VectorProviderConfiguration> {
        const entries = await Promise.all(
            VECTOR_CONFIGURATION_PROVIDER_IDS.map(async providerId => [
                providerId,
                await this.keys.getApiKeyStatus(providerId),
            ] as const),
        );
        return {
            apiKeys: Object.fromEntries(entries) as Record<
                VectorConfigurationProviderId,
                VectorApiKeyStatus
            >,
        };
    }

    async saveApiKey(
        providerId: VectorConfigurationProviderId,
        apiKey: string,
    ): Promise<VectorApiKeyStatus> {
        return this.keys.saveApiKey(providerId, apiKey);
    }

    async loadApiKey(providerId: VectorConfigurationProviderId): Promise<string | null> {
        return this.keys.getApiKey(providerId);
    }

    async testConnection(providerId: VectorConfigurationProviderId): Promise<void> {
        if (providerId === 'openrouter') {
            await testOpenRouterConnection(this.keys);
            return;
        }
        const provider = await getCloudEmbeddingProvider(providerId, this.keys);
        const vector = await provider.embedQuery('My Novella vector connection test');
        assertEmbeddingDimensions(provider, [vector]);
    }
}

export const vectorConfigurationService = new VectorConfigurationService();
