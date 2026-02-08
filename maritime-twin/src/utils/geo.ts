/**
 * Calculates the Haversine distance between two points in kilometers.
 * @param lat1 Latitude of point 1
 * @param lon1 Longitude of point 1
 * @param lat2 Latitude of point 2
 * @param lon2 Longitude of point 2
 * @returns Distance in kilometers
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
}

/**
 * Interpolates a point along a route of segments.
 * @param segments List of linestrings (each linestring is [lon, lat][])
 * @param distanceKm Target distance from start
 * @returns [lon, lat] or null if invalid
 */
export function getPointAlongRoute(segments: [number, number][][], distanceKm: number): [number, number] | null {
    if (!segments || segments.length === 0) return null;
    if (distanceKm <= 0) return segments[0][0]; // Start

    let coveredKm = 0;

    // Iterate through all segments in order
    for (const segment of segments) {
        // Iterate through points in the segment
        for (let i = 0; i < segment.length - 1; i++) {
            const p1 = segment[i];
            const p2 = segment[i + 1];

            // Segment Distance using Haversine
            const segDist = haversineDistance(p1[1], p1[0], p2[1], p2[0]);

            if (coveredKm + segDist >= distanceKm) {
                // Interpolate here
                const remaining = distanceKm - coveredKm;
                const ratio = remaining / segDist;

                const lat = p1[1] + (p2[1] - p1[1]) * ratio;

                // Handle Longitude Wrapping for Interpolation
                let lon1 = p1[0];
                let lon2 = p2[0];

                // If crossing dateline (gap > 180), wrap one coordinate
                if (Math.abs(lon2 - lon1) > 180) {
                    if (lon2 > lon1) {
                        lon1 += 360;
                    } else {
                        lon2 += 360;
                    }
                }

                let lon = lon1 + (lon2 - lon1) * ratio;

                // Normalize longitude back to -180 to 180
                while (lon > 180) lon -= 360;
                while (lon < -180) lon += 360;

                return [lon, lat];
            }

            coveredKm += segDist;
        }
    }

    // If we ran out of segments, return destination (last point of last segment)
    const lastSeg = segments[segments.length - 1];
    return lastSeg[lastSeg.length - 1];
}

/**
 * Unwraps longitude coordinates to allow continuous rendering across the antimeridian.
 * 
 * @param coords Array of [lon, lat] coordinates
 * @returns New array of [lon, lat] with longitudes unwrapped.
 */
export function unwrapAntimeridian(coords: [number, number][]): [number, number][] {
    if (coords.length === 0) return [];

    const result: [number, number][] = [coords[0]];

    for (let i = 1; i < coords.length; i++) {
        const prev = result[i - 1];
        const current = coords[i];

        let lon = current[0];
        const lat = current[1];
        const prevLon = prev[0];

        const delta = lon - prevLon;

        // If we jumped more than 180 degrees, we likely crossed the dateline.
        if (delta > 180) {
            lon -= 360;
        } else if (delta < -180) {
            lon += 360;
        }

        result.push([lon, lat]);
    }

    return result;
}
