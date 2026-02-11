---
name: issue-create-bug
description: Создавать bug-issue (kind=fix) по процессу репозитория и собирать минимум для воспроизведения. Используй, когда пользователь описывает баг, регрессию, неправильное поведение, "expected vs observed".
---

# Create Bug Issue

Источник правил: `docs/process/PROCESS.md`.

## Inputs
- Observed (что видим).
- Expected (как должно быть).
- Repro steps (минимальный сценарий).
- Опционально: окружение/версии/логи/скриншоты.

## Procedure
1. Определи `area` и краткий `summary` (без диагноза причины).
2. Создай issue с `kind=fix` в backlog по процессу.
3. Если есть достаточные данные, подготовь issue к DoR: добавь Spec-ссылку на существующий `R-XXX` из `spec/spec.md` или отметь, что требуется `spec(...)` issue для уточнения требований (см. `docs/process/PROCESS.md` раздел "Правила для ИИ-агентов").
4. Не переводить в `status:todo`, если DoR не выполнен.

## Output Contract
Верни:
- `Result`: `success` или `fail` (+ причина).
- `Artifacts`: `issue_number`, `title`.
- `Next`: например `issue-promote-to-todo` (если DoR достижим), или `issue-create-spec-change`.

