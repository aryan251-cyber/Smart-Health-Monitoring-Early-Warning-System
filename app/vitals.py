from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, current_app
from app.models import db, VitalRecord, Alert
from app.auth import token_required
from app.ai_engine import analyze_vitals

vitals_bp = Blueprint("vitals", __name__, url_prefix="/api")


@vitals_bp.route("/vitals", methods=["POST"])
@token_required
def log_vital(current_user):
    data = request.get_json() or {}

    try:
        heart_rate = float(data.get("heart_rate"))
        spo2 = float(data.get("spo2"))
        systolic_bp = float(data.get("systolic_bp"))
        diastolic_bp = float(data.get("diastolic_bp"))
        temperature = float(data.get("temperature"))
        respiratory_rate = float(data.get("respiratory_rate"))
        
        glucose = data.get("glucose")
        glucose = float(glucose) if glucose not in [None, "", "null"] else None
    except (ValueError, TypeError) as e:
        return jsonify({"error": "Invalid numerical vital sign input. Please ensure all required fields are valid numbers."}), 400

    # Basic physiological sanity checks
    if not (20 <= heart_rate <= 260):
        return jsonify({"error": "Heart rate must be between 20 and 260 bpm."}), 400
    if not (50 <= spo2 <= 100):
        return jsonify({"error": "SpO2 must be between 50% and 100%."}), 400
    if not (40 <= systolic_bp <= 300):
        return jsonify({"error": "Systolic BP must be between 40 and 300 mmHg."}), 400
    if not (20 <= diastolic_bp <= 200):
        return jsonify({"error": "Diastolic BP must be between 20 and 200 mmHg."}), 400
    if not (28.0 <= temperature <= 45.0):
        return jsonify({"error": "Temperature must be between 28.0°C and 45.0°C."}), 400
    if not (4 <= respiratory_rate <= 60):
        return jsonify({"error": "Respiratory rate must be between 4 and 60 breaths/min."}), 400
    if glucose is not None and not (10 <= glucose <= 600):
        return jsonify({"error": "Glucose must be between 10 and 600 mg/dL if provided."}), 400

    # Run AI evaluation (NEWS2 rules + ML inference)
    model_path = current_app.config.get("MODEL_PATH")
    eval_result = analyze_vitals(
        heart_rate=heart_rate,
        spo2=spo2,
        systolic_bp=systolic_bp,
        diastolic_bp=diastolic_bp,
        temperature=temperature,
        respiratory_rate=respiratory_rate,
        glucose=glucose,
        model_path=model_path
    )

    now = datetime.now(timezone.utc)
    vital_record = VitalRecord(
        user_id=current_user.id,
        heart_rate=heart_rate,
        spo2=spo2,
        systolic_bp=systolic_bp,
        diastolic_bp=diastolic_bp,
        temperature=temperature,
        respiratory_rate=respiratory_rate,
        glucose=glucose,
        recorded_at=now,
        risk_level=eval_result["risk_level"],
        risk_score=eval_result["risk_score"],
        ai_explanation=eval_result["ai_explanation"]
    )
    db.session.add(vital_record)
    db.session.flush()  # to obtain vital_record.id

    alert_created = None
    # Any WARNING or CRITICAL reading automatically creates a row in alerts
    if eval_result["risk_level"] in ["WARNING", "CRITICAL"]:
        import json
        alert_level = "CRITICAL" if eval_result["risk_level"] == "CRITICAL" else "ELEVATED"
        alert = Alert(
            user_id=current_user.id,
            vital_record_id=vital_record.id,
            severity=eval_result["risk_level"],
            level=alert_level,
            village="Clinical Vitals",
            risk_score=eval_result["risk_score"],
            reasons=json.dumps([eval_result["ai_explanation"]]),
            recommended_action="Inspect primary water source and conduct community awareness",
            status="active",
            message=eval_result["ai_explanation"],
            acknowledged=False,
            created_at=now
        )
        db.session.add(alert)
        db.session.flush()
        alert_created = alert.to_dict()

    db.session.commit()

    return jsonify({
        "message": "Vital signs recorded and evaluated successfully",
        "record": vital_record.to_dict(),
        "evaluation": eval_result,
        "alert": alert_created
    }), 201


@vitals_bp.route("/vitals/history", methods=["GET"])
@token_required
def get_vitals_history(current_user):
    limit = request.args.get("limit", 50, type=int)
    records = VitalRecord.query.filter_by(user_id=current_user.id)\
        .order_by(VitalRecord.recorded_at.desc())\
        .limit(limit)\
        .all()

    return jsonify({
        "records": [r.to_dict() for r in records],
        "count": len(records)
    }), 200


@vitals_bp.route("/vitals/dashboard", methods=["GET"])
@token_required
def get_dashboard_data(current_user):
    # Latest reading
    latest = VitalRecord.query.filter_by(user_id=current_user.id)\
        .order_by(VitalRecord.recorded_at.desc())\
        .first()

    # Trend readings (chronological order for line charts)
    recent = VitalRecord.query.filter_by(user_id=current_user.id)\
        .order_by(VitalRecord.recorded_at.desc())\
        .limit(20)\
        .all()
    trend_readings = [r.to_dict() for r in reversed(recent)]

    # Alerts summary
    unack_count = Alert.query.filter_by(user_id=current_user.id, acknowledged=False).count()
    recent_alerts = Alert.query.filter_by(user_id=current_user.id)\
        .order_by(Alert.created_at.desc())\
        .limit(5)\
        .all()

    total_records = VitalRecord.query.filter_by(user_id=current_user.id).count()

    return jsonify({
        "user": current_user.to_dict(),
        "latest_reading": latest.to_dict() if latest else None,
        "current_risk": latest.risk_level if latest else "NORMAL",
        "current_risk_score": latest.risk_score if latest else 0.0,
        "latest_explanation": latest.ai_explanation if latest else "No vitals logged yet. Submit your first reading to initiate AI monitoring.",
        "trend_readings": trend_readings,
        "unacknowledged_alerts_count": unack_count,
        "recent_alerts": [a.to_dict() for a in recent_alerts],
        "total_records": total_records
    }), 200

