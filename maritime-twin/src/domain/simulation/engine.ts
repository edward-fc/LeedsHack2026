import { GeoPoint } from '../types';

/**
 * Calculates the ship's position along a route based on elapsed time.
 * @param routeSegments List of line segments (each is [lon, lat][])
 * @param startDate Journey start date string
 * @param speedKnots Speed in knots (default 22)
 * @returns [lon, lat] or null if invalid/finished
 */
export function calculateShipPosition(
    routeSegments: [number, number][][],
    startDate: string,
    speedKnots: number = 22
): [number, number] | null {
    if (!startDate || !routeSegments.length) return null;

    const start = new Date(startDate).getTime();
    const now = new Date().getTime();
    const elapsedHours = (now - start) / (1000 * 60 * 60);

    if (elapsedHours < 0) return null; // Future start date

    const speedKmH = speedKnots * 1.852; // 1 knot = 1.852 km/h
    const distTravelledKm = elapsedHours * speedKmH;

    return getPointAlongRoute(routeSegments, distTravelledKm);
}

/**
 * Interpolates a point along a multi-segment route.
 */
export function getPointAlongRoute(segments: [number, number][][], distanceKm: number): [number, number] | null {
    if (!segments || segments.length === 0) return null;
    if (distanceKm <= 0) return segments[0][0] as [number, number];

    let coveredKm = 0;
    const R = 6371; // Earth radius km

    for (const segment of segments) {
        for (let i = 0; i < segment.length - 1; i++) {
            const p1 = segment[i];
            const p2 = segment[i + 1];

            // Segment Distance (Haversine)
            const dLat = (p2[1] - p1[1]) * Math.PI / 180;
            const dLon = (p2[0] - p1[0]) * Math.PI / 180;
            const lat1 = p1[1] * Math.PI / 180;
            const lat2 = p2[1] * Math.PI / 180;

            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const segDist = R * c;

            if (coveredKm + segDist >= distanceKm) {
                // Interpolate
                const remaining = distanceKm - coveredKm;
                const ratio = remaining / segDist;

                const lat = p1[1] + (p2[1] - p1[1]) * ratio;
                const lon = p1[0] + (p2[0] - p1[0]) * ratio;
                return [lon, lat];
            }

            coveredKm += segDist;
        }
    }

    // Finished route
    const lastSeg = segments[segments.length - 1];
    return lastSeg[lastSeg.length - 1] as [number, number];
}
