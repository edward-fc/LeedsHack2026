import pandas as pd
import numpy as np
import random
from datetime import datetime, timedelta

# Set random seed for reproducibility
np.random.seed(42)
random.seed(42)

# --- Configuration ---
START_DATE = datetime.now() - timedelta(days=18*30) # Approx 18 months ago
DAYS_TO_GENERATE = 180
TOTAL_TRANSITS = 6000

# File Paths
OUTPUT_FILENAME = "panama_canal_transits_merged.csv"

# --- 1. Synthetic Data Generators ---

def generate_weather(start_date, days):
    """Generates daily weather data with seasonal patterns."""
    dates = [start_date + timedelta(days=i) for i in range(days)]
    weather_data = []

    for date in dates:
        month = date.month
        
        # Seasonality logic
        is_dry_season = month in [1, 2, 3, 4] # Jan-Apr
        
        if is_dry_season:
            rainfall_mm = np.random.exponential(scale=2) # Low rainfall
            wind_speed = np.random.normal(loc=25, scale=5) # Higher winds
            visibility = np.random.normal(loc=18, scale=2) # Good visibility
            temp = np.random.normal(loc=32, scale=2) # Hotter
        else:
            rainfall_mm = np.random.exponential(scale=15) # High rainfall
            wind_speed = np.random.normal(loc=15, scale=5) # Lower winds
            visibility = np.random.normal(loc=12, scale=4) # Lower visibility (rain)
            temp = np.random.normal(loc=29, scale=2) # Cooler (relative)

        # Clip values to realistic ranges
        rainfall_mm = max(0, rainfall_mm)
        visibility = max(0.5, min(25, visibility))
        
        weather_data.append({
            'date': date.date(),
            'rainfall_mm': round(rainfall_mm, 1),
            'wind_speed_kmh': round(wind_speed, 1),
            'visibility_km': round(visibility, 1),
            'temperature_c': round(temp, 1)
        })
    
    df = pd.DataFrame(weather_data)
    # Calculate rolling cumulative rainfall
    df['rainfall_30day_mm'] = df['rainfall_mm'].rolling(window=30, min_periods=1).sum().round(1)
    return df

def generate_operations(weather_df):
    """Generates daily canal operation metrics based on weather."""
    ops_data = []
    
    # Base Gatun Lake level (m)
    current_level = 25.5 # Lower start to hit drought sooner
    
    # Backlog Tracking
    queue_length = 0
    
    for _, row in weather_df.iterrows():
        # Water level definition logic
        month = row['date'].month
        is_dry_season = month in [1, 2, 3, 4]
        
        daily_change = -0.05 if is_dry_season else 0.015
        current_level += daily_change + (row['rainfall_mm'] / 1000.0) # Rain adds level
        current_level = max(23.5, min(27.5, current_level))
        
        # --- 5-Tier Capacity Logic ---
        # ≥ 25.9m: 36
        # 25.0 – 25.9m: 32-35 (Avg 34)
        # 24.5 – 25.0m: ~24
        # 24.0 – 24.5m: ~24
        # < 24.0m: 18-22 (Avg 20)
        
        if current_level >= 25.9:
            capacity = 36
        elif current_level >= 25.0:
            capacity = random.randint(32, 35)
        elif current_level >= 24.0:
            capacity = 24
        else:
            capacity = random.randint(18, 22)
        
        # Queue Accumulation
        # Demand varies (Mean=36, Std=2)
        daily_demand = int(np.random.normal(36, 2))
        net_change = daily_demand - capacity
        
        queue_length = max(0, min(300, queue_length + net_change))
        
        # Calculate daily transits (bounded by capacity and queue)
        # If queue is high, we transit up to capacity. If low, we transit demand.
        daily_transits = min(capacity, queue_length + daily_demand)

        ops_data.append({
            'date': row['date'],
            'daily_transit_count': daily_transits,
            'gatun_lake_level_m': round(current_level, 2),
            'queue_length': int(queue_length)
        })
        
    return pd.DataFrame(ops_data)

def generate_vessel_transits(ops_df):
    """Generates individual vessel transits linked to operations."""
    transits = []
    
    vessel_types = ['Container', 'Bulk', 'Tanker', 'LNG', 'Vehicle', 'Other']
    
    for _, day_ops in ops_df.iterrows():
        daily_count = day_ops['daily_transit_count']
        date_obj = day_ops['date'] # datetime.date
        
        for _ in range(daily_count):
            # Size category logic (Neopanamax vs Panamax)
            # Neopanamax is ~25% of traffic
            is_neopanamax = random.random() < 0.25
            size_cat = 'Neopanamax' if is_neopanamax else 'Panamax'
            
            if is_neopanamax:
                beam = np.random.uniform(40, 51)
                length = np.random.uniform(300, 366)
                draft = np.random.uniform(12, 15.2)
            else:
                beam = np.random.uniform(20, 32)
                length = np.random.uniform(150, 294)
                draft = np.random.uniform(8, 12)
                
            # Booking Status (70% Booked)
            is_booked = 1 if random.random() < 0.70 else 0
                
            # 2. Timing
            # Scheduled time: random hour in the day
            sched_hour = random.randint(0, 23)
            sched_minute = random.randint(0, 59)
            scheduled_time = datetime.combine(date_obj, datetime.min.time()) + timedelta(hours=sched_hour, minutes=sched_minute)
            
            transits.append({
                'vessel_size_category': size_cat,
                'vessel_beam_m': round(beam, 2),
                'vessel_length_m': round(length, 2),
                'vessel_draft_m': round(draft, 2),
                'scheduled_booking_time': scheduled_time,
                'scheduled_date': date_obj,
                'is_booked': is_booked
            })
            
    return pd.DataFrame(transits)

# --- 2. Logic & Processing ---

def calculate_delays_and_actuals(transits_df, weather_df, ops_df):
    """
    Applies logic to calculate actual transit times and delays based on conditions.
    This merges the datasets first to utilize the covariates.
    """
    # Merge
    merged = transits_df.merge(weather_df, left_on='scheduled_date', right_on='date', how='left')
    merged = merged.merge(ops_df, left_on='scheduled_date', right_on='date', how='left')
    
    # Remove duplicate date columns from merge
    merged = merged.drop(columns=['date_x', 'date_y', 'scheduled_date'])
    
    # Ensure date is preserved purely for reference if needed, but scheduled_booking_time is key
    merged['scheduled_date'] = merged['scheduled_booking_time'].dt.date

    actual_entries = []
    actual_exits = []
    
    baseline_transit = 10.0 # Standard transit hours
    
    for idx, row in merged.iterrows():
        # --- DELAY LOGIC ---
        delay_factors = 0
        
        # 1. Weather Delay
        if row['rainfall_mm'] > 30:
            delay_factors += np.random.uniform(4.0, 8.0) # Heavy rain delay
        if row['visibility_km'] < 5:
            delay_factors += np.random.uniform(5.0, 9.0) # Fog delay
            
        # 2. Ops/Congestion Delay (OLD Logic replaced by Queue Logic below)
        # Note: We still keep a small random factor for general traffic
        if row['daily_transit_count'] > 38:
            delay_factors += np.random.uniform(1.0, 3.0) 

        # 4. Vessel Characteristics
        if row['vessel_size_category'] == 'Neopanamax':
            delay_factors += 2.0 
        
        # 5. Random Operational Incidence
        if random.random() < 0.05:
            delay_factors += np.random.uniform(2.0, 6.0)
            
        # --- NEW BACKLOG & BOOKING LOGIC ---
        # User thresholds: <70 Normal, 80-150 High, >150 Extreme
        
        row_date = row['scheduled_date'] # Use the date from the current row
        current_level = row['gatun_lake_level_m'] # Use the lake level from the current row
        queue = row['queue_length']
        booked = row['is_booked']

    # --- 2. Lake Level Logic (5 Tiers) ---
    # The current_level and queue are already available in the 'row' from the merged dataframe
    # current_level = ops_df.loc[ops_df['date'] == row_date, 'gatun_lake_level_m'].values[0] # This is redundant
    # queue = ops_df.loc[ops_df['date'] == row_date, 'queue_length'].values[0] # This is redundant
    
    # Tiered Logic
    if current_level >= 25.9:
        # Normal
        tier_factor = 1.0
    elif current_level >= 25.0:
        # Mild
        tier_factor = 1.2
    elif current_level >= 24.5:
        # Drought Start
        tier_factor = 1.6
    elif current_level >= 24.0:
        # Severe
        tier_factor = 2.2
    else:
        # Critical (< 24.0)
        tier_factor = 3.0
    
    # Apply Tier Factor to base delays
    delay_factors *= tier_factor
    
    # --- 3. QUEUE LOGIC (Continuous Quadratic) ---
    if booked == 1:
        # Booked vessels skipping queue
        if queue > 100:
             delay_factors += np.random.uniform(12.0, 24.0)
    else:
        # Non-Booked: Quadratic Delay
        base_queue_delay = 0.045 * (queue ** 2)
        # Apply tier factor to queue delay as well (drought makes queue progress slower)
        total_queue_delay = base_queue_delay * tier_factor
        
        delay_factors += total_queue_delay * np.random.uniform(0.9, 1.1)
            
        # Calculate Times
        # Entry delay: Ships rarely enter exactly on schedule if congested
        entry_offset = max(0, delay_factors * 0.2 + np.random.normal(0, 0.5))
        actual_entry = row['scheduled_booking_time'] + timedelta(hours=entry_offset)
        
        # Transit duration (Factor is now 1.0 to map delay factors directly to hours of delay in transit)
        actual_duration = baseline_transit + max(0, delay_factors * 1.0 + np.random.normal(0, 1.0))
        actual_exit = actual_entry + timedelta(hours=actual_duration)
        
        actual_entries.append(actual_entry)
        actual_exits.append(actual_exit)
        
    merged['actual_entry_time'] = actual_entries
    merged['actual_exit_time'] = actual_exits
    
    return merged

def derive_features(df):
    """Calculates final derived features."""
    
    # Time deltas
    df['actual_transit_time_hours'] = (df['actual_exit_time'] - df['actual_entry_time']).dt.total_seconds() / 3600
    
    # Delay definition: Difference from standard baseline (e.g., 10 hours) or deviation from schedule?
    # User prompt: delay_hours = actual_transit_time_hours - baseline
    # Let's use 10 hours as baseline
    BASELINE_HOURS = 10.0
    df['delay_hours'] = df['actual_transit_time_hours'] - BASELINE_HOURS
    
    # Target Variable
    # User prompt: is_delayed = 1 if delay_hours > 6 else 0
    df['is_delayed'] = (df['delay_hours'] > 6).astype(int)
    
    # Water Level Deficit
    SAFE_LEVEL = 25.0
    df['water_level_deficit'] = (SAFE_LEVEL - df['gatun_lake_level_m']).clip(lower=0)
    
    # Metadata
    df['data_source'] = 'synthetic'
    df['data_quality_flag'] = 'clean'
    
    # Scheduled Hour
    df['scheduled_hour'] = df['scheduled_booking_time'].dt.hour
    
    return df

def quality_checks(df):
    """Performs validation and printing of report."""
    print("\n--- DATA QUALITY REPORT ---")
    print(f"Total Records: {len(df)}")
    
    # Checks
    missing = df.isnull().sum()
    if missing.sum() > 0:
        print("\nMissing Values:\n", missing[missing > 0])
    else:
        print("Missing Values: None")
        
    # Validations
    neg_transit = df[df['actual_exit_time'] < df['actual_entry_time']]
    print(f"Time Consistency Errors (Exit < Entry): {len(neg_transit)}")
    
    draft_outliers = df[(df['vessel_draft_m'] < 5) | (df['vessel_draft_m'] > 18)]
    print(f"Draft Outliers (<5m or >18m): {len(draft_outliers)}")
    
    # Class Balance
    balance = df['is_delayed'].value_counts(normalize=True)
    print("\nClass Balance (Target: is_delayed):")
    print(balance)
    
    return df

# --- Main Execution ---

if __name__ == "__main__":
    print(f"Initializing Data Generation for {DAYS_TO_GENERATE} days starting {START_DATE.date()}...")
    
    # 1. Generate Tables
    weather_df = generate_weather(START_DATE, DAYS_TO_GENERATE)
    print(f"Generated {len(weather_df)} weather records.")
    
    ops_df = generate_operations(weather_df)
    print(f"Generated {len(ops_df)} operations records.")
    
    transits_df = generate_vessel_transits(ops_df)
    print(f"Generated {len(transits_df)} vessel transit records.")
    
    # 2. Merge & Logic
    print("Merging data and applying delay logic...")
    full_df = calculate_delays_and_actuals(transits_df, weather_df, ops_df)
    
    # 3. Features
    print("Calculating derived features...")
    final_df = derive_features(full_df)
    
    # 4. Quality Check
    final_df = quality_checks(final_df)
    
    # 5. Save
    # Sort
    final_df = final_df.sort_values('scheduled_booking_time')
    
    # Select columns as per requirement
    columns_order = [
         'vessel_size_category',
         'actual_entry_time', 'actual_exit_time',
         'scheduled_date', 'scheduled_hour',
         'vessel_beam_m', 'vessel_length_m', 'vessel_draft_m',
         'daily_transit_count', 'queue_length', 'is_booked',
         'gatun_lake_level_m',
         'rainfall_mm', 'rainfall_30day_mm', 'wind_speed_kmh', 'visibility_km',
         'actual_transit_time_hours', 'delay_hours', 'is_delayed', 'water_level_deficit',
         'data_source', 'data_quality_flag'
    ]
    
    # Ensure all columns exist
    for col in columns_order:
        if col not in final_df.columns:
            print(f"Warning: Column {col} missing from final dataframe.")
            
    # Save
    final_df[columns_order].to_csv(OUTPUT_FILENAME, index=False)
    print(f"\nSuccessfully saved {len(final_df)} rows to {OUTPUT_FILENAME}")
