import { Node, Edge, Port, Chokepoint, GraphData } from '../types';
import { addDatelineBridges } from './dateline';

export class GraphIndex {
    nodes: Record<string, Node> = {};
    adjList: Record<string, Edge[]> = {};
    ports: Record<string, Port> = {};
    chokepoints: Record<string, Chokepoint> = {};

    // UI State affecting the graph view
    disabledPorts: Set<string> = new Set();
    disabledChokepoints: Set<string> = new Set();

    constructor() { }

    loadFromData(data: GraphData) {
        this.nodes = data.nodes;
        this.ports = data.ports;
        this.chokepoints = data.chokepoints;

        // Polyfill IDs if missing
        for (const [id, port] of Object.entries(this.ports)) {
            if (!port.id) port.id = id;
        }

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

        // 3. Stitch Dateline
        addDatelineBridges(this.nodes, this.adjList);
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

    isEdgeDisabled(edge: Edge): boolean {
        // Check chokepoints
        if (edge.chokepoints && edge.chokepoints.length > 0) {
            for (const cp of edge.chokepoints) {
                if (this.disabledChokepoints.has(cp)) return true;
            }
        }
        return false;
    }
}
