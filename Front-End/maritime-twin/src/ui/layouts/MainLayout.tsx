import { useAppStore } from '../../state/AppStore';
import { ControlPanel } from '../components/ControlPanel';
import { MapView } from '../components/MapView';
import { WeatherControls } from '../components/WeatherControls';
import { Loader2 } from 'lucide-react';

export function MainLayout() {
    const { isGraphLoaded } = useAppStore();

    return (
        <div className="relative w-full h-screen overflow-hidden bg-slate-900">
            {/* Map Background */}
            <div className="absolute inset-0 z-0">
                <MapView />
            </div>

            {/* UI Overlays */}
            <ControlPanel />
            <WeatherControls />

            {/* Loading State */}
            {!isGraphLoaded && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm text-white">
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        <div className="font-semibold text-lg">Loading Global Maritime Network...</div>
                    </div>
                </div>
            )}
        </div>
    );
}
