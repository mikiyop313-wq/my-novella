import { AiPromptRequest, AiPromptResponse } from '../models';

export interface AiProvider {
    readonly id: string;
    readonly name: string;
    
    generate(request: AiPromptRequest): Promise<AiPromptResponse>;
}
