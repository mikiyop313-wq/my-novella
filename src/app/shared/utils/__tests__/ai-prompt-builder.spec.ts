import { buildAiPrompt, buildPromptSection } from '../ai-prompt-builder';

describe('AI prompt builder', () => {
  it('wraps content in a named prompt section', () => {
    expect(buildPromptSection({ name: 'SCENE PROSE', content: 'A storm gathered.' })).toBe([
      '--- BEGIN SCENE PROSE ---',
      'A storm gathered.',
      '--- END SCENE PROSE ---',
    ].join('\n\n'));
  });

  it('builds ordered sections and derives the fallback prompt from the final user message', () => {
    const aiPrompt = buildAiPrompt({
      requestType: 'codexDetection',
      messages: [{
        role: 'user',
        parts: [
          { type: 'section', name: 'EXISTING', content: 'Mara' },
          { type: 'section', name: 'PROSE', content: 'Mara entered.' },
        ],
      }],
    });

    expect(aiPrompt.systemPromptCategory).toBe('codexDetection');
    expect(aiPrompt.messages).toEqual([{ role: 'user', content: aiPrompt.prompt }]);
    expect(aiPrompt.prompt.indexOf('BEGIN EXISTING')).toBeLessThan(
      aiPrompt.prompt.indexOf('BEGIN PROSE'),
    );
  });

  it('preserves conversation order while omitting blank parts and messages', () => {
    const aiPrompt = buildAiPrompt({
      requestType: 'chat',
      messages: [
        { role: 'user', parts: [{ type: 'text', content: 'First question' }] },
        { role: 'assistant', parts: [{ type: 'text', content: 'First answer' }] },
        { role: 'user', parts: [{ type: 'section', name: 'EMPTY', content: '  ' }] },
        { role: 'user', parts: [{ type: 'text', content: 'Final question' }] },
      ],
    });

    expect(aiPrompt.messages).toEqual([
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: 'First answer' },
      { role: 'user', content: 'Final question' },
    ]);
    expect(aiPrompt.prompt).toBe('Final question');
  });

  it('rejects a prompt without a non-empty user message', () => {
    expect(() => buildAiPrompt({
      requestType: 'chat',
      messages: [{ role: 'assistant', parts: [{ type: 'text', content: 'Answer' }] }],
    })).toThrow('AI prompt requires at least one non-empty user message.');
  });
});
