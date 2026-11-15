import json
import unittest
from app import create_app
from app.models import db, User, VitalRecord, Alert, AshaWorker, Village, CaseFollowUp

class VitalWatchApiTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

        with self.app.app_context():
            db.create_all()
            # Clean up test data
            Alert.query.delete()
            VitalRecord.query.delete()
            Village.query.delete()
            AshaWorker.query.delete()
            User.query.delete()
            db.session.commit()

    def test_full_user_flow(self):
        # 1. Register
        reg_res = self.client.post("/api/auth/register", json={
            "full_name": "Dr. Sarah Miller",
            "email": "sarah@example.com",
            "password": "password123",
            "role": "doctor"
        })
        self.assertEqual(reg_res.status_code, 201)
        reg_data = json.loads(reg_res.data)
        self.assertIn("token", reg_data)
        token = reg_data["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Login
        login_res = self.client.post("/api/auth/login", json={
            "email": "sarah@example.com",
            "password": "password123"
        })
        self.assertEqual(login_res.status_code, 200)

        # 3. Get /me
        me_res = self.client.get("/api/auth/me", headers=headers)
        self.assertEqual(me_res.status_code, 200)
        self.assertEqual(json.loads(me_res.data)["user"]["email"], "sarah@example.com")

        # 4. Log Normal Vital Reading
        normal_res = self.client.post("/api/vitals", headers=headers, json={
            "heart_rate": 72,
            "spo2": 98,
            "systolic_bp": 120,
            "diastolic_bp": 80,
            "temperature": 36.8,
            "respiratory_rate": 16,
            "glucose": 95
        })
        self.assertEqual(normal_res.status_code, 201)
        normal_data = json.loads(normal_res.data)
        self.assertEqual(normal_data["record"]["risk_level"], "NORMAL")
        self.assertIsNone(normal_data["alert"])

        # 5. Log Critical Vital Reading (Hypoxia + Tachycardia + Crisis BP)
        crit_res = self.client.post("/api/vitals", headers=headers, json={
            "heart_rate": 138,
            "spo2": 87,
            "systolic_bp": 185,
            "diastolic_bp": 110,
            "temperature": 39.4,
            "respiratory_rate": 28,
            "glucose": 115
        })
        self.assertEqual(crit_res.status_code, 201)
        crit_data = json.loads(crit_res.data)
        self.assertEqual(crit_data["record"]["risk_level"], "CRITICAL")
        self.assertIsNotNone(crit_data["alert"])
        alert_id = crit_data["alert"]["id"]
        self.assertFalse(crit_data["alert"]["acknowledged"])
        self.assertIn("CRITICAL", crit_data["record"]["ai_explanation"])

        # 6. Fetch Dashboard Data
        dash_res = self.client.get("/api/vitals/dashboard", headers=headers)
        self.assertEqual(dash_res.status_code, 200)
        dash_data = json.loads(dash_res.data)
        self.assertEqual(dash_data["current_risk"], "CRITICAL")
        self.assertEqual(dash_data["unacknowledged_alerts_count"], 1)
        self.assertEqual(len(dash_data["trend_readings"]), 2)

        # 7. Fetch Alerts
        alerts_res = self.client.get("/api/alerts?status=unacknowledged", headers=headers)
        self.assertEqual(alerts_res.status_code, 200)
        alerts_data = json.loads(alerts_res.data)
        self.assertEqual(len(alerts_data["alerts"]), 1)

        # 8. Acknowledge Alert
        ack_res = self.client.post(f"/api/alerts/{alert_id}/acknowledge", headers=headers)
        self.assertEqual(ack_res.status_code, 200)
        ack_data = json.loads(ack_res.data)
        self.assertTrue(ack_data["alert"]["acknowledged"])

        # 9. Verify History
        history_res = self.client.get("/api/vitals/history", headers=headers)
        self.assertEqual(history_res.status_code, 200)
        history_data = json.loads(history_res.data)
        self.assertEqual(history_data["count"], 2)

        print("[TEST SUCCESS] All 9 end-to-end API test assertions passed successfully!")

    def test_case_followup_flow(self):
        # 1. Validation: village required
        res = self.client.post("/api/cases", json={"reportedDate": "2026-11-05"})
        self.assertEqual(res.status_code, 400)

        # 2. Validation: reportedDate required
        res = self.client.post("/api/cases", json={"village": "Sonapur"})
        self.assertEqual(res.status_code, 400)

        # 3. Create case (default status REPORTED)
        res = self.client.post("/api/cases", json={
            "village": "Sonapur",
            "reportedDate": "2026-11-05",
            "patientName": "Aarav Sharma",
            "symptoms": ["Fever", "Diarrhea", "Weakness"]
        })
        self.assertEqual(res.status_code, 201)
        case_data = json.loads(res.data)
        case_id = case_data["id"]
        self.assertEqual(case_data["status"], "REPORTED")
        self.assertEqual(case_data["patientName"], "Aarav Sharma")

        # 4. Get single case
        res = self.client.get(f"/api/cases/{case_id}")
        self.assertEqual(res.status_code, 200)

        # 5. Advance status to UNDER_OBSERVATION
        res = self.client.patch(f"/api/cases/{case_id}/status", json={"status": "UNDER_OBSERVATION"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(json.loads(res.data)["status"], "UNDER_OBSERVATION")

        # 6. Reject moving backwards to REPORTED
        res = self.client.patch(f"/api/cases/{case_id}/status", json={"status": "REPORTED"})
        self.assertEqual(res.status_code, 400)

        # 7. Allow skipping Referred directly to RECOVERED
        res = self.client.patch(f"/api/cases/{case_id}/status", json={"status": "RECOVERED"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(json.loads(res.data)["status"], "RECOVERED")

        # 8. Reject further changes after RECOVERED
        res = self.client.patch(f"/api/cases/{case_id}/status", json={"status": "REFERRED"})
        self.assertEqual(res.status_code, 400)

        # 9. Edit case details
        res = self.client.put(f"/api/cases/{case_id}", json={
            "followUpDate": "2026-11-08",
            "patientName": "Aarav S."
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(json.loads(res.data)["followUpDate"], "2026-11-08")

        # 10. Delete case
        res = self.client.delete(f"/api/cases/{case_id}")
        self.assertEqual(res.status_code, 200)
        res = self.client.get(f"/api/cases/{case_id}")
        self.assertEqual(res.status_code, 404)

        print("[TEST SUCCESS] Case Follow-up (Feature #14) API test flow passed successfully!")

if __name__ == "__main__":
    unittest.main()
