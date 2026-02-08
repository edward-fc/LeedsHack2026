import { getPointAlongRoute } from '../../utils/geo';

export class SimulationTimeline {
    /**
    * Calculates the ship's position based on start time and speed.
    * @param routeSegments List of segments [lon, lat][]
    * @param startDate Journey start date string
    * @param speedKmH Speed in km/h (default 22 knots ~= 40.74 km/h)
    * @returns [lon, lat] or null if journey hasn't started or ended
    */
    static getShipPosition(
        routeSegments: [number, number][][],
        startDate: string,
        speedKmH: number = 40.74
    ): [number, number] | null {
        if (!routeSegments.length || !startDate) return null;

        const start = new Date(startDate).getTime();
        const now = new Date().getTime();
        const elapsedHours = (now - start) / (1000 * 60 * 60);

        if (elapsedHours < 0) return null;

        const distTravelled = elapsedHours * speedKmH;
        return getPointAlongRoute(routeSegments, distTravelled);
    }
}
