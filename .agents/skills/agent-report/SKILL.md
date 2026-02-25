---
name: agent-report
description: "Produce a concise status report for an Issue or for the whole project based on the workflow labels (FSM). Use when the user says `report`/“покажи статус” and you need to query GitHub via `gh` to classify items into states (backlog, plan review, plan changes requested, todo, in-progress, review, done), list open PRs, and highlight blockers like “waiting for plan:approved”."
---

# Agent report

## Overview

Собрать сводку состояния по FSM: по одной задаче (`issue <id>`) или по проекту целиком (`project`).

## Inputs

- `scope`: `issue <id>` или `project`
- (опционально) фильтры: area, тип, milestone

## Workflow

### A) Scope: single issue

```bash
gh issue view <id> --json title,url,labels,assignees,state
gh pr list --search "<id>" --state open
```

Вывести:

- текущий state по лейблам (`status:*` + `plan:*`)
- связанный PR (если есть) и его блокеры
- “что дальше” одной строкой

### B) Scope: project

Собрать списки и сгруппировать по 4 основным состояниям:
- `backlog` (`status:backlog`) — Входящие.
- `todo` (`status:todo`) — Планирование / Готовы к плану.
- `in-progress` (`status:in-progress`) — Реализация (план утвержден).
- `done` (`status:done`) — Завершено.

Также выделить промежуточные состояния PR:
- `plan review` (PR открыт, но нет `plan:approved`)
- `plan changes requested` (`plan:changes-requested`)
- `review` (код написан, ожидается апрув реализации)

Примеры запросов:

```bash
gh issue list --label "status:backlog" --state open
gh issue list --label "status:todo" --state open
gh issue list --label "status:in-progress" --state open
gh pr list --state open
```

## Output format

Короткая сводка + блокеры. В конце — структурированный итог:

```
RESULT=ok|fail
ISSUE= (empty for project)
PR=
NEXT=<top blocker or next action>
```
