import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "vitalwatch-super-secret-key-production-2026-secure-key")
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "vitalwatch-jwt-secret-key-production-2026-secure-32bytes")
    JWT_EXPIRATION_HOURS = int(os.environ.get("JWT_EXPIRATION_HOURS", 24))
    
    # MySQL by default as specified in requirements
    MYSQL_USER = os.environ.get("DB_USER", "root")
    MYSQL_PASSWORD = os.environ.get("DB_PASSWORD", "")
    MYSQL_HOST = os.environ.get("DB_HOST", "localhost")
    MYSQL_PORT = os.environ.get("DB_PORT", "3306")
    MYSQL_NAME = os.environ.get("DB_NAME", "vitalwatch")
    
    DEFAULT_MYSQL_URL = (
        f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_NAME}"
    )
    
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", DEFAULT_MYSQL_URL)
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Model path
    MODEL_PATH = os.environ.get("MODEL_PATH", str(BASE_DIR / "model" / "vitalwatch_rf.joblib"))
