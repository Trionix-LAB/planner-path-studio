---
name: agent-report
description: "Produce a concise status report based on the new FSM labels. Use when the user says `report` (or asks to “показать статус”)."
---

# Agent report

## Overview

Собрать сводку состояния по упрощенному FSM: по одной задаче (`issue <id>`) или по проекту целиком.

## Workflow

### 1) Query GitHub
Сгруппировать задачи по 4 основным состояниям:
- **`backlog`** (`status:backlog`): Идет проработка DoD.
- **`todo`** (`status:todo`): Готовы к автономному исполнению.
- **`in-progress`** (`status:in-progress`): Агент пишет код и лог действий в PR.
- **`done`** (`status:done`): Завершено.

### 2) Identify Blockers
- Задачи в `status:in-progress` без открытого PR.
- PR с "Request Changes" (требуется реакция агента).
- PR ожидающие Merge (требуется реакция человека).

## Output format
Короткая сводка по колонкам + список блокеров.

```
RESULT=ok|fail
NEXT=<top priority action>
```
