import os
from pathlib import Path
import joblib
import numpy as np

# Cache for loaded ML model
_ml_model = None

def get_ml_model(model_path=None):
    global _ml_model
    if _ml_model is not None:
        return _ml_model

    if model_path is None:
        base_dir = Path(__file__).resolve().parent.parent
        model_path = base_dir / "model" / "vitalwatch_rf.joblib"

    if os.path.exists(model_path):
        try:
            _ml_model = joblib.load(model_path)
            return _ml_model
        except Exception as e:
            print(f"[AI Engine] Error loading ML model from {model_path}: {e}")
            return None
    return None


def evaluate_news2_rules(hr, spo2, sbp, dbp, temp, resp, glucose=None):
    """
    Evaluates individual vital metrics using clinical thresholds (NEWS2 aligned).
    Returns (total_score, max_vital_score, findings, details)
    """
    score = 0
    max_vital_score = 0
    findings = []
    details = {}

    # 1. Heart Rate (bpm)
    hr_score = 0
    hr_status = "Normal"
    if hr <= 40:
        hr_score = 3
        hr_status = "Severe Bradycardia"
        findings.append(f"Heart Rate is critically low at {hr:.0f} bpm (Severe Bradycardia, Normal: 51-90 bpm)")
    elif 41 <= hr <= 50:
        hr_score = 1
        hr_status = "Mild Bradycardia"
        findings.append(f"Heart Rate is low at {hr:.0f} bpm (Normal: 51-90 bpm)")
    elif 51 <= hr <= 90:
        hr_score = 0
        hr_status = "Normal"
    elif 91 <= hr <= 110:
        hr_score = 1
        hr_status = "Mild Tachycardia"
        findings.append(f"Heart Rate is slightly elevated at {hr:.0f} bpm (Normal: 51-90 bpm)")
    elif 111 <= hr <= 130:
        hr_score = 2
        hr_status = "Moderate Tachycardia"
        findings.append(f"Heart Rate is high at {hr:.0f} bpm (Tachycardia, Normal: 51-90 bpm)")
    else:  # >= 131
        hr_score = 3
        hr_status = "Severe Tachycardia"
        findings.append(f"Heart Rate is critically elevated at {hr:.0f} bpm (Severe Tachycardia, Normal: 51-90 bpm)")
    score += hr_score
    max_vital_score = max(max_vital_score, hr_score)
    details["heart_rate"] = {"score": hr_score, "status": hr_status}

    # 2. SpO2 (%)
    spo2_score = 0
    spo2_status = "Normal"
    if spo2 >= 96:
        spo2_score = 0
        spo2_status = "Normal"
    elif 94 <= spo2 <= 95:
        spo2_score = 1
        spo2_status = "Mild Hypoxemia"
        findings.append(f"SpO2 is slightly low at {spo2:.0f}% (Normal: >=96%)")
    elif 92 <= spo2 <= 93:
        spo2_score = 2
        spo2_status = "Moderate Hypoxemia"
        findings.append(f"SpO2 is low at {spo2:.0f}% (Moderate Hypoxemia, Normal: >=96%)")
    else:  # <= 91
        spo2_score = 3
        spo2_status = "Severe Hypoxemia"
        findings.append(f"Oxygen Saturation (SpO2) is dangerously low at {spo2:.0f}% (Hypoxemia, Normal: >=96%)")
    score += spo2_score
    max_vital_score = max(max_vital_score, spo2_score)
    details["spo2"] = {"score": spo2_score, "status": spo2_status}

    # 3. Systolic Blood Pressure (mmHg)
    sbp_score = 0
    sbp_status = "Normal"
    if sbp < 90:
        sbp_score = 3
        sbp_status = "Severe Hypotension"
        findings.append(f"Systolic BP is critically low at {sbp:.0f} mmHg (Hypotension, Normal: 100-140 mmHg)")
    elif 90 <= sbp <= 99:
        sbp_score = 1
        sbp_status = "Borderline Low"
        findings.append(f"Systolic BP is borderline low at {sbp:.0f} mmHg (Normal: 100-140 mmHg)")
    elif 100 <= sbp <= 140:
        sbp_score = 0
        sbp_status = "Normal"
    elif 141 <= sbp <= 159:
        sbp_score = 1
        sbp_status = "Stage 1 Hypertension"
        findings.append(f"Systolic BP is elevated at {sbp:.0f} mmHg (Stage 1 Hypertension, Normal: 100-140 mmHg)")
    elif 160 <= sbp <= 179:
        sbp_score = 2
        sbp_status = "Stage 2 Hypertension"
        findings.append(f"Systolic BP is high at {sbp:.0f} mmHg (Stage 2 Hypertension, Normal: 100-140 mmHg)")
    else:  # >= 180
        sbp_score = 3
        sbp_status = "Hypertensive Crisis"
        findings.append(f"Systolic BP is in crisis range at {sbp:.0f} mmHg (Hypertensive Crisis, Normal: 100-140 mmHg)")
    score += sbp_score
    max_vital_score = max(max_vital_score, sbp_score)
    details["systolic_bp"] = {"score": sbp_score, "status": sbp_status}

    # 4. Diastolic Blood Pressure (mmHg)
    dbp_score = 0
    dbp_status = "Normal"
    if dbp < 50:
        dbp_score = 2
        dbp_status = "Severe Low"
        findings.append(f"Diastolic BP is very low at {dbp:.0f} mmHg (Normal: 60-90 mmHg)")
    elif 50 <= dbp <= 59:
        dbp_score = 1
        dbp_status = "Borderline Low"
    elif 60 <= dbp <= 90:
        dbp_score = 0
        dbp_status = "Normal"
    elif 91 <= dbp <= 100:
        dbp_score = 1
        dbp_status = "Elevated"
        findings.append(f"Diastolic BP is elevated at {dbp:.0f} mmHg (Normal: 60-90 mmHg)")
    else:  # > 100
        dbp_score = 2
        dbp_status = "Very High"
        findings.append(f"Diastolic BP is dangerously high at {dbp:.0f} mmHg (Normal: 60-90 mmHg)")
    score += dbp_score
    max_vital_score = max(max_vital_score, dbp_score)
    details["diastolic_bp"] = {"score": dbp_score, "status": dbp_status}

    # 5. Temperature (°C)
    temp_score = 0
    temp_status = "Normal"
    if temp <= 35.0:
        temp_score = 3
        temp_status = "Severe Hypothermia"
        findings.append(f"Body Temperature is critically low at {temp:.1f}°C (Hypothermia, Normal: 36.1-37.5°C)")
    elif 35.1 <= temp <= 36.0:
        temp_score = 1
        temp_status = "Mild Hypothermia"
        findings.append(f"Body Temperature is subnormal at {temp:.1f}°C (Normal: 36.1-37.5°C)")
    elif 36.1 <= temp <= 37.5:
        temp_score = 0
        temp_status = "Normal"
    elif 37.6 <= temp <= 38.4:
        temp_score = 1
        temp_status = "Low-grade Fever"
        findings.append(f"Body Temperature is slightly elevated at {temp:.1f}°C (Low-grade Fever, Normal: 36.1-37.5°C)")
    elif 38.5 <= temp <= 39.0:
        temp_score = 2
        temp_status = "Moderate Pyrexia"
        findings.append(f"Body Temperature indicates fever at {temp:.1f}°C (Pyrexia, Normal: 36.1-37.5°C)")
    else:  # > 39.0
        temp_score = 3
        temp_status = "High Pyrexia"
        findings.append(f"Body Temperature is dangerously high at {temp:.1f}°C (High Fever, Normal: 36.1-37.5°C)")
    score += temp_score
    max_vital_score = max(max_vital_score, temp_score)
    details["temperature"] = {"score": temp_score, "status": temp_status}

    # 6. Respiratory Rate (breaths/min)
    resp_score = 0
    resp_status = "Normal"
    if resp <= 8:
        resp_score = 3
        resp_status = "Severe Bradypnea"
        findings.append(f"Respiratory Rate is dangerously low at {resp:.0f} breaths/min (Bradypnea, Normal: 12-20)")
    elif 9 <= resp <= 11:
        resp_score = 1
        resp_status = "Mild Bradypnea"
        findings.append(f"Respiratory Rate is low at {resp:.0f} breaths/min (Normal: 12-20)")
    elif 12 <= resp <= 20:
        resp_score = 0
        resp_status = "Normal"
    elif 21 <= resp <= 24:
        resp_score = 2
        resp_status = "Tachypnea"
        findings.append(f"Respiratory Rate is elevated at {resp:.0f} breaths/min (Tachypnea, Normal: 12-20)")
    else:  # >= 25
        resp_score = 3
        resp_status = "Severe Tachypnea"
        findings.append(f"Respiratory Rate is critically high at {resp:.0f} breaths/min (Severe Tachypnea, Normal: 12-20)")
    score += resp_score
    max_vital_score = max(max_vital_score, resp_score)
    details["respiratory_rate"] = {"score": resp_score, "status": resp_status}

    # 7. Glucose (optional, mg/dL)
    if glucose is not None and glucose > 0:
        gluc_score = 0
        gluc_status = "Normal"
        if glucose < 60:
            gluc_score = 3
            gluc_status = "Hypoglycemia"
            findings.append(f"Blood Glucose is critically low at {glucose:.0f} mg/dL (Hypoglycemia, Normal: 70-140 mg/dL)")
        elif 60 <= glucose <= 69:
            gluc_score = 1
            gluc_status = "Borderline Low"
            findings.append(f"Blood Glucose is borderline low at {glucose:.0f} mg/dL (Normal: 70-140 mg/dL)")
        elif 70 <= glucose <= 140:
            gluc_score = 0
            gluc_status = "Normal"
        elif 141 <= glucose <= 199:
            gluc_score = 1
            gluc_status = "Elevated"
            findings.append(f"Blood Glucose is elevated at {glucose:.0f} mg/dL (Normal: 70-140 mg/dL)")
        else:  # >= 200
            gluc_score = 2
            gluc_status = "Hyperglycemia"
            findings.append(f"Blood Glucose is high at {glucose:.0f} mg/dL (Hyperglycemia, Normal: 70-140 mg/dL)")
        score += gluc_score
        max_vital_score = max(max_vital_score, gluc_score)
        details["glucose"] = {"score": gluc_score, "status": gluc_status}

    return score, max_vital_score, findings, details


def generate_explanation(risk_level, findings):
    """
    Produces a clean, human-readable plain-English explanation.
    """
    if risk_level == "NORMAL":
        if findings:
            return "All vital signs are in stable condition with minor physiological variations: " + "; ".join(findings) + "."
        return "All monitored vital signs are currently within standard healthy clinical ranges. No immediate intervention required."

    severity_prefix = "CRITICAL ALERT: Immediate medical review strongly advised. " if risk_level == "CRITICAL" else "WARNING: Elevated clinical risk detected. "
    
    if findings:
        details_str = "; ".join(findings)
        return f"{severity_prefix}Abnormal vital signs identified: {details_str}."
    else:
        return f"{severity_prefix}Composite clinical score indicates borderline vital stability."


def analyze_vitals(heart_rate, spo2, systolic_bp, diastolic_bp, temperature, respiratory_rate, glucose=None, model_path=None):
    """
    Executes dual-layer risk evaluation:
    1. NEWS2 rule engine
    2. scikit-learn RandomForestClassifier
    Returns dict with risk_level, risk_score (0-100), ai_explanation, rule_score, and ml_confidence.
    """
    rule_score, max_vital_score, findings, details = evaluate_news2_rules(
        heart_rate, spo2, systolic_bp, diastolic_bp, temperature, respiratory_rate, glucose
    )

    # Base risk level from rule engine
    if rule_score >= 6 or max_vital_score >= 3:
        if rule_score >= 5 or max_vital_score == 3 and (spo2 <= 91 or heart_rate >= 130 or systolic_bp < 90 or respiratory_rate >= 25 or temperature >= 39.0):
            rule_level = "CRITICAL"
        else:
            rule_level = "WARNING"
    elif rule_score >= 2 or max_vital_score >= 1:
        rule_level = "WARNING"
    else:
        rule_level = "NORMAL"

    # ML Inference (RandomForest)
    model = get_ml_model(model_path)
    ml_level = rule_level
    ml_risk_prob = 0.1

    if model is not None:
        try:
            # Impute missing glucose with standard 100 mg/dL
            gluc_val = float(glucose) if (glucose is not None and glucose > 0) else 100.0
            features = np.array([[
                float(heart_rate),
                float(spo2),
                float(systolic_bp),
                float(diastolic_bp),
                float(temperature),
                float(respiratory_rate),
                gluc_val
            ]])

            pred_class = model.predict(features)[0]
            # Mapping: 0: NORMAL, 1: WARNING, 2: CRITICAL
            class_map = {0: "NORMAL", 1: "WARNING", 2: "CRITICAL"}
            ml_level = class_map.get(pred_class, "NORMAL")

            if hasattr(model, "predict_proba"):
                probs = model.predict_proba(features)[0]
                # Combined risk probability: warning prob * 0.5 + critical prob * 1.0
                # Assuming classes order [0, 1, 2]
                classes = list(model.classes_)
                p_norm = probs[classes.index(0)] if 0 in classes else 0.5
                p_warn = probs[classes.index(1)] if 1 in classes else 0.3
                p_crit = probs[classes.index(2)] if 2 in classes else 0.2
                ml_risk_prob = float(p_warn * 0.5 + p_crit * 1.0)
        except Exception as e:
            print(f"[AI Engine] ML prediction error: {e}")

    # Combine Rule Engine + ML Model (Clinical safety net: prioritize higher severity)
    severity_order = {"NORMAL": 0, "WARNING": 1, "CRITICAL": 2}
    final_severity = max(severity_order.get(rule_level, 0), severity_order.get(ml_level, 0))
    inv_severity = {0: "NORMAL", 1: "WARNING", 2: "CRITICAL"}
    final_risk_level = inv_severity[final_severity]

    # Calculate unified risk score (0 - 100)
    # Scaled continuous score combining rule points (max ~20) + ML probability
    rule_component = min(100.0, (rule_score / 12.0) * 80.0)
    ml_component = ml_risk_prob * 100.0
    unified_score = 0.5 * rule_component + 0.5 * ml_component

    if final_risk_level == "CRITICAL":
        unified_score = max(unified_score, 72.0)
    elif final_risk_level == "WARNING":
        unified_score = max(min(unified_score, 70.0), 32.0)
    else:
        unified_score = min(unified_score, 25.0)

    ai_explanation = generate_explanation(final_risk_level, findings)

    return {
        "risk_level": final_risk_level,
        "risk_score": round(float(unified_score), 1),
        "ai_explanation": ai_explanation,
        "rule_score": int(rule_score),
        "findings": findings,
        "vital_details": details
    }
