"""
ASHA Worker blueprint
Routes:
  /asha/dashboard       - dashboard page (HTML)
  /asha/villages        - village risk page (HTML)
  /asha/stub/<action>   - "coming soon" stub pages (HTML)
  /api/asha/dashboard   - JSON stats for the dashboard cards
  /api/asha/villages    - JSON list of assigned villages
  /api/asha/profile     - JSON worker profile
"""

import bcrypt
from datetime import datetime, timezone
from functools import wraps

from flask import Blueprint, jsonify, render_template, redirect, url_for, request
from app.models import db, User, AshaWorker, Village, Alert, VitalRecord, PatientReport, SymptomReport, WaterReport
from app.auth import token_required

asha_bp = Blueprint("asha", __name__, url_prefix="")


# ---------------------------------------------------------------------------
# Shared alert service — derives alerts from villages, water_reports,
# symptom_reports (no separate alert table needed).
# ---------------------------------------------------------------------------

def _time_ago(dt):
    """Return a human-readable relative time string (e.g. '2 hours ago')."""
    if dt is None:
        return "Unknown"
    # Ensure dt is offset-aware for comparison
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    diff = int((now - dt).total_seconds())
    if diff < 60:
        return "Just now"
    if diff < 3600:
        m = diff // 60
        return f"{m} minute{'s' if m != 1 else ''} ago"
    if diff < 86400:
        h = diff // 3600
        return f"{h} hour{'s' if h != 1 else ''} ago"
    d = diff // 86400
    return f"{d} day{'s' if d != 1 else ''} ago"


def build_alerts(worker):
    """
    Derive active alerts for an ASHA worker from three sources:
      1. Assigned villages with risk_level == HIGH
      2. WaterReports with severity == HIGH
      3. SymptomReports with severity == SEVERE
    Returns a list of dicts sorted newest-first.
    """
    alerts = []

    # 1. High-risk villages (no timestamp — use epoch 0 so they sort last)
    high_villages = Village.query.filter_by(
        asha_worker_id=worker.id, risk_level="HIGH"
    ).all()
    for v in high_villages:
        alerts.append({
            "type":      "VILLAGE_RISK",
            "title":     f"High-risk village: {v.name}",
            "village":   v.name,
            "severity":  "HIGH",
            "timestamp": None,          # static — no reported_at on villages
            "time_ago":  "Ongoing",
            "_sort_key": 0,
        })

    # 2. High-severity water reports
    high_water = WaterReport.query.filter_by(
        asha_worker_id=worker.id, severity="HIGH"
    ).order_by(WaterReport.reported_at.desc()).all()
    for w in high_water:
        ts = w.reported_at
        alerts.append({
            "type":      "WATER",
            "title":     f"Water contamination: {w.village.name if w.village else 'Unknown'}",
            "village":   w.village.name if w.village else "Unknown",
            "severity":  "HIGH",
            "timestamp": ts.isoformat() if ts else None,
            "time_ago":  _time_ago(ts),
            "_sort_key": ts.timestamp() if ts else 0,
        })

    # 3. Severe symptom reports
    severe_symptoms = SymptomReport.query.filter_by(
        asha_worker_id=worker.id, severity="SEVERE"
    ).order_by(SymptomReport.reported_at.desc()).all()
    for s in severe_symptoms:
        ts = s.reported_at
        alerts.append({
            "type":      "SYMPTOM",
            "title":     f"Severe symptoms reported: {s.village.name if s.village else 'Unknown'}",
            "village":   s.village.name if s.village else "Unknown",
            "severity":  "HIGH",
            "timestamp": ts.isoformat() if ts else None,
            "time_ago":  _time_ago(ts),
            "_sort_key": ts.timestamp() if ts else 0,
        })

    # Sort: timed entries newest-first, then static village-risk entries
    alerts.sort(key=lambda a: a["_sort_key"], reverse=True)
    # Strip internal sort key before returning
    for a in alerts:
        del a["_sort_key"]
    return alerts


# ---------------------------------------------------------------------------
# Helper: require ASHA_WORKER role (API decorator)
# ---------------------------------------------------------------------------
def asha_required(f):
    @wraps(f)
    @token_required
    def decorated(current_user, *args, **kwargs):
        if current_user.role != "ASHA_WORKER":
            return jsonify({"error": "Access denied. ASHA_WORKER role required."}), 403
        return f(current_user=current_user, *args, **kwargs)
    return decorated


# ---------------------------------------------------------------------------
# HTML page routes (served as separate pages)
# ---------------------------------------------------------------------------

@asha_bp.route("/asha/dashboard")
def asha_dashboard_page():
    """Serve the ASHA dashboard HTML (auth is handled client-side via JWT)."""
    return render_template("asha_dashboard.html")


@asha_bp.route("/asha/profile")
def asha_profile_page():
    """Serve the ASHA worker profile page."""
    return render_template("asha_profile.html")


@asha_bp.route("/asha/villages")
def asha_villages_page():
    """Serve the village risk listing page."""
    return render_template("asha_villages.html")



# ---------------------------------------------------------------------------
# Report Patient — real form (replaces the coming-soon stub)
# ---------------------------------------------------------------------------

@asha_bp.route("/asha/report-patient", methods=["GET"])
def report_patient_page():
    """Show the Report Patient form (auth handled client-side via JWT)."""
    return render_template("asha_report_patient.html")


@asha_bp.route("/api/asha/report-patient", methods=["POST"])
@asha_required
def submit_patient_report(current_user):
    """
    Save a new patient report.
    Accepts JSON: { patient_name, age, gender, village_id, symptoms, risk_level }
    Returns JSON success or validation error.
    """
    worker = current_user.asha_profile
    if not worker:
        return jsonify({"error": "ASHA profile not found"}), 404

    data = request.get_json() or {}
    errors = {}

    # ── Validate required fields ──────────────────────────────────────────
    patient_name = (data.get("patient_name") or "").strip()
    if not patient_name:
        errors["patient_name"] = "Patient name is required."

    age_raw = data.get("age")
    age = None
    try:
        age = int(age_raw)
        if age <= 0 or age > 150:
            errors["age"] = "Enter a valid age between 1 and 150."
    except (TypeError, ValueError):
        errors["age"] = "Age must be a number."

    gender = (data.get("gender") or "").strip()
    if gender not in ("Male", "Female", "Other"):
        errors["gender"] = "Select a valid gender."

    village_id_raw = data.get("village_id")
    village_id = None
    try:
        village_id = int(village_id_raw)
        # Must belong to this worker
        village = Village.query.filter_by(id=village_id, asha_worker_id=worker.id).first()
        if not village:
            errors["village_id"] = "Select a valid assigned village."
    except (TypeError, ValueError):
        errors["village_id"] = "Village is required."

    symptoms = (data.get("symptoms") or "").strip()
    if not symptoms:
        errors["symptoms"] = "Describe at least one symptom."

    risk_level = (data.get("risk_level") or "LOW").strip().upper()
    if risk_level not in ("LOW", "MEDIUM", "HIGH"):
        risk_level = "LOW"

    if errors:
        return jsonify({"errors": errors}), 422

    # ── Save report ───────────────────────────────────────────────────────
    report = PatientReport(
        asha_worker_id=worker.id,
        village_id=village_id,
        patient_name=patient_name,
        age=age,
        gender=gender,
        symptoms=symptoms,
        risk_level=risk_level,
    )
    db.session.add(report)
    db.session.commit()

    return jsonify({"message": "Report saved successfully.", "id": report.id}), 201


# ---------------------------------------------------------------------------
# Report Symptoms — real form (replaces the coming-soon stub)
# ---------------------------------------------------------------------------

VALID_SYMPTOMS = {"Fever", "Cough", "Diarrhea", "Vomiting", "Rash",
                  "Body Ache", "Breathlessness", "Other"}
VALID_SEVERITY = {"MILD", "MODERATE", "SEVERE"}


@asha_bp.route("/asha/report-symptoms", methods=["GET"])
def report_symptoms_page():
    """Show the Report Symptoms form (auth handled client-side via JWT)."""
    return render_template("asha_report_symptoms.html")


@asha_bp.route("/api/asha/report-symptoms", methods=["POST"])
@asha_required
def submit_symptom_report(current_user):
    """
    Save a new symptom report.
    Accepts JSON: { patient_name, age, village_id, symptoms (list), severity, notes }
    Returns JSON success or validation error.
    """
    worker = current_user.asha_profile
    if not worker:
        return jsonify({"error": "ASHA profile not found"}), 404

    data = request.get_json() or {}
    errors = {}

    # ── Validate ───────────────────────────────────────────────────────
    patient_name = (data.get("patient_name") or "").strip()
    if not patient_name:
        errors["patient_name"] = "Patient name is required."

    age_raw = data.get("age")
    age = None
    try:
        age = int(age_raw)
        if age <= 0 or age > 150:
            errors["age"] = "Enter a valid age between 1 and 150."
    except (TypeError, ValueError):
        errors["age"] = "Age must be a number."

    village_id_raw = data.get("village_id")
    village_id = None
    try:
        village_id = int(village_id_raw)
        village = Village.query.filter_by(id=village_id, asha_worker_id=worker.id).first()
        if not village:
            errors["village_id"] = "Select a valid assigned village."
    except (TypeError, ValueError):
        errors["village_id"] = "Village is required."

    # symptoms comes as a list from the client
    raw_symptoms = data.get("symptoms") or []
    if isinstance(raw_symptoms, str):
        raw_symptoms = [raw_symptoms]
    selected = [s.strip() for s in raw_symptoms if s.strip() in VALID_SYMPTOMS]
    if not selected:
        errors["symptoms"] = "Select at least one symptom."

    severity = (data.get("severity") or "").strip().upper()
    if severity not in VALID_SEVERITY:
        errors["severity"] = "Select a valid severity."

    if errors:
        return jsonify({"errors": errors}), 422

    # ── Save ────────────────────────────────────────────────────────────
    symptom_report = SymptomReport(
        asha_worker_id=worker.id,
        village_id=village_id,
        patient_name=patient_name,
        age=age,
        symptoms=",".join(selected),
        severity=severity,
        notes=(data.get("notes") or "").strip() or None,
    )
    db.session.add(symptom_report)
    db.session.commit()

    return jsonify({"message": "Symptom report saved.", "id": symptom_report.id}), 201


# ---------------------------------------------------------------------------
# Report Water Problem — real form (replaces the coming-soon stub)
# ---------------------------------------------------------------------------

VALID_WATER_SOURCE  = {"HANDPUMP", "WELL", "TAP", "POND", "RIVER", "OTHER"}
VALID_CONTAMINATION = {"TURBID", "FOUL_SMELL", "DISCOLORED", "CHEMICAL", "UNKNOWN"}
VALID_SEVERITY      = {"LOW", "MEDIUM", "HIGH"}


@asha_bp.route("/asha/report-water", methods=["GET"])
def report_water_page():
    """Show the Report Water Problem form."""
    return render_template("asha_report_water.html")


@asha_bp.route("/api/asha/report-water", methods=["POST"])
@asha_required
def submit_water_report(current_user):
    """
    Save a new water report.
    Accepts JSON: { village_id, water_source_type, contamination_type,
                    affected_households, severity, notes }
    Returns JSON success or validation error.
    """
    worker = current_user.asha_profile
    if not worker:
        return jsonify({"error": "ASHA profile not found"}), 404

    data   = request.get_json() or {}
    errors = {}

    # ── Validate village (must belong to this worker) ────────────────────
    village_id_raw = data.get("village_id")
    village_id = None
    try:
        village_id = int(village_id_raw)
        village = Village.query.filter_by(id=village_id, asha_worker_id=worker.id).first()
        if not village:
            errors["village_id"] = "Select a valid assigned village."
    except (TypeError, ValueError):
        errors["village_id"] = "Village is required."

    # ── Water source type ────────────────────────────────────────────────
    water_source = (data.get("water_source_type") or "").strip().upper()
    if water_source not in VALID_WATER_SOURCE:
        errors["water_source_type"] = "Select a valid water source type."

    # ── Contamination type ───────────────────────────────────────────────
    contamination = (data.get("contamination_type") or "").strip().upper()
    if contamination not in VALID_CONTAMINATION:
        errors["contamination_type"] = "Select a valid contamination type."

    # ── Affected households ──────────────────────────────────────────────
    households_raw = data.get("affected_households")
    households = None
    try:
        households = int(households_raw)
        if households <= 0:
            errors["affected_households"] = "Enter a valid number greater than 0."
    except (TypeError, ValueError):
        errors["affected_households"] = "Affected households must be a number."

    # ── Severity ─────────────────────────────────────────────────────────
    severity = (data.get("severity") or "").strip().upper()
    if severity not in VALID_SEVERITY:
        errors["severity"] = "Select a valid severity."

    if errors:
        return jsonify({"errors": errors}), 422

    # ── Save report ───────────────────────────────────────────────────────
    report = WaterReport(
        asha_worker_id=worker.id,
        village_id=village_id,
        water_source_type=water_source,
        contamination_type=contamination,
        affected_households=households,
        severity=severity,
        notes=(data.get("notes") or "").strip() or None,
    )
    db.session.add(report)
    db.session.commit()

    return jsonify({"message": "Water report saved.", "id": report.id}), 201


@asha_bp.route("/asha/alerts")
def asha_alerts_page():
    """Serve the View Alerts HTML page (auth handled client-side via JWT)."""
    return render_template("asha_alerts.html")


@asha_bp.route("/api/asha/alerts", methods=["GET"])
@asha_required
def get_alerts(current_user):
    """Return derived alert list for the logged-in ASHA worker."""
    worker = current_user.asha_profile
    if not worker:
        return jsonify({"error": "ASHA profile not found"}), 404
    try:
        alerts = build_alerts(worker)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    return jsonify({"alerts": alerts, "count": len(alerts)}), 200


@asha_bp.route("/asha/stub/<action>")
def asha_stub_page(action):
    """Generic 'coming soon' page. Real pages redirect instead."""
    if action == "report-patient":
        return redirect("/asha/report-patient")
    if action == "report-symptoms":
        return redirect("/asha/report-symptoms")
    if action == "report-water":
        return redirect("/asha/report-water")
    if action == "view-alerts":
        return redirect("/asha/alerts")
    labels = {}
    title = labels.get(action, action.replace("-", " ").title())
    return render_template("asha_stub.html", title=title)


@asha_bp.route("/placeholder")
def placeholder_page():
    """Generic placeholder for non-ASHA roles."""
    return render_template("placeholder.html")


# ---------------------------------------------------------------------------
# JSON API routes
# ---------------------------------------------------------------------------

@asha_bp.route("/api/asha/profile", methods=["GET"])
@asha_required
def get_profile(current_user):
    """Return profile + assigned villages."""
    worker = current_user.asha_profile
    if not worker:
        return jsonify({"error": "ASHA profile not found"}), 404
    data = worker.to_dict()
    data["villages"] = [v.to_dict() for v in worker.villages]
    return jsonify({"profile": data}), 200


@asha_bp.route("/api/asha/dashboard", methods=["GET"])
@asha_required
def get_dashboard_stats(current_user):
    """Return stat counts for the 4 dashboard cards."""
    worker = current_user.asha_profile
    if not worker:
        return jsonify({"error": "ASHA profile not found"}), 404

    # Assigned villages
    assigned_count = Village.query.filter_by(asha_worker_id=worker.id).count()

    # High-risk villages
    high_risk_count = Village.query.filter_by(
        asha_worker_id=worker.id, risk_level="HIGH"
    ).count()

    # Today's reports = VitalRecords + PatientReports + SymptomReports created today (safe default 0)
    try:
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        vital_count = VitalRecord.query.filter(
            VitalRecord.user_id == current_user.id,
            VitalRecord.recorded_at >= today_start
        ).count()
        patient_report_count = PatientReport.query.filter(
            PatientReport.asha_worker_id == worker.id,
            PatientReport.reported_at >= today_start
        ).count()
        symptom_report_count = SymptomReport.query.filter(
            SymptomReport.asha_worker_id == worker.id,
            SymptomReport.reported_at >= today_start
        ).count()
        water_report_count = WaterReport.query.filter(
            WaterReport.asha_worker_id == worker.id,
            WaterReport.reported_at >= today_start
        ).count()
        todays_reports = vital_count + patient_report_count + symptom_report_count + water_report_count
    except Exception:
        todays_reports = 0

    # Active alerts derived from high-risk villages + high water + severe symptoms
    try:
        active_alerts = len(build_alerts(worker))
    except Exception:
        active_alerts = 0

    return jsonify({
        "assignedVillages": assigned_count,
        "todaysReports": todays_reports,
        "activeAlerts": active_alerts,
        "highRiskAreas": high_risk_count,
    }), 200


@asha_bp.route("/api/asha/villages", methods=["GET"])
@asha_required
def get_villages(current_user):
    """Return list of villages assigned to this ASHA worker."""
    worker = current_user.asha_profile
    if not worker:
        return jsonify({"error": "ASHA profile not found"}), 404
    villages = [v.to_dict() for v in worker.villages]
    return jsonify({"villages": villages, "count": len(villages)}), 200


# ---------------------------------------------------------------------------
# Data seed (called once from app factory)
# ---------------------------------------------------------------------------

def seed_asha_data(app):
    """
    Seed: 1 ASHA user + 5 villages with varied risk levels.
    Safe to call repeatedly — skips if data already exists.
    """
    with app.app_context():
        village_data = [
            ("Rampur",      "Ahmedabad",   "LOW"),
            ("Devgaon",     "Vadodara",    "MEDIUM"),
            ("Sonwadi",     "Rajkot",      "HIGH"),
            ("Khamgaon",    "Surat",       "LOW"),
            ("Bhilwadi",    "Anand",       "HIGH"),
        ]

        # Check if ASHA user already exists with profile and villages
        user = User.query.filter_by(email="asha@test.com").first()
        if user and user.asha_profile and Village.query.filter_by(asha_worker_id=user.asha_profile.id).count() >= 5:
            updated = False
            if user.full_name != "Jenia Roy":
                user.full_name = "Jenia Roy"
                updated = True
            # Ensure existing villages are updated to Gujarat locations
            for name, district, _ in village_data:
                v = Village.query.filter_by(name=name).first()
                if v and v.district != district:
                    v.district = district
                    updated = True
            if updated:
                db.session.commit()
            return

        print("[VitalWatch] Seeding ASHA test data...")

        if not user:
            # Create ASHA user
            salt = bcrypt.gensalt(rounds=10)
            pw_hash = bcrypt.hashpw(b"asha123", salt).decode("utf-8")
            user = User(
                full_name="Jenia Roy",
                email="asha@test.com",
                password_hash=pw_hash,
                role="ASHA_WORKER",
            )
            db.session.add(user)
            db.session.flush()  # get user.id

        # Check or create worker profile
        worker = AshaWorker.query.filter_by(user_id=user.id).first()
        if not worker:
            worker = AshaWorker(
                user_id=user.id,
                phone="9876543210",
                employee_id="ASHA-MH-00421",
            )
            db.session.add(worker)
            db.session.flush()  # get worker.id

        # Seed 5 villages with Gujarat districts if not already present
        if Village.query.filter_by(asha_worker_id=worker.id).count() == 0:
            for name, district, risk in village_data:
                db.session.add(Village(
                    name=name,
                    district=district,
                    risk_level=risk,
                    asha_worker_id=worker.id,
                ))

        db.session.commit()
        print("[VitalWatch] ASHA seed complete: asha@test.com / asha123")

