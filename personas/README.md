<!-- [Diubah oleh Gemini - 2026-11-22] Public README for Office AI personas directory and CLI tools -->
# Office AI Personas — Specialist Definitions & CLI Tools

This folder contains the portable **Specialist Persona** definitions, templates, evaluation rubrics, integrity manifest, and zero-dependency Python 3.9+ stdlib tools for **Office AI**.

For the complete step-by-step manual on designing, validating, registering, and applying personas across AI runtimes (**Claude Code**, **Codex CLI**, **Gemini / Antigravity**, **OpenCode**, **Hermes**, and generic LLMs), read:
- **English Guide:** [`../docs/PERSONAS.md`](../docs/PERSONAS.md)
- **Panduan Bahasa Indonesia:** [`../docs/PERSONAS.id.md`](../docs/PERSONAS.id.md)

---

## Directory Structure

```text
personas/
  README.md                 # Quick reference for persona tools & folder layout
  MANIFEST.json             # SHA-256 integrity hashes for all registered persona files
  new_persona.py            # Scaffold a new persona from _template/ and optionally register to personas.json
  validate_persona.py       # Structural, rubric, safety, prompt-injection & manifest validator
  export_persona.py         # Export a persona into native agent formats (Claude, Codex, Gemini, OpenCode, Hermes, Generic)
  persona_run.py            # Prompt assembler & fake-agent check-revise demo stub (full runner port upcoming)
  _template/                # Canonical template used by new_persona.py
    persona.md
    checklist.md
    learnings.md
    evals/
      example_eval.json
  code-reviewer/            # Built-in generic specialist persona #1
  technical-writer/         # Built-in generic specialist persona #2
  reality-checker/          # Built-in generic specialist persona #3
```

---

## Quick Commands (Python 3.9+ stdlib only, zero `pip` required)

Run all commands from the repository root with `python -I`:

```bash
# 1. Validate all personas and verify SHA-256 manifest integrity
python -I personas/validate_persona.py --all --check

# 2. Scaffold a brand-new specialist persona (creates personas/<id>/ with 4 starter evals)
python -I personas/new_persona.py api-auditor --role "API Security Auditor" --department qa --engine claude

# 3. Preview and register the persona into Office AI's personas.json (up to 12 active slots)
python -I personas/new_persona.py api-auditor --role "API Security Auditor" --department qa --preview
python -I personas/new_persona.py api-auditor --role "API Security Auditor" --department qa --register

# 4. Update MANIFEST.json after reviewing your new or edited persona files
python -I personas/validate_persona.py --update

# 5. Export a persona to your AI runtime (claude | codex | gemini | opencode | hermes | generic | all)
python -I personas/export_persona.py code-reviewer --target claude --out ./exported-personas

# 6. Assemble a safe prompt with untrusted-data boundaries (--dry-run) or run the fake-agent demo loop
python -I personas/persona_run.py --persona code-reviewer --task "Review auth middleware patch" --dry-run
python -I personas/persona_run.py --persona code-reviewer --task "Review auth middleware patch" --agent fake --no-office
```

> **Status of `persona_run.py`:** In this public repository release, `personas/persona_run.py` provides the complete **CLI contract, SHA-256 manifest verification, untrusted-data prompt assembly (`--dry-run`), and deterministic fake-agent check-revise demonstration (`--agent fake`)**. Full multi-provider subprocess execution (`claude`, `codex`, `agy`, `opencode`, `hermes`) is marked **upcoming**; use `export_persona.py` today to run any persona natively inside your AI agent.
