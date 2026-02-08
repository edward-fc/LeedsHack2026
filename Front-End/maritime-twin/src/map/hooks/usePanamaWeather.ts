/// <reference types="vite/client" />
import { useState, useEffect, useCallback } from 'react';
import { PanamaWeather } from '../../domain/types';

// Panama Canal coordinates (Gatun Locks area)
const PANAMA_LAT = 9.28;
const PANAMA_LON = -79.92;

const OPENWEATHER_API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY || '';

// Fetch interval: 10 minutes
const FETCH_INTERVAL_MS = 10 * 60 * 1000;

export function usePanamaWeather() {
    const [weather, setWeather] = useState<PanamaWeather | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchWeather = useCallback(async () => {
        if (!OPENWEATHER_API_KEY) {
            setError('OpenWeather API key not configured');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const url = `https://api.openweathermap.org/data/2.5/weather?lat=${PANAMA_LAT}&lon=${PANAMA_LON}&appid=${OPENWEATHER_API_KEY}&units=metric`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Weather API error: ${response.status}`);
            }

            const data = await response.json();

            // Extract relevant weather data
            const panamaWeather: PanamaWeather = {
                rainfallMm: data.rain?.['1h'] || data.rain?.['3h'] || 0,
                windSpeedKmh: (data.wind?.speed || 0) * 3.6, // m/s to km/h
                visibilityKm: (data.visibility || 10000) / 1000, // meters to km
                gatunLakeLevelM: 26.5 + Math.random() * 1.0, // Simulated: 26.5-27.5m (typical range)
                fetchedAt: new Date().toISOString(),
            };

            setWeather(panamaWeather);
            console.log('[PanamaWeather] Fetched:', panamaWeather);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            setError(message);
            console.error('[PanamaWeather] Error:', message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Fetch on mount and set up interval
    useEffect(() => {
        fetchWeather();

        const interval = setInterval(fetchWeather, FETCH_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [fetchWeather]);

    return { weather, isLoading, error, refetch: fetchWeather };
}
