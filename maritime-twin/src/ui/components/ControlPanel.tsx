import { useAppStore } from '../../state/store';

export function ControlPanel() {
    const { state, dispatch } = useAppStore();
    const { selection, route, simulation, graph } = state;

    // Helper to get port name
    const getPortName = (id: string | null) => {
        if (!id || !graph) return null;
        return graph.ports[id]?.name || id;
    };

    return (
        <div className="absolute top-4 right-4 z-10 w-80 max-h-[90vh] overflow-y-auto bg-white/95 backdrop-blur-md shadow-2xl rounded-xl border border-white/20 flex flex-col">
            <div className="p-4 border-b border-slate-100">
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    Maritime Twin
                </h1>
                <p className="text-xs text-slate-500 mt-1">Global Shipping Intelligence</p>

                {/* Mode Toggles */}
                <div className="flex gap-2 mt-4">
                    <button
                        onClick={() => dispatch({ type: 'SET_SELECTION_MODE', payload: 'origin' })}
                        className="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors bg-green-50 text-green-700 hover:bg-green-100"
                    >
                        Pick Origin
                    </button>
                    <button
                        onClick={() => dispatch({ type: 'SET_SELECTION_MODE', payload: 'destination' })}
                        className="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors bg-red-50 text-red-700 hover:bg-red-100"
                    >
                        Pick Dest
                    </button>
                    <button
                        onClick={() => dispatch({ type: 'RESET' })}
                        className="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors bg-slate-100 text-slate-600 hover:bg-slate-200"
                    >
                        Reset
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="p-4 space-y-4">
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Current Route</div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="text-[10px] text-slate-400">Origin</div>
                            <div className="font-semibold text-slate-700 truncate" title={getPortName(selection.originId) || 'None'}>
                                {getPortName(selection.originId) || '-'}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-400">Destination</div>
                            <div className="font-semibold text-slate-700 truncate" title={getPortName(selection.destId) || 'None'}>
                                {getPortName(selection.destId) || '-'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Date Picker */}
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Journey Start</div>
                    <input
                        type="datetime-local"
                        value={simulation.startDate || ''}
                        max={new Date().toISOString().slice(0, 16)}
                        onChange={(e) => dispatch({ type: 'SET_START_DATE', payload: e.target.value })}
                        className="w-full text-sm p-1 border rounded bg-white text-slate-700"
                    />
                </div>

                {/* Route Details */}
                {route && (
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                        <div className="flex justify-between items-baseline">
                            <span className="text-xs font-medium text-blue-600 uppercase tracking-wider">Total Distance</span>
                            <span className="text-lg font-bold text-blue-800">
                                {route.totalDist.toFixed(0)} <span className="text-sm font-normal">km</span>
                            </span>
                        </div>
                        <div className="text-xs text-blue-600/70 mt-1">
                            ~{(route.totalDist / (22 * 1.852)).toFixed(1)} hrs @ 22kts
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
