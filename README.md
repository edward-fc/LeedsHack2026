# 🚢 Maritime Digital Twin

**An interactive simulation platform for global maritime supply chain routing and disruption analysis.**

Built for **LeedsHack 2026** by the **University of Leeds** team.

---

## 🌍 The Problem

Global trade depends on maritime shipping—over **80% of international goods** travel by sea. Yet this vast network is fragile. A single chokepoint closure—like the 2021 Suez Canal blockage—can cascade into billions in economic losses and months of supply chain disruption.

**Maritime Digital Twin** provides a real-time simulation environment to:
- Visualise global shipping routes
- Model chokepoint disruptions (Suez, Panama, Hormuz, and more)
- Calculate optimal re-routing when key passages are blocked
- Simulate ship journeys with weather-aware delays

---

## 🏆 Hackathon Context

| Event | LeedsHack 2026 |
|-------|----------------|
| Team | University of Leeds |
| Track | Digital Twin / Supply Chain |
| Duration | 24 hours |

---

## ✨ Key Features

- **Interactive Global Map** — Pan, zoom, and explore 2,000+ ports and shipping lanes worldwide
- **Origin–Destination Routing** — Click to select ports; compute the shortest maritime path in real-time
- **Chokepoint Blocking** — Toggle major straits/canals off and watch the route recalculate around them
- **Weather Overlays** — Live wind, precipitation, cloud, and temperature layers via OpenWeatherMap
- **Ship Simulation** — Animate a vessel along the computed route with ETA tracking
- **ML Delay Prediction** — XGBoost-powered transit delay forecasting for Panama and Suez canals
- **Dateline-Safe Routing** — Seamless Pacific crossing without visual artefacts

---

## 🎮 Demo Overview

1. **Select Origin** — Click any port (e.g., Rotterdam, Netherlands)
2. **Select Destination** — Click another port (e.g., Shanghai, China)
3. **View Route** — The shortest path is computed and highlighted on the map
4. **Block a Chokepoint** — Toggle "Suez Canal" off in the control panel
5. **See Re-routing** — Watch the path recalculate around Africa via Cape of Good Hope
6. **Enable Weather** — Turn on the wind overlay to see real-time conditions
7. **Play Route** — Animate the ship travelling along the route with live ETA updates

---

## 🏗️ Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)              │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐   │
│  │  MapView    │   │ ControlPanel│   │ WeatherControls │   │
│  │ (MapLibre)  │   │   (React)   │   │  (Overlays)     │   │
│  └─────────────┘   └─────────────┘   └─────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                    Domain Layer                             │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐   │
│  │ GraphIndex  │   │ DijkstraA*  │   │  Simulation     │   │
│  │ (Nodes/Edges│   │  Router     │   │  Timeline       │   │
│  └─────────────┘   └─────────────┘   └─────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                    Data Sources                             │
│  [graph.json]   [OpenWeatherMap API]   [ML Backend]        │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

| Component | Purpose |
|-----------|---------|
| **GraphIndex** | Loads and indexes the maritime graph (nodes, edges, ports, chokepoints) |
| **DijkstraRouter** | A* shortest-path with dynamic edge blocking and delay penalties |
| **SimulationTimeline** | Calculates ship position at any point in time along a route |
| **WeatherLayers** | Tile-based overlays from OpenWeatherMap (free tier compliant) |

### Antimeridian Handling

Routes crossing the Pacific (longitude ±180°) require special treatment. We implement:
- **Graph Stitching** — Bridge edges connect nodes across the dateline
- **Geometry Unwrapping** — Coordinates are offset to render as a continuous line
- **Dual Rendering** — Visual artefacts are eliminated by rendering both wrapped positions

---

## 🛠️ Tech Stack

| Category | Technologies |
|----------|--------------|
| **Frontend** | React 18, TypeScript, Vite |
| **Mapping** | MapLibre GL JS (open-source) |
| **Styling** | Tailwind CSS, Lucide Icons |
| **State** | React Context + Zustand patterns |
| **Weather API** | OpenWeatherMap (free tier) |
| **ML Backend** | Python, FastAPI, XGBoost, Pandas |
| **Graph Preprocessing** | Python, GeoPandas, Shapely, NetworkX |

---

## 📊 Data Sources

| Dataset | Source | Description |
|---------|--------|-------------|
| Shipping Lanes | [Zenodo](https://zenodo.org/record/6361813) | Global maritime routes (Shapefile) |
| World Ports | Public JSON dataset | 2,000+ ports with coordinates |
| Weather Tiles | OpenWeatherMap | Real-time wind, rain, temperature |
| Chokepoints | Curated | Suez, Panama, Hormuz, Malacca, etc. |

---

## 🔧 Engineering Highlights

### 🧭 Dynamic A* Routing
- Edges through disabled chokepoints receive infinite weight
- ML-predicted delays are converted to distance penalties
- Routes recalculate in <100ms for typical queries

### 🌏 Dateline-Safe Graph
- 78 bridge edges connect nodes at ±180° longitude
- No "vertical line" artefacts on Pacific routes
- Seamless Singapore → Los Angeles routing

### ⏱️ Deterministic Simulation
- Ship position interpolated from precomputed segment distances
- Consistent playback regardless of frame rate
- ETA calculations respect chokepoint transit times

### 📦 Modular Architecture
- Domain logic separated from UI components
- Type-safe interfaces (`types.ts`) for all data structures
- Easy to extend (add new chokepoints, weather sources, etc.)

---

## ⚠️ Limitations & Future Work

### Current Limitations
- **Weather API** — Free tier limits request frequency; tiles cached where possible
- **No Live AIS** — Ship positions are simulated, not real-time vessel tracking
- **Static Graph** — Shipping lanes don't update dynamically

### Potential Extensions
- **AIS Integration** — Real-time vessel positions via MarineTraffic or AISHub
- **Ocean Currents** — Factor prevailing currents into route optimisation
- **Fuel Consumption Model** — Estimate CO₂ and bunker costs
- **Multi-Modal Logistics** — Integrate rail/road last-mile connections
- **Enhanced ML** — Delay prediction for all major chokepoints

---

## 🚀 How to Run Locally

### Prerequisites
- Node.js 18+
- Python 3.10+ (for ML backend)
- OpenWeatherMap API key (free)

### Frontend Setup

```bash
cd Front-End/maritime-twin
npm install
```

Create `.env` file:
```env
VITE_OPENWEATHER_API_KEY=your_api_key_here
```

Start development server:
```bash
npm run dev:all
```

### ML Backend Setup (Optional)

```bash
cd ML_delay/backend
pip install -r requirements.txt
python -m uvicorn app:app --reload --port 8000
```

### Access the App
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 👥 Team

**LeedsHack 2026 — University of Leeds**

| Name | Role |
|------|------|
| **Edward Falkner-Carter** | Full Stack Developer |
| **Karl Kassis** |  Full Stack Developer |
| **Kavisha Gupta** | ML Engineer |
| **Tadisa Chiwira** | Data Engineer |

---

## 📜 License

This project was developed for educational purposes as part of **LeedsHack 2026**.

All code is provided for demonstration and academic use. Shipping lane data is sourced from publicly available datasets under their respective licenses.

---

<div align="center">

**Built with ❤️ at LeedsHack 2026**

*University of Leeds*

🌊 🚢 🌍

</div>
