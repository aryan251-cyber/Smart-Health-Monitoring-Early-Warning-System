/**
 * VitalWatch — Disease Risk Score Controller
 * Handles form validation, prefilling from village data, API communication,
 * and animated circular gauge / breakdown progress bars.
 */

const DiseaseRiskController = {
  adviceMap: {
    "HIGH RISK": "Alert health officials and test water sources immediately.",
    "MEDIUM RISK": "Increase water testing frequency and monitor community symptoms closely.",
    "LOW RISK": "Routine surveillance recommended; maintain clean water sanitization."
  },

  init() {
    const form = document.getElementById("drs-form");
    if (!form || form._drsBound) return;
    form._drsBound = true;

    // Village dropdown prefill listener
    const villageSelect = document.getElementById("drs-village-select");
    if (villageSelect) {
      villageSelect.addEventListener("change", (e) => {
        this.handleVillageChange(e.target.value);
      });
    }

    // Form submit listener
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleSubmit();
    });
  },

  handleVillageChange(villageName) {
    if (!villageName || villageName === "custom") return;

    // Check if village exists in mock data array
    if (typeof VILLAGE_RISK_MOCK_DATA !== "undefined") {
      const match = VILLAGE_RISK_MOCK_DATA.find(v => (v.village || "").trim().toLowerCase() === (villageName || "").trim().toLowerCase());
      if (match) {
        // Map water risk to select value: High -> bad, Medium -> moderate, Low -> good
        const waterMap = { high: "bad", medium: "moderate", low: "good" };
        const mappedWater = waterMap[match.waterRisk.toLowerCase()] || "moderate";

        // Estimate symptom count according to disease risk level
        const symptomMap = { high: 6, medium: 3, low: 1 };
        const estimatedSymptoms = symptomMap[match.diseaseRisk.toLowerCase()] || 2;

        const symptomsInput = document.getElementById("drs-symptoms");
        const waterSelect = document.getElementById("drs-water");
        const casesInput = document.getElementById("drs-cases");

        if (symptomsInput) symptomsInput.value = estimatedSymptoms;
        if (waterSelect) waterSelect.value = mappedWater;
        if (casesInput) casesInput.value = match.cases;
      }
    }
  },

  async handleSubmit() {
    const symptomsEl = document.getElementById("drs-symptoms");
    const waterEl = document.getElementById("drs-water");
    const casesEl = document.getElementById("drs-cases");
    const seasonEl = document.getElementById("drs-season");
    const alertBox = document.getElementById("drs-form-alert");
    const submitBtn = document.getElementById("drs-calc-btn");
    const btnText = document.getElementById("drs-btn-text");

    if (alertBox) {
      alertBox.style.display = "none";
      alertBox.textContent = "";
    }

    const symptomsVal = parseInt(symptomsEl.value, 10);
    const waterVal = (waterEl.value || "").trim().toLowerCase();
    const casesVal = parseInt(casesEl.value, 10);
    const seasonVal = (seasonEl.value || "").trim().toLowerCase();

    // Validation
    if (isNaN(symptomsVal) || symptomsVal < 0) {
      this.showAlert("Please enter a valid non-negative number for symptoms.");
      return;
    }
    if (!["good", "moderate", "bad"].includes(waterVal)) {
      this.showAlert("Please select a valid water quality option.");
      return;
    }
    if (isNaN(casesVal) || casesVal < 0) {
      this.showAlert("Please enter a valid non-negative number for recent cases.");
      return;
    }
    if (!["monsoon", "summer", "winter"].includes(seasonVal)) {
      this.showAlert("Please select a valid season.");
      return;
    }

    // Set loading state
    submitBtn.disabled = true;
    btnText.textContent = "Calculating...";

    try {
      const response = await fetch("/api/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symptoms: symptomsVal,
          water: waterVal,
          cases: casesVal,
          season: seasonVal
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to calculate risk score.");
      }

      const villageSelect = document.getElementById("drs-village-select");
      const chosenVillage = (villageSelect && villageSelect.value && villageSelect.value !== "custom") 
        ? villageSelect.value 
        : "Selected Community";

      this.displayResult(data, chosenVillage);

      // Optionally update the Village Risk Table if the village is in the table
      if (typeof VILLAGE_RISK_MOCK_DATA !== "undefined" && typeof VillageRiskTable !== "undefined") {
        const row = VILLAGE_RISK_MOCK_DATA.find(v => v.village.toLowerCase() === chosenVillage.toLowerCase());
        if (row) {
          const statusMap = { "HIGH RISK": "Red", "MEDIUM RISK": "Yellow", "LOW RISK": "Green" };
          row.status = statusMap[data.status] || row.status;
          row.riskScore = data.status === "HIGH RISK" ? 3 : (data.status === "MEDIUM RISK" ? 2 : 1);
          VillageRiskTable.render();
        }
      }

    } catch (err) {
      this.showAlert(err.message || "An unexpected error occurred while calculating risk.");
    } finally {
      submitBtn.disabled = false;
      btnText.textContent = "Calculate Risk";
    }
  },

  showAlert(msg) {
    const alertBox = document.getElementById("drs-form-alert");
    if (alertBox) {
      alertBox.textContent = msg;
      alertBox.style.display = "block";
    }
  },

  displayResult(data, villageName) {
    const initialView = document.getElementById("drs-result-initial");
    const contentView = document.getElementById("drs-result-content");
    const villageTitle = document.getElementById("drs-result-village-name");
    const badge = document.getElementById("drs-result-badge");
    const adviceText = document.getElementById("drs-advice-text");
    const gaugeCircle = document.getElementById("drs-gauge-circle");
    const gaugeNum = document.getElementById("drs-gauge-num");

    if (initialView) initialView.style.display = "none";
    if (contentView) {
      contentView.style.display = "block";
      contentView.classList.remove("drs-fade-in");
      void contentView.offsetWidth;
      contentView.classList.add("drs-fade-in");
    }

    if (villageTitle) villageTitle.textContent = `${villageName} Risk Assessment`;

    // Status badge & styling
    if (badge) {
      badge.textContent = data.status;
      badge.className = "drs-badge";
      if (data.status === "HIGH RISK") {
        badge.classList.add("drs-badge-high");
      } else if (data.status === "MEDIUM RISK") {
        badge.classList.add("drs-badge-med");
      } else {
        badge.classList.add("drs-badge-low");
      }
    }

    // Advice text
    if (adviceText) {
      adviceText.textContent = this.adviceMap[data.status] || "Monitor community health indicators regularly.";
    }

    // Animate circular gauge
    // Circumference for r=50 is 2 * Math.PI * 50 ≈ 314.159
    const circumference = 2 * Math.PI * 50;
    const score = Math.max(0, Math.min(100, data.score));
    const offset = circumference - (score / 100) * circumference;

    if (gaugeCircle) {
      gaugeCircle.style.strokeDasharray = `${circumference}`;
      gaugeCircle.style.strokeDashoffset = `${offset}`;

      // Color based on risk
      if (score >= 70) {
        gaugeCircle.style.stroke = "#ef4444";
      } else if (score >= 40) {
        gaugeCircle.style.stroke = "#f59e0b";
      } else {
        gaugeCircle.style.stroke = "#10b981";
      }
    }

    // Count-up animation on number
    if (gaugeNum) {
      this.animateNumber(gaugeNum, score);
    }

    // 4 Breakdown progress bars
    const bd = data.breakdown || {};
    this.updateBreakdownBar("symptoms", bd.symptoms || 0, 40);
    this.updateBreakdownBar("water", bd.water || 0, 30);
    this.updateBreakdownBar("cases", bd.cases || 0, 20);
    this.updateBreakdownBar("season", bd.season || 0, 10);
  },

  updateBreakdownBar(key, value, maxVal) {
    const valEl = document.getElementById(`drs-val-${key}`);
    const barEl = document.getElementById(`drs-bar-${key}`);
    if (valEl) valEl.textContent = `${value} / ${maxVal}`;
    if (barEl) {
      const pct = Math.round((value / maxVal) * 100);
      barEl.style.width = `${pct}%`;
    }
  },

  animateNumber(el, target) {
    const duration = 650;
    const start = performance.now();
    function step(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(ease * target);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = target;
      }
    }
    requestAnimationFrame(step);
  }
};

// Initialize on DOM load or when tab is activated
document.addEventListener("DOMContentLoaded", () => {
  DiseaseRiskController.init();
});
