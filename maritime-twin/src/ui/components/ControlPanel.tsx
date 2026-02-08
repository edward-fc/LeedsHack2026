import { Locate, Anchor, ShieldAlert, Route as RouteIcon, Calculator } from 'lucide-react';
import { useAppStore } from '../../state/AppStore';

export function ControlPanel() {
    const {
        graph,
        selectionMode,
        setSelectionMode,
        originId,
        destId,
        route,
        startDate,
        setStartDate,
        chokepointDelays,
        setChokepointDelay,
        reset
    } = useAppStore();

    const getPortName = (id: string | null) => {
        if (!id) return null;
        const port = graph.ports[id];
        return port ? `${port.name} (${id})` : id;
    };

    const origin = getPortName(originId);
    const destination = getPortName(destId);

    // Derive Route Stats
    const routeStats = route ? (() => {
        const chokepoints: { name: string; distance: number }[] = [];
        let currentDist = 0;
        const seenChokepoints = new Set<string>();

        route.edges.forEach(edge => {
            // GraphIndex edges might differ slightly from old structure? No, Edge interface is same.
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

        return { dist: route.totalDist, chokepoints };
    })() : null;

    const graphStats = {
        ports: Object.keys(graph.ports).length,
        routes: Object.keys(graph.adjList).length
    };

    const formatETA = (distKm: number, delayHours: number = 0) => {
        if (!startDate) return null;
        const speedKmH = 40.74; // 22 knots
        const travelHours = distKm / speedKmH;
        const start = new Date(startDate).getTime();
        const eta = new Date(start + (travelHours + delayHours) * 3600 * 1000);
        return eta.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    };

    // Calculate total delay for destination
    const totalDelay = routeStats ? routeStats.chokepoints.reduce((acc, cp) => acc + (chokepointDelays[cp.name] || 0), 0) : 0;

    return (
        <div className="absolute top-4 left-4 w-80 bg-white/90 backdrop-blur-md shadow-xl rounded-xl p-4 flex flex-col gap-4 z-10 border border-gray-200">
            <h1 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                <Anchor className="w-5 h-5 text-blue-600" />
                Maritime Digital Twin
            </h1>

            {/* Stats */}
            <div className="flex justify-between text-xs text-slate-500 px-1">
                <span>{graphStats.ports} Ports</span>
                <span>{graphStats.routes} Routes</span>
            </div>

            <hr className="border-slate-200" />

            {/* Routing Controls */}
            <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase text-slate-400">Route Planning</label>

                <button
                    onClick={() => setSelectionMode(selectionMode === 'origin' ? null : 'origin')}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm border transition-colors ${selectionMode === 'origin' ? 'bg-blue-100 border-blue-400 text-blue-800' : 'bg-white border-slate-300 hover:bg-slate-50'
                        }`}
                >
                    <span className="flex items-center gap-2">
                        <Locate className="w-4 h-4" />
                        {origin || "Select Origin"}
                    </span>
                    {origin && <span className="text-xs font-mono bg-blue-200 px-1 rounded">START</span>}
                </button>

                <button
                    onClick={() => setSelectionMode(selectionMode === 'destination' ? null : 'destination')}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm border transition-colors ${selectionMode === 'destination' ? 'bg-blue-100 border-blue-400 text-blue-800' : 'bg-white border-slate-300 hover:bg-slate-50'
                        }`}
                >
                    <span className="flex items-center gap-2">
                        <Locate className="w-4 h-4" />
                        {destination || "Select Destination"}
                    </span>
                    {destination && <span className="text-xs font-mono bg-green-200 px-1 rounded text-green-800">END</span>}
                </button>
            </div>

            {routeStats && (
                <div className="flex flex-col gap-2">
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                        <label className="text-xs font-semibold uppercase text-slate-400 block mb-1">Journey Start</label>
                        <input
                            type="datetime-local"
                            value={startDate}
                            max={new Date().toISOString().slice(0, 16)}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full text-sm p-1 border rounded bg-white text-slate-700"
                        />
                        {startDate && new Date(startDate) > new Date() && (
                            <div className="text-red-500 text-xs mt-1">Start date cannot be in the future</div>
                        )}
                    </div>

                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                        <div className="text-xs text-slate-500 mb-1">Optimum Route</div>
                        <div className="text-2xl font-bold text-slate-800">
                            {Math.floor(routeStats.dist / 40.74 / 24)}<span className="text-base font-normal text-slate-500 ml-1 mr-2">d</span>
                            {Math.round((routeStats.dist / 40.74) % 24)}<span className="text-base font-normal text-slate-500 ml-1">h</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1">{(routeStats.dist).toFixed(0)} km @ 22 knots</div>
                        {totalDelay > 0 && (
                            <div className="text-xs text-red-500 mt-1 font-semibold flex items-center gap-1">
                                <ShieldAlert className="w-3 h-3" />
                                Total Delay: +{totalDelay}h
                            </div>
                        )}
                    </div>

                    {/* Route Plan / Itinerary */}
                    <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <RouteIcon className="w-3 h-3 text-slate-400" />
                            <div className="text-xs font-semibold uppercase text-slate-400">Route Plan</div>
                        </div>
                        <div className="flex flex-col gap-0 relative">
                            {/* Vertical Line */}
                            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-200 -z-10"></div>

                            {/* Origin */}
                            <div className="flex items-start gap-3">
                                <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-sm shrink-0 mt-0.5"></div>
                                <div className="text-sm text-slate-700 flex-1">
                                    <span className="font-semibold text-xs text-blue-600 block">ORIGIN</span>
                                    {origin || "Unknown Port"}
                                    {startDate && <div className="text-xs text-slate-400 mt-0.5">Dep: {new Date(startDate).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>}
                                </div>
                            </div>

                            {/* Chokepoints */}
                            {routeStats.chokepoints.map((cp, idx) => {
                                // Calculate cumulative delay up to this point
                                const previousDelays = routeStats.chokepoints.slice(0, idx).reduce((acc, prevCp) => acc + (chokepointDelays[prevCp.name] || 0), 0);
                                const currentDelay = chokepointDelays[cp.name] || 0;

                                return (
                                    <div key={idx} className="flex items-start gap-3 mt-4">
                                        <div className="w-4 h-4 rounded-full bg-yellow-400 border-2 border-slate-600 shadow-sm shrink-0 mt-0.5"></div>
                                        <div className="text-sm text-slate-700 flex-1">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <span className="font-semibold text-xs text-slate-500 block">TRANSIT</span>
                                                    {cp.name}
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        // Simulate delay: 0-72h
                                                        const delay = Math.floor(Math.random() * 72);
                                                        setChokepointDelay(cp.name, delay);
                                                    }}
                                                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
                                                    title="Calculate Potential Delay"
                                                >
                                                    <Calculator className="w-3 h-3" />
                                                </button>
                                            </div>

                                            {startDate && (
                                                <div className="flex flex-col gap-0.5 mt-0.5">
                                                    <div className="text-xs text-slate-400">ETA: {formatETA(cp.distance, previousDelays)}</div>
                                                    {currentDelay > 0 && <div className="text-xs text-red-500 font-semibold">+ {currentDelay}h delay</div>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}

                            {/* Destination */}
                            <div className="flex items-start gap-3 mt-4">
                                <div className="w-4 h-4 rounded-full bg-green-500 border-2 border-white shadow-sm shrink-0 mt-0.5"></div>
                                <div className="text-sm text-slate-700 flex-1">
                                    <span className="font-semibold text-xs text-green-600 block">DESTINATION</span>
                                    {destination || "Unknown Port"}
                                    {startDate && <div className="text-xs text-slate-400 mt-0.5">Arr: {formatETA(routeStats.dist, totalDelay)}</div>}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Legend */}
            <div className="text-xs space-y-1 mt-2">
                <div className="font-semibold text-slate-400 uppercase">Legend</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#ff3300]"></div> Connected Port</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full border-2 border-[#FFD700] bg-black"></div> Chokepoint</div>
                <div className="flex items-center gap-2"><div className="w-8 h-1 bg-[#004488]"></div> Shipping Lane</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-600"></div> <ShieldAlert className="w-3 h-3 text-red-600" /> Blocked/Closed</div>
            </div>

            <button onClick={reset} className="text-xs text-center text-slate-400 underline hover:text-slate-600">
                Reset Simulation
            </button>
        </div>
    );
}
