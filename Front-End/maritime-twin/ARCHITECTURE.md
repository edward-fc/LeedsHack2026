# Maritime Digital Twin Architecture

## Overview
This application is a digital twin of the global maritime transport network. It visualizes shipping lanes, ports, and chokepoints, allowing users to simulate routes, disruptions, and environmental conditions.

## Tech Stack
- **Frontend**: React, TypeScript, Vite
- **Map Engine**: MapLibre GL JS (via `maplibre-gl`)
- **State Management**: React Context (`AppStore`)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React

## Directory Structure
```
src/
├── domain/             # Core business logic and types (Platform Agnostic)
│   ├── graph/          # Graph data structures (GraphIndex)
│   ├── routing/        # Pathfinding algorithms (Dijkstra, PriorityQueue)
│   ├── simulation/     # Simulation logic (Timeline, Ship movement)
│   └── types.ts        # Shared interfaces (Domain Language)
├── state/              # Application State (React Context)
│   └── AppStore.tsx    # Central store for Graph, Route, and UI state
├── ui/                 # UI Components
│   ├── components/     # Reusable widgets (ControlPanel, WeatherControls)
│   └── layouts/        # Page layouts (MainLayout)
├── map/                # Map-specific logic
│   ├── hooks/          # Custom hooks for map layers (useWeatherLayer)
│   └── layers/         # (Optional) Layer definitions
├── utils/              # Shared utilities
│   └── geo.ts          # Geometric calculations (Haversine, Interpolation)
└── App.tsx             # Root component (Providers)
```

## Key Concepts

### 1. Domain Layer (`src/domain`)
The domain layer is pure TypeScript and contains the "brains" of the application. It is decoupled from React.
- **GraphIndex**: An optimized index of the network graph (Adjacency List, Node lookup).
- **DijkstraRouter**: Implements pathfinding logic. It interacts with `GraphIndex` but is stateless.
- **SimulationTimeline**: Pure functions to calculate ship positions based on time.

### 2. State Layer (`src/state`)
`AppStore` is the single source of truth for the application.
- Loads the graph data on mount.
- Orchestrates interactions between the Router, Simulation, and UI.
- Exposes actions like `setOriginId`, `toggleChokepoint`, `setWeatherConfig`.

### 3. UI Layer (`src/ui`)
Components are "dumb" regarding logic; they consume data and actions from `AppStore`.
- **MainLayout**: Composition root.
- **MapView**: Renders the MapLibre instance and synchronizes it with the Store state (React -> Mapbox binding).
- **ControlPanel**: Dashboard for user interaction.

## Data Flow
1. **User Action**: User clicks a port in `MapView`.
2. **Action Dispatch**: `mapView` calls `setOriginId(id)` from `AppStore`.
3. **State Update**: `AppStore` updates `originId`.
4. **Effect Trigger**: `AppStore` detects change in `originId` and `destId`.
5. **Domain Logic**: `AppStore` calls `router.findPath()`.
6. **State Update**: `route` state is updated with new geometry and stats.
7. **Render**: `MapView` draws the new path; `ControlPanel` updates statistics.

## Extensibility
- **New Layers**: Add a hook in `src/map/hooks` and consume it in `MapView`.
- **New Simulation Features**: Add logic to `src/domain/simulation` and expose state in `AppStore`.
