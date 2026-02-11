---
name: spec-ensure-requirement
description: Проверять наличие и актуальность Spec требования (`R-XXX`) перед реализацией; при отсутствии инициировать spec-изменение по `docs/process/PROCESS.md`. Используй, когда задача ссылается на Spec, или когда нужно связать реализацию с требованием.
---

# Ensure Spec Requirement

Источники правил: `docs/process/PROCESS.md`, `spec/spec.md`.

## Inputs
- Номер issue (или `R-XXX`).

## Procedure
1. Из issue извлеки Spec контекст: существующий `R-XXX` или необходимость нового requirement.
2. Если указан `R-XXX`, найди его в `spec/spec.md` и используй как контракт поведения.
3. Если нового requirement нет в `spec/spec.md`, не придумывай его молча: создай/используй `spec(...)` issue и планируй обновление `spec/spec.md` через PR по процессу.

## Output Contract
Верни:
- `Result`: `success` или `fail`.
- `Artifacts`: `spec_id` (если есть), `needs_spec_pr` (true/false).
- `Next`: например `spec-pr-update` или `dev-implement-change`.

