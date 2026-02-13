# Task — chore(ci): GitHub release workflow (issue #21)

- Issue: https://github.com/Trionix-LAB/planner-path-studio/issues/21
- Status: in_progress (branch: `21-choreci-добавить-github-workflow-для-релиза-и-публикации-артефакта`)
- Kind: chore
- Area: ci
- Spec: R-047

## Summary
Добавить GitHub Actions workflow для сборки релизных артефактов Electron-приложения (на старте: Windows portable) и публикации артефактов как workflow artifact и как GitHub Release asset (draft по умолчанию).

## Description (from issue)
- Добавить GitHub Actions workflow, который автоматизирует сборку релизных артефактов (в первую очередь Windows portable .exe из Electron) и публикует их как GitHub Release asset и/или Upload Artifact.
- Обеспечить безопасное управление секретами (подпись/токены) и явное управление режимом релиза (draft vs published).

## Decisions
- Триггеры: push тега `v*` и ручной запуск `workflow_dispatch`.
- По умолчанию: при теге создаётся/обновляется draft GitHub Release и в него прикрепляются артефакты.
- Публикация: через input в `workflow_dispatch` (например `publish=true`).
- Подпись: опциональна; workflow выполняется без секретов подписи, а шаги подписи включаются только при наличии секретов.
- Scope: на старте достаточно Windows сборки (позже можно расширять на матрицу).

## Acceptance criteria
- [ ] Добавлен workflow в `.github/workflows/release.yml` (или аналогичный), запускающийся по тегу `v*` и по ручной акции (`workflow_dispatch`).
- [ ] Workflow выполняет сборку релизов (`npm run electron:build`), загружает артефакты (upload artifact) и прикрепляет их к GitHub Release (draft по умолчанию).
- [ ] В workflow есть явное управление draft->published (input/условие).
- [ ] Документация в `docs/` описывает процесс релиза и необходимые секреты (GH token, коды подписи — если используются).
- [ ] В логах CI видно, что артефакт успешно собран и загружен (upload artifact / release asset), и есть понятная инструкция для ручной проверки.

## Implementation notes
- Предпочтительно начинать с Windows runner (для portable `.exe`) и использовать upload-artifact.
- Для GitHub Release можно использовать существующий action (например, `softprops/action-gh-release` или аналог) с draft по умолчанию.
- Секреты подписи и связанные шаги должны быть условными.
