import type { AiPromptRequest, AiPromptResponse } from '../models';
import type { AiModel } from '../../../../shared/models/ai.model';

export interface AiProvider {
    readonly id: string;
    readonly name: string;

    generate(request: AiPromptRequest): Promise<AiPromptResponse>;
    listModels(): Promise<AiModel[]>;
}
