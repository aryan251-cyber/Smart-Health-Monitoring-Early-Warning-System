/**
 * VitalWatch — Community Reports Module
 * Self-contained: form, validation, localStorage, toast, summary, and report cards.
 * All identifiers prefixed with `cr` to avoid collisions with existing code.
 */

// ── Storage ──────────────────────────────────────────────────────
const CR_KEY      = "vitalwatch_community_reports";
const CR_MAX      = 20;
const CR_SYMPTOMS = ["Diarrhea", "Vomiting", "Fever", "Abdominal Pain", "Weakness", "Dehydration"];
const CR_SOURCES  = ["Well", "Hand Pump", "River", "Tap", "Other"];

function crLoadReports() {
  try { return JSON.parse(localStorage.getItem(CR_KEY)) || []; } catch { return []; }
}
function crSaveReports(list) {
  localStorage.setItem(CR_KEY, JSON.stringify(list));
}
function crAddReport(r) {
  const list = crLoadReports();
  list.unshift(r);
  crSaveReports(list.slice(0, CR_MAX));
}

const CR_SYMPTOM_KEYS = {
  "Diarrhea": "symptom_diarrhea",
  "Vomiting": "symptom_vomiting",
  "Fever": "symptom_fever",
  "Abdominal Pain": "symptom_abdominal_pain",
  "Weakness": "symptom_weakness",
  "Dehydration": "symptom_dehydration"
};

const CR_SOURCE_KEYS = {
  "Well": "source_well",
  "Hand Pump": "source_hand_pump",
  "River": "source_river",
  "Tap": "source_tap",
  "Other": "source_other"
};

function crTranslate(text, map) {
  if (typeof window.t === "function" && map && map[text]) {
    return window.t(map[text]) || text;
  }
  return text;
}

// ── Initialise (called once when tab first opens) ─────────────────
function crInit() {
  const form = document.getElementById("cr-form");
  if (!form) return;

  // Build symptom chips (idempotent guard)
  const chipsEl = document.getElementById("cr-symptom-chips");
  if (chipsEl && chipsEl.children.length === 0) {
    CR_SYMPTOMS.forEach(sym => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cr-chip";
      btn.dataset.symptom = sym;
      btn.textContent = crTranslate(sym, CR_SYMPTOM_KEYS);
      btn.addEventListener("click", () => {
        btn.classList.toggle("cr-chip-active");
        crClearError("cr-err-symptoms");
      });
      chipsEl.appendChild(btn);
    });
  }

  // Build water-source radio group (idempotent guard)
  const radioEl = document.getElementById("cr-water-radios");
  if (radioEl && radioEl.children.length === 0) {
    CR_SOURCES.forEach(src => {
      const lbl = document.createElement("label");
      lbl.className = "cr-radio-label";
      lbl.innerHTML = `<input type="radio" name="cr-water-source" value="${src}" class="cr-radio-input"><span class="cr-radio-text" data-src="${src}">${crTranslate(src, CR_SOURCE_KEYS)}</span>`;
      lbl.querySelector("input").addEventListener("change", () => crClearError("cr-err-water"));
      radioEl.appendChild(lbl);
    });
  }

  if (!form._crBound) {
    form.addEventListener("submit", crHandleSubmit);
    window.addEventListener("languageChanged", () => {
      document.querySelectorAll(".cr-chip").forEach(btn => {
        const sym = btn.dataset.symptom;
        if (sym) btn.textContent = crTranslate(sym, CR_SYMPTOM_KEYS);
      });
      document.querySelectorAll(".cr-radio-text").forEach(span => {
        const src = span.dataset.src;
        if (src) span.textContent = crTranslate(src, CR_SOURCE_KEYS);
      });
      crRenderReports();
    });
    form._crBound = true;
  }

  crRenderReports();
}

// ── Submit handler ────────────────────────────────────────────────
async function crHandleSubmit(e) {
  e.preventDefault();
  if (!crValidate()) return;

  const village        = document.getElementById("cr-village").value.trim();
  const symptoms       = [...document.querySelectorAll(".cr-chip.cr-chip-active")].map(c => c.dataset.symptom);
  const peopleAffected = parseInt(document.getElementById("cr-people").value, 10);
  const waterSource    = document.querySelector("input[name='cr-water-source']:checked")?.value || "";

  const report = {
    id:            Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    village, symptoms, peopleAffected, waterSource,
    timestamp: new Date().toISOString()
  };

  // Add to local display and reset the form inputs
  crAddReport(report);
  crResetForm();
  crRenderReports();

  // Feature #16: Check if High Risk alert should be triggered (≥5 affected, ≥2 symptoms)
  if (typeof triggerAlertIfHighRisk === "function") {
    triggerAlertIfHighRisk(village, peopleAffected, symptoms);
  }

  // Feature #15: Offline / Online Submit Flow
  if (!navigator.onLine) {
    if (typeof savePending === "function") {
      savePending(report);
    }
    if (typeof showOfflineToast === "function") {
      showOfflineToast("You're offline. Report saved on this device.", "amber");
    } else {
      crShowToast("You're offline. Report saved on this device.");
    }
    return;
  }

  // When online, post to /api/reports
  try {
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report)
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    if (typeof showOfflineToast === "function") {
      showOfflineToast(typeof window.t === "function" ? window.t("msg_report_submitted") : "Report submitted successfully!", "success");
    } else {
      crShowToast("Report submitted successfully!");
    }
  } catch (err) {
    // If network drops or fetch fails, save to pendingReports
    if (typeof savePending === "function") {
      savePending(report);
    }
    if (typeof showOfflineToast === "function") {
      showOfflineToast("You're offline. Report saved on this device.", "amber");
    } else {
      crShowToast("You're offline. Report saved on this device.");
    }
  }
}

// ── Validation ────────────────────────────────────────────────────
function crValidate() {
  let ok = true;
  const village = document.getElementById("cr-village")?.value.trim();
  if (!village) { crShowError("cr-err-village", "Village name is required."); ok = false; }
  else crClearError("cr-err-village");

  if (document.querySelectorAll(".cr-chip.cr-chip-active").length === 0) {
    crShowError("cr-err-symptoms", "Select at least one symptom."); ok = false;
  } else crClearError("cr-err-symptoms");

  const people = parseInt(document.getElementById("cr-people")?.value, 10);
  if (!people || people < 1 || isNaN(people)) {
    crShowError("cr-err-people", "Enter a valid number (min 1)."); ok = false;
  } else crClearError("cr-err-people");

  if (!document.querySelector("input[name='cr-water-source']:checked")) {
    crShowError("cr-err-water", "Select a water source."); ok = false;
  } else crClearError("cr-err-water");

  return ok;
}

function crShowError(id, msg) { const el = document.getElementById(id); if (el) el.textContent = msg; }
function crClearError(id)     { const el = document.getElementById(id); if (el) el.textContent = ""; }

function crResetForm() {
  document.getElementById("cr-village").value = "";
  document.getElementById("cr-people").value  = "";
  document.querySelectorAll(".cr-chip").forEach(c => c.classList.remove("cr-chip-active"));
  document.querySelectorAll("input[name='cr-water-source']").forEach(r => (r.checked = false));
  ["cr-err-village", "cr-err-symptoms", "cr-err-people", "cr-err-water"].forEach(crClearError);
}

// ── Render list + summary ─────────────────────────────────────────
function crRenderReports() {
  const reports   = crLoadReports();
  const listEl    = document.getElementById("cr-reports-list");
  const summaryEl = document.getElementById("cr-summary");
  if (!listEl) return;

  // Summary row
  if (summaryEl) {
    if (reports.length > 0) {
      const totalPeople = reports.reduce((s, r) => s + (r.peopleAffected || 0), 0);
      const srcCounts = {};
      reports.forEach(r => { if (r.waterSource) srcCounts[r.waterSource] = (srcCounts[r.waterSource] || 0) + 1; });
      const topSrc = Object.entries(srcCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
      summaryEl.innerHTML = `
        <div class="cr-summary-item"><span class="cr-summary-val">${reports.length}</span><span class="cr-summary-label">Total Reports</span></div>
        <div class="cr-summary-divider"></div>
        <div class="cr-summary-item"><span class="cr-summary-val">${totalPeople}</span><span class="cr-summary-label">People Affected</span></div>
        <div class="cr-summary-divider"></div>
        <div class="cr-summary-item"><span class="cr-summary-val">${crEsc(topSrc)}</span><span class="cr-summary-label">Top Water Source</span></div>
      `;
      summaryEl.style.display = "flex";
    } else {
      summaryEl.style.display = "none";
    }
  }

  if (reports.length === 0) {
    listEl.innerHTML = `
      <div class="cr-empty-state">
        <span style="font-size:2.4rem; opacity:0.45;">🏘️</span>
        <p>No community reports yet.<br>Submit the first one using the form.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = reports.map((r, i) => `
    <div class="cr-report-card cr-card-fadein" style="animation-delay:${Math.min(i, 8) * 0.055}s">
      <div class="cr-card-header">
        <div class="cr-card-village">
          <span class="cr-village-dot"></span>
          <strong>${crEsc(r.village)}</strong>
        </div>
        <span class="cr-card-time">${crFmtTime(r.timestamp)}</span>
      </div>
      <div class="cr-symptoms-row">
        ${r.symptoms.map(s => `<span class="cr-symptom-pill">${crEsc(s)}</span>`).join("")}
      </div>
      <div class="cr-card-meta">
        <span class="cr-meta-item"><span>👥</span> ${r.peopleAffected} ${r.peopleAffected === 1 ? "person" : "people"} affected</span>
        <span class="cr-meta-item"><span>💧</span> ${crEsc(r.waterSource)}</span>
      </div>
    </div>
  `).join("");
}

// ── Helpers ───────────────────────────────────────────────────────
function crFmtTime(iso) {
  if (!iso) return "--";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function crEsc(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function crShowToast(msg) {
  const old = document.getElementById("cr-toast");
  if (old) old.remove();
  const toast = document.createElement("div");
  toast.id        = "cr-toast";
  toast.className = "cr-toast";
  toast.setAttribute("role", "alert");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("cr-toast-visible")));
  setTimeout(() => { toast.classList.remove("cr-toast-visible"); setTimeout(() => toast.remove(), 400); }, 3200);
}

// ── Bootstrap ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => crInit());
