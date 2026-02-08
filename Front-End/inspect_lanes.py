
import geopandas as gpd
import os
import pandas as pd

# Configure GDAL to restore/generate missing .shx file if possible
os.environ['SHAPE_RESTORE_SHX'] = 'YES'

SHAPEFILE_PATH = 'Shipping-Lanes-v1.shp'

def main():
    if not os.path.exists(SHAPEFILE_PATH):
        print(f"File not found: {SHAPEFILE_PATH}")
        return

    print(f"Loading {SHAPEFILE_PATH}...")
    gdf = gpd.read_file(SHAPEFILE_PATH)
    
    print("\n--- Columns ---")
    print(gdf.columns.tolist())
    
    print("\n--- First 5 Rows ---")
    print(gdf.drop(columns='geometry').head().to_string())
    
    print("\n--- Searching for 'Singapore' ---")
    # Search in all string columns
    found = False
    for col in gdf.select_dtypes(include=['object']):
        matches = gdf[gdf[col].astype(str).str.contains('Singapore', case=False, na=False)]
        if not matches.empty:
            print(f"Found 'Singapore' in column '{col}':")
            print(matches[[col]].head().to_string())
            found = True
            
    if not found:
        print("Did not find 'Singapore' in any string columns.")

if __name__ == "__main__":
    main()
