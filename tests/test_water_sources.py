"""
Unit tests for Feature #9: Water Sources Management
"""

import unittest
from datetime import date
from app import create_app
from app.models import db, WaterSource, calculate_water_source_risk


class WaterSourcesTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.app.config["TESTING"] = True
        cls.client = cls.app.test_client()

    def test_risk_calculation(self):
        # 1. Safe: neutral pH 7.3, turbidity 1.4, safe bacteria
        self.assertEqual(calculate_water_source_risk(7.3, 1.4, "safe"), "safe")

        # 2. Warning: ph 8.35 (within 10% of 8.5)
        self.assertEqual(calculate_water_source_risk(8.35, 2.0, "safe"), "warning")

        # 3. Warning: turbidity 4.7 (within 10% of 5.0)
        self.assertEqual(calculate_water_source_risk(7.4, 4.7, "safe"), "warning")

        # 4. Warning: ph 6.6 (within 10% of 6.5)
        self.assertEqual(calculate_water_source_risk(6.6, 2.0, "safe"), "warning")

        # 5. Contaminated: bacterial_status is contaminated
        self.assertEqual(calculate_water_source_risk(7.2, 1.0, "contaminated"), "contaminated")

        # 6. Contaminated: ph < 6.5
        self.assertEqual(calculate_water_source_risk(6.1, 2.0, "safe"), "contaminated")

        # 7. Contaminated: ph > 8.5
        self.assertEqual(calculate_water_source_risk(8.9, 2.0, "safe"), "contaminated")

        # 8. Contaminated: turbidity > 5
        self.assertEqual(calculate_water_source_risk(7.3, 6.2, "safe"), "contaminated")

    def test_list_water_sources(self):
        res = self.client.get("/api/water-sources")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIsInstance(data, list)
        self.assertGreaterEqual(len(data), 6)

        # Check required fields in item
        item = data[0]
        self.assertIn("id", item)
        self.assertIn("source_name", item)
        self.assertIn("source_type", item)
        self.assertIn("ph", item)
        self.assertIn("turbidity", item)
        self.assertIn("bacterial_status", item)
        self.assertIn("last_tested", item)
        self.assertIn("risk_status", item)

    def test_filter_by_status(self):
        for status in ["safe", "warning", "contaminated"]:
            res = self.client.get(f"/api/water-sources?status={status}")
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            for item in data:
                self.assertEqual(item["risk_status"], status)

    def test_create_and_update_water_source(self):
        # 1. Create a safe source
        payload = {
            "source_name": "Test Borewell Alpha",
            "source_type": "well",
            "ph": 7.45,
            "turbidity": 2.2,
            "bacterial_status": "safe",
            "last_tested": str(date.today())
        }
        res = self.client.post("/api/water-sources", json=payload)
        self.assertEqual(res.status_code, 201)
        created = res.get_json()
        self.assertEqual(created["source_name"], "Test Borewell Alpha")
        self.assertEqual(created["risk_status"], "safe")
        source_id = created["id"]

        # 2. Update to contaminated
        update_payload = {
            "turbidity": 6.8,
            "bacterial_status": "contaminated"
        }
        res_put = self.client.put(f"/api/water-sources/{source_id}", json=update_payload)
        self.assertEqual(res_put.status_code, 200)
        updated = res_put.get_json()
        self.assertEqual(updated["risk_status"], "contaminated")
        self.assertEqual(updated["turbidity"], 6.8)
        self.assertEqual(updated["bacterial_status"], "contaminated")


if __name__ == "__main__":
    unittest.main()
