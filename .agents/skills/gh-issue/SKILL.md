---
name: gh-issue
description: Создание и управление GitHub Issues и PR по стандартам проекта (gh CLI, Conventional Commits).
---

# GitHub Issue & PR Workflow

Основано на: `docs/process/ISSUE_AND_GH.md`

## 1. Структура и создание Issue

### Формат
- **Заголовок**: `type(scope): short description` (например: `feat(integration): Zima UDP telemetry`)
- **Описание**: Что, зачем, ссылки на спецификации, чек-лист требований, критерии приёмки.
- **Метки**: `bug`, `enhancement`, `test`, `help wanted` и т.д.

### Создание через `gh`
```bash
# Создать issue из файла с описанием
gh issue create --title "type(scope): description" --body-file <path_to_body.md> --label "enhancement"

# Создать интерактивно
gh issue create --title "type(scope): description" --body "Подробное описание..." --label "bug" --assignee "@me"
```

## 2. Управление Issue

### Основные команды
- **Список открытых**: `gh issue list --state open`
- **Просмотр**: `gh issue view <NUMBER>`
- **Редактировать**: `gh issue edit <NUMBER> --add-label "test" --add-assignee "@me"`
- **Закрыть**: `gh issue close <NUMBER>`
- **Комментировать**: `gh issue comment <NUMBER> --body "Текст комментария"`

## 3. Работа с ветками и PR

### Именование веток
Формат: `<type>/<short-description>-<issue-number>`
Пример: `feat/zima-integration-4`

```bash
git checkout -b <branch-name>
```

### Сообщения коммитов (Conventional Commits)
Формат: `<type>(<scope>): <short summary>`
Footer: `Closes #<issue>` (для авто-закрытия)

Пример:
```bash
git commit -m "feat(zima): add UDP listener (Closes #4)"
```

### Создание PR
Укажите `Closes #<issue>` в теле PR.

```bash
git push -u origin HEAD
gh pr create --fill --base main
# ИЛИ вручную
gh pr create --title "feat(zima): implement service" --body "Implements X. Closes #4" --base main
```

## 4. Шпаргалка
- `gh issue list`
- `gh issue view <id>`
- `gh pr create --fill`
- `gh pr list`
