import { CloudRain, Wind, Thermometer, Cloud, EyeOff, Layers } from 'lucide-react';
import { useAppStore } from '../../state/AppStore';
import { WeatherProvider, WeatherType } from '../../domain/types';

export function WeatherControls() {
    const { weatherConfig: config, setWeatherConfig: onChange } = useAppStore();

    const toggleVisible = () => onChange({ ...config, visible: !config.visible });

    const setProvider = (provider: WeatherProvider) => {
        // Reset type to default valid type for provider
        const type = provider === 'openweathermap' ? 'clouds' : 'precipitation';
        onChange({ ...config, provider, type });
    };

    const setType = (type: WeatherType) => onChange({ ...config, type });
    const setOpacity = (opacity: number) => onChange({ ...config, opacity });

    if (!config.visible) {
        return (
            <button
                onClick={toggleVisible}
                className="self-end w-fit bg-white/90 backdrop-blur-md p-2 rounded-lg shadow-xl border border-gray-200 text-slate-600 hover:text-blue-600 transition-colors"
                title="Show Weather Overlay"
            >
                <Layers className="w-6 h-6" />
            </button>
        );
    }

    return (
        <div className="w-64 bg-white/90 backdrop-blur-md shadow-xl rounded-xl p-4 flex flex-col gap-3 border border-gray-200 transition-all">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-500" />
                    Weather Overlay
                </h2>
                <button onClick={toggleVisible} className="text-slate-400 hover:text-slate-600">
                    <EyeOff className="w-4 h-4" />
                </button>
            </div>

            {/* Provider Selection */}
            <div className="flex bg-slate-100 p-1 rounded-lg">
                <button
                    onClick={() => setProvider('openweathermap')}
                    className={`flex-1 text-xs py-1 rounded-md transition-colors ${config.provider === 'openweathermap' ? 'bg-white shadow text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    OpenWeather
                </button>
                <button
                    onClick={() => setProvider('rainviewer')}
                    className={`flex-1 text-xs py-1 rounded-md transition-colors ${config.provider === 'rainviewer' ? 'bg-white shadow text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    RainViewer
                </button>
            </div>

            {/* Layer Type Selection */}
            <div className="grid grid-cols-2 gap-2">
                {config.provider === 'openweathermap' ? (
                    <>
                        <button
                            onClick={() => setType('clouds')}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs border ${config.type === 'clouds' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-transparent hover:bg-slate-50 text-slate-600'}`}
                        >
                            <Cloud className="w-3 h-3" /> Clouds
                        </button>
                        <button
                            onClick={() => setType('precipitation')}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs border ${config.type === 'precipitation' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-transparent hover:bg-slate-50 text-slate-600'}`}
                        >
                            <CloudRain className="w-3 h-3" /> Rain
                        </button>
                        <button
                            onClick={() => setType('temp')}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs border ${config.type === 'temp' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-transparent hover:bg-slate-50 text-slate-600'}`}
                        >
                            <Thermometer className="w-3 h-3" /> Temp
                        </button>
                        <button
                            onClick={() => setType('wind')}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs border ${config.type === 'wind' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-transparent hover:bg-slate-50 text-slate-600'}`}
                        >
                            <Wind className="w-3 h-3" /> Wind
                        </button>
                    </>
                ) : (
                    <button
                        onClick={() => setType('precipitation')}
                        className={`col-span-2 flex items-center justify-center gap-2 px-2 py-1.5 rounded text-xs border bg-blue-50 border-blue-200 text-blue-700`}
                    >
                        <CloudRain className="w-3 h-3" /> Radar (Precipitation)
                    </button>
                )}
            </div>

            {/* Opacity Slider */}
            <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-500">
                    <span>Opacity</span>
                    <span>{Math.round(config.opacity * 100)}%</span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={config.opacity}
                    onChange={(e) => setOpacity(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
            </div>

            {/* Attribution */}
            <div className="text-[10px] text-slate-400 text-center mt-1">
                Data provided by {config.provider === 'openweathermap' ? 'OpenWeatherMap' : 'RainViewer'}
            </div>
        </div>
    );
}
