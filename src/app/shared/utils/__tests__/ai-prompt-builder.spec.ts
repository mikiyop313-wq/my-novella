import { buildPromptSection } from '../ai-prompt-builder';

describe('AI prompt builder', () => {
  it('wraps content in a named prompt section', () => {
    expect(buildPromptSection({ name: 'SCENE PROSE', content: 'A storm gathered.' })).toBe([
      '--- BEGIN SCENE PROSE ---',
      'A storm gathered.',
      '--- END SCENE PROSE ---',
    ].join('\n\n'));
  });
});
