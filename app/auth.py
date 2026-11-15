from datetime import datetime, timedelta, timezone
from functools import wraps
import bcrypt
import jwt
from flask import Blueprint, request, jsonify, current_app
from app.models import db, User

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def generate_jwt_token(user_id, role):
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(hours=current_app.config.get("JWT_EXPIRATION_HOURS", 24))
    }
    secret = current_app.config.get("JWT_SECRET_KEY")
    return jwt.encode(payload, secret, algorithm="HS256")


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            return jsonify({"error": "Authorization header missing"}), 401
        
        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return jsonify({"error": "Invalid Authorization header format. Expected 'Bearer <token>'"}), 401
        
        token = parts[1]
        secret = current_app.config.get("JWT_SECRET_KEY")
        
        try:
            payload = jwt.decode(token, secret, algorithms=["HS256"])
            user_id = int(payload.get("sub"))
            user = db.session.get(User, user_id)
            if not user:
                return jsonify({"error": "User account no longer exists"}), 401
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Session token has expired. Please log in again."}), 401
        except (jwt.InvalidTokenError, Exception) as e:
            return jsonify({"error": "Invalid token"}), 401

        return f(current_user=user, *args, **kwargs)
    return decorated


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    full_name = (data.get("full_name") or data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()
    raw_role = (data.get("role") or "").strip()

    if not full_name:
        return jsonify({"error": "Full name is required"}), 400
    if not email or "@" not in email:
        return jsonify({"error": "A valid email address is required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    # Valid roles normalization
    upper_role = raw_role.upper()
    if upper_role in ["ADMIN", "DISTRICT_HEALTH_OFFICER", "DOCTOR", "ASHA_WORKER", "COMMUNITY_USER"]:
        role = upper_role
    elif raw_role.lower() == "doctor":
        role = "DOCTOR"
    elif raw_role.lower() == "patient":
        role = "COMMUNITY_USER"
    else:
        role = "COMMUNITY_USER"

    # Check if user already exists
    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        return jsonify({"error": "An account with this email already exists"}), 409

    # Hash password with bcrypt
    salt = bcrypt.gensalt(rounds=10)
    password_hash = bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

    user = User(
        full_name=full_name,
        email=email,
        password_hash=password_hash,
        role=role
    )
    db.session.add(user)
    db.session.commit()

    # If ASHA_WORKER, create corresponding AshaWorker profile
    if role == "ASHA_WORKER":
        from app.models import AshaWorker
        worker = AshaWorker(
            user_id=user.id,
            phone=(data.get("phone") or "").strip() or "N/A",
            employee_id=(data.get("employee_id") or "").strip() or f"ASHA-REG-{user.id:04d}"
        )
        db.session.add(worker)
        db.session.commit()

    token = generate_jwt_token(user.id, user.role)

    role_redirects = {
        "ASHA_WORKER": "/asha/dashboard",
        "ADMIN": "/dashboard",
        "DISTRICT_HEALTH_OFFICER": "/dashboard",
        "DOCTOR": "/dashboard",
        "COMMUNITY_USER": "/dashboard",
    }
    redirect_to = role_redirects.get(role, "/dashboard")

    return jsonify({
        "message": "Registration successful",
        "token": token,
        "user": user.to_dict(),
        "redirect_to": redirect_to
    }), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({"error": "Invalid email or password"}), 401

    # Verify bcrypt hash
    if not bcrypt.checkpw(password.encode("utf-8"), user.password_hash.encode("utf-8")):
        return jsonify({"error": "Invalid email or password"}), 401

    token = generate_jwt_token(user.id, user.role)

    # Redirect based on role: ASHA_WORKER to /asha/dashboard, all other roles to /dashboard
    role_redirects = {
        "ASHA_WORKER": "/asha/dashboard",
        "ADMIN": "/dashboard",
        "DISTRICT_HEALTH_OFFICER": "/dashboard",
        "DOCTOR": "/dashboard",
        "COMMUNITY_USER": "/dashboard",
    }
    normalized_role = (user.role or "").upper()
    redirect_to = role_redirects.get(normalized_role, "/dashboard")

    return jsonify({
        "message": "Login successful",
        "token": token,
        "user": user.to_dict(),
        "redirect_to": redirect_to,
    }), 200


@auth_bp.route("/me", methods=["GET"])
@token_required
def get_current_user(current_user):
    return jsonify({
        "user": current_user.to_dict()
    }), 200


def seed_demo_accounts(app):
    """Seed demo accounts so that login demo buttons and manual entry work out of the box."""
    with app.app_context():
        demos = [
            ("Alex Johnson", "patient@vitalwatch.org", "password123", "COMMUNITY_USER"),
            ("Dr. Sarah Miller", "doctor@vitalwatch.org", "password123", "DOCTOR"),
        ]
        salt = bcrypt.gensalt(rounds=10)
        updated = False
        for name, email, pwd, role in demos:
            u = User.query.filter_by(email=email).first()
            if not u:
                pw_hash = bcrypt.hashpw(pwd.encode("utf-8"), salt).decode("utf-8")
                u = User(full_name=name, email=email, password_hash=pw_hash, role=role)
                db.session.add(u)
                updated = True
            else:
                if not bcrypt.checkpw(pwd.encode("utf-8"), u.password_hash.encode("utf-8")):
                    u.password_hash = bcrypt.hashpw(pwd.encode("utf-8"), salt).decode("utf-8")
                    updated = True
        if updated:
            db.session.commit()

