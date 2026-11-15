import unittest
from app import create_app
from app.villages import derive_risk_level

class CommunityRiskMapTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def test_derive_risk_level(self):
        # 0-39 -> Low
        self.assertEqual(derive_risk_level(0), "Low")
        self.assertEqual(derive_risk_level(18), "Low")
        self.assertEqual(derive_risk_level(39), "Low")

        # 40-69 -> Medium
        self.assertEqual(derive_risk_level(40), "Medium")
        self.assertEqual(derive_risk_level(55), "Medium")
        self.assertEqual(derive_risk_level(69), "Medium")

        # 70-100 -> High
        self.assertEqual(derive_risk_level(70), "High")
        self.assertEqual(derive_risk_level(85), "High")
        self.assertEqual(derive_risk_level(100), "High")

    def test_get_villages_endpoint(self):
        res = self.client.get("/api/villages")
        self.assertEqual(res.status_code, 200)

        data = res.get_json()
        self.assertIn("villages", data)
        villages = data["villages"]
        self.assertGreaterEqual(len(villages), 6)

        # Check required fields on each village item
        required_fields = [
            "id", "name", "lat", "lng", "population",
            "activeCases", "waterSources", "contaminatedSources", "riskScore"
        ]
        for v in villages:
            for field in required_fields:
                self.assertIn(field, v, f"Field '{field}' missing from village {v.get('name')}")
            self.assertIsInstance(v["lat"], (int, float))
            self.assertIsInstance(v["lng"], (int, float))
            self.assertIsInstance(v["riskScore"], (int, float))
            self.assertIn(v["riskLevel"], ["Low", "Medium", "High"])

            # Verify coordinates are strictly within Gujarat bounds
            self.assertGreaterEqual(v["lat"], 20.1)
            self.assertLessEqual(v["lat"], 24.7)
            self.assertGreaterEqual(v["lng"], 68.1)
            self.assertLessEqual(v["lng"], 74.5)

            # Verify coordinates are inside central Gujarat inland district area
            self.assertGreaterEqual(v["lat"], 22.2)
            self.assertLessEqual(v["lat"], 23.1)
            self.assertGreaterEqual(v["lng"], 72.3)
            self.assertLessEqual(v["lng"], 73.3)

        # Verify no two markers overlap (all pairwise distances > 3 km)
        import math
        def haversine_km(lat1, lon1, lat2, lon2):
            R = 6371.0
            dlat = math.radians(lat2 - lat1)
            dlon = math.radians(lon2 - lon1)
            a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
            return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

        for i in range(len(villages)):
            for j in range(i + 1, len(villages)):
                d = haversine_km(villages[i]["lat"], villages[i]["lng"], villages[j]["lat"], villages[j]["lng"])
                self.assertGreaterEqual(d, 3.0, f"{villages[i]['name']} and {villages[j]['name']} are too close ({d:.2f} km)")


    def test_map_page_routes_render(self):
        for route in ["/risk-map", "/map"]:
            res = self.client.get(route)
            self.assertEqual(res.status_code, 200, f"Route {route} should render 200 OK")


if __name__ == "__main__":
    unittest.main()
