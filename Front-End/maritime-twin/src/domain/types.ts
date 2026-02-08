/**
 * Shared Domain Types
 * These contracts define the shape of data used across the application.
 */

export interface GeoPoint {
    lat: number;
    lon: number;
}

export interface Node {
    id: string;
    lat: number;
    lon: number;
}

export interface Edge {
    source: string;
    target: string;
    dist_km: number;
    geometry: [number, number][]; // [lon, lat]
    chokepoints: string[];
    lane_id: string;
}

export interface Port {
    id: string;
    name: string;
    country: string;
    lat: number;
    lon: number;
    node_id: string;
    dist_to_node: number;
}

export interface Chokepoint {
    name: string;
    lat: number;
    lon: number;
}

export interface GraphData {
    nodes: Record<string, Node>;
    edges: Edge[];
    ports: Record<string, Port>;
    chokepoints: Record<string, Chokepoint>;
}

export interface RouteResult {
    pathNodeIds: string[];
    edges: Edge[];
    totalDist: number;
    segments: [number, number][][];
    geometry: [number, number][]; // Full ordered linestring
}

export interface SimulationState {
    startDate: string | null;
    shipPosition: [number, number] | null;
}

export interface AppState {
    graph: GraphData | null;
    isGraphLoaded: boolean;
    selection: {
        originId: string | null;
        destId: string | null;
    };
    blockades: {
        ports: Set<string>;
        chokepoints: Set<string>;
    };
    route: RouteResult | null;
    simulation: SimulationState;
}

export type WeatherProvider = 'openweathermap' | 'rainviewer';
export type WeatherType = 'clouds' | 'precipitation' | 'wind' | 'temp';

export interface WeatherConfig {
    visible: boolean;
    provider: WeatherProvider;
    type: WeatherType;
    opacity: number;
}

// ML Delay Prediction Types
export type VesselType = 'Panamax' | 'Neopanamax';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface DelayConfig {
    queueLength: number;
    isBooked: boolean;
    vesselType: VesselType;
    vesselBeamM: number;
    vesselLengthM: number;
    vesselDraftM: number;
}

export interface DelayPrediction {
    isDelayed: boolean;
    probability: number;
    predictedDelayHours: number;
    riskLevel: RiskLevel;
    fetchedAt: string; // ISO timestamp
}

export interface PanamaWeather {
    rainfallMm: number;
    windSpeedKmh: number;
    visibilityKm: number;
    gatunLakeLevelM: number; // Simulated for now
    fetchedAt: string;
}

// Detailed chokepoint delay info for hover display
export interface ChokepointDelayInfo {
    name: string;
    delayHours: number;
    eta: string; // ISO date when ship arrives at chokepoint
    distanceFromOrigin: number; // km
    weather: {
        rainfallMm: number;
        windSpeedKmh: number;
        visibilityKm: number;
    };
    reason: string; // Human-readable reason for delay
    isOnRoute: boolean; // Whether this chokepoint is on the current route
}
