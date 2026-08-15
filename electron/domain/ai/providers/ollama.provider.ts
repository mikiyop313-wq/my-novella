import { aiConfigurationService } from '../ai-configuration.service';
import type { AiConfigurationService } from '../ai-configuration.service';
import { LocalOpenAiCompatibleProvider } from './local-openai-compatible.provider';

export class OllamaProvider extends LocalOpenAiCompatibleProvider {
    constructor(
        configuration: Pick<AiConfigurationService, 'getServerUrl'> = aiConfigurationService,
    ) {
        super({ id: 'ollama', name: 'Ollama', apiPath: 'v1' }, configuration);
    }
}
