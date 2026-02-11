# Repository Guidelines (Quick)

## Source of truth
- Process: see `docs/PROCESS.md`.
- Requirements (MVP behavior/scope/perf): see `spec/spec.md`.
- Screens/flows (UX): see `docs/screens.md`.
- On-disk mission format (mission.json/CSV/GeoJSON): see `docs/mission-format.md`.

Rule of thumb: if something is described in those docs, do not restate it here—link to it and implement exactly what’s written.

## Where code lives
- App: `src/`
- Pages/routes: `src/pages/`
- Domain/features: `src/features/`
- UI components: `src/components/` (reusable UI in `src/components/ui/`)
- Platform layer (web/electron): `src/platform/`
- Tests: `src/test/`

## Engineering rules
- Prefer minimal, spec-driven changes; avoid “nice-to-haves” unless explicitly requested.
- Keep platform-specific APIs behind `src/platform/*`.
- Follow existing file/style conventions in the touched file.

## Commands
- Dev: `npm run dev`
- Test: `npm run test`
- Lint: `npm run lint`
- Build: `npm run build`

## PR hygiene (summary)
- Work should be traceable: requirement → issue → PR → code (details in `docs/PROCESS.md`).
- If behavior changes, update `spec/spec.md` accordingly.
