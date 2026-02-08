import geopandas as gpd
import shapely.geometry as sg
import matplotlib.pyplot as plt
import logging
import os

# Configuration
SHIPPING_LANES_FILE = "Shipping-Lanes-v1.shp"
CONNECTED_PORTS_FILE = "connected_ports.geojson"
OUTPUT_MAP = "global_maritime_map.png"
CRS_METRIC = "EPSG:3857"
CRS_GEO = "EPSG:4326"

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def define_chokepoints():
    """Defines major maritime chokepoints."""
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
        geometries.append(sg.Point(lon, lat))

    chokepoints = gpd.GeoDataFrame({"name": names, "lat": lats, "lon": lons}, geometry=geometries, crs=CRS_GEO)
    return chokepoints.to_crs(CRS_METRIC)

def create_map():
    logging.info("Starting map generation...")

    # 1. Load Data
    if not os.path.exists(SHIPPING_LANES_FILE) or not os.path.exists(CONNECTED_PORTS_FILE):
        logging.error("Input files missing from previous steps.")
        return

    logging.info("Loading Shipping Lanes...")
    lanes = gpd.read_file(SHIPPING_LANES_FILE)
    if lanes.crs is None:
        lanes.set_crs(CRS_GEO, inplace=True)
    lanes = lanes.to_crs(CRS_METRIC)

    logging.info("Loading Connected Ports...")
    ports = gpd.read_file(CONNECTED_PORTS_FILE).to_crs(CRS_METRIC)

    logging.info("Defining Chokepoints...")
    chokepoints = define_chokepoints()

    # 2. Plotting
    logging.info(f"Plotting map to {OUTPUT_MAP}...")
    fig, ax = plt.subplots(figsize=(24, 14), facecolor='#ffffff')
    ax.set_facecolor('#dcebf5') # Light blue sea background

    # Lanes
    lanes.plot(ax=ax, color='#004488', linewidth=0.5, alpha=0.5, label='Shipping Routes', zorder=1)

    # Ports (Connected Only)
    ports.plot(ax=ax, color='#ff3300', markersize=8, alpha=0.9, label='Connected Ports', zorder=2)

    # Chokepoints
    chokepoints.plot(ax=ax, color='black', marker='*', markersize=250, label='Chokepoints', zorder=3)
    
    # Label Chokepoints
    for _, cp in chokepoints.iterrows():
        ax.annotate(cp["name"], xy=(cp.geometry.x, cp.geometry.y), xytext=(5, 5), textcoords="offset points",
                    fontsize=9, color='black', fontweight='bold', 
                    bbox=dict(facecolor='white', alpha=0.7, edgecolor='none', boxstyle='round,pad=0.2'))

    # Decoration
    plt.title("Filtered Maritime Network: Connected Ports & Major Chokepoints", fontsize=22, pad=20)
    plt.legend(loc='lower left', fontsize=12, frameon=True, facecolor='white', framealpha=1)
    
    # Remove axis ticks for cleaner look
    ax.set_xticks([])
    ax.set_yticks([])
    
    plt.tight_layout()
    plt.savefig(OUTPUT_MAP, dpi=300, bbox_inches='tight')
    logging.info("Map created successfully.")

if __name__ == "__main__":
    create_map()
