"""
Main / Default Dashboard Blueprint
Provides:
  - GET /dashboard      : Main dashboard HTML view (or JSON if requested by API client)
  - GET /api/dashboard  : JSON endpoint returning system overview stats, top risk villages, and recent activity
  - GET /api/dashboard/stats : Alias for API overview stats
"""

from datetime import datetime, timezone
from flask import Blueprint, jsonify, render_template, request
from app.models import db, User, AshaWorker, Village, Alert, VitalRecord

dashboard_bp = Blueprint("dashboard", __name__)


def get_dashboard_overview():
    """
    Aggregate system-wide overview statistics.
    Uses safe defaults (0 or empty lists) so no missing tables or unmigrated structures cause failures.
    """
    # 1. Total Villages
    try:
        total_villages = Village.query.count()
    except Exception:
        total_villages = 0

    # 2. Total ASHA Workers
    try:
        total_asha_workers = AshaWorker.query.count()
        if total_asha_workers == 0:
            total_asha_workers = User.query.filter_by(role="ASHA_WORKER").count()
    except Exception:
        total_asha_workers = 0

    # 3. Total Reports Today (Vital records recorded today in UTC)
    try:
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        total_reports_today = VitalRecord.query.filter(
            VitalRecord.recorded_at >= today_start
        ).count()
    except Exception:
        total_reports_today = 0

    # 4. Active Alerts (unacknowledged alerts)
    try:
        active_alerts = Alert.query.filter_by(acknowledged=False).count()
    except Exception:
        active_alerts = 0

    # 5. High Risk Villages
    try:
        high_risk_villages = Village.query.filter_by(risk_level="HIGH").count()
    except Exception:
        high_risk_villages = 0

    # Top 5 highest risk villages (sorted: HIGH -> MEDIUM -> LOW)
    try:
        risk_rank = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
        all_villages = Village.query.all()
        sorted_villages = sorted(
            all_villages,
            key=lambda v: (risk_rank.get((v.risk_level or "").upper(), 3), v.name or "")
        )[:5]
        top_risk_villages = [v.to_dict() for v in sorted_villages]
    except Exception:
        top_risk_villages = []

    # Recent Activity: last 5 alerts and vital reports merged
    recent_activity = []
    try:
        recent_alerts = Alert.query.order_by(Alert.created_at.desc()).limit(5).all()
        for a in recent_alerts:
            recent_activity.append({
                "type": "alert",
                "severity": a.severity or "WARNING",
                "message": a.message or "Active clinical alert raised",
                "timestamp": a.created_at.isoformat() if a.created_at else None,
                "dt": a.created_at
            })
    except Exception:
        pass

    try:
        recent_records = VitalRecord.query.order_by(VitalRecord.recorded_at.desc()).limit(5).all()
        for r in recent_records:
            recent_activity.append({
                "type": "report",
                "severity": r.risk_level or "NORMAL",
                "message": f"Vital record logged for Patient #{r.user_id} ({r.risk_level or 'NORMAL'})",
                "timestamp": r.recorded_at.isoformat() if r.recorded_at else None,
                "dt": r.recorded_at
            })
    except Exception:
        pass

    # Sort merged activity desc by datetime and slice top 5
    recent_activity.sort(
        key=lambda x: x.get("dt") or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True
    )
    formatted_activity = []
    for item in recent_activity[:5]:
        formatted_activity.append({
            "type": item["type"],
            "severity": item["severity"],
            "message": item["message"],
            "timestamp": item["timestamp"]
        })

    return {
        "totalVillages": total_villages,
        "total_villages": total_villages,
        "totalAshaWorkers": total_asha_workers,
        "total_asha_workers": total_asha_workers,
        "totalReportsToday": total_reports_today,
        "total_reports_today": total_reports_today,
        "activeAlerts": active_alerts,
        "active_alerts": active_alerts,
        "highRiskVillages": high_risk_villages,
        "high_risk_villages": high_risk_villages,
        "topRiskVillages": top_risk_villages,
        "top_risk_villages": top_risk_villages,
        "recentActivity": formatted_activity,
        "recent_activity": formatted_activity
    }


@dashboard_bp.route("/dashboard", methods=["GET"])
def dashboard_page():
    """
    Main dashboard landing endpoint.
    If called with Accept: application/json or ?format=json, returns overview stats.
    Otherwise serves dashboard.html.
    """
    stats = get_dashboard_overview()
    accept_header = request.headers.get("Accept", "")
    if request.is_json or "application/json" in accept_header or request.args.get("format") == "json":
        return jsonify(stats), 200

    return render_template("index.html", stats=stats)


@dashboard_bp.route("/api/dashboard", methods=["GET"])
@dashboard_bp.route("/api/dashboard/stats", methods=["GET"])
def api_dashboard():
    """API endpoint returning overview statistics as JSON."""
    return jsonify(get_dashboard_overview()), 200
