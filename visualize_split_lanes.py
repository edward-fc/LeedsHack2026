
import geopandas as gpd
import matplotlib.pyplot as plt
import logging
import os

INPUT_FILE = "Shipping-Lanes-v1_split10.geojson"
OUTPUT_IMAGE = "split_lanes_visualization.png"

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def main():
    if not os.path.exists(INPUT_FILE):
        logging.error(f"{INPUT_FILE} not found.")
        return
        
    logging.info(f"Loading {INPUT_FILE}...")
    gdf = gpd.read_file(INPUT_FILE)
    
    fig, ax = plt.subplots(figsize=(20, 12), facecolor='#111111')
    ax.set_facecolor('#111111')
    
    # Plot background (optional)
    try:
        world = gpd.read_file(gpd.datasets.get_path('naturalearth_lowres'))
        world.plot(ax=ax, color='#222222', edgecolor='#333333')
    except:
        pass
        
    logging.info("Plotting segments...")
    
    # distinct colors for segments
    colors = ['#00ffff', '#ff00ff'] # Cyan and Magenta
    
    # We want to color based on segment_index to show the split
    for i, row in gdf.iterrows():
        color = colors[int(row.get('segment_index', 0)) % 2]
        
        # Plotting row by row is slow for 2000 items? 
        # Better: split GDF into 2 groups (evens and odds) and plot twice.
        pass
        
    # Optimized plotting
    evens = gdf[gdf['segment_index'] % 2 == 0]
    odds = gdf[gdf['segment_index'] % 2 != 0]
    
    evens.plot(ax=ax, color='#00aaff', linewidth=2, alpha=0.8, label="Even Segments")
    odds.plot(ax=ax, color='#ffaa00', linewidth=2, alpha=0.8, label="Odd Segments")
    
    plt.title(f"Visualizing 10-Split Shipping Lanes\n{len(gdf)} Total Segments", fontsize=20, color='white')
    leg = ax.legend(facecolor='#111111', edgecolor='white', labelcolor='white')
    
    ax.set_axis_off()
    plt.tight_layout()
    
    plt.savefig(OUTPUT_IMAGE, dpi=300, facecolor='#111111')
    logging.info(f"Saved visualization to {OUTPUT_IMAGE}")

if __name__ == "__main__":
    main()
