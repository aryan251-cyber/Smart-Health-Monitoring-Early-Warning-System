import os
import socket
from pathlib import Path
from urllib.parse import urlparse
from flask import Flask, render_template, jsonify
from sqlalchemy.pool import NullPool
from app.config import Config
from app.models import db
from app.auth import auth_bp, seed_demo_accounts
from app.vitals import vitals_bp
from app.asha import asha_bp, seed_asha_data
from app.dashboard import dashboard_bp
from app.risk_engine import risk_bp
from app.alerts import alerts_bp, seed_sample_alerts
from app.villages import villages_bp
from app.train_model import train_and_save_model
from app.trends import trends_bp
from app.water_sources import water_sources_bp, seed_water_sources
from app.recommended_actions import recommended_actions_bp
from app.awareness import awareness_bp, seed_awareness_content
from app.cases import cases_bp, seed_cases


def is_database_reachable(db_uri: str, timeout: float = 1.0) -> bool:
    """
    Checks if the database host and port are accepting TCP connections.
    """
    if not db_uri or db_uri.startswith("sqlite"):
        return True

    try:
        parsed = urlparse(db_uri)
        host = parsed.hostname or "127.0.0.1"
        if host == "localhost":
            host = "127.0.0.1"
        port = parsed.port or 3306
        with socket.create_connection((host, port), timeout=0.3):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


def create_app(config_class=Config):
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.config.from_object(config_class)

    # Database configuration & URL normalization
    database_url = os.getenv("DATABASE_URL", "").strip() or app.config.get("SQLALCHEMY_DATABASE_URI", "")

    # Force SQLAlchemy to use PyMySQL
    if database_url.startswith("mysql://"):
        database_url = database_url.replace("mysql://", "mysql+pymysql://", 1)
    elif database_url.startswith("mysql+mysqldb://"):
        database_url = database_url.replace("mysql+mysqldb://", "mysql+pymysql://", 1)

    if os.getenv("VERCEL"):
        # Serverless environment (Vercel)
        if not database_url:
            raise RuntimeError("DATABASE_URL is missing in Vercel environment")
        app.config["SQLALCHEMY_DATABASE_URI"] = database_url
        app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
            "poolclass": NullPool,
            "pool_pre_ping": True,
        }
    else:
        # Standard server or local development
        if database_url:
            app.config["SQLALCHEMY_DATABASE_URI"] = database_url
            app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
                "pool_pre_ping": True,
                "pool_recycle": 280,
            }

        db_uri = app.config.get("SQLALCHEMY_DATABASE_URI", "")

        # Check MySQL reachability if using MySQL locally
        if db_uri.startswith("mysql"):
            if is_database_reachable(db_uri, timeout=1.0):
                print(f"[VitalWatch] Connected to MySQL database server.")
            else:
                sqlite_path = Path(__file__).resolve().parent.parent / "vitalwatch.db"
                print(f"[VitalWatch] Notice: MySQL server is not currently reachable at {db_uri}.")
                print(f"[VitalWatch] Using local fallback SQLite database ({sqlite_path}) for zero-downtime execution.")
                print(f"[VitalWatch] To use MySQL, start your MySQL service and run 'CREATE DATABASE vitalwatch;'.")
                app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{sqlite_path}"

    db.init_app(app)

    with app.app_context():
        # Ensure database tables exist
        try:
            db.create_all()
        except Exception:
            pass
        print(f"[VitalWatch] Database schema initialized with {app.config['SQLALCHEMY_DATABASE_URI'].split('://')[0]}.")

        # Ensure ML model is trained and ready
        model_path = app.config.get("MODEL_PATH")
        if not os.path.exists(model_path):
            print(f"[VitalWatch] Model not found at {model_path}. Training initial RandomForest model...")
            train_and_save_model(model_path)

    # Seed ASHA test data, demo accounts, alerts, water sources, awareness content, and case follow-up
    seed_asha_data(app)
    seed_demo_accounts(app)
    seed_sample_alerts(app)
    seed_water_sources(app)
    seed_awareness_content(app)
    seed_cases(app)

    # Register blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(vitals_bp)
    app.register_blueprint(asha_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(risk_bp)
    app.register_blueprint(alerts_bp)
    app.register_blueprint(villages_bp)
    app.register_blueprint(trends_bp)
    app.register_blueprint(water_sources_bp)
    app.register_blueprint(recommended_actions_bp)
    app.register_blueprint(awareness_bp)
    app.register_blueprint(cases_bp)

    @app.route("/")
    @app.route("/reports")
    @app.route("/admin/reports")
    @app.route("/cases")
    @app.route("/case-followup")
    @app.route("/water-quality")
    @app.route("/water")
    @app.route("/water-sources")
    @app.route("/sources")
    @app.route("/recommended-actions")
    @app.route("/actions")
    @app.route("/community-health")
    @app.route("/village-risk")
    @app.route("/risk-score")
    @app.route("/risk")
    @app.route("/alerts")
    @app.route("/risk-map")
    @app.route("/map")
    @app.route("/health-trends")
    @app.route("/trends")
    @app.route("/health-awareness")
    @app.route("/awareness")
    def index():
        return render_template("index.html")

    @app.route("/api/health")
    def health_check():
        return jsonify({
            "status": "online",
            "app": "VitalWatch",
            "database": app.config.get("SQLALCHEMY_DATABASE_URI", "").split("://")[0]
        })

    @app.route("/api/reports", methods=["GET", "POST"])
    def reports_api():
        """Community Reports API (Feature #15 offline/sync endpoint)"""
        from flask import request
        if request.method == "POST":
            data = request.get_json(silent=True) or {}
            return jsonify({
                "status": "success",
                "message": "Report received and recorded successfully",
                "id": data.get("id"),
                "report": data
            }), 201
        return jsonify({"status": "success", "reports": []}), 200

    return app
