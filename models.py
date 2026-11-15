from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

def utcnow():
    return datetime.now(timezone.utc)

class BaseModel(db.Model):
    __abstract__ = True

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class User(BaseModel):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    # Roles: ADMIN, DISTRICT_HEALTH_OFFICER, DOCTOR, ASHA_WORKER, COMMUNITY_USER, patient (legacy)
    role = db.Column(db.String(30), nullable=False, default="COMMUNITY_USER")
    created_at = db.Column(db.DateTime, default=utcnow)

    # Relationships
    vital_records = db.relationship("VitalRecord", backref="user", lazy=True, cascade="all, delete-orphan")
    alerts = db.relationship("Alert", backref="user", lazy=True, cascade="all, delete-orphan")
    asha_profile = db.relationship("AshaWorker", backref="user", uselist=False, lazy=True, cascade="all, delete-orphan")


    @property
    def name(self):
        return self.full_name

    @name.setter
    def name(self, val):
        self.full_name = val

    @property
    def password(self):
        return self.password_hash

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.full_name,
            "full_name": self.full_name,
            "email": self.email,
            "role": self.role,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }



class VitalRecord(BaseModel):
    __tablename__ = "vital_records"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    
    # 6 vitals (+ optional glucose)
    heart_rate = db.Column(db.Float, nullable=False)        # bpm
    spo2 = db.Column(db.Float, nullable=False)              # %
    systolic_bp = db.Column(db.Float, nullable=False)       # mmHg
    diastolic_bp = db.Column(db.Float, nullable=False)      # mmHg
    temperature = db.Column(db.Float, nullable=False)       # °C
    respiratory_rate = db.Column(db.Float, nullable=False)  # breaths/min
    glucose = db.Column(db.Float, nullable=True)            # mg/dL (optional)
    
    recorded_at = db.Column(db.DateTime, default=utcnow, index=True)
    risk_level = db.Column(db.String(20), nullable=False)   # NORMAL, WARNING, CRITICAL
    risk_score = db.Column(db.Float, nullable=False)        # 0 - 100
    ai_explanation = db.Column(db.Text, nullable=False)

    alerts = db.relationship("Alert", backref="vital_record", lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "heart_rate": self.heart_rate,
            "spo2": self.spo2,
            "systolic_bp": self.systolic_bp,
            "diastolic_bp": self.diastolic_bp,
            "temperature": self.temperature,
            "respiratory_rate": self.respiratory_rate,
            "glucose": self.glucose,
            "recorded_at": self.recorded_at.isoformat() if self.recorded_at else None,
            "risk_level": self.risk_level,
            "risk_score": round(self.risk_score, 1),
            "ai_explanation": self.ai_explanation
        }


class Alert(BaseModel):
    __tablename__ = "alerts"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    vital_record_id = db.Column(db.Integer, db.ForeignKey("vital_records.id"), nullable=True, index=True)
    severity = db.Column(db.String(20), nullable=True)     # WARNING, CRITICAL
    message = db.Column(db.Text, nullable=True)
    acknowledged = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, index=True)

    # Feature #6: Early Warning Alerts attributes
    village = db.Column(db.String(120), nullable=True, index=True)
    level = db.Column(db.String(20), nullable=True, index=True)       # NORMAL, WATCH, ELEVATED, CRITICAL
    risk_score = db.Column(db.Float, nullable=True)
    reasons = db.Column(db.Text, nullable=True)                      # JSON-serialized list of strings
    recommended_action = db.Column(db.Text, nullable=True)
    assigned_to = db.Column(db.String(120), nullable=True)           # ASHA worker name
    status = db.Column(db.String(20), default="active", nullable=True, index=True) # "active" or "resolved"

    def to_dict(self):
        import json
        reasons_list = []
        if self.reasons:
            try:
                reasons_list = json.loads(self.reasons) if isinstance(self.reasons, str) else list(self.reasons)
            except Exception:
                reasons_list = [self.reasons]
        elif self.message:
            reasons_list = [self.message]

        level_val = self.level or self.severity or "NORMAL"
        score_val = self.risk_score if self.risk_score is not None else 0
        status_val = self.status or ("resolved" if self.acknowledged else "active")
        village_val = self.village or "General"
        rec_action = self.recommended_action or "No action needed"

        return {
            "id": self.id,
            "user_id": self.user_id,
            "vital_record_id": self.vital_record_id,
            "village": village_val,
            "level": level_val,
            "riskScore": score_val,
            "risk_score": score_val,
            "reasons": reasons_list,
            "recommendedAction": rec_action,
            "recommended_action": rec_action,
            "assignedTo": self.assigned_to,
            "assigned_to": self.assigned_to,
            "status": status_val,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "severity": self.severity or level_val,
            "message": self.message or f"Alert for {village_val}: {level_val}",
            "acknowledged": self.acknowledged or (status_val == "resolved")
        }



class AshaWorker(BaseModel):
    """Profile for an ASHA worker, linked 1-to-1 to a User."""
    __tablename__ = "asha_workers"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), unique=True, nullable=False)
    phone = db.Column(db.String(20), nullable=True)
    employee_id = db.Column(db.String(50), nullable=True)

    # Villages assigned to this worker
    villages = db.relationship("Village", backref="asha_worker", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "phone": self.phone,
            "employee_id": self.employee_id,
            "name": self.user.full_name if self.user else None,
            "email": self.user.email if self.user else None,
        }


class Village(BaseModel):
    """A village that can be assigned to an ASHA worker."""
    __tablename__ = "villages"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    district = db.Column(db.String(120), nullable=False)
    # Risk level: LOW, MEDIUM, HIGH
    risk_level = db.Column(db.String(10), nullable=False, default="LOW")
    asha_worker_id = db.Column(db.Integer, db.ForeignKey("asha_workers.id"), nullable=True, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "district": self.district,
            "risk_level": self.risk_level,
            "asha_worker_id": self.asha_worker_id,
        }


class PatientReport(BaseModel):
    """A patient report filed by an ASHA worker."""
    __tablename__ = "patient_reports"

    id = db.Column(db.Integer, primary_key=True)
    asha_worker_id = db.Column(db.Integer, db.ForeignKey("asha_workers.id"), nullable=False, index=True)
    village_id = db.Column(db.Integer, db.ForeignKey("villages.id"), nullable=False, index=True)

    patient_name = db.Column(db.String(120), nullable=False)
    age = db.Column(db.Integer, nullable=False)
    gender = db.Column(db.String(10), nullable=False)   # Male / Female / Other
    symptoms = db.Column(db.Text, nullable=False)
    risk_level = db.Column(db.String(10), nullable=False, default="LOW")  # LOW / MEDIUM / HIGH
    reported_at = db.Column(db.DateTime, default=utcnow, index=True)

    # Relationships for convenient access
    asha_worker = db.relationship("AshaWorker", backref="patient_reports", lazy=True)
    village = db.relationship("Village", backref="patient_reports", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "asha_worker_id": self.asha_worker_id,
            "village_id": self.village_id,
            "patient_name": self.patient_name,
            "age": self.age,
            "gender": self.gender,
            "symptoms": self.symptoms,
            "risk_level": self.risk_level,
            "reported_at": self.reported_at.isoformat() if self.reported_at else None,
        }


class SymptomReport(BaseModel):
    """A symptom report filed by an ASHA worker (multi-select tags stored as CSV)."""
    __tablename__ = "symptom_reports"

    id = db.Column(db.Integer, primary_key=True)
    asha_worker_id = db.Column(db.Integer, db.ForeignKey("asha_workers.id"), nullable=False, index=True)
    village_id = db.Column(db.Integer, db.ForeignKey("villages.id"), nullable=False, index=True)

    patient_name = db.Column(db.String(120), nullable=False)
    age = db.Column(db.Integer, nullable=False)
    # Comma-separated selected symptoms e.g. "Fever,Cough,Rash"
    symptoms = db.Column(db.Text, nullable=False)
    severity = db.Column(db.String(10), nullable=False, default="MILD")  # MILD / MODERATE / SEVERE
    notes = db.Column(db.Text, nullable=True)
    reported_at = db.Column(db.DateTime, default=utcnow, index=True)

    asha_worker = db.relationship("AshaWorker", backref="symptom_reports", lazy=True)
    village = db.relationship("Village", backref="symptom_reports", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "asha_worker_id": self.asha_worker_id,
            "village_id": self.village_id,
            "patient_name": self.patient_name,
            "age": self.age,
            "symptoms": self.symptoms,
            "severity": self.severity,
            "notes": self.notes,
            "reported_at": self.reported_at.isoformat() if self.reported_at else None,
        }


class WaterReport(BaseModel):
    """A water-quality / contamination report filed by an ASHA worker."""
    __tablename__ = "water_reports"

    id = db.Column(db.Integer, primary_key=True)
    asha_worker_id = db.Column(db.Integer, db.ForeignKey("asha_workers.id"), nullable=False, index=True)
    village_id     = db.Column(db.Integer, db.ForeignKey("villages.id"),     nullable=False, index=True)

    # Enum-style string columns — validated in the route layer
    water_source_type  = db.Column(db.String(20), nullable=False)   # HANDPUMP/WELL/TAP/POND/RIVER/OTHER
    contamination_type = db.Column(db.String(20), nullable=False)   # TURBID/FOUL_SMELL/DISCOLORED/CHEMICAL/UNKNOWN
    affected_households = db.Column(db.Integer, nullable=False)
    severity = db.Column(db.String(10), nullable=False)             # LOW/MEDIUM/HIGH
    notes    = db.Column(db.Text, nullable=True)
    reported_at = db.Column(db.DateTime, default=utcnow, index=True)

    asha_worker = db.relationship("AshaWorker", backref="water_reports", lazy=True)
    village     = db.relationship("Village",    backref="water_reports", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "asha_worker_id": self.asha_worker_id,
            "village_id": self.village_id,
            "water_source_type": self.water_source_type,
            "contamination_type": self.contamination_type,
            "affected_households": self.affected_households,
            "severity": self.severity,
            "notes": self.notes,
            "reported_at": self.reported_at.isoformat() if self.reported_at else None,
        }


def calculate_water_source_risk(ph, turbidity, bacterial_status):
    """
    Auto-calculate risk_status:
      - contaminated if bacterial_status = contaminated, OR ph < 6.5 or > 8.5, OR turbidity > 5
      - warning if ph or turbidity is within 10% of those limits
      - otherwise safe
    """
    bacterial = str(bacterial_status or "").strip().lower()
    try:
        ph_val = float(ph)
        turb_val = float(turbidity)
    except (ValueError, TypeError):
        return "contaminated"

    if bacterial == "contaminated" or ph_val < 6.5 or ph_val > 8.5 or turb_val > 5.0:
        return "contaminated"

    # 10% proximity to limits:
    # 6.5 to 7.15 (near lower acidic limit 6.5)
    # 7.65 to 8.5 (near upper alkaline limit 8.5)
    # 4.5 to 5.0 (near turbidity limit 5.0 NTU)
    if (6.5 <= ph_val <= 7.15) or (7.65 <= ph_val <= 8.5) or (4.5 <= turb_val <= 5.0):
        return "warning"

    return "safe"


class WaterSource(BaseModel):
    """Feature #9: Water Source entity for community water monitoring."""
    __tablename__ = "water_sources"

    id = db.Column(db.Integer, primary_key=True)
    village_id = db.Column(db.Integer, db.ForeignKey("villages.id"), nullable=True, index=True)
    source_name = db.Column(db.String(120), nullable=False)
    # Types: hand_pump | well | river | tap | other
    source_type = db.Column(db.String(50), nullable=False, default="hand_pump")
    ph = db.Column(db.Float, nullable=False)
    turbidity = db.Column(db.Float, nullable=False)
    # bacterial_status: safe | contaminated
    bacterial_status = db.Column(db.String(20), nullable=False, default="safe")
    last_tested = db.Column(db.Date, nullable=False)
    # risk_status: safe | warning | contaminated
    risk_status = db.Column(db.String(20), nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow)

    village = db.relationship("Village", backref="water_sources", lazy=True)

    def to_dict(self):
        village_name = self.village.name if self.village else (f"Village #{self.village_id}" if self.village_id else "General Community")
        return {
            "id": self.id,
            "village_id": self.village_id,
            "village_name": village_name,
            "source_name": self.source_name,
            "source_type": self.source_type,
            "ph": round(float(self.ph), 2) if self.ph is not None else 7.0,
            "turbidity": round(float(self.turbidity), 2) if self.turbidity is not None else 1.0,
            "bacterial_status": self.bacterial_status,
            "last_tested": self.last_tested.strftime("%Y-%m-%d") if self.last_tested else None,
            "last_tested_formatted": self.last_tested.strftime("%d %b") if self.last_tested else "N/A",
            "risk_status": self.risk_status,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class AwarenessContent(BaseModel):
    """Feature #12: Health Awareness & Prevention Content."""
    __tablename__ = "awareness_content"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.String(500), nullable=False)
    content = db.Column(db.Text, nullable=False)
    language = db.Column(db.String(10), nullable=False, default="en", index=True)
    category = db.Column(db.String(50), nullable=False, default="other", index=True)
    icon = db.Column(db.String(20), nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow)

    def to_dict(self):
        default_icons = {
            "water": "💧",
            "disease": "🦠",
            "hygiene": "🧼",
            "other": "📌"
        }
        effective_icon = self.icon if (self.icon and self.icon.strip()) else default_icons.get(self.category, "📌")
        steps = [line.strip() for line in (self.content or "").split("\n") if line.strip()]
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "content": self.content,
            "steps": steps,
            "language": self.language,
            "category": self.category,
            "icon": effective_icon,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class CaseFollowUp(BaseModel):
    """Feature #14: Case Follow-up Entity for tracking reported cases."""
    __tablename__ = "case_followups"

    id = db.Column(db.Integer, primary_key=True)
    patient_name = db.Column(db.String(120), nullable=False, default="Anonymous")
    village = db.Column(db.String(120), nullable=False, index=True)
    reported_date = db.Column(db.Date, nullable=False, index=True)
    # Comma-separated symptoms or list of strings
    symptoms = db.Column(db.Text, nullable=True)
    # Status: REPORTED, UNDER_OBSERVATION, REFERRED, RECOVERED
    status = db.Column(db.String(30), nullable=False, default="REPORTED", index=True)
    follow_up_date = db.Column(db.Date, nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow)

    def to_dict(self):
        symptom_list = [s.strip() for s in (self.symptoms or "").split(",") if s.strip()]
        return {
            "id": self.id,
            "caseNumber": f"Case #{self.id}",
            "case_number": f"Case #{self.id}",
            "patientName": self.patient_name or "Anonymous",
            "patient_name": self.patient_name or "Anonymous",
            "village": self.village,
            "reportedDate": self.reported_date.strftime("%Y-%m-%d") if self.reported_date else None,
            "reported_date": self.reported_date.strftime("%Y-%m-%d") if self.reported_date else None,
            "symptoms": symptom_list,
            "symptoms_raw": self.symptoms or "",
            "status": self.status or "REPORTED",
            "followUpDate": self.follow_up_date.strftime("%Y-%m-%d") if self.follow_up_date else None,
            "follow_up_date": self.follow_up_date.strftime("%Y-%m-%d") if self.follow_up_date else None,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


