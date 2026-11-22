<!-- [Diubah oleh Gemini - 2026-11-21] Public English AI-agent manual (AGENTS.md) for Office AI V16 -->
# AGENTS.md — AI Agent Reference & Adaptation Guide (Office AI)

This document is written for AI coding agents (**Claude Code**, **Codex**, **Gemini / Antigravity**, **OpenCode**, **Hermes**, and custom assistants) working on or adapting **Office AI** for its owner.

---

## 1. Repository Map (File -> Responsibility)

All runtime source files intentionally live in the repository root (`<office-ai-root>/`) so relative paths stay consistent across `embedded_server.js`, `pack.js`, `repack.py`, `hook_send.py`, and `office_event.py`. Do not move root runtime files without updating `pack.js` (`RUNTIME_FILES`) and every loader.

### Desktop Shell, Server & Discovery
| File | Responsibility |
|---|---|
| `main.js` | Electron main process: single-instance lock, starts `embedded_server.js`, blocks non-loopback navigation/network requests, supports `--office-workspace`, `--office-qa`, and safe `office:pick-folder` IPC. |
| `preload.js` | Minimal `contextBridge` (`window.officeDesktop = { isElectron: true, pickFolder }`). |
| `embedded_server.js` | Local HTTP/SSE server (`127.0.0.1:8770..8775`), strict `Host`/`Origin`/`Sec-Fetch-Site`/CSP guards, per-run 32-byte `X-Office-Token`, static allowlist `PUBLIC`, and REST routes (`/state`, `/events`, `/event`, `/flow/state`, `/flow/hooks/*`, `/settings`, `/setup/*`, `/quality/*`, `/learnings/*`, `/reports/*`, `/pricing`, `/usage/daily`, `/collector/status`, `/vault/*`, `/mt5/*`, `/finance/*`, `/workflows/*`, `/short/*`, `/youtube/*`, `/prompt/*`). |
| `workspace_discovery.js` | Tiered read-only workspace & dashboard auto-discovery: saved config -> env (`OFFICE_AI_PROJECT`, `OFFICE_AI_DASHBOARD`) -> walk-up/siblings -> bounded drive/home scan (time/depth capped, ignore list, `OFFICE_AI_NO_DRIVE_SCAN=1` opt-out). Never auto-selects when `> 1` candidates match (`needsConfirmation: true`). |

### Backend Stores & Local Bridges
| File | Responsibility |
|---|---|
| `office_data.js` | Atomic persistence for `<dataDir>/state.json`, `pricing.json`, `config.json`; daily token deltas, multi-currency cost estimation (prefix/tier matcher), read-only Obsidian Vault browser, opt-in daily summary sync (`Kantor/YYYY-MM-DD.md`). |
| `collector.js` | Read-only local session log scanner for Claude Code, Codex, Gemini/Antigravity, and Hermes (disable with `OFFICE_COLLECTOR=0`). |
| `settings_store.js` & `office_settings.js` | Schema validation and atomic storage for `<dataDir>/settings.json` (language, theme, currency, shortcuts, furniture layout, 12-slot persona roster). |
| `quality_store.js` | 3-round QA quality workflow state machine (`persona_call`, `submit`, `inspect_start`, `verdict`, `revise`, `learn`, `escalate`) -> `<dataDir>/quality.json`. |
| `personas.json` & `persona_schema.js` | Default 10 specialist personas and shared client/server validator (max 12 slots). |
| `short_pipeline.js` & `short_process_runner.py` | Real 8-stage Video Short pipeline (`idea`, `script`, `audio`, `scene`, `render`, `qa`, `metadata`, `upload`) with 3 human gates (`G1` script, `G2` QA/video preview, `G3` explicit upload confirmation), channel discovery (`Tools/youtube/channels.json` or `Channels/*` fallback), `inspectTools()` pre-run check, and isolated child-process execution. |
| `short_workflow_store.js` | Shared workflow configuration (`localProjectDir`, `dashboardDir`, `defaultChannel`, `geminiModel`), Demo 6-stage workflow store, workspace rule sync, and isolated BYOK secret storage (`<dataDir>/secrets_local.json`). |
| `youtube_dashboard_host.js` | Lifecycle host for an external or separate-repo YouTube Studio Manager (`Tools/dashboard/server.py`, `dashboard/server.py`, or standalone `server.py`). Attaches to already-running servers (`managedByOffice: false`), never kills servers it did not start, exposes non-secret summary/login warnings/comment alerts, and stores zero OAuth tokens. |
| `youtube_analytics_store.js` | Legacy daily YouTube snapshot archive (`<dataDir>/yt_snapshots/YYYY-MM-DD.json`) preserved read-only alongside the embedded dashboard. |
| `agent_prompt_store.js` | Direct local CLI prompt runner for 6 providers (`claude`, `codex`, `antigravity`, `opencode`, `hermes`, `gemini-api`), model/effort catalog, connection test, safe `windowsHide: true` spawning (no shell interpolation), `Secrets`/`.git` cwd rejection, live SSE output streaming (`prompt_run_chunk`), and 50-run history. |
| `mt5_readonly_bridge.py` & `mt5_finance_store.js` | Strictly read-only MetaTrader 5 monitor (`account_info`, `positions_get`, `history_deals_get`), HTTP 403 write/credential guard (`assertReadOnlyPayload`), deduplicated closed-deal booking, trading analytics + CSV export, demo simulator, and honest `0`-balance multi-source office ledger. |
| `hook_send.py`, `office_hook_codex.py`, `office_hooks.py`, `office_event.py` | Stdlib Python hooks (`<0.5s`, always `exit 0`, loopback-only) for Claude Code and Codex CLI, safe backup-and-merge hook installer CLI (`status`/`preview`/`install`/`uninstall`), and cross-provider CLI event sender. |
| `office_flow_model.js` & `office_flow_map.json` | Pure bounded UMD live-flow projection model (no DOM/Three.js/IO) and high-contrast provider/persona color+pattern palette & subagent-type mapping defaults. |
| `personas/*` & `.claude/skills/office-ai-persona-builder/SKILL.md` | Portable specialist persona templates (`_template/`), reference personas (`code-reviewer`, `technical-writer`, `reality-checker`), SHA-256 `MANIFEST.json`, stdlib CLI tools (`new_persona.py`, `validate_persona.py`, `export_persona.py`, `persona_run.py`), and project skill for building/applying personas. |

### 3D World, Frontend UI & Localization
| File | Responsibility |
|---|---|
| `furniture.js`, `specialist_wing.js`, `chars.js` | 48×32 m + West Terrace voxel office geometry (10 zones, instanced `batchFurniture` keeping `drawCalls <= 340`), 12 specialist desks, dynamic canvas boards, and animated voxel actors. |
| `layout_catalog.js`, `layout_rules.js`, `office_layout.js` | Movable furniture catalog, collision/wall/zone rules (`0.5 m` grid `usePoints`), and interactive 3D layout editor. |
| `office.js`, `office_flow3d.js` & `office_specialists.js` | Three.js (`vendor/three.min.js`) render loop, pooled overhead 3D flow-line & return-packet renderer (`window.OfficeFlow`, `<=340` draw calls, non-blocking seated Secretary), camera presets, A* half-unit pathfinding, idle routines, specialist choreography, and `window.officeQA` test hooks. |
| `index.html`, `office_ui.css`, `office_v12.css`, `office_short.css`, `office_flow.css` | Editorial light/dark/RTL UI shell, dialogs, accessible pattern swatches, and responsive styles. |
| `office_flow_ui.js` | Live Flow panel ("Alur") — active/recent delegation trees, real-time vs delayed source badges, provider filter, pause/resume toggle, collapsible color+pattern legend, and hook onboarding empty state. |
| `office_setup_ui.js` | Setup Center ("Start here") — auto-opens on first live launch, 6 real-status checklist cards, dynamic Recommended Next Step, one-time Full Access risk notice, inline project/dashboard/API/preferences actions, and explicit preview-then-confirm **Office AI Hooks** manager (`/flow/hooks/*`). |
| `office_short_ui.js` | Video Studio panel — channel/format selector, empty-state setup guide, 8-stage pre-run tool summary, live stage log, G1 script editor, G2 video/QA viewer, G3 manual upload confirmation. |
| `office_youtube_ui.js` | Embedded full-panel YouTube Studio Manager iframe, 7-page quick nav, HUD status pill, login-warning banner, and empty/offline setup guide with separate `dashboardDir` config. |
| `office_v12_ui.js`, `office_v13_ui.js`, `office_panels.js`, `office_settings_ui.js` | MT5 & Finance + Trading Analytics panel, AI Agent Prompt panel (model/effort/cwd/streaming console), Report Tray, Token/Pricing bank, Obsidian Vault viewer, Settings modal. |
| `i18n.js`, `i18n_ready.js`, `locales/*.json` | 6-language localization (`en`, `id`, `es`, `ja`, `zh-CN`, `ar` RTL) + `xx-pseudo`. |
| `pack.js` & `repack.py` | Explicit `RUNTIME_FILES` manifest and deterministic desktop packager (`Aplikasi/OfficeAI-win32-x64/OfficeAI.exe`). |

---

## 2. Architecture & Data Flow

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for full diagrams.

- **Process Topology:** Electron `main.js` (optional desktop shell) starts `embedded_server.js` in-process on `127.0.0.1:8770..8775` and opens `http://127.0.0.1:<port>/`. Browser/dev mode runs `node embedded_server.js` directly without Electron.
- **Event & State Loop:** External CLI hooks (`hook_send.py`, `office_hook_codex.py`, `office_event.py`), `collector.js`, MT5 polling, Short pipeline stages, YouTube dashboard polling, and direct Prompt runs mutate their stores and broadcast `event: office-event` (plus `flow_event` envelopes for collector-superseded hook lifecycles) over `/events` (SSE). `office.js`, `office_flow3d.js`, and UI panels subscribe to SSE to project real delegation trees (`Boss -> Secretary -> Agent -> Personas -> Return`) in `<=500 ms` without waiting on character walking (`settings.flow16.walkAnimation`, default `fast`).
- **User Data Storage (`<dataDir>`):**
  - Priority: `OFFICE_AI_DATA_DIR` -> `OFFICE_DATA_DIR` -> Electron `%APPDATA%/OfficeAI/data/` (or `<root>/runtime/OfficeAI/data/` with `--office-workspace`) -> `<root>/data/` in Node dev mode.
  - Active port is written to `<dataDir>/port.txt` (overridable via `OFFICE_PORT`).
  - Secrets (`geminiApiKey`, `youtubeApiKey`) live ONLY in `<dataDir>/secrets_local.json` and are always masked (`...XXXX`) in `GET` responses.

---

## 3. Commands: Install, Run, Test & Build

```bash
# Install Electron dev dependencies (optional; Node server mode needs zero npm packages)
npm install

# Run in local browser/server mode (Node >= 18, zero npm install required)
node embedded_server.js

# Run in isolated test data directory (never touches real user data)
OFFICE_AI_DATA_DIR=./tmp-data OFFICE_COLLECTOR=0 node embedded_server.js

# Syntax check & Python compile
node --check embedded_server.js office.js workspace_discovery.js short_pipeline.js office_setup_ui.js office_short_ui.js office_youtube_ui.js office_v12_ui.js office_v13_ui.js
python -m py_compile mt5_readonly_bridge.py hook_send.py office_event.py short_process_runner.py repack.py

# Mandatory i18n audit across all 6 locales (must return "ok": true)
node qa/i18n_audit.cjs

# Regression & onboarding test suites (each spawns an isolated random-port server)
node qa/v7_api_test.cjs
node qa/v10_store_test.cjs
node qa/v10_api_test.cjs
node qa/v12_full_test.cjs
node qa/v13_full_test.cjs
node qa/v14_short_test.cjs
node qa/v14_youtube_agents_test.cjs
node qa/v15_onboarding_test.cjs
node qa/v15_orphan_test.cjs
node qa/v16a_model_test.cjs
node qa/v16_ui_test.cjs
node qa/v16_flow_test.cjs

# Rebuild packaged desktop app (Windows, when requested by owner/coordinator)
python -I repack.py
```

---

## 4. Coding Conventions

1. **6-Language i18n Required:** Every user-visible UI string must use `t('namespace.key')` and exist in all 6 files under `locales/{en,id,es,ja,zh-CN,ar}.json`. Run `node qa/i18n_audit.cjs` and require `ok: true` with `0` unmapped literals and `0` key/placeholder errors.
   - Note: In audited UI files (listed in `qa/i18n_literals.cjs`), pass CSS class lists as single-token arrays (e.g., `['v12-pill', 'pos']`) or `classList.add(...)` so multi-word strings are not flagged as unmapped human text.
2. **Targeted Edits Over Full Rewrites:** Make minimal, surgical edits to large files (`embedded_server.js`, `office.js`, `office_v12_ui.js`, `office_v12.css`). Keep existing DOM IDs and API fields backward-compatible for QA tests.
3. **3D Performance Budget:** Keep `drawCalls <= 340` by batching static meshes through `batchFurniture(root)` in `furniture.js` and avoiding overlapping rugs (`>= 0.3 m` AABB separation) or invalid `usePoints` (must sit on `0.5 m` navigable grid).
4. **Register New Runtime Files:** Any new `.js`, `.css`, `.html`, `.py`, or `.json` file needed at runtime MUST be added to `RUNTIME_FILES` in `pack.js` and static `PUBLIC` allowlist in `embedded_server.js` (if served to browser).
5. **Test Before Finishing:** Always run syntax checks, `node qa/i18n_audit.cjs`, and relevant `qa/*_test.cjs` suites after edits.

---

## 5. Hard Safety Boundaries (Non-Negotiable)

1. **Never Read, Log, or Commit Secrets:** Never inspect, copy, print, or commit `Secrets/`, `secrets_local.json`, OAuth tokens, or API keys. Keep public code, docs, tests, and locales free of personal paths, usernames, emails, or private channel names.
2. **MT5 Strictly Read-Only:** Never add order execution (`order_send`, `order_check`), position modification, or password inputs to `mt5_readonly_bridge.py` or server routes. Preserve the HTTP `403` guard (`assertReadOnlyPayload`) and honest `0` initial finance ledger balance.
3. **Human-Gated Publishing Only:** Video Studio MUST never auto-upload to YouTube. Preserve `G1` (script), `G2` (QA/preview), and `G3` (explicit confirmation before upload) gates, and keep `autoApprove: false`.
4. **Workspace Isolation:** Never modify files inside an owner's external project folder (`localProjectDir`) unless the owner explicitly runs an action or gives permission. Always block `Secrets`, `.git`, symlinks, and path traversal (`..`).
5. **Never Launch/Kill `OfficeAI.exe` From Automated Sandboxes:** Do not run or kill `OfficeAI.exe`/Electron in headless tests — always test against `embedded_server.js` on an isolated temp `OFFICE_AI_DATA_DIR` and free port (`port: 0`).

---

## 6. How to Adapt Office AI to the Owner's Wishes

When the owner asks you to customize Office AI for their personal workflow, follow this 5-step procedure:

1. **Interview the Owner (Short & Specific):**
   Ask only what is not yet known:
   - What content channels / project folders or non-video workflows do they run?
   - Which AI agent CLIs or API keys do they actually use (`claude`, `codex`, `agy`, `opencode`, `hermes`, Gemini BYOK, or another CLI)?
   - Preferred language, currency, light/dark theme, and optional integrations (YouTube Studio Manager, MetaTrader 5 read-only, Obsidian Vault)?
   - Any custom specialist personas, office zones, or visual styling changes they want?
2. **Map Wishes to Extension Points:**
   Consult [`docs/EXTENDING.md`](docs/EXTENDING.md) to match each request to its exact files (e.g., `personas.json` for personas, `agent_prompt_store.js` for new CLI providers, `short_pipeline.js` for channel adapters/stages, `pricing.json` for tariffs, `furniture.js` + `layout_catalog.js` for 3D props/zones, `locales/*.json` for languages).
3. **Implement Using Existing Patterns:**
   - Reuse existing stores, SSE event patterns, `X-Office-Token` auth, and `workspace_discovery.js`.
   - Keep owner-specific paths and credentials in `<dataDir>` configuration (`short_workflows.json`, `settings.json`, `config.json`, `secrets_local.json`), NOT hardcoded in source files, if the owner plans to publish or share their fork.
   - Update all 6 locale files for any new UI text.
4. **Verify Thoroughly:**
   - Run `node --check` on changed JS files and `python -m py_compile` on changed Python files.
   - Run `node qa/i18n_audit.cjs` (`ok: true`).
   - Run the affected `qa/*_test.cjs` suites (plus `qa/v15_onboarding_test.cjs`) and verify `drawCalls <= 340` and `0` console errors.
   - If the owner uses the packaged desktop app, rebuild with `python -I repack.py` (only when allowed by the owner).
5. **Document Changes Clearly:**
   - Summarize modified files, new configuration keys, and how to use/revert each customization in plain language (matching the owner's preferred language).

---

<!-- [Diubah oleh Gemini - 2026-11-22] Section 7: Personas build and apply procedure for AI agents -->
## 7. Personas: Build and Apply to Your AI

When the owner asks you to **create a new specialist persona** or **apply an Office AI persona to their AI runtime** (Claude Code, Codex CLI, Gemini / Antigravity, OpenCode, Hermes, or generic LLMs), read [`docs/PERSONAS.md`](docs/PERSONAS.md) ([Bahasa Indonesia](docs/PERSONAS.id.md)) and follow this procedure:

1. **Interview the Owner (4–6 Short Questions):** Confirm the specialist's role title, slug `id` (`^[a-z0-9-]{1,32}$`), Office AI department (`engineering | design | qa | content | docs`), mandatory deliverable format, safety/scope prohibitions, whether to occupy one of the 12 3D office desk slots (`personas.json`), and target AI runtime(s).
2. **Scaffold with Repository Tools (Python 3.9+ stdlib, zero `pip`):**
   ```bash
   python -I personas/new_persona.py <id> --role "<Role Title>" --department <dept> --engine <claude|codex|gemini|hermes|opencode|other>
   ```
3. **Customize the 4 Persona Artifacts (`personas/<id>/`):**
   - `persona.md`: Must keep all 6 required headings in order (`## Role & Identity`, `## Scope & Boundaries`, `## Working Principles`, `## Strict Output Contract`, `## Collaboration & Escalation`, `## Safety Prohibitions` including zero-secret access and `<UNTRUSTED_TASK_DATA>` boundary).
   - `checklist.md`: At least 5 Yes/No items (`- [ ] **[CHK-01]** ... *(Evidence: ...)*`) used by the Quality Manager (up to 3 rounds before escalation to Boss), including `CHK-05` prompt-injection defense.
   - `learnings.md`: Preserve `<!-- office-ai-learnings: v1 -->`. Never auto-append lessons; learnings enter only after human approval in Office AI's Learning Cabinet.
   - `evals/*.json`: At least 4 rubric-based evaluation JSON cases (core task, ambiguous edge case, out-of-scope boundary refusal, and prompt-injection defense).
4. **Validate Structure, Safety & Update `personas/MANIFEST.json`:**
   ```bash
   python -I personas/validate_persona.py <id>
   python -I personas/validate_persona.py --update
   python -I personas/validate_persona.py --all --check
   ```
5. **Register in Office AI & Export Native Agent Files:**
   ```bash
   # Optional: preview and register in personas.json (max 12 slots; pass --replace-slot <old-id> if full)
   python -I personas/new_persona.py <id> --role "<Role Title>" --department <dept> --engine <engine> --preview
   python -I personas/new_persona.py <id> --role "<Role Title>" --department <dept> --engine <engine> --register --force

   # Export to native runtime files (claude -> .claude/agents/<id>.md, codex, gemini, opencode, hermes, generic, or all)
   python -I personas/export_persona.py <id> --target all --out personas/_exports/<id>
   ```
6. **Test Prompt Assembly & Fake-Agent Loop:**
   ```bash
   python -I personas/persona_run.py --persona <id> --task "Sample verification task" --dry-run
   python -I personas/persona_run.py --persona <id> --task "Sample verification task" --agent fake --no-office
   ```
   *(Claude Code automatically discovers [`.claude/skills/office-ai-persona-builder/SKILL.md`](.claude/skills/office-ai-persona-builder/SKILL.md); other AI agents can also use [`docs/prompts/BUILD_PERSONA_PROMPT.md`](docs/prompts/BUILD_PERSONA_PROMPT.md).)*

