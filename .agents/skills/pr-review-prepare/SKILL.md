---
name: pr-review-prepare
description: Готовить PR к ревью: self-review заметки, риски, где тесты, проверка трассируемости (Fixes/Spec) по `docs/process/PROCESS.md`. Используй перед тем как просить ревью или мерджить.
---

# Prepare PR For Review

Источник правил: `docs/process/PROCESS.md`.

## Inputs
- PR URL или номер.

## Procedure
1. Проверь, что PR описание содержит `Fixes #...` и `Spec: ...` по процессу.
2. Составь короткие review-notes:
   - что изменено (1-3 пункта)
   - где и как проверено (тесты/ручная проверка)
   - основные риски/границы изменения
3. Если изменилось поведение и `spec/spec.md` не обновлён, заблокируй готовность и инициируй `spec-pr-update`.

## Output Contract
Верни:
- `Result`: `success` или `fail` (+ блокеры).
- `Artifacts`: `review_notes` (коротко).
- `Next`: например `pr-merge-policy`.

