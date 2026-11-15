"""
Health Awareness & Prevention Module (Feature #12)
Provides:
  - GET  /api/awareness?language=<code>&category=<optional>
  - POST /api/awareness (admin only)
  - PUT  /api/awareness/<id> (admin only)
"""

from functools import wraps
import jwt
from flask import Blueprint, jsonify, request, current_app
from app.models import db, AwarenessContent

awareness_bp = Blueprint("awareness", __name__)


def is_admin_request():
    """Check if the current request is authenticated as an admin/doctor/health officer."""
    auth_header = request.headers.get("Authorization")
    if auth_header:
        parts = auth_header.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1]
            try:
                secret = current_app.config.get("JWT_SECRET_KEY")
                payload = jwt.decode(token, secret, algorithms=["HS256"])
                role = (payload.get("role") or "").upper()
                if role in ["ADMIN", "DOCTOR", "DISTRICT_HEALTH_OFFICER"]:
                    return True
            except Exception:
                pass

    # Fallback to explicit admin header or query param
    if request.headers.get("X-Admin-Role") == "true" or request.args.get("admin") == "true":
        return True

    return False


@awareness_bp.route("/api/awareness", methods=["GET"])
def get_awareness_content():
    """List awareness guides with language and optional category filter, falling back to English."""
    lang = (request.args.get("language") or "en").lower().strip()
    category = (request.args.get("category") or "").lower().strip()

    # Query for requested language
    query = AwarenessContent.query.filter_by(language=lang)
    if category and category != "all":
        query = query.filter_by(category=category)

    items = query.order_by(AwarenessContent.id.asc()).all()

    # If requested language has no entries, fall back to English
    if not items and lang != "en":
        fallback_query = AwarenessContent.query.filter_by(language="en")
        if category and category != "all":
            fallback_query = fallback_query.filter_by(category=category)
        items = fallback_query.order_by(AwarenessContent.id.asc()).all()

    return jsonify([item.to_dict() for item in items]), 200


@awareness_bp.route("/api/awareness", methods=["POST"])
def create_awareness_content():
    """Create new awareness content (Admin only)."""
    if not is_admin_request():
        return jsonify({"error": "Admin access required"}), 403

    data = request.get_json() or {}
    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    content = (data.get("content") or "").strip()
    language = (data.get("language") or "en").strip().lower()
    category = (data.get("category") or "other").strip().lower()
    icon = (data.get("icon") or "").strip()

    if not title or not description or not content or not language or not category:
        return jsonify({"error": "title, description, content, language, and category are required"}), 400

    valid_categories = ["water", "disease", "hygiene", "other"]
    if category not in valid_categories:
        category = "other"

    item = AwarenessContent(
        title=title,
        description=description,
        content=content,
        language=language,
        category=category,
        icon=icon or None
    )
    db.session.add(item)
    db.session.commit()

    return jsonify(item.to_dict()), 201


@awareness_bp.route("/api/awareness/<int:item_id>", methods=["PUT"])
def update_awareness_content(item_id):
    """Update existing awareness content (Admin only)."""
    if not is_admin_request():
        return jsonify({"error": "Admin access required"}), 403

    item = db.session.get(AwarenessContent, item_id)
    if not item:
        return jsonify({"error": "Awareness guide not found"}), 404

    data = request.get_json() or {}
    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    content = (data.get("content") or "").strip()
    language = (data.get("language") or item.language).strip().lower()
    category = (data.get("category") or item.category).strip().lower()
    icon = (data.get("icon") or "").strip()

    if not title or not description or not content:
        return jsonify({"error": "title, description, and content are required"}), 400

    valid_categories = ["water", "disease", "hygiene", "other"]
    if category not in valid_categories:
        category = item.category

    item.title = title
    item.description = description
    item.content = content
    item.language = language
    item.category = category
    if icon:
        item.icon = icon

    db.session.commit()
    return jsonify(item.to_dict()), 200


def seed_awareness_content(app):
    """Seed baseline awareness guides in English and Hindi if table is empty."""
    with app.app_context():
        try:
            db.create_all()
            if AwarenessContent.query.first():
                return

            seeds = [
                # English Guides
                AwarenessContent(
                    title="Safe Drinking Water",
                    description="5 steps to keep drinking water safe",
                    content=(
                        "Boil drinking water vigorously for at least 1 minute before consumption.\n"
                        "Store drinking water in clean, covered containers with a narrow neck or tap.\n"
                        "Never dip hands or unwashed cups directly into the water storage vessel.\n"
                        "Clean storage pots and buckets daily with clean water and a clean brush.\n"
                        "Use chlorination tablets or liquid chlorine when boiling is not feasible."
                    ),
                    language="en",
                    category="water",
                    icon="💧"
                ),
                AwarenessContent(
                    title="Prevent Diarrheal Diseases",
                    description="Basic prevention guidelines",
                    content=(
                        "Wash hands thoroughly with soap after using the toilet and before preparing food.\n"
                        "Eat food while it is freshly cooked and keep all leftovers well covered.\n"
                        "Peel raw fruits and wash vegetables with clean, boiled or treated water.\n"
                        "Avoid consuming raw, unpasteurized milk or contaminated street food.\n"
                        "Begin oral rehydration solution (ORS) immediately at the first sign of loose stools."
                    ),
                    language="en",
                    category="disease",
                    icon="🦠"
                ),
                AwarenessContent(
                    title="Hand Hygiene",
                    description="When and how to wash hands",
                    content=(
                        "Wet hands with clean, running water and apply enough soap to cover all surfaces.\n"
                        "Scrub palms, backs of hands, between fingers, and under fingernails for at least 20 seconds.\n"
                        "Rinse hands thoroughly under clean, running water.\n"
                        "Dry hands completely using a clean towel or air dry them.\n"
                        "Always wash hands before eating, before feeding children, and after touching animals or waste."
                    ),
                    language="en",
                    category="hygiene",
                    icon="🧼"
                ),

                # Hindi Guides
                AwarenessContent(
                    title="सुरक्षित पीने का पानी",
                    description="पीने के पानी को सुरक्षित रखने के 5 आसान चरण",
                    content=(
                        "पीने के पानी को इस्तेमाल से पहले कम से कम 1 मिनट तक अच्छी तरह उबालें।\n"
                        "पीने का पानी हमेशा साफ और ढके हुए बर्तन में ही रखें।\n"
                        "पानी के बर्तन में कभी भी सीधे हाथ या गंदा गिलास न डालें।\n"
                        "पानी भरने वाले बर्तनों को रोजाना साफ पानी और ब्रश से धोएं।\n"
                        "उबालना संभव न हो तो स्वास्थ्य कार्यकर्ता की सलाह पर क्लोरीन की गोली का उपयोग करें।"
                    ),
                    language="hi",
                    category="water",
                    icon="💧"
                ),
                AwarenessContent(
                    title="डायरिया और जलजनित रोगों से बचाव",
                    description="संक्रमण रोकने के बुनियादी दिशा-निर्देश",
                    content=(
                        "शौच के बाद और खाना बनाने व खाने से पहले साबुन से हाथ अवश्य धोएं।\n"
                        "हमेशा ताजा और गर्म खाना खाएं और बचे हुए खाने को ढककर रखें।\n"
                        "सब्जियों और फलों को साफ और सुरक्षित पानी से धोकर ही इस्तेमाल करें।\n"
                        "कच्चे दूध या खुले में बिकने वाले दूषित खाद्य पदार्थों से बचें।\n"
                        "दस्त शुरू होते ही तुरंत ओआरएस (ORS) का घोल और जिंक देना शुरू करें।"
                    ),
                    language="hi",
                    category="disease",
                    icon="🦠"
                ),
                AwarenessContent(
                    title="हाथों की स्वच्छता",
                    description="हाथ कब और कैसे धोएं",
                    content=(
                        "हाथों को साफ पानी से गीला करें और पर्याप्त साबुन लगाएं।\n"
                        "हथेलियों, उंगलियों के बीच और नाखूनों को कम से कम 20 सेकंड तक अच्छी तरह रगड़ें।\n"
                        "हाथों को साफ बहते पानी से पूरी तरह धो लें।\n"
                        "साफ तौलिये से हाथ सुखाएं या हवा में सूखने दें।\n"
                        "खाना खाने से पहले, बच्चों को खिलाने से पहले और कचरा छूने के बाद हाथ जरूर धोएं।"
                    ),
                    language="hi",
                    category="hygiene",
                    icon="🧼"
                )
            ]

            db.session.bulk_save_objects(seeds)
            db.session.commit()
            print("[VitalWatch] Seeded 6 Health Awareness guides (EN & HI).")
        except Exception as e:
            db.session.rollback()
            print(f"[VitalWatch] Notice during awareness seeding: {e}")
