import { useEffect, useState, useMemo } from 'react';
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

    const [pathEdgeIds, setPathEdgeIds] = useState<Set<string>>(new Set());
    const [routeStats, setRouteStats] = useState<{ dist: number } | null>(null);
    const [refresh, setRefresh] = useState(0); // Trigger re-render for graph updates

    useEffect(() => {
        graph.loadGraph('/data/graph.json').then(() => {
            setIsGraphLoaded(true);
        });
    }, [graph]);

    // Recalculate route when inputs change
    useEffect(() => {
        if (originId && destId && isGraphLoaded) {
            if (originId === destId) {
                setPathEdgeIds(new Set());
                setRouteStats(null);
                return;
            }

            console.log(`Calculating route from ${originId} to ${destId}`);
            const result = graph.findPath(originId, destId);
            if (result) {
                // Extract edge IDs from result.edges
                // Assuming edge has a unique ID (lane_id) or we construct one?
                // Edge interface has `lane_id`.
                const edgeIds = new Set(result.edges.map(e => e.lane_id));
                setPathEdgeIds(edgeIds);
                setRouteStats({ dist: result.totalDist });
            } else {
                setPathEdgeIds(new Set());
                setRouteStats(null);
                // Could show "No Route" toast
            }
        } else {
            setPathEdgeIds(new Set());
            setRouteStats(null);
        }
    }, [originId, destId, isGraphLoaded, graph, refresh]); // Depend on refresh for closure updates

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
            />
            <MapView
                graph={graph}
                onPortClick={handlePortClick}
                onChokepointClick={handleChokepointClick}
                pathEdgeIds={pathEdgeIds}
                originId={originId}
                destId={destId}
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
        </div>
    );
}

export default App;
