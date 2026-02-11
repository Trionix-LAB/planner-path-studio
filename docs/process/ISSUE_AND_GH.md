Я отвечу как **world-famous PhD по software architecture и AI-assisted engineering**, лауреат **ACM SIGSOFT Distinguished Paper Award**.

Ниже — **финальный, цельный документ процесса**, рассчитанный на маленький проект с ИИ-агентами.
Его можно сохранить как `PROCESS.md` в корне репозитория.

---

# ENGINEERING PROCESS

## 1. Цель

Создать максимально простой, формальный и автоматизируемый процесс разработки, который:

* одинаково понятен людям и ИИ-агентам
* использует GitHub как единственный источник правды
* обеспечивает трассируемость:
  **требование → issue → PR → код**
* не требует доски (Projects не используются)

---

# 2. Структура репозитория

Минимальная обязательная структура:

```
README.md
docs/
  PROCESS.md
spec/
  spec.md
  adr/
src/
.github/
```

---

## 2.1 README.md

Содержит:

* краткое описание проекта
* ссылку на `PROCESS.md`
* как запустить тесты
* как работать с проектом локально

---

## 2.2 spec.md (единственный файл требований)

Это **контракт системы**.

Все требования поведения живут только здесь.

---

## 2.3 adr/

Содержит архитектурные решения.

Формат файлов:

```
0001-*.md
0002-*.md
```

ADR фиксируют **почему** принято решение.
Spec фиксирует **что должна делать система**.

---

## 2.4 .github/

* ISSUE templates
* PR template
* CI workflows

---

# 3. Spec (spec.md)

## 3.1 Общие правила

1. Один файл `spec.md`
2. Каждое требование имеет уникальный ID
3. ID не меняется
4. Новые требования добавляются в конец
5. Старые можно изменять без смены ID
6. Требование — атомарное

---

## 3.2 Формат требования

```md
# System Requirements

## R-001
Agent MUST have short-term memory (STM).

## R-002
STM MUST be cleared between tasks.
```

---

## 3.3 Правила формулировки

* Использовать MUST / SHOULD / MAY
* Короткие предложения
* Без рассуждений
* Без исторических комментариев
* Один пункт = одно требование

---

## 3.4 Изменение требований

### Новое требование

Добавляется в конец:

```md
## R-013
Agent MUST validate tool output schema before use.
```

### Изменение

Правится текст под тем же ID.

### Удаление

Не удаляется. Делается deprecated:

```md
## R-007 (DEPRECATED)
Replaced by R-013.
```

---

# 4. Issues

Issue — атом работы.

Projects не используются.
Состояние управляется только через labels.

---

## 4.1 Labels

Обязательные:

* `status:backlog`
* `status:todo`
* `status:in-progress`
* `status:done` (опционально)

У issue всегда ровно один статус.

---

## 4.2 Формат заголовка issue

```
<kind>(<area>): <summary>
```

### kind

* idea
* spec
* feat
* fix
* chore
* docs

### area (пример)

* agent
* memory
* tools
* api
* infra
* test

Пример:

```
feat(memory): implement R-004 summary storage
fix(memory): STM not cleared between tasks
spec(agent): introduce new reasoning constraint
```

---

## 4.3 Тело issue

Обязательно для `status:todo`:

```md
Kind: feat
Area: memory
Spec: R-004

Goal:
- Implement summary storage

Acceptance:
- [ ] Summary stored in LTM
- [ ] STM cleared
```

---

## 4.4 Definition of Ready (для status:todo)

Issue можно перевести в `status:todo`, если:

* есть Spec ссылка (или явно новый requirement)
* есть Acceptance критерии
* нет открытых вопросов
* задача атомарная

---

# 5. Pull Requests

PR — единственный способ изменить систему.

---

## 5.1 Обязательные правила

* PR всегда содержит ссылку:

  ```
  Fixes #123
  ```
* Если PR меняет поведение → он обязан менять `spec.md`
* Если PR реализует существующее требование → spec можно не менять

---

## 5.2 Описание PR

Минимально:

```
Fixes #123
Spec: R-004
```

---

# 6. ADR

Создаётся, если:

* есть несколько вариантов решения
* выбор влияет на будущее
* решение не очевидно

Формат:

```md
# ADR-0003: Memory storage

Context:
Decision:
Consequences:
```

---

# 7. Полный жизненный цикл

1. Идея → `idea(...)` → `status:backlog`
2. Оформление → `status:todo`
3. Работа → `status:in-progress`
4. PR → merge
5. Issue закрыт

---

# 8. gh CLI workflow

### Создать issue

```bash
gh issue create \
  --title "feat(memory): implement R-004" \
  --label "status:backlog"
```

### Перевести в todo

```bash
gh issue edit 123 \
  --remove-label "status:backlog" \
  --add-label "status:todo"
```

### Взять в работу

```bash
gh issue edit 123 \
  --remove-label "status:todo" \
  --add-label "status:in-progress" \
  --add-assignee "@me"
```

### Создать ветку

```bash
gh issue develop 123 --checkout
```

### Создать PR

```bash
gh pr create --fill --body "Fixes #123"
```

### Merge

```bash
gh pr merge --squash --delete-branch
```

---

# 9. Инварианты процесса

* Spec — источник правды
* Todo = контракт
* PR — единственный способ изменения
* Нет скрытых требований
* Нет требований вне spec.md
* Нет изменений поведения без обновления spec

---

# 10. Правила для ИИ-агентов

Агент обязан:

1. Читать `spec.md` перед изменениями
2. Работать только с указанным `R-XXX`
3. Не изменять поведение без изменения spec
4. Создавать `spec(...)` issue при неясности требований
5. Указывать Spec ID в PR

---

# 11. Минимальная автоматизация (рекомендуется)

Можно добавить CI правило:

* Если PR меняет `src/`
* И в описании нет `Spec: R-`
* И не стоит `chore`
  → CI падает

Это гарантирует дисциплину.

---

# Итог

Процесс:

* один spec файл
* минимальные labels
* строгие ID требований
* PR = единственный механизм изменения
* gh = основной интерфейс
* идеально для маленькой команды и ИИ-агентов

---

Если хочешь, я могу следующим шагом:

* дать готовый `spec.md` шаблон
* дать `.github` templates
* написать CI workflow для enforcement
* или упростить документ ещё сильнее (если цель — ультра-lean)
