---
name: dev-implement-change
description: Реализовывать изменения в коде по issue и Spec, минимально и проверяемо (тесты/линт/сборка по контексту репозитория). Используй, когда пользователь просит "реализуй #123", "сделай фичу", "почини баг" и есть готовый контракт (issue в in-progress и Spec определён).
---

# Implement Code Change

Источники правил: `docs/process/PROCESS.md`, `spec/spec.md`.

## Inputs
- Номер issue (в работе) и/или `R-XXX`.

## Procedure
1. Прочитай соответствующий `R-XXX` в `spec/spec.md` перед изменениями.
2. Реализуй минимально, в рамках Acceptance у issue.
3. Если обнаружилось изменение поведения вне Spec, остановись и инициируй `spec(...)`/`spec-pr-update` по процессу.
4. Добавь/обнови тесты по месту и прогони локальные проверки (команды см. в repo guidelines/`package.json`).

## Output Contract
Верни:
- `Result`: `success` или `fail`.
- `Artifacts`: список изменённых файлов, заметки по тестам/проверкам.
- `Next`: например `pr-open-from-issue`.

