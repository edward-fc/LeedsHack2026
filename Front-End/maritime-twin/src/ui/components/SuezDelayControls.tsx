import { useState, useEffect } from 'react';
import { Ship, RefreshCw, Clock, ChevronUp } from 'lucide-react';
import { DelayPrediction, RiskLevel } from '../../domain/types';

interface SuezWeather {
    rainfallMm: number;
    windSpeedKmh: number;
    visibilityKm: number;
    temperature: number;
}

interface SuezDelayControlsProps {
    onPredictionChange?: (prediction: DelayPrediction | null) => void;
}

export function SuezDelayControls({ onPredictionChange }: SuezDelayControlsProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [prediction, setPrediction] = useState<DelayPrediction | null>(null);
    const [weather, setWeather] = useState<SuezWeather | null>(null);

    const [queueLength, setQueueLength] = useState(12); // Typical queue for Suez
    const [isConvoy, setIsConvoy] = useState(true); // Suez uses convoy system

    // Fetch weather for Suez Canal (simplified - using randomized realistic data)
    const fetchWeather = () => {
        // Suez Canal coordinates: ~30.7°N, 32.3°E
        // Simulate realistic weather conditions
        const mockWeather: SuezWeather = {
            rainfallMm: Math.random() * 5, // Desert climate, low rainfall
            windSpeedKmh: 15 + Math.random() * 25, // 15-40 km/h typical
            visibilityKm: 8 + Math.random() * 2, // 8-10 km
            temperature: 25 + Math.random() * 15, // 25-40°C
        };
        setWeather(mockWeather);
    };

    // Calculate prediction based on queue and weather
    const calculatePrediction = () => {
        if (!weather) return;

        setIsLoading(true);

        // Delay calculation based on queue length and weather
        // Suez Canal typical delays: min 6h, typical 24h, max 144h
        let baseDelay = 6; // Minimum transit time

        // Queue impact: each ship adds ~1.5 hours
        baseDelay += queueLength * 1.5;

        // Weather impacts
        const windFactor = weather.windSpeedKmh > 35 ? 1.3 : 1.0; // High winds increase delay
        const visibilityFactor = weather.visibilityKm < 5 ? 1.4 : 1.0; // Poor visibility increases delay

        // Convoy system: if convoy is full, add extra wait
        const convoyFactor = isConvoy ? 1.2 : 1.0;

        let delayHours = baseDelay * windFactor * visibilityFactor * convoyFactor;

        // Add some randomness
        delayHours *= (0.8 + Math.random() * 0.4); // ±20% variation

        // Clamp to realistic bounds
        delayHours = Math.max(6, Math.min(144, delayHours));

        // Determine risk level and probability
        let riskLevel: RiskLevel;
        let probability: number;

        if (delayHours < 20) {
            riskLevel = 'LOW';
            probability = 0.2 + Math.random() * 0.2; // 20-40%
        } else if (delayHours < 48) {
            riskLevel = 'MEDIUM';
            probability = 0.5 + Math.random() * 0.2; // 50-70%
        } else {
            riskLevel = 'HIGH';
            probability = 0.7 + Math.random() * 0.25; // 70-95%
        }

        const newPrediction: DelayPrediction = {
            isDelayed: delayHours > 10,
            probability: Math.min(0.95, probability),
            predictedDelayHours: Math.round(delayHours),
            riskLevel,
            fetchedAt: new Date().toISOString(),
        };

        setTimeout(() => {
            setPrediction(newPrediction);
            onPredictionChange?.(newPrediction);
            setIsLoading(false);
        }, 300);
    };

    // Auto-fetch on mount and when config changes
    useEffect(() => {
        fetchWeather();
    }, []);

    useEffect(() => {
        if (!weather) return;
        const timer = setTimeout(() => {
            calculatePrediction();
        }, 500); // Debounce

        return () => clearTimeout(timer);
    }, [queueLength, isConvoy, weather]);

    const riskColors: Record<string, string> = {
        LOW: 'bg-green-100 text-green-700 border-green-200',
        MEDIUM: 'bg-yellow-100 text-yellow-700 border-yellow-200',
        HIGH: 'bg-red-100 text-red-700 border-red-200',
    };

    if (!isExpanded) {
        return (
            <button
                onClick={() => setIsExpanded(true)}
                className="self-end w-fit bg-white/90 backdrop-blur-md p-2 rounded-lg shadow-xl border border-gray-200 text-slate-600 hover:text-blue-600 transition-colors"
                title="Show Suez Delay Prediction"
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
                    <Clock className="w-4 h-4 text-blue-500" />
                    Suez Canal Delay
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
                        <span className="text-sm font-bold text-slate-800">{(prediction.probability * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500">Est. Delay</span>
                        <span className="text-lg font-bold text-orange-600">{prediction.predictedDelayHours}h</span>
                    </div>
                </div>
            )}

            {/* Canal Operations */}
            <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 uppercase">Canal Operations</label>

                {/* Queue Length */}
                <div className="space-y-1">
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-600">Queue Length</span>
                        <span className="text-xs font-mono bg-slate-200 px-2 py-0.5 rounded">{queueLength} ships</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="40"
                        value={queueLength}
                        onChange={(e) => setQueueLength(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                </div>

                {/* Convoy System */}
                <div className="flex items-center justify-between bg-white p-2 rounded border border-slate-200">
                    <div className="flex items-center gap-2">
                        <Ship className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-xs text-slate-600">Convoy Transit</span>
                    </div>
                    <button
                        onClick={() => setIsConvoy(!isConvoy)}
                        className={`px-2 py-0.5 text-xs font-semibold rounded transition-colors ${isConvoy
                            ? 'bg-blue-100 text-blue-700 border border-blue-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                    >
                        {isConvoy ? 'Active' : 'Off'}
                    </button>
                </div>
            </div>

            {/* Live Weather */}
            {weather && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-500 uppercase">Suez Conditions</label>
                        <button
                            onClick={() => {
                                fetchWeather();
                                if (weather) calculatePrediction();
                            }}
                            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-blue-600 transition-colors"
                            title="Refresh Weather"
                        >
                            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-white p-2 rounded border border-slate-200">
                            <div className="text-slate-500">Wind</div>
                            <div className="font-semibold text-slate-700">{weather.windSpeedKmh.toFixed(0)} km/h</div>
                        </div>
                        <div className="bg-white p-2 rounded border border-slate-200">
                            <div className="text-slate-500">Visibility</div>
                            <div className="font-semibold text-slate-700">{weather.visibilityKm.toFixed(1)} km</div>
                        </div>
                        <div className="bg-white p-2 rounded border border-slate-200">
                            <div className="text-slate-500">Temp</div>
                            <div className="font-semibold text-slate-700">{weather.temperature.toFixed(0)}°C</div>
                        </div>
                        <div className="bg-white p-2 rounded border border-slate-200">
                            <div className="text-slate-500">Rainfall</div>
                            <div className="font-semibold text-slate-700">{weather.rainfallMm.toFixed(1)} mm</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Info Footer */}
            <div className="text-[10px] text-slate-400 text-center pt-2 border-t border-slate-200">
                Weather-based prediction • Updates automatically
            </div>
        </div>
    );
}
