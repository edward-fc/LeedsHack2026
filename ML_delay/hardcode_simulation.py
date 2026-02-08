import sys
import pandas as pd
import numpy as np
import xgboost as xgb
import joblib
from datetime import datetime, timedelta
import model_pipeline

# Force UTF-8 encoding for stdout
sys.stdout.reconfigure(encoding='utf-8')

ARTIFACTS_DIR = "."

def load_artifacts():
    try:
        clf = joblib.load(f"{ARTIFACTS_DIR}/delay_classifier.pkl")
        reg = joblib.load(f"{ARTIFACTS_DIR}/delay_regressor.pkl")
        features = joblib.load(f"{ARTIFACTS_DIR}/model_features.pkl")
        print("Loaded models and feature names...")
        print(f"Loaded {len(features)} features.")
        return clf, reg, features
    except FileNotFoundError:
        print("Error: Model artifacts not found. Run model_pipeline.py first.")
        sys.exit(1)

def calculate_delay(weather, congestion, vessel):
    # Combine inputs
    data = {**weather, **congestion, **vessel}
    
    # Create DataFrame (single row)
    df = pd.DataFrame([data])
    
    # Feature Engineering (Reuse pipeline logic)
    df = model_pipeline.phase_2_feature_engineering(df)
    
    # Load model features to ensure alignment
    _, _, feature_names = load_artifacts()
    
    # Ensure all model features exist, fill with 0 if missing
    for col in feature_names:
        if col not in df.columns:
            df[col] = 0
            
    # Reorder columns to match training
    df_final = df[feature_names]
    
    # Predict
    clf_model, reg_model, _ = load_artifacts()
    
    # 1. Classification (Risk of Delay > 6 hours)
    prob_delay = clf_model.predict_proba(df_final)[0][1]
    
    # 2. Regression (Estimated Hours)
    # Only predict if probability is high enough? 
    # Actually, let's just predict raw hours and see
    predicted_hours = reg_model.predict(df_final)[0]
    predicted_hours = max(0.0, predicted_hours) # No negative delays
    
    # Risk Categories (based on Duration)
    # LOW: < 2 days (48 hours)
    # MEDIUM: 2-7 days (48 - 168 hours)
    # HIGH: > 7 days (168 hours)
    
    if predicted_hours < 48.0:
        risk_level = "LOW"
    elif predicted_hours < 168.0:
        risk_level = "MEDIUM"
    else:
        risk_level = "HIGH"
        
    return prob_delay, predicted_hours, risk_level

if __name__ == "__main__":
    clf_model, reg_model, feature_names = load_artifacts()
    
    print("\n--- Hardcoded Simulation ---")
    
    # 2. Define Scenarios (Hardcoded Inputs)
    
    # Scenario A: The "Ideal" Day (Low Queue, Booked)
    weather_ideal = {
        'rainfall_mm': 10.0, # Light rain
        'rainfall_30day_mm': 50.0, 
        'wind_speed_kmh': 20.0,
        'visibility_km': 60.0,
        'scheduled_booking_time': pd.Timestamp('2024-05-15 10:00:00')
    }
    congestion_ideal = {
        'daily_transit_count': 35, 
        'gatun_lake_level_m': 27.5, 

        'queue_length': 10, # Minimal backlog
        'is_booked': 1 # Booked
    }
    vessel_panamax = {
        'vessel_size_category': 'Panamax',
        'vessel_beam_m': 32.0,
        'vessel_length_m': 290.0,
        'vessel_draft_m': 11.5
    }
    
    # Scenario B: The "Stormy" Day (Low Queue, Booked - Isolate Weather)
    weather_stormy = {
        'rainfall_mm': 75.0, # Very Heavy Rain
        'rainfall_30day_mm': 400.0, # High accum rain
        'wind_speed_kmh': 55.0, # High Wind
        'visibility_km': 1.5, # Poor Visibility
        'scheduled_booking_time': pd.Timestamp('2024-10-15 14:00:00')
    }
    # Congestion same as ideal for isolation of weather effect
    
    # Scenario C: "Extreme Backlog + Non-Booked"
    congestion_extreme = {
        'daily_transit_count': 45, 
        'gatun_lake_level_m': 24.1, 

        'queue_length': 200, # Massive backlog
        'is_booked': 0 # Non-Booked (Should face 15+ days delay)
    }
    
    # Scenario D: "High Backlog + Booked"
    congestion_high_booked = {
        'daily_transit_count': 45,
        'gatun_lake_level_m': 25.0,

        'queue_length': 120,
        'is_booked': 1 # Should still be relatively fast despite queue
    }

    # Scenario E: User Custom Request
    # Queue=80, Rain=20, Weekday=Monday, Vis=10, Lake=40
    weather_user = {
        'rainfall_mm': 20.0,
        'rainfall_30day_mm': 100.0, # Assumption
        'wind_speed_kmh': 20.0, # Assumption
        'visibility_km': 10.0,
        'scheduled_booking_time': pd.Timestamp('2024-05-13 10:00:00') # Mon May 13 2024
    }
    congestion_user = {
        'daily_transit_count': 40, # Assumption
        'gatun_lake_level_m': 40.0,

        'queue_length': 80,
        'is_booked': 0 # Assumption: Non-booked to see queue effect? Or 1? Let's assume 0 as 80 queue is high.
    }

    
    # 3. Simulate and Predict
    scenarios = [
        ("Ideal Conditions", weather_ideal, congestion_ideal, vessel_panamax),
        ("Stormy Weather", weather_stormy, congestion_ideal, vessel_panamax),
        ("Extreme: Queue 200 (Non-Booked)", weather_ideal, congestion_extreme, vessel_panamax),
        ("High: Queue 120 (Booked)", weather_ideal, congestion_high_booked, vessel_panamax),
        ("User Custom (Q=80, Mon)", weather_user, congestion_user, vessel_panamax)
    ]
    
    print(f"\n{'Scenario':<30} | {'Risk':<8} | {'Prob':<8} | {'Delay':<15}")
    print("-" * 70)
    
    for name, w, c, v in scenarios:
        # A. Process
        try:
            prob, delay, risk = calculate_delay(w, c, v)
             
            # B. Report
            print(f"{name:<30} | {risk:<8} | {prob:.1%}   | {delay:.2f} hrs")
            
        except Exception as e:
            print(f"Error processing {name}: {e}")
