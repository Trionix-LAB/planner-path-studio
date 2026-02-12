---
name: gh-issue
description: Универсальный помощник по работе с задачами и GitHub-процессом на основе docs/PROCESS.md. Используй, когда нужно стартовать новую задачу, работать с issue через gh CLI (создать/уточнить/перевести статус), а также перед commit и push для проверки трассируемости issue/spec и корректной подготовки PR.
---

# Task & GH Process Assistant

Источник правил: `docs/PROCESS.md`.

## 1) Инварианты процесса
- Используй заголовок issue строго в формате: `<kind>(<area>): <summary>`.
- Используй только допустимые `kind`: `idea`, `spec`, `feat`, `fix`, `chore`, `docs`.
- Управляй состоянием только через labels; держи у issue ровно один `status:*`.
- Используй статусные labels: `status:backlog`, `status:todo`, `status:in-progress` (`status:done` опционально).
- Переводи в `status:todo` только когда выполнен DoR: есть Spec-ссылка/новое требование, есть Acceptance, нет открытых вопросов, задача атомарная.

## 2) Старт новой задачи
1. Найди релевантный issue или создай новый в `status:backlog`.
2. Проверь, что формулировка задачи связана со Spec (`R-XXX`) или явно создает новый requirement.
3. Уточни недостающие детали через Q&A.
4. Переведи issue в `status:todo` только после DoR.
5. При начале реализации переведи в `status:in-progress` и назначь исполнителя.

## 3) Q&A протокол перед созданием/переводом в todo
Если данных не хватает, задавай короткие уточняющие вопросы минимальными батчами.

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

## 4) Шаблоны

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

## Форматирование тела issue — правила (важно)
- Используй корректный Markdown: реальные переносы строк и абзацы — не вставляй литералы `\n`.
- Для имён файлов, компонентов и меток используй `inline code` (`` `StartScreen`, `fileStore`, `platform`, `spec.md`, `status:backlog` ``).
- Для блоков кода используй fenced code blocks (```), не вставляй код в одну строку с `\n`.
- При создании/редактировании через CLI, если тело содержит backticks или специальные символы, передавай его через файл: `gh issue create --body-file <file>` — это предотвратит интерпретацию шеллом и потерю форматирования.
- Списки и заголовки должны иметь пустую строку выше и ниже для корректного рендеринга в GitHub.

Пример корректного тела issue:

```md
Goal:
- Сделать X

Notes:
- Использовать `fileStore` и `platform` API.

Acceptance:
- [ ] X реализовано
```

## 5) Команды `gh` (практика)

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

## 6) Commit и Push чеклист
Перед `commit`:
- Убедись, что есть активный issue (`#<id>`) и задача в `status:in-progress`.
- Проверь, меняется ли поведение; если да, обнови `spec.md` по процессу.
- Проверь, что изменения и формулировка коммита соответствуют цели issue.

Перед `push`:
- Убедись, что локальная ветка связана с issue (предпочтительно через `gh issue develop <id> --checkout`).
- Проверь, что изменения готовы к PR и не ломают трассируемость `issue -> PR -> code`.

Пример:
```bash
gh issue develop 123 --checkout
git add -A
git commit -m "feat(memory): implement summary storage"
git push -u origin HEAD
```

## 7) Связка с PR
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

## 8) Ожидаемое поведение агента
- Читай релевантные требования перед изменениями.
- Не заполняй недостающие критерии молча; сначала проводи Q&A.
- При неоднозначности требований предлагай `spec(...)` issue.
- При смене статуса сохраняй ровно один `status:*` label.
- Перед commit/push проверяй связность: задача, статус, Spec, PR-трассировка.
