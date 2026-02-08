import geopandas as gpd
import pandas as pd
import shapely.geometry as sg
import networkx as nx
import matplotlib.pyplot as plt
import json
import logging
import os

# Configuration
CHOKEPOINT_BUFFER_KM = 50  # 50 km buffer
PORT_ROUTE_THRESHOLD_KM = 50 # 50 km association threshold
CRS_METRIC = "EPSG:3857" # Web Mercator for meter-based operations
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
        # Ensure unique ID
        if "lane_id" not in lanes.columns:
            lanes["lane_id"] = lanes.index
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
        # Ensure unique ID
        ports["port_id"] = ports.index
    except Exception as e:
        logging.error(f"Error loading ports: {e}")
        return None, None
        
    return lanes, ports

def define_chokepoints():
    """Defines chokepoints and creates their buffered geometries."""
    # Approximate coordinates (Lat, Lon)
    cp_coords = {
        "Suez Canal": (30.5852, 32.2654),
        "Panama Canal": (9.0765, -79.6957),
        "Strait of Hormuz": (26.5667, 56.2500),
        "Bab el-Mandeb": (12.5833, 43.3333),
        "Strait of Malacca": (4.1667, 99.5000),
        "Bosphorus": (41.1167, 29.0833),
        "Dardanelles": (40.0167, 26.2167),
        "Strait of Gibraltar": (35.9500, -5.6000),
        "English Channel": (50.0, -0.5), 
        "Danish Straits": (55.5, 11.0), 
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
        # Note: sg.Point(x, y) = sg.Point(lon, lat)
        geometries.append(sg.Point(lon, lat))

    chokepoints = gpd.GeoDataFrame({"name": names, "lat": lats, "lon": lons}, geometry=geometries, crs=CRS_GEO)
    chokepoints = chokepoints.to_crs(CRS_METRIC)
    
    # Create Buffer
    # 50km = 50000 meters
    chokepoints["buffer"] = chokepoints.geometry.buffer(CHOKEPOINT_BUFFER_KM * 1000)
    
    # Keep original point for visualization, set buffer as active geometry for intersection
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
    """Associates ports with nearby shipping lanes within threshold."""
    logging.info("Associating ports with nearby routes...")
    
    limit = PORT_ROUTE_THRESHOLD_KM * 1000
    
    try:
        # We use sjoin_nearest. It finds the nearest, but we want ALL within threshold?
        # User req: "The nearest shipping lane ... OR all shipping lanes"
        # Let's stick to nearest for cleaner 1:1 or 1:N network, or all if feasible.
        # Given "Port -> Route (access)", allowing multiple connections makes sense for resilience analysis.
        # But sjoin_nearest with max_distance does exactly what we want if we want closest.
        # If we want ALL within distance, we should use sjoin with a buffer on ports.
        
        # Let's do ALL within distance using buffer for accurate "access" modeling
        ports_buffer = ports.copy()
        ports_buffer.geometry = ports.geometry.buffer(limit)
        
        # This is expensive. Let's stick to sjoin_nearest for now as it's optimized and requested "Associate... with nearest... OR all"
        # We will retrieve the nearest. If we want all within distance, sjoin_nearest with max_distance returns all candidates that are equidistant? No.
        # Let's use sjoin_nearest with max_distance.
        
        nearest = gpd.sjoin_nearest(ports, lanes, how="inner", max_distance=limit, distance_col="dist_meters")
        
        # This might return multiple lanes if they are segmentized.
        # We'll keep all valid associations found by sjoin_nearest within limit.
        
        # Create a mapping: port_id -> list of (lane_id, distance)
        port_route_map = {}
        for _, row in nearest.iterrows():
            pid = row["port_id"]
            lid = row["lane_id"]
            dist = row["dist_meters"]
            if pid not in port_route_map:
                port_route_map[pid] = []
            port_route_map[pid].append({"lane_id": lid, "dist_meters": dist})
        
        logging.info(f"Associated ports to routes.")
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
        node_id = f"CP_{cp['name']}"
        G.add_node(node_id, type="chokepoint", name=cp["name"], lat=cp["lat"], lon=cp["lon"])
        
    # Add Lanes (Routes)
    # We only add lanes that are connected to something (port or chokepoint) to keep graph clean? 
    # Or all lanes? Let's add all lanes to be safe, or at least those in our intersections.
    # Actually, if we want a connected graph, we need the route segments. 
    # But shapefile routes might be fragmented.
    # We will treat each geometry in shipping lanes as a "Route" node.
    for idx, lane in lanes.iterrows():
        node_id = f"Route_{interaction_id(lane['lane_id'])}"
        G.add_node(node_id, type="route", lane_id=lane["lane_id"])
        
        # Link Route to Chokepoints
        if lane["lane_id"] in lane_chokepoints:
            for cp_name in lane_chokepoints[lane["lane_id"]]:
                G.add_edge(node_id, f"CP_{cp_name}", relation="intersects")
                
    # Add Ports
    for idx, port in ports.iterrows():
        port_id_str = f"Port_{idx}"
        # Only add if connected? User said "Associate...". If not connected, maybe don't add edges.
        # But we need nodes in graph.
        
        G.add_node(port_id_str, type="port", name=port.get("CITY", f"Port {idx}"), 
                   country=port.get("COUNTRY", ""), lat=port["LATITUDE"], lon=port["LONGITUDE"])
        
        # Link Port to Route
        if idx in port_route_map:
            for assoc in port_route_map[idx]:
                lane_id = assoc["lane_id"]
                dist = assoc["dist_meters"]
                route_node = f"Route_{interaction_id(lane_id)}"
                if G.has_node(route_node):
                    G.add_edge(port_id_str, route_node, relation="access", distance=dist)
    
    # Remove isolated route nodes?
    # isolate_nodes = [node for node, degree in dict(G.degree()).items() if degree == 0 and G.nodes[node]['type'] == 'route']
    # G.remove_nodes_from(isolate_nodes)
    
    logging.info(f"Network built with {G.number_of_nodes()} nodes and {G.number_of_edges()} edges.")
    return G

def interaction_id(val):
    """Helper to ensure ID is int or str consistently."""
    try:
        return int(val)
    except:
        return str(val)

def visualize_network(lanes, ports, chokepoints, G, output_path="maritime_network_map.png"):
    """Generates a static map visualization."""
    logging.info("Generating visualization...")
    fig, ax = plt.subplots(figsize=(24, 16), facecolor='#f4fbfd')
    ax.set_facecolor('#f4fbfd') # Sea color
    
    # 1. Lanes
    # Plot all lanes lightly
    lanes.plot(ax=ax, color='#6699cc', linewidth=0.8, alpha=0.5, label='Shipping Routes', zorder=1)
    
    # 2. Ports
    # Only plot connected ports? Or all? 
    # Let's plot all ports as small dots, connected ones slightly larger?
    # For now, just all ports.
    # ports.plot(ax=ax, color='grey', markersize=2, alpha=0.3, zorder=2)
    
    # Highlight connected ports
    connected_port_ids = [n for n, d in G.nodes(data=True) if d['type'] == 'port' and G.degree(n) > 0]
    # Filter geopandas
    # indices = [int(n.split('_')[1]) for n in connected_port_ids]
    # connected_ports = ports.loc[indices]
    
    # Because indices might not match exactly if we filtered earlier, let's just plot all ports from G
    # Extract lat/lon from G for connected ports
    if connected_port_ids:
        lats = [G.nodes[n]['lat'] for n in connected_port_ids]
        lons = [G.nodes[n]['lon'] for n in connected_port_ids]
        ax.scatter(lons, lats, c='#ff7f0e', s=15, alpha=0.8, label='Connected Ports', zorder=3)
    
    # 3. Chokepoints
    # Buffers
    chokepoints.plot(ax=ax, color='red', alpha=0.15, edgecolor='red', linewidth=1, zorder=4)
    # Markers
    cp_lons = chokepoints["lon"]
    cp_lats = chokepoints["lat"]
    ax.scatter(cp_lons, cp_lats, c='red', marker='*', s=300, label='Chokepoints', zorder=5, edgecolors='black')
    
    # Labels
    for _, cp in chokepoints.iterrows():
        ax.annotate(cp["name"], xy=(cp["lon"], cp["lat"]), xytext=(5, 5), textcoords="offset points", 
                    fontsize=10, color='darkred', fontweight='bold', bbox=dict(facecolor='white', alpha=0.9, edgecolor='none', boxstyle='round,pad=0.2'))

    plt.title("Global Maritime Network: Ports, Routes, and Chokepoints", fontsize=20)
    plt.legend(loc='lower left', fontsize=12)
    plt.tight_layout()
    plt.savefig(output_path, dpi=300)
    logging.info(f"Map saved to {output_path}")

def print_stats(G):
    """Prints summary statistics."""
    logging.info("Calculating statistics...")
    
    ports = [n for n, d in G.nodes(data=True) if d['type'] == 'port']
    routes = [n for n, d in G.nodes(data=True) if d['type'] == 'route']
    chokepoints = [n for n, d in G.nodes(data=True) if d['type'] == 'chokepoint']
    
    print("\n" + "="*40)
    print("      MARITIME NETWORK STATISTICS      ")
    print("="*40)
    print(f"Total Ports       : {len(ports)}")
    print(f"Total Routes      : {len(routes)}")
    print(f"Total Chokepoints : {len(chokepoints)}")
    print(f"Total Edges       : {G.number_of_edges()}")
    print("-" * 40)
    
    # 1. Ports per Route (Distribution)
    route_degrees = [G.degree(n) for n in routes]
    if route_degrees:
        avg_ports = sum(route_degrees) / len(routes)
        print(f"Avg Ports per Route segment: {avg_ports:.2f}")
    
    # 2. Routes per Chokepoint
    print("\n--- Chokepoint Connectivity ---")
    for cp in chokepoints:
        name = G.nodes[cp]['name']
        degree = G.degree(cp)
        print(f"{name:<20} : {degree} intersecting routes")

    # 3. Ports affected by each Chokepoint
    # Logic: Chokepoint -> Route -> Port
    print("\n--- Ports Affected by Chokepoints ---")
    print("(Ports dependent on routes passing through chokepoint)")
    
    for cp in chokepoints:
        name = G.nodes[cp].get('name', cp)
        affected_ports = set()
        
        # Immediate neighbors of Chokepoint are Routes
        connected_routes = G.neighbors(cp)
        
        for route in connected_routes:
            # Neighbors of Routes are Ports (and the Chokepoint itself)
            route_neighbors = G.neighbors(route)
            for neighbor in route_neighbors:
                if G.nodes[neighbor].get('type') == 'port':
                    affected_ports.add(neighbor)
        
        print(f"{name:<20} : {len(affected_ports)} ports")
    
    print("="*40 + "\n")

def export_network(G, output_path="maritime_network.graphml"):
    """Exports the network to GraphML."""
    nx.write_graphml(G, output_path)
    logging.info(f"Graph exported to {output_path}")

def main():
    print("--- Maritime Network Analysis ---")
    
    # 1. Load Data
    lanes, ports = load_data()
    if lanes is None or ports is None:
        return

    # 2. Chokepoints
    chokepoints = define_chokepoints()
    
    # 3. Intersections
    lane_chokepoints, intersection = analyze_chokepoints(lanes, chokepoints)
    
    # 4. Port Associations
    port_route_map = associate_ports_routes(ports, lanes)
    
    # 5. Build Graph
    G = build_network(lanes, ports, chokepoints, lane_chokepoints, port_route_map)
    
    # 6. Visualize
    visualize_network(lanes, ports, chokepoints, G)
    
    # 7. Stats & Export
    print_stats(G)
    export_network(G)
    
    print("Done.")

if __name__ == "__main__":
    main()
