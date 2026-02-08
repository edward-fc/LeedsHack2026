import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { GraphIndex } from '../domain/graph/GraphIndex';
import { DijkstraRouter } from '../domain/routing/Dijkstra';
import { SimulationTimeline } from '../domain/simulation/timeline';
import { getPointAlongRoute, getRouteLengthKm } from '../utils/geo';
import { predictChokepointDelay } from '../utils/chokepointDelay';
import { RouteResult, WeatherConfig, DelayPrediction, ChokepointDelayInfo } from '../domain/types';

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
    chokepointDelayInfo: Record<string, ChokepointDelayInfo>;

    // Hover
    hoveredChokepoint: string | null;

    // Weather
    weatherConfig: WeatherConfig;

    // Panama Canal Delay Prediction
    panamaCanalDelay: DelayPrediction | null;

    // Suez Canal Delay Prediction
    suezCanalDelay: DelayPrediction | null;

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
    setChokepointDelayInfo: (info: Record<string, ChokepointDelayInfo>) => void;
    setWeatherConfig: (config: WeatherConfig) => void;
    setPanamaCanalDelay: (prediction: DelayPrediction | null) => void;
    setSuezCanalDelay: (prediction: DelayPrediction | null) => void;
    setHoveredChokepoint: (name: string | null) => void;
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
    const [chokepointDelayInfo, setChokepointDelayInfo] = useState<Record<string, ChokepointDelayInfo>>({});
    const [hoveredChokepoint, setHoveredChokepoint] = useState<string | null>(null);
    const [weatherConfig, setWeatherConfig] = useState<WeatherConfig>({
        visible: false,
        provider: 'openweathermap',
        type: 'clouds',
        opacity: 0.5
    });
    const [panamaCanalDelay, setPanamaCanalDelay] = useState<DelayPrediction | null>(null);
    const [suezCanalDelay, setSuezCanalDelay] = useState<DelayPrediction | null>(null);

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

    // Calculate Route and Auto-Set Chokepoint Delays
    useEffect(() => {
        if (!isGraphLoaded || !originId || !destId || originId === destId) {
            setRoute(null);
            return;
        }

        // Build delay penalties map from canal predictions
        const delayPenalties: Record<string, number> = {};
        if (panamaCanalDelay && panamaCanalDelay.predictedDelayHours > 0) {
            delayPenalties['Panama Canal'] = panamaCanalDelay.predictedDelayHours;
        }
        if (suezCanalDelay && suezCanalDelay.predictedDelayHours > 0) {
            delayPenalties['Suez Canal'] = suezCanalDelay.predictedDelayHours;
        }

        const result = router.findPath(originId, destId, delayPenalties);
        setRoute(result);
        setPlaybackHours(0);
        if (result) {
            const startPos = getPointAlongRoute(result.segments, 0);
            setShipPosition(startPos);

            // Ship speed assumption: 20 knots = ~37 km/h
            const SHIP_SPEED_KMH = 37;
            const departureDate = startDate ? new Date(startDate) : new Date();

            // Track cumulative distance to calculate ETA for each chokepoint on route
            let cumulativeDistance = 0;
            const newDelays: Record<string, number> = {};
            const newDelayInfo: Record<string, ChokepointDelayInfo> = {};
            const onRouteChokepoints = new Set<string>();

            // First pass: Calculate delays for chokepoints ON the route
            result.edges.forEach(edge => {
                if (edge.chokepoints && edge.chokepoints.length > 0) {
                    edge.chokepoints.forEach(cp => {
                        if (!onRouteChokepoints.has(cp)) {
                            onRouteChokepoints.add(cp);

                            // Calculate ETA based on distance traveled
                            const hoursToReach = cumulativeDistance / SHIP_SPEED_KMH;
                            const eta = new Date(departureDate.getTime() + hoursToReach * 60 * 60 * 1000);

                            // Generate weather based on ETA (simulated forecast)
                            const dayOfYear = Math.floor((eta.getTime() - new Date(eta.getFullYear(), 0, 0).getTime()) / 86400000);
                            const season = Math.sin((dayOfYear / 365) * Math.PI * 2);

                            const weather = {
                                rainfallMm: Math.max(0, 10 + season * 15 + Math.random() * 10),
                                windSpeedKmh: 15 + Math.abs(season) * 20 + Math.random() * 15,
                                visibilityKm: 8 - Math.abs(season) * 2 + Math.random() * 2
                            };

                            let delayHours = 0;
                            let reason = '';

                            if (cp === 'Panama Canal') {
                                delayHours = panamaCanalDelay?.predictedDelayHours || 0;
                                reason = panamaCanalDelay?.riskLevel === 'HIGH' ? 'High congestion and adverse weather' :
                                    panamaCanalDelay?.riskLevel === 'MEDIUM' ? 'Moderate queue length' : 'Normal operations';
                            } else if (cp === 'Suez Canal') {
                                delayHours = suezCanalDelay?.predictedDelayHours || 0;
                                reason = suezCanalDelay?.riskLevel === 'HIGH' ? 'Convoy congestion' :
                                    suezCanalDelay?.riskLevel === 'MEDIUM' ? 'Extended convoy wait' : 'Standard transit';
                            } else {
                                delayHours = predictChokepointDelay(cp, weather);
                                const reasons: string[] = [];
                                if (weather.windSpeedKmh > 35) reasons.push('High winds');
                                if (weather.visibilityKm < 6) reasons.push('Low visibility');
                                if (weather.rainfallMm > 15) reasons.push('Heavy rainfall');
                                reason = reasons.length > 0 ? reasons.join(', ') : 'Normal conditions';
                            }

                            newDelays[cp] = delayHours;
                            newDelayInfo[cp] = {
                                name: cp,
                                delayHours,
                                eta: eta.toISOString(),
                                distanceFromOrigin: Math.round(cumulativeDistance),
                                weather,
                                reason,
                                isOnRoute: true
                            };
                        }
                    });
                }
                cumulativeDistance += edge.dist_km;
            });

            // Second pass: Calculate delays for ALL chokepoints NOT on the route
            Object.entries(graph.chokepoints).forEach(([cpName]) => {
                if (!onRouteChokepoints.has(cpName)) {
                    // Use current date for off-route chokepoints
                    const now = new Date();
                    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
                    const season = Math.sin((dayOfYear / 365) * Math.PI * 2);

                    const weather = {
                        rainfallMm: Math.max(0, 10 + season * 15 + Math.random() * 10),
                        windSpeedKmh: 15 + Math.abs(season) * 20 + Math.random() * 15,
                        visibilityKm: 8 - Math.abs(season) * 2 + Math.random() * 2
                    };

                    let delayHours = 0;
                    let reason = '';

                    if (cpName === 'Panama Canal') {
                        delayHours = panamaCanalDelay?.predictedDelayHours || predictChokepointDelay(cpName, weather);
                        reason = panamaCanalDelay?.riskLevel === 'HIGH' ? 'High congestion' :
                            panamaCanalDelay?.riskLevel === 'MEDIUM' ? 'Moderate queue' : 'Normal operations';
                    } else if (cpName === 'Suez Canal') {
                        delayHours = suezCanalDelay?.predictedDelayHours || predictChokepointDelay(cpName, weather);
                        reason = suezCanalDelay?.riskLevel === 'HIGH' ? 'Convoy congestion' :
                            suezCanalDelay?.riskLevel === 'MEDIUM' ? 'Extended convoy wait' : 'Standard transit';
                    } else {
                        delayHours = predictChokepointDelay(cpName, weather);
                        const reasons: string[] = [];
                        if (weather.windSpeedKmh > 35) reasons.push('High winds');
                        if (weather.visibilityKm < 6) reasons.push('Low visibility');
                        if (weather.rainfallMm > 15) reasons.push('Heavy rainfall');
                        reason = reasons.length > 0 ? reasons.join(', ') : 'Normal conditions';
                    }

                    newDelays[cpName] = delayHours;
                    newDelayInfo[cpName] = {
                        name: cpName,
                        delayHours,
                        eta: now.toISOString(), // Current time for off-route
                        distanceFromOrigin: 0, // Not applicable
                        weather,
                        reason,
                        isOnRoute: false
                    };
                }
            });

            // Batch update all delays
            Object.entries(newDelays).forEach(([name, delay]) => {
                setChokepointDelay(name, delay);
            });
            setChokepointDelayInfo(newDelayInfo);
        }
    }, [isGraphLoaded, originId, destId, panamaCanalDelay, suezCanalDelay, refresh, graph, router]);


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
        const intervalMs = 7; // Faster update for smooth playback
        const routeLengthKm = getRouteLengthKm(route.segments);
        const totalHours = routeLengthKm / speedKmH;

        const interval = setInterval(() => {
            setPlaybackHours(prev => {
                if (!Number.isFinite(totalHours) || totalHours <= 0) {
                    setShipPosition(null);
                    return 0;
                }

                const next = prev + stepHours;
                const wrapped = next >= totalHours ? next % totalHours : next;

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
    }, [isPlayback, route, playbackHours]); // keep playback position in sync

    // Refined Implementation of combined loop
    // This block is now redundant due to the separate effects above.
    // Keeping it commented out or removing it based on final decision.
    // For now, removing it as the new effects cover its functionality.

    // Actions
    const togglePlayback = () => {
        if (!isPlayback) {
            if (route && startDate) {
                const now = Date.now();
                const start = new Date(startDate).getTime();
                const elapsedHours = Math.max(0, (now - start) / (1000 * 60 * 60));
                const routeLengthKm = getRouteLengthKm(route.segments);
                const totalHours = routeLengthKm / 40.74;
                const wrapped = totalHours > 0 ? elapsedHours % totalHours : 0;
                setPlaybackHours(wrapped);
            } else {
                setPlaybackHours(0);
            }
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
        setHoveredChokepoint(null);
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
        chokepointDelayInfo,
        hoveredChokepoint,
        weatherConfig,
        setSelectionMode,
        setOriginId,
        setDestId,
        togglePort,
        toggleChokepoint,
        setStartDate,
        setChokepointDelay,
        setChokepointDelayInfo,
        setWeatherConfig: (config: Partial<WeatherConfig>) => setWeatherConfig(prev => ({ ...prev, ...config })),
        panamaCanalDelay,
        setPanamaCanalDelay,
        suezCanalDelay,
        setSuezCanalDelay,
        setHoveredChokepoint,
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
