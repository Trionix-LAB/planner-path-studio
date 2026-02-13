# Релизы (Electron Windows portable)

Этот репозиторий публикует релизные артефакты Electron-приложения через GitHub Actions.
Требования см. в [spec/spec.md](../spec/spec.md) (R-047).

## Что делает workflow

Workflow: [`.github/workflows/release.yml`](../.github/workflows/release.yml)

- Собирает Windows portable `.exe` через `npm run electron:build`.
- Загружает артефакт как **workflow artifact**.
- Создаёт/обновляет **GitHub Release** и прикрепляет `.exe` как release asset.
- По умолчанию релиз создаётся как **draft**; публикация — только явно.

Артефакты сборки по умолчанию лежат в `release/` (см. `package.json -> build.directories.output`).

## Триггеры

### 1) Push тега `v*` (по умолчанию draft)

1. Создайте тег, например:
   - `git tag v0.1.0`
   - `git push origin v0.1.0`
2. Откройте GitHub → **Actions** → workflow **Release (Windows portable)**.
3. Убедитесь в логах, что:
   - сборка прошла,
   - `.exe` появился в `release/`,
   - артефакт загружен (Upload workflow artifact).
4. Проверьте GitHub → **Releases**: релиз будет создан/обновлён как **draft**, с прикреплённым `.exe`.

### 2) Ручной запуск `workflow_dispatch` (draft или published)

GitHub → Actions → **Release (Windows portable)** → **Run workflow**:

- `tag`: тег релиза (например `v0.1.0`) — обязателен.
- `publish`: если `true`, релиз будет **published** (draft=false). Если `false`, останется **draft**.

## Секреты и права

### Обязательно для базовой работы

- Никаких секретов не требуется: используется встроенный `GITHUB_TOKEN`.
- В настройках репозитория GitHub проверьте:
  - **Settings → Actions → General → Workflow permissions** = **Read and write permissions**
  - (если включено) разрешение на создание/изменение Releases для `GITHUB_TOKEN`.

### Опционально: подпись Windows `.exe`

Workflow выполняется без подписи по умолчанию.
Шаг подписи включается только если заданы секреты:

- `WIN_CODE_SIGN_CERT_BASE64` — содержимое `.pfx` сертификата, закодированное в base64.
- `WIN_CODE_SIGN_CERT_PASSWORD` — пароль от `.pfx`.
- `WIN_CODE_SIGN_TIMESTAMP_URL` (опционально) — URL timestamp-сервера.

Секреты добавляются в GitHub → **Settings → Secrets and variables → Actions**.
