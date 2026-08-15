import { aiConfigurationService } from '../ai-configuration.service';
import type { AiConfigurationService } from '../ai-configuration.service';
import { LocalOpenAiCompatibleProvider } from './local-openai-compatible.provider';

export class LmStudioProvider extends LocalOpenAiCompatibleProvider {
    constructor(
        configuration: Pick<AiConfigurationService, 'getServerUrl'> = aiConfigurationService,
    ) {
        super({ id: 'lm-studio', name: 'LM Studio' }, configuration);
    }
}
