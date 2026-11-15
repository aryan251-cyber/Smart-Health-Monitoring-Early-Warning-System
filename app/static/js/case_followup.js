/**
 * Case Follow-up Controller (Feature #14)
 * Allows ASHA workers to track reported community cases from first report to recovery.
 */

let caseAllList = [];
let caseCurrentFilter = "ALL";
let caseActiveStatusCase = null;

const STATUS_KEYS = ["REPORTED", "UNDER_OBSERVATION", "REFERRED", "RECOVERED"];

const STATUS_CONFIG = {
  REPORTED: {
    label: "Reported",
    colorClass: "status-reported",
    stepIndex: 0,
    next: "UNDER_OBSERVATION",
    nextLabel: "Advance to Under Observation",
    badgeBg: "rgba(59, 130, 246, 0.15)",
    badgeColor: "#60A5FA",
    badgeBorder: "rgba(59, 130, 246, 0.35)"
  },
  UNDER_OBSERVATION: {
    label: "Under Observation",
    colorClass: "status-under-obs",
    stepIndex: 1,
    next: "REFERRED",
    nextLabel: "Advance to Referred",
    skipToRecovered: true,
    badgeBg: "rgba(234, 179, 8, 0.15)",
    badgeColor: "#FACC15",
    badgeBorder: "rgba(234, 179, 8, 0.35)"
  },
  REFERRED: {
    label: "Referred",
    colorClass: "status-referred",
    stepIndex: 2,
    next: "RECOVERED",
    nextLabel: "Advance to Recovered",
    badgeBg: "rgba(249, 115, 22, 0.15)",
    badgeColor: "#FB923C",
    badgeBorder: "rgba(249, 115, 22, 0.35)"
  },
  RECOVERED: {
    label: "Recovered",
    colorClass: "status-recovered",
    stepIndex: 3,
    next: null,
    nextLabel: null,
    badgeBg: "rgba(16, 185, 129, 0.15)",
    badgeColor: "#34D399",
    badgeBorder: "rgba(16, 185, 129, 0.35)"
  }
};

function getStatusBadgeHtml(statusRaw) {
  const norm = (statusRaw || "REPORTED").toUpperCase().replace(/ /g, "_");
  const cfg = STATUS_CONFIG[norm] || STATUS_CONFIG.REPORTED;
  return `<span class="case-status-badge ${cfg.colorClass}" style="background: ${cfg.badgeBg}; color: ${cfg.badgeColor}; border: 1px solid ${cfg.badgeBorder};">
    <span class="status-dot"></span>${cfg.label}
  </span>`;
}

/**
 * Format date nicely for display
 */
function formatCaseDate(dateStr) {
  if (!dateStr) return "Not scheduled";
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

/**
 * Escape HTML to prevent injection
 */
function escapeCaseHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Initialize Case Follow-up View
 */
function initCaseFollowUpView() {
  bindCaseEvents();
  fetchCases();
}

/**
 * Bind DOM event listeners
 */
let caseEventsBound = false;
function bindCaseEvents() {
  if (caseEventsBound) return;
  caseEventsBound = true;

  // New Case Button
  const btnNew = document.getElementById("case-btn-new");
  if (btnNew) {
    btnNew.addEventListener("click", openNewCaseModal);
  }

  // Filter Buttons
  const filterBtns = document.querySelectorAll(".case-filter-btn");
  filterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      filterBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      caseCurrentFilter = btn.dataset.status;
      applyCaseFilter();
    });
  });

  // Retry Button
  const retryBtn = document.getElementById("case-btn-retry");
  if (retryBtn) {
    retryBtn.addEventListener("click", () => fetchCases());
  }

  // Add/Edit Modal Close buttons
  const modalClose = document.getElementById("case-modal-close");
  const modalCancel = document.getElementById("case-modal-cancel-btn");
  const modalBackdrop = document.getElementById("case-modal-backdrop");
  if (modalClose) modalClose.addEventListener("click", closeCaseModal);
  if (modalCancel) modalCancel.addEventListener("click", closeCaseModal);
  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) closeCaseModal();
    });
  }

  // Case Form Submit
  const caseForm = document.getElementById("case-form");
  if (caseForm) {
    caseForm.addEventListener("submit", handleCaseFormSubmit);
  }

  // Status Modal Close buttons
  const statusClose = document.getElementById("case-status-modal-close");
  const statusCancel = document.getElementById("case-status-cancel-btn");
  const statusBackdrop = document.getElementById("case-status-modal-backdrop");
  if (statusClose) statusClose.addEventListener("click", closeStatusModal);
  if (statusCancel) statusCancel.addEventListener("click", closeStatusModal);
  if (statusBackdrop) {
    statusBackdrop.addEventListener("click", (e) => {
      if (e.target === statusBackdrop) closeStatusModal();
    });
  }
}

/**
 * Fetch all cases from API
 */
async function fetchCases() {
  const loading = document.getElementById("case-loading-state");
  const errorBox = document.getElementById("case-error-state");
  const emptyBox = document.getElementById("case-empty-state");
  const grid = document.getElementById("case-grid");

  if (loading) loading.style.display = "flex";
  if (errorBox) errorBox.style.display = "none";
  if (emptyBox) emptyBox.style.display = "none";
  if (grid) grid.innerHTML = "";

  try {
    const res = await fetch("/api/cases");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    caseAllList = Array.isArray(data) ? data : [];

    updateFilterCounts();
    applyCaseFilter();
  } catch (err) {
    console.error("[CaseFollowUp] Failed to fetch cases:", err);
    if (loading) loading.style.display = "none";
    if (errorBox) errorBox.style.display = "flex";
  }
}

/**
 * Update numbers inside filter tab buttons
 */
function updateFilterCounts() {
  const counts = {
    ALL: caseAllList.length,
    REPORTED: 0,
    UNDER_OBSERVATION: 0,
    REFERRED: 0,
    RECOVERED: 0
  };

  caseAllList.forEach(c => {
    const s = (c.status || "REPORTED").toUpperCase().replace(/ /g, "_");
    if (counts[s] !== undefined) counts[s]++;
  });

  const countAll = document.getElementById("count-all");
  const countRep = document.getElementById("count-reported");
  const countObs = document.getElementById("count-under_observation");
  const countRef = document.getElementById("count-referred");
  const countRec = document.getElementById("count-recovered");

  if (countAll) countAll.textContent = counts.ALL;
  if (countRep) countRep.textContent = counts.REPORTED;
  if (countObs) countObs.textContent = counts.UNDER_OBSERVATION;
  if (countRef) countRef.textContent = counts.REFERRED;
  if (countRec) countRec.textContent = counts.RECOVERED;
}

/**
 * Filter and render case cards
 */
function applyCaseFilter() {
  const loading = document.getElementById("case-loading-state");
  const emptyBox = document.getElementById("case-empty-state");
  const grid = document.getElementById("case-grid");

  if (loading) loading.style.display = "none";

  let filtered = caseAllList;
  if (caseCurrentFilter && caseCurrentFilter !== "ALL") {
    filtered = caseAllList.filter(c => {
      const s = (c.status || "REPORTED").toUpperCase().replace(/ /g, "_");
      return s === caseCurrentFilter;
    });
  }

  if (filtered.length === 0) {
    if (grid) grid.innerHTML = "";
    if (emptyBox) emptyBox.style.display = "flex";
  } else {
    if (emptyBox) emptyBox.style.display = "none";
    renderCaseGrid(filtered);
  }
}

/**
 * Render grid of case cards
 */
function renderCaseGrid(cases) {
  const grid = document.getElementById("case-grid");
  if (!grid) return;

  grid.innerHTML = cases.map(c => {
    const caseId = c.id;
    const caseNum = c.caseNumber || `Case #${caseId}`;
    const patient = escapeCaseHtml(c.patientName || c.patient_name || "Anonymous");
    const village = escapeCaseHtml(c.village || "Unknown Village");
    const reportedDate = formatCaseDate(c.reportedDate || c.reported_date);
    const followUpDate = formatCaseDate(c.followUpDate || c.follow_up_date);
    const status = (c.status || "REPORTED").toUpperCase().replace(/ /g, "_");
    const statusBadge = getStatusBadgeHtml(status);

    // Symptoms chips with tick icons
    const symptomList = Array.isArray(c.symptoms) ? c.symptoms : (c.symptoms ? String(c.symptoms).split(",") : []);
    const symptomChipsHtml = symptomList.length > 0
      ? symptomList.map(s => `<span class="symptom-chip"><span class="chip-tick">✓</span> ${escapeCaseHtml(s.trim())}</span>`).join("")
      : `<span class="case-no-symptoms">No symptoms recorded</span>`;

    const isRecovered = status === "RECOVERED";

    return `
      <article class="case-card" data-id="${caseId}">
        <div class="case-card-header">
          <div class="case-card-title-group">
            <span class="case-card-num">${escapeCaseHtml(caseNum)}</span>
            <h3 class="case-patient-name">👤 ${patient}</h3>
          </div>
          <div>${statusBadge}</div>
        </div>

        <div class="case-village-row">
          <span class="case-village-tag">📍 ${village}</span>
        </div>

        <div class="case-dates-grid">
          <div class="case-date-item">
            <span class="case-date-label">📅 Reported</span>
            <span class="case-date-val">${reportedDate}</span>
          </div>
          <div class="case-date-item">
            <span class="case-date-label">⏰ Follow-up</span>
            <span class="case-date-val ${c.followUpDate ? 'has-date' : ''}">${followUpDate}</span>
          </div>
        </div>

        <div class="case-symptoms-section">
          <span class="case-symptoms-label">Symptoms:</span>
          <div class="case-symptoms-list">
            ${symptomChipsHtml}
          </div>
        </div>

        <div class="case-card-footer">
          <button type="button" class="btn-primary case-btn-status" onclick="openStatusModal(${caseId})">
            <span>🔄</span> ${isRecovered ? 'View Status Flow' : 'Update Status'}
          </button>
          <div class="case-card-quick-actions">
            <button type="button" class="case-btn-icon" title="Edit Case Details" onclick="openEditCaseModal(${caseId})">
              ✏️
            </button>
            <button type="button" class="case-btn-icon delete" title="Delete Case" onclick="confirmDeleteCase(${caseId})">
              🗑️
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

/**
 * Open Modal to Create New Case
 */
function openNewCaseModal() {
  const modal = document.getElementById("case-modal-backdrop");
  const form = document.getElementById("case-form");
  const title = document.getElementById("case-modal-title");
  const errorBox = document.getElementById("case-modal-error");
  const submitBtn = document.getElementById("case-modal-submit-btn");

  if (form) form.reset();
  if (errorBox) errorBox.style.display = "none";
  document.getElementById("case-form-id").value = "";

  // Set default reported date to today
  const todayStr = new Date().toISOString().substring(0, 10);
  const repInput = document.getElementById("case-form-reported");
  if (repInput) repInput.value = todayStr;

  if (title) title.textContent = "New Case Follow-up";
  if (submitBtn) submitBtn.textContent = "Create Case";

  if (modal) modal.style.display = "flex";
}

/**
 * Open Modal to Edit Case
 */
async function openEditCaseModal(caseId) {
  const modal = document.getElementById("case-modal-backdrop");
  const form = document.getElementById("case-form");
  const title = document.getElementById("case-modal-title");
  const errorBox = document.getElementById("case-modal-error");
  const submitBtn = document.getElementById("case-modal-submit-btn");

  if (form) form.reset();
  if (errorBox) errorBox.style.display = "none";

  let c = caseAllList.find(item => item.id === caseId);
  if (!c) {
    try {
      const res = await fetch(`/api/cases/${caseId}`);
      if (res.ok) c = await res.json();
    } catch {}
  }

  if (!c) {
    showCaseToast("Case not found", true);
    return;
  }

  document.getElementById("case-form-id").value = c.id;
  document.getElementById("case-form-village").value = c.village || "";
  document.getElementById("case-form-patient").value = (c.patientName === "Anonymous" || c.patient_name === "Anonymous") ? "" : (c.patientName || c.patient_name || "");
  document.getElementById("case-form-reported").value = c.reportedDate || c.reported_date || "";
  document.getElementById("case-form-followup").value = c.followUpDate || c.follow_up_date || "";

  // Set checkboxes
  const sList = Array.isArray(c.symptoms) ? c.symptoms : (c.symptoms ? String(c.symptoms).split(",") : []);
  const cleanList = sList.map(s => s.trim().toLowerCase());
  const checkboxes = document.querySelectorAll("input[name='symptom']");
  checkboxes.forEach(cb => {
    cb.checked = cleanList.includes(cb.value.toLowerCase());
  });

  if (title) title.textContent = `Edit Case #${c.id}`;
  if (submitBtn) submitBtn.textContent = "Save Changes";

  if (modal) modal.style.display = "flex";
}

/**
 * Close Add/Edit Case Modal
 */
function closeCaseModal() {
  const modal = document.getElementById("case-modal-backdrop");
  if (modal) modal.style.display = "none";
}

/**
 * Handle Add/Edit Form Submission
 */
async function handleCaseFormSubmit(e) {
  e.preventDefault();
  const errorBox = document.getElementById("case-modal-error");
  const submitBtn = document.getElementById("case-modal-submit-btn");
  if (errorBox) errorBox.style.display = "none";

  const caseId = document.getElementById("case-form-id").value;
  const village = document.getElementById("case-form-village").value.trim();
  const patientName = document.getElementById("case-form-patient").value.trim() || "Anonymous";
  const reportedDate = document.getElementById("case-form-reported").value;
  const followUpDate = document.getElementById("case-form-followup").value || null;

  if (!village) {
    showFormError("Village is required");
    return;
  }
  if (!reportedDate) {
    showFormError("Reported Date is required");
    return;
  }

  // Selected symptoms
  const checkedSymptoms = [];
  document.querySelectorAll("input[name='symptom']:checked").forEach(cb => {
    checkedSymptoms.push(cb.value);
  });

  const payload = {
    village,
    patientName,
    reportedDate,
    followUpDate,
    symptoms: checkedSymptoms
  };

  const isEdit = Boolean(caseId);
  const url = isEdit ? `/api/cases/${caseId}` : "/api/cases";
  const method = isEdit ? "PUT" : "POST";

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
  }

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP error ${res.status}`);
    }

    closeCaseModal();
    showCaseToast(isEdit ? `Case #${data.id} updated ✓` : `Case #${data.id} created ✓`);
    await fetchCases();
  } catch (err) {
    showFormError(err.message || "Failed to save case record");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? "Save Changes" : "Submit Case";
    }
  }
}

function showFormError(msg) {
  const errorBox = document.getElementById("case-modal-error");
  if (errorBox) {
    errorBox.textContent = msg;
    errorBox.style.display = "block";
  }
}

/**
 * Open Update Status Modal with Step Tracker
 */
function openStatusModal(caseId) {
  const c = caseAllList.find(item => item.id === caseId);
  if (!c) return;

  caseActiveStatusCase = c;
  const modal = document.getElementById("case-status-modal-backdrop");
  const errorBox = document.getElementById("case-status-modal-error");
  if (errorBox) errorBox.style.display = "none";

  const numEl = document.getElementById("case-status-modal-number");
  const patEl = document.getElementById("case-status-modal-patient-name");
  const vilEl = document.getElementById("case-status-modal-village");

  if (numEl) numEl.textContent = c.caseNumber || `Case #${c.id}`;
  if (patEl) patEl.textContent = c.patientName || c.patient_name || "Anonymous";
  if (vilEl) vilEl.textContent = c.village || "Unknown Village";

  renderStepTracker(c.status);
  renderStatusActions(c);

  if (modal) modal.style.display = "flex";
}

/**
 * Render Horizontal Step Tracker
 */
function renderStepTracker(currentStatusRaw) {
  const currentStatus = (currentStatusRaw || "REPORTED").toUpperCase().replace(/ /g, "_");
  const currentCfg = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.REPORTED;
  const currentIdx = currentCfg.stepIndex;

  const stepItems = document.querySelectorAll(".step-item");
  stepItems.forEach(item => {
    const stepName = item.dataset.step;
    const cfg = STATUS_CONFIG[stepName];
    if (!cfg) return;

    item.classList.remove("completed", "active", "future");
    const node = item.querySelector(".step-node");
    const icon = item.querySelector(".step-icon");

    if (cfg.stepIndex < currentIdx) {
      item.classList.add("completed");
      if (icon) icon.innerHTML = "✓";
    } else if (cfg.stepIndex === currentIdx) {
      item.classList.add("active");
      if (icon) icon.textContent = cfg.stepIndex + 1;
    } else {
      item.classList.add("future");
      if (icon) icon.textContent = cfg.stepIndex + 1;
    }
  });

  // Lines between nodes
  const lines = document.querySelectorAll(".step-line");
  lines.forEach(line => {
    const lineNum = parseInt(line.dataset.line, 10);
    // line 1 connects step 0 to 1, line 2 connects 1 to 2, line 3 connects 2 to 3
    if (lineNum <= currentIdx) {
      line.classList.add("completed");
    } else {
      line.classList.remove("completed");
    }
  });
}

/**
 * Render dynamic advancement buttons based on current status
 */
function renderStatusActions(caseObj) {
  const container = document.getElementById("case-status-actions");
  if (!container) return;

  const status = (caseObj.status || "REPORTED").toUpperCase().replace(/ /g, "_");
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.REPORTED;

  if (status === "RECOVERED") {
    container.innerHTML = `
      <div class="case-recovered-banner">
        <span class="recovered-check">🎉</span>
        <div>
          <h4>Case Fully Recovered</h4>
          <p>The patient has achieved recovery. This case is complete and cannot be moved backwards.</p>
        </div>
      </div>
    `;
    return;
  }

  let html = `
    <div class="status-action-prompt">
      <span>Current Status: <strong style="color: ${cfg.badgeColor};">${cfg.label}</strong></span>
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 2px;">
        Status flow is forward-only. Move to the next stage below:
      </p>
    </div>
    <div class="status-advance-buttons">
  `;

  if (cfg.next) {
    const nextCfg = STATUS_CONFIG[cfg.next];
    html += `
      <button type="button" class="btn-primary btn-advance-next" onclick="advanceCaseStatus('${cfg.next}')">
        <span>➡️</span> Move to ${nextCfg.label}
      </button>
    `;
  }

  // Allow skipping Referred if the patient recovers
  if (status === "UNDER_OBSERVATION") {
    html += `
      <button type="button" class="preset-btn btn-advance-skip" onclick="advanceCaseStatus('RECOVERED')" title="Direct recovery without hospital referral">
        <span>✨</span> Direct Recovery (Mark Recovered)
      </button>
    `;
  } else if (status === "REPORTED") {
    // Also allow skipping directly to Referred or Recovered if urgent
    html += `
      <button type="button" class="preset-btn btn-advance-skip" onclick="advanceCaseStatus('REFERRED')" title="Emergency referral directly">
        <span>🚨</span> Urgent: Skip to Referred
      </button>
    `;
  }

  html += `</div>`;
  container.innerHTML = html;
}

/**
 * Execute PATCH status update
 */
async function advanceCaseStatus(targetStatus) {
  if (!caseActiveStatusCase) return;
  const caseId = caseActiveStatusCase.id;
  const errorBox = document.getElementById("case-status-modal-error");
  if (errorBox) errorBox.style.display = "none";

  const buttons = document.querySelectorAll("#case-status-actions button");
  buttons.forEach(b => { b.disabled = true; });

  try {
    const res = await fetch(`/api/cases/${caseId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: targetStatus })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    // Update active case
    caseActiveStatusCase = data;

    // Animate step tracker to new status
    renderStepTracker(data.status);
    renderStatusActions(data);

    // Update local cache and view
    const idx = caseAllList.findIndex(c => c.id === caseId);
    if (idx !== -1) {
      caseAllList[idx] = data;
    }

    updateFilterCounts();
    applyCaseFilter();

    showCaseToast(`Status updated to ${STATUS_CONFIG[data.status]?.label || data.status} ✓`);
  } catch (err) {
    if (errorBox) {
      errorBox.textContent = err.message || "Failed to update status";
      errorBox.style.display = "block";
    }
  } finally {
    buttons.forEach(b => { b.disabled = false; });
  }
}

/**
 * Close Status Modal
 */
function closeStatusModal() {
  const modal = document.getElementById("case-status-modal-backdrop");
  if (modal) modal.style.display = "none";
  caseActiveStatusCase = null;
}

/**
 * Delete a case with confirmation
 */
async function confirmDeleteCase(caseId) {
  const c = caseAllList.find(item => item.id === caseId);
  const caseName = c ? (c.caseNumber || `Case #${caseId}`) : `Case #${caseId}`;

  if (!confirm(`Are you sure you want to delete ${caseName}? This action cannot be undone.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/cases/${caseId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to delete case");
    }

    showCaseToast(`${caseName} deleted`);
    caseAllList = caseAllList.filter(item => item.id !== caseId);
    updateFilterCounts();
    applyCaseFilter();
  } catch (err) {
    alert(err.message || "Could not delete case");
  }
}

/**
 * Show toast notification
 */
let caseToastTimeout = null;
function showCaseToast(msg, isError = false) {
  const toast = document.getElementById("case-toast");
  if (!toast) return;

  toast.textContent = msg;
  toast.style.background = isError ? "rgba(239, 68, 68, 0.9)" : "rgba(16, 185, 129, 0.95)";
  toast.style.display = "block";

  if (caseToastTimeout) clearTimeout(caseToastTimeout);
  caseToastTimeout = setTimeout(() => {
    toast.style.display = "none";
  }, 2500);
}

