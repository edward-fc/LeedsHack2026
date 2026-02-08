
import geopandas as gpd
import shapely.geometry as sg
import shapely.ops
import numpy as np
import logging
import os

# Configuration
INPUT_FILE = "Shipping-Lanes-v1.geojson"
OUTPUT_FILE = "Shipping-Lanes-v1_split10.geojson"
SPLIT_COUNT = 10

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def split_line_into_segments(line, n_splits):
    """Splits a LineString into n_splits equal length segments."""
    if line.geom_type == 'MultiLineString':
        segments = []
        for part in line.geoms:
            segments.extend(split_line_into_segments(part, n_splits))
        return segments
        
    length = line.length
    if length == 0:
        return [line]
        
    segment_length = length / n_splits
    segments = []
    
    for i in range(n_splits):
        start_dist = i * segment_length
        end_dist = (i + 1) * segment_length
        # Ensure we capture the very end exactly to avoid gaps due to float precision
        if i == n_splits - 1:
            end_dist = length
            
        segment = shapely.ops.substring(line, start_dist, end_dist)
        segments.append(segment)
        
    return segments

def main():
    # 1. Load Data
    if not os.path.exists(INPUT_FILE):
        # Fallback to SHP if GeoJSON doesn't exist, as user might have meant the dataset name generally
        shp_file = "Shipping-Lanes-v1.shp"
        if os.path.exists(shp_file):
            logging.info(f"{INPUT_FILE} not found. Loading {shp_file} instead...")
            gdf = gpd.read_file(shp_file)
        else:
            logging.error(f"Input file {INPUT_FILE} not found.")
            return
    else:
        logging.info(f"Loading {INPUT_FILE}...")
        gdf = gpd.read_file(INPUT_FILE)

    # Ensure projected CRS for accurate length splitting?
    # User asked for "split into 10", usually implies equal length.
    # WGS84 length calculation is degrees, which distorts. 
    # Better to project to Metric (EPSG:3857), split, then project back?
    # Or just split in current CRS?
    # Splitting in WGS84 by degree length is "okay" for topology but "uneven" for meters.
    # I will assume they want equal physical length segments => project to 3857.
    
    original_crs = gdf.crs
    if not original_crs:
        original_crs = "EPSG:4326"
        gdf.set_crs(original_crs, inplace=True)
        
    logging.info("Projecting to EPSG:3857 for accurate splitting...")
    gdf_metric = gdf.to_crs("EPSG:3857")
    
    new_rows = []
    
    logging.info(f"Processing {len(gdf)} features...")
    
    for idx, row in gdf_metric.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
            
        segments = split_line_into_segments(geom, SPLIT_COUNT)
        
        # Create new rows inheriting properties
        for i, seg in enumerate(segments):
            props = row.drop('geometry').to_dict()
            # Add metadata about split
            props['original_id'] = str(props.get('fid', idx)) # Use fid or index
            props['segment_index'] = i
            props['segment_total'] = SPLIT_COUNT
            
            new_rows.append({
                'geometry': seg,
                **props
            })
            
    # Create new GeoDataFrame
    gdf_split_metric = gpd.GeoDataFrame(new_rows, crs="EPSG:3857")
    
    # Project back
    logging.info(f"Projecting back to {original_crs}...")
    gdf_split = gdf_split_metric.to_crs(original_crs)
    
    # Save
    logging.info(f"Saving {len(gdf_split)} segments to {OUTPUT_FILE}...")
    gdf_split.to_file(OUTPUT_FILE, driver="GeoJSON")
    logging.info("Done.")

if __name__ == "__main__":
    main()
