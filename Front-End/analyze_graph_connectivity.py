import json
import networkx as nx

GRAPH_FILE = "maritime_transport_graph.json"

def analyze_connectivity():
    print(f"Loading {GRAPH_FILE}...")
    with open(GRAPH_FILE, 'r') as f:
        data = json.load(f)

    G = nx.Graph()
    # Add nodes
    for node_id in data['nodes']:
        G.add_node(node_id)
    
    # Add edges
    for edge in data['edges']:
        G.add_edge(edge['source'], edge['target'])
    
    print(f"Graph loaded: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    
    # Analyze connected components
    components = list(nx.connected_components(G))
    print(f"Number of connected components: {len(components)}")
    
    # Sort by size
    components.sort(key=len, reverse=True)
    
    print("\nTop 10 Components by size:")
    for i, c in enumerate(components[:10]):
        print(f"Component {i+1}: {len(c)} nodes")
        
    largest = components[0]
    print(f"\nLargest Component has {len(largest)} nodes ({len(largest)/G.number_of_nodes()*100:.1f}% of total)")

if __name__ == "__main__":
    analyze_connectivity()
