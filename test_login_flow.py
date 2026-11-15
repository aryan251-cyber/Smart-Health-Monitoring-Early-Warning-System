import json
import unittest
from app import create_app
from app.models import db, User

class LoginFlowTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def test_01_root_page_serves_login_first(self):
        """1. When the website starts (first load), the login page is served."""
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        html = res.data.decode("utf-8")
        self.assertIn('id="auth-view"', html)
        self.assertIn('id="form-login"', html)
        self.assertIn('id="login-email"', html)
        self.assertIn('id="login-password"', html)
        self.assertIn('id="auth-error-msg"', html)

    def test_02_login_empty_details_rejected(self):
        """4. If the details are empty, error is returned."""
        res = self.client.post("/api/auth/login", json={"email": "", "password": ""})
        self.assertEqual(res.status_code, 400)
        data = json.loads(res.data)
        self.assertIn("error", data)
        self.assertIn("required", data["error"].lower())

    def test_03_login_invalid_password_rejected(self):
        """4. If details are wrong, error is returned."""
        res = self.client.post("/api/auth/login", json={
            "email": "patient@vitalwatch.org",
            "password": "wrongpassword999"
        })
        self.assertEqual(res.status_code, 401)
        data = json.loads(res.data)
        self.assertIn("error", data)
        self.assertEqual(data["error"], "Invalid email or password")

    def test_04_login_nonexistent_user_rejected(self):
        """4. If user does not exist, error is returned."""
        res = self.client.post("/api/auth/login", json={
            "email": "nobody@example.com",
            "password": "somepassword"
        })
        self.assertEqual(res.status_code, 401)
        data = json.loads(res.data)
        self.assertIn("error", data)
        self.assertEqual(data["error"], "Invalid email or password")

    def test_05_login_valid_patient_redirects_to_dashboard(self):
        """2 & 3. Valid login returns token and redirects to /dashboard."""
        res = self.client.post("/api/auth/login", json={
            "email": "patient@vitalwatch.org",
            "password": "password123"
        })
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn("token", data)
        self.assertEqual(data["redirect_to"], "/dashboard")
        self.assertEqual(data["user"]["email"], "patient@vitalwatch.org")

    def test_06_login_valid_doctor_redirects_to_dashboard(self):
        """2 & 3. Valid doctor login redirects to /dashboard."""
        res = self.client.post("/api/auth/login", json={
            "email": "doctor@vitalwatch.org",
            "password": "password123"
        })
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn("token", data)
        self.assertEqual(data["redirect_to"], "/dashboard")

    def test_07_login_valid_asha_redirects_to_asha_dashboard(self):
        """2 & 3. Valid ASHA login redirects to /asha/dashboard."""
        res = self.client.post("/api/auth/login", json={
            "email": "asha@test.com",
            "password": "asha123"
        })
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn("token", data)
        self.assertEqual(data["redirect_to"], "/asha/dashboard")

    def test_08_authenticated_session_verified(self):
        """6. Token keeps user logged in via /api/auth/me."""
        res_login = self.client.post("/api/auth/login", json={
            "email": "patient@vitalwatch.org",
            "password": "password123"
        })
        token = json.loads(res_login.data)["token"]

        # Call /api/auth/me with Bearer token
        res_me = self.client.get("/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        self.assertEqual(res_me.status_code, 200)
        user_data = json.loads(res_me.data)["user"]
        self.assertEqual(user_data["email"], "patient@vitalwatch.org")

    def test_09_unauthenticated_request_rejected(self):
        """5. Unauthenticated requests to protected endpoints fail with 401."""
        res = self.client.get("/api/auth/me")
        self.assertEqual(res.status_code, 401)

    def test_10_dashboard_html_renders(self):
        """3 & 5. /dashboard endpoint responds with 200 and required elements."""
        res = self.client.get("/dashboard")
        self.assertEqual(res.status_code, 200)
        html = res.data.decode("utf-8")
        self.assertIn("VitalWatch", html)
        self.assertIn("app-view", html)

if __name__ == "__main__":
    unittest.main()
