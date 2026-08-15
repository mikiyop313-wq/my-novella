export interface PromptSection {
  name: string;
  content: string;
}

export function buildPromptSection(section: PromptSection): string {
  return [
    `--- BEGIN ${section.name} ---`,
    section.content,
    `--- END ${section.name} ---`,
  ].join('\n\n');
}
