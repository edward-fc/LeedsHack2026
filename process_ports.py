import csv
import json
import sys
import networkx as nx
from collections import Counter
import re

# Configuration
PORTS_JSON_PATH = '/Users/edwardcarter/Documents/Projects/LeedsHack2026/ports.json'
GRAPHML_OUTPUT_PATH = 'ports_nodes_only.graphml'
GEOJSON_OUTPUT_PATH = 'ports_nodes_only.geojson'

def clean_field(text):
    """Trims whitespace from a field."""
    return str(text).strip() if text is not None else ""

def generate_id(city, country):
    """Generates a simple ID from city and country."""
    # simple slugify
    s = f"{city}_{country}".upper()
    s = re.sub(r'[^A-Z0-9]', '', s)
    return s[:10] # limit length

def validate_coords(lat, lon):
    """
    Validates latitude and longitude.
    Returns (lat, lon) as floats if valid, or None if invalid.
    """
    try:
        lat = float(lat)
        lon = float(lon)
        if -90 <= lat <= 90 and -180 <= lon <= 180:
            return lat, lon
        else:
            return None
    except (ValueError, TypeError):
        return None

def read_ports_json(filepath):
    """
    Reads the ports JSON and returns a list of valid port dictionaries.
    Also returns a stats dictionary.
    """
    valid_ports = []
    stats = {
        'total_rows': 0,
        'nodes_created': 0,
        'rows_dropped': 0,
        'drop_reasons': {
            'duplicate_id': 0,
            'invalid_coords': 0,
            'missing_coords': 0,
            'missing_name': 0
        }
    }
    
    seen_ids = set()

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
            for entry in data:
                stats['total_rows'] += 1
                
                city = clean_field(entry.get('CITY'))
                country = clean_field(entry.get('COUNTRY'))
                
                if not city:
                    stats['rows_dropped'] += 1
                    stats['drop_reasons']['missing_name'] += 1
                    continue
                
                # Generate ID since JSON doesn't have one
                # If generated ID exists, append a number
                base_id = generate_id(city, country)
                port_id = base_id
                counter = 1
                while port_id in seen_ids:
                    port_id = f"{base_id}_{counter}"
                    counter += 1
                
                # NOTE: We allow duplicate cities if they have different coords/countries, 
                # but let's just make ID unique to be safe for GraphML. 
                # Actually, duplicate entries in source might be real duplicates.
                # However, without a unique code, we rely on generating one.
                
                lat_raw = entry.get('LATITUDE')
                lon_raw = entry.get('LONGITUDE')

                if lat_raw is None or lon_raw is None:
                    stats['rows_dropped'] += 1
                    stats['drop_reasons']['missing_coords'] += 1
                    continue
                
                coords = validate_coords(lat_raw, lon_raw)
                if not coords:
                    stats['rows_dropped'] += 1
                    stats['drop_reasons']['invalid_coords'] += 1
                    continue
                
                lat, lon = coords
                
                # Prepare node attributes
                port_data = {
                    'id': port_id,
                    'name': city,
                    'lat': lat,
                    'lon': lon,
                    'country_code': country, # Using Country Name as code
                    'zone_code': clean_field(entry.get('STATE')) # Using State as Zone
                }
                
                valid_ports.append(port_data)
                seen_ids.add(port_id)
                stats['nodes_created'] += 1
                
    except FileNotFoundError:
        print(f"Error: File not found at {filepath}")
        sys.exit(1)
    except Exception as e:
        print(f"Error reading JSON: {e}")
        sys.exit(1)
        
    return valid_ports, stats

# ... (rest of the file remains similar, but need to update main call)

def build_graph(ports_data):
    """Builds a NetworkX graph from port data."""
    G = nx.Graph(name="G_ports")
    for port in ports_data:
        # Add node with attributes. 
        # Note: NetworkX attributes should be separate args or a dict
        G.add_node(
            port['id'],
            name=port['name'],
            lat=port['lat'],
            lon=port['lon'],
            country_code=port['country_code'] or '', # GraphML prefers strings/numerics, None can be tricky
            zone_code=port['zone_code'] or ''
        )
    return G

def export_graphml(G, filepath):
    """Exports the graph to GraphML."""
    nx.write_graphml(G, filepath)
    print(f"Exported GraphML to {filepath}")

def export_geojson(ports_data, filepath):
    """Exports the ports as a GeoJSON FeatureCollection."""
    features = []
    for port in ports_data:
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [port['lon'], port['lat']]
            },
            "properties": {
                "code": port['id'],
                "name": port['name'],
                "country_code": port['country_code'],
                "zone_code": port['zone_code']
            }
        }
        features.append(feature)
    
    geojson = {
        "type": "FeatureCollection",
        "features": features
    }
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, indent=2)
    print(f"Exported GeoJSON to {filepath}")

def print_stats(stats, ports_data):
    """Prints summary statistics."""
    print("\n--- Processing Summary ---")
    print(f"Total rows read: {stats['total_rows']}")
    print(f"Nodes created: {stats['nodes_created']}")
    print(f"Rows dropped: {stats['rows_dropped']}")
    print("Drop reasons:")
    for reason, count in stats['drop_reasons'].items():
        print(f"  - {reason}: {count}")
    
    # Country stats
    country_counts = Counter(p['country_code'] for p in ports_data if p['country_code'])
    print("\nTop 10 Countries by Port Count:")
    for code, count in country_counts.most_common(10):
        print(f"  {code}: {count}")
        
    # Zone stats
    zone_counts = Counter(p['zone_code'] for p in ports_data if p['zone_code'])
    print("\nTop 10 Zones by Port Count:")
    for code, count in zone_counts.most_common(10):
        print(f"  {code}: {count}")

def main():
    print(f"Reading ports data from {PORTS_JSON_PATH}...")
    
    ports, stats = read_ports_json(PORTS_JSON_PATH)
    
    print_stats(stats, ports)
    
    if not ports:
        print("No valid ports found. Exiting.")
        return

    print("Building graph...")
    G = build_graph(ports)
    print(f"Graph built with {G.number_of_nodes()} nodes.")
    
    print("Exporting data...")
    export_graphml(G, GRAPHML_OUTPUT_PATH)
    export_geojson(ports, GEOJSON_OUTPUT_PATH)
    
    print("\nDone.")
    print("-" * 30)
    print("Usage Example:")
    print("import networkx as nx")
    print(f"G = nx.read_graphml('{GRAPHML_OUTPUT_PATH}')")
    print("print(G.number_of_nodes())")

if __name__ == "__main__":
    main()
    print("\nTo quickly plot nodes (requires matplotlib):")
    print(">>> import matplotlib.pyplot as plt")
    print(">>> x = [G.nodes[n]['lon'] for n in G.nodes]")
    print(">>> y = [G.nodes[n]['lat'] for n in G.nodes]")
    print(">>> plt.show()")

if __name__ == "__main__":
    main()
