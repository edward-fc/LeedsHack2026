import { PriorityQueue } from './PriorityQueue';
import { GraphIndex } from '../graph/GraphIndex';
import { Node, Edge, RouteResult } from '../types';
import { stitchRouteSegments } from '../../utils/geo';
import { heuristic } from '../graph/dateline';

// Average ship speed for converting delay hours to equivalent distance
const SHIP_SPEED_KM_H = 40.74; // 22 knots

export class DijkstraRouter {
    graph: GraphIndex;

    constructor(graph: GraphIndex) {
        this.graph = graph;
    }

    /**
     * Find the shortest path between two ports.
     * @param startPortId - Origin port ID
     * @param endPortId - Destination port ID
     * @param delayPenalties - Optional map of chokepoint name to delay hours (adds equivalent km to edges through that chokepoint)
     */
    findPath(startPortId: string, endPortId: string, delayPenalties?: Record<string, number>): RouteResult | null {
        if (this.graph.disabledPorts.has(startPortId) || this.graph.disabledPorts.has(endPortId)) {
            return null;
        }

        const startNodeId = this.graph.ports[startPortId]?.node_id;
        const endNodeId = this.graph.ports[endPortId]?.node_id;

        if (!startNodeId || !endNodeId) {
            console.error("[DijkstraRouter] Invalid start or end node ID.");
            return null;
        }

        const distances: Record<string, number> = {};
        const previous: Record<string, { node: string, edge: Edge }> = {};
        const pq = new PriorityQueue();

        distances[startNodeId] = 0;
        pq.enqueue(startNodeId, 0);

        const visited = new Set<string>();

        while (!pq.isEmpty()) {
            const { element: innerCurrentNodeId } = pq.dequeue();
            const currentDist = distances[innerCurrentNodeId];

            if (currentDist === undefined) continue;

            if (innerCurrentNodeId === endNodeId) {
                // Reconstruct path
                const path: Node[] = [];
                const edges: Edge[] = [];
                let curr = endNodeId;
                while (curr !== startNodeId) {
                    path.push(this.graph.nodes[curr]);
                    const prev = previous[curr];
                    if (prev) {
                        edges.push(prev.edge);
                        curr = prev.node;
                    } else {
                        break; // Should not happen if path exists
                    }
                }
                path.push(this.graph.nodes[startNodeId]);
                const orderedPath = path.reverse();
                const orderedEdges = edges.reverse();
                const startNode = this.graph.nodes[startNodeId];
                const startAnchor: [number, number] = [startNode.lon, startNode.lat];
                const segments = stitchRouteSegments(orderedEdges.map(e => e.geometry), startAnchor);
                const geometry = segments.flat(); // Flatten all segments into one linestring
                return {
                    pathNodeIds: orderedPath.map(n => n.id),
                    edges: orderedEdges,
                    totalDist: distances[endNodeId],
                    segments: segments,
                    geometry: geometry
                };
            }

            if (visited.has(innerCurrentNodeId)) continue;
            visited.add(innerCurrentNodeId);

            const neighbors = this.graph.adjList[innerCurrentNodeId] || [];
            for (const edge of neighbors) {
                if (this.graph.isEdgeDisabled(edge)) continue;

                const neighborId = edge.source === innerCurrentNodeId ? edge.target : edge.source;
                if (visited.has(neighborId)) continue;

                // Calculate edge weight with delay penalties
                let edgeWeight = edge.dist_km;

                // Add delay penalty for edges that pass through chokepoints with delays
                if (delayPenalties && edge.chokepoints) {
                    for (const chokepoint of edge.chokepoints) {
                        const delayHours = delayPenalties[chokepoint];
                        if (delayHours && delayHours > 0) {
                            // Convert delay hours to equivalent distance (km)
                            const delayKm = delayHours * SHIP_SPEED_KM_H;
                            edgeWeight += delayKm;
                        }
                    }
                }

                const newDist = currentDist + edgeWeight;
                if (newDist < (distances[neighborId] || Infinity)) {
                    distances[neighborId] = newDist;
                    previous[neighborId] = { node: innerCurrentNodeId, edge: edge };

                    // A* Heuristic
                    const neighborNode = this.graph.nodes[neighborId];
                    const endNode = this.graph.nodes[endNodeId];
                    const h = heuristic(neighborNode, endNode);

                    pq.enqueue(neighborId, newDist + h);
                }
            }
        }

        return null;
    }
}
