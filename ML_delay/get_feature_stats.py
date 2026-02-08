import pandas as pd
import numpy as np

# Load Data
try:
    df = pd.read_csv('panama_canal_transits_merged.csv')
    
    # Define Float Features based on previous list
    float_features = [
        'water_level_deficit', 'gatun_lake_level_m', 
        'rainfall_mm', 'wind_speed_kmh', 'visibility_km',
        'vessel_length_m', 'vessel_beam_m', 'vessel_draft_m',
        'rainfall_30day_mm'
    ]
    
    print("\n## Float Feature Ranges (Min - Max)\n")
    print("| Feature | Min | Max | Unit |")
    print("| :--- | :--- | :--- | :--- |")
    
    for col in float_features:
        if col in df.columns:
            min_val = df[col].min()
            max_val = df[col].max()
            print(f"| `{col}` | {min_val:.2f} | {max_val:.2f} | - |")
        else:
            # Handle calculated columns not in raw CSV (like deficit)
            if col == 'water_level_deficit':
                 # Re-calculate to be sure
                 deficit = (27.5 - df['gatun_lake_level_m']).clip(lower=0)
                 print(f"| `{col}` | {deficit.min():.2f} | {deficit.max():.2f} | m |")
            else:
                print(f"| `{col}` | N/A | N/A | - |")

except Exception as e:
    print(f"Error: {e}")
