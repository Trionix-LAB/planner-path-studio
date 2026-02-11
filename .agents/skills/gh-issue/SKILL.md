---
name: gh-issue
description: Работа с GitHub Issues через gh CLI по правилам docs/process/ISSUE_AND_GH.md, включая Q&A-уточнение перед созданием/переводом в todo.
---

# GH Issues Workflow (Project Rules)

Источник правил: `docs/process/ISSUE_AND_GH.md`.

## 1) Инварианты процесса
- Issue title строго в формате: `<kind>(<area>): <summary>`.
- Допустимые `kind`: `idea`, `spec`, `feat`, `fix`, `chore`, `docs`.
- Статус управляется только labels, у issue всегда ровно один `status:*`.
- Обязательные status labels: `status:backlog`, `status:todo`, `status:in-progress` (`status:done` опционально).
- `status:todo` = контракт: есть Spec-ссылка/новое требование, есть Acceptance, нет открытых вопросов, задача атомарная.

## 2) Q&A протокол перед созданием/редактированием
Если деталей недостаточно, агент обязан перейти в режим коротких уточнений и задать вопросы по приоритету.

Обязательные вопросы:
1. Какой `kind` (`idea/spec/feat/fix/chore/docs`)?
2. Какая `area`?
3. Краткий `summary` для заголовка?
4. Есть Spec ID (`R-XXX`) или это новый requirement?
5. Какой Goal (1-3 пункта)?
6. Какие Acceptance критерии (чекбоксы)?
7. Стартовый статус: `status:backlog` или `status:todo`?
8. Есть ли открытые вопросы/блокеры?

Правила Q&A:
- Если не хватает хотя бы одного обязательного поля для `todo`, не переводить в `status:todo`; оставить `status:backlog`.
- Если требование неясно, предлагать создать `spec(...)` issue.
- Вопросы задавать минимальными батчами (сначала критичные для продолжения).

## 3) Шаблоны

### Заголовок issue
```text
<kind>(<area>): <summary>
```

### Тело issue (минимум для `status:todo`)
```md
Kind: <kind>
Area: <area>
Spec: <R-XXX | NEW>

Goal:
- <goal item>

Acceptance:
- [ ] <criterion 1>
- [ ] <criterion 2>

Open questions:
- None
```

## 4) Команды `gh` (практика)

### Создать issue (обычно в backlog)
```bash
gh issue create \
  --title "feat(memory): implement R-004 summary storage" \
  --body-file ./issue-body.md \
  --label "status:backlog"
```

### Перевести backlog -> todo
```bash
gh issue edit 123 \
  --remove-label "status:backlog" \
  --add-label "status:todo"
```

### Перевести todo -> in-progress и назначить на себя
```bash
gh issue edit 123 \
  --remove-label "status:todo" \
  --add-label "status:in-progress" \
  --add-assignee "@me"
```

### Посмотреть/обновить/прокомментировать
```bash
gh issue view 123
gh issue edit 123 --title "fix(api): handle empty payload"
gh issue comment 123 --body "Updated acceptance and started implementation."
```

### Списки по статусу
```bash
gh issue list --state open --label "status:backlog"
gh issue list --state open --label "status:todo"
gh issue list --state open --label "status:in-progress"
```

## 5) Связка с PR
- В PR обязательно указывать:
  - `Fixes #<issue>`
  - `Spec: R-XXX` (или явное пояснение для `chore`).
- Если PR меняет поведение системы, обновление `spec.md` обязательно.
- Для старта реализации можно использовать:
```bash
gh issue develop 123 --checkout
gh pr create --fill --body "Fixes #123
Spec: R-004"
```

## 6) Ожидаемое поведение агента
- Перед изменениями читать релевантные требования.
- Не придумывать недостающие критерии молча; сначала Q&A.
- При любой неоднозначности требований предлагать `spec(...)` issue.
- При редактировании статусов следить, чтобы у issue оставался ровно один `status:*` label.
