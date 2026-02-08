import { Locate, Anchor, ShieldAlert, Route as RouteIcon } from 'lucide-react';

interface ControlPanelProps {
    onSelectMode: (mode: 'origin' | 'destination' | null) => void;
    selectionMode: 'origin' | 'destination' | null;
    origin: string | null;
    destination: string | null;
    routeStats: { dist: number } | null;
    onReset: () => void;
    graphStats: { ports: number; routes: number };
    startDate: string;
    onStartDateChange: (date: string) => void;
}

export function ControlPanel({ onSelectMode, selectionMode, origin, destination, routeStats, onReset, graphStats, startDate, onStartDateChange }: ControlPanelProps) {
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
                    onClick={() => onSelectMode(selectionMode === 'origin' ? null : 'origin')}
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
                    onClick={() => onSelectMode(selectionMode === 'destination' ? null : 'destination')}
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
                            onChange={(e) => onStartDateChange(e.target.value)}
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

            <button onClick={onReset} className="text-xs text-center text-slate-400 underline hover:text-slate-600">
                Reset Simulation
            </button>
        </div>
    );
}
