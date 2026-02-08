import { GraphData, RouteResult, Edge, Node } from '../types';
import { PriorityQueue } from '../../lib/PriorityQueue'; // We'll move this later or keep it adjacent

/**
 * Finds the shortest path between start and end nodes using A*.
 */
export function findPath(
    graph: GraphData,
    startNodeId: string,
    endNodeId: string,
    disabledPorts: Set<string>,
    disabledChokepoints: Set<string>
): RouteResult | null {
    if (!graph.nodes[startNodeId] || !graph.nodes[endNodeId]) return null;

    const openSet = new PriorityQueue<string>();
    openSet.enqueue(startNodeId, 0);

    const cameFrom: Record<string, string | null> = {};
    const gScore: Record<string, number> = {};
    const fScore: Record<string, number> = {};

    // Initialize scores
    for (const nodeId in graph.nodes) {
        gScore[nodeId] = Infinity;
        fScore[nodeId] = Infinity;
    }

    gScore[startNodeId] = 0;
    fScore[startNodeId] = heuristic(graph.nodes[startNodeId], graph.nodes[endNodeId]);

    // Graph adjacency list needs to be built or passed in. 
    // For performance, we should compute adjList once and pass it, but for now let's build on demand or assume it's attached.
    // Ideally, GraphEngine holds the adjList. Let's assume we pass a robust Graph object, but for pure function we need adjList.
    // Let's assume we compute adjList in the Graph domain object and pass it here.
    // Refactoring step: passing adjList as argument.
    // For now, let's implement the core logic assuming we receive an adjacency list.
    return null; // Placeholder for now - see implementation in GraphEngine
}

/**
 * Heuristic: Haversine distance
 */
function heuristic(a: Node, b: Node): number {
    const R = 6371; // km
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lon - a.lon) * Math.PI / 180;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;

    const x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    return R * c;
}
