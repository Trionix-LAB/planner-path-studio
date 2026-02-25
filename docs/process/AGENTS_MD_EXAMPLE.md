## Agent-Specific Workflow (Plan Gate)

This repo uses a plan-first workflow described in `docs/agents/AGENT_WORKFLOWS.md`. In short:

- For any incoming request, first verify the current Issue/PR state (FSM labels like `status:*`, `plan:*`). Use the `agent-report` skill (`.agents/skills/agent-report`) to check for blockers (e.g., missing `plan:approved`).
- Do not self-approve PRs and do not apply the `plan:approved` label yourself; plan approval is a human gate.
- Create/update `tasks/T-XXXX.md` first and get plan approval before implementing behavior changes.
- If scope changes mid-stream, update the plan (and `spec.md` if needed) and re-approve before continuing.
