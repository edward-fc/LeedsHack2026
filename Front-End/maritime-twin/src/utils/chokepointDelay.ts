/**
 * Generates believable delay predictions for chokepoints based on weather conditions
 */

interface ChokepointDelayRange {
    min: number;
    typical: number;
    max: number;
}

const CHOKEPOINT_DELAYS: Record<string, ChokepointDelayRange> = {
    'Suez Canal': { min: 6, typical: 24, max: 144 },
    'Strait of Hormuz': { min: 6, typical: 18, max: 120 },
    'Bab el-Mandeb': { min: 4, typical: 16, max: 96 },
    'Strait of Malacca': { min: 4, typical: 24, max: 168 },
    'Bosphorus': { min: 2, typical: 12, max: 72 },
    'Dardanelles': { min: 2, typical: 10, max: 60 },
    'Strait of Gibraltar': { min: 2, typical: 8, max: 48 },
    'English Channel': { min: 1, typical: 6, max: 36 },
    'Danish Straits': { min: 1, typical: 6, max: 36 },
    'Lombok Strait': { min: 1, typical: 6, max: 36 },
    'Sunda Strait': { min: 1, typical: 8, max: 48 },
};

/**
 * Generates a delay prediction for a chokepoint based on weather conditions
 * Uses rainfall, wind speed, and visibility to influence the delay within realistic bounds
 */
export function predictChokepointDelay(
    chokepointName: string,
    weather?: { rainfallMm: number; windSpeedKmh: number; visibilityKm: number }
): number {
    const delayRange = CHOKEPOINT_DELAYS[chokepointName];
    if (!delayRange) return 0;

    const { min, typical, max } = delayRange;

    // Base factor: random variation around typical (0.5 to 1.5)
    const randomFactor = 0.5 + Math.random();

    // Weather impact factors (normalize to 0-1 scale, higher = worse conditions)
    let weatherFactor = 1.0;

    if (weather) {
        // Rainfall impact: 0mm = 0.8, 50mm+ = 1.5
        const rainfallImpact = Math.min(1.5, 0.8 + (weather.rainfallMm / 50) * 0.7);

        // Wind impact: 0km/h = 0.9, 80km/h+ = 1.4
        const windImpact = Math.min(1.4, 0.9 + (weather.windSpeedKmh / 80) * 0.5);

        // Visibility impact: 10km+ = 0.9, 0km = 1.3
        const visibilityImpact = Math.max(0.9, 1.3 - (weather.visibilityKm / 10) * 0.4);

        // Average the weather factors
        weatherFactor = (rainfallImpact + windImpact + visibilityImpact) / 3;
    }

    // Calculate delay: typical * random * weather
    let delay = typical * randomFactor * weatherFactor;

    // Clamp to realistic bounds
    delay = Math.max(min, Math.min(max, delay));

    // Round to whole hours
    return Math.round(delay);
}
