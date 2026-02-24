# Repository Guidelines (Quick)

## Source of truth
- Process: see `docs/PROCESS.md`.
- Requirements (MVP behavior/scope/perf): see `spec/spec.md`.
- Screens/flows (UX): see `docs/screens.md`.
- On-disk mission format (mission.json/CSV/GeoJSON): see `docs/mission-format.md`.

Rule of thumb: if something is described in those docs, do not restate it here—link to it and implement exactly what’s written.

## Where code lives
- App: `src/`
- Pages/routes: `src/pages/`
- Domain/features: `src/features/`
- UI components: `src/components/` (reusable UI in `src/components/ui/`)
- Platform layer (web/electron): `src/platform/`
- Tests: `src/test/`

## Engineering rules
- Prefer minimal, spec-driven changes; avoid “nice-to-haves” unless explicitly requested.
- Keep platform-specific APIs behind `src/platform/*`.
- Follow existing file/style conventions in the touched file.

## Commands
- Dev: `npm run dev`
- Test: `npm run test`
- Lint: `npm run lint`
- Build: `npm run build`

## Agent-Specific Workflow (Plan Gate)

This repo uses a plan-first workflow described in `docs/agents/AGENT_WORKFLOWS.md`. In short:

- For any incoming request, first verify the current Issue/PR state (FSM labels like `status:*`, `plan:*`). Use the `agent-report` skill (`.agents/skills/agent-report`) to check for blockers (e.g., missing `plan:approved`).
- Do not self-approve PRs and do not apply the `plan:approved` label yourself; plan approval is a human gate.
- Create/update `tasks/T-XXXX.md` first and get plan approval before implementing behavior changes.
- If scope changes mid-stream, update the plan (and `spec.md` if needed) and re-approve before continuing.


## Commit message formatting (important) ⚠️
- Never include literal `\n` sequences in commit messages or PR/issue titles — they break rendering in git logs, CI, and changelogs.
- Use real newlines for multi-line messages: first line = short subject, then a blank line, then the body.
- Scripts/agents must sanitize generated messages by converting `\\n` to actual newlines before calling `git commit` or APIs.

Examples
- Bad (do **not** produce): `Fix crash on load\n- stacktrace attached`
- Good (rendered correctly):
  - Subject: `Fix crash on load`
  - Body: `- stacktrace attached` (separated from subject by an empty line)

Practical rules for automation / agents 🔧
1. Replace any `\\n` substrings with `\n` (actual newline) in generated messages:
   - JS: `message = message.replace(/\\\\n/g, "\\n");`
   - Shell (POSIX): `commit_msg=$(printf "%b" "$commit_msg")`
2. Keep subject ≤ 50 chars, leave one blank line, wrap body at ≈72 chars.
3. When using CI or bot-created changelogs, produce plain-text or markdown with real newlines so renderers and tools behave correctly.

If you update tooling that writes commit messages, add a unit or integration test asserting there are no literal `\\n` sequences in final messages.
