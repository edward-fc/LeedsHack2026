import { Node, Edge, GraphData } from '../types';

/**
 * Adds "bridge edges" to the graph to connect nodes across the International Date Line.
 * This ensures that routing algorithms can find paths across the Pacific.
 * 
 * @param nodes Dictionary of nodes by ID
 * @param adjList Adjacency list (node_id -> edges)
 */
export function addDatelineBridges(
    nodes: Record<string, Node>,
    adjList: Record<string, Edge[]>
): { bridgesAdded: number, bridges: Edge[] } {
    const candidatesNeg: Node[] = [];
    const candidatesPos: Node[] = [];

    // 1. Identify Candidate Nodes
    for (const node of Object.values(nodes)) {
        if (node.lon <= -179.5) {
            candidatesNeg.push(node);
        } else if (node.lon >= 179.5) {
            candidatesPos.push(node);
        }
    }

    let bridgesAdded = 0;
    const bridges: Edge[] = [];

    // 2. Stitch across dateline
    // For each negative side candidate, find best match on positive side
    for (const u of candidatesNeg) {
        let bestV: Node | null = null;
        let minDist = Infinity;

        for (const v of candidatesPos) {
            const dLat = Math.abs(u.lat - v.lat);

            // Allow some latitude tolerance (e.g. 0.5 degrees)
            if (dLat > 0.5) continue;

            // Calculate "wrapped" distance
            // Since they are at +/- 180, the longitudinal distance is small if we wrap.
            // Simplified distance check: just dLat is mostly enough if we assume they are at the edge.
            // But let's be precise:
            // dist = sqrt(dLat^2 + dLonWrapped^2)
            // dLonWrapped = 360 - (v.lon - u.lon)
            // v.lon is ~180, u.lon is ~-180. v.lon - u.lon is ~360.
            const dLon = 360 - (v.lon - u.lon);
            const dist = Math.sqrt(dLat * dLat + dLon * dLon);

            if (dist < minDist) {
                minDist = dist;
                bestV = v;
            }
        }

        if (bestV && minDist < 2.0) { // arbitrary threshold, say 2 degrees (~220km)
            // Create Bridge Edges (Bi-directional)
            const bridgeCostKm = 0.001; // Minimal cost to encourage usage

            const edge1: Edge = {
                source: u.id,
                target: bestV.id,
                dist_km: bridgeCostKm,
                geometry: [[u.lon, u.lat], [bestV.lon, bestV.lat]],
                chokepoints: [],
                lane_id: `DATELINE_BRIDGE_${u.id}_${bestV.id}`
            };

            const edge2: Edge = {
                source: bestV.id,
                target: u.id,
                dist_km: bridgeCostKm,
                geometry: [[bestV.lon, bestV.lat], [u.lon, u.lat]],
                chokepoints: [],
                lane_id: `DATELINE_BRIDGE_${bestV.id}_${u.id}`
            };

            // Add to adjacency list (creating new entries via push)
            // Check existence first to avoid duplicates if called multiple times?
            // Assuming fresh load.

            if (!adjList[u.id]) adjList[u.id] = [];
            if (!adjList[bestV.id]) adjList[bestV.id] = [];

            adjList[u.id].push(edge1);
            adjList[bestV.id].push(edge2);

            bridges.push(edge1);
            bridges.push(edge2);
            bridgesAdded += 2;
        }
    }

    console.log(`[Dateline] Added ${bridgesAdded} bridge edges connecting ${candidatesNeg.length} neg nodes to ${candidatesPos.length} pos nodes.`);
    return { bridgesAdded, bridges };
}

/**
 * Calculates longitude difference considering wrapping.
 * @returns Shortest difference in degrees [-180, 180]
 */
export function wrappedLonDelta(lon1: number, lon2: number): number {
    let delta = lon2 - lon1;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    return delta;
}

/**
 * Heuristic function for A* that handles dateline wrapping.
 */
export function heuristic(nodeA: Node, nodeB: Node): number {
    const R = 6371;
    const dLat = (nodeB.lat - nodeA.lat) * Math.PI / 180;
    const dLon = wrappedLonDelta(nodeA.lon, nodeB.lon) * Math.PI / 180;

    // Simple Pythagorean on sphere approximation for heuristic speed?
    // Or full Haversine. Haversine is safer.
    const lat1 = nodeA.lat * Math.PI / 180;
    const lat2 = nodeB.lat * Math.PI / 180;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
