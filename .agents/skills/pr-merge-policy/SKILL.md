---
name: pr-merge-policy
description: Проверять готовность PR к merge по процессу: зелёный CI, выполненный Acceptance, соблюдение инвариантов Spec/traceability. Используй, когда пользователь спрашивает "можно мерджить?" или "проверь PR перед merge".
---

# PR Merge Policy Check

Источник правил: `docs/process/PROCESS.md`.

## Inputs
- PR URL или номер.

## Procedure
1. Проверь процессные инварианты: traceability `issue -> PR`, наличие Spec-идентификатора, обновление `spec/spec.md` при изменении поведения.
2. Проверь, что Acceptance из issue фактически выполнен.
3. Если есть блокеры, перечисли их коротким списком (без попытки "обойти" процесс).

## Output Contract
Верни:
- `Result`: `success` (готово) или `fail` (есть блокеры).
- `Artifacts`: `blockers` (если есть).
- `Next`: например `pr-review-prepare` или `spec-pr-update`.

