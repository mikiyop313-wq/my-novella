import { ipcMain } from 'electron';
import { aiService } from '../domain/ai/ai.service';
import { AiPromptRequest } from '../domain/ai/models';
import { OpenRouterProvider } from '../domain/ai/providers/openrouter.provider';

export function setupAiHandlers() {
    ipcMain.handle('ai:generate', async (event, request: AiPromptRequest) => {
        try {
            // Attach a callback to send tokens back to the renderer
            const requestWithCallback: AiPromptRequest = {
                ...request,
                onToken: (token: string) => {
                    event.sender.send('ai:generate-stream', token);
                }
            };
            return await aiService.generatePrompt(requestWithCallback);
        } catch (error) {
            console.error('Error in ai:generate IPC handler:', error);
            // Throw error so it gets rejected in the renderer process
            throw error;
        }
    });

    ipcMain.handle('ai:list-models', async () => {
        try {
            // Fetch OpenRouter models
            const openRouterModels = await new OpenRouterProvider().getAvailableModels();

            // Formatter for provider slugs to nice names
            const formatProviderSlug = (slug: string): string => {
                const mapping: Record<string, string> = {
                    'openai': 'OpenAI',
                    'anthropic': 'Anthropic',
                    'google': 'Google',
                    'meta-llama': 'Meta Llama',
                    'mistralai': 'Mistral AI',
                    'cohere': 'Cohere',
                    'deepseek': 'DeepSeek',
                    'minimax': 'MiniMax',
                    'microsoft': 'Microsoft',
                    'perplexity': 'Perplexity',
                    'nousresearch': 'Nous Research',
                    'qwen': 'Qwen',
                };
                if (mapping[slug]) return mapping[slug];
                return slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            };

            const mappedOpenRouter = openRouterModels
                .filter((model: any) => {
                    const lowerId = model.id.toLowerCase();
                    const lowerName = model.name.toLowerCase();
                    
                    // 1. Programmatic filter: if output modalities metadata is available,
                    // exclude models that output image, audio, or video.
                    if (model.architecture && Array.isArray(model.architecture.output_modalities)) {
                        const outMods = model.architecture.output_modalities;
                        if (outMods.includes('image') || outMods.includes('audio') || outMods.includes('video')) {
                            return false;
                        }
                    }
                    
                    // 2. Keyword filter: exclude based on known image/audio/video/speech keywords in ID or Name
                    const hasExcludedKeyword = 
                        lowerId.includes('dall-e') || 
                        lowerId.includes('stable-diffusion') || 
                        lowerId.includes('midjourney') ||
                        lowerId.includes('whisper') ||
                        lowerId.includes('tts') ||
                        lowerId.includes('suno') ||
                        lowerId.includes('udio') ||
                        lowerId.includes('flux') ||
                        lowerId.includes('lyria') ||
                        lowerId.includes('luma') ||
                        lowerId.includes('kling') ||
                        lowerId.includes('runway') ||
                        lowerId.includes('sora') ||
                        lowerId.includes('haiper') ||
                        lowerId.includes('veo') ||
                        lowerId.includes('pika') ||
                        lowerId.includes('elevenlabs') ||
                        lowerId.includes('playht') ||
                        lowerId.includes('bark') ||
                        lowerId.includes('cogvideo') ||
                        lowerId.includes('stable-audio') ||
                        lowerId.includes('stable-video') ||
                        lowerId.includes('banana') ||
                        lowerId.includes('imagen') ||
                        lowerName.includes('banana') ||
                        lowerName.includes('imagen') ||
                        lowerName.includes('music') ||
                        lowerName.includes('voice') ||
                        lowerName.includes('video') ||
                        lowerName.includes('audio') ||
                        lowerName.includes('sound') ||
                        lowerName.includes('speech') ||
                        lowerName.includes('text-to-speech') ||
                        lowerName.includes('image generator') ||
                        lowerName.includes('diffusion') ||
                        (lowerName.includes('image') && !lowerName.includes('image-to-text') && !lowerName.includes('image to text') && !lowerName.includes('vision') && !lowerName.includes('vl'));
                        
                    if (hasExcludedKeyword) return false;

                    // If it has output_modalities metadata, it must support text
                    if (model.architecture && Array.isArray(model.architecture.output_modalities)) {
                        return model.architecture.output_modalities.includes('text');
                    }
                    
                    return true;
                })
                .map((model: any) => {
                    const [providerSlug] = model.id.split('/');
                    const [, modelName] = model.name.split(':');
                    const cleanName = modelName ? modelName.trim() : model.name;
                    return {
                        id: model.id,
                        name: cleanName,
                        provider: providerSlug,
                        providerName: `OpenRouter: ${formatProviderSlug(providerSlug)}`,
                        source: 'openrouter'
                    };
                });

            // Standard direct models
            const directModels = [
                { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'openai', providerName: 'OpenAI (Direct)', source: 'direct' },
                { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', providerName: 'OpenAI (Direct)', source: 'direct' },
                { id: 'gemini/gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google', providerName: 'Google Gemini (Direct)', source: 'direct' },
                { id: 'gemini/gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'google', providerName: 'Google Gemini (Direct)', source: 'direct' }
            ];

            return [...directModels, ...mappedOpenRouter];
        } catch (error) {
            console.error('Error listing models in IPC:', error);
            return [];
        }
    });
}
