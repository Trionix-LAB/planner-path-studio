# Planner Path Studio (Trionix Planner)

UI prototype for mission planning/recording built with:
- Vite + React + TypeScript
- Tailwind + shadcn-ui
- Leaflet (react-leaflet)

## Development

```sh
npm i
npm run dev
```

## Tests / Lint

```sh
npm run test
npm run lint
```

## Electron Readiness

The codebase is structured to keep platform-specific capabilities (filesystem dialogs, devices, offline tiles)
behind the `src/platform/*` interface. Today it uses a web implementation; an Electron implementation can be
introduced later without rewriting the UI.

