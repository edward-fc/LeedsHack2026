
import geopandas as gpd
import pandas as pd
import networkx as nx
import matplotlib.pyplot as plt
import logging
import os

# Configuration
GRAPHML_FILE = "maritime_shipping_network.graphml"
LANES_FILE = "newzealandpaul-Shipping-Lanes-b0ad85c/data/Shipping_Lanes_v1.geojson"
LANES_SHP = "newzealandpaul-Shipping-Lanes-b0ad85c/data/Shipping-Lanes-v1/Shipping-Lanes-v1.shp"
OUTPUT_IMAGE = "maritime_network_visualization.png"

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def main():
    logging.info("Starting Visualization...")
    
    # 1. Load the Graph
    if not os.path.exists(GRAPHML_FILE):
        logging.error(f"Graph file {GRAPHML_FILE} not found. Run build_port_to_port_graph.py first.")
        return

    G = nx.read_graphml(GRAPHML_FILE)
    logging.info(f"Loaded Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges.")
    
    # Extract Nodes (Ports)
    node_data = []
    for n, d in G.nodes(data=True):
        node_data.append({
            "id": n,
            "lat": float(d.get("lat", 0)),
            "lon": float(d.get("lon", 0)),
            "name": d.get("name", "Unknown")
        })
    df_nodes = pd.DataFrame(node_data)
    gdf_nodes = gpd.GeoDataFrame(df_nodes, geometry=gpd.points_from_xy(df_nodes.lon, df_nodes.lat), crs="EPSG:4326")
    
    # Extract Used Lane IDs
    used_lane_ids = set()
    for u, v, d in G.edges(data=True):
        lid = d.get("lane_id")
        if lid:
            used_lane_ids.add(str(lid))
            
    logging.info(f"Found {len(used_lane_ids)} unique shipping lanes used in the graph.")
    
    # 2. Load Shipping Lanes Geometry
    if os.path.exists(LANES_FILE):
        lanes = gpd.read_file(LANES_FILE)
    elif os.path.exists(LANES_SHP):
        lanes = gpd.read_file(LANES_SHP)
    else:
        logging.error("Shipping lanes data not found.")
        return

    # Assign IDs if missing (same logic as build script)
    if "lane_id" not in lanes.columns:
        lanes = lanes.explode(index_parts=True).reset_index(drop=True)
        lanes["lane_id"] = lanes.index.astype(str)
    else:
        # If IDs exist, we might need to explode to match if the build script did.
        # The build script exploded and THEN assigned IDs if missing.
        # If the file didn't have IDs, the build script generated them by index AFTER exploding.
        # We need to replicate that exactly to match.
        lanes = lanes.explode(index_parts=True).reset_index(drop=True)
        if "lane_id" not in lanes.columns: # Re-check after explode
             lanes["lane_id"] = lanes.index.astype(str)
             
    # Filter Lanes
    # We associate strictly by ID string
    active_lanes = lanes[lanes["lane_id"].astype(str).isin(used_lane_ids)]
    
    logging.info(f"Filtered to {len(active_lanes)} active lane geometries.")
    
    # 3. Plot
    fig, ax = plt.subplots(figsize=(20, 12), facecolor='#111111')
    ax.set_facecolor('#111111') # Dark background
    
    # World Background (optional, if we had it. For now just plot lanes)
    # Trying to load world from geopandas if available
    try:
        world = gpd.read_file(gpd.datasets.get_path('naturalearth_lowres'))
        world.plot(ax=ax, color='#222222', edgecolor='#333333')
    except:
        logging.warning("Could not load Natural Earth background.")

    # Plot Lanes
    # Color by Type if available
    if "Type" in active_lanes.columns:
        # Major
        major = active_lanes[active_lanes["Type"] == "Major"]
        major.plot(ax=ax, color='#4488ff', linewidth=1.5, alpha=0.8, label="Major Lanes", zorder=2)
        
        # Others
        others = active_lanes[active_lanes["Type"] != "Major"]
        others.plot(ax=ax, color='#4488ff', linewidth=0.8, alpha=0.4, label="Other Lanes", zorder=1)
    else:
        active_lanes.plot(ax=ax, color='#4488ff', linewidth=1, alpha=0.6, zorder=1)
        
    # Plot Ports
    gdf_nodes.plot(ax=ax, color='#ffcc00', markersize=15, alpha=0.9, zorder=3, label="Connected Ports")
    
    # Title and Legend
    plt.title(f"Maritime Network Graph\n{G.number_of_nodes()} Ports | {len(active_lanes)} Shipping Lanes", 
              fontsize=20, color='white', pad=20)
    
    # Legend customization
    leg = ax.legend(loc='lower left', facecolor='#111111', edgecolor='white', labelcolor='white')
    
    ax.set_axis_off()
    plt.tight_layout()
    
    plt.savefig(OUTPUT_IMAGE, dpi=300, bbox_inches='tight', facecolor='#111111')
    logging.info(f"Saved visualization to {OUTPUT_IMAGE}")

if __name__ == "__main__":
    main()
