import json
import logging
import math
import os
import shutil

import geopandas as gpd
import networkx as nx
import pandas as pd
import shapely.geometry as sg
import shapely.ops as so

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
from itertools import combinations

# --- Configuration ---
LANES_FILE = "Shipping-Lanes-v1_split10.geojson"
PORTS_FILE = "connected_ports.geojson"
OUTPUT_GRAPH_JSON = "maritime_transport_graph.json"
CHOKEPOINT_BUFFER_KM = 50


def define_chokepoints():
    """Defines chokepoints with lat/lon."""
    return {
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

def get_node_key(point):
    """Generates a consistent key string for a point."""
    x = round(point.x, 5)
    y = round(point.y, 5)
    return f"{x},{y}"

def build_graph():
    logging.info("Building refined transport graph...")

    if not os.path.exists(LANES_FILE) or not os.path.exists(PORTS_FILE):
        logging.error("Missing input files.")
        return

    # Load Lanes
    # Fix: Ensure CRS is set if missing
    lanes = gpd.read_file(LANES_FILE)
    if lanes.crs is None:
        logging.warning("Lanes CRS is missing. Assuming EPSG:4326.")
        lanes.set_crs(epsg=4326, inplace=True)
    
    # Load Ports
    ports = gpd.read_file(PORTS_FILE)
    if ports.crs is None:
        logging.warning("Ports CRS is missing. Assuming EPSG:4326.")
        ports.set_crs(epsg=4326, inplace=True)

    # Convert to necessary CRSs
    # WGS84 for output coords
    lanes_geo = lanes.to_crs(epsg=4326)
    ports_geo = ports.to_crs(epsg=4326)
    
    # Metric for calculations
    lanes_metric = lanes.to_crs(epsg=3857)
    ports_metric = ports.to_crs(epsg=3857)
    
    # 2. Build Chokepoint Geometries (Metric)
    cp_definitions = define_chokepoints()
    cp_buffers = []
    
    for name, (lat, lon) in cp_definitions.items():
        pt = sg.Point(lon, lat) # EPSG:4326
        gdf_pt = gpd.GeoDataFrame({'name': [name]}, geometry=[pt], crs="EPSG:4326").to_crs(epsg=3857)
        buf = gdf_pt.geometry.buffer(CHOKEPOINT_BUFFER_KM * 1000).iloc[0]
        cp_buffers.append({'name': name, 'geometry': buf})
    
    # 3. Construct Graph from Lanes
    # Explode multi-geometries
    lanes_geo = lanes_geo.explode(index_parts=True).reset_index(drop=True)
    
    G = nx.Graph()
    
    logging.info(f"Processing {len(lanes_geo)} lane segments...")
    
    SNAP_TOLERANCE_DEG = 0.2  # ~2km (Visual precision)
    PROXIMITY_RADIUS_DEG = 0.5 # ~55km (Connectivity radius for new edges)

    # Spatial Index for snapping
    # List of (id, lat, lon)
    existing_nodes = []
    next_node_id = 0
    
    def get_or_create_node(pt):
        nonlocal next_node_id
        
        # Naive linear search for snapping (sufficient for <10k nodes)
        # We search for ANY existing node within SNAP_TOLERANCE_DEG
        
        # Optimization: Filter by rough bounding box first if needed, 
        # but for 2000 nodes, simple loop is fine.
        
        best_node_id = None
        min_dist = float('inf')
        
        for n_id, n_lat, n_lon in existing_nodes:
            # Euclidean distance in degrees
            dist = math.sqrt((pt.y - n_lat)**2 + (pt.x - n_lon)**2)
            if dist < SNAP_TOLERANCE_DEG and dist < min_dist:
                min_dist = dist
                best_node_id = n_id
        
        if best_node_id is not None:
            return best_node_id
            
        # Create new node
        new_id = str(next_node_id)
        G.add_node(new_id, lat=pt.y, lon=pt.x)
        existing_nodes.append((new_id, pt.y, pt.x))
        next_node_id += 1
        return new_id

    edge_list = []

    for idx, row in lanes_geo.iterrows():
        geom = row.geometry
        if geom.geom_type == 'LineString':
            coords = list(geom.coords)
            start_pt = sg.Point(coords[0])
            end_pt = sg.Point(coords[-1])
            
            u = get_or_create_node(start_pt)
            v = get_or_create_node(end_pt)
            
            # Calculate metrics using the projected version
            # We need to find the corresponding metric geometry. 
            # Re-projecting individual geometry is safer than index matching after explode
            geom_metric = gpd.GeoSeries([geom], crs="EPSG:4326").to_crs(epsg=3857).iloc[0]
            dist_km = geom_metric.length / 1000.0
            
            intersected_cps = []
            for cp in cp_buffers:
                if geom_metric.intersects(cp['geometry']):
                    intersected_cps.append(cp['name'])
            
            edge_data = {
                "source": u,
                "target": v,
                "dist_km": dist_km,
                "geometry": list(geom.coords),
                "chokepoints": intersected_cps,
                "lane_id": str(idx)
            }
            edge_list.append(edge_data)
            G.add_edge(u, v, weight=dist_km, **edge_data)

    logging.info(f"Base Lane Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    
    logging.info(f"Base Lane Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    
    # [REMOVED] Bridging logic removed per user request.
    # Connectivity now relies on dead-end fixing and proximity edges.

    # --- Connect Dead Ends (User Request) ---
    # "Find all the points in the shipping lanes that are only connected to one segment, 
    # and try to connect them to the closest point"
    
    dead_ends = [n for n, d in G.degree() if d == 1]
    logging.info(f"Found {len(dead_ends)} dead-end nodes (degree 1). Connecting to closest nodes...")
    
    # Pre-cache all node data for speed
    all_node_data = [(n, d['lat'], d['lon']) for n, d in G.nodes(data=True)]
    
    new_edges_count = 0
    DEAD_END_SEARCH_RADIUS = 10.0 # Search far enough to find *something* (approx 1000km)
    
    for u in dead_ends:
        u_data = G.nodes[u]
        u_lat = u_data['lat']
        u_lon = u_data['lon']
        
        # Get existing neighbors to exclude them
        neighbors = set(G.neighbors(u))
        
        best_target = None
        min_dist = float('inf')
        
        for v, v_lat, v_lon in all_node_data:
            if v == u or v in neighbors:
                continue
                
            d_lat = abs(u_lat - v_lat)
            d_lon = abs(u_lon - v_lon)
            
            if d_lat > DEAD_END_SEARCH_RADIUS or d_lon > DEAD_END_SEARCH_RADIUS:
                continue
                
            dist_sq = d_lat**2 + d_lon**2
            
            if dist_sq < min_dist:
                min_dist = dist_sq
                best_target = v
                
        if best_target and min_dist < (DEAD_END_SEARCH_RADIUS**2):
            dist_km = math.sqrt(min_dist) * 111.0
            
            # Add edge
            geom_line = [(u_lon, u_lat), (G.nodes[best_target]['lon'], G.nodes[best_target]['lat'])]
             
            edge_data = {
                "source": u,
                "target": best_target,
                "dist_km": dist_km,
                "geometry": geom_line,
                "chokepoints": [],
                "lane_id": f"fix_{u}_{best_target}",
                "fixed": True
            }
            edge_list.append(edge_data)
            G.add_edge(u, best_target, weight=dist_km, **edge_data)
            new_edges_count += 1
            
    logging.info(f"Connected {new_edges_count} dead ends.")
    node_points = []
    node_ids_list = []
    for n, d in G.nodes(data=True):
        node_points.append(sg.Point(d['lon'], d['lat']))
        node_ids_list.append(n)
        
    if not node_points:
        logging.error("Graph has no nodes! Check input data.")
        return

    gdf_nodes = gpd.GeoDataFrame({'node_id': node_ids_list}, geometry=node_points, crs="EPSG:4326").to_crs(epsg=3857)
    
    # Sjoin nearest ports -> nodes
    nearest_nodes = gpd.sjoin_nearest(ports_metric, gdf_nodes, distance_col="dist_to_node")
    
    final_ports = {}
    
    for idx, row in nearest_nodes.iterrows():
        # Because we exploded lanes, port index matches row index assuming reset_index in sjoin
        # Ports GDF has 'port_id'
        pid = str(row['port_id'])
        nid = str(row['node_id'])
        
        # Get metadata from original ports_geo using the ID
        # (Assuming unique port_ids)
        mask = ports_geo['port_id'].astype(str) == pid
        if not mask.any():
            continue
            
        original_port = ports_geo[mask].iloc[0]
        
        final_ports[pid] = {
            "id": pid,
            "name": original_port.get("CITY", f"Port {pid}"),
            "country": original_port.get("COUNTRY", ""),
            "lat": original_port.geometry.y,
            "lon": original_port.geometry.x,
            "node_id": nid,
            "dist_to_node": row['dist_to_node']
        }
    
    logging.info(f"Mapped {len(final_ports)} ports to graph nodes.")
    
    # 5. Output
    output = {
        "nodes": {},
        "edges": edge_list,
        "ports": final_ports, # Dict: port_id -> {node_id, ...}
        "chokepoints": {}
    }
    # 6. Save Graph

    output_file = "maritime_transport_graph.json"
    
    # Prepare chokepoints data in the desired format
    final_chokepoints = {}
    for name, (lat, lon) in cp_definitions.items():
        final_chokepoints[name] = {
            "name": name,
            "lat": lat,
            "lon": lon
        }

    with open(output_file, 'w') as f:
        json.dump({
            "nodes": {n: {"id": n, "lat": d['lat'], "lon": d['lon']} for n, d in G.nodes(data=True)},
            "edges": edge_list,
            "ports": final_ports,
            "chokepoints": final_chokepoints
        }, f)
        
    logging.info(f"Saved graph to {output_file} ({os.path.getsize(output_file)/1024:.1f} KB)")
    
    # Auto-Deploy to React App
    deploy_path = "maritime-twin/public/data/graph.json"
    if os.path.exists("maritime-twin/public/data"):
        shutil.copy(output_file, deploy_path)
        logging.info(f"Deployed graph to {deploy_path}")
    else:
        logging.warning("Could not find React public/data folder. Manual copy required.")

if __name__ == "__main__":
    build_graph()
