import { useState, useEffect } from 'react';
import { Ship, Gauge, AlertTriangle, RefreshCw, Clock, ChevronUp } from 'lucide-react';
import { DelayConfig, DelayPrediction, PanamaWeather, VesselType } from '../../domain/types';

const ML_API_URL = 'http://localhost:8000';

// Vessel type presets
const VESSEL_PRESETS: Record<VesselType, { beam: number; length: number; draft: number }> = {
    Panamax: { beam: 32.0, length: 290.0, draft: 12.0 },
    Neopanamax: { beam: 49.0, length: 366.0, draft: 15.0 },
};

interface DelayControlsProps {
    weather: PanamaWeather | null;
    onPredictionChange?: (prediction: DelayPrediction | null) => void;
}

export function DelayControls({ weather, onPredictionChange }: DelayControlsProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [prediction, setPrediction] = useState<DelayPrediction | null>(null);

    const [config, setConfig] = useState<DelayConfig>({
        queueLength: 15,
        isBooked: true,
        vesselType: 'Panamax',
        vesselBeamM: VESSEL_PRESETS.Panamax.beam,
        vesselLengthM: VESSEL_PRESETS.Panamax.length,
        vesselDraftM: VESSEL_PRESETS.Panamax.draft,
    });

    // Update vessel dimensions when type changes
    const setVesselType = (type: VesselType) => {
        const preset = VESSEL_PRESETS[type];
        setConfig(prev => ({
            ...prev,
            vesselType: type,
            vesselBeamM: preset.beam,
            vesselLengthM: preset.length,
            vesselDraftM: preset.draft,
        }));
    };

    // Fetch prediction from ML backend
    const fetchPrediction = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const now = new Date();
            const payload = {
                queue_length: config.queueLength,
                is_booked: config.isBooked ? 1 : 0,
                rainfall_mm: weather?.rainfallMm || 0,
                gatun_lake_level_m: weather?.gatunLakeLevelM || 26.7,
                wind_speed_kmh: weather?.windSpeedKmh || 15,
                visibility_km: weather?.visibilityKm || 10,
                month: now.getMonth() + 1,
                day_of_week: now.getDay(),
                hour: now.getHours(),
                vessel_size_category: config.vesselType,
                vessel_beam_m: config.vesselBeamM,
                vessel_length_m: config.vesselLengthM,
                vessel_draft_m: config.vesselDraftM,
                daily_transit_count: Math.max(25, config.queueLength + 10),
                rainfall_30day_mm: (weather?.rainfallMm || 0) * 15,
            };

            const response = await fetch(`${ML_API_URL}/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            const data = await response.json();
            const newPrediction: DelayPrediction = {
                isDelayed: data.is_delayed,
                probability: data.probability,
                predictedDelayHours: data.predicted_delay_hours,
                riskLevel: data.risk_level,
                fetchedAt: new Date().toISOString(),
            };

            setPrediction(newPrediction);
            onPredictionChange?.(newPrediction);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch prediction';
            setError(message);
            console.error('[DelayControls] Error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-fetch when config or weather changes
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchPrediction();
        }, 500); // Debounce

        return () => clearTimeout(timer);
    }, [config, weather]);

    const riskColors: Record<string, string> = {
        LOW: 'bg-green-100 text-green-700 border-green-200',
        MEDIUM: 'bg-yellow-100 text-yellow-700 border-yellow-200',
        HIGH: 'bg-red-100 text-red-700 border-red-200',
    };

    if (!isExpanded) {
        return (
            <button
                onClick={() => setIsExpanded(true)}
                className="self-end w-fit bg-white/90 backdrop-blur-md p-2 rounded-lg shadow-xl border border-gray-200 text-slate-600 hover:text-orange-600 transition-colors"
                title="Show Delay Prediction"
            >
                <Clock className="w-6 h-6" />
            </button>
        );
    }

    return (
        <div className="w-72 bg-white/95 backdrop-blur-md shadow-xl rounded-xl p-4 flex flex-col gap-3 border border-gray-200">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-orange-500" />
                    Panama Canal Delay
                </h2>
                <button onClick={() => setIsExpanded(false)} className="text-slate-400 hover:text-slate-600">
                    <ChevronUp className="w-4 h-4" />
                </button>
            </div>

            {/* Prediction Display */}
            {prediction && (
                <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500">Risk Level</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${riskColors[prediction.riskLevel]}`}>
                            {prediction.riskLevel}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500">Delay Probability</span>
                        <span className="text-sm font-bold text-slate-700">{(prediction.probability * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500">Est. Delay</span>
                        <span className="text-sm font-bold text-orange-600">{prediction.predictedDelayHours.toFixed(1)} hours</span>
                    </div>
                </div>
            )}

            {error && (
                <div className="bg-red-50 text-red-600 text-xs p-2 rounded flex items-center gap-2">
                    <AlertTriangle className="w-3 h-3" />
                    {error}
                </div>
            )}

            {/* Canal Operations */}
            <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    <Gauge className="w-3 h-3" /> Canal Operations
                </h3>

                <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-600">
                        <span>Queue Length</span>
                        <span className="font-medium">{config.queueLength} ships</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="50"
                        value={config.queueLength}
                        onChange={(e) => setConfig(prev => ({ ...prev, queueLength: parseInt(e.target.value) }))}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                    />
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">Booking Status</span>
                    <button
                        onClick={() => setConfig(prev => ({ ...prev, isBooked: !prev.isBooked }))}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${config.isBooked
                            ? 'bg-green-100 text-green-700 border border-green-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                            }`}
                    >
                        {config.isBooked ? 'Booked' : 'Not Booked'}
                    </button>
                </div>
            </div>

            {/* Vessel Configuration */}
            <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    <Ship className="w-3 h-3" /> Vessel Type
                </h3>

                <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button
                        onClick={() => setVesselType('Panamax')}
                        className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${config.vesselType === 'Panamax'
                            ? 'bg-white shadow text-orange-600 font-semibold'
                            : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Panamax
                    </button>
                    <button
                        onClick={() => setVesselType('Neopanamax')}
                        className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${config.vesselType === 'Neopanamax'
                            ? 'bg-white shadow text-orange-600 font-semibold'
                            : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Neopanamax
                    </button>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-slate-50 p-2 rounded text-center">
                        <div className="text-slate-400">Beam</div>
                        <div className="font-semibold text-slate-700">{config.vesselBeamM}m</div>
                    </div>
                    <div className="bg-slate-50 p-2 rounded text-center">
                        <div className="text-slate-400">Length</div>
                        <div className="font-semibold text-slate-700">{config.vesselLengthM}m</div>
                    </div>
                    <div className="bg-slate-50 p-2 rounded text-center">
                        <div className="text-slate-400">Draft</div>
                        <div className="font-semibold text-slate-700">{config.vesselDraftM}m</div>
                    </div>
                </div>
            </div>

            {/* Weather Status */}
            {weather && (
                <div className="space-y-1 pt-2 border-t border-slate-100">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Live Weather</h3>
                    <div className="grid grid-cols-3 gap-1 text-xs text-slate-500">
                        <span>🌧️ {weather.rainfallMm.toFixed(1)}mm</span>
                        <span>💨 {weather.windSpeedKmh.toFixed(0)}km/h</span>
                        <span>👁️ {weather.visibilityKm.toFixed(0)}km</span>
                    </div>
                </div>
            )}

            {/* Refresh Button */}
            <button
                onClick={fetchPrediction}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 w-full py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-xs font-semibold rounded-lg transition-colors"
            >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                {isLoading ? 'Calculating...' : 'Refresh Prediction'}
            </button>

            {/* Attribution */}
            <div className="text-[10px] text-slate-400 text-center">
                ML Model: XGBoost | Data: Panama Canal Authority
            </div>
        </div>
    );
}
