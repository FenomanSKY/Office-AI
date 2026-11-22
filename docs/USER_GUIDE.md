<!-- [Diubah oleh Gemini - 2026-11-21] Comprehensive English User Guide for Office AI V15 -->
# Office AI — User Guide

This guide explains how to set up, use, and get the most out of every feature in **Office AI**. Every section follows the same six-part pattern: **What it is -> Set up -> Step by step -> Expected result -> Tips to maximize -> Common mistakes**.

- Bahasa Indonesia: [`USER_GUIDE.id.md`](USER_GUIDE.id.md)
- Having an error? Check [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)
- Building or customizing with an AI agent? See [`../AGENTS.md`](../AGENTS.md) and [`EXTENDING.md`](EXTENDING.md)

---

## Table of Contents
1. [Setup Center ("Start here")](#1-setup-center-start-here)
2. [3D Voxel Office & Camera Controls](#2-3d-voxel-office--camera-controls)
3. [Live Task Flow & Hook Installer (Real-Time Overhead Lines)](#3-live-task-flow--hook-installer-real-time-overhead-lines)
4. [Report Tray & Live Activity Hooks](#4-report-tray--live-activity-hooks)
4. [Token Bank & Cost Estimator](#4-token-bank--cost-estimator)
5. [Quality Wing & Specialist Personas](#5-quality-wing--specialist-personas)
6. [Settings & Interactive 3D Layout Editor](#6-settings--interactive-3d-layout-editor)
7. [Video Studio (8-Stage Pipeline & 3 Human Gates)](#7-video-studio-8-stage-pipeline--3-human-gates)
8. [YouTube Dashboard (Embedded Studio Manager)](#8-youtube-dashboard-embedded-studio-manager)
9. [AI Agent Prompt (Local CLI & Gemini BYOK)](#9-ai-agent-prompt-local-cli--gemini-byok)
10. [MetaTrader 5 & Office Finance (Read-Only)](#10-metatrader-5--office-finance-read-only)
11. [Analytics & Obsidian Vault (Read-Only)](#11-analytics--obsidian-vault-read-only)
12. [Languages & RTL Support](#12-languages--rtl-support)

---

## 1. Setup Center ("Start here")

- **What it is:** A unified onboarding checklist that detects your project folder, installed AI CLIs, Gemini API key, YouTube Dashboard folder, read-only MT5 bridge, and language/currency/theme preferences in one place.
- **Set up:** Nothing required beforehand. On your first Live launch, Setup Center opens automatically.
- **Step by step:**
  1. Review the **Recommended Next Step** banner at the top.
  2. Read the one-time **Full Access Mode** notice and click **Got it** once understood.
  3. Work through the rows you actually need (everything except the 3D office itself is optional):
     - **Project Folder:** Click a discovered candidate, click **Choose folder…** (Electron), or paste a folder path containing `Channels/<ChannelName>/Videos/`, then click **Save**.
     - **Installed CLI Agents:** Click **Test Connection** to verify any detected local CLI (`claude`, `codex`, `agy`, `opencode`, `hermes`).
     - **Gemini API Key (Optional BYOK):** Paste your key and click **Save Key** (stored only in `<dataDir>/secrets_local.json`).
     - **YouTube Dashboard (Optional):** Pick or enter your separate `YouTube-Studio-Manager` folder (or project folder containing `Tools/dashboard/server.py`) and click **Save & Start**.
     - **MT5 Read-Only (Optional):** Open **MT5 & Finance** if you trade on MetaTrader 5 for Windows.
     - **Language / Currency / Theme:** Switch instantly inline.
  4. Check **Don't open automatically on startup** when done. Reopen anytime via **Menu -> Start here · Setup Center**.
- **Expected result:** Each completed row turns green (`Ready` / `Connected`), and the Recommended Next Step updates dynamically (for example, pointing you straight to creating your first Short).
- **Tips to maximize:** You do not need all six rows to get value. Even with **only a Gemini API key** (0 CLIs, 0 project folders), you can immediately use the 3D office, Demo modes, Finance ledger, and AI Agent Prompt (`Gemini API BYOK`).
- **Common mistakes:**
  - Ignoring the multiple-candidate prompt: when more than one `Channels/` workspace exists on disk, Office AI refuses to guess automatically — click the exact candidate you want.
  - Putting credentials inside your project repo instead of letting Setup Center save keys to `<dataDir>/secrets_local.json`.

---

## 2. 3D Voxel Office & Camera Controls

- **What it is:** An interactive `48×32 m + West Terrace` voxel office divided into 10 zones (Boss Room, North Lobby & Kanban, Glass Meeting Room, Obsidian Vault & Server Room, Engineering Bay, Content & Design Studio, Central AI Core, Project Boulevard `P1..P8`, Quality & Docs Wing, MT5 & Finance Wing, plus West Terrace).
- **Set up:** Built in and ready immediately (`node embedded_server.js` or `OfficeAI.exe`). Switch between **Live** (connected to local server) and **Demo** (in-memory showcase) from the sidebar.
- **Step by step:**
  1. **Orbit / Pan / Zoom:** Drag on the 3D floor to orbit/pan and scroll to zoom (invert or remap mouse buttons in **Settings -> Camera**).
  2. **Camera Presets:** Open **Menu** (bottom-left) and select a zone preset (`Isometric`, `Top`, `Boss Room`, `Server`, `Engineering Bay`, `Content & Design Studio`, `Quality & Docs`, `MT5 & Finance`, `West Terrace`).
  3. **Inspect Actors & Objects:** Hover any character or desk for a status tooltip; click an actor in the 3D world or sidebar roster to focus on them.
  4. **Cinema / Fullscreen Mode:** Click **Panel** (top-right) to hide the sidebar for full-bleed 3D viewing, or **Fullscreen** to fill your display.
- **Expected result:** Smooth 3D rendering (`drawCalls <= 340`) with resident agents typing during real tasks, secretary delivering task briefs, and idle routines (coffee, ping-pong, sofa) when quiet.
- **Tips to maximize:** Press `?` (or click the help icon) to view all keyboard shortcuts. Enable **Follow active task** in Settings if you want the camera to glide automatically to whichever agent starts working.
- **Common mistakes:**
  - Leaving the app in **Demo** mode and wondering why real local agent hooks do not move characters — always check the **Live** badge in the sidebar.

---

## 3. Live Task Flow & Hook Installer (Real-Time Overhead Lines)

- **What it is:** Overhead 3D delegation arcs (**Boss -> Secretary -> Resident Agent -> Specialist Personas -> Return packet**) paired with the expandable **Live Flow** panel, color+pattern legend, Flow Settings, and the safe preview-and-backup **Office AI Hooks** installer in Setup Center.
- **Set up:**
  1. Open **Menu -> Start here · Setup Center** and scroll to **Office AI Hooks** (or run `python -I -B office_hooks.py` from the repository root).
  2. Choose **Project folder only** (recommended for trying on one workspace) or **Global** (applies to every Claude Code or Codex session on your computer).
  3. Click **Check status**, then **Preview exact JSON** to inspect the exact merged `.claude/settings.json` or `.codex/hooks.json` output before anything is written.
  4. Click **Install hook** and confirm. Office AI creates a timestamped backup automatically and merges alongside your existing hooks without overwriting them.
  5. Leave **"Include sanitized task title"** OFF for maximum privacy (even when ON, only a sanitized title `<= 120` chars is sent—never full prompts or secrets).
- **Step by step:**
  1. Start any task in Claude Code, Codex CLI, **AI Agent Prompt**, or **Video Studio**.
  2. Watch luminous glowing overhead beams appear in `<= 500 ms`: **Boss -> Secretary** (glowing gold paired-pulse beam; Secretary sits and types without delaying beams) **-> Agent** (provider glowing color + live streaming transfer particles) **-> Specialist Personas** (distinct glowing color, pulse rhythm, star node flares, and compact label badge per persona).
  3. Watch the **green-white return comet** (bright head + tapered glowing tail + arrival sparks) fly back along the beams when a subagent or main agent finishes (a blinking dashed red beam marks failure or usage limit).
  4. Click **Live Flow** in the sidebar or menu to expand delegation trees, filter by agent, pause/resume line animations, toggle accessibility line patterns, or open the **Legend**.
  5. Open **Settings -> Flow** to adjust line visibility, max visible lines (`8..128`), thickness (`0.5..3`), **Character walk animation** (`Full` / `Fast` default / `Off`), and editable **Subagent type -> Persona** mappings (plus **Restore flow defaults**).
  6. To remove hooks later, click **Uninstall** in Setup Center (or `office_hooks.py uninstall`) to restore your exact backup or cleanly strip only Office AI's managed entries.
- **Expected result:** Real delegations show up overhead within half a second (`Hook` / `Prompt Panel` / `Video Studio` = **Real-time**; read-only `collector.js` logs for Gemini/OpenCode/Hermes = **Delayed · Estimated**). Draw calls remain `<= 340`.
- **Tips to maximize:**
  - Keep **Walk animation** on **Fast** (default) or **Off** so reports and status updates appear instantaneously without waiting for characters to walk across the floor.
  - Map your team's custom subagent names in **Settings -> Flow** so every real delegation lights up the exact specialist desk you expect.
- **Common mistakes:**
  - Leaving the app in **Demo** mode while expecting live terminal hooks to show up — switch to **Live** first.
  - Editing `.claude/settings.json` manually between Preview and Install — Office AI detects concurrent edits (`HTTP 409`) and asks you to generate a fresh preview so nothing is clobbered.
  - Expecting instant subagent branches from providers without hooks — `collector.js` polls read-only local logs and honestly marks them **Delayed / Estimated**.

---

## 4. Report Tray & Live Activity Hooks

- **What it is:** The Boss Desk inbox that collects finished reports from resident AI agents and specialist personas, paired with low-latency Python hooks (`hook_send.py` for Claude Code, `office_event.py` for Codex/Gemini/Hermes/OpenCode) and the automatic read-only log collector (`collector.js`).
- **Set up:**
  - `collector.js` works automatically out of the box (read-only local session logs; set `OFFICE_COLLECTOR=0` to disable).
  - For instant **Claude Code** visual reactions, add `python -B "<path-to-office-ai>/hook_send.py"` to `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `SubagentStart`, `SubagentStop`, and `Stop` in `~/.claude/settings.json` (Python 3.9+ stdlib only, no `pip`).
  - For **Codex / Gemini / Hermes / OpenCode** scripts, call `python -B "<path-to-office-ai>/office_event.py" call|report|spawn|retire ...`.
- **Step by step:**
  1. Watch the red unread badge appear on the Boss Desk and in the **Report Tray** sidebar card whenever an agent completes work.
  2. Click **Report Tray** (bottom bar or sidebar) to open all reports with duration, token count, and status.
  3. Click **Mark read**, **Mark all read**, or **Archive** to keep your inbox clear.
- **Expected result:** Agents physically walk or deliver sheets to the Boss Desk tray; `hook_send.py` always exits `0` in `< 0.5 s` without exposing prompt text or secrets.
- **Tips to maximize:** Use `office_event.py spawn` and `retire` inside multi-agent orchestration scripts to visualize parallel workers occupying desks `P1..P8`.
- **Common mistakes:**
  - Running `node embedded_server.js` on a custom port without matching `OFFICE_PORT` (hooks auto-read `<dataDir>/port.txt` on default ports `8770..8775`).

---

## 4. Token Bank & Cost Estimator

<!-- [Diubah oleh Codex - 2026-11-22] -->
### Local token history (V22)

The sidebar keeps **Tokens today** and adds **Total since …**, with the complete number in its tooltip. **Most used** is closed initially and contains up to eight ranked rows. Select **Provider**, **Model** or **Month**; choose **See all** for the full paginated list, a 30/90-day daily chart and the import controls. Currency follows Settings, including after a live currency change.

Choose **Import full local history** once to scan available older logs. **Pause import** saves progress; reopening Office AI leaves an interrupted import paused, and the same import button resumes it. Unchanged files are skipped using file identity, size and modification time. Normal collector activity keeps the archive current without repeating the full scan. No new user configuration is required; history lives under `<dataDir>/usage_history/`, with a versioned index, hashed source files and `.bak` generations. Back up this folder with the rest of the data directory. Do not delete it to reset the dashboard.

Supported sources are Claude Code JSONL (including subagents), Codex rollout JSONL (including managed accounts), Antigravity/Gemini `gen_metadata` databases and Hermes `session_model_usage` databases. SQLite sources require a runtime with `node:sqlite`; missing, locked or unsupported sources are reported as incomplete. OpenCode log usage is currently unavailable. Deleted logs cannot be recovered. The first recorded date reflects available usage, rather than the computer's purchase date. Log access is read-only; only numeric usage, model/provider identifiers, opaque source hashes and checkpoints are retained. Projects and account names are omitted.

Dates use local time when recorded. Claude/Codex use record timestamps. Antigravity has no supported per-generation timestamp and uses the database modification date; Hermes assigns session/model totals to their last usage date. Daily allocations for those two sources are approximate. JSONL lines above 4 MiB are skipped; files are read in bounded chunks with a pause between chunks, and SQLite queries run in a background worker. Prompt and conversation contents are never stored in the archive.

The lifetime figure sums stored daily aggregates. The old daily balance and imported logs are reconciled per provider/day using the greater observed total, rather than summed twice; direct Gemini API usage remains separate. This preserves legacy usage whose source records are unavailable, but incomplete imports can show legacy model attribution until fuller logs exceed that balance. Rates are frozen when usage is first archived; the old daily pricing panel still recalculates its estimates from current rates. Unknown prices show **n/a**, with tokens still counted. These are API-equivalent estimates, not subscription charges.

- **What it is:** A live daily counter in the sidebar and **Token & Pricing** panel that aggregates local session tokens across providers (including Gemini BYOK calls) and computes an **API-equivalent cost estimate** in your chosen currency.
- **Set up:** Works automatically from `collector.js` and BYOK calls. Customize unit rates or exchange rates anytime via the **Token Bank / Pricing** panel.
- **Step by step:**
  1. Click the cost card in the sidebar (or **Menu -> Daily Usage / Pricing**).
  2. Review the 7-day bar chart and per-provider token split.
  3. Edit per-1M-token USD rates or FX rates (`IDR`, `USD`, `EUR`, `JPY`, `CNY`) and click **Save Pricing**.
- **Expected result:** The sidebar counter ticks up automatically when agents run, and the 3D Server Room daily board updates in sync. Every figure displays an **ESTIMATE** label.
- **Tips to maximize:** Check the 7-day trend before heavy multi-agent sessions so you can route routine tasks to faster/cheaper models.
- **Common mistakes:**
  - Treating the **ESTIMATE** cost as a subscription bill — subscription plans (ChatGPT Plus, Claude Pro, etc.) bill flat monthly fees; Office AI estimates equivalent API value for budgeting.

---

## 5. Quality Wing & Specialist Personas

- **What it is:** A 3-round structured QA workflow (`persona_call` -> `submit` -> `inspect_start` -> `verdict` -> `revise` / `learn` / `escalate`) staffed by up to **12 customizable specialist personas** (10 built-in) and a Quality Manager in the East Wing.
- **Set up:** Works immediately in Demo mode or Live mode via `office_event.py` / `POST /event`. Customize personas in **Settings -> Office agents -> Personas**.
- **Step by step:**
  1. Trigger specialist events from your workflow (e.g., `python -I office_event.py persona_call --persona frontend-developer --engine codex --task-id ui-1 --category code`).
  2. Watch the specialist walk to the Inspection Desk (`IN` tray), where the Quality Manager turns on yellow/green/red inspection lights.
  3. Click **Quality** in the menu to view pass rates, first-pass percentage, average rounds, and the **Learnings** tab.
  4. Approve or reject pending learnings in the **Learning Cabinet** so repeated defects become documented rules.
- **Expected result:** Passing tasks deliver final reports to the Boss Tray; third-round failures escalate clearly; approved/rejected learnings persist across restarts.
- **Tips to maximize:** Map each of your recurring workstreams (coding, QA, copywriting, design) to a distinct persona color and outfit so you can spot bottlenecks at a glance on the 3D Kanban board.
- **Common mistakes:**
  - Sending `verdict` before `inspect_start` (the server rejects skipped inspection steps with `HTTP 409`).
  - Trying to add more than 12 personas or duplicating a persona `id` slug.

---

## 6. Settings & Interactive 3D Layout Editor

- **What it is:** Five settings tabs (**Camera**, **Appearance**, **Shortcuts**, **Office agents**, **General**) plus a live 3D drag-and-drop **Layout Editor** for rearranging office furniture.
- **Set up:** Click the **Settings** gear (top-right) or **Menu -> Layout Editor**.
- **Step by step:**
  1. In **Settings**, adjust mouse mappings, light/dark theme, text size (`small`/`medium`/`large`), reduced motion, custom keyboard shortcuts, resident agent names/avatars, currency, and language.
  2. In **Layout Editor**, unlock the layout if locked, select a furniture piece, drag it on the 3D floor or rotate it, and verify the physics/collision indicator shows green (`0` overlaps, `0` blocked routes).
  3. Save or export/import your settings JSON.
- **Expected result:** Theme, text size, language, and furniture positions update immediately and persist in `<dataDir>/settings.json`.
- **Tips to maximize:** Turn on **Reduced motion** on older laptops to cut transitions while keeping crisp 3D clarity. Use **Physics overlay** when rearranging desks to guarantee every `usePoint` stays reachable.
- **Common mistakes:**
  - Dragging furniture while the layout lock is active (toggle unlock inside the Layout Editor first).

---

## 7. Video Studio (8-Stage Pipeline & 3 Human Gates)

- **What it is:** A real end-to-end production desk for short-form videos with **8 stages** (`idea` -> `script` -> `audio` -> `scene` -> `render` -> `qa` -> `metadata` -> `upload`) and **3 mandatory human gates** (**G1** Script Review, **G2** QA & Video Preview, **G3** Explicit Manual Upload Confirmation).
- **Set up:**
  1. Configure a **Project Folder** (`localProjectDir`) in Setup Center or right inside Video Studio's setup card.
  2. Inside that project folder, create at least one channel directory:
     ```text
     <your-workspace>/
       Channels/
         <ChannelName>/
           Videos/
     ```
     *(Optional: add `Tools/youtube/channels.json` for channel metadata, plus your channel's voice/render/QA/upload scripts under `Tools/` or `Channels/<ChannelName>/`.)*
  3. Ensure the AI CLI(s) used by your stages are installed (or test the flow in Demo mode / with a local stub).
- **Step by step:**
  1. Open **Video Studio** from the sidebar or menu.
  2. Select a **Channel** and **Format** (`Short`), then read the **What will run (8 stages)** table and any honest missing-tool warnings before starting.
  3. Enter a **Topic** (or click **Suggest ideas**) and click **Start production**.
  4. **Gate G1 (Script):** Production pauses automatically after drafting `script.json`. Edit the script directly in the built-in editor, add feedback to **Request revision**, or click **Approve & continue**.
  5. Stages **audio**, **scene**, **render**, and **qa** run automatically, streaming live logs per stage. If QA finds `FAIL` or `UNSURE`, the pipeline stops and shows exact failure findings for targeted fixes (max 3 QA rounds).
  6. **Gate G2 (Preview & QA):** Watch the rendered video preview and inspect the QA evidence right inside Video Studio. Approve to build upload metadata (`upload.json`, `description.txt`, thumbnail) and dry-run.
  7. **Gate G3 (Safe Manual Upload):** Review the dry-run summary. Upload is **NEVER automatic** — you must explicitly tick the confirmation box and click the upload confirmation button to run your channel's publish script.
- **Expected result:** Every stage writes traceable artifacts into `<project>/Channels/<Channel>/Videos/<slug>/`, survives server restarts without repeating completed stages, and never publishes without your explicit G3 click.
- **Tips to maximize:** Put channel rules in `AGENTS.md` and `LEARNINGS.md` inside each channel folder so Video Studio injects your voice, pacing, and visual standards automatically. If a CLI hits quota mid-run, wait or switch accounts and click **Resume** — completed stages are preserved.
- **Common mistakes:**
  - Opening Video Studio before setting a project folder — follow the inline setup card or Setup Center.
  - Expecting Video Studio to render videos without local audio/render scripts — check the pre-run **What will run** table to see which channel tools exist and which stages will wait or skip.

---

<!-- [Diubah oleh Gemini - 2026-11-21] Perbarui panduan Dasbor YouTube Tertanam V20 -->
## 8. YouTube Dashboard (Embedded Studio Manager)

- **What it is:** A full-panel embedded workspace hosting **YouTube Studio Manager** (`Overview`, `Comparison`, `Content Performance`, `Calendar & Queue`, `Comments`, `API Quota`, `Channels & Sign-in`) inside Office AI, plus a compact non-secret HUD pill and 3D reactions for login expiry warnings and new comments.
- **Set up:**
  1. If `Tools/dashboard/server.py` is already inside your project folder, Office AI detects it automatically.
  2. Otherwise, install the separate open-source dashboard repo:
     - Download/clone `https://github.com/FenomanSKY/YouTube-Studio-Manager` to any local folder.
     - Open **YouTube Dashboard** (or **Setup Center**), enter or pick that folder under **YouTube dashboard folder** (`dashboardDir`), and click **Save & Start**.
- **Step by step:**
  1. Click **YouTube Dashboard** in the sidebar. Office AI attaches to an already-running dashboard server on loopback (`managedByOffice: false`) or starts a managed instance automatically (the startup banner auto-dismisses after ~4 seconds).
  2. Use the 7 Office AI tabs across the top bar to switch pages cleanly—navigation stays synchronized in both directions and hides duplicate dashboard sidebars automatically via `?embed=office`.
  3. Switch between **All Channels** or any individual channel using the compact channel bar at the top of the embedded view (selecting a single channel also reveals quick actions: Account info, Open Studio, View on YouTube, Project folder, and Renew sign-in).
  4. Toggle Office AI between **Light** and **Dark** theme anytime in Settings: the embedded dashboard adapts immediately via live token sync without reloading, using 100% locally bundled fonts and Material Symbols icons (zero outbound font requests).
  5. Watch the fresh/stale sync badge, top HUD pill, and warning banner when a channel's OAuth token is nearing expiry, then renew in **Channels & Sign-in**.
  6. Click **Stop Office Server** (only shown when Office AI started the server) or close the panel; external servers started outside Office AI are **never killed**. Opening `http://127.0.0.1:8765/` directly in a regular browser preserves the original standalone dashboard UI unchanged.
- **Expected result:** The embedded YouTube Studio Manager matches Office AI's light/dark design language with crisp offline icons, a single scroll area, bidirectional tab sync, and zero OAuth tokens stored by Office AI.
- **Tips to maximize:** Keep `dashboardDir` pointed to your separate `YouTube-Studio-Manager` folder so you can update Office AI and the YouTube dashboard independently.
- **Common mistakes:**
  - Assuming YouTube Dashboard is bundled inside Office AI's repo — if you do not have `Tools/dashboard/server.py`, clone `YouTube-Studio-Manager` and point `dashboardDir` to it.

---

## 9. AI Agent Prompt (Local CLI & Gemini BYOK)

- **What it is:** A direct command console from the Boss Desk to run prompts against **6 providers** (`Claude Code`, `Codex`, `Antigravity / Gemini`, `OpenCode`, `Hermes`, and `Gemini API BYOK`) with model/effort selection, working-directory presets, connection testing, live streaming output, and 3D choreography.
- **Set up:** Install at least one local CLI (`claude`, `codex`, `agy`, `opencode`, `hermes`) OR save a **Gemini API Key (BYOK)** in Setup Center / Integration Settings.
- **Step by step:**
  1. Open **AI Agent Prompt** from the sidebar or menu.
  2. Select a **Ready** provider card. Click **Test Connection** to verify CLI/API responsiveness before sending a real task.
  3. Pick your **Model** and **Reasoning Effort** (when supported), then choose a **Working directory (`cwd`)** from the auto-discovered workspace list or type a custom path.
  4. Check the **Full Access Mode** toggle:
     - **ON (default):** Local CLIs can read/edit files and run commands in `cwd` without stopping for interactive prompts.
     - **OFF (Safe / Read-Only):** Runs in read-only/plan mode where supported (Gemini API BYOK is always REST-only with no shell/file access).
  5. Type your prompt and click **Send to Agent**. Watch live output stream into the console and click **Stop** anytime to cancel.
- **Expected result:** The 3D Secretary walks your brief to the target agent's desk (`Boss Prompt · <agent>`), output streams in real time, and up to 50 runs are saved in history.
- **Tips to maximize:** Use **Test Connection** right after installing a new CLI or starting `9router` for Hermes. Always double-check the selected `cwd` before running a destructive command with Full Access ON.
- **Common mistakes:**
  - Selecting a `Secrets` or `.git` folder as `cwd` — blocked by the server with `HTTP 403`.
  - Sending a prompt to `Hermes` while `9router` is stopped — start `9router` locally first.
- **What happens when you close Office AI while agents are running:**
  - Every local CLI agent prompt and Video Studio stage launched by Office AI runs inside a **Windows Job Object (`kill-on-close`)** managed by `short_process_runner.py`.
  - If you click close while one or more agents are active, the Electron window shows a confirmation dialog (**"N agent(s) are still working. Close and stop all / Keep open"**) with an optional **"Don't ask again"** toggle (also configurable in Setup Center).
  - Whether you close normally or Office AI crashes/is ended via Task Manager, the Job Object terminates the entire descendant process tree automatically (zero orphan agents left behind) and marks unfinished runs as **`interrupted`** in history (Video Studio stages can be resumed without repeating completed stages).
  - **Need a long unattended job to survive closing Office AI?** Launch that CLI directly in a standalone terminal (outside Office AI) and let Office AI's read-only log collector / hooks observe it instead.

---

## 10. MetaTrader 5 & Office Finance (Read-Only)

- **What it is:** A 3-tab financial wing combining a **100% Read-Only MetaTrader 5 Monitor**, a **Multi-Source Office Finance Ledger** (starting honestly at `0`), and a **Trading Analytics** dashboard with Equity Curve, symbol breakdown, daily heatmap, and CSV export.
- **Set up:**
  - Office Finance & Demo Trade Simulation work immediately on any OS.
  - For live MT5 monitoring (Windows only): install `pip install MetaTrader5`, open & sign in to MetaTrader 5 desktop, Office detects the interpreter/terminal and enables sync automatically when unconfigured. Check **Start here → MT5**; use advanced connection paths only for custom installations.
- **Step by step:**
  1. Open **MT5 & Finance** from the sidebar or menu.
  2. **Tab 1 — MT5 Monitor:** Check automatic sync and Net floating. DEMO buttons use a separate ledger; 3D demo choreography is available in Demo mode. Watch the MT5 Trader sit at the 4-monitor desk, light up the green/red beacon, and walk closed-deal slips to the Finance Manager.
  3. **Tab 2 — Office Finance:** Add income or expense entries across 5 sources (`MT5`, `YouTube`, `Affiliate`, `Freelance`, `Other`). Closed MT5 deals retain account currency and deduplicate by ticket number. USD→IDR conversion is an additional estimate; unsupported conversions remain unavailable.
  4. **Tab 3 — Trading Analytics:** Filter by `7 / 30 / 90` days or symbol, inspect Win Rate, Profit Factor, Max Drawdown, Equity Curve, and click **Export CSV** (balance deposits/withdrawals are automatically excluded from trading stats).
- **Expected result:** Net balance starts at `0` (never fake numbers), closed MT5 deals are never double-counted, and any attempt to send order/password keys is permanently blocked with `HTTP 403`.
- **Tips to maximize:** Click **Load Demo Data** in Trading Analytics to preview charts and CSV output before connecting a real MT5 terminal, use **Show real data** to return to real analytics. Reset Demo clears only the demo ledger.
- **Common mistakes:**
  - A custom virtual environment is not detected — select its `python.exe` in advanced MT5 Connection Settings, then use Test now.

---

## 11. Analytics & Obsidian Vault (Read-Only)

- **What it is:**
  - **Obsidian Vault Viewer:** Read-only file tree and Markdown note reader inside Office AI, plus an opt-in daily token summary writer (`Kantor/YYYY-MM-DD.md`).
  - **Legacy YouTube Snapshot Archive:** Preserves historical daily YouTube snapshots (`<dataDir>/yt_snapshots/YYYY-MM-DD.json`) read-only alongside the embedded dashboard.
- **Set up:** Stop Office AI, edit `<dataDir>/config.json` to set `"vaultRoot": "<path-to-your-obsidian-vault>"`, and restart the server. (There is intentionally no HTTP endpoint to change `vaultRoot`.)
- **Step by step:**
  1. Click the **OBSIDIAN** server rack in the 3D Northeast Room or open **Menu -> Vault**.
  2. Browse folders, search Markdown notes, and follow wikilinks safely (paths containing `secret`, `token`, `password`, `.env`, or symlinks are blocked).
  3. Optionally toggle **Sync to Obsidian** (always defaults **OFF** at startup) if you want Office AI to write a daily token summary into `Kantor/YYYY-MM-DD.md`.
- **Expected result:** Clean read-only Markdown browsing without ever modifying personal notes.
- **Tips to maximize:** Keep daily sync off unless you actively track AI usage inside Obsidian.
- **Common mistakes:**
  - Editing `config.json` while the server is still running — restart the server so the new `vaultRoot` loads.

---

## 12. Languages & RTL Support

- **What it is:** Instant 6-language localization covering **English (`en`)**, **Bahasa Indonesia (`id`)**, **Español (`es`)**, **日本語 (`ja`)**, **中文 (`zh-CN`)**, and **العربية (`ar` with full Right-to-Left layout)**.
- **Set up:** Built in.
- **Step by step:**
  1. Open **Setup Center** (row 6) or **Settings -> General -> Language**.
  2. Select any language.
- **Expected result:** Every menu, dialog, 3D board label, number format, and layout direction updates immediately without reloading the page.
- **Tips to maximize:** Pair language selection with your preferred display currency (`IDR`, `USD`, `EUR`, `JPY`, `CNY`) so token estimates match your local budgeting.
- **Common mistakes:**
  - Adding custom UI text during development without updating all 6 files in `locales/` — always run `node qa/i18n_audit.cjs` after modifying labels.

<!-- [Diubah oleh Codex - 2026-11-21] -->
## MT5 automatic sync (V17)

Office AI detects a Python interpreter with the `MetaTrader5` module (saved path,
`py -3`, `python`, `python3`, then common installation directories) and a local MT5
terminal. Detection only imports the module; it does not read account files.
When both are found, a new or previously unconfigured installation enables
automatic sync. **Settings → General → Automatic MT5 sync** and the MT5 row in
**Start here** provide the same explicit opt-out. Advanced connection settings
in MT5 & Finance accept a Python executable, terminal path, and a 1000–5000 ms
interval (default 1000 ms). **Test now** repeats detection and a read-only check.

The persistent bridge initializes once per connection, streams JSON snapshots,
and reconnects with 1–5 second backoff. Changed snapshots reach the interface via
SSE; unchanged snapshots use a small heartbeat. A stalled or failed stream is
restarted, with serialized process polling as fallback. Office shutdown and
parent-process crashes terminate the owned bridge using the V15 Windows Job
Object. No account password or login number is accepted or stored. There are no
order, modification or position-closing calls. Log in through MT5 itself.

Each position shows ticket, symbol, side, lot size, opening/current price, SL/TP,
profit, swap, entry commission and net. **Net floating = profit + swap + available
entry commission**; an unavailable commission is **n/a**, and net then excludes
that unknown component. After partial closure, entry commissions are allocated
to remaining volume. All trading amounts use the account currency and 2 decimals.
An additional USD→IDR figure is explicitly approximate; other account currencies
are never silently treated as USD.

**Terminal (equity − balance)** and **Account profit** are separate terminal
readings. The comparison badge matches within 0.02 account-currency units and
shows the signed difference otherwise. Entry commission may already have been
charged to balance, so including it in position net can legitimately differ from
equity minus balance. Credit, blocked charges, currency conversion and readings
at slightly different moments can also explain a difference. The interface does
not force either figure to equal the other.

With an open position, the sidebar displays the same Net floating as the panel.
Otherwise it displays **Realized today (UTC)**, from closed trading deals in the
account currency. This is distinct from the office ledger's all-source balance.
**Updated N s ago** counts from the last received snapshot; data becomes stale
after 10 seconds, including when the connection or stream stops.

**DEMO** buttons use a separate `mt5_demo.json` ledger and never change real
floating, analytics or office balances. Old records marked `demo` are migrated
out of the real ledger. In live mode, simulation results are explicitly labelled
DEMO; the real office projection follows real snapshots.

Migration: `config.autoSyncDecided` records an explicit sync decision. Legacy
`enabled:false` with unchanged defaults is treated as never configured; customized
legacy settings are conservatively preserved as an opt-out. An old intentional
disable saved with exactly the original defaults is indistinguishable from an
untouched default; turn it off once after updating to record the explicit choice.
Keep a local backup of the data directory before reverting versions. To undo the
sync preference, turn it off; no terminal settings are changed.

If sync is unavailable: open MT5 and log in there; check Python/module/terminal
statuses in Start here; run Test now; select the correct interpreter or terminal
in advanced settings if discovery misses a custom installation. Missing MT5 is
optional and does not generate a startup error. For stale data, check that the
terminal is connected to its broker and retry Test now. No Python packages are
installed automatically.

Reference: [positions and swap](https://www.mql5.com/en/docs/python_metatrader5/mt5positionsget_py),
[position deal history and commissions](https://www.mql5.com/en/docs/python_metatrader5/mt5historydealsget_py),
[account fields](https://www.mql5.com/en/docs/python_metatrader5/mt5accountinfo_py),
[terminal equity components](https://www.metatrader5.com/en/terminal/help/trading/report).
