/// <reference types="vite/client" />
import { useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { WeatherConfig } from '../../domain/types';

const OPENWEATHER_API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY || '';

export function useWeatherLayer(map: maplibregl.Map | null, config: WeatherConfig) {
    const [rainViewerTs, setRainViewerTs] = useState<number | null>(null);

    // Fetch RainViewer timestamp on mount
    useEffect(() => {
        const fetchRainViewerData = async () => {
            try {
                const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
                const data = await response.json();
                if (data && data.radar && data.radar.past && data.radar.past.length > 0) {
                    // Use the last "past" frame or the first "nowcast" frame
                    const latest = data.radar.past[data.radar.past.length - 1];
                    setRainViewerTs(latest.time);
                }
            } catch (e) {
                console.warn("Failed to fetch RainViewer timestamps", e);
            }
        };

        fetchRainViewerData();
    }, []);

    useEffect(() => {
        if (!map || !map.getStyle()) return;

        // Cleanup function to remove layer/source when config changes or component unmounts
        const cleanup = () => {
            if (map.getLayer('weather-layer')) {
                map.removeLayer('weather-layer');
            }
            if (map.getSource('weather-source')) {
                map.removeSource('weather-source');
            }
        };

        if (!config.visible) {
            cleanup();
            return;
        }

        let tileUrl = '';
        let attribution = '';

        if (config.provider === 'openweathermap') {
            const apiKey = OPENWEATHER_API_KEY.trim();
            if (!apiKey) {
                console.warn("OpenWeatherMap API Key missing. Set VITE_OPENWEATHER_API_KEY.");
                return;
            }
            console.log(`[DEBUG] Current OpenWeatherMap Key available in App: "${apiKey}"`);
            // Map types: clouds_new, precipitation_new, temp_new, wind_new
            const layerName = `${config.type}_new`;
            tileUrl = `https://tile.openweathermap.org/map/${layerName}/{z}/{x}/{y}.png?appid=${apiKey}`;
            attribution = 'Map data &copy; <a href="http://openweathermap.org">OpenWeatherMap</a>';
            console.debug(`[Weather] Requesting: ${tileUrl.replace(apiKey, 'HIDDEN_KEY')}`);
        } else if (config.provider === 'rainviewer') {
            if (!rainViewerTs) return; // Wait for timestamp
            // https://tile.rainviewer.com/{ts}/{size}/{z}/{x}/{y}/{color}/{options}.png
            // color: 2 (Blue palette), options: 1_1 (smooth)
            tileUrl = `https://tile.rainviewer.com/${rainViewerTs}/256/{z}/{x}/{y}/2/1_1.png`;
            attribution = 'Map data &copy; <a href="https://www.rainviewer.com">RainViewer</a>';
        }

        if (!tileUrl) return;

        // Add Source
        if (!map.getSource('weather-source')) {
            map.addSource('weather-source', {
                type: 'raster',
                tiles: [tileUrl],
                tileSize: 256,
                attribution: attribution
            });
        }

        // Add Layer
        // We want it above the basemap but below vector layers (shipping lanes is usually the first vector layer)
        // A safe bet is to place it before 'lanes-layer' if it exists.
        const beforeLayer = map.getLayer('lanes-layer') ? 'lanes-layer' : undefined;

        if (!map.getLayer('weather-layer')) {
            map.addLayer({
                id: 'weather-layer',
                type: 'raster',
                source: 'weather-source',
                paint: {
                    'raster-opacity': config.opacity
                }
            }, beforeLayer);
        } else {
            // Update opacity if layer exists
            map.setPaintProperty('weather-layer', 'raster-opacity', config.opacity);
        }

        // If source URL changed, we might need to recreate source/layer interactions
        // But the cleanup() at the start of the effect handles full reconstruction if dependencies change.
        // Wait, the cleanup is currently ONLY called if !visible?
        // No, React useEffect cleanup runs before re-running the effect.
        // So we SHOULD return cleanup.
        return cleanup;

    }, [map, config, rainViewerTs]);
}
