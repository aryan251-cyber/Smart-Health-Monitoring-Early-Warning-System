import json
import unittest
import bcrypt
from datetime import datetime, timezone
from app import create_app
from app.models import db, User, AshaWorker, Village, Alert, VitalRecord

class MainDashboardTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def test_routing_by_role(self):
        """Verify login redirects by role: ASHA_WORKER -> /asha/dashboard, all other roles -> /dashboard."""
        salt = bcrypt.gensalt(rounds=4)
        pw_hash = bcrypt.hashpw(b"testpass123", salt).decode("utf-8")

        test_roles = [
            ("ADMIN", "/dashboard"),
            ("DISTRICT_HEALTH_OFFICER", "/dashboard"),
            ("DOCTOR", "/dashboard"),
            ("COMMUNITY_USER", "/dashboard"),
            ("ASHA_WORKER", "/asha/dashboard"),
        ]

        with self.app.app_context():
            for role, _ in test_roles:
                email = f"{role.lower()}@test.org"
                user = User.query.filter_by(email=email).first()
                if not user:
                    user = User(
                        full_name=f"Test {role}",
                        email=email,
                        password_hash=pw_hash,
                        role=role
                    )
                    db.session.add(user)
            db.session.commit()

        for role, expected_redirect in test_roles:
            email = f"{role.lower()}@test.org"
            res = self.client.post("/api/auth/login", json={
                "email": email,
                "password": "testpass123"
            })
            self.assertEqual(res.status_code, 200)
            data = json.loads(res.data)
            self.assertEqual(data["redirect_to"], expected_redirect, f"Role {role} should redirect to {expected_redirect}")

    def test_dashboard_html_page_renders(self):
        """GET /dashboard serves the main dashboard HTML page."""
        res = self.client.get("/dashboard")
        self.assertEqual(res.status_code, 200)
        content = res.data.decode("utf-8")
        self.assertIn("VitalWatch", content)
        self.assertIn("Total Villages", content)
        self.assertIn("Total ASHA Workers", content)
        self.assertIn("Total Reports Today", content)
        self.assertIn("Active Alerts", content)
        self.assertIn("High Risk Villages", content)
        self.assertIn("High Priority Villages", content)
        self.assertIn("Recent Activity", content)

    def test_dashboard_json_endpoint(self):
        """GET /api/dashboard returns the 5 required stats with real counts and safe defaults."""
        res = self.client.get("/api/dashboard")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)

        # 5 required overview stats
        self.assertIn("totalVillages", data)
        self.assertIn("totalAshaWorkers", data)
        self.assertIn("totalReportsToday", data)
        self.assertIn("activeAlerts", data)
        self.assertIn("highRiskVillages", data)

        self.assertIsInstance(data["totalVillages"], int)
        self.assertIsInstance(data["totalAshaWorkers"], int)
        self.assertIsInstance(data["totalReportsToday"], int)
        self.assertIsInstance(data["activeAlerts"], int)
        self.assertIsInstance(data["highRiskVillages"], int)

        # Overview sections
        self.assertIn("topRiskVillages", data)
        self.assertIn("recentActivity", data)
        self.assertIsInstance(data["topRiskVillages"], list)
        self.assertIsInstance(data["recentActivity"], list)

    def test_dashboard_endpoint_accept_json_header(self):
        """GET /dashboard with Accept: application/json returns overview stats."""
        res = self.client.get("/dashboard", headers={"Accept": "application/json"})
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn("totalVillages", data)
        self.assertIn("totalAshaWorkers", data)

    def test_risk_order_and_activity_data(self):
        """Verify villages are sorted by risk (HIGH first) and recent activity has valid structure."""
        res = self.client.get("/api/dashboard")
        data = json.loads(res.data)

        if data["topRiskVillages"]:
            # If high risk villages exist, the first item should be HIGH
            high_count = sum(1 for v in data["topRiskVillages"] if v["risk_level"] == "HIGH")
            if high_count > 0:
                self.assertEqual(data["topRiskVillages"][0]["risk_level"], "HIGH")

        # Recent activity items structure
        for item in data["recentActivity"]:
            self.assertIn("type", item)
            self.assertIn("severity", item)
            self.assertIn("message", item)


if __name__ == "__main__":
    unittest.main()
