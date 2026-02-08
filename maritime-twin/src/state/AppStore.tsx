import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { GraphIndex } from '../domain/graph/GraphIndex';
import { DijkstraRouter } from '../domain/routing/Dijkstra';
import { SimulationTimeline } from '../domain/simulation/timeline';
import { getPointAlongRoute } from '../utils/geo';
import { RouteResult, WeatherConfig } from '../domain/types';

interface AppState {
    graph: GraphIndex;
    router: DijkstraRouter;
    isGraphLoaded: boolean;

    // Selection
    selectionMode: 'origin' | 'destination' | null;
    originId: string | null;
    destId: string | null;

    // Route
    route: RouteResult | null;
    pathEdgeIds: Set<string>;

    // Simulation
    startDate: string;
    shipPosition: [number, number] | null;

    // Delays
    chokepointDelays: Record<string, number>;

    // Weather
    weatherConfig: WeatherConfig;

    // Simulation Playback
    isPlayback: boolean;
    togglePlayback: () => void;

    // Actions
    setSelectionMode: (mode: 'origin' | 'destination' | null) => void;
    setOriginId: (id: string | null) => void;
    setDestId: (id: string | null) => void;
    togglePort: (id: string) => void;
    toggleChokepoint: (name: string) => void;
    setStartDate: (date: string) => void;
    setChokepointDelay: (name: string, delay: number) => void;
    setWeatherConfig: (config: WeatherConfig) => void;
    reset: () => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
    const [graph] = useState(() => new GraphIndex());
    const [router] = useState(() => new DijkstraRouter(graph));
    const [isGraphLoaded, setIsGraphLoaded] = useState(false);
    const [refresh, setRefresh] = useState(0); // Force update when graph mutates (toggles)

    // State
    const [selectionMode, setSelectionMode] = useState<'origin' | 'destination' | null>(null);
    const [originId, setOriginId] = useState<string | null>(null);
    const [destId, setDestId] = useState<string | null>(null);
    const [startDate, setStartDate] = useState<string>("");
    const [chokepointDelays, setChokepointDelays] = useState<Record<string, number>>({});
    const [weatherConfig, setWeatherConfig] = useState<WeatherConfig>({
        visible: false,
        provider: 'openweathermap',
        type: 'clouds',
        opacity: 0.5
    });

    // Playback State
    const [isPlayback, setIsPlayback] = useState(false);
    const [playbackHours, setPlaybackHours] = useState(0);

    // Derived State
    const [route, setRoute] = useState<RouteResult | null>(null);
    const [shipPosition, setShipPosition] = useState<[number, number] | null>(null);

    // Initial Load
    useEffect(() => {
        const load = async () => {
            try {
                const response = await fetch('/data/graph.json');
                const data = await response.json();
                graph.loadFromData(data);
                setIsGraphLoaded(true);
            } catch (e) {
                console.error("Failed to load graph", e);
            }
        };
        load();
    }, [graph]);

    // Calculate Route
    useEffect(() => {
        if (!isGraphLoaded || !originId || !destId || originId === destId) {
            setRoute(null);
            return;
        }

        // Clean delays if route changes significantly? 
        // For now keep them.

        const result = router.findPath(originId, destId);
        setRoute(result);
    }, [isGraphLoaded, originId, destId, refresh, graph, router]);

    // Simulation Loop (Real-time / Static Mode)
    useEffect(() => {
        if (!route) {
            setShipPosition(null);
            return;
        }

        const interval = setInterval(() => {
            if (isPlayback) {
                // Playback Mode handled in separate effect
            } else if (startDate) {
                // Real-time / Static Mode
                const pos = SimulationTimeline.getShipPosition(route.segments, startDate);
                setShipPosition(pos);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [route, startDate, isPlayback]);

    // Playback Loop
    useEffect(() => {
        if (!isPlayback || !route) {
            return;
        }

        const speedKmH = 40.74; // 22 knots
        const stepHours = 1; // Playback step size
        const intervalMs = 25; // Faster update for smooth playback
        const totalHours = route.totalDist / speedKmH;

        const interval = setInterval(() => {
            setPlaybackHours(prev => {
                const next = prev + stepHours;
                const wrapped = next > totalHours ? 0 : next;

                // Calculate position
                const distTravelled = wrapped * speedKmH;
                const pos = getPointAlongRoute(route.segments, distTravelled);
                setShipPosition(pos);

                return wrapped;
            });
        }, intervalMs);

        return () => clearInterval(interval);
    }, [isPlayback, route]);

    // Initial Playback Position Sync
    useEffect(() => {
        if (isPlayback && route) {
            const speedKmH = 40.74;
            const dist = playbackHours * speedKmH;
            const pos = getPointAlongRoute(route.segments, dist);
            setShipPosition(pos);
        }
    }, [isPlayback, route]); // run once on entry or when route changes while playing

    // Refined Implementation of combined loop
    // This block is now redundant due to the separate effects above.
    // Keeping it commented out or removing it based on final decision.
    // For now, removing it as the new effects cover its functionality.

    // Actions
    const togglePlayback = () => {
        if (!isPlayback) {
            const now = Date.now();
            const start = startDate ? new Date(startDate).getTime() : now;
            const elapsedHours = Math.max(0, (now - start) / (1000 * 60 * 60));
            setPlaybackHours(elapsedHours);
        }
        setIsPlayback(prev => !prev);
    };

    // Actions
    const togglePort = (id: string) => {
        graph.togglePort(id);
        setRefresh(prev => prev + 1);
    };

    const toggleChokepoint = (name: string) => {
        graph.toggleChokepoint(name);
        setRefresh(prev => prev + 1);
    };

    const setChokepointDelay = (name: string, delay: number) => {
        setChokepointDelays(prev => ({ ...prev, [name]: delay }));
    };

    const reset = () => {
        graph.disabledPorts.clear();
        graph.disabledChokepoints.clear();
        setOriginId(null);
        setDestId(null);
        setStartDate("");
        setChokepointDelays({});
        setRefresh(prev => prev + 1);
    };

    const pathEdgeIds = route ? new Set(route.edges.map(e => e.lane_id)) : new Set<string>();

    const value: AppState = {
        graph,
        router,
        isGraphLoaded,
        selectionMode,
        originId,
        destId,
        route,
        pathEdgeIds,
        startDate,
        shipPosition,
        chokepointDelays,
        weatherConfig,
        setSelectionMode,
        setOriginId,
        setDestId,
        togglePort,
        toggleChokepoint,
        setStartDate,
        setChokepointDelay,
        setWeatherConfig,
        reset,
        isPlayback,
        togglePlayback
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppStore() {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useAppStore must be used within an AppProvider');
    }
    return context;
}
