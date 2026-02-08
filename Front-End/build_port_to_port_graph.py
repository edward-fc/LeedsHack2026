
import geopandas as gpd
import pandas as pd
import shapely.geometry as sg
import shapely.ops
import logging
import json
import os
from pyproj import Transformer

# --- Configuration ---
LANES_FILE_GEOJSON = "newzealandpaul-Shipping-Lanes-b0ad85c/data/Shipping_Lanes_v1.geojson"
PORTS_FILE = "connected_ports.geojson" 
RAW_PORTS_FILE = "ports.json" 
OUTPUT_JSON = "maritime_shipping_network.json"

LANE_ASSOCIATION_THRESHOLD_KM = 50
CRS_METRIC = "EPSG:3857"
CRS_GEO = "EPSG:4326"

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def load_data():
    logging.info("Loading Data...")
    if os.path.exists(LANES_FILE_GEOJSON):
        lanes = gpd.read_file(LANES_FILE_GEOJSON)
    else:
        shp_path = "newzealandpaul-Shipping-Lanes-b0ad85c/data/Shipping-Lanes-v1/Shipping-Lanes-v1.shp"
        logging.info(f"GeoJSON not found, trying Shapefile: {shp_path}")
        lanes = gpd.read_file(shp_path)

    if lanes.crs is None:
        lanes.set_crs(CRS_GEO, inplace=True)
    lanes = lanes.to_crs(CRS_GEO)
    
    if os.path.exists(RAW_PORTS_FILE):
        with open(RAW_PORTS_FILE, 'r') as f:
            ports_data = json.load(f)
        df_ports = pd.DataFrame(ports_data)
        geometry = [sg.Point(xy) for xy in zip(df_ports["LONGITUDE"], df_ports["LATITUDE"])]
        ports = gpd.GeoDataFrame(df_ports, geometry=geometry, crs=CRS_GEO)
        if "id" not in ports.columns:
            ports["id"] = ports.index.astype(str)
    else:
        logging.warning("Raw ports.json not found, using connected_ports.geojson")
        ports = gpd.read_file("connected_ports.geojson").to_crs(CRS_GEO)
        
    logging.info(f"Loaded {len(lanes)} lanes and {len(ports)} ports.")
    return lanes, ports

def preprocess_data(lanes, ports):
    logging.info("Preprocessing...")
    lanes = lanes[~lanes.is_empty & lanes.geometry.notna()]
    ports = ports[~ports.is_empty & ports.geometry.notna()]
    
    lanes = lanes.explode(index_parts=True).reset_index(drop=True)
    
    if "lane_id" not in lanes.columns:
        lanes["lane_id"] = lanes.index.astype(str)
        
    logging.info(f"Preprocessed: {len(lanes)} lane segments.")
    return lanes, ports

def build_react_graph(lanes, ports):
    logging.info(f"Associating ports and building graph...")
    
    # Metric conversion
    lanes_metric = lanes.to_crs(CRS_METRIC)
    ports_metric = ports.to_crs(CRS_METRIC)
    
    # Buffer & Join
    ports_buffer = ports_metric.copy()
    ports_buffer.geometry = ports_buffer.geometry.buffer(LANE_ASSOCIATION_THRESHOLD_KM * 1000)
    joined = gpd.sjoin(ports_buffer, lanes_metric, how="inner", predicate="intersects")
    
    # 1. SNAP NODES TO NEAREST LANE
    # To bridge the visual gap, we move the NODE to the water (lane), keep PORT on land.
    # We must find the SINGLE nearest lane for each port to define its Node location.
    
    # Calculate distance to all intersecting lanes to find min
    # Map port_idx -> (min_dist, nearest_point_geom)
    port_snap_points = {} 
    
    logging.info("Snapping ports to nearest lanes...")
    for port_idx, row in joined.iterrows():
        lane_idx = row['index_right']
        p_geom = ports_metric.loc[port_idx].geometry
        l_geom = lanes_metric.loc[lane_idx].geometry
        
        # Proj
        dist = p_geom.distance(l_geom)
        
        if port_idx not in port_snap_points or dist < port_snap_points[port_idx][0]:
            # New closest
            # Calculate snapped point
            proj_dist = l_geom.project(p_geom)
            snap_point = l_geom.interpolate(proj_dist)
            port_snap_points[port_idx] = (dist, snap_point)

    # 2. Build Dictionaries
    nodes_dict = {} 
    ports_dict = {}
    port_id_map = {} 
    
    # Transformer for Snap Point (Metric -> Geo)
    to_geo = Transformer.from_crs(CRS_METRIC, CRS_GEO, always_xy=True).transform
    
    for idx, row in ports.iterrows():
        pid = str(row.get("id", idx))
        port_id_map[idx] = pid
        
        # Only include if connected (in joined)
        if idx not in port_snap_points:
            continue
            
        # Port Data (Land)
        p_name = row.get("CITY", row.get("name", f"Port {pid}"))
        p_country = row.get("COUNTRY", "")
        p_lat = row.geometry.y
        p_lon = row.geometry.x
        
        ports_dict[pid] = {
            "id": pid,
            "name": p_name,
            "country": p_country,
            "lat": p_lat,
            "lon": p_lon,
            "node_id": pid,
            "dist_to_node": 0 
        }
        
        # Node Data (Water/Snapped)
        _, snap_pt_metric = port_snap_points[idx]
        snap_lon, snap_lat = to_geo(snap_pt_metric.x, snap_pt_metric.y)
        
        nodes_dict[pid] = {
            "id": pid,
            "lat": snap_lat,
            "lon": snap_lon
        }

    # 3. Build Edges
    lane_to_ports = {} 
    for port_idx, row in joined.iterrows():
        if port_idx not in port_snap_points: continue
        
        lane_idx = row['index_right']
        if lane_idx not in lane_to_ports:
            lane_to_ports[lane_idx] = set()
        lane_to_ports[lane_idx].add(port_idx)
    
    edges_list = []
    unique_edges = set()
    
    logging.info(f"Generating edges for {len(lane_to_ports)} lanes...")
    
    for lane_idx, port_indices in lane_to_ports.items():
        if len(port_indices) < 2:
            continue
            
        l_geom_m = lanes_metric.loc[lane_idx].geometry
        lane_id_str = str(lanes.loc[lane_idx].get("lane_id", lane_idx))
        
        # Sort ports along lane by projection
        projected = []
        for p_idx in port_indices:
            # Note: We project the *Node* (Snapped Point)? 
            # If the Node was snapped to *this* lane, it's exact.
            # If snapped to *another* lane, we project that Node onto this lane.
            # Actually use original port geom for projection measure to remain consistent
            p_geom_m = ports_metric.loc[p_idx].geometry
            d = l_geom_m.project(p_geom_m)
            projected.append((p_idx, d))
            
        projected.sort(key=lambda x: x[1])
        
        # Sequential Connections
        for i in range(len(projected) - 1):
            p1_idx, d1 = projected[i]
            p2_idx, d2 = projected[i+1]
            p1_id = port_id_map[p1_idx]
            p2_id = port_id_map[p2_idx]
            
            # Key: sorted ids + lane_id (allow parallel edges on different lanes)
            edge_key = tuple(sorted([p1_id, p2_id]) + [lane_id_str])
            if edge_key in unique_edges:
                continue
            unique_edges.add(edge_key)
            
            # Geometry
            segment_m = shapely.ops.substring(l_geom_m, d1, d2)
            # Transform to list of coords [lon, lat]
            # Simple transform func
            x, y = segment_m.coords.xy
            # Zip and transform
            segment_coords_geo = [to_geo(mx, my) for mx, my in zip(x, y)]
            
            dist_km = (d2 - d1) / 1000.0
            
            edges_list.append({
                "source": p1_id,
                "target": p2_id,
                "dist_km": dist_km,
                "geometry": segment_coords_geo,
                "chokepoints": [],
                "lane_id": lane_id_str
            })
            
    logging.info(f"Generated {len(edges_list)} edges.")
    return {
        "nodes": nodes_dict,
        "edges": edges_list,
        "ports": ports_dict,
        "chokepoints": {}
    }

def main():
    lanes, ports = load_data()
    lanes, ports = preprocess_data(lanes, ports)
    graph_data = build_react_graph(lanes, ports)
    
    with open(OUTPUT_JSON, 'w') as f:
        json.dump(graph_data, f)
    logging.info("Done.")

if __name__ == "__main__":
    main()
