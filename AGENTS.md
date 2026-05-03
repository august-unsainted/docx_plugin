# GOSTify — Obsidian plugin

Plugin ID: `gostify-plugin`. Auto-formats academic papers (курсовые, дипломы) per GOST standards and exports to DOCX. Includes AI text generation via OpenRouter/Groq.

## Build & verify commands

```bash
npm install          # install deps
npm run dev          # esbuild watch (inline sourcemaps, unminified)
npm run build        # tsc -noEmit -skipLibCheck THEN esbuild production (minified, no sourcemaps)
npm run lint         # eslint with eslint-plugin-obsidianmd
```

**Verification order:** lint → build (build already runs tsc first, so a passing build implies typecheck passes).

CI runs on Node 20.x and 22.x: `npm ci && npm run build && npm run lint`.

## Architecture

```
src/
  main.ts          Plugin lifecycle, commands, ribbon icons, status bar, event handlers
  settings.ts      DocxPluginSettings interface, DEFAULT_SETTINGS, SampleSettingTab UI
  docx/
    builder.ts     Assembles docx.Document from parsed markdown
    export.ts      Orchestrates export flow (parse → build → save/open)
    formatting.ts  GOST formatting rules (fonts, spacing, indentation)
    images.ts      Image extraction and embedding
    pageCount.ts   Page count via Word automation (desktop-only)
    parser.ts      Markdown → intermediate structure
    sources.ts     Bibliography/source list handling
    tables.ts      Table parsing and DOCX table generation
  ai/
    client.ts      OpenRouter / Groq HTTP clients
    generator.ts   AI generation orchestration (full/partial)
    prompts.ts     Default system prompts
  editor/
    editorExtension.ts  CodeMirror 6 extension
    utils.ts            Text utilities (case switching, etc.)
```

Entry point: `src/main.ts` → bundled to root `main.js`.

## Key technical facts

- **Bundler:** esbuild (`esbuild.config.mjs`). Output format: CJS, target: es2018.
- **Externalized (not bundled):** `obsidian`, `electron`, `@codemirror/*`, `@lezer/*`, all Node builtin modules.
- **Bundled into main.js:** `docx`, `jszip` — these ship with the plugin.
- **tsconfig:** strict-ish (noImplicitAny, strictNullChecks, noUncheckedIndexedAccess, noImplicitReturns). `baseUrl: "src"` so imports use `src/`-relative paths.
- **ESLint:** uses `eslint-plugin-obsidianmd` recommended + typescript-eslint. Config in `eslint.config.mts` (not `.js`). Lint ignores: `main.js`, `esbuild.config.mjs`, `version-bump.mjs`, `versions.json`.
- **UI language is Russian** — all user-facing strings (commands, notices, settings headings) are in Russian. Keep this convention.
- **No automated tests** — testing is manual only (reload Obsidian, enable plugin).

## Runtime dependencies & network calls

- AI features make HTTP requests to OpenRouter (`openrouter.ai`) or Groq (`api.groq.com`). API keys stored in plugin settings (`data.json`, gitignored).
- Page count feature opens a temp `.docx` in the system's default app (Word) and reads it back — **desktop-only code path** despite `isDesktopOnly: false`.
- `@ts-ignore` used in `main.ts` for internal plugin reload (`app.plugins.disablePlugin/enablePlugin`).

## Version & release

- `npm version patch|minor|major` — bumps `package.json` version, then `version-bump.mjs` syncs `manifest.json` and `versions.json`. Git tag has no `v` prefix (`.npmrc: tag-version-prefix=""`).
- Release tag must match `manifest.json` version exactly (no `v`). Attach `main.js`, `manifest.json`, `styles.css` to GitHub release.

## Gitignore

`main.js`, `data.json`, `*.map`, `node_modules/` are gitignored. Do not commit `main.js` — it's a build artifact uploaded to releases.

## Coding conventions

- TypeScript strict mode. No comments unless asked.
- Settings pattern: interface + DEFAULT_SETTINGS + PluginSettingTab with helper methods (addNumber, addStringDropdown, addToggleSetting).
- Use `this.registerEvent` / `this.registerDomEvent` / `this.registerInterval` for all subscriptions.
- `Packer.toBlob` from `docx` is used for export; `jszip` for reading DOCX archives.
