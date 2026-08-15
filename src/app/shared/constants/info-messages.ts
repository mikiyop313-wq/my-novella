export const INFO_MESSAGES = {
  LIBRARY: {
    AI_CONTEXT: `<span class="info-header">AI Creative Context</span><p>When enabled, the AI will use your <b>book synopsis</b> as part of the creative context for generating text.</p><p>This ensures that the generated prose remains consistent with your established <b>characters, setting, and plot points</b>.</p>`,
    GENRES: `<span class="info-header">Genre Selection</span><p>Select the primary and secondary genres for your book.</p><p>This helps the AI understand the <b>tone</b> and <b>typical tropes</b> associated with your story.</p>`,
    TROPES: `<span class="info-header">Story Tropes</span><p>Tropes are common storytelling patterns.</p><p>Defining them helps the AI hit the right <b>emotional beats</b> and <b>reader expectations</b> for your specific sub-genre.</p>`,
  },
  SETTINGS: {
    PROSE_TENSE: `<span class="info-header">Narrative Tense</span><p>Choose between <b>past</b> and <b>present</b> tense.</p><p>This setting is crucial for the AI to maintain a <b>consistent narrative voice</b> throughout your manuscript.</p>`,
    POINT_OF_VIEW: `<span class="info-header">Point of View</span><p>The narrative perspective (e.g., First Person, Third Person Limited).</p><p>This defines <b>who</b> is telling the story and how much <b>information</b> the reader has access to.</p>`,
  },
  AI_PROMPT: {
    WORD_COUNT: `<span class="info-header">Minimum Word Count</span><p>Set the minimum number of words you want the AI to generate, or select <b>Auto</b> to let the model decide.</p><p>Please be aware that models may not follow the selected minimum exactly. It is recommended that you select between 200 and 5,000 words.</p>`,
    POV: `<span class="info-header">POV Override</span><p>Override the default Point of View for this specific AI generation.</p><p>By default, it will use the book's global narrative perspective settings.</p>`,
    POV_CHARACTER: `<span class="info-header">POV Character Override</span><p>Select which character's perspective this prompt should use.</p><p>Leave empty to use the default book narrator.</p>`,
    VECTOR_SEARCH: `<span class="info-header">Vector Search Context</span><p>Enable or disable semantic manuscript search for this specific prompt.</p><p>When enabled, the AI receives the three most relevant paragraphs from the active book.</p><p>By default, this inherits the global book setting.</p>`,
    REASONING_MODE: `<span class="info-header">Reasoning Mode</span><p>Enable or disable the AI's advanced reasoning mode.</p><p>When enabled, the AI takes more time to "think" before generating text.</p><p><strong>Recommendation:</strong> It is generally recommended to keep this <b>disabled</b> for actual prose generation. Reasoning models excel at logic, outlining, and plotting, but they can be slower and often produce a less creative or overly clinical writing style when writing fiction.</p>`
  },
  CODEX: {
    PROGRESSION: `<span class="info-header">Story Progression</span><p>Progression milestones affect AI generation contexts dynamically.</p><p>Progression will be injected into the AI context only on the <b>current and future scenes</b>.</p><p>If you use the AI in a previous scene, the injection will be ignored.</p>`,
    ALIAS: `<span class="info-header">Aliases</span><p>Add alternative names or titles for this entry.</p><p>Use a <b>comma (,)</b> to separate multiple aliases.</p><p>If an alias is detected in the manuscript, this entry will be injected into the AI context.</p>`
  }
} as const;
