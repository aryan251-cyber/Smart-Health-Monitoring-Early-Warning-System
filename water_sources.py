"""
Water Sources Management Blueprint (Feature #9)
Provides:
  - GET /api/water-sources        (list all with optional ?status=safe|warning|contaminated filter)
  - POST /api/water-sources       (add source, server-computed risk_status)
  - PUT /api/water-sources/<id>   (update source, recomputed risk_status)
"""

from datetime import datetime, date, timedelta
from flask import Blueprint, jsonify, request
from app.models import db, Village, WaterSource, calculate_water_source_risk

water_sources_bp = Blueprint("water_sources", __name__)


@water_sources_bp.route("/api/water-sources", methods=["GET"])
def get_water_sources():
    """List all water sources, supporting optional ?status=safe|warning|contaminated filter."""
    status_filter = request.args.get("status")
    query = WaterSource.query

    if status_filter and status_filter.lower().strip() in ["safe", "warning", "contaminated"]:
        query = query.filter_by(risk_status=status_filter.lower().strip())

    sources = query.order_by(WaterSource.id.desc()).all()
    return jsonify([s.to_dict() for s in sources]), 200


@water_sources_bp.route("/api/water-sources", methods=["POST"])
def create_water_source():
    """Create a new water source with server-computed risk status."""
    data = request.get_json() or {}

    source_name = (data.get("source_name") or "").strip()
    if not source_name:
        return jsonify({"error": "source_name is required"}), 400

    try:
        ph = float(data.get("ph"))
        turbidity = float(data.get("turbidity"))
    except (ValueError, TypeError):
        return jsonify({"error": "Numeric values are required for ph and turbidity"}), 400

    source_type = (data.get("source_type") or "hand_pump").strip().lower()
    bacterial_status = (data.get("bacterial_status") or "safe").strip().lower()
    if bacterial_status not in ["safe", "contaminated"]:
        bacterial_status = "safe"

    # parse last_tested date
    last_tested_raw = data.get("last_tested")
    if last_tested_raw:
        try:
            last_tested = datetime.strptime(str(last_tested_raw)[:10], "%Y-%m-%d").date()
        except ValueError:
            last_tested = date.today()
    else:
        last_tested = date.today()

    # parse village_id (accepts int id or lookup by name)
    village_id = data.get("village_id")
    if village_id:
        try:
            village_id = int(village_id)
        except ValueError:
            v_obj = Village.query.filter_by(name=str(village_id).strip()).first()
            village_id = v_obj.id if v_obj else None

    # Auto-calculate risk status on save
    risk_status = calculate_water_source_risk(ph, turbidity, bacterial_status)

    new_source = WaterSource(
        village_id=village_id,
        source_name=source_name,
        source_type=source_type,
        ph=ph,
        turbidity=turbidity,
        bacterial_status=bacterial_status,
        last_tested=last_tested,
        risk_status=risk_status
    )
    db.session.add(new_source)
    db.session.commit()

    return jsonify(new_source.to_dict()), 201


@water_sources_bp.route("/api/water-sources/<int:source_id>", methods=["PUT"])
def update_water_source(source_id):
    """Update an existing water source with re-computed risk status."""
    source = db.session.get(WaterSource, source_id)
    if not source:
        return jsonify({"error": "Water source not found"}), 404

    data = request.get_json() or {}

    if "source_name" in data and str(data["source_name"]).strip():
        source.source_name = str(data["source_name"]).strip()

    if "source_type" in data and str(data["source_type"]).strip():
        source.source_type = str(data["source_type"]).strip().lower()

    if "ph" in data:
        try:
            source.ph = float(data["ph"])
        except (ValueError, TypeError):
            return jsonify({"error": "Numeric value is required for ph"}), 400

    if "turbidity" in data:
        try:
            source.turbidity = float(data["turbidity"])
        except (ValueError, TypeError):
            return jsonify({"error": "Numeric value is required for turbidity"}), 400

    if "bacterial_status" in data:
        b_stat = str(data["bacterial_status"]).strip().lower()
        if b_stat in ["safe", "contaminated"]:
            source.bacterial_status = b_stat

    if "last_tested" in data and data["last_tested"]:
        try:
            source.last_tested = datetime.strptime(str(data["last_tested"])[:10], "%Y-%m-%d").date()
        except ValueError:
            pass

    if "village_id" in data:
        raw_v = data["village_id"]
        try:
            source.village_id = int(raw_v) if raw_v else None
        except ValueError:
            v_obj = Village.query.filter_by(name=str(raw_v).strip()).first()
            if v_obj:
                source.village_id = v_obj.id

    # Re-calculate risk status on save
    source.risk_status = calculate_water_source_risk(source.ph, source.turbidity, source.bacterial_status)
    db.session.commit()

    return jsonify(source.to_dict()), 200


def seed_water_sources(app):
    """
    Seeds 6 sample water sources across 3-4 villages with a mix of safe / warning / contaminated.
    Safe to call on every app start; skips if rows already exist.
    """
    with app.app_context():
        try:
            if WaterSource.query.count() > 0:
                return
        except Exception:
            return

        print("[VitalWatch] Seeding 6 sample water sources across villages...")

        # Find existing villages
        villages = Village.query.all()
        v_map = {v.name: v.id for v in villages}
        v_ids = [v.id for v in villages] or [None]

        devgaon_id  = v_map.get("Devgaon", v_ids[0])
        rampur_id   = v_map.get("Rampur", v_ids[0])
        sonwadi_id  = v_map.get("Sonwadi", v_ids[0])
        khamgaon_id = v_map.get("Khamgaon", v_ids[0])
        bhilwadi_id = v_map.get("Bhilwadi", v_ids[0])

        samples = [
            # 1. Safe (Well - Devgaon)
            {
                "village_id": devgaon_id,
                "source_name": "Community Well #1 - North",
                "source_type": "well",
                "ph": 7.3,
                "turbidity": 1.4,
                "bacterial_status": "safe",
                "last_tested": date.today() - timedelta(days=2),
            },
            # 2. Safe (Hand Pump - Rampur)
            {
                "village_id": rampur_id,
                "source_name": "Main Bazaar Hand Pump",
                "source_type": "hand_pump",
                "ph": 7.4,
                "turbidity": 2.1,
                "bacterial_status": "safe",
                "last_tested": date.today() - timedelta(days=5),
            },
            # 3. Warning (Tap Stand - Devgaon, elevated pH 8.35)
            {
                "village_id": devgaon_id,
                "source_name": "School Ward Tap Stand",
                "source_type": "tap",
                "ph": 8.35,
                "turbidity": 2.2,
                "bacterial_status": "safe",
                "last_tested": date.today() - timedelta(days=1),
            },
            # 4. Warning (Hand Pump - Khamgaon, elevated turbidity 4.7 NTU)
            {
                "village_id": khamgaon_id,
                "source_name": "East Field Hand Pump",
                "source_type": "hand_pump",
                "ph": 7.2,
                "turbidity": 4.7,
                "bacterial_status": "safe",
                "last_tested": date.today() - timedelta(days=4),
            },
            # 5. Contaminated (River - Sonwadi, bacterial presence & high turbidity)
            {
                "village_id": sonwadi_id,
                "source_name": "River Ghat Water Point",
                "source_type": "river",
                "ph": 6.1,
                "turbidity": 6.8,
                "bacterial_status": "contaminated",
                "last_tested": date.today() - timedelta(days=3),
            },
            # 6. Contaminated (Borewell - Bhilwadi, high pH 8.9 & turbidity 5.4 NTU)
            {
                "village_id": bhilwadi_id,
                "source_name": "Old Sector Borewell",
                "source_type": "well",
                "ph": 8.9,
                "turbidity": 5.4,
                "bacterial_status": "safe",
                "last_tested": date.today() - timedelta(days=6),
            }
        ]

        for s in samples:
            risk = calculate_water_source_risk(s["ph"], s["turbidity"], s["bacterial_status"])
            ws = WaterSource(
                village_id=s["village_id"],
                source_name=s["source_name"],
                source_type=s["source_type"],
                ph=s["ph"],
                turbidity=s["turbidity"],
                bacterial_status=s["bacterial_status"],
                last_tested=s["last_tested"],
                risk_status=risk
            )
            db.session.add(ws)

        db.session.commit()
        print("[VitalWatch] Seeded 6 sample water sources successfully.")
