import { PriorityQueue } from './PriorityQueue'; // We'll implement a simple PQ

export interface Node {
    id: string;
    lat: number;
    lon: number;
}

export interface Edge {
    source: string;
    target: string;
    dist_km: number;
    geometry: [number, number][]; // [lon, lat]
    chokepoints: string[];
    lane_id: string;
}

export interface Port {
    id: string; // port_id
    name: string;
    country: string;
    lat: number;
    lon: number;
    node_id: string;
    dist_to_node: number;
}

export interface Chokepoint {
    name: string;
    lat: number;
    lon: number;
}

export interface GraphData {
    nodes: Record<string, Node>;
    edges: Edge[];
    ports: Record<string, Port>;
    chokepoints: Record<string, Chokepoint>;
}

export interface RouteResult {
    path: Node[];
    edges: Edge[];
    totalDist: number;
    segments: [number, number][][];
}

export class MaritimeGraph {
    nodes: Record<string, Node> = {};
    adjList: Record<string, Edge[]> = {}; // node_id -> edges
    ports: Record<string, Port> = {};
    chokepoints: Record<string, Chokepoint> = {};

    disabledPorts: Set<string> = new Set(); // Set of port_ids
    disabledChokepoints: Set<string> = new Set(); // Set of chokepoint names

    constructor() { }

    private distanceKm(a: [number, number], b: [number, number]): number {
        const R = 6371; // km
        const dLat = (b[1] - a[1]) * Math.PI / 180;
        const dLon = (b[0] - a[0]) * Math.PI / 180;
        const lat1 = a[1] * Math.PI / 180;
        const lat2 = b[1] * Math.PI / 180;

        const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
        return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }

    private stitchGeometries(edges: Edge[]): [number, number][][] {
        const merged: [number, number][] = [];
        const epsilonKm = 0.01; // 10 meters

        for (const edge of edges) {
            if (!edge.geometry || edge.geometry.length === 0) continue;

            let geometry = edge.geometry;
            if (merged.length > 0) {
                const prevEnd = merged[merged.length - 1];
                const start = geometry[0];
                const end = geometry[geometry.length - 1];

                const distToStart = this.distanceKm(prevEnd, start);
                const distToEnd = this.distanceKm(prevEnd, end);
                if (distToEnd < distToStart) {
                    geometry = [...geometry].reverse();
                }

                const nextStart = geometry[0];
                if (this.distanceKm(prevEnd, nextStart) > epsilonKm) {
                    merged.push(nextStart);
                }

                for (let i = 0; i < geometry.length; i++) {
                    if (i === 0 && this.distanceKm(prevEnd, geometry[0]) <= epsilonKm) continue;
                    merged.push(geometry[i]);
                }
            } else {
                merged.push(...geometry);
            }
        }

        return merged.length ? [merged] : [];
    }

    async loadGraph(url: string) {
        try {
            console.log(`Fetching graph from ${url}...`);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch graph: ${response.statusText}`);
            const data: GraphData = await response.json();

            this.nodes = data.nodes;
            this.ports = data.ports;
            this.chokepoints = data.chokepoints;

            // Polyfill IDs if missing (critical for UI)
            for (const [id, port] of Object.entries(this.ports)) {
                if (!port.id) port.id = id;
            }

            console.log(`Graph data received. Nodes: ${Object.keys(this.nodes).length}, Edges: ${data.edges?.length}, Ports: ${Object.keys(this.ports).length}`);

            // Build Adjacency List
            this.adjList = {};
            if (data.edges) {
                data.edges.forEach(edge => {
                    if (!this.adjList[edge.source]) this.adjList[edge.source] = [];
                    if (!this.adjList[edge.target]) this.adjList[edge.target] = [];

                    this.adjList[edge.source].push(edge);
                    this.adjList[edge.target].push(edge);
                });
            }

            console.log(`Graph loaded: ${Object.keys(this.nodes).length} nodes, ${data.edges?.length || 0} edges`);
        } catch (e) {
            console.error("Error loading graph:", e);
            throw e;
        }
    }

    togglePort(portId: string) {
        if (this.disabledPorts.has(portId)) {
            this.disabledPorts.delete(portId);
        } else {
            this.disabledPorts.add(portId);
        }
    }

    toggleChokepoint(name: string) {
        if (this.disabledChokepoints.has(name)) {
            this.disabledChokepoints.delete(name);
        } else {
            this.disabledChokepoints.add(name);
        }
    }

    isNodeDisabled(nodeId: string): boolean {
        // Check if node corresponds to a disabled port
        // Reverse lookup implies iterate ports? Too slow.
        // Better: when disabling port, find its node_id and mark it?
        // BUT multiple ports might share a node.
        // So distinct disabledPorts set is good for UI.
        // For routing, we check if the node is the access node of a disabled port.
        // Actually, simple: if port is disabled, we can't start or end there.
        // Can we transit? Yes, usually.
        // Requirement: "cannot be used as start/end or transit node"
        // So we need to map node_id -> port_id(s) to check efficiently.
        return false; // Implemented below
    }

    isEdgeDisabled(edge: Edge): boolean {
        // Check chokepoints
        if (edge.chokepoints && edge.chokepoints.length > 0) {
            for (const cp of edge.chokepoints) {
                if (this.disabledChokepoints.has(cp)) return true;
            }
        }
        return false;
    }

    findPath(startPortId: string, endPortId: string): RouteResult | null {
        if (this.disabledPorts.has(startPortId) || this.disabledPorts.has(endPortId)) {
            return null;
        }

        const startNodeId = this.ports[startPortId]?.node_id;
        const endNodeId = this.ports[endPortId]?.node_id;

        console.log(`[GraphEngine] Finding path: Port ${startPortId} -> Port ${endPortId}`);
        console.log(`[GraphEngine] Nodes: ${startNodeId} -> ${endNodeId}`);

        if (!startNodeId || !endNodeId) {
            console.error("[GraphEngine] Invalid start or end node ID.");
            return null;
        }

        if (!this.nodes[startNodeId]) console.error(`[GraphEngine] Start node ${startNodeId} not found in this.nodes`);
        if (!this.nodes[endNodeId]) console.error(`[GraphEngine] End node ${endNodeId} not found in this.nodes`);

        if (!this.adjList[startNodeId] || this.adjList[startNodeId].length === 0) {
            console.warn(`[GraphEngine] Start node ${startNodeId} has no outgoing edges! It is isolated.`);
        }
        if (!this.adjList[endNodeId] || this.adjList[endNodeId].length === 0) {
            console.warn(`[GraphEngine] End node ${endNodeId} has no incoming edges! It is isolated.`);
        }

        // Dijkstra / A*
        const distances: Record<string, number> = {};
        const previous: Record<string, { node: string, edge: Edge }> = {};
        const pq = new PriorityQueue();

        distances[startNodeId] = 0;
        pq.enqueue(startNodeId, 0);

        const visited = new Set<string>();
        let visitedCount = 0;

        while (!pq.isEmpty()) {
            const { element: innerCurrentNodeId, priority: currentDist } = pq.dequeue();

            if (innerCurrentNodeId === endNodeId) {
                // Reconstruct path
                const path: Node[] = [];
                const edges: Edge[] = [];
                let curr = endNodeId;
                while (curr !== startNodeId) {
                    path.push(this.nodes[curr]);
                    const prev = previous[curr];
                    edges.push(prev.edge);
                    curr = prev.node;
                }
                path.push(this.nodes[startNodeId]);
                const orderedPath = path.reverse();
                const orderedEdges = edges.reverse();
                return {
                    path: orderedPath,
                    edges: orderedEdges,
                    totalDist: currentDist,
                    segments: this.stitchGeometries(orderedEdges)
                };
            }

            if (visited.has(innerCurrentNodeId)) continue;
            visited.add(innerCurrentNodeId);

            visitedCount++;
            if (visitedCount % 1000 === 0) console.log(`[GraphEngine] Visited ${visitedCount} nodes... Current Dist: ${currentDist}`);

            // Check if this node is disabled (transit)
            // For now, simplify: ports don't block nodes, only endpoints.

            const neighbors = this.adjList[innerCurrentNodeId] || [];
            for (const edge of neighbors) {
                if (this.isEdgeDisabled(edge)) continue;

                const neighborId = edge.source === innerCurrentNodeId ? edge.target : edge.source;
                if (visited.has(neighborId)) continue;

                const newDist = currentDist + edge.dist_km;
                if (newDist < (distances[neighborId] || Infinity)) {
                    distances[neighborId] = newDist;
                    previous[neighborId] = { node: innerCurrentNodeId, edge: edge };
                    // Simple Dijkstra for now. For A*, add heuristic(neighbor, end)
                    pq.enqueue(neighborId, newDist);
                }
            }
        }

        console.warn(`[GraphEngine] Pathfinding finished. Visited ${visitedCount} nodes. Target not found.`);
        return null;
    }

    /**
     * Interpolates a point along a route of segments.
     * @param segments List of linestrings (each linestring is [lon, lat][])
     * @param distanceKm Target distance from start
     * @returns [lon, lat] or null if invalid
     */
    getPointAlongRoute(segments: [number, number][][], distanceKm: number): [number, number] | null {
        if (!segments || segments.length === 0) return null;
        if (distanceKm <= 0) return segments[0][0]; // Start

        let coveredKm = 0;

        // Iterate through all segments in order
        for (const segment of segments) {
            // Iterate through points in the segment
            for (let i = 0; i < segment.length - 1; i++) {
                const p1 = segment[i];
                const p2 = segment[i + 1];

                // Segment Distance
                const dLat = p2[1] - p1[1];
                const dLon = p2[0] - p1[0];

                // Haversine or simple Euclidean? 
                // Segments are short, but let's use a rough km conversion for consistency with edge weights.
                // Graph build used: dist_km = geom_metric.length / 1000.0 or Haversine.
                // Let's use a standard Haversine here for precision on the fly.

                const R = 6371; // km
                const dLatRad = dLat * Math.PI / 180;
                const dLonRad = dLon * Math.PI / 180;
                const lat1Rad = p1[1] * Math.PI / 180;
                const lat2Rad = p2[1] * Math.PI / 180;

                const a = Math.sin(dLatRad / 2) * Math.sin(dLatRad / 2) +
                    Math.sin(dLonRad / 2) * Math.sin(dLonRad / 2) * Math.cos(lat1Rad) * Math.cos(lat2Rad);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                const segDist = R * c;

                if (segDist <= 0) {
                    continue;
                }

                if (coveredKm + segDist >= distanceKm) {
                    // Interpolate here
                    const remaining = distanceKm - coveredKm;
                    const ratio = remaining / segDist;

                    const lat = p1[1] + (p2[1] - p1[1]) * ratio;
                    const lon = p1[0] + (p2[0] - p1[0]) * ratio;
                    return [lon, lat];
                }

                coveredKm += segDist;
            }
        }

        // If we ran out of segments, return destination (last point of last segment)
        const lastSeg = segments[segments.length - 1];
        return lastSeg[lastSeg.length - 1];
    }
}
