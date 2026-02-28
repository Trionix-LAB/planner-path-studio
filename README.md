# Planner Path Studio

> A mission planning and recording interface for underwater robotics and mapping operations

Desktop application for real-time tracking, mission planning, and data recording with support for multiple agents and telemetry devices.

**Tech Stack:** Vite + React + TypeScript, Tailwind CSS + shadcn/ui, Leaflet (OpenStreetMap)

**Live Demo:** [https://docs.trionix-lab.ru/planner-path-studio/](https://docs.trionix-lab.ru/planner-path-studio/)

---

## 🚀 Quick Start

```sh
# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at `http://localhost:8080`

---

## 📋 Engineering Process

This project follows a strict, documented engineering process designed for human-AI collaboration:

**→ Read first:** [**docs/process/PROCESS.md**](docs/process/PROCESS.md)

The process ensures traceability: **requirement → issue → PR → code**

Key principles:
- Single source of truth: `spec/spec.md` contains all system requirements
- GitHub-based workflow: issues with labels (`status:backlog`, `status:todo`, `status:in-progress`)
- Formal requirements: every requirement has a unique ID (`R-XXX`)
- PR discipline: all PRs must reference an issue and specification ID
- ADR for architectural decisions: stored in `spec/adr/`

---

## 📚 Documentation

### Core Documentation

| Document | Description |
|----------|-------------|
| [**docs/process/PROCESS.md**](docs/process/PROCESS.md) | Engineering process, issue workflow, PR guidelines |
| [**spec/spec.md**](spec/spec.md) | MVP scope, system requirements, performance targets |
| [**docs/screens.md**](docs/screens.md) | Screen layouts, navigation flows, UX specification |
| [**docs/mission-format.md**](docs/mission-format.md) | On-disk mission format (`mission.json`, GeoJSON, CSV) |
| [**docs/roadmap.md**](docs/roadmap.md) | Development roadmap and sprint planning |

### Additional Documentation

- [**docs/tasks.md**](docs/tasks.md) — Current tasks and TODO items
- [**docs/devices.md**](docs/devices.md) — Hardware device specifications
- [**docs/electron-telemetry-provider.md**](docs/electron-telemetry-provider.md) — Electron telemetry integration notes
- [**spec/adr/**](spec/adr/) — Architectural Decision Records

**Full documentation:** [`docs/`](docs/) | **Interactive dashboard:** [`docs/index.html`](https://docs.trionix-lab.ru/planner-path-studio/)

---

## 🔧 Development Tools

### Available Commands

```sh
# Development
npm run dev              # Start dev server with HMR
npm run build            # Production build
npm run build:dev        # Development build
npm run preview          # Preview production build locally

# Code Quality
npm run lint             # Run ESLint
npm run typecheck        # Run TypeScript type checking
npm run test             # Run tests once (Vitest)
npm run test:watch       # Run tests in watch mode
npm run verify           # Run all checks: typecheck + lint + test + build

# Electron Desktop App
npm run electron:dev     # Start Electron app in dev mode with HMR
npm run electron:build   # Build portable Windows executable

# Deployment
npm run deploy           # Deploy to GitHub Pages
```

### Project Structure

```
planner-path-studio/
├── src/                      # Application source code
│   ├── pages/               # Route pages (StartScreen, MapWorkspace, NotFound)
│   ├── features/            # Domain/feature modules (map, mission, telemetry)
│   ├── components/          # React components
│   │   ├── ui/             # Reusable UI components (shadcn/ui)
│   │   ├── map/            # Map-specific components
│   │   └── dialogs/        # Dialog components
│   ├── platform/            # Platform abstraction layer (web/electron)
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities and helpers
│   └── test/               # Test utilities and setup
├── docs/                    # Documentation
│   ├── process/            # Engineering process documentation
│   └── features/           # Feature specifications
├── spec/                    # System requirements and specifications
│   ├── spec.md             # Main specification file
│   └── adr/                # Architecture Decision Records
├── electron/               # Electron main process
├── tools/                  # Development tools (simulators)
└── public/                 # Static assets
```

---

## 🎮 Hardware Simulators

CLI simulators for local development and CI testing. These tools send UDP telemetry data to the application, enabling testing without physical hardware.

### Zima2R Simulator (UDP @AZMLOC/@AZMREM)

Simulates Zima2R acoustic positioning system for underwater tracking.

**Stream telemetry:**
```sh
npm run zima:sim -- --to 127.0.0.1:28127 --rate 1 --beacon-ids 1,2,3
```

**Playback scenario** (example: `scenario.json` in project root):
```sh
npm run zima:sim -- --mode playback --replay ./scenario.json --to 127.0.0.1:28127
```

**With command echo** (optional):
```sh
npm run zima:sim -- --to 127.0.0.1:28127 --command-port 28128 --command-echo true
```

**Use cases:**
- Protocol parsing validation
- Agent tracking and beacon binding (`rem_addr`)
- Connection loss and error handling
- CI automated testing

📖 **Documentation:** [docs/features/zima-simulator.md](docs/features/zima-simulator.md)

### GNSS-UDP Simulator (NMEA 0183)

Simulates GNSS compass for positioning and heading data.

**Stream NMEA messages:**
```sh
npm run gnss:sim -- --to 127.0.0.1:28128 --rate 2
```

**Playback scenario:**
```sh
npm run gnss:sim -- --mode playback --replay ./path/to/scenario.yaml --to 127.0.0.1:28128
```

**Use cases:**
- NMEA parser testing (GGA, RMC, HDT)
- Connection timeout handling
- Malformed message handling
- CI automated testing

📖 **Documentation:** [docs/features/gnss-udp-simulator.md](docs/features/gnss-udp-simulator.md)

### GNSS-COM Simulator (NMEA 0183 over Serial)

Simulates GNSS compass over serial port (COM/TTY) for `gnss-com` integration testing.

**Linux/macOS (auto virtual pair via `socat`):**
```sh
npm run gnss-com:sim
```

After start, simulator prints:
- `appPortPath` — set this exact value in Equipment -> `GNSS-COM` -> `COM-порт`
- `simulatorPortPath` — internal side used by simulator

**Windows (manual virtual COM pair):**
1. Install a virtual COM pair driver, e.g. `com0com`.
2. Create a pair (example: `COM11 <-> COM12`).
3. Start simulator on one side:
```sh
npm run gnss-com:sim -- --virtual false --port COM12 --baud 115200 --rate 2
```
4. In app set `GNSS-COM -> COM-порт` to `COM11`.

**Requirements:**
- Linux/macOS auto mode: `socat` must be installed and available in `PATH`.
- Windows: virtual COM pair tool (`com0com` or equivalent) and an existing paired COM ports.

📖 **Documentation:** [docs/features/gnss-com-simulator.md](docs/features/gnss-com-simulator.md)

### CI Integration

All simulators can be used in CI pipelines:
- Deterministic playback scenarios for reproducible tests
- Automated integration testing without hardware
- Protocol compliance validation

---

## 🧪 Testing & Quality Assurance

### Running Tests

```sh
# Run all tests once
npm run test

# Watch mode for development
npm run test:watch

# Full verification suite
npm run verify  # typecheck + lint + test + build
```

### Test Framework

- **Vitest** for unit and integration tests
- **Testing Library** for component testing
- **JSDOM** for browser environment simulation

Test files are located in `src/test/` and alongside features using `*.test.ts` or `*.spec.ts` naming.

### Linting

```sh
npm run lint
```

ESLint configuration with React hooks and TypeScript support.

---

## 🚢 Deployment

### GitHub Pages

Deploy the web version to GitHub Pages:

```sh
npm run deploy
```

This command:
1. Builds the production bundle (`npm run build`)
2. Publishes `dist/` to the `gh-pages` branch using `gh-pages` package
3. GitHub automatically hosts the content

**Live demo:** [https://docs.trionix-lab.ru/planner-path-studio/](https://docs.trionix-lab.ru/planner-path-studio/)

---

## 🖥️ Electron Desktop App

The application is platform-ready with desktop capabilities encapsulated behind `src/platform/*` interface.

### Features

- **Real file system access:** Native folder picker, mission file read/write
- **Settings persistence:** JSON storage in app data directory (`app.getPath('userData')`)
- **Security:** Context isolation enabled, IPC via preload script
- **Portable builds:** No installation required

### Development

```sh
npm install
npm run electron:dev  # Starts Vite dev server + Electron with HMR
```

### Building Windows Executable

```sh
npm run electron:build
```

Output: `release/Planner Path Studio-Portable-0.0.0.exe`

**Note:** If build fails due to OS permissions when unpacking signing tools:
- Enable **Developer Mode** in Windows, or
- Run build in administrator terminal
- Alternatively, `win.signAndEditExecutable=false` is already configured to avoid symlink issues

### What Changes in Electron

| Feature | Web Version | Electron Version |
|---------|------------|------------------|
| File System | In-memory / localStorage | Native `fs` via IPC |
| Mission Open/Save | Browser limitations | System folder picker dialog |
| Settings Storage | localStorage | JSON file in `userData` directory |
| Offline Tiles | Not available | Can be implemented with local cache |
| Device Access | Web APIs only | Full Node.js device access |

### Dual Mode Support

Both web and Electron builds work from the same codebase:
- Web: `npm run dev` → `npm run build`
- Electron: `npm run electron:dev` → `npm run electron:build`

Platform-specific code is isolated in `src/platform/` with separate implementations for web and Electron.

---

## 🏗️ Architecture

### Platform Abstraction

Platform-dependent features (file system, dialogs, device access, offline tiles) are encapsulated behind the `src/platform/*` interface:

```
src/platform/
├── PlatformInterface.ts    # Abstract interface
├── web/                     # Web implementation (localStorage, etc.)
└── electron/                # Electron implementation (Node.js APIs)
```

The UI remains unchanged across platforms, with the platform layer handling environment-specific implementations.

### Mission Data Format

Missions are stored as folder structures on disk:

```
mission-name/
├── mission.json           # Metadata, UI state, track sessions
├── tracks/
│   ├── track-001.csv     # GPS tracks with timestamps
│   └── track-002.csv
├── routes/
│   └── routes.geojson    # Planning objects (routes, survey areas, lanes)
└── markers/
    └── markers.geojson   # User markers with descriptions
```

📖 **Full specification:** [docs/mission-format.md](docs/mission-format.md)

### Coordinate Systems

- **Input/Storage:** WGS84 lat/lon (EPSG:4326)
- **Map Display:** Web Mercator (EPSG:3857) for OSM tiles
- **Measurements:** Local UTM zone for metric calculations
- **GeoJSON:** Standard `[lon, lat]` coordinate order

### Map Provider & Zoom

Map tiles and zoom behavior are configured in the platform layer (`src/platform/*`) and support environment overrides.

Optional env vars:

- `VITE_MAP_PROVIDER` - `osm` (default) or `openmarine`
- `VITE_MAP_ZOOM_SNAP` - zoom snap step (default: `1`)
- `VITE_MAP_ZOOM_DELTA` - zoom delta per action (default: `1`)
- `VITE_MAP_WHEEL_PX_PER_ZOOM_LEVEL` - wheel sensitivity (default: `120`)

`openmarine` uses OSM as base tiles and adds OpenSeaMap seamark overlay.

---

## 🤝 Contributing

1. Read [docs/process/PROCESS.md](docs/process/PROCESS.md) for engineering process
2. Check [spec/spec.md](spec/spec.md) for system requirements
3. Follow the workflow: requirement → issue → PR → code
4. All PRs must reference an issue and specification ID
5. Run `npm run verify` before submitting PRs

### Issue Labels

- `status:backlog` — Idea, not yet ready for development
- `status:todo` — Ready for implementation (Definition of Ready met)
- `status:in-progress` — Currently being worked on
- `status:done` — Completed (optional)

### Commit Format

```
<kind>(<area>): <summary>

Examples:
feat(map): implement R-042 route editing
fix(telemetry): connection timeout handling
spec(mission): clarify autosave behavior
```

---

## 📄 License

See repository license file for details.

---

## 🔗 Links

- **Repository:** [github.com/Trionix-LAB/planner-path-studio](https://github.com/Trionix-LAB/planner-path-studio)
- **Live Demo:** [docs.trionix-lab.ru/planner-path-studio](https://docs.trionix-lab.ru/planner-path-studio/)
- **Documentation Dashboard:** [docs/index.html](https://docs.trionix-lab.ru/planner-path-studio/)
- **Organization:** [Trionix LAB](https://github.com/Trionix-LAB)

---

**Built with ❤️ for underwater robotics and mapping operations**
