"""
Case Follow-up Management Module (Feature #14)
An ASHA worker can track a reported case from first report to recovery.

Endpoints:
  - POST   /api/cases            -> create case (default status REPORTED)
  - GET    /api/cases            -> list all (optional ?status= filter)
  - GET    /api/cases/<id>       -> single case
  - PUT    /api/cases/<id>       -> edit follow-up date / details
  - PATCH  /api/cases/<id>/status -> update status (forward-only flow)
  - DELETE /api/cases/<id>       -> delete case
"""

from datetime import datetime, date, timedelta
from flask import Blueprint, jsonify, request
from app.models import db, CaseFollowUp

cases_bp = Blueprint("cases", __name__)

STATUS_ORDER = {
    "REPORTED": 0,
    "UNDER_OBSERVATION": 1,
    "REFERRED": 2,
    "RECOVERED": 3,
}

VALID_STATUSES = set(STATUS_ORDER.keys())


def normalize_status(raw_status: str) -> str:
    """Normalize status string to uppercase with underscores."""
    if not raw_status:
        return ""
    normalized = str(raw_status).strip().upper().replace(" ", "_").replace("-", "_")
    return normalized


def parse_date(date_val):
    """Parse date from string or date object."""
    if not date_val:
        return None
    if isinstance(date_val, (date, datetime)):
        return date_val.date() if isinstance(date_val, datetime) else date_val
    try:
        return datetime.strptime(str(date_val).strip()[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


class CaseFollowUpService:
    """Service layer handling business logic and forward-only status flow."""

    @staticmethod
    def get_all(status_filter=None):
        query = CaseFollowUp.query
        if status_filter:
            norm_filter = normalize_status(status_filter)
            if norm_filter in VALID_STATUSES:
                query = query.filter_by(status=norm_filter)
        return query.order_by(CaseFollowUp.id.desc()).all()

    @staticmethod
    def get_by_id(case_id):
        return db.session.get(CaseFollowUp, case_id)

    @staticmethod
    def create(data):
        village = (data.get("village") or "").strip()
        if not village:
            return None, "village is required"

        reported_raw = data.get("reportedDate") or data.get("reported_date")
        if not reported_raw:
            return None, "reportedDate is required in YYYY-MM-DD format"

        reported_date = parse_date(reported_raw)
        if not reported_date:
            return None, "reportedDate must be a valid date in YYYY-MM-DD format"

        patient_name = (data.get("patientName") or data.get("patient_name") or "Anonymous").strip()
        if not patient_name:
            patient_name = "Anonymous"

        # Format symptoms
        symptoms_input = data.get("symptoms")
        if isinstance(symptoms_input, list):
            symptoms_str = ", ".join(str(s).strip() for s in symptoms_input if str(s).strip())
        elif isinstance(symptoms_input, str):
            symptoms_str = symptoms_input.strip()
        else:
            symptoms_str = ""

        # Default status is REPORTED
        status = normalize_status(data.get("status") or "REPORTED")
        if status not in VALID_STATUSES:
            status = "REPORTED"

        follow_up_raw = data.get("followUpDate") or data.get("follow_up_date")
        follow_up_date = parse_date(follow_up_raw) if follow_up_raw else None

        case_obj = CaseFollowUp(
            patient_name=patient_name,
            village=village,
            reported_date=reported_date,
            symptoms=symptoms_str,
            status=status,
            follow_up_date=follow_up_date
        )

        db.session.add(case_obj)
        db.session.commit()
        return case_obj, None

    @staticmethod
    def update(case_obj, data):
        village = data.get("village")
        if village is not None:
            village_clean = str(village).strip()
            if not village_clean:
                return None, "village cannot be empty"
            case_obj.village = village_clean

        patient_name = data.get("patientName") or data.get("patient_name")
        if patient_name is not None:
            case_obj.patient_name = str(patient_name).strip() or "Anonymous"

        reported_raw = data.get("reportedDate") or data.get("reported_date")
        if reported_raw is not None:
            reported_date = parse_date(reported_raw)
            if not reported_date:
                return None, "reportedDate must be a valid date in YYYY-MM-DD format"
            case_obj.reported_date = reported_date

        if "symptoms" in data:
            symptoms_input = data.get("symptoms")
            if isinstance(symptoms_input, list):
                case_obj.symptoms = ", ".join(str(s).strip() for s in symptoms_input if str(s).strip())
            elif isinstance(symptoms_input, str):
                case_obj.symptoms = symptoms_input.strip()

        follow_up_raw = data.get("followUpDate") or data.get("follow_up_date")
        if follow_up_raw is not None:
            case_obj.follow_up_date = parse_date(follow_up_raw)

        db.session.commit()
        return case_obj, None

    @staticmethod
    def update_status(case_obj, new_status_raw):
        new_status = normalize_status(new_status_raw)
        if new_status not in VALID_STATUSES:
            return None, f"Invalid status '{new_status_raw}'. Valid values: {', '.join(STATUS_ORDER.keys())}"

        current_status = case_obj.status or "REPORTED"
        current_rank = STATUS_ORDER.get(current_status, 0)
        new_rank = STATUS_ORDER.get(new_status, 0)

        # Terminal state check
        if current_status == "RECOVERED":
            return None, "Case is already Recovered (terminal state). Status cannot be changed."

        # Forward-only flow verification: reject moving backwards or staying same
        if new_rank <= current_rank:
            return None, f"Status flow is forward-only (Reported -> Under Observation -> Referred -> Recovered). Cannot move backwards from {current_status} to {new_status}."

        case_obj.status = new_status
        db.session.commit()
        return case_obj, None

    @staticmethod
    def delete(case_obj):
        db.session.delete(case_obj)
        db.session.commit()
        return True


# ========================================================
# REST CONTROLLER ENDPOINTS
# ========================================================

@cases_bp.route("/api/cases", methods=["GET"])
def get_cases():
    """List all cases, supporting optional ?status= filter."""
    status_filter = request.args.get("status")
    cases = CaseFollowUpService.get_all(status_filter)
    return jsonify([c.to_dict() for c in cases]), 200


@cases_bp.route("/api/cases/<int:case_id>", methods=["GET"])
def get_single_case(case_id):
    """Retrieve single case by ID."""
    case_obj = CaseFollowUpService.get_by_id(case_id)
    if not case_obj:
        return jsonify({"error": f"Case #{case_id} not found"}), 404
    return jsonify(case_obj.to_dict()), 200


@cases_bp.route("/api/cases", methods=["POST"])
def create_case():
    """Create case (default status REPORTED). Basic validation required."""
    data = request.get_json(silent=True) or {}
    case_obj, err = CaseFollowUpService.create(data)
    if err:
        return jsonify({"error": err}), 400
    return jsonify(case_obj.to_dict()), 201


@cases_bp.route("/api/cases/<int:case_id>", methods=["PUT"])
def edit_case(case_id):
    """Edit follow-up date / details for a case."""
    case_obj = CaseFollowUpService.get_by_id(case_id)
    if not case_obj:
        return jsonify({"error": f"Case #{case_id} not found"}), 404

    data = request.get_json(silent=True) or {}
    updated, err = CaseFollowUpService.update(case_obj, data)
    if err:
        return jsonify({"error": err}), 400
    return jsonify(updated.to_dict()), 200


@cases_bp.route("/api/cases/<int:case_id>/status", methods=["PATCH"])
def update_case_status(case_id):
    """
    Update status with forward-only flow:
    Reported -> Under Observation -> Referred -> Recovered
    (allow skipping Referred if patient recovers; reject moving backwards)
    """
    case_obj = CaseFollowUpService.get_by_id(case_id)
    if not case_obj:
        return jsonify({"error": f"Case #{case_id} not found"}), 404

    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    if not new_status:
        return jsonify({"error": "status is required in request body"}), 400

    updated, err = CaseFollowUpService.update_status(case_obj, new_status)
    if err:
        return jsonify({"error": err}), 400
    return jsonify(updated.to_dict()), 200


@cases_bp.route("/api/cases/<int:case_id>", methods=["DELETE"])
def delete_case(case_id):
    """Delete a case by ID."""
    case_obj = CaseFollowUpService.get_by_id(case_id)
    if not case_obj:
        return jsonify({"error": f"Case #{case_id} not found"}), 404

    CaseFollowUpService.delete(case_obj)
    return jsonify({"message": f"Case #{case_id} deleted successfully", "id": case_id}), 200


# ========================================================
# DEMO SEED DATA (3-4 Sample Rows)
# ========================================================
def seed_cases(app):
    """Seed 3-4 initial sample demo rows for Case Follow-up (Feature #14)."""
    with app.app_context():
        try:
            if CaseFollowUp.query.count() > 0:
                return

            today = date.today()
            samples = [
                CaseFollowUp(
                    id=1024,
                    patient_name="Sunita Devi",
                    village="Rampur",
                    reported_date=today - timedelta(days=3),
                    symptoms="Fever, Diarrhea, Weakness",
                    status="UNDER_OBSERVATION",
                    follow_up_date=today + timedelta(days=1)
                ),
                CaseFollowUp(
                    id=1025,
                    patient_name="Rahul Barman",
                    village="Sonapur",
                    reported_date=today - timedelta(days=5),
                    symptoms="Vomiting, Dehydration, Abdominal Pain",
                    status="REFERRED",
                    follow_up_date=today
                ),
                CaseFollowUp(
                    id=1026,
                    patient_name="Anonymous",
                    village="Bishnupur",
                    reported_date=today - timedelta(days=1),
                    symptoms="Fever, Weakness",
                    status="REPORTED",
                    follow_up_date=today + timedelta(days=2)
                ),
                CaseFollowUp(
                    id=1027,
                    patient_name="Meena Das",
                    village="Kalyanpur",
                    reported_date=today - timedelta(days=7),
                    symptoms="Fever, Diarrhea",
                    status="RECOVERED",
                    follow_up_date=today - timedelta(days=1)
                ),
            ]

            for s in samples:
                db.session.add(s)
            db.session.commit()
            print("[VitalWatch] Seeded 4 sample demo rows for Case Follow-up (Feature #14).")
        except Exception as ex:
            db.session.rollback()
            print(f"[VitalWatch] Note during seeding case follow-up: {ex}")
