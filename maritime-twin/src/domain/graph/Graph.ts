import { GraphData, Node, Edge, Port, Chokepoint } from '../types';

export class MaritimeGraph {
    data: GraphData;

    constructor(data: GraphData) {
        this.data = data;
    }

    static async load(uRl: string): Promise<MaritimeGraph> {
        const response = await fetch(uRl);
        const json = await response.json();

        // Transform JSON if necessary to match GraphData interface
        // Presuming the JSON structure matches or we map it here
        return new MaritimeGraph(json as GraphData);
    }

    getNodes(): Record<string, Node> {
        return this.data.nodes;
    }

    getEdges(): Edge[] {
        return this.data.edges;
    }

    // ... other accessors
}
