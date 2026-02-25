---
name: agent-review
description: "Prepare a PR for final review/merge according to the repo’s agent workflow. Use when the user says `review`/“подготовь PR к ревью/мерджу” and you need to check PR body fields (`Fixes`, `Spec`, `Plan`, `Why`), verify acceptance criteria from `tasks/T-XXXX.md`, run/confirm tests, add a self-review comment, and optionally apply a readiness label (e.g. `ready:review`)."
---

# Agent review

## Overview

Проверить, что PR соответствует процессу (артефакты, тексты, критерии приёмки) и готов к финальному ревью/merge.

## Workflow

### 1) Load context

```bash
gh pr view <pr_number>
gh pr view <pr_number> --json body,labels,baseRefName,headRefName
```

Открыть `tasks/T-<issue_number>.md` и сверить с текущими изменениями.

### 2) Validate PR body contract

PR body обязан включать:
- `Fixes #XXXX` (связывание с Issue).
- `Spec: R-XXX` (ссылка на контракт или `New requirement` / `n/a`).
- `Plan: tasks/T-XXXX.md` (ссылка на план).
- `Why: ...` (2–5 строк, объясняющих продуктовую или техническую мотивацию).

Если чего-то не хватает — обновить body через `gh pr edit`.

### 3) Check acceptance criteria & Spec

- Каждому пункту Acceptance из `tasks/T-XXXX.md` соответствует проверяемый факт (тест, ручная проверка).
- Убедиться, что реализованное поведение соответствует заявленному в `spec.md` (если применимо).
- Нет “скрытых” изменений вне scope (если есть — поднять это как follow-up issue).

### 4) Confirm tests

Убедиться, что тесты/сборка запускались и результат зафиксирован (в PR комментарии или описании).

### 5) Add self-review comment + (optional) label

Добавить self‑review: что сделано, как проверено, риски/edge cases.

Опционально:

```bash
gh pr edit <pr_number> --add-label "ready:review"
```

## Output contract

```
RESULT=ok|fail
ISSUE=<issue_number>
PR=<pr_number>
NEXT=await reviewer / merge
```
