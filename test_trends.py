"""
Unit and integration tests for Feature #8: Health Trends (using standard unittest)
"""

import unittest
from app import create_app


class HealthTrendsTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.app.config["TESTING"] = True
        cls.client = cls.app.test_client()

    def test_all_trend_endpoints(self):
        metrics = [
            "diarrhea",
            "fever",
            "water-contamination",
            "high-risk-villages",
            "temperature",
            "respiratory"
        ]

        for metric in metrics:
            res = self.client.get(f"/api/trends/{metric}")
            self.assertEqual(res.status_code, 200, f"Failed for {metric}")
            data = res.get_json()
            self.assertIn("labels", data, f"Missing 'labels' in {metric}")
            self.assertIn("cases", data, f"Missing 'cases' in {metric}")
            self.assertIsInstance(data["labels"], list)
            self.assertIsInstance(data["cases"], list)
            self.assertEqual(len(data["labels"]), len(data["cases"]))
            self.assertGreater(len(data["labels"]), 0)

    def test_unknown_metric(self):
        res = self.client.get("/api/trends/nonexistent-metric")
        self.assertEqual(res.status_code, 404)


if __name__ == "__main__":
    unittest.main()
