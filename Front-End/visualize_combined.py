
import geopandas as gpd
import matplotlib.pyplot as plt
import networkx as nx
import sys
import os

# Configure GDAL to restore/generate missing .shx file if possible
os.environ['SHAPE_RESTORE_SHX'] = 'YES'

SHAPEFILE_PATH = 'Shipping-Lanes-v1.shp'
GRAPHML_INPUT = 'ports_nodes_only.graphml'
OUTPUT_IMAGE = 'combined_map.png'

def main():
    try:
        # 1. Load Shipping Lanes
        if not os.path.exists(SHAPEFILE_PATH):
            print(f"Error: Shapefile not found at {SHAPEFILE_PATH}")
            sys.exit(1)
            
        print(f"Loading shipping lanes from {SHAPEFILE_PATH}...")
        gdf_lanes = gpd.read_file(SHAPEFILE_PATH)
        
        if not gdf_lanes.crs:
            print("Lanes CRS Missing. Setting to EPSG:4326.")
            gdf_lanes.set_crs(epsg=4326, inplace=True)
        else:
            print(f"Lanes CRS: {gdf_lanes.crs}")
            # Ensure it's 4326 for consistency with lat/lon ports
            if gdf_lanes.crs.to_string() != 'EPSG:4326':
                 gdf_lanes = gdf_lanes.to_crs(epsg=4326)

        # 2. Load Ports
        if not os.path.exists(GRAPHML_INPUT):
            print(f"Error: GraphML not found at {GRAPHML_INPUT}")
            sys.exit(1)

        print(f"Loading ports from {GRAPHML_INPUT}...")
        G = nx.read_graphml(GRAPHML_INPUT)
        
        port_lats = []
        port_lons = []
        
        for n, data in G.nodes(data=True):
            try:
                lat = float(data.get('lat', 0))
                lon = float(data.get('lon', 0))
                port_lats.append(lat)
                port_lons.append(lon)
            except (ValueError, TypeError):
                continue
        
        print(f"Loaded {len(port_lats)} ports.")

        # 3. Plotting
        print("Plotting combined map...")
        fig, ax = plt.subplots(figsize=(18, 10))
        
        # Layer 1: Shipping Lanes (Blue, faint)
        gdf_lanes.plot(ax=ax, linewidth=0.3, color='#4a90e2', alpha=0.5, zorder=1, label='Shipping Lanes')
        
        # Layer 2: Ports (Red dots, small)
        ax.scatter(port_lons, port_lats, s=2, c='#e74c3c', alpha=0.7, zorder=2, label='Ports') # Red

        # Styling
        ax.set_aspect('equal')
        ax.axis('off')
        plt.title('Global Maritime Network: Ports & Shipping Lanes', fontsize=16)
        
        # Create a custom legend
        from matplotlib.lines import Line2D
        legend_elements = [
            Line2D([0], [0], color='#4a90e2', lw=1, label='Shipping Lanes'),
            Line2D([0], [0], marker='o', color='w', label='Ports', markerfacecolor='#e74c3c', markersize=5),
        ]
        ax.legend(handles=legend_elements, loc='lower left')

        plt.tight_layout()
        
        print(f"Saving to {OUTPUT_IMAGE}...")
        plt.savefig(OUTPUT_IMAGE, dpi=300, bbox_inches='tight', pad_inches=0.1)
        print("Done.")

    except Exception as e:
        print(f"An error occurred: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
