/**
 * VitalWatch — Feature #13: Patient → Community Connection
 * ─────────────────────────────────────────────────────────
 * Connects the existing patient vital monitoring to Community Reports (Feature #3).
 * When a patient has symptoms, compares against village-level reports and updates
 * the village risk level.
 *
 * SCOPE:
 * - Pure client-side connection layer reusing existing localStorage & VitalApi.
 * - Glassmorphic 3-step flow:
 *     Step 1: Patient (Name, Village, Vitals, Symptoms multi-select chips)
 *     Step 2: Community Analysis ("Modhera: 12 similar reports")
 *     Step 3: Village Risk Badge ("⚠️ Village Risk Increased")
 * - Bumps risk +1 level if patient has abnormal vitals (e.g. temp ≥ 38°C) AND symptoms match.
 * - Propagates calculated risk to village risk tables & community risk map.
 */

const PCL = (() => {
  "use strict";

  // ── Simple risk rule thresholds (easy to tweak in one constant) ───
  const RISK_THRESHOLDS = {
    LOW_MAX:    2,   // 0–2 similar reports → Low
    MEDIUM_MAX: 6,   // 3–6                 → Medium
                     // 7+                  → High
  };

  // Abnormal vital triggers for risk level bump (+1 level)
  const ABNORMAL_TEMP_MIN = 38.0; // °C
  const ABNORMAL_SPO2_MAX = 94;   // %
  const ABNORMAL_HR_MAX   = 100;  // bpm

  // Default village configuration (shared constant for easy customization)
  const DEFAULT_VILLAGE = "Modhera";
  if (typeof window !== "undefined") {
    window.DEFAULT_VILLAGE = DEFAULT_VILLAGE;
  }

  // Symptom list — identical to Community Reports (Feature #3)
  const SYMPTOM_LIST = [
    "Diarrhea",
    "Vomiting",
    "Fever",
    "Abdominal Pain",
    "Weakness",
    "Dehydration"
  ];

  // Storage keys
  const CR_KEY       = "vitalwatch_community_reports";   // existing Feature #3 reports
  const PCL_NAME_KEY = "vitalwatch_pcl_patient_name";    // patient's name
  const PCL_VIL_KEY  = "vitalwatch_pcl_village";         // patient's village
  const PCL_SYM_KEY  = "vitalwatch_pcl_symptoms";        // patient's selected symptoms

  // Demo defaults (matches DEMO CHECK requirements: Aryan Panchal, Modhera, 38°C, SpO₂ 99%, HR 56, Fever + Diarrhea)
  const DEMO_PATIENT  = { name: "Aryan Panchal", village: DEFAULT_VILLAGE };
  const DEMO_VITALS   = { temperature: 38.0, spo2: 99, heart_rate: 56 };
  const DEMO_SYMPTOMS = ["Fever", "Diarrhea"];

  // 12 sample reports for Modhera with a balanced clinical mix of:
  // Fever, Diarrhea, Vomiting, Abdominal Pain, Weakness, Dehydration.
  // Each contains Fever or Diarrhea so that Fever + Diarrhea yields exactly 12 matching reports.
  const SAMPLE_REPORTS_MODHERA = [
    { id: "seed001", village: DEFAULT_VILLAGE, symptoms: ["Fever", "Diarrhea"],
      peopleAffected: 5, waterSource: "Well",       timestamp: new Date(Date.now() - 1 * 86400000).toISOString() },
    { id: "seed002", village: DEFAULT_VILLAGE, symptoms: ["Fever", "Weakness"],
      peopleAffected: 3, waterSource: "Hand Pump",  timestamp: new Date(Date.now() - 2 * 86400000).toISOString() },
    { id: "seed003", village: DEFAULT_VILLAGE, symptoms: ["Diarrhea", "Vomiting"],
      peopleAffected: 4, waterSource: "River",      timestamp: new Date(Date.now() - 2 * 86400000).toISOString() },
    { id: "seed004", village: DEFAULT_VILLAGE, symptoms: ["Fever", "Abdominal Pain"],
      peopleAffected: 2, waterSource: "Well",       timestamp: new Date(Date.now() - 3 * 86400000).toISOString() },
    { id: "seed005", village: DEFAULT_VILLAGE, symptoms: ["Diarrhea", "Dehydration"],
      peopleAffected: 3, waterSource: "Tap",        timestamp: new Date(Date.now() - 3 * 86400000).toISOString() },
    { id: "seed006", village: DEFAULT_VILLAGE, symptoms: ["Fever"],
      peopleAffected: 6, waterSource: "Well",       timestamp: new Date(Date.now() - 4 * 86400000).toISOString() },
    { id: "seed007", village: DEFAULT_VILLAGE, symptoms: ["Diarrhea", "Fever", "Weakness"],
      peopleAffected: 4, waterSource: "Hand Pump",  timestamp: new Date(Date.now() - 4 * 86400000).toISOString() },
    { id: "seed008", village: DEFAULT_VILLAGE, symptoms: ["Vomiting", "Diarrhea"],
      peopleAffected: 2, waterSource: "River",      timestamp: new Date(Date.now() - 5 * 86400000).toISOString() },
    { id: "seed009", village: DEFAULT_VILLAGE, symptoms: ["Fever", "Abdominal Pain"],
      peopleAffected: 3, waterSource: "Well",       timestamp: new Date(Date.now() - 5 * 86400000).toISOString() },
    { id: "seed010", village: DEFAULT_VILLAGE, symptoms: ["Diarrhea"],
      peopleAffected: 2, waterSource: "Tap",        timestamp: new Date(Date.now() - 6 * 86400000).toISOString() },
    { id: "seed011", village: DEFAULT_VILLAGE, symptoms: ["Fever", "Dehydration"],
      peopleAffected: 4, waterSource: "Well",       timestamp: new Date(Date.now() - 6 * 86400000).toISOString() },
    { id: "seed012", village: DEFAULT_VILLAGE, symptoms: ["Diarrhea", "Vomiting", "Weakness"],
      peopleAffected: 3, waterSource: "Hand Pump",  timestamp: new Date(Date.now() - 7 * 86400000).toISOString() },
    // Other Gujarat villages for regional contrast
    { id: "seed013", village: "Rampur", symptoms: ["Fever"],
      peopleAffected: 2, waterSource: "Well",       timestamp: new Date(Date.now() - 1 * 86400000).toISOString() },
    { id: "seed014", village: "Devgaon", symptoms: ["Diarrhea"],
      peopleAffected: 3, waterSource: "River",      timestamp: new Date(Date.now() - 2 * 86400000).toISOString() }
  ];

  // ── Seed demo community reports if store is empty or lacking Modhera records ──
  function seedDemoReports() {
    let reports = [];
    try {
      const raw = localStorage.getItem(CR_KEY);
      reports = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(reports)) reports = [];
    } catch {
      reports = [];
    }

    let modified = false;

    // 1. Migrate any legacy "Village A" occurrences in stored reports to DEFAULT_VILLAGE
    reports.forEach(r => {
      if (r && (r.village || "").trim().toLowerCase() === "village a") {
        r.village = DEFAULT_VILLAGE;
        modified = true;
      }
    });

    // 2. Count reports for DEFAULT_VILLAGE (case-insensitive & trimmed)
    const vLower = DEFAULT_VILLAGE.trim().toLowerCase();
    const existingForVillage = reports.filter(r => (r.village || "").trim().toLowerCase() === vLower);

    // 3. If fewer than 12 reports exist for DEFAULT_VILLAGE, ensure all 12 sample reports are added
    if (existingForVillage.length < 12) {
      const existingIds = new Set(reports.map(r => r.id));
      SAMPLE_REPORTS_MODHERA.forEach(sample => {
        if (!existingIds.has(sample.id)) {
          reports.push(sample);
          existingIds.add(sample.id);
        }
      });
      modified = true;
    }

    if (modified || reports.length === 0) {
      if (reports.length === 0) {
        reports = [...SAMPLE_REPORTS_MODHERA];
      }
      try {
        localStorage.setItem(CR_KEY, JSON.stringify(reports));
        console.info(`[PCL] Initialized demo community reports (12 for ${DEFAULT_VILLAGE}).`);
      } catch { /* ignore */ }
    }
  }

  // ── State Getters & Setters ─────────────────────────────────────────
  function loadCommunityReports() {
    try {
      const raw = localStorage.getItem(CR_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function loadPatientName() {
    const saved = localStorage.getItem(PCL_NAME_KEY);
    if (saved && saved !== "Aryan") return saved;
    try {
      const user = VitalApi.getUser();
      if (user && user.full_name && user.full_name !== "Alex Johnson") {
        return user.full_name;
      }
      if (user && user.name && user.name !== "Alex Johnson") {
        return user.name;
      }
    } catch (_) {}
    return DEMO_PATIENT.name; // "Aryan Panchal"
  }
  function savePatientName(name) {
    localStorage.setItem(PCL_NAME_KEY, name);
  }

  function loadPatientVillage() {
    const saved = localStorage.getItem(PCL_VIL_KEY);
    if (!saved) return DEFAULT_VILLAGE;
    const trimmed = saved.trim();
    // Auto-migrate legacy "Village A" selection
    if (!trimmed || trimmed.toLowerCase() === "village a") {
      savePatientVillage(DEFAULT_VILLAGE);
      return DEFAULT_VILLAGE;
    }
    return trimmed;
  }
  function savePatientVillage(v) {
    const val = (v || "").trim();
    localStorage.setItem(PCL_VIL_KEY, val || DEFAULT_VILLAGE);
  }

  function loadPatientSymptoms() {
    const raw = localStorage.getItem(PCL_SYM_KEY);
    if (raw === null) {
      // First visit: seed default symptoms
      savePatientSymptoms(DEMO_SYMPTOMS);
      return [...DEMO_SYMPTOMS];
    }
    try { return JSON.parse(raw) || []; } catch { return []; }
  }
  function savePatientSymptoms(list) {
    localStorage.setItem(PCL_SYM_KEY, JSON.stringify(list));
  }

  /** Latest vitals from live app, with fallback to DEMO_VITALS */
  function getLatestVitals() {
    return window._pclLatestVitals || DEMO_VITALS;
  }

  // ── Analysis Logic ─────────────────────────────────────────────────
  /**
   * Count community reports from the same village sharing ≥ 1 symptom.
   * Matches village name case-insensitively and trimmed (e.g. "modhera", "Modhera ", "MODHERA").
   */
  function countSimilarReports(village, patientSymptoms) {
    if (!village || !patientSymptoms || patientSymptoms.length === 0) return 0;
    const reports = loadCommunityReports();
    const vLower  = (village || "").trim().toLowerCase();
    const symSet  = new Set(patientSymptoms.map(s => (s || "").trim().toLowerCase()));
    return reports.filter(r =>
      (r.village || "").trim().toLowerCase() === vLower &&
      Array.isArray(r.symptoms) &&
      r.symptoms.some(s => symSet.has((s || "").trim().toLowerCase()))
    ).length;
  }

  /**
   * Simple risk rule:
   * 0–2 similar reports → Low
   * 3–6                 → Medium
   * 7+                  → High
   * Abnormal vitals (temp ≥ 38°C, spo2 ≤ 94%, hr ≥ 100) + matching symptoms bumps risk +1 level.
   */
  function computeRisk(count, vitals, symptoms) {
    let rank; // 1=Low, 2=Medium, 3=High
    if      (count <= RISK_THRESHOLDS.LOW_MAX)    rank = 1;
    else if (count <= RISK_THRESHOLDS.MEDIUM_MAX) rank = 2;
    else                                           rank = 3;

    let bumped = false;
    if (symptoms && symptoms.length > 0 && vitals) {
      const hasAbnormal =
        (vitals.temperature != null  && vitals.temperature >= ABNORMAL_TEMP_MIN) ||
        (vitals.spo2        != null  && vitals.spo2        <= ABNORMAL_SPO2_MAX) ||
        (vitals.heart_rate  != null  && vitals.heart_rate  >= ABNORMAL_HR_MAX);
      if (hasAbnormal && rank < 3) {
        rank += 1;
        bumped = true;
      }
    }

    const level = rank === 1 ? "Low" : rank === 2 ? "Medium" : "High";
    return { level, bumped };
  }

  /**
   * Propagate calculated risk to Village Risk tables & Community Risk Map
   */
  function propagateToVillageRisk(village, riskLevel, count) {
    const vLower = (village || "").trim().toLowerCase();

    // 1. Village Risk mock data
    if (typeof VILLAGE_RISK_MOCK_DATA !== "undefined" && Array.isArray(VILLAGE_RISK_MOCK_DATA)) {
      let row = VILLAGE_RISK_MOCK_DATA.find(v => (v.village || "").trim().toLowerCase() === vLower);
      const statusMap = {
        Low:    { status: "Green",  riskScore: 1, diseaseRisk: "Low" },
        Medium: { status: "Yellow", riskScore: 2, diseaseRisk: "Medium" },
        High:   { status: "Red",    riskScore: 3, diseaseRisk: "High" }
      };
      const meta = statusMap[riskLevel] || statusMap.Low;

      if (row) {
        row.status      = meta.status;
        row.riskScore   = meta.riskScore;
        row.diseaseRisk = meta.diseaseRisk;
        row.cases       = Math.max(row.cases || 0, count);
      } else if (village) {
        VILLAGE_RISK_MOCK_DATA.push({
          village:     village.trim(),
          cases:       count,
          waterRisk:   "Medium",
          diseaseRisk: meta.diseaseRisk,
          status:      meta.status,
          riskScore:   meta.riskScore
        });
      }

      if (typeof VillageRiskTable !== "undefined") {
        try { VillageRiskTable.render(); } catch (_) {}
      }
      if (typeof VillageSummaryCards !== "undefined") {
        try { VillageSummaryCards.render(); } catch (_) {}
      }
    }

    // 2. Leaflet Community Risk Map
    if (typeof crmAllVillages !== "undefined" && Array.isArray(crmAllVillages)) {
      const match = crmAllVillages.find(v => (v.name || v.village || "").trim().toLowerCase() === vLower);
      if (match) {
        match.risk_level = riskLevel;
        if (typeof renderCrmMarkers === "function") {
          try { renderCrmMarkers(); } catch (_) {}
        }
      }
    }
  }

  // ── Animated count-up ──────────────────────────────────────────────
  function animateCountUp(el, target, duration = 800) {
    if (!el) return;
    const start = performance.now();
    function step(now) {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(ease * target);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  }

  // ── Template & UI Helpers ──────────────────────────────────────────
  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str || "";
    return d.innerHTML;
  }

  function riskBadgeClass(level) {
    return {
      Low:    "pcl-badge-low",
      Medium: "pcl-badge-medium",
      High:   "pcl-badge-high"
    }[level] || "pcl-badge-low";
  }

  function riskEmoji(level) {
    return { Low: "🟢", Medium: "⚠️", High: "⚠️" }[level] || "🟢";
  }

  function riskLabel(level) {
    if (level === "High")   return "⚠️ Village Risk Increased";
    if (level === "Medium") return "⚠️ Moderate Community Risk";
    return "🟢 Low Community Risk";
  }

  function renderVitalsPills(vitals) {
    if (!vitals) return `<span class="pcl-vital-placeholder">No vitals logged yet</span>`;
    const temp = vitals.temperature != null ? `🌡️ ${parseFloat(vitals.temperature).toFixed(1)}°C` : null;
    const spo2 = vitals.spo2        != null ? `🫁 ${vitals.spo2}%`                                 : null;
    const hr   = vitals.heart_rate  != null ? `❤️ ${Math.round(vitals.heart_rate)} bpm`             : null;
    const parts = [temp, spo2, hr].filter(Boolean);
    if (!parts.length) return `<span class="pcl-vital-placeholder">No vitals logged yet</span>`;
    return parts.map(p => `<span class="pcl-vital-chip">${p}</span>`).join("");
  }

  function buildCardHTML(patientName, patientVillage, vitals, symptoms, count, riskInfo) {
    const { level, bumped } = riskInfo;
    return `
      <div class="pcl-card pcl-anim-fadein" aria-label="Feature #13: Patient → Community Connection">
        <div class="pcl-card-head">
          <span class="pcl-card-icon">🔗</span>
          <span class="pcl-card-title">Community Link</span>
          <span class="pcl-card-sub">Patient Vital Monitoring → Community Surveillance</span>
        </div>

        <div class="pcl-flow" role="list">

          <!-- ── STEP 1: PATIENT CARD ── -->
          <div class="pcl-step" role="listitem">
            <div class="pcl-step-num">1</div>
            <div class="pcl-step-body">
              <div class="pcl-step-label">Patient</div>

              <!-- Patient Name (Editable / Preserved) -->
              <div class="pcl-field-row">
                <span class="pcl-field-icon">👤</span>
                <input
                  type="text"
                  class="pcl-input pcl-patient-name-input"
                  value="${esc(patientName)}"
                  placeholder="Patient Name"
                  aria-label="Patient Name"
                  maxlength="60"
                />
              </div>

              <!-- Village (Editable / Preserved) -->
              <div class="pcl-field-row">
                <span class="pcl-field-icon">📍</span>
                <input
                  type="text"
                  class="pcl-input pcl-village-input"
                  value="${esc(patientVillage)}"
                  placeholder="Enter Village (e.g. ${esc(DEFAULT_VILLAGE)})"
                  aria-label="Patient Village"
                  maxlength="60"
                />
              </div>

              <!-- Latest Tracked Vitals -->
              <div class="pcl-section-label">Tracked Vitals</div>
              <div class="pcl-vitals-row">
                ${renderVitalsPills(vitals)}
              </div>

              <!-- Symptoms Multi-Select Chips -->
              <div class="pcl-section-label">Patient Symptoms</div>
              <div class="pcl-chip-group" role="group" aria-label="Patient symptoms">
                ${SYMPTOM_LIST.map(sym => `
                  <button
                    type="button"
                    class="pcl-chip ${symptoms.includes(sym) ? "pcl-chip-active" : ""}"
                    data-symptom="${esc(sym)}">${esc(sym)}</button>
                `).join("")}
              </div>
              ${symptoms.length === 0 ? `<span class="pcl-hint">Select symptoms to compare against community</span>` : ""}
            </div>
          </div>

          <!-- ── CONNECTOR 1 → 2 ── -->
          <div class="pcl-arrow" aria-hidden="true">
            <div class="pcl-arrow-line"></div>
            <div class="pcl-arrow-head">›</div>
          </div>

          <!-- ── STEP 2: COMMUNITY ANALYSIS ── -->
          <div class="pcl-step" role="listitem">
            <div class="pcl-step-num">2</div>
            <div class="pcl-step-body">
              <div class="pcl-step-label">Community Analysis</div>

              <!-- Output: "Modhera: 12 similar reports" -->
              <div class="pcl-analysis-output">
                <span class="pcl-village-name-display">${esc(patientVillage)}</span>: 
                <strong class="pcl-count-highlight"><span class="pcl-count-target">${count}</span> similar reports</strong>
              </div>

              <!-- Big Hero Count Display -->
              <div class="pcl-count-row">
                <span class="pcl-count-num">0</span>
                <span class="pcl-count-suffix">reports in ${esc(patientVillage)}</span>
              </div>

              <!-- Matched Symptoms Tags -->
              ${symptoms.length > 0
                ? `<div class="pcl-matched-symptoms">
                     ${symptoms.map(s => `<span class="pcl-sym-tag">${esc(s)}</span>`).join("")}
                   </div>`
                : `<span class="pcl-hint">No symptoms selected</span>`}

              <div class="pcl-threshold-hint">
                Threshold: 0–${RISK_THRESHOLDS.LOW_MAX} Low · ${RISK_THRESHOLDS.LOW_MAX + 1}–${RISK_THRESHOLDS.MEDIUM_MAX} Medium · ${RISK_THRESHOLDS.MEDIUM_MAX + 1}+ High
              </div>
            </div>
          </div>

          <!-- ── CONNECTOR 2 → 3 ── -->
          <div class="pcl-arrow" aria-hidden="true">
            <div class="pcl-arrow-line"></div>
            <div class="pcl-arrow-head">›</div>
          </div>

          <!-- ── STEP 3: VILLAGE RISK BADGE ── -->
          <div class="pcl-step" role="listitem">
            <div class="pcl-step-num">3</div>
            <div class="pcl-step-body">
              <div class="pcl-step-label">Village Risk</div>

              <!-- Risk Badge (Green/Amber/Red with Pulse on High) -->
              <div class="pcl-risk-badge ${riskBadgeClass(level)}">
                <span class="pcl-risk-emoji">${riskEmoji(level)}</span>
                <span class="pcl-risk-text">${esc(riskLabel(level))}</span>
              </div>

              <div class="pcl-risk-level-label">${esc(level)} Risk Level</div>

              <!-- Abnormal Vitals Bump Note -->
              ${bumped ? `
                <div class="pcl-bump-note">
                  ⚡ Risk elevated +1 level due to abnormal vitals (Temp ${vitals.temperature ? vitals.temperature + '°C' : ''})
                </div>
              ` : ""}
            </div>
          </div>

        </div>
      </div>
    `;
  }

  // ── Render into all containers ─────────────────────────────────────
  function render() {
    const containers = document.querySelectorAll(".pcl-wrapper");
    if (!containers || containers.length === 0) {
      const fallback = document.getElementById("pcl-wrapper");
      if (!fallback) return;
    }

    const patientName    = loadPatientName();
    const patientVillage = loadPatientVillage();
    const symptoms       = loadPatientSymptoms();
    const vitals         = getLatestVitals();

    const count    = countSimilarReports(patientVillage, symptoms);
    const riskInfo = computeRisk(count, vitals, symptoms);

    // Propagate to other views (Village Risk & Community Risk Map)
    propagateToVillageRisk(patientVillage, riskInfo.level, count);

    // Render HTML inside every mount container
    const targets = containers.length > 0 ? containers : [document.getElementById("pcl-wrapper")];
    targets.forEach(wrapper => {
      if (!wrapper) return;
      wrapper.innerHTML = buildCardHTML(patientName, patientVillage, vitals, symptoms, count, riskInfo);

      // Bind Patient Name input
      const nameInput = wrapper.querySelector(".pcl-patient-name-input");
      if (nameInput) {
        let nameTimer;
        nameInput.addEventListener("input", () => {
          clearTimeout(nameTimer);
          nameTimer = setTimeout(() => {
            savePatientName(nameInput.value.trim() || DEMO_PATIENT.name);
            render();
          }, 500);
        });
      }

      // Bind Village input
      const vilInput = wrapper.querySelector(".pcl-village-input");
      if (vilInput) {
        let vilTimer;
        vilInput.addEventListener("input", () => {
          clearTimeout(vilTimer);
          vilTimer = setTimeout(() => {
            savePatientVillage(vilInput.value.trim() || DEMO_PATIENT.village);
            render();
          }, 500);
        });
      }

      // Bind Symptom chips
      wrapper.querySelectorAll(".pcl-chip").forEach(chip => {
        chip.addEventListener("click", () => {
          chip.classList.toggle("pcl-chip-active");
          const active = [...wrapper.querySelectorAll(".pcl-chip.pcl-chip-active")].map(c => c.dataset.symptom);
          savePatientSymptoms(active);
          render();
        });
      });

      // Animated count-up
      const countEl = wrapper.querySelector(".pcl-count-num");
      animateCountUp(countEl, count);
    });
  }

  // ── Public Interface ───────────────────────────────────────────────
  function init() {
    seedDemoReports();
    render();
  }

  function refresh() {
    render();
  }

  function updateVitals(latest_reading) {
    window._pclLatestVitals = latest_reading || null;
  }

  // Auto bootstrap on DOM load
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      setTimeout(init, 50);
    }
  }

  return {
    DEFAULT_VILLAGE,
    init,
    refresh,
    updateVitals,
    countSimilarReports,
    computeRisk
  };
})();
