"""
Unit tests for Feature #10: Recommended Actions
"""

import unittest
from app import create_app
from app.recommended_actions import RULES_MAP, SEVERITY_ORDER


class RecommendedActionsTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.app.config["TESTING"] = True
        cls.client = cls.app.test_client()

    def test_rules_map_integrity(self):
        # Verify all 4 required rules exist
        required_keys = ["water_contamination", "diarrhea", "fever", "respiratory"]
        for key in required_keys:
            self.assertIn(key, RULES_MAP)
            rule = RULES_MAP[key]
            self.assertIn("condition", rule)
            self.assertIn("severity", rule)
            self.assertIn("actions", rule)
            self.assertIsInstance(rule["actions"], list)
            self.assertGreaterEqual(len(rule["actions"]), 4)

    def test_get_recommended_actions_endpoint(self):
        res = self.client.get("/api/recommended-actions")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIsInstance(data, list)
        self.assertGreater(len(data), 0)

        # Check required structure of recommendation items
        for item in data:
            self.assertIn("id", item)
            self.assertIn("condition", item)
            self.assertIn("village", item)
            self.assertIn("severity", item)
            self.assertIn("detail", item)
            self.assertIn("actions", item)
            self.assertIsInstance(item["actions"], list)
            self.assertGreater(len(item["actions"]), 0)

        # Verify sorting: high severity comes before medium/low
        severities = [SEVERITY_ORDER.get(item["severity"].lower(), 99) for item in data]
        self.assertEqual(severities, sorted(severities))


if __name__ == "__main__":
    unittest.main()
