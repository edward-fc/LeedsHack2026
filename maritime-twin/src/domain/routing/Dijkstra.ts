import { PriorityQueue } from './PriorityQueue';
import { GraphIndex } from '../graph/GraphIndex';
import { Node, Edge, RouteResult } from '../types';

export class DijkstraRouter {
    graph: GraphIndex;

    constructor(graph: GraphIndex) {
        this.graph = graph;
    }

    findPath(startPortId: string, endPortId: string): RouteResult | null {
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
            const { element: innerCurrentNodeId, priority: currentDist } = pq.dequeue();

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

                // Construct full geometry
                const geometry: [number, number][] = [];
                for (let i = 0; i < orderedEdges.length; i++) {
                    const edge = orderedEdges[i];
                    const sourceNode = orderedPath[i];

                    // Determine orientation
                    // If we differ from edge.source, we assume we are traversing backward (Target -> Source)
                    // Note: This assumes edge.geometry is ordered Source -> Target.
                    let segment = edge.geometry;
                    if (sourceNode.id === edge.target) {
                        segment = [...edge.geometry].reverse();
                    }

                    if (i === 0) {
                        geometry.push(...segment);
                    } else {
                        // Avoid duplicating connection points
                        geometry.push(...segment.slice(1));
                    }
                }

                return {
                    pathNodeIds: orderedPath.map(n => n.id),
                    edges: orderedEdges,
                    totalDist: currentDist,
                    segments: orderedEdges.map(e => e.geometry),
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

                const newDist = currentDist + edge.dist_km;
                if (newDist < (distances[neighborId] || Infinity)) {
                    distances[neighborId] = newDist;
                    previous[neighborId] = { node: innerCurrentNodeId, edge: edge };
                    pq.enqueue(neighborId, newDist);
                }
            }
        }

        return null;
    }
}
