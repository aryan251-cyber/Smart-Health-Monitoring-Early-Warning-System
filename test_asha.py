import json
import unittest
from app import create_app
from app.models import db, User, AshaWorker, Village

class AshaWorkerTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def test_seed_data_integrity(self):
        """Verify the test seed creates 1 ASHA user and 5 assigned villages."""
        with self.app.app_context():
            user = User.query.filter_by(email="asha@test.com").first()
            self.assertIsNotNone(user, "ASHA test user should exist")
            self.assertEqual(user.role, "ASHA_WORKER")
            self.assertIsNotNone(user.asha_profile, "ASHA profile should exist")
            
            villages = Village.query.filter_by(asha_worker_id=user.asha_profile.id).all()
            self.assertEqual(len(villages), 5, "ASHA worker should have 5 assigned villages")
            risk_levels = {v.risk_level for v in villages}
            self.assertTrue({"LOW", "MEDIUM", "HIGH"}.issubset(risk_levels), "Should have varied risk levels")

    def test_asha_login_and_redirect(self):
        """ASHA worker login should return token and redirect_to: /asha/dashboard."""
        res = self.client.post("/api/auth/login", json={
            "email": "asha@test.com",
            "password": "asha123"
        })
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn("token", data)
        self.assertEqual(data["redirect_to"], "/asha/dashboard")
        self.assertEqual(data["user"]["role"], "ASHA_WORKER")

    def test_other_roles_redirect_to_main_dashboard(self):
        """Non-ASHA roles should be redirected to /dashboard."""
        with self.app.app_context():
            # Create test admin
            if not User.query.filter_by(email="admin@test.com").first():
                import bcrypt
                salt = bcrypt.gensalt(rounds=4)
                admin = User(
                    full_name="Admin User",
                    email="admin@test.com",
                    password_hash=bcrypt.hashpw(b"admin123", salt).decode("utf-8"),
                    role="ADMIN"
                )
                db.session.add(admin)
                db.session.commit()

        res = self.client.post("/api/auth/login", json={
            "email": "admin@test.com",
            "password": "admin123"
        })
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data["redirect_to"], "/dashboard")

    def test_dashboard_api_counts(self):
        """ASHA dashboard API should return 4 counts with exact keys."""
        # 1. Login to get token
        login_res = self.client.post("/api/auth/login", json={
            "email": "asha@test.com",
            "password": "asha123"
        })
        token = json.loads(login_res.data)["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Get dashboard stats
        res = self.client.get("/api/asha/dashboard", headers=headers)
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn("assignedVillages", data)
        self.assertIn("todaysReports", data)
        self.assertIn("activeAlerts", data)
        self.assertIn("highRiskAreas", data)

        self.assertEqual(data["assignedVillages"], 5)
        self.assertEqual(data["highRiskAreas"], 2)
        self.assertIsInstance(data["todaysReports"], int)
        self.assertIsInstance(data["activeAlerts"], int)

    def test_villages_api(self):
        """ASHA villages API should return assigned villages with risk levels."""
        login_res = self.client.post("/api/auth/login", json={
            "email": "asha@test.com",
            "password": "asha123"
        })
        token = json.loads(login_res.data)["token"]
        headers = {"Authorization": f"Bearer {token}"}

        res = self.client.get("/api/asha/villages", headers=headers)
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data["count"], 5)
        names = [v["name"] for v in data["villages"]]
        self.assertIn("Rampur", names)
        self.assertIn("Sonwadi", names)

    def test_profile_api(self):
        """ASHA profile API should return worker profile and assigned villages."""
        login_res = self.client.post("/api/auth/login", json={
            "email": "asha@test.com",
            "password": "asha123"
        })
        token = json.loads(login_res.data)["token"]
        headers = {"Authorization": f"Bearer {token}"}

        res = self.client.get("/api/asha/profile", headers=headers)
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn("profile", data)
        profile = data["profile"]
        self.assertEqual(profile["email"], "asha@test.com")
        self.assertEqual(profile["phone"], "9876543210")
        self.assertEqual(profile["employee_id"], "ASHA-MH-00421")
        self.assertEqual(len(profile["villages"]), 5)

    def test_role_based_access_control(self):
        """Unauthenticated or unauthorized users cannot access /api/asha/*."""
        # Unauthenticated
        res = self.client.get("/api/asha/dashboard")
        self.assertEqual(res.status_code, 401)

        # Non-ASHA user (Doctor)
        with self.app.app_context():
            doc = User.query.filter_by(role="DOCTOR").first()
            if not doc:
                import bcrypt
                salt = bcrypt.gensalt(rounds=4)
                doc = User(
                    full_name="Doctor Strange",
                    email="doc@test.com",
                    password_hash=bcrypt.hashpw(b"doc123", salt).decode("utf-8"),
                    role="DOCTOR"
                )
                db.session.add(doc)
                db.session.commit()
            doc_email = doc.email
            doc_pwd = "password123" if doc_email == "sarah@example.com" else "doc123"

        doc_login = self.client.post("/api/auth/login", json={
            "email": doc_email,
            "password": doc_pwd
        })
        if doc_login.status_code == 200:
            doc_token = json.loads(doc_login.data)["token"]
            forbidden_res = self.client.get("/api/asha/dashboard", headers={"Authorization": f"Bearer {doc_token}"})
            self.assertEqual(forbidden_res.status_code, 403)


    def test_page_routes_render(self):
        """All HTML pages render with status 200."""
        routes = [
            "/asha/dashboard",
            "/asha/profile",
            "/asha/villages",
            "/asha/report-patient",       # real page (replaces stub)
            "/asha/report-symptoms",      # real page (replaces stub)
            "/asha/report-water",         # real page (replaces stub)
            "/asha/alerts",               # real page (replaces stub)
            "/placeholder"
        ]
        for route in routes:
            res = self.client.get(route)
            self.assertEqual(res.status_code, 200, f"Route {route} should render 200 OK")

        # Old stub URLs should redirect (302) to the real pages
        for stub_action in ["report-patient", "report-symptoms", "report-water", "view-alerts"]:
            res = self.client.get(f"/asha/stub/{stub_action}")
            self.assertEqual(res.status_code, 302, f"Stub {stub_action} should redirect (302)")

    def test_report_patient_api_submit(self):
        """POST /api/asha/report-patient saves a report and increments today's count."""
        login_res = self.client.post("/api/auth/login", json={
            "email": "asha@test.com",
            "password": "asha123"
        })
        token = json.loads(login_res.data)["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Get the first assigned village id
        villages_res = self.client.get("/api/asha/villages", headers=headers)
        villages = json.loads(villages_res.data)["villages"]
        village_id = villages[0]["id"]

        # Before submit: record today's report count
        dash_res = self.client.get("/api/asha/dashboard", headers=headers)
        before_count = json.loads(dash_res.data)["todaysReports"]

        # Submit a valid report
        res = self.client.post("/api/asha/report-patient", headers=headers, json={
            "patient_name": "Test Patient",
            "age": 42,
            "gender": "Female",
            "village_id": village_id,
            "symptoms": "Fever and fatigue",
            "risk_level": "MEDIUM",
        })
        self.assertEqual(res.status_code, 201)
        data = json.loads(res.data)
        self.assertIn("id", data)
        self.assertEqual(data["message"], "Report saved successfully.")

        # Today's reports should have incremented by 1
        dash_res2 = self.client.get("/api/asha/dashboard", headers=headers)
        after_count = json.loads(dash_res2.data)["todaysReports"]
        self.assertEqual(after_count, before_count + 1)

    def test_report_patient_validation_errors(self):
        """POST with missing fields returns 422 with per-field errors."""
        login_res = self.client.post("/api/auth/login", json={
            "email": "asha@test.com",
            "password": "asha123"
        })
        token = json.loads(login_res.data)["token"]
        headers = {"Authorization": f"Bearer {token}"}

        res = self.client.post("/api/asha/report-patient", headers=headers, json={})
        self.assertEqual(res.status_code, 422)
        errors = json.loads(res.data)["errors"]
        self.assertIn("patient_name", errors)
        self.assertIn("age", errors)
        self.assertIn("village_id", errors)
        self.assertIn("symptoms", errors)


if __name__ == "__main__":
    unittest.main()
