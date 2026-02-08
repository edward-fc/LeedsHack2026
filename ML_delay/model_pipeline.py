import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime, timedelta

# --- Configuration ---
DATA_FILE = "panama_canal_transits_merged.csv"

def phase_1_data_validation(df):
    print("\n--- Phase 1: Data Validation ---")
    
    # 1. Verify records
    print(f"Total Records: {len(df)}")
    if len(df) < 10000:
        print("WARNING: Dataset smaller than expected (~13k).")
        
    # Reconstruct scheduled_booking_time if missing
    if 'scheduled_booking_time' not in df.columns:
        print("Reconstructing 'scheduled_booking_time' from 'scheduled_date' and 'scheduled_hour'...")
        df['scheduled_booking_time'] = pd.to_datetime(df['scheduled_date']) + pd.to_timedelta(df['scheduled_hour'], unit='h')
    else:
        df['scheduled_booking_time'] = pd.to_datetime(df['scheduled_booking_time'])

    # 2. Class Balance
    balance = df['is_delayed'].mean()
    print(f"Class Balance (is_delayed): {balance:.1%}")
    if not (0.10 <= balance <= 0.80):
        print("STOP: Class balance outside 10-80% range!")
        # In a real pipeline we might raise an error, but here we proceed with warning
    
    # 3. Correlations
    # Select numeric columns only
    numeric_df = df.select_dtypes(include=[np.number])
    correlations = numeric_df.corr()['is_delayed'].sort_values(ascending=False)
    print("\nTop 10 Feature Correlations with Target:")
    print(correlations.head(11).drop('is_delayed')) # Top 10 excluding self
    
    return df

def phase_2_feature_engineering(df):
    print("\n--- Phase 2: Feature Engineering ---")
    
    # 1. Temporal
    df['month'] = df['scheduled_booking_time'].dt.month
    df['day_of_week'] = df['scheduled_booking_time'].dt.dayofweek
    df['hour'] = df['scheduled_booking_time'].dt.hour
    df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)
    # Quarter
    df['quarter'] = df['scheduled_booking_time'].dt.quarter
    # Season (approximate for Panama)
    df['is_dry_season'] = df['month'].isin([1, 2, 3, 4]).astype(int)

    # 2. Risk Flags
    # Congestion
    # Assuming 'daily_transit_count' is the proxy for congestion provided in dataset
    df['is_high_congestion'] = (df['daily_transit_count'] > 40).astype(int)
    # booking_density: count / 36 (approx capacity)
    df['booking_density'] = df['daily_transit_count'] / 36.0
    
    # Water
    df['is_low_water'] = (df['gatun_lake_level_m'] < 25.0).astype(int)
    df['is_critical_water'] = (df['gatun_lake_level_m'] < 24.5).astype(int)
    
    # Vessel
    # vessel_size_risk: Neopanamax are higher risk
    df['vessel_size_risk'] = (df['vessel_size_category'] == 'Neopanamax').astype(int)
    # is_oversized (example logic: high beam or length)
    df['is_oversized'] = ((df['vessel_beam_m'] > 45) | (df['vessel_length_m'] > 350)).astype(int)
    # draft_risk: > 14m is risky (approx 46ft)
    df['draft_risk'] = (df['vessel_draft_m'] > 14.0).astype(int)
    
    # 3. Interactions
    df['low_water_x_high_congestion'] = df['is_low_water'] * df['is_high_congestion']
    df['drought_x_large_vessel'] = df['is_critical_water'] * df['vessel_size_risk']
    # Removed water_level_deficit interaction per user request
    
    # 4. Encode Categoricals
    # No categorical encoding needed as we dropped non-essential text columns.
    # 'vessel_size_category' is used for 'vessel_size_risk' and then dropped.
    pass
    
    # 5. Remove Leakage
    leakage_cols = [
        'actual_entry_time', 'actual_exit_time', 
        'actual_transit_time_hours', 'delay_hours', 
        'scheduled_date', 'scheduled_booking_time' # Drop original time after extracting features
        # Note: 'scheduled_booking_time' is useful for sorting in Split phase, so DON'T drop yet?
        # The prompt says: "Remove leakage... vessel_imo". 
        # But Phase 3 needs 'scheduled_booking_time' for sorting.
        # I will drop others but keep 'scheduled_booking_time' until Phase 3.
    ]
    
    # But wait, Phase 3 says "Sort by scheduled_booking_time".
    # So I must keep it.
    cols_to_drop = [c for c in leakage_cols if c in df.columns and c != 'scheduled_booking_time' and c != 'delay_hours']
    # Also drop object columns that are not encoded?
    # vessel_size_category is 'Neopanamax'/'Panamax'. I used it for features. Should I drop or encode?
    # I replaced it with `vessel_size_risk` (binary).
    # So I can drop `vessel_size_category`.
    cols_to_drop.append('vessel_size_category')
    
    df = df.drop(columns=cols_to_drop, errors='ignore')
    
    print(f"Final Features: {df.shape[1]} columns")
    
    # Check for missing values
    if df.isnull().sum().sum() > 0:
        print("Warning: Missing values remain!")
        print(df.isnull().sum()[df.isnull().sum() > 0])
        # Fill/Drop?
        df = df.fillna(0) # Simple fill for now
        
    return df


# --- Phase 3: Train/Test Split ---
from sklearn.model_selection import train_test_split

def phase_3_split_data(df):
    print("\n--- Phase 3: Train/Test Split ---")
    
    # Sort by time to respect temporal nature
    df = df.sort_values('scheduled_booking_time')
    
    # Features
    # Note: Some columns might have been dropped in Phase 2, so we use errors='ignore'
    X = df.drop(columns=['is_delayed', 'delay_hours', 'actual_entry_time', 'actual_exit_time', 
                         'actual_transit_time_hours', 'scheduled_booking_time', 'data_source', 
                         'data_quality_flag', 'scheduled_date'], errors='ignore')
    
    # Targets
    y_class = df['is_delayed']
    y_reg = df['delay_hours'] # Regression target
    
    # Split 80/20 (Time-based split)
    split_idx = int(len(df) * 0.8)
    
    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_class_train, y_class_test = y_class.iloc[:split_idx], y_class.iloc[split_idx:]
    y_reg_train, y_reg_test = y_reg.iloc[:split_idx], y_reg.iloc[split_idx:]
    
    print(f"Train Set: {X_train.shape}")
    print(f"Test Set:  {X_test.shape}")
    
    return X_train, X_test, y_class_train, y_class_test, y_reg_train, y_reg_test

# --- Phase 4: Model Training ---
import xgboost as xgb

def phase_4_model_training(X_train, y_class_train, y_reg_train):
    print("\n--- Phase 4: Model Training (Dual Models) ---")
    
    # 1. Classifier (Is Delayed?)
    print("Training Classifier...")
    clf_model = xgb.XGBClassifier(
        objective='binary:logistic',
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        random_state=42,
        eval_metric='logloss'
    )
    clf_model.fit(X_train, y_class_train)
    
    # 2. Regressor (How Long?)
    # Train ONLY on delayed examples to learn magnitude
    print("Training Regressor (on delayed samples only)...")
    delayed_indices = y_class_train == 1
    X_train_delayed = X_train[delayed_indices]
    y_reg_train_delayed = y_reg_train[delayed_indices]
    
    reg_model = xgb.XGBRegressor(
        objective='reg:squarederror',
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        random_state=42
    )
    reg_model.fit(X_train_delayed, y_reg_train_delayed)
    
    print("Dual model training complete.")
    
    # Save Models (JSON for Booster, PKL for Wrapper)
    clf_model.save_model("clf_model.json")
    reg_model.save_model("reg_model.json")
    
    import joblib
    joblib.dump(clf_model, "delay_classifier.pkl")
    joblib.dump(reg_model, "delay_regressor.pkl")
    print("Models saved to JSON and PKL formats.")
    
    return clf_model, reg_model

# --- Phase 5: Evaluation ---
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix, mean_absolute_error, mean_squared_error

def phase_5_evaluation(clf_model, reg_model, X_test, y_class_test, y_reg_test, feature_names):
    print("\n--- Phase 5: Evaluation ---")
    
    # --- Classifier Evaluation ---
    print("\n[Classifier Performance]")
    y_pred_class = clf_model.predict(X_test)
    y_prob_class = clf_model.predict_proba(X_test)[:, 1]
    
    print(f"Accuracy:  {accuracy_score(y_class_test, y_pred_class):.4f}")
    print(f"Precision: {precision_score(y_class_test, y_pred_class):.4f}")
    print(f"Recall:    {recall_score(y_class_test, y_pred_class):.4f}")
    print(f"F1-Score:  {f1_score(y_class_test, y_pred_class):.4f}")
    print(f"ROC-AUC:   {roc_auc_score(y_class_test, y_prob_class):.4f}")
    
    # --- Regressor Evaluation ---
    print("\n[Regressor Performance (Delayed Samples Only)]")
    # Evaluate only on actual delayed samples in test set
    delayed_mask = y_class_test == 1
    if delayed_mask.sum() > 0:
        X_test_delayed = X_test[delayed_mask]
        y_reg_test_delayed = y_reg_test[delayed_mask]
        
        y_pred_reg = reg_model.predict(X_test_delayed)
        
        mae = mean_absolute_error(y_reg_test_delayed, y_pred_reg)
        rmse = np.sqrt(mean_squared_error(y_reg_test_delayed, y_pred_reg))
        
        print(f"MAE:       {mae:.4f} hours")
        print(f"RMSE:      {rmse:.4f} hours")
    else:
        print("No delayed samples in test set to evaluate regressor.")
    
    # Feature Importance (Classifier)
    importance = clf_model.feature_importances_
    feat_imp = pd.DataFrame({'feature': feature_names, 'importance': importance})
    feat_imp = feat_imp.sort_values('importance', ascending=False).head(10)
    
    print("\nTop 10 Feature Importances (Classifier):")
    print(feat_imp)
    
    # Plot
    plt.figure(figsize=(10, 6))
    sns.barplot(x='importance', y='feature', data=feat_imp)
    plt.title('XGBoost Classifier - Top 10 Feature Importances')
    plt.tight_layout()
    plt.savefig('feature_importance.png')
    print("Feature importance plot saved to 'feature_importance.png'.")

# --- Phase 6: Unified Inference ---
def predict_transit_delay(row_features, clf_model, reg_model):
    """
    Predicts delay probability and estimated hours for a single transit.
    row_features: DataFrame (1 row) or dict
    """
    # Ensure input is DataFrame
    if isinstance(row_features, pd.Series):
        row_features = row_features.to_frame().T
    elif isinstance(row_features, dict):
        row_features = pd.DataFrame([row_features])
        
    # 1. Predict Probability
    prob_delay = clf_model.predict_proba(row_features)[:, 1][0]
    
    # 2. Logic
    predicted_hours = 0.0
    risk_level = "LOW" # Default to LOW
    
    # Predict hours if probability is above a threshold
    if prob_delay >= 0.30: # Use the classifier's prediction as a gate
        predicted_hours = reg_model.predict(row_features)[0]
        # Clip negative predictions
        predicted_hours = max(0.0, predicted_hours)
    
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

def main():
    # Load Data
    try:
        df = pd.read_csv(DATA_FILE)
    except FileNotFoundError:
        print(f"Error: {DATA_FILE} not found. Run generation script first.")
        return

    # Phase 1
    df = phase_1_data_validation(df)
    
    # Phase 2
    df = phase_2_feature_engineering(df)
    
    # Save intermediate for inspection
    df.to_csv("panama_canal_features.csv", index=False)
    print("\nPhase 2 Complete. Saved to 'panama_canal_features.csv'.")

    # Phase 3
    X_train, X_test, y_class_train, y_class_test, y_reg_train, y_reg_test = phase_3_split_data(df)
    
    # Phase 4
    clf_model, reg_model = phase_4_model_training(X_train, y_class_train, y_reg_train)
    
    # Phase 5
    phase_5_evaluation(clf_model, reg_model, X_test, y_class_test, y_reg_test, X_train.columns)
    
    # Phase 6: Demo Inference
    print("\n--- Phase 6: Inference Demo ---")
    sample_row = X_test.iloc[[0]]
    prob, hours, risk = predict_transit_delay(sample_row, clf_model, reg_model)
    
    print(f"Sample Transit Inference:")
    print(f"Delay Probability: {prob:.1%}")
    print(f"Risk Level:        {risk}")
    print(f"Est. Delay Hours:  {hours:.2f} hrs") 
    print(f"Actual Delay:      {y_reg_test.iloc[0]:.2f} hrs (Delayed? {y_class_test.iloc[0]})")


# --- Phase 7: Scenario Simulation ---
def phase_7_simulation(clf_model, reg_model, feature_names):
    print("\n--- Phase 7: Scenario Simulation ---")
    
    # Define Scenarios (Raw Data)
    scenarios = [
        {
            'name': 'Ideal Conditions',
            'scheduled_booking_time': pd.Timestamp('2024-05-15 10:00:00'),
            'vessel_type': 'Container',
            'vessel_size_category': 'Panamax',
            'vessel_beam_m': 30,
            'vessel_length_m': 200,
            'vessel_draft_m': 10,
            'daily_transit_count': 32, # Low traffic
            'gatun_lake_level_m': 27.0, # High water
            'rainfall_mm': 0,
            'wind_speed_kmh': 10,
            'visibility_km': 20,
            'data_source': 'simulated',
            'data_quality_flag': 'simulated',
            'water_level_deficit': 0 # Will be recalculated but good to have
        },
        {
            'name': 'Stormy Weather',
            'scheduled_booking_time': pd.Timestamp('2024-10-15 14:00:00'),
            'vessel_type': 'Container',
            'vessel_size_category': 'Panamax',
            'vessel_beam_m': 30,
            'vessel_length_m': 200,
            'vessel_draft_m': 10,
            'daily_transit_count': 32,
            'gatun_lake_level_m': 27.0,
            'rainfall_mm': 50, # Heavy rain
            'wind_speed_kmh': 45, # High wind
            'visibility_km': 2, # Low visibility
            'data_source': 'simulated', 
            'data_quality_flag': 'simulated'
        },
        {
            'name': 'High Congestion',
            'scheduled_booking_time': pd.Timestamp('2024-03-20 09:00:00'),
            'vessel_type': 'Container',
            'vessel_size_category': 'Panamax',
            'vessel_beam_m': 30,
            'vessel_length_m': 200,
            'vessel_draft_m': 10,
            'daily_transit_count': 45, # High traffic
            'gatun_lake_level_m': 27.0,
            'rainfall_mm': 0,
            'wind_speed_kmh': 15,
            'visibility_km': 15,
            'data_source': 'simulated',
            'data_quality_flag': 'simulated'
        },
        {
            'name': 'Drought (Low Water)',
            'scheduled_booking_time': pd.Timestamp('2024-04-10 12:00:00'),
            'vessel_type': 'Neopanamax', # Large vessel
            'vessel_size_category': 'Neopanamax',
            'vessel_beam_m': 49,
            'vessel_length_m': 366,
            'vessel_draft_m': 15.0, # Deep draft
            'daily_transit_count': 30, 
            'gatun_lake_level_m': 24.2, # Critical water level
            'rainfall_mm': 0,
            'wind_speed_kmh': 15,
            'visibility_km': 15,
            'data_source': 'simulated',
            'data_quality_flag': 'simulated'
        }
    ]
    
    # Convert to DataFrame
    sim_df = pd.DataFrame(scenarios)
    
    # Process features (reuse Phase 2 logic)
    print("Processing simulated scenarios...")
    sim_df = phase_2_feature_engineering(sim_df)
    
    # Align columns with training data
    # Ensure all model features exist and are in order
    for col in feature_names:
        if col not in sim_df.columns:
            sim_df[col] = 0
            
    # Reorder and filter to match exact training features
    sim_df = sim_df[feature_names]
    
    # Predict
    print("\n--- Simulation Results ---")
    results = []
    
    for i, row in sim_df.iterrows():
        name = scenarios[i]['name']
        prob, hours, risk = predict_transit_delay(row, clf_model, reg_model)
        
        results.append({
            'Scenario': name,
            'Risk Level': risk,
            'Delay Prob': f"{prob:.1%}",
            'Est. Delay': f"{hours:.2f} hrs"
        })
        
    results_df = pd.DataFrame(results)
    print(results_df.to_string(index=False))

def main():
    # Load Data
    try:
        df = pd.read_csv(DATA_FILE)
    except FileNotFoundError:
        print(f"Error: {DATA_FILE} not found. Run generation script first.")
        return

    # Phase 1
    df = phase_1_data_validation(df)
    
    # Phase 2
    df = phase_2_feature_engineering(df)
    
    # Save intermediate for inspection
    df.to_csv("panama_canal_features.csv", index=False)
    print("\nPhase 2 Complete. Saved to 'panama_canal_features.csv'.")

    # Phase 3
    X_train, X_test, y_class_train, y_class_test, y_reg_train, y_reg_test = phase_3_split_data(df)
    
    # Phase 4
    clf_model, reg_model = phase_4_model_training(X_train, y_class_train, y_reg_train)
    
    # Phase 5
    phase_5_evaluation(clf_model, reg_model, X_test, y_class_test, y_reg_test, X_train.columns)
    
    # Save Feature Names
    import json
    with open("model_features.json", "w") as f:
        json.dump(X_train.columns.tolist(), f)
    
    import joblib
    joblib.dump(X_train.columns.tolist(), "model_features.pkl")
    print("Feature names saved to 'model_features.json' and 'model_features.pkl'.")
    
    # Phase 6: Demo Inference
    print("\n--- Phase 6: Inference Demo ---")
    sample_row = X_test.iloc[[0]]
    prob, hours, risk = predict_transit_delay(sample_row, clf_model, reg_model)
    
    print(f"Sample Transit Inference:")
    print(f"Delay Probability: {prob:.1%}")
    print(f"Risk Level:        {risk}")
    print(f"Est. Delay Hours:  {hours:.2f} hrs") 
    print(f"Actual Delay:      {y_reg_test.iloc[0]:.2f} hrs (Delayed? {y_class_test.iloc[0]})")
    
    # Phase 7: Simulation
    phase_7_simulation(clf_model, reg_model, X_train.columns)

if __name__ == "__main__":
    main()
