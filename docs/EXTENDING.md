<!-- [Diubah oleh Gemini - 2026-11-21] Step-by-step customization & extension recipes for Office AI -->
# Extending & Customizing Office AI

Each recipe below lists the exact files to edit, key constraints to respect, and a real verification command. Always run `node qa/i18n_audit.cjs` after adding any user-visible string.

---

## 1. Add a Specialist Persona

<!-- [Diubah oleh Gemini - 2026-11-22] Updated Add a Specialist Persona recipe to use personas/ CLI tools and docs/PERSONAS.md -->
Full end-to-end guide (including owner interview, prompt-injection safety rules, and native export to Claude Code, Codex, Gemini, OpenCode, and Hermes): [`docs/PERSONAS.md`](PERSONAS.md) ([Bahasa Indonesia](PERSONAS.id.md)).

**Files touched:**
- `personas/<id>/{persona.md,checklist.md,learnings.md,evals/*.json}` (specialist definition, Yes/No Quality Manager checklist, controlled learnings, and `>= 4` rubric evaluations)
- `personas/MANIFEST.json` (SHA-256 integrity hashes updated via `personas/validate_persona.py --update`)
- `personas.json` (default 3D office roster, up to 12 slots total)
- Optional: `persona_schema.js` (only if adding a new department or outfit/accessory enum)
- Optional: UI live edit via **Settings -> Office agents -> Personas** (saves directly to `<dataDir>/settings.json` without touching code)

**Steps:**
1. Scaffold the persona from `personas/_template/` and preview its `personas.json` entry:
   ```bash
   python -I personas/new_persona.py <id> --role "<Role Title>" --department <engineering|design|qa|content|docs> --engine <claude|codex|gemini|hermes|opencode|other>
   python -I personas/new_persona.py <id> --role "<Role Title>" --department <dept> --engine <engine> --preview
   ```
2. Customize `personas/<id>/persona.md` (6 required sections), `checklist.md` (`>= 5` Yes/No items with `Evidence:`), and `evals/*.json` (`>= 4` cases).
3. Validate structure/safety, update `personas/MANIFEST.json`, optionally register in `personas.json` (keep total personas `<= 12`; pass `--replace-slot <old-id>` if all 12 slots are full), and export native files for your AI runtime:
   ```bash
   python -I personas/validate_persona.py <id>
   python -I personas/validate_persona.py --update
   python -I personas/export_persona.py <id> --target all
   ```

**Verification test:**
```bash
python -I personas/validate_persona.py --all --check && node qa/v23_persona_tools_test.cjs && node qa/v10_store_test.cjs && node qa/v10_api_test.cjs
```

---

## 2. Add a CLI Agent Provider + Models

**Files touched:**
- `agent_prompt_store.js` (add provider entry to `AGENT_SPECS`, command builder in `buildSpawnSpec()`, model catalog in `MODEL_CATALOG`, optional health probe)
- `office_v13_ui.js` (if provider needs custom badge/status rendering)
- `locales/{en,id,es,ja,zh-CN,ar}.json` (any new labels/hints)

**Steps:**
1. Register the CLI executable name, install hint, default model, and full-access vs safe-mode flags in `agent_prompt_store.js`.
2. Always spawn via `child_process.spawn(exe, args, { windowsHide: true, shell: false })` (never concatenate prompts into shell strings) and enforce `assertSafeCwd(cwd)` so `Secrets` and `.git` stay blocked.
3. Exclude low-quality tiers if the owner requires specific model constraints.

**Verification test:**
```bash
node --check agent_prompt_store.js office_v13_ui.js && node qa/i18n_audit.cjs && node qa/v14_youtube_agents_test.cjs
```

---

## 3. Add a New UI Panel

**Files touched:**
- `office_<feature>_ui.js` (new UI module exposing `window.Office<Feature>UI = { create(opts) { ... } }`)
- `index.html` (menu/sidebar trigger button + `<script src="office_<feature>_ui.js"></script>` before `office.js`)
- `office.js` (instantiate controller, wire `openPanel('<feature>')`, call `close()` inside `closeAllPanels()` and `#panel` `close` listener)
- `embedded_server.js` (add `'office_<feature>_ui.js'` to static `PUBLIC` allowlist)
- `pack.js` (add `'office_<feature>_ui.js'` to `RUNTIME_FILES`)
- `qa/i18n_literals.cjs` (optional: add file to audited list) + `locales/*.json` (all 6 languages)

**Steps:**
1. Pass `X-Office-Token` from `meta[name="office-vault-token"]` on all `POST`/`PUT`/`DELETE` requests.
2. Render text with `textContent` (never `innerHTML` with untrusted strings) and localize every visible label with `t('namespace.key')`.
3. In audited UI files, pass multi-class names as arrays (`['v12-pill', 'pos']`) or via `classList.add()` so `i18n_audit.cjs` does not flag CSS strings as unmapped text.

**Verification test:**
```bash
node --check office_<feature>_ui.js office.js embedded_server.js && node qa/i18n_audit.cjs && node qa/v15_onboarding_test.cjs
```

---

## 4. Add an Office Furniture Item or Zone

**Files touched:**
- `furniture.js` (3D voxel geometry builder; batch static parts via `box()`/`cyl()` -> `batchFurniture(root)`)
- `layout_catalog.js` (movable item metadata, footprint, `usePoints`, allowed zones)
- `layout_rules.js` (bounds validation for `48×32 m + West Terrace`: `x: -28..24, z: -16..16`)
- `locales/*.json` (`objects.*`, `objectsNav.*`, or `v12.preset*` keys across 6 locales)

**Steps:**
1. Keep every static sub-mesh batched in `batchFurniture(root)` so total scene `drawCalls <= 340`.
2. Ensure rugs keep `>= 0.3 m` AABB separation (zero rug overlap / Z-fighting).
3. Place every interactive `usePoints` coordinate on a `0.5 m` grid cell outside furniture colliders so A* pathfinding reaches it with zero route failures.

**Verification test:**
```bash
node --check furniture.js layout_catalog.js layout_rules.js && node qa/i18n_audit.cjs && node qa/v12_full_test.cjs
```

---

## 5. Add a New Language

**Files touched:**
- `locales/<code>.json` (copy `locales/en.json` and translate all keys, keeping `{placeholder}` tokens intact and providing CLDR plural forms for `counts.*`)
- `locales/index.json` (register `{ "code": "<code>", "name": "...", "dir": "ltr" | "rtl" }`)
- Optional: `office_ui.css` (add `:root:lang(<code>)` font stack if non-Latin script)

**Steps:**
1. `pack.js` reads `locales/index.json` dynamically, so new locale JSON files are included automatically.
2. Verify plural forms and exact placeholder matching across every key.

**Verification test:**
```bash
node qa/i18n_audit.cjs
```

---

## 6. Add a Stage or Channel Adapter in the Video Short Pipeline

**Files touched:**
- `short_pipeline.js` (`STAGES`, `inspectTools()`, `detectChannelTools()`, stage execution handler, gate transitions)
- `office_short_ui.js` (stage labels, plan display, artifact viewer if new artifact type)
- `locales/*.json` (stage titles/descriptions across all 6 languages)

**Steps:**
1. Keep `SAFE_TOOL_SCRIPT_RE` allowlist strict when discovering scripts inside a creator's project folder; never execute arbitrary unchecked paths or read `Secrets/`.
2. Never bypass **G1** (script review), **G2** (video/QA review), or **G3** (explicit human upload confirmation).
3. Update `inspectTools()` so users see honestly before clicking Start which tools exist and which stages will skip or wait.

**Verification test:**
```bash
node --check short_pipeline.js office_short_ui.js && node qa/i18n_audit.cjs && node qa/v14_short_test.cjs && node qa/v15_onboarding_test.cjs
```

---

## 7. Change Token Pricing or Currencies

**Files touched:**
- `pricing.json` (USD per 1M input/output/cached tokens per model + currency rates `usd_idr`, `EUR`, `JPY`, `CNY`)
- `office_data.js` (model prefix/tier matcher `resolveRate()` if adding a new provider family)
- `office_panels.js` / `settings_store.js` (only if adding a new display currency code)

**Steps:**
1. Add exact model keys or family prefixes in `pricing.json` (`resolveRate()` checks exact match -> stripped tier suffix -> longest prefix -> provider default).
2. Keep the **ESTIMATE** disclaimer visible; costs are API-equivalent estimates, not subscription invoices.

**Verification test:**
```bash
node qa/v7_api_test.cjs && node qa/v13_full_test.cjs
```

---

## 8. Add a New Event Type and 3D Reaction

**Files touched:**
- Domain store (e.g., `quality_store.js`, `mt5_finance_store.js`, or `embedded_server.js` `/event` handler)
- `office.js` (`applyEvent()` switch/branch + actor animation/movement + `milestones.push(...)` for QA observability)
- Optional: `office_event.py` (CLI subcommand if triggered from external scripts)

**Steps:**
1. Broadcast the event through `emitOfficeEvent(payload)` in `embedded_server.js` so SSE subscribers receive `event: office-event`.
2. Record a compact milestone in `office.js` (`recordMilestone('my-stage', detail)`) so automated browser tests can verify the 3D reaction deterministically.

**Verification test:**
```bash
node --check embedded_server.js office.js && node qa/v10_api_test.cjs && node qa/v13_full_test.cjs
```

---

## 9. Change Theme or Color Palette

**Files touched:**
- `office_ui.css` (`:root` light variables & `:root[data-theme=dark]` dark variables)
- `office_v12.css` (`--v12-*` semantic status tokens: positive, negative, warning, neutral, primary)
- `office_short.css` (Video Studio paper/ink accents)

**Steps:**
1. Override CSS custom properties (`--paper`, `--surface`, `--ink`, `--muted`, `--accent`, `--line`) in both light and dark blocks to maintain WCAG contrast.
2. Check RTL (`dir="rtl"`) and dark mode rendering across dialogs.

**Verification test:**
```bash
node qa/i18n_audit.cjs && node qa/v14_short_browser.cjs
```

---

## 10. Add a New Local Data Source

**Files touched:**
- `<source>_store.js` (new store reading/writing `<dataDir>/<source>.json` atomically via temp file + rename)
- `embedded_server.js` (instantiate store, expose `GET`/`POST` routes, enforce `X-Office-Token` on all mutating routes)
- `pack.js` (register `<source>_store.js` in `RUNTIME_FILES`)
- Optional UI module + `locales/*.json`

**Steps:**
1. Store all user data inside `dataDir` (never inside the repo root) and isolate any API keys inside `<dataDir>/secrets_local.json` (masked on `GET`).
2. Add a targeted test in `qa/` using an isolated `fs.mkdtemp` data dir and `port: 0`.

**Verification test:**
```bash
node --check <source>_store.js embedded_server.js && node qa/v7_api_test.cjs
```

---

## 11. Add a New Live Flow Event Source

**Files touched:**
- External script or bridge (e.g., a new CLI hook modeled after `hook_send.py` / `office_hook_codex.py`, or a server adapter in `embedded_server.js`)
- `office_flow_model.js` (only if introducing a brand-new `source` identifier beyond `hook | panel | pipeline | log`)

**Steps:**
1. Send loopback-only `POST /event` JSON payloads (never full prompts, shell output, or credentials; keep `taskTitle <= 120` chars, timeout `<= 1 s`, silent `exit 0` when Office AI is stopped).
2. Always include a stable `flow_id` (turn/task correlation), `event_id` (deduplication), `provider`, `session`, `agent`, `type` (`call | spawn | retire | report`), and epoch ms `at`.
3. Never invent fake subagents: emit `spawn`/`retire` only when a real subagent or specialist persona starts/stops; mark polling/log-derived signals with `source: 'log'` (automatically flagged `estimated: true`).

**Verification test:**
```bash
node qa/v16a_model_test.cjs && node qa/v16a_transport_test.cjs && node qa/v16_flow_test.cjs
```

---

## 12. Add an Agent Provider to the Live Flow Palette

**Files touched:**
- `office_flow_map.json` (`providers` and optional `providerAliases`)
- `locales/{en,id,es,ja,zh-CN,ar}.json` (`flow16.provider.<id>`)
- `office_flow_ui.js` (append `<id>` to `PROVIDERS` filter list if desired)

**Steps:**
1. Pick a high-contrast hex color that meets `>= 3:1` geometry contrast against BOTH `#ffffff` (light) and `#111827` (dark), and pair it with a line pattern (`solid`, `dashed`, or `dotted`).
2. Add any CLI/tool alias names to `providerAliases` in `office_flow_map.json` (for example `"my-cli": "myprovider"`).
3. Add localized labels to all 6 files under `locales/`.

**Verification test:**
```bash
node qa/v16a_model_test.cjs && node qa/i18n_audit.cjs && node qa/v16_ui_test.cjs
```

---

## 13. Customize Subagent-to-Persona Mapping Rules

**Files touched:**
- **No code edit needed (recommended):** Open **Settings -> Flow -> Subagent type -> Persona mapping**, edit any default row or add custom lowercase subagent types (up to 64 overrides, stored in `<dataDir>/settings.json` under `flow16.subagentTypes`), or click **Restore flow defaults**.
- **Repository defaults:** Edit `subagentTypes` inside `office_flow_map.json` to change the built-in mapping shipped to new users.

**Steps:**
1. Use lowercase keys matching the real `agent_type` / `subagent_type` emitted by your CLI hooks (1–48 chars, `[a-z0-9 _.-]`, no `..` or prototype keys).
2. Map each key to a valid persona ID from `office_flow_map.json` (`general`, `researcher`, or any of the specialist roster personas). Unmapped types always fall back cleanly to `general`.

**Verification test:**
```bash
node qa/v16a_model_test.cjs && node qa/v16_ui_test.cjs
```

---

## 14. Customize Live Flow Line Colors & Accessibility Patterns

**Files touched:**
- `office_flow_map.json` (`roles`, `providers`, `personas`, `contrast`)
- Optional UI overrides: `office_flow.css`

**Steps:**
1. Update hex colors and `"pattern"` (`"solid" | "dashed" | "dotted"`) in `office_flow_map.json`. Both `office_flow3d.js` (3D lines & return packets) and `office_flow_ui.js` (panel swatches & legend) read the same map automatically.
2. Verify every color maintains `>= 3:1` contrast on both `#ffffff` and `#111827` (automatically enforced by `qa/v16a_model_test.cjs`). Always keep text labels in theme text colors (`--ink` / `--muted`), never raw line hex colors.

**Verification test:**
```bash
node qa/v16a_model_test.cjs && node qa/v16_ui_test.cjs && node qa/v16_flow_test.cjs
```

<!-- [Diubah oleh Codex - 2026-11-22] V21 prevention suite -->
## 15. Preserve Physical Subagent Endpoints / Pertahankan Ujung Subagen

Keep `agent`, `parent`, `session` and the optional `flow_id` stable across start/stop events. Supply `agent_type` for a real observed type; an empty type still receives a general worker. Do not derive worker identities from persona IDs: two simultaneous `Plan` children must remain distinct, and a busy mapped specialist needs a temporary worker.

The host's flow bindings own the temporary lifecycle and share the existing eight-worker pool. Reuse the door, `project-*` desks, navigation, actor batching, and step-distance animation. A missing desk may use a navigable standing point. Pool/entrance overflow must use the leader's physical head and an expandable `+N` badge. Do not restore the former lateral-offset virtual anchor. New renderer changes must retain its missing-anchor recovery check.

Jaga ID anak/induk/sesi tetap sama sepanjang lifecycle. Jenis kosong atau tak dikenal tetap mendapat pekerja; persona yang sibuk tidak boleh dipakai dua anak sekaligus. Jika pool/pintu sibuk, gunakan kepala induk dan lencana `+N`, lalu tampilkan semua anak pada pohon Alur. Jangan mengembalikan jangkar melayang tanpa aktor. Uji harus memeriksa matriks mesh aktual dan proyeksi layar, serta memastikan pekerja keluar setelah selesai.

Add these commands to the regular live-flow regression checks (run browser suites sequentially and honor all `qa/*browser.lock` files):

```bash
node qa/v21_renderer_test.cjs
node qa/v21_sources.cjs
node qa/v21_subagent_test.cjs
node qa/v16a_model_test.cjs
node qa/v16_flow_test.cjs
node qa/v16_ui_test.cjs
node qa/v18_beam_test.cjs
node qa/v19_archive_test.cjs
node qa/v10_browser_test.cjs
node qa/v7_browser_test.cjs
node qa/v13_full_test.cjs
node qa/v12_full_test.cjs
node qa/i18n_audit.cjs
```

The V21 browser suite uses isolated fixture roots and a private Chromium profile, checks 42 deterministic randomized scenarios plus fixed edge cases, and never needs a paid agent, a global hook install, a real MT5 connection, or a YouTube mutation. Gemini/Hermes cases use synthetic databases through the production collector; OpenCode exercises an explicit observed log envelope because no native collector is currently implemented for it.
