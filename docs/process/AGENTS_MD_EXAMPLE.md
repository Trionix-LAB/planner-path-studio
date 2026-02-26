## Agent-Specific Workflow (DoD-Driven Flow)

This repo uses a DoD-driven workflow described in `docs/AGENT_WORKFLOWS.md`. In short:

- For any incoming request, first verify the current Issue/PR state (FSM labels like `status:*`). Use the `agent-report` skill (`.agents/skills/agent-report`) to check for blockers.
- When an Issue is in `status:todo`, the DoD is approved. You can autonomously transition it to `status:in-progress`, create a branch, and implement the solution.
- The `tasks/T-XXXX.md` file is a technical log (Observability) created in the same PR as your code. It does NOT require prior human approval.
- One PR per task: it must contain the `tasks/T-XXXX.md` log, any updates to `spec.md`, and the code/tests.
- Tests are required to prove the DoD is met.
