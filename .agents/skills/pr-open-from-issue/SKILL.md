---
name: pr-open-from-issue
description: Открывать PR из текущей ветки с обязательной трассировкой на issue и Spec по `docs/process/PROCESS.md`. Используй, когда пользователь просит "открой PR", "создай PR по #123".
---

# Open PR From Issue

Источник правил: `docs/process/PROCESS.md`.

## Inputs
- Номер issue.

## Procedure
1. Убедись, что есть изменения в ветке и они соответствуют Acceptance у issue.
2. Создай PR и оформи описание строго по шаблону:
   - Первая строка — краткий заголовок (summary).
   - Пустая строка.
   - Краткий список изменений (bullets).
   - Пустая строка.
   - `Spec: R-XXX` или `Spec: New requirement` (обязательно — traceability).
   - Пустая строка.
   - `Fixes #<issue-number>` (обязательно — закрывает issue после merge).

   Пример формата в теле PR:

   Summary: краткое описание изменений
   - Что сделано
   - Краткие детали/ограничения

   Spec: R-014

   Fixes #22

   Обратите внимание: избегайте использования inline-кода или вложенных backticks в заголовке/футере — это ломает шаблон парсинга."}```
3. Проверь, что PR не нарушает инварианты процесса (особенно про обновление spec при изменении поведения).

## Output Contract
Верни:
- `Result`: `success` или `fail`.
- `Artifacts`: `pr_url`.
- `Next`: например `pr-review-prepare`.

