import { useEffect, useState } from 'react';
import { MapView } from './components/MapView';
import { ControlPanel } from './components/ControlPanel';
import { MaritimeGraph } from './lib/GraphEngine';

function App() {
    const [graph] = useState(() => new MaritimeGraph());
    const [isGraphLoaded, setIsGraphLoaded] = useState(false);
    const [selectionMode, setSelectionMode] = useState<'origin' | 'destination' | null>(null);

    const [originId, setOriginId] = useState<string | null>(null);
    const [destId, setDestId] = useState<string | null>(null);
    const [debugInfo, setDebugInfo] = useState<string | null>(null);

    const [startDate, setStartDate] = useState<string>("");
    const [shipPosition, setShipPosition] = useState<[number, number] | null>(null);
    const [isPlayback, setIsPlayback] = useState(false);
    const [playbackHours, setPlaybackHours] = useState(0);

    const [pathEdgeIds, setPathEdgeIds] = useState<Set<string>>(new Set());
    const [routeStats, setRouteStats] = useState<{ dist: number; chokepoints: { name: string; distance: number }[] } | null>(null);
    const [refresh, setRefresh] = useState(0); // Trigger re-render for graph updates

    useEffect(() => {
        graph.loadGraph('/data/graph.json').then(() => {
            setIsGraphLoaded(true);
        });
    }, [graph]);

    // Ship Simulation Effect

    // Recalculate route when inputs change
    const [routeSegments, setRouteSegments] = useState<[number, number][][]>([]);

    useEffect(() => {
        if (originId && destId && isGraphLoaded) {
            if (originId === destId) {
                setPathEdgeIds(new Set());
                setRouteStats(null);
                setRouteSegments([]);
                return;
            }

            console.log(`Calculating route from ${originId} to ${destId}`);
            const result = graph.findPath(originId, destId);
            if (result) {
                const edgeIds = new Set(result.edges.map(e => e.lane_id));

                // Extract unique chokepoints with cumulative distance
                const chokepoints: { name: string; distance: number }[] = [];
                let currentDist = 0;
                const seenChokepoints = new Set<string>();

                result.edges.forEach(edge => {
                    if (edge.chokepoints && edge.chokepoints.length > 0) {
                        edge.chokepoints.forEach(cp => {
                            if (!seenChokepoints.has(cp)) {
                                seenChokepoints.add(cp);
                                chokepoints.push({ name: cp, distance: currentDist });
                            }
                        });
                    }
                    currentDist += edge.dist_km;
                });

                setPathEdgeIds(edgeIds);
                setRouteStats({ dist: result.totalDist, chokepoints });
                setRouteSegments(result.segments);
            } else {
                setPathEdgeIds(new Set());
                setRouteStats(null);
                setRouteSegments([]);
            }
        } else {
            setPathEdgeIds(new Set());
            setRouteStats(null);
            setRouteSegments([]);
        }
    }, [originId, destId, isGraphLoaded, graph, refresh]);

    // Actual Simulation Effect
    useEffect(() => {
        if (isPlayback) return;
        if (!routeSegments.length || !startDate) {
            setShipPosition(null);
            return;
        }

        const interval = setInterval(() => {
            const start = new Date(startDate).getTime();
            const now = new Date().getTime();
            const elapsedHours = (now - start) / (1000 * 60 * 60);

            if (elapsedHours < 0) {
                setShipPosition(null);
                return;
            }

            const speedKmH = 40.74; // 22 knots
            const distTravelled = elapsedHours * speedKmH;

            const position = graph.getPointAlongRoute(routeSegments, distTravelled);
            setShipPosition(position);
        }, 1000); // Update every second

        return () => clearInterval(interval);
    }, [startDate, routeSegments, graph, isPlayback]);

    useEffect(() => {
        if (!isPlayback) return;
        if (!routeSegments.length || !routeStats) {
            setShipPosition(null);
            return;
        }

        const speedKmH = 40.74; // 22 knots
        const stepHours = 1; // Playback step size
        const intervalMs = 15; // Playback interval
        const totalHours = routeStats.dist / speedKmH;

        const interval = setInterval(() => {
            setPlaybackHours(prev => {
                const next = prev + stepHours;
                const wrapped = next > totalHours ? 0 : next;
                const distTravelled = wrapped * speedKmH;
                const position = graph.getPointAlongRoute(routeSegments, distTravelled);
                setShipPosition(position);
                return wrapped;
            });
        }, intervalMs);

        return () => clearInterval(interval);
    }, [isPlayback, routeSegments, routeStats, graph]);

    const togglePlayback = () => {
        if (!isPlayback) {
            const now = Date.now();
            const start = startDate ? new Date(startDate).getTime() : now;
            const elapsedHours = Math.max(0, (now - start) / (1000 * 60 * 60));
            setPlaybackHours(elapsedHours);
        }
        setIsPlayback(prev => !prev);
    };

    const handlePortClick = (portId: string) => {
        const portName = graph.ports[portId]?.name || "Unknown";
        setDebugInfo(`Clicked: ${portName} (${portId}) | Mode: ${selectionMode}`);
        console.log(`HandlePortClick: ${portName} (${portId}) | Mode: ${selectionMode}`);

        if (selectionMode === 'origin') {
            setOriginId(portId);
            setSelectionMode(null);
        } else if (selectionMode === 'destination') {
            setDestId(portId);
            setSelectionMode(null);
        } else {
            // Toggle Closed
            graph.togglePort(portId);
            setRefresh(prev => prev + 1);
        }
    };

    const handleChokepointClick = (name: string) => {
        graph.toggleChokepoint(name);
        setRefresh(prev => prev + 1);
    };

    const getPortName = (id: string | null) => {
        if (!id) return null;
        const port = graph.ports[id];
        return port ? `${port.name} (${id})` : id;
    };

    const reset = () => {
        graph.disabledPorts.clear();
        graph.disabledChokepoints.clear();
        setOriginId(null);
        setDestId(null);
        setPathEdgeIds(new Set()); // Clear highlighted path
        setRouteSegments([]);
        setShipPosition(null);
        setStartDate("");
        setRefresh(prev => prev + 1);
    }

    if (!isGraphLoaded) return <div className="flex items-center justify-center h-screen bg-sea text-blue-800">Loading Digital Twin...</div>;

    return (
        <div className="relative w-full h-full">
            <ControlPanel
                onSelectMode={setSelectionMode}
                selectionMode={selectionMode}
                origin={getPortName(originId)}
                destination={getPortName(destId)}
                routeStats={routeStats}
                onReset={reset}
                graphStats={{ ports: Object.keys(graph.ports).length, routes: graph.adjList ? Object.keys(graph.adjList).length : 0 }}
                startDate={startDate}
                onStartDateChange={setStartDate}
                isPlayback={isPlayback}
                onTogglePlayback={togglePlayback}
            />
            <MapView
                graph={graph}
                onPortClick={handlePortClick}
                onChokepointClick={handleChokepointClick}
                pathEdgeIds={pathEdgeIds}
                originId={originId}
                destId={destId}
                shipPosition={shipPosition}
            />
            {selectionMode && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-bold z-20 animate-bounce">
                    Select {selectionMode === 'origin' ? 'Origin' : 'Destination'} Port on Map
                </div>
            )}
            {debugInfo && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded shadow-lg text-sm font-mono z-20">
                    DEBUG: {debugInfo}
                </div>
            )}
            {originId && destId && originId === destId && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded shadow-lg text-sm font-bold z-20">
                    Origin and Destination cannot be the same.
                </div>
            )}
            {originId && destId && originId !== destId && !routeStats && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-orange-500 text-white px-4 py-2 rounded shadow-lg text-sm font-bold z-20">
                    No feasible route (blocked)
                </div>
            )}
            {shipPosition && startDate && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded shadow-lg text-sm font-bold z-20">
                    Ship En Route: {shipPosition[0].toFixed(4)}, {shipPosition[1].toFixed(4)}
                </div>
            )}
        </div>
    );
}

export default App;
