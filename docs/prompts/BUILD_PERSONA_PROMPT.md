<!-- [Diubah oleh Gemini - 2026-11-22] Copy-paste prompt for any AI coding assistant to build and apply an Office AI persona -->
# Ready-to-Paste Prompt: Build & Apply an Office AI Specialist Persona

Copy and paste the prompt block below into **any AI coding agent** (Claude Code, Codex CLI, Gemini / Antigravity, OpenCode, Hermes, Cursor, Windsurf, or ChatGPT) opened inside your cloned **Office AI** repository:

---

```text
You are working inside my cloned Office AI repository. I want to build a new Specialist Persona and apply it to my AI workflow.

First, read these files in the repository:
1. AGENTS.md (Section "Personas: Build and Apply to Your AI")
2. docs/PERSONAS.md (or docs/PERSONAS.id.md if I write to you in Bahasa Indonesia)
3. personas/README.md and personas/_template/

Then follow this exact procedure:
1. Ask me 4-6 short interview questions to confirm:
   - The persona's role title, slug ID (^[a-z0-9-]{1,32}$), and department (engineering | design | qa | content | docs)
   - What concrete deliverable and evidence it must produce on every run
   - What safety boundaries / out-of-scope rules it must obey
   - Whether to register it into Office AI's 12-slot 3D roster (personas.json)
   - Which AI runtime(s) I use (claude | codex | gemini | opencode | hermes | generic)
2. After I answer, scaffold the persona using:
   python -I personas/new_persona.py <id> --role "<Role Title>" --department <dept> --engine <engine>
3. Customize personas/<id>/persona.md (all 6 required sections), personas/<id>/checklist.md (>= 5 Yes/No items with Evidence notes, including CHK-05 prompt-injection defense), and personas/<id>/evals/*.json (>= 4 rubric eval cases). Keep all files 100% free of personal paths, secrets, external URLs, or shell download commands.
4. Validate and update the SHA-256 integrity manifest:
   python -I personas/validate_persona.py <id>
   python -I personas/validate_persona.py --update
   python -I personas/validate_persona.py --all --check
5. Export the persona to my chosen AI runtime(s):
   python -I personas/export_persona.py <id> --target <claude|codex|gemini|opencode|hermes|generic|all>
6. Test prompt assembly (--dry-run) and the deterministic fake-agent check-revise loop (--agent fake):
   python -I personas/persona_run.py --persona <id> --task "Sample domain verification task" --dry-run
   python -I personas/persona_run.py --persona <id> --task "Sample domain verification task" --agent fake --no-office
7. Show me the exact command or subagent invocation to use my new persona today, and how to connect it to Office AI's 3D office via office_hooks.py or office_event.py.
```
