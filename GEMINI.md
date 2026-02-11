# Repository Guidelines

## Product Docs (source of truth)
- MVP product/UX requirements live in `spec/`:
  - `spec/spec.md` - map MVP scope, behaviors, performance targets.
  - `docs/screens.md` - screens, layout, navigation flows.
  - `docs/mission-format.md` - on-disk mission folder + `mission.json`/CSV/GeoJSON formats.
- When implementing mission persistence, geometry, or UI flows, prefer the rules in `spec/` and `docs/` over assumptions.

## Project Structure & Module Organization
- App source lives in `src/`.
- Route pages: `src/pages` (`StartScreen`, `MapWorkspace`, `NotFound`).
- Feature/domain types: `src/features` (for example `src/features/map/model/types.ts`).
- Reusable UI blocks: `src/components/ui` (shadcn-based), domain UI in `src/components/map` and `src/components/dialogs`.
- Platform abstraction layer: `src/platform` (web implementation now, Electron implementation later).
- Utilities and hooks: `src/lib`, `src/hooks`.
- Tests: `src/test` (`*.test.ts` / `*.spec.ts`).
- Static assets: `public/`.

## Domain & Data Conventions (MVP)

### Core entities (naming)
- Prefer terminology from `spec/spec.md`: base station, diver, track, route, survey area, lane, marker, layer, mission, draft.
- When persisting to GeoJSON, use `kind` values from `docs/mission-format.md` (`route`, `survey_area`, `lane`, `marker`).

### Coordinates & Projections
- Input coordinates and all stored data use WGS84 lat/lon.
- OSM tiles are Web Mercator (EPSG:3857); convert as needed only at the rendering/measurement layer.
- GeoJSON coordinate order is `[lon, lat]` (standard GeoJSON).
- Coordinate display defaults (per docs): decimal degrees with 6 digits after the decimal point.
- Meter grid (if implemented) should be computed in meters in a local UTM zone and rendered back in WGS84; small visual error is acceptable for MVP (see `spec/spec.md`).

### Mission persistence (on-disk format)
- Mission is a folder containing at least `mission.json`, `tracks/*.csv`, `routes/routes.geojson`, `markers/markers.geojson` (see `docs/mission-format.md`).
- `mission.json`:
  - UTF-8 JSON, `schema_version` (MVP = `1`), ISO-8601 UTC timestamps with `Z`.
  - Store UI state in `ui` (follow mode, layer visibility, map view, measurement settings, styles) when available.
  - Track session metadata lives in `tracks[]`; only one `active_track_id` at a time (or `null`).
- Tracks (`tracks/*.csv`):
  - CSV with headers, `timestamp,lat,lon,segment_id` required; optional `depth_m,sog_mps,cog_deg`.
  - Connection loss increments `segment_id` within a track; pause/finish closes the track (sets `ended_at`).
- Planning objects (GeoJSON):
  - `routes/routes.geojson` stores `kind=route` (LineString), `kind=survey_area` (Polygon), and derived `kind=lane` (LineString).
  - `markers/markers.geojson` stores `kind=marker` (Point) with `description`.
- Compatibility: if opening a mission with a newer `schema_version`, show a clear error and avoid partial parsing.
- Parallel open protection: prefer a `mission.lock` file approach as described in `docs/mission-format.md`.

### Draft mode
- Draft state is “unsaved mission”. Autosave/restore behavior is described in `spec/spec.md` and `docs/screens.md`.
- Keep draft storage behind `src/platform/*` (do not write to the repo workspace).

## UX & Interaction Notes (MVP)
- Platform assumption: desktop (mouse + keyboard); touch support is optional (see `docs/screens.md`).
- Key screens and flows:
  - `StartScreen`: new mission / open mission / draft / restore draft (if available).
  - `MapWorkspace`: map-centric layout (toolbar + HUD/status + layers manager), with “heavy” actions under “Mission” controls.
- Prefer explicit, non-blocking feedback for connection loss, paused recording, and file errors.

## Performance Targets (MVP)
- Track rendering should target up to ~200k points without UI stalls; consider geometry simplification by zoom if needed (see `spec/spec.md`).
- Planning geometry should stay responsive up to ~1k total vertices (routes + polygons).

## Build, Test, and Development Commands
- `npm run dev` - start Vite dev server.
- `npm run build` - production build to `dist/`.
- `npm run preview` - preview built app locally.
- `npm run lint` - run ESLint on the codebase.
- `npm run test` - run Vitest once.
- `npm run test:watch` - run Vitest in watch mode.

## Coding Style & Naming Conventions
- Language: TypeScript + React function components.
- Indentation: 2 spaces; prefer single quotes in existing TSX files unless file style differs.
- Use path alias `@` for imports from `src` (configured in `vite.config.ts` and `tsconfig*`).
- Components/files: `PascalCase` for React components, `kebab-case` only for shadcn file names already present.
- Keep platform-specific APIs behind `src/platform/*`; avoid direct filesystem/device calls in UI components.
- Linting: ESLint (`eslint.config.js`), Tailwind via project config.

## Testing Guidelines
- Framework: Vitest + Testing Library (`vitest.config.ts`, `src/test/setup.ts`).
- Place tests near `src/test` or alongside features using `*.test.ts(x)` / `*.spec.ts(x)`.
- Cover user-visible behavior and map/mission state transitions, not only snapshots.
- Run `npm run test` and `npm run lint` before opening a PR.

## Commit & Pull Request Guidelines
- Current history is inconsistent (`Changes`, feature commits). Use clear imperative messages going forward.
- Recommended format: `type(scope): short summary`, e.g. `feat(map): add route drawing finalize action`.
- Keep commits focused and atomic.
- PRs should include:
  - What changed and why.
  - Linked issue/task (if available).
  - Notes on test/lint/build status and any known limitations.
