"""
Early Warning Alerts Blueprint (Feature #6)
Provides real-time disease early warning surveillance, dynamic risk-level categorization,
ASHA worker assignment, and status resolution workflows.
"""

import json
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from app.models import db, Alert

alerts_bp = Blueprint("alerts", __name__, url_prefix="/api")


def determine_alert_level(score: float) -> str:
    """
    Map risk score (0-100) to standardized alert level.
    0-24   -> NORMAL (green)
    25-49  -> WATCH (yellow)
    50-74  -> ELEVATED (orange)
    75-100 -> CRITICAL (red)
    """
    try:
        s = float(score)
    except (ValueError, TypeError):
        s = 0.0

    if s >= 75:
        return "CRITICAL"
    elif s >= 50:
        return "ELEVATED"
    elif s >= 25:
        return "WATCH"
    else:
        return "NORMAL"


def determine_recommended_action(level: str) -> str:
    """
    Derive standard actionable medical and sanitation protocols based on alert level.
    """
    lvl = (level or "").strip().upper()
    if lvl in ("CRITICAL", "ELEVATED"):
        return "Inspect primary water source and conduct community awareness"
    elif lvl == "WATCH":
        return "Monitor closely and re-test water"
    else:
        return "No action needed"


@alerts_bp.route("/alerts", methods=["POST"])
def create_alert():
    """
    POST /api/alerts
    Creates a new Early Warning Alert.
    Accepts JSON:
      {
        "village": "Lakhipur",
        "riskScore": 82,
        "reasons": ["8 diarrhea cases reported", "Water contamination detected", "Cases increased by 40% this week"],
        "assignedTo": "Sunita Devi" (optional)
      }
    """
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    village = str(data.get("village", "")).strip()
    if not village:
        return jsonify({"error": "Missing required field: 'village'."}), 400

    # Risk score can be passed as riskScore or risk_score
    raw_score = data.get("riskScore")
    if raw_score is None:
        raw_score = data.get("risk_score")
    if raw_score is None:
        return jsonify({"error": "Missing required field: 'riskScore'."}), 400

    try:
        risk_score = float(raw_score)
        if not (0 <= risk_score <= 100):
            return jsonify({"error": "'riskScore' must be between 0 and 100."}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "'riskScore' must be a valid number between 0 and 100."}), 400

    # Parse reasons list
    raw_reasons = data.get("reasons", [])
    if isinstance(raw_reasons, list):
        reasons_list = [str(r).strip() for r in raw_reasons if str(r).strip()]
    elif isinstance(raw_reasons, str) and raw_reasons.strip():
        reasons_list = [raw_reasons.strip()]
    else:
        reasons_list = [f"Elevated risk indicators observed for {village}"]

    # Auto-derive level & recommended action
    level = determine_alert_level(risk_score)
    recommended_action = determine_recommended_action(level)

    assigned_to = data.get("assignedTo") or data.get("assigned_to")
    if assigned_to:
        assigned_to = str(assigned_to).strip()

    status = (data.get("status") or "active").strip().lower()
    if status not in ("active", "resolved"):
        status = "active"

    from app.models import User
    default_user = User.query.first()
    system_user_id = default_user.id if default_user else 1

    now = datetime.now(timezone.utc)
    new_alert = Alert(
        user_id=system_user_id,
        village=village,
        level=level,
        severity=level,
        risk_score=risk_score,
        reasons=json.dumps(reasons_list),
        message="; ".join(reasons_list),
        recommended_action=recommended_action,
        assigned_to=assigned_to,
        status=status,
        acknowledged=(status == "resolved"),
        created_at=now
    )

    db.session.add(new_alert)
    db.session.commit()

    return jsonify({
        "message": "Alert created successfully",
        "alert": new_alert.to_dict()
    }), 201


@alerts_bp.route("/alerts", methods=["GET"])
def get_alerts():
    """
    GET /api/alerts
    Returns all early warning alerts, ordered newest and highest level first.
    Optional query parameters:
      - status: "active", "resolved", "all"
      - level: "CRITICAL", "ELEVATED", "WATCH", "NORMAL", "all"
    """
    status_filter = request.args.get("status", "all").strip().lower()
    level_filter = request.args.get("level", "all").strip().upper()

    query = Alert.query

    # Status filter
    if status_filter in ("active", "unacknowledged"):
        query = query.filter((Alert.status == "active") | (Alert.acknowledged == False))
    elif status_filter in ("resolved", "acknowledged"):
        query = query.filter((Alert.status == "resolved") | (Alert.acknowledged == True))

    # Level filter
    if level_filter and level_filter != "ALL":
        query = query.filter((Alert.level == level_filter) | (Alert.severity == level_filter))

    raw_alerts = query.all()

    # Priority ordering: Highest level first (CRITICAL -> ELEVATED -> WATCH -> NORMAL), then newest first
    level_ranks = {"CRITICAL": 0, "ELEVATED": 1, "WATCH": 2, "NORMAL": 3}

    sorted_alerts = sorted(
        raw_alerts,
        key=lambda a: (
            level_ranks.get((a.level or a.severity or "").upper(), 4),
            -(a.created_at.replace(tzinfo=timezone.utc).timestamp() if a.created_at else 0)
        )
    )

    # Count active/unacknowledged
    active_count = Alert.query.filter(
        (Alert.status == "active") | (Alert.acknowledged == False)
    ).count()

    return jsonify({
        "alerts": [a.to_dict() for a in sorted_alerts],
        "count": len(sorted_alerts),
        "unacknowledged_count": active_count
    }), 200


@alerts_bp.route("/alerts/<int:alert_id>/resolve", methods=["PUT", "POST"])
def resolve_alert(alert_id):
    """
    PUT /api/alerts/{id}/resolve
    Marks an early warning alert as resolved.
    """
    alert = db.session.get(Alert, alert_id) if hasattr(db.session, "get") else Alert.query.get(alert_id)
    if not alert:
        return jsonify({"error": "Alert not found"}), 404

    alert.status = "resolved"
    alert.acknowledged = True
    db.session.commit()

    return jsonify({
        "message": f"Alert #{alert_id} for {alert.village or 'village'} marked as resolved",
        "alert": alert.to_dict()
    }), 200


@alerts_bp.route("/alerts/<int:alert_id>/assign", methods=["PUT", "POST"])
def assign_alert(alert_id):
    """
    PUT /api/alerts/{id}/assign
    Assigns an ASHA worker to the specified alert.
    Accepts JSON:
      { "assignedTo": "Sunita Devi" }
    """
    alert = db.session.get(Alert, alert_id) if hasattr(db.session, "get") else Alert.query.get(alert_id)
    if not alert:
        return jsonify({"error": "Alert not found"}), 404

    data = request.get_json(silent=True) or {}
    asha_name = data.get("assignedTo") or data.get("assigned_to") or data.get("asha") or data.get("name")
    if not asha_name or not str(asha_name).strip():
        return jsonify({"error": "ASHA worker name is required in 'assignedTo'."}), 400

    alert.assigned_to = str(asha_name).strip()
    db.session.commit()

    return jsonify({
        "message": f"Alert #{alert_id} successfully assigned to {alert.assigned_to}",
        "alert": alert.to_dict()
    }), 200


@alerts_bp.route("/alerts/<int:alert_id>/acknowledge", methods=["POST"])
def acknowledge_legacy_alert(alert_id):
    """
    Legacy backwards compatibility endpoint for older clinical vitals acknowledgment.
    """
    return resolve_alert(alert_id)


def ensure_alert_columns(app):
    """
    Ensure newly added columns exist in SQLite/MySQL tables without breaking existing databases.
    """
    with app.app_context():
        try:
            engine = db.engine
            if engine.name == "sqlite":
                with engine.connect() as conn:
                    table_info = conn.execute(db.text("PRAGMA table_info(alerts)")).fetchall()
                    existing_cols = {col[1] for col in table_info}

                    columns_to_add = [
                        ("village", "VARCHAR(120)"),
                        ("level", "VARCHAR(20)"),
                        ("risk_score", "FLOAT"),
                        ("reasons", "TEXT"),
                        ("recommended_action", "TEXT"),
                        ("assigned_to", "VARCHAR(120)"),
                        ("status", "VARCHAR(20) DEFAULT 'active'")
                    ]
                    for col_name, col_type in columns_to_add:
                        if col_name not in existing_cols:
                            conn.execute(db.text(f"ALTER TABLE alerts ADD COLUMN {col_name} {col_type}"))
                    conn.commit()
        except Exception as e:
            print(f"[VitalWatch] Column verification notice: {e}")


def seed_sample_alerts(app):
    """
    Seed 4-5 sample alerts so the UI is never empty.
    E.g. Lakhipur CRITICAL 82% with realistic reasons and actions.
    """
    ensure_alert_columns(app)

    with app.app_context():
        try:
            # Check if any early warning alerts already have a village assigned
            existing_count = Alert.query.filter(Alert.village.isnot(None)).count()
            if existing_count > 0:
                return

            sample_data = [
                {
                    "village": "Lakhipur",
                    "risk_score": 82,
                    "reasons": [
                        "8 diarrhea cases reported",
                        "Water contamination detected",
                        "Cases increased by 40% this week"
                    ],
                    "assigned_to": None,
                    "status": "active"
                },
                {
                    "village": "Hodka",
                    "risk_score": 68,
                    "reasons": [
                        "High turbidity recorded in community well",
                        "5 fever & vomiting cases filed",
                        "Heavy monsoon runoff detected"
                    ],
                    "assigned_to": "Pooja Sharma (ASHA)",
                    "status": "active"
                },
                {
                    "village": "Dhordo",
                    "risk_score": 42,
                    "reasons": [
                        "Borderline chlorine level detected",
                        "2 mild gastrointestinal complaints"
                    ],
                    "assigned_to": None,
                    "status": "active"
                },
                {
                    "village": "Nirona",
                    "risk_score": 18,
                    "reasons": [
                        "All water sources tested clean",
                        "Zero symptomatic cases reported this week"
                    ],
                    "assigned_to": "Sunita Patel (ASHA)",
                    "status": "active"
                },
                {
                    "village": "Poshina",
                    "risk_score": 78,
                    "reasons": [
                        "Severe bacterial coliform detected in handpump #3",
                        "Cluster of 6 acute jaundice cases",
                        "Sanitation advisory pending"
                    ],
                    "assigned_to": None,
                    "status": "active"
                }
            ]

            from app.models import User
            default_user = User.query.first()
            system_user_id = default_user.id if default_user else 1

            now = datetime.now(timezone.utc)
            for item in sample_data:
                lvl = determine_alert_level(item["risk_score"])
                rec = determine_recommended_action(lvl)
                alert = Alert(
                    user_id=system_user_id,
                    village=item["village"],
                    risk_score=item["risk_score"],
                    level=lvl,
                    severity=lvl,
                    reasons=json.dumps(item["reasons"]),
                    message="; ".join(item["reasons"]),
                    recommended_action=rec,
                    assigned_to=item["assigned_to"],
                    status=item["status"],
                    acknowledged=(item["status"] == "resolved"),
                    created_at=now
                )
                db.session.add(alert)

            db.session.commit()
            print("[VitalWatch] Seeded 5 sample early warning alerts successfully.")
        except Exception as e:
            db.session.rollback()
            print(f"[VitalWatch] Notice during alert seeding: {e}")
