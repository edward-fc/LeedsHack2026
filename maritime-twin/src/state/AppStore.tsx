import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { GraphIndex } from '../domain/graph/GraphIndex';
import { DijkstraRouter } from '../domain/routing/Dijkstra';
import { SimulationTimeline } from '../domain/simulation/timeline';
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

    // Simulation Loop
    useEffect(() => {
        if (!route || !startDate) {
            setShipPosition(null);
            return;
        }

        const interval = setInterval(() => {
            const pos = SimulationTimeline.getShipPosition(route.segments, startDate);
            setShipPosition(pos);
        }, 1000);

        return () => clearInterval(interval);
    }, [route, startDate]);

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
        reset
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
