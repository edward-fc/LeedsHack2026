import geopandas as gpd
import pandas as pd
import shapely.geometry as sg
import networkx as nx
import matplotlib.pyplot as plt
import json
import logging

# Configuration
CHOKEPOINT_BUFFER_KM = 50  # 50 km buffer
PORT_ROUTE_THRESHOLD_KM = 50 # 50 km association threshold
CRS_METRIC = "EPSG:3857" # Web Mercator for meter-based operations (approximate)
CRS_GEO = "EPSG:4326"    # WGS84 for lat/lon

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def load_data():
    """Lengths and returns the shipping lanes and ports data."""
    logging.info("Loading Shipping Lanes...")
    try:
        lanes = gpd.read_file("Shipping-Lanes-v1.shp")
        if lanes.crs is None:
            lanes.set_crs(CRS_GEO, inplace=True)
        lanes = lanes.to_crs(CRS_METRIC)
        # Ensure index is reset for easier merging
        lanes = lanes.reset_index(names=['lane_id'])
    except Exception as e:
        logging.error(f"Error loading shipping lanes: {e}")
        return None, None

    logging.info("Loading Ports...")
    try:
        with open("ports.json", "r") as f:
            ports_data = json.load(f)
        
        # Convert to DataFrame
        df_ports = pd.DataFrame(ports_data)
        
        # Create Geometry
        geometry = [sg.Point(xy) for xy in zip(df_ports["LONGITUDE"], df_ports["LATITUDE"])]
        ports = gpd.GeoDataFrame(df_ports, geometry=geometry, crs=CRS_GEO)
        ports = ports.to_crs(CRS_METRIC)
        # Ensure index is reset
        ports = ports.reset_index(names=['port_id'])
    except Exception as e:
        logging.error(f"Error loading ports: {e}")
        return None, None
        
    return lanes, ports

def define_chokepoints():
    """Defines chokepoints and creates their buffered geometries."""
    # Approximate coordinates (Lat, Lon)
    cp_coords = {
        "Suez Canal": (30.5852, 32.2654),
        "Panama Canal": (9.0765, -79.6957), # Near entrance
        "Strait of Hormuz": (26.5667, 56.2500),
        "Bab el-Mandeb": (12.5833, 43.3333),
        "Strait of Malacca": (4.1667, 99.5000), # Middle
        "Bosphorus": (41.1167, 29.0833), # North end
        "Dardanelles": (40.0167, 26.2167), # West end
        "Strait of Gibraltar": (35.9500, -5.6000),
        "English Channel": (50.0, 0.0), # Approximate middle
        "Danish Straits": (55.5, 11.0), # Great Belt
        "Lombok Strait": (-8.7667, 115.7167),
        "Sunda Strait": (-5.9167, 105.8833)
    }

    names = []
    lats = []
    lons = []
    geometries = []

    for name, (lat, lon) in cp_coords.items():
        names.append(name)
        lats.append(lat)
        lons.append(lon)
        geometries.append(sg.Point(lon, lat))

    chokepoints = gpd.GeoDataFrame({"name": names, "lat": lats, "lon": lons}, geometry=geometries, crs=CRS_GEO)
    chokepoints = chokepoints.to_crs(CRS_METRIC)
    
    # Create Buffer
    # 50km = 50000 meters
    chokepoints["buffer"] = chokepoints.geometry.buffer(CHOKEPOINT_BUFFER_KM * 1000)
    
    # Store buffer as the main geometry for intersection checks, but keep point geometry for visualization
    chokepoints["point_geometry"] = chokepoints.geometry
    chokepoints.set_geometry("buffer", inplace=True)
    
    return chokepoints

def analyze_chokepoints(lanes, chokepoints):
    """Detects intersections between routes and chokepoint buffers."""
    logging.info("Identifying intersections between routes and chokepoints...")
    
    # Spatial join to find intersections
    # We want to know which lane intersects with which chokepoint buffer
    intersection = gpd.sjoin(lanes, chokepoints, how="inner", predicate="intersects")
    
    # Group by lane_id and collect chokepoint names
    lane_chokepoints = intersection.groupby("lane_id")["name"].apply(list).to_dict()
    
    logging.info(f"Found {len(lane_chokepoints)} routes intersecting with chokepoints.")
    return lane_chokepoints, intersection

def associate_ports_routes(ports, lanes):
    """Associates ports with the nearest shipping lane within threshold."""
    logging.info("Associating ports with nearest routes...")
    
    # Using sjoin_nearest to find the nearest lane for each port
    # max_distance is in CRS units (meters for EPSG:3857)
    limit = PORT_ROUTE_THRESHOLD_KM * 1000
    
    try:
        nearest = gpd.sjoin_nearest(ports, lanes, how="left", max_distance=limit, distance_col="dist_meters")
        
        # There might be multiple lanes equidistant or within range
        # We'll take the closest one
        nearest = nearest.sort_values("dist_meters").drop_duplicates("port_id")
        
        # Create a mapping
        port_route_map = nearest.set_index("port_id")[["lane_id", "dist_meters"]].to_dict(orient="index")
        
        logging.info(f"Associated {len(port_route_map)} ports with routes.")
        return port_route_map
    except Exception as e:
        logging.error(f"Error in spatial join: {e}")
        return {}

def build_network(lanes, ports, chokepoints, lane_chokepoints, port_route_map):
    """Builds the NetworkX graph."""
    logging.info("Building network graph...")
    G = nx.Graph()
    
    # Add Chokepoints
    for _, cp in chokepoints.iterrows():
        G.add_node(f"CP_{cp['name']}", type="chokepoint", name=cp["name"], lat=cp["lat"], lon=cp["lon"])
        
    # Add Lanes (Routes)
    for _, lane in lanes.iterrows():
        G.add_node(f"Route_{lane['lane_id']}", type="route", lane_id=lane["lane_id"])
        
        # Link Route to Chokepoints
        if lane["lane_id"] in lane_chokepoints:
            for cp_name in lane_chokepoints[lane["lane_id"]]:
                G.add_edge(f"Route_{lane['lane_id']}", f"CP_{cp_name}", relation="intersects")
                
    # Add Ports
    for idx, port in ports.iterrows():
        port_id_str = f"Port_{idx}"
        G.add_node(port_id_str, type="port", name=port.get("CITY", f"Port {idx}"), 
                   country=port.get("COUNTRY", ""), lat=port.geometry.y, lon=port.geometry.x)
        
        # Link Port to Route
        if idx in port_route_map:
            assoc = port_route_map[idx]
            lane_id = assoc["lane_id"]
            dist = assoc["dist_meters"]
            # Check if lane exists (it should)
            if not pd.isna(lane_id):
                 G.add_edge(port_id_str, f"Route_{int(lane_id)}", relation="access", distance=dist)
    
    logging.info(f"Network built with {G.number_of_nodes()} nodes and {G.number_of_edges()} edges.")
    return G

def visualize_network(lanes, ports, chokepoints, output_path="maritime_network_map.png"):
    """Generates a static map visualization."""
    logging.info("Generating visualization...")
    fig, ax = plt.subplots(figsize=(20, 15))
    
    # Plot layers
    # World map background (removed due to dependency issue)
    # world = gpd.read_file(gpd.datasets.get_path('naturalearth_lowres')).to_crs(CRS_METRIC)
    # world.plot(ax=ax, color='lightgrey', edgecolor='white')

    # Lanes
    lanes.plot(ax=ax, color='blue', linewidth=0.5, alpha=0.6, label='Shipping Routes')
    
    # Ports
    ports.plot(ax=ax, color='green', markersize=5, alpha=0.7, label='Ports')
    
    # Chokepoints (Buffer)
    chokepoints.plot(ax=ax, color='red', alpha=0.2, edgecolor='red')
    
    # Chokepoints (Centroids/Markers)
    # We need to switch geometry back to points temporarily or use the stored column
    chokepoints.set_geometry("point_geometry").plot(ax=ax, color='red', marker='*', markersize=100, label='Chokepoints', zorder=10)
    
    # Labels for Chokepoints
    for _, cp in chokepoints.iterrows():
        pt = cp["point_geometry"]
        ax.annotate(cp["name"], xy=(pt.x, pt.y), xytext=(5, 5), textcoords="offset points", fontsize=8, color='darkred')
        
    plt.title("Global Maritime Network: Ports, Routes, and Chokepoints")
    plt.legend()
    plt.tight_layout()
    plt.savefig(output_path, dpi=300)
    print(f"Map saved to {output_path}")

def export_network(G, output_path="maritime_network.graphml"):
    """Exports the network to GraphML."""
    logging.info(f"Exporting network to {output_path}...")
    nx.write_graphml(G, output_path)

def print_stats(G, chokepoints):
    """Prints summary statistics."""
    logging.info("Calculating statistics...")
    
    num_ports = len([n for n, d in G.nodes(data=True) if d['type'] == 'port'])
    num_routes = len([n for n, d in G.nodes(data=True) if d['type'] == 'route'])
    num_cps = len([n for n, d in G.nodes(data=True) if d['type'] == 'chokepoint'])
    
    print("\n--- Network Statistics ---")
    print(f"Total Nodes: {G.number_of_nodes()}")
    print(f"  - Ports: {num_ports}")
    print(f"  - Routes: {num_routes}")
    print(f"  - Chokepoints: {num_cps}")
    print(f"Total Edges: {G.number_of_edges()}")
    
    # Routes per Chokepoint
    print("\n--- Routes per Chokepoint ---")
    for cp_node in [n for n, d in G.nodes(data=True) if d['type'] == 'chokepoint']:
        degree = G.degree(cp_node)
        print(f"{cp_node}: {degree} connected routes")

def main():
    print("--- Maritime Network Analysis ---")
    
    # 1. Load Data
    lanes, ports = load_data()
    if lanes is None or ports is None:
        return

    print(f"Loaded {len(lanes)} shipping lanes and {len(ports)} ports.")

    # 2. Define Chokepoints
    chokepoints = define_chokepoints()
    print(f"Defined {len(chokepoints)} chokepoints.")
    
    # 3. Analyze Intersections
    lane_chokepoints, intersection = analyze_chokepoints(lanes, chokepoints)
    
    # 4. Associate Ports
    port_route_map = associate_ports_routes(ports, lanes)
    
    # 5. Build Network
    G = build_network(lanes, ports, chokepoints, lane_chokepoints, port_route_map)
    
    # 6. Visualize
    visualize_network(lanes, ports, chokepoints)
    
    # 7. Export & Stats
    export_network(G)
    print_stats(G, chokepoints)
    
    print("Analysis Complete.")

if __name__ == "__main__":
    main()
