
import matplotlib.pyplot as plt
import networkx as nx
import sys

GRAPHML_INPUT = 'ports_nodes_only.graphml'
MAP_OUTPUT = 'ports_map.png'

def main():
    try:
        print(f"Loading graph from {GRAPHML_INPUT}...")
        G = nx.read_graphml(GRAPHML_INPUT)
        
        print(f"Plotting {len(G.nodes)} nodes...")
        
        lats = []
        lons = []
        colors = []
        
        # Color by zone code if available, else default
        # Simple color mapping logic can be added, but for now just blue
        
        for n, data in G.nodes(data=True):
            # GraphML attributes are strings usually, convert back if needed
            try:
                lat = float(data.get('lat', 0))
                lon = float(data.get('lon', 0))
                lats.append(lat)
                lons.append(lon)
            except (ValueError, TypeError):
                continue

        plt.figure(figsize=(12, 6))
        # Use a background image or just white? 
        # Standard scatter plot without basemap for now as requested no basemap dependency
        
        plt.scatter(lons, lats, s=2, alpha=0.6, c='blue', edgecolors='none')
        
        plt.title('Global Port Locations')
        plt.xlabel('Longitude')
        plt.ylabel('Latitude')
        plt.grid(True, linestyle='--', alpha=0.3)
        plt.axis('equal') # Keep aspect ratio reasonable (though plate-carree distortion exists)
        plt.xlim(-180, 180)
        plt.ylim(-90, 90)
        
        print(f"Saving map to {MAP_OUTPUT}...")
        plt.savefig(MAP_OUTPUT, dpi=300, bbox_inches='tight')
        print("Done.")
        
    except FileNotFoundError:
        print(f"Error: Could not find {GRAPHML_INPUT}. specific run process_ports.py first.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
