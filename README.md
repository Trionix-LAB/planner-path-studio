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

## Deployment

To publish the project to GitHub Pages, run:

```sh
npm run deploy
```

**How it works:**
1. Runs `npm run build` to create a production bundle in the `dist` folder.
2. Uses the `gh-pages` package to push the `dist` content to the `gh-pages` branch.
3. GitHub automatically hosts the content from that branch.

Live Demo: [https://docs.trionix-lab.ru/planner-path-studio/](https://docs.trionix-lab.ru/planner-path-studio/)

## Electron Readiness

The codebase is structured to keep platform-specific capabilities (filesystem dialogs, devices, offline tiles)
behind the `src/platform/*` interface. Today it uses a web implementation; an Electron implementation can be
introduced later without rewriting the UI.

