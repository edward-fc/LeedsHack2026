import sys
import os
import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

# Add parent directory to path to import model_pipeline
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import model_pipeline

app = FastAPI(title="Panama Canal Delay Predictor")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Models
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
try:
    clf_model = joblib.load(os.path.join(MODEL_DIR, "delay_classifier.pkl"))
    reg_model = joblib.load(os.path.join(MODEL_DIR, "delay_regressor.pkl"))
    feature_names = joblib.load(os.path.join(MODEL_DIR, "model_features.pkl"))
    print("Models loaded successfully.")
except Exception as e:
    print(f"Error loading models: {e}")
    sys.exit(1)

class PredictionInput(BaseModel):
    queue_length: float = 10.0
    is_booked: int = 1
    rainfall_mm: float = 0.0
    gatun_lake_level_m: float = 26.7
    wind_speed_kmh: float = 15.0
    visibility_km: float = 10.0
    month: int = 5
    day_of_week: int = 2
    hour: int = 12

    # Default values for other features needed by pipeline
    vessel_size_category: str = "Panamax"
    vessel_beam_m: float = 32.0
    vessel_length_m: float = 290.0
    vessel_draft_m: float = 12.0
    daily_transit_count: int = 35
    rainfall_30day_mm: float = 100.0

@app.get("/health")
def health_check():
    return {"status": "ok", "models_loaded": True}

@app.post("/predict")
def predict_delay(input_data: PredictionInput):
    try:
        # Convert input to DataFrame
        data = input_data.dict()
        data['scheduled_booking_time'] = pd.Timestamp(f"2024-{int(data['month']):02d}-15 {int(data['hour']):02d}:00:00")
        
        # Approximate water level deficit
        # Approximate water level deficit
        # Removed per user request

        
        df = pd.DataFrame([data])
        
        # Feature Engineering (Reuse pipeline logic)
        df = model_pipeline.phase_2_feature_engineering(df)
        
        # Align features
        for col in feature_names:
            if col not in df.columns:
                df[col] = 0
        df_final = df[feature_names]
        
        # Predict Class (Is Delayed?)
        prob_delay = clf_model.predict_proba(df_final)[0][1]
        
        # Predict Hours (How Long?)
        predicted_hours = 0.0
        if prob_delay >= 0.3: # Threshold
             predicted_hours = reg_model.predict(df_final)[0]
             predicted_hours = max(0.0, predicted_hours)
             
        # Risk Logic
        if predicted_hours < 48.0:
            risk = "LOW"
        elif predicted_hours < 168.0:
            risk = "MEDIUM"
        else:
            risk = "HIGH"
            
        return {
            "is_delayed": bool(prob_delay >= 0.5),
            "probability": round(float(prob_delay), 4),
            "predicted_delay_hours": round(float(predicted_hours), 2),
            "risk_level": risk
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
