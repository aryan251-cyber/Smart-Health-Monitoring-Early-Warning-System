"""
Disease Risk Engine Module
Rule-based scoring engine designed to be easily swappable with ML models in the future.
"""

from flask import Blueprint, request, jsonify

risk_bp = Blueprint("risk", __name__)


def calculate_risk(symptoms: int, water: str, cases: int, season: str):
    """
    Calculate disease risk score (0-100) and status breakdown.
    
    Rules:
    - Symptoms (max 40): symptoms >= 5 -> +40, symptoms >= 3 -> +25, else 0
    - Water quality (max 30): "bad" -> +30, "moderate" -> +15, "good" -> 0
    - Recent cases (max 20): cases >= 10 -> +20, cases >= 5 -> +10, else 0
    - Season (max 10): "monsoon" -> +10, else 0

    Status thresholds:
    - 0-39: "LOW RISK"
    - 40-69: "MEDIUM RISK"
    - 70-100: "HIGH RISK"
    """
    # 1. Symptoms contribution (max 40)
    if symptoms >= 5:
        symptoms_score = 40
    elif symptoms >= 3:
        symptoms_score = 25
    else:
        symptoms_score = 0

    # 2. Water quality contribution (max 30)
    w_clean = (water or "").strip().lower()
    if w_clean == "bad":
        water_score = 30
    elif w_clean == "moderate":
        water_score = 15
    else:
        water_score = 0

    # 3. Recent cases contribution (max 20)
    if cases >= 10:
        cases_score = 20
    elif cases >= 5:
        cases_score = 10
    else:
        cases_score = 0

    # 4. Season contribution (max 10)
    s_clean = (season or "").strip().lower()
    if s_clean == "monsoon":
        season_score = 10
    else:
        season_score = 0

    total_score = symptoms_score + water_score + cases_score + season_score

    # Determine status
    if total_score >= 70:
        status = "HIGH RISK"
    elif total_score >= 40:
        status = "MEDIUM RISK"
    else:
        status = "LOW RISK"

    return {
        "score": total_score,
        "status": status,
        "breakdown": {
            "symptoms": symptoms_score,
            "water": water_score,
            "cases": cases_score,
            "season": season_score
        }
    }


@risk_bp.route("/api/risk", methods=["POST"])
def api_calculate_risk():
    """
    Endpoint to evaluate village disease risk score.
    Accepts JSON:
      { "symptoms": int, "water": "good|moderate|bad", "cases": int, "season": "monsoon|summer|winter" }
    Returns JSON:
      { "score": int, "status": "HIGH RISK", "breakdown": { ... } }
    """
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    # Validate symptoms
    if "symptoms" not in data:
        return jsonify({"error": "Missing required field: 'symptoms'."}), 400
    try:
        symptoms = int(data["symptoms"])
        if symptoms < 0:
            return jsonify({"error": "'symptoms' must be a non-negative integer."}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "'symptoms' must be a valid integer."}), 400

    # Validate water
    if "water" not in data:
        return jsonify({"error": "Missing required field: 'water'."}), 400
    water = str(data["water"]).strip().lower()
    valid_water = {"good", "moderate", "bad"}
    if water not in valid_water:
        return jsonify({"error": f"Invalid 'water' value. Allowed values are: {', '.join(sorted(valid_water))}."}), 400

    # Validate cases
    if "cases" not in data:
        return jsonify({"error": "Missing required field: 'cases'."}), 400
    try:
        cases = int(data["cases"])
        if cases < 0:
            return jsonify({"error": "'cases' must be a non-negative integer."}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "'cases' must be a valid integer."}), 400

    # Validate season
    if "season" not in data:
        return jsonify({"error": "Missing required field: 'season'."}), 400
    season = str(data["season"]).strip().lower()
    valid_seasons = {"monsoon", "summer", "winter"}
    if season not in valid_seasons:
        return jsonify({"error": f"Invalid 'season' value. Allowed values are: {', '.join(sorted(valid_seasons))}."}), 400

    result = calculate_risk(symptoms, water, cases, season)
    return jsonify(result), 200
