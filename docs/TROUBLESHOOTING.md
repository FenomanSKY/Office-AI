<!-- [Diubah oleh Gemini - 2026-11-21] English troubleshooting guide (Symptom -> Cause -> Fix) -->
# Troubleshooting Guide — Office AI

Use the table below to resolve common setup, runtime, and integration issues. For Indonesian, see [`TROUBLESHOOTING.id.md`](TROUBLESHOOTING.id.md).

---

| Symptom | Likely Cause | Fix |
|---|---|---|
| **Lifetime total is empty or begins recently** | Only locally available recorded usage is known. Older logs have not been imported, or were deleted. | Expand **Most used → See all → Import full local history**. The import is read-only; deleted logs cannot be recovered. OpenCode usage logs are not supported. |
| **Import is paused, incomplete or shows n/a** | It was interrupted, the source is locked/unsupported, or a model has no known price. | Resume using **Import full local history**. Retry after the CLI releases its database. SQLite sources require `node:sqlite`; tokens remain visible when prices are unknown. Antigravity/Hermes daily dates are approximate. |
| **History needs repair** | A history JSON generation is corrupt or unreadable. | Stop Office AI yourself and back up `<dataDir>/usage_history/`. A valid previous `.bak` generation is recovered automatically. If both copies are corrupt, restore this folder from your backup, then reimport available logs. Do not replace your daily ledger or unrelated settings. |
| **Agent shows `"Not Installed"` in AI Agent Prompt or Setup Center** | The CLI executable (`claude`, `codex`, `agy`, `opencode`, or `hermes`) is not installed or not on your system `PATH`. | 1. Install the CLI you want (or use **Gemini API BYOK** if you prefer zero CLI installs).<br>2. Open a fresh terminal and verify e.g. `claude --version` or `codex --version`.<br>3. Restart Office AI and click **Refresh** / **Test Connection** in Setup Center or AI Agent Prompt. |
| **Video Studio Channel & Format dropdowns are empty** | No project folder (`localProjectDir`) is saved yet, or the chosen folder has neither `Tools/youtube/channels.json` nor any `Channels/<ChannelName>/` subfolders. | 1. Open **Menu -> Start here · Setup Center** (or use the inline setup card right inside **Video Studio**).<br>2. Click a discovered project candidate, or type/browse to a folder containing `Channels/<YourChannel>/Videos/`.<br>3. Click **Save** — channels populate immediately from `channels.json` or `Channels/*` subfolders. |
| **YouTube Dashboard says script not found / offline** | `Tools/dashboard/server.py` (or `dashboard/server.py`) is not inside your project folder, or the dashboard repo is in a separate folder. | 1. Clone or download [YouTube Studio Manager](https://github.com/FenomanSKY/YouTube-Studio-Manager) to any local folder.<br>2. In **YouTube Dashboard** (or **Setup Center**), enter or pick that folder in **YouTube dashboard folder** (`dashboardDir`) and click **Save & Start**.<br>3. Confirm Python 3.9+ works in your terminal (skipping the empty Windows Store `python.exe` alias). |
| **Hermes shows `"9router Offline"`** | Hermes connects to its local `9router` proxy (`http://127.0.0.1:20128/v1/models`), which is not currently running. | 1. Start `9router` locally (for example `9router --tray --no-browser --skip-update`).<br>2. Verify `http://127.0.0.1:20128/v1/models` responds.<br>3. Return to **AI Agent Prompt** and click **Test Connection**. |
| **Gemini API key missing, rejected, or not working** | Key has not been saved in `<dataDir>/secrets_local.json`, was copied with extra spaces, lacks API access, or has hit quota. | 1. Open **Setup Center** (row 3) or **AI Agent Prompt -> Gemini API (BYOK)**.<br>2. Paste a valid key from Google AI Studio and click **Save Key** (UI shows `Saved (...XXXX)`).<br>3. Click **Test Connection**. If it returns 401/403/429, regenerate the key or check billing/rate limits in Google AI Studio. |
| **Codex / CLI agent hits usage limit during Video Studio (exits with code `0` or limit error)** | Your CLI account reached its session or daily usage quota mid-stage. | 1. Office AI automatically detects limit messages (even on exit code `0`) and pauses cleanly without corrupting artifacts.<br>2. Wait for quota reset, switch accounts/models, or click **Resume** — completed stages are preserved and not re-run. |
| **Port `8770` already in use** | Another Office AI instance (desktop or server) or local app is listening on port `8770`. | 1. `embedded_server.js` automatically tries ports `8770` through `8775` and prints the active URL.<br>2. Check `<dataDir>/port.txt` for the active port.<br>3. To force a specific port, set `OFFICE_PORT=8780` before starting `node embedded_server.js`. |
| **Multiple project folders detected (not auto-selected)** | Office AI found `> 1` folders matching the `Channels/` signature and refuses to guess silently. | Open **Setup Center** or **Video Studio** and click the exact candidate folder you want to activate. Office AI saves your choice so you only confirm once. |
| **Antivirus / Windows Defender blocks script or SSL / TLS error** | Windows Defender / corporate antivirus flags a local spawned CLI or intercepts HTTPS certificates (`SELF_SIGNED_CERT_IN_CHAIN` / `UNABLE_TO_VERIFY_LEAF_SIGNATURE`). | 1. Whitelist your local Office AI folder and Python/Node binaries in your antivirus if a spawned runner is falsely blocked.<br>2. Behind a corporate proxy, set `NODE_EXTRA_CA_CERTS=<path-to-ca.pem>` (for Node/Gemini API calls) and `REQUESTS_CA_BUNDLE` (for Python). Never disable TLS verification globally. |
| **MT5 status shows `mt5_unavailable` or `terminal_not_running`** | `MetaTrader5` Python package is missing from the selected Python interpreter, or the MetaTrader 5 desktop app is closed/not logged in. | 1. Install the package: `pip install MetaTrader5` (Windows only).<br>2. If using a virtual environment, paste its `python.exe` path into **MT5 & Finance -> MT5 Connection Settings -> Python Path**.<br>3. Open MetaTrader 5, log into your account, and click **Refresh** (or use **Demo Trade Simulation** without MT5). |
| **API call to `/mt5/*`, `/finance/*`, or `/prompt/*` returns `HTTP 403`** | Missing/wrong `X-Office-Token` header, a blocked path (`Secrets`/`.git`), or a forbidden trading/password key sent to read-only MT5 endpoints. | 1. Include header `X-Office-Token` matching `<meta name="office-vault-token">`.<br>2. Never send order/credential keys (`order_send`, `password`, `lot_size`, `sl`, `tp`) — MT5 is strictly read-only.<br>3. Choose a working directory outside `Secrets` and `.git`. |
| **Events from `hook_send.py` / `office_event.py` do not appear in the 3D office** | UI is still in **Demo** mode, or the hook cannot find the active port. | 1. Click **Live** in the sidebar/top bar so the 3D office subscribes to the local server.<br>2. Ensure `OFFICE_PORT` matches the server's active port (or let `<dataDir>/port.txt` match). |
| **Overhead 3D flow lines do not appear or show `"Delayed"` instead of `"Real-time"`** | Flow lines are disabled/paused in Settings, hooks are not installed for Claude Code/Codex, or the provider relies on read-only log polling (`collector.js`). | 1. Open **Settings -> Flow** and ensure **Show 3D overhead flow lines** is ON and **Pause flow line animations** is OFF.<br>2. Open **Setup Center -> Office AI Hooks** to preview and install hooks for Claude Code (`.claude/settings.json`) or Codex CLI (`.codex/hooks.json`), then restart open CLI sessions.<br>3. Providers without native hooks (e.g., read-only log collector) honestly show **Delayed / Estimated** until session logs flush. |
| **Hook installer shows `"Incomplete / broken"`, `"HTTP 409"`, or refuses to preview** | A partial/manual edit modified the target JSON file, the file changed after preview, or the file contains invalid JSON / credential-like patterns / blocked path (`Secrets`, `.git`, symlink). | 1. On **HTTP 409 (changed after preview)**: click **Preview exact JSON** again, then confirm.<br>2. On **Incomplete / broken**: click **Uninstall** first so your original backup stays intact, then preview & install cleanly.<br>3. Never point hook scope to `Secrets`, `.git`, or symlinks; fix invalid JSON manually before retrying. |
| **Source code edits do not show up in `OfficeAI.exe`** | The packaged desktop app uses its own staged copy inside `Aplikasi/OfficeAI-win32-x64/`. | Run `python -I repack.py` from the repository root (after registering any new runtime files in `pack.js`), then restart `OfficeAI.exe`. |
| **An agent job stopped (`interrupted`) after closing Office AI** | All agents started inside Office AI run under a Windows Job Object (`kill-on-close`) so closing or crashing Office AI never leaves orphan background processes consuming CPU or API quota. | 1. For Video Studio, click **Resume** — completed stages are kept and not re-run.<br>2. For long unattended CLI jobs you want to outlive Office AI, run the CLI in a separate terminal window outside Office AI (the read-only collector/hooks will still visualize it).<br>3. Toggle **Ask before closing while agents are running** in Setup Center to avoid accidental closes. |

---

## Still Stuck?
1. Run `node qa/i18n_audit.cjs` and `node qa/v15_onboarding_test.cjs` from the repository root to verify your local environment.
2. Check [`USER_GUIDE.md`](USER_GUIDE.md) for feature-by-feature setup steps.

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
