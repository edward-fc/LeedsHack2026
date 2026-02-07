
import geopandas as gpd
import matplotlib.pyplot as plt
import sys
import os

# Configure GDAL to restore/generate missing .shx file if possible
os.environ['SHAPE_RESTORE_SHX'] = 'YES'

import geopandas as gpd
SHAPEFILE_PATH = 'Shipping-Lanes-v1.shp'
OUTPUT_IMAGE = 'global_shipping_routes.png'

def main():
    # check file exists
    if not os.path.exists(SHAPEFILE_PATH):
        print(f"Error: Shapefile not found at {SHAPEFILE_PATH}")
        sys.exit(1)
        
    try:
        print(f"Loading shapefile from {SHAPEFILE_PATH}...")
        gdf = gpd.read_file(SHAPEFILE_PATH)
        
        print("Validating CRS...")
        if gdf.crs:
            print(f"CRS Found: {gdf.crs}")
        else:
            print("CRS Missing. Setting to EPSG:4326.")
            gdf.set_crs(epsg=4326, inplace=True)
            
        print("Plotting shipping routes...")
        fig, ax = plt.subplots(figsize=(15, 8))
        
        # Plot styling: thin blue lines, alpha 0.4
        gdf.plot(ax=ax, linewidth=0.5, color='blue', alpha=0.4)
        
        # Adjust layout
        ax.set_aspect('equal')
        ax.axis('off')
        plt.title('Global Maritime Shipping Routes', fontsize=16)
        plt.tight_layout()
        
        print(f"Saving to {OUTPUT_IMAGE}...")
        plt.savefig(OUTPUT_IMAGE, dpi=300, bbox_inches='tight', pad_inches=0.1)
        print("Done.")
        
    except Exception as e:
        print(f"An error occurred: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
