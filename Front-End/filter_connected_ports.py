import geopandas as gpd
import pandas as pd
import shapely.geometry as sg
import matplotlib.pyplot as plt
import json
import logging
import os

# Configuration
SHIPPING_LANES_FILE = "Shipping-Lanes-v1.shp"
PORTS_FILE = "ports.json"
OUTPUT_GEOJSON = "connected_ports.geojson"
OUTPUT_CSV = "connected_ports_summary.csv"
OUTPUT_MAP = "connected_ports_map.png"
DISTANCE_THRESHOLD_KM = 50
CRS_METRIC = "EPSG:3857"  # Web Mercator for meter-based operations
CRS_GEO = "EPSG:4326"     # WGS84 for lat/lon outputs

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def load_data():
    """Loads and standardizes shipping lanes and ports data."""
    logging.info("Loading Data...")
    
    # Load Shipping Lanes
    if not os.path.exists(SHIPPING_LANES_FILE):
        logging.error(f"File not found: {SHIPPING_LANES_FILE}")
        return None, None
        
    lanes = gpd.read_file(SHIPPING_LANES_FILE)
    if lanes.crs is None:
        lanes.set_crs(CRS_GEO, inplace=True) # Assuming WGS84 if not set
    lanes = lanes.to_crs(CRS_METRIC)
    # Ensure unique ID for lanes if not present
    if "lane_id" not in lanes.columns:
        lanes["lane_id"] = lanes.index 

    # Load Ports
    if not os.path.exists(PORTS_FILE):
        logging.error(f"File not found: {PORTS_FILE}")
        return None, None

    with open(PORTS_FILE, "r") as f:
        ports_data = json.load(f)
    
    df_ports = pd.DataFrame(ports_data)
    geometry = [sg.Point(xy) for xy in zip(df_ports["LONGITUDE"], df_ports["LATITUDE"])]
    ports = gpd.GeoDataFrame(df_ports, geometry=geometry, crs=CRS_GEO)
    ports = ports.to_crs(CRS_METRIC)
    
    # Ensure unique ID for ports
    ports["port_id"] = ports.index
    
    return lanes, ports

def filter_ports(lanes, ports):
    """Filters ports based on distance to nearest shipping lane."""
    logging.info(f"Filtering ports within {DISTANCE_THRESHOLD_KM} km of shipping lanes...")
    
    # Use sjoin_nearest to find nearest lane and distance for ALL ports
    # max_distance argument is efficient but we want distances for all to verify
    # However, sjoin_nearest with max_distance is much faster.
    
    threshold_meters = DISTANCE_THRESHOLD_KM * 1000
    
    # Perform spatial join
    # "dist_meters" will contain the distance
    nearest = gpd.sjoin_nearest(ports, lanes, how="inner", max_distance=threshold_meters, distance_col="dist_meters")
    
    # Handle duplicates (a port might be close to multiple lane segments)
    # Keep the one with the minimum distance
    connected_ports = nearest.sort_values("dist_meters").drop_duplicates("port_id")
    
    # Add distance in km
    connected_ports["distance_to_route_km"] = connected_ports["dist_meters"] / 1000.0
    connected_ports["nearest_route_id"] = connected_ports["lane_id"] # Rename for clarity
    
    # Clean up columns for export (keep original port columns + new info)
    # dropping columns from the lane dataset that joined
    cols_to_keep = [c for c in ports.columns if c != "geometry"] + ["nearest_route_id", "distance_to_route_km", "geometry"]
    # Be careful with column overlap
    final_cols = []
    for col in cols_to_keep:
        if col in connected_ports.columns:
            final_cols.append(col)
            
    connected_ports = connected_ports[final_cols]
    
    logging.info(f"Found {len(connected_ports)} connected ports out of {len(ports)} total.")
    
    return connected_ports

def visualize(lanes, connected_ports):
    """Generates a static map of shipping lanes and connected ports."""
    logging.info(f"Generating visualization: {OUTPUT_MAP}...")
    
    fig, ax = plt.subplots(figsize=(20, 15), facecolor='#f0f0f0')
    
    # Plot Lanes
    lanes.plot(ax=ax, color='#1f77b4', linewidth=0.5, alpha=0.6, label='Shipping Lanes', zorder=1)
    
    # Plot Connected Ports
    connected_ports.plot(ax=ax, color='#d62728', markersize=10, alpha=0.9, label='Connected Ports', zorder=2)
    
    plt.title(f"Global Maritime Network: Connected Ports ({DISTANCE_THRESHOLD_KM}km Threshold)", fontsize=16)
    plt.legend(loc='lower left')
    plt.axis('off') # Cleaner look
    
    plt.tight_layout()
    plt.savefig(OUTPUT_MAP, dpi=300, bbox_inches='tight')
    logging.info("Map saved.")

def export_data(connected_ports):
    """Exports filtered ports to GeoJSON and CSV."""
    logging.info("Exporting data...")
    
    # Reproject back to Lat/Lon for GeoJSON
    ports_out = connected_ports.to_crs(CRS_GEO)
    
    # 1. GeoJSON
    ports_out.to_file(OUTPUT_GEOJSON, driver="GeoJSON")
    logging.info(f"Saved {OUTPUT_GEOJSON}")
    
    # 2. CSV Summary
    # Drop geometry for CSV
    df_out = pd.DataFrame(ports_out.drop(columns="geometry"))
    df_out.to_csv(OUTPUT_CSV, index=False)
    logging.info(f"Saved {OUTPUT_CSV}")

def main():
    print("--- Starting Port Connectivity Filter ---")
    
    lanes, ports = load_data()
    if lanes is None or ports is None:
        logging.error("Failed to load data. Exiting.")
        return
        
    connected_ports = filter_ports(lanes, ports)
    
    if len(connected_ports) == 0:
        logging.warning("No connected ports found! Check threshold or CRS.")
        return
        
    visualize(lanes, connected_ports)
    export_data(connected_ports)
    
    print("--- Processing Complete ---")

if __name__ == "__main__":
    main()
