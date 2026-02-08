# Panama Canal Delay Prediction Project

This project predicts transit delays at the Panama Canal using machine learning (XGBoost), incorporating real-world congestion logic and weather data.

## 🚀 Key Features
- **Real-World Congestion**: Simulates cumulative backlog (`Queue Length`) and `Booking Status`.
- **Continuous Delay Scaling**: Uses a quadratic formula (`Delay ~ 0.045 * Queue^2`) to model exponential delays for non-booked vessels.
- **Risk Classification**: Categorizes risk based on delay duration:
    - **LOW**: < 2 days
    - **MEDIUM**: 2 - 7 days
    - **HIGH**: > 7 days

## 📂 Project Structure

| File | Description |
| :--- | :--- |
| **`generate_and_process_data.py`** | **Step 1**: Generates synthetic traffic, weather, and operations data. Applies backlog & delay logic. |
| **`model_pipeline.py`** | **Step 2**: Trains the XGBoost Classifier (Is Delayed?) and Regressor (How Long?). Saves models to `.pkl`. |
| **`hardcode_simulation.py`** | **Step 3 (Simulation)**: Runs "What-If" scenarios (e.g., "Queue=80 + Storm") using trained models. |
| **`generate_sensitivity_report.py`** | **Step 4 (Analysis)**: Generates a full matrix of predicted delays across different Queue, Rain, and Lake levels. |
| `check_data.py` | Helper script to validate data quality and delay distributions. |

## 🛠️ How to Run

### 1. Generate Data
Create the dataset (`panama_canal_transits_merged.csv`):
```bash
python generate_and_process_data.py
```

### 2. Train Models
Train the AI models and save artifacts (`*.pkl`):
```bash
python model_pipeline.py
```

### 3. Run Simulations
Test specific scenarios (edit the script to add your own):
```bash
python hardcode_simulation.py
```
> *Example Output: "User Custom (Queue=80): 283.7 hrs (High Risk)"*

### 4. Sensitivity Analysis
Generate a tabular report of delays (`sensitivity_report.csv`):
```bash
python generate_sensitivity_report.py
```

## 🌐 Testing UI (New)

### Backend
1. Install dependencies: `pip install -r backend/requirements.txt`
2. Start server: 
   ```bash
   cd backend
   uvicorn app:app --reload
   ```

### Frontend
1. Open `frontend/index.html` in your browser.
2. Use presets to test scenarios like "Heavy Backlog" or "Storm".

## 📊 Logic Details
- **Backlog**: Queue grows when `Daily Demand` > `Capacity`.
- **Drought**: Capacity drops from 36 to 24 ships/day if `Lake Level < 24.5m`.
- **Non-Booked Delay Formula**: `Hours = 0.045 * (Queue^2)` (plus random noise).
