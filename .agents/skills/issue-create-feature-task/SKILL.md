---
name: issue-create-feature-task
description: Создавать реализационную задачу (kind=feat) по существующему требованию `R-XXX` из `spec/spec.md` и доводить до DoR. Используй, когда пользователь просит "сделай фичу по R-XXX", "реализуй требование", "создай feat issue по spec".
---

# Create Feature Task Issue (From Spec)

Источник правил: `docs/process/PROCESS.md`.

## Inputs
- `R-XXX` (обязателен).
- Краткий `summary` задачи реализации.
- Acceptance (чекбоксы) для результата реализации.

## Procedure
1. Проверь, что `R-XXX` существует в `spec/spec.md`.
2. Создай issue `kind=feat` по процессу и укажи Spec ссылку на `R-XXX`.
3. Доведи issue до DoR и поставь статус `todo` по процессу.

## Output Contract
Верни:
- `Result`: `success` или `fail`.
- `Artifacts`: `issue_number`, `title`, `spec_id`.
- `Next`: например `work-start-issue`.

