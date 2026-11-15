import json
import unittest
from app import create_app
from app.models import db, Alert
from app.alerts import determine_alert_level, determine_recommended_action

class EarlyWarningAlertsTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def test_alert_level_and_action_derivation(self):
        # 0-24 -> NORMAL
        self.assertEqual(determine_alert_level(15), "NORMAL")
        self.assertEqual(determine_recommended_action("NORMAL"), "No action needed")

        # 25-49 -> WATCH
        self.assertEqual(determine_alert_level(35), "WATCH")
        self.assertEqual(determine_recommended_action("WATCH"), "Monitor closely and re-test water")

        # 50-74 -> ELEVATED
        self.assertEqual(determine_alert_level(60), "ELEVATED")
        self.assertEqual(determine_recommended_action("ELEVATED"), "Inspect primary water source and conduct community awareness")

        # 75-100 -> CRITICAL
        self.assertEqual(determine_alert_level(82), "CRITICAL")
        self.assertEqual(determine_recommended_action("CRITICAL"), "Inspect primary water source and conduct community awareness")

    def test_create_and_fetch_alerts(self):
        # 1. Create a CRITICAL alert
        post_res = self.client.post("/api/alerts", json={
            "village": "Lakhipur",
            "riskScore": 82,
            "reasons": [
                "8 diarrhea cases reported",
                "Water contamination detected",
                "Cases increased by 40% this week"
            ]
        })
        self.assertEqual(post_res.status_code, 201)
        data = post_res.get_json()
        self.assertIn("alert", data)
        alert = data["alert"]
        self.assertEqual(alert["village"], "Lakhipur")
        self.assertEqual(alert["level"], "CRITICAL")
        self.assertEqual(alert["riskScore"], 82)
        self.assertEqual(alert["status"], "active")
        self.assertEqual(alert["recommendedAction"], "Inspect primary water source and conduct community awareness")
        self.assertIsNone(alert["assignedTo"])
        alert_id = alert["id"]

        # 2. Assign ASHA Worker
        assign_res = self.client.put(f"/api/alerts/{alert_id}/assign", json={
            "assignedTo": "Sunita Devi (ASHA - Zone A)"
        })
        self.assertEqual(assign_res.status_code, 200)
        assigned_alert = assign_res.get_json()["alert"]
        self.assertEqual(assigned_alert["assignedTo"], "Sunita Devi (ASHA - Zone A)")

        # 3. Mark Resolved
        resolve_res = self.client.put(f"/api/alerts/{alert_id}/resolve")
        self.assertEqual(resolve_res.status_code, 200)
        resolved_alert = resolve_res.get_json()["alert"]
        self.assertEqual(resolved_alert["status"], "resolved")
        self.assertTrue(resolved_alert["acknowledged"])

        # 4. Fetch GET alerts
        get_res = self.client.get("/api/alerts")
        self.assertEqual(get_res.status_code, 200)
        get_data = get_res.get_json()
        self.assertIn("alerts", get_data)
        self.assertGreaterEqual(len(get_data["alerts"]), 1)

    def test_validation_errors(self):
        # Missing village
        res1 = self.client.post("/api/alerts", json={"riskScore": 50})
        self.assertEqual(res1.status_code, 400)

        # Missing riskScore
        res2 = self.client.post("/api/alerts", json={"village": "TestVillage"})
        self.assertEqual(res2.status_code, 400)

        # Invalid score range
        res3 = self.client.post("/api/alerts", json={"village": "TestVillage", "riskScore": 150})
        self.assertEqual(res3.status_code, 400)


if __name__ == "__main__":
    unittest.main()
