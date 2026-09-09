![My Novella banner](docs/images/banner.png)

# What is My Novella?

My Novella is a desktop app that helps you turn story ideas into a complete manuscript. It brings your writing, outlines, notes, and story references into one workspace, so you can plan your novel and write it chapter by chapter, scene by scene.

You can keep track of your story in a codex, develop scene summaries, and use AI chat and manuscript tools to help brainstorm and draft. Connect your preferred AI provider or use local models through Ollama or LM Studio.

Your book data is stored on your computer. When you're ready to share your work, you can export your manuscript as a Word document, EPUB, PDF, or PNG, and create backups of individual projects or your entire library.

[Download for Windows](https://github.com/mikiyop313-wq/my-novella/releases/latest) | [Report an issue](https://github.com/mikiyop313-wq/my-novella/issues)

## Your story in one workspace

- **Manuscript:** Organize your book into chapters and scenes, write in a rich-text editor, and use AI tools while drafting.
- **Planning:** Develop outlines, scene summaries, and notes alongside your manuscript.
- **Story codex:** Keep reference entries for your story and access them as you write.
- **AI chat:** Work with configurable system prompts, model selection, and reasoning controls for supported models.
- **Semantic search:** Find relevant manuscript content with paragraph indexing and configurable embeddings.
- **Appearance:** Choose Light, Cream, or Dark, and customize typography and layout.
- **Export and backup:** Export manuscripts as DOCX, EPUB, PDF, or PNG, and create project or library backups.

## Get started

Download a Windows x64 build from the [releases page](https://github.com/mikiyop313-wq/my-novella/releases):

- **Installer:** `My-Novella-Setup-<version>.exe`
- **Portable:** `My-Novella-Portable-<version>.exe`

Open My Novella, create a book in your library, and start organizing your manuscript. Configure an AI provider in settings when you want to use the AI tools.

## AI providers

Use your own API keys with **OpenAI, Anthropic, Google Gemini, OpenRouter, or Venice**, or connect to local models through **Ollama or LM Studio**. Available models and reasoning options depend on the provider.

Book data is stored locally. When you use a remote AI provider, prompts and the context included in those requests are sent to that provider.

## Development

Built with Angular, Electron, and TypeScript, with SQLite for local data and LanceDB for vector search.

Use Node.js 22 and npm. The Windows release workflow also uses Node.js 22.

```bash
git clone https://github.com/mikiyop313-wq/my-novella.git
cd my-novella
npm ci
npm run dev
```

Dependency installation applies the repository's patches and rebuilds native dependencies for Electron. `npm run dev` starts the Angular development server and launches the Electron app.

### Build

```bash
npm run build
```

To package Windows x64 builds on Windows:

```bash
npm run dist:win
```

The installer and portable executable are written to `release/`. Use `npm run dist:portable` to build only the portable executable.

### Tests

```bash
npm test -- --watch=false
npm run test:electron
```

These are the Angular and Electron test commands used by the release workflow.
