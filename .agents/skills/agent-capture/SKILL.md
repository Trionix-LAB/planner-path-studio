---
name: agent-capture
description: "Create a new GitHub Issue in `status:backlog` and help formulate its Definition of Done (Acceptance) and Spec. Use when the user says `capture` (or asks to “создать задачу” or “изменить задачу”)."
---

# Agent capture (capture_and_prepare)

## Overview

Создать входящую задачу в `status:backlog` и помочь человеку сформулировать Definition of Done (Acceptance) и Spec (R-XXX).

## Workflow

### 0) Help formulate DoD and Spec
**Правило:** Агент не просто создает issue, а выступает в роли системного аналитика.
- Если в запросе мало конкретики, спросить про **Acceptance Criteria** (DoD) и **Spec** (какое поведение системы меняется).
- Цель: Подготовить задачу так, чтобы переход в `status:todo` был осознанным «пуском».

### 1) Normalize the issue title
Собрать заголовок: `type(area): description`.
Типы: `feat`, `fix`, `spec`, `chore`, `docs`, `idea`.

### 2) Create the Issue (GitHub)
Создать issue с лейблом `status:backlog`:

```bash
gh issue create --title "<title>" --body "<body>" --label "status:backlog"
```

**Тело Issue:**
- **Goal:** Ожидаемый результат.
- **Acceptance:** Чек-лист критериев приемки (DoD).
- **Spec:** Ссылка на `R-XXX` (если применимо).
- **Notes:** Контекст и допущения.

## Guardrails
- Не открывать PR на этом этапе.
- Если информации достаточно, сразу предлагать перевод в `status:todo` для старта реализации.

## Output contract
```
RESULT=ok|fail
ISSUE=<number>
NEXT=Wait for status:todo or clarify DoD
```
