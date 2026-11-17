# VitalWatch — Smart Health Monitoring & Early Warning System

VitaWatch is an AI-powered clinical vital sign surveillance web application. It monitolrs patient physiology, evaluates risk via a dual-layer intelligence engine (clinical NEWS2 rule thresholds + scikit-learn RandomForest Classifier), generates plain-English explanations of clinical abnormalities, and raises automated early warning alerts.

---

## Tech Stack

- **Backend**: Python 3.x, Flask (single app, lightweight and modular)
- **Database**: MySQL via SQLAlchemy ORM (with automatic fallback to SQLite for offline testing)
- **Authentication**: JWT-based session (`PyJWT`) with `bcrypt` password hashing
- **Machine Learning**: `scikit-learn` (RandomForestClassifier trained on synthetic physiological data)
- **Rule Engine**: Standardized National Early Warning Score (NEWS2) clinical thresholds
- **Frontend**: Responsive vanilla HTML5, modern CSS3 with selective glassmorphism, and vanilla JavaScript (Chart.js for trend graphs)

---

## Core Features & Workflow

1. **User Authentication**:
   - Split-screen / centered card for Registration and Login with role selection (`patient` or `doctor`).
   - Secure token storage with session expiration and automated protection.

2. **Vital Signs Monitored**:
   - Heart Rate (bpm)
   - Oxygen Saturation / SpO2 (%)
   - Blood Pressure: Systolic & Diastolic (mmHg)
   - Body Temperature (°C)
   - Respiratory Rate (breaths/min)
   - Blood Glucose (mg/dL, optional)

3. **Dual-Layer AI Risk Evaluation**:
   - **NEWS2 Rule Engine**: Scores individual vital parameters against clinical emergency thresholds and calculates a composite physiological severity level (`NORMAL`, `WARNING`, `CRITICAL`).
   - **RandomForest Classifier**: Predicts multi-class risk probabilities based on multivariate patterns.
   - **Plain-English Explanation Generator**: Auto-generates human-readable descriptions of flagged abnormalities (e.g., *Severe hypoxemia with tachycardia*).
   - **Automated Alerts**: Any `WARNING` or `CRITICAL` vital reading automatically creates an actionable entry in the `alerts` database table.

4. **Interactive Dashboard**:
   - Frosted-glass risk status banner with live pulsing state indicator and continuous risk score percentage.
   - 6 vital telemetry cards with reference ranges and status badges.
   - Multi-parameter historical trend charts (Chart.js).
   - Real-time early warning alerts snapshot.

5. **History & Alert Management**:
   - Full chronological vitals history table with status filtering.
   - Dedicated Alerts center with filter views and one-click "Acknowledge" functionality.

---

## Quickstart Setup Guide

### 1. Prerequisites
- Python 3.10+ (tested on Python 3.14)
- MySQL Server (e.g. MySQL 8.0, MariaDB, or XAMPP)

### 2. Create the MySQL Database
Log into MySQL via MySQL Workbench or command line:
```sql
CREATE DATABASE vitalwatch CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure Database Credentials (Optional)
By default, the application connects to MySQL at `mysql+pymysql://root:@localhost:3306/vitalwatch`.
To customize credentials, set environment variables or create a `.env` file in the project root:
```ini
DB_USER=root
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=3306
DB_NAME=vitalwatch
```
*(Note: If your MySQL service is temporarily offline, VitalWatch will automatically use local SQLite `vitalwatch.db` so the app runs immediately without errors).*

### 5. Train the Machine Learning Model (One-Time)
Generate synthetic clinical datasets and train the RandomForest model:
```bash
python app/train_model.py
```
*(Note: If omitted, the server will automatically train and save the model on first launch).*

### 6. Start the Server
```bash
python run.py
```
Open your browser and navigate to:
```
http://127.0.0.1:5000
```

---

## Running Automated Tests
Run the comprehensive end-to-end API test suite:
```bash
python -m unittest tests/test_api.py
```

---

## Project Structure
```
d:\MINI PROJECT 3rd year\
├── app/
│   ├── __init__.py          # Flask app factory, database init & routing
│   ├── config.py            # Environment & database settings
│   ├── models.py            # SQLAlchemy models: users, vital_records, alerts
│   ├── auth.py              # JWT authentication & bcrypt hashing
│   ├── vitals.py            # Telemetry logging, dashboard, history & alerts
│   ├── ai_engine.py         # NEWS2 rule engine, ML inference & explanation generator
│   ├── train_model.py       # Standalone synthetic dataset & RandomForest trainer
│   ├── static/
│   │   ├── css/
│   │   │   └── style.css    # Responsive design system & glassmorphism styling
│   │   └── js/
│   │       ├── api.js       # JWT API client & fetch wrappers
│   │       └── app.js       # UI state, form handlers, tab routing & Chart.js
│   └── templates/
│       └── index.html       # Single-page web application shell
├── model/
│   └── vitalwatch_rf.joblib # Trained machine learning model artifact
├── tests/
│   └── test_api.py          # Complete end-to-end test suite
├── requirements.txt         # Dependencies list
├── run.py                   # Application launch script
└── README.md                # Documentation & setup instructions
```
