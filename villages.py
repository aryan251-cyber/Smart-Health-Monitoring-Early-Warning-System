"""
Community Risk Map & Villages Module (Feature #7)
Provides village geographic coordinates, demographic data, active cases,
water contamination metrics, and disease risk scores for Leaflet.js map visualization.
"""

from flask import Blueprint, jsonify
from app.models import Village, Alert, PatientReport, WaterReport

villages_bp = Blueprint("villages", __name__)

# Master geospatial and epidemiological dataset for rural surveillance
# Real locations & verified Nominatim coordinates in Central Gujarat (Kheda / Anand area), India
SEED_VILLAGES = [
    {
        "id": 1,
        "name": "Nadiad",
        "lat": 22.6896,
        "lng": 72.8714,
        "population": 2450,
        "activeCases": 18,
        "waterSources": 6,
        "contaminatedSources": 2,
        "riskScore": 85
    },
    {
        "id": 2,
        "name": "Kheda",
        "lat": 22.8533,
        "lng": 72.9954,
        "population": 1850,
        "activeCases": 14,
        "waterSources": 7,
        "contaminatedSources": 3,
        "riskScore": 82
    },
    {
        "id": 3,
        "name": "Anand",
        "lat": 22.4740,
        "lng": 72.7362,
        "population": 2100,
        "activeCases": 15,
        "waterSources": 8,
        "contaminatedSources": 2,
        "riskScore": 76
    },
    {
        "id": 4,
        "name": "Mehmedabad",
        "lat": 22.8622,
        "lng": 72.7958,
        "population": 1620,
        "activeCases": 8,
        "waterSources": 5,
        "contaminatedSources": 1,
        "riskScore": 58
    },
    {
        "id": 5,
        "name": "Borsad",
        "lat": 22.4094,
        "lng": 72.9053,
        "population": 1480,
        "activeCases": 6,
        "waterSources": 7,
        "contaminatedSources": 1,
        "riskScore": 48
    },
    {
        "id": 6,
        "name": "Dholka",
        "lat": 22.7266,
        "lng": 72.4412,
        "population": 1720,
        "activeCases": 5,
        "waterSources": 6,
        "contaminatedSources": 1,
        "riskScore": 44
    },
    {
        "id": 7,
        "name": "Umreth",
        "lat": 22.6991,
        "lng": 73.1150,
        "population": 1350,
        "activeCases": 2,
        "waterSources": 8,
        "contaminatedSources": 0,
        "riskScore": 24
    },
    {
        "id": 8,
        "name": "Matar",
        "lat": 22.7074,
        "lng": 72.6623,
        "population": 1280,
        "activeCases": 1,
        "waterSources": 6,
        "contaminatedSources": 0,
        "riskScore": 18
    }
]

# Quick Sanity Check: All coordinates must sit within Gujarat & Central Gujarat inland district bounds
import logging
logger = logging.getLogger(__name__)

GUJARAT_BOUNDS = {"lat_min": 20.1, "lat_max": 24.7, "lng_min": 68.1, "lng_max": 74.5}
DISTRICT_BOUNDS = {"lat_min": 22.2, "lat_max": 23.1, "lng_min": 72.3, "lng_max": 73.3}

for _v in SEED_VILLAGES:
    _lat, _lng, _name = _v["lat"], _v["lng"], _v["name"]
    if not (GUJARAT_BOUNDS["lat_min"] <= _lat <= GUJARAT_BOUNDS["lat_max"] and
            GUJARAT_BOUNDS["lng_min"] <= _lng <= GUJARAT_BOUNDS["lng_max"]):
        logger.warning("[VitalWatch Sanity Check] OUTSIDE GUJARAT: %s (%.4f, %.4f)", _name, _lat, _lng)
    if not (DISTRICT_BOUNDS["lat_min"] <= _lat <= DISTRICT_BOUNDS["lat_max"] and
            DISTRICT_BOUNDS["lng_min"] <= _lng <= DISTRICT_BOUNDS["lng_max"]):
        logger.warning("[VitalWatch Sanity Check] OUTSIDE DISTRICT: %s (%.4f, %.4f)", _name, _lat, _lng)



def derive_risk_level(score: float) -> str:
    """Derives Low (0-39), Medium (40-69), or High (70-100) from risk score."""
    try:
        s = float(score)
    except (ValueError, TypeError):
        s = 0.0

    if s >= 70:
        return "High"
    elif s >= 40:
        return "Medium"
    else:
        return "Low"


@villages_bp.route("/api/villages", methods=["GET"])
def get_villages_for_map():
    """
    GET /api/villages
    Returns array of villages with geographical coordinates, health indicators,
    and disease risk scores.
    """
    villages_data = []

    for v in SEED_VILLAGES:
        score = v["riskScore"]
        level = derive_risk_level(score)

        villages_data.append({
            "id": v["id"],
            "name": v["name"],
            "lat": v["lat"],
            "lng": v["lng"],
            "population": v["population"],
            "activeCases": v["activeCases"],
            "active_cases": v["activeCases"],
            "waterSources": v["waterSources"],
            "water_sources": v["waterSources"],
            "contaminatedSources": v["contaminatedSources"],
            "contaminated_sources": v["contaminatedSources"],
            "riskScore": score,
            "risk_score": score,
            "riskLevel": level,
            "risk_level": level
        })

    return jsonify({
        "villages": villages_data,
        "count": len(villages_data),
        "district": "Kheda / Anand, Gujarat",
        "center": {
            "lat": 22.70,
            "lng": 72.87,
            "zoom": 10
        }
    }), 200

