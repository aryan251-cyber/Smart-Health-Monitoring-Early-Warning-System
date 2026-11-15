/**
 * VitalWatch — Village Risk Mock Data & Statistics Module
 * Keeps mock data isolated in one place, easily replaceable with live API data.
 */

const VILLAGE_RISK_MOCK_DATA = [
  {
    village: "Modhera",
    cases: 12,
    waterRisk: "High",
    diseaseRisk: "High",
    status: "Red",       // Red = High Risk
    riskScore: 3
  },
  {
    village: "Dhordo",
    cases: 12,
    waterRisk: "High",
    diseaseRisk: "High",
    status: "Red",       // Red = High Risk
    riskScore: 3
  },
  {
    village: "Poshina",
    cases: 9,
    waterRisk: "High",
    diseaseRisk: "Medium",
    status: "Red",       // Red = High Risk
    riskScore: 3
  },
  {
    village: "Hodka",
    cases: 4,
    waterRisk: "Medium",
    diseaseRisk: "Medium",
    status: "Yellow",    // Yellow = Watch
    riskScore: 2
  },
  {
    village: "Bhujodi",
    cases: 6,
    waterRisk: "Medium",
    diseaseRisk: "Low",
    status: "Yellow",    // Yellow = Watch
    riskScore: 2
  },
  {
    village: "Nirona",
    cases: 1,
    waterRisk: "Low",
    diseaseRisk: "Low",
    status: "Green",     // Green = Safe
    riskScore: 1
  },
  {
    village: "Madhapur",
    cases: 2,
    waterRisk: "Low",
    diseaseRisk: "Low",
    status: "Green",     // Green = Safe
    riskScore: 1
  }
];

const VILLAGE_RISK_BASE_SUMMARY = {
  villagesMonitored: 24,
  activeCases: 37,
  waterSourcesTested: 68,
  highRiskVillages: 3,
  activeAlerts: 5
};

/**
 * Returns summary statistics. If Community Reports data exists in localStorage,
 * derives Active Cases from the total people affected in those reports;
 * otherwise uses the default mock value (37).
 */
function getVillageRiskSummary() {
  const summary = { ...VILLAGE_RISK_BASE_SUMMARY };

  try {
    const rawReports = localStorage.getItem("vitalwatch_community_reports");
    if (rawReports) {
      const reports = JSON.parse(rawReports);
      if (Array.isArray(reports) && reports.length > 0) {
        const totalAffected = reports.reduce((sum, r) => {
          const count = parseInt(r.peopleAffected, 10);
          return sum + (isNaN(count) ? 0 : count);
        }, 0);

        if (totalAffected > 0) {
          summary.activeCases = totalAffected;
          summary.derivedFromCommunityReports = true;
        }
      }
    }
  } catch (err) {
    console.warn("Could not read community reports data from storage:", err);
  }

  return summary;
}

/**
 * Returns village risk rows sorted by risk (highest first).
 * Order: Red (High) -> Yellow (Medium/Watch) -> Green (Low/Safe).
 * Ties are ordered by case count descending.
 */
function getVillageRiskData() {
  return [...VILLAGE_RISK_MOCK_DATA].sort((a, b) => {
    if (b.riskScore !== a.riskScore) {
      return b.riskScore - a.riskScore;
    }
    return b.cases - a.cases;
  });
}
