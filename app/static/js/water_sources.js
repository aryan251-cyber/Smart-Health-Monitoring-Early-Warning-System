/**
 * VitalWatch - Feature #9: Water Sources Management
 * 
 * Manages community water sources: listing, filtering by risk status,
 * card rendering, adding/editing sources with modal dialog, and live risk recalculation.
 */

let wsActiveFilter = null; // null | "safe" | "warning" | "contaminated"
let wsAllSources = [];
let wsVillagesList = [];

/**
 * Format ISO date string into friendly "26 Sep" format
 */
function wsFormatDate(dateStr) {
  if (!dateStr) return "N/A";
  try {
    const parts = dateStr.split("T")[0].split("-");
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
  } catch {
    return dateStr;
  }
}

/**
 * Return type icon / emoji for water source type
 */
function wsGetTypeIcon(type) {
  const t = (type || "").toLowerCase().trim();
  switch (t) {
    case "hand_pump":
    case "handpump":
      return "🚰";
    case "well":
      return "🕳️";
    case "river":
      return "🌊";
    case "tap":
      return "🚿";
    default:
      return "💧";
  }
}

/**
 * Return user-friendly type label
 */
function wsGetTypeLabel(type) {
  const tFn = (typeof window.t === "function") ? window.t : ((k) => k);
  const t = (type || "").toLowerCase().trim();
  switch (t) {
    case "hand_pump":
    case "handpump":
      return tFn("source_hand_pump") || "Hand Pump";
    case "well":
      return tFn("source_well") || "Well";
    case "river":
      return tFn("source_river") || "River";
    case "tap":
      return tFn("source_tap") || "Tap";
    default:
      return tFn("source_other") || "Water Source";
  }
}

/**
 * Show temporary toast message
 */
function wsShowToast(message = "Source saved ✓") {
  const toast = document.getElementById("ws-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = "block";
  toast.classList.remove("ws-toast-anim");
  void toast.offsetWidth; // reflow
  toast.classList.add("ws-toast-anim");

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.display = "none";
  }, 2800);
}

/**
 * Fetch list of villages for modal dropdown
 */
async function wsFetchVillages() {
  const villageSelect = document.getElementById("ws-input-village");
  if (!villageSelect) return;

  try {
    const res = await fetch("/api/villages");
    if (res.ok) {
      const data = await res.json();
      wsVillagesList = Array.isArray(data) ? data : (data.villages || []);
    }
  } catch (err) {
    console.warn("Could not fetch villages list, using fallback names:", err);
  }

  if (wsVillagesList.length === 0) {
    wsVillagesList = [
      { id: 1, name: "Rampur" },
      { id: 2, name: "Devgaon" },
      { id: 3, name: "Sonwadi" },
      { id: 4, name: "Khamgaon" },
      { id: 5, name: "Bhilwadi" }
    ];
  }

  villageSelect.innerHTML = wsVillagesList.map(v => 
    `<option value="${v.id}">${v.name}</option>`
  ).join("");
}

/**
 * Fetch water sources from backend and render
 */
async function wsFetchSources() {
  const grid = document.getElementById("ws-grid");
  const loading = document.getElementById("ws-loading-state");
  const errorBox = document.getElementById("ws-error-state");
  const emptyBox = document.getElementById("ws-empty-state");

  if (loading) loading.style.display = "flex";
  if (errorBox) errorBox.style.display = "none";
  if (emptyBox) emptyBox.style.display = "none";
  if (grid) grid.style.display = "none";

  const url = wsActiveFilter 
    ? `/api/water-sources?status=${encodeURIComponent(wsActiveFilter)}`
    : "/api/water-sources";

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const sources = await res.json();

    if (loading) loading.style.display = "none";
    wsRenderSources(sources);

    // If fetch was unfiltered, update summary counts
    if (!wsActiveFilter) {
      wsUpdateCounts(sources);
    } else {
      // Re-fetch all counts in background to keep badges accurate
      wsFetchUnfilteredCounts();
    }
  } catch (err) {
    console.error("Failed to fetch water sources:", err);
    if (loading) loading.style.display = "none";
    if (errorBox) errorBox.style.display = "flex";
    if (grid) grid.style.display = "none";
  }
}

/**
 * Fetch unfiltered counts to keep the 3 summary chips accurate even while filtering
 */
async function wsFetchUnfilteredCounts() {
  try {
    const res = await fetch("/api/water-sources");
    if (res.ok) {
      const all = await res.json();
      wsUpdateCounts(all);
    }
  } catch {}
}

/**
 * Update the 3 count chips
 */
function wsUpdateCounts(sources) {
  let safe = 0;
  let warning = 0;
  let contaminated = 0;

  sources.forEach(s => {
    const stat = (s.risk_status || "").toLowerCase();
    if (stat === "safe") safe++;
    else if (stat === "warning") warning++;
    else if (stat === "contaminated") contaminated++;
  });

  const safeEl = document.getElementById("ws-count-safe");
  const warnEl = document.getElementById("ws-count-warning");
  const contEl = document.getElementById("ws-count-contaminated");

  if (safeEl) safeEl.textContent = safe;
  if (warnEl) warnEl.textContent = warning;
  if (contEl) contEl.textContent = contaminated;
}

/**
 * Render water sources grid
 */
function wsRenderSources(sources) {
  wsAllSources = sources;
  const grid = document.getElementById("ws-grid");
  const emptyBox = document.getElementById("ws-empty-state");

  if (!grid) return;

  if (!sources || sources.length === 0) {
    grid.innerHTML = "";
    grid.style.display = "none";
    if (emptyBox) emptyBox.style.display = "flex";
    return;
  }

  if (emptyBox) emptyBox.style.display = "none";
  grid.style.display = "grid";

  grid.innerHTML = sources.map((source, index) => {
    const status = (source.risk_status || "safe").toLowerCase();
    const typeIcon = wsGetTypeIcon(source.source_type);
    const typeLabel = wsGetTypeLabel(source.source_type);
    const dateFormatted = source.last_tested_formatted || wsFormatDate(source.last_tested);
    const delay = (index * 0.05).toFixed(2);

    let statusBadgeText = "Safe";
    let statusClass = "ws-card-safe";
    let badgeClass = "ws-badge-safe";
    let statusDot = `<span class="ws-status-dot dot-safe"></span>`;

    if (status === "warning") {
      statusBadgeText = "Warning";
      statusClass = "ws-card-warning";
      badgeClass = "ws-badge-warning";
      statusDot = `<span class="ws-status-dot dot-warning"></span>`;
    } else if (status === "contaminated") {
      statusBadgeText = "Contaminated";
      statusClass = "ws-card-contaminated";
      badgeClass = "ws-badge-contaminated";
      statusDot = `<span class="ws-status-dot dot-contaminated pulse-dot"></span>`;
    }

    const bacterialDisplay = source.bacterial_status === "contaminated" ? "Pos" : "Neg";

    return `
      <div class="ws-card ${statusClass}" style="animation-delay: ${delay}s;" data-id="${source.id}">
        <!-- Top bar: Type + Status Badge -->
        <div class="ws-card-header">
          <div class="ws-card-type-group">
            <span class="ws-card-icon" title="${typeLabel}">${typeIcon}</span>
            <div>
              <h3 class="ws-card-title" title="${source.source_name}">${source.source_name}</h3>
              <span class="ws-card-village">📍 ${source.village_name || "Community"} &bull; ${typeLabel}</span>
            </div>
          </div>
          <div class="ws-badge ${badgeClass}">
            ${statusDot}
            <span>${statusBadgeText}</span>
          </div>
        </div>

        <!-- Metric Stat Pills: pH, Turbidity, Bacteria -->
        <div class="ws-stats-row">
          <div class="ws-stat-pill" title="Water pH level (Normal: 6.5 - 8.5)">
            <span class="ws-stat-label">pH</span>
            <span class="ws-stat-val">${source.ph !== null ? source.ph : "--"}</span>
          </div>
          <div class="ws-stat-pill" title="Turbidity in NTU (Limit: 5.0 NTU)">
            <span class="ws-stat-label">Turbidity</span>
            <span class="ws-stat-val">${source.turbidity !== null ? source.turbidity + " NTU" : "--"}</span>
          </div>
          <div class="ws-stat-pill" title="Bacterial test status">
            <span class="ws-stat-label">Bacteria</span>
            <span class="ws-stat-val">${bacterialDisplay}</span>
          </div>
        </div>

        <!-- Footer: Last Tested Date + Edit Button -->
        <div class="ws-card-footer">
          <span class="ws-card-date" title="Tested on ${source.last_tested || 'N/A'}">
            🗓️ Tested ${dateFormatted}
          </span>
          <button type="button" class="ws-btn-edit" onclick="wsOpenEditModal(${source.id})">
            ✏️ Edit
          </button>
        </div>
      </div>
    `;
  }).join("");
}

/**
 * Filter chip click toggle
 */
function wsToggleFilter(status) {
  const chips = document.querySelectorAll(".ws-filter-chip");
  const hint = document.getElementById("ws-filter-hint");

  if (wsActiveFilter === status) {
    // Clear filter
    wsActiveFilter = null;
    chips.forEach(c => c.classList.remove("active"));
    if (hint) hint.style.display = "none";
  } else {
    // Activate filter
    wsActiveFilter = status;
    chips.forEach(c => {
      if (c.dataset.status === status) c.classList.add("active");
      else c.classList.remove("active");
    });
    if (hint) hint.style.display = "inline";
  }

  wsFetchSources();
}

/**
 * Modal Handling: Open for Add
 */
function wsOpenAddModal() {
  const backdrop = document.getElementById("ws-modal-backdrop");
  const form = document.getElementById("ws-form");
  const errBox = document.getElementById("ws-form-error");
  const title = document.getElementById("ws-modal-title");
  const sub = document.getElementById("ws-modal-sub");

  if (!backdrop || !form) return;

  form.reset();
  document.getElementById("ws-form-id").value = "";
  document.getElementById("ws-input-date").value = new Date().toISOString().split("T")[0];
  if (errBox) errBox.style.display = "none";

  if (title) title.textContent = "Add Water Source";
  if (sub) sub.textContent = "Enter source parameters for automatic risk assessment";

  backdrop.style.display = "flex";
  backdrop.classList.add("ws-modal-visible");
}

/**
 * Modal Handling: Open for Edit
 */
function wsOpenEditModal(sourceId) {
  const source = wsAllSources.find(s => s.id === sourceId);
  if (!source) return;

  const backdrop = document.getElementById("ws-modal-backdrop");
  const errBox = document.getElementById("ws-form-error");
  const title = document.getElementById("ws-modal-title");
  const sub = document.getElementById("ws-modal-sub");

  if (!backdrop) return;

  document.getElementById("ws-form-id").value = source.id;
  document.getElementById("ws-input-name").value = source.source_name || "";
  document.getElementById("ws-input-type").value = source.source_type || "hand_pump";
  document.getElementById("ws-input-ph").value = source.ph !== null ? source.ph : "";
  document.getElementById("ws-input-turbidity").value = source.turbidity !== null ? source.turbidity : "";
  document.getElementById("ws-input-bacterial").value = source.bacterial_status || "safe";
  document.getElementById("ws-input-date").value = source.last_tested ? source.last_tested.split("T")[0] : "";

  const villageSelect = document.getElementById("ws-input-village");
  if (villageSelect && source.village_id) {
    villageSelect.value = source.village_id;
  }

  if (errBox) errBox.style.display = "none";
  if (title) title.textContent = "Edit Water Source";
  if (sub) sub.textContent = `Update parameters for ${source.source_name}`;

  backdrop.style.display = "flex";
  backdrop.classList.add("ws-modal-visible");
}

/**
 * Modal Handling: Close
 */
function wsCloseModal() {
  const backdrop = document.getElementById("ws-modal-backdrop");
  if (!backdrop) return;
  backdrop.classList.remove("ws-modal-visible");
  setTimeout(() => {
    backdrop.style.display = "none";
  }, 200);
}

/**
 * Modal Form Submission: Add or Update
 */
async function wsHandleFormSubmit(e) {
  e.preventDefault();
  const errBox = document.getElementById("ws-form-error");
  const submitBtn = document.getElementById("ws-modal-submit-btn");

  const id = document.getElementById("ws-form-id").value;
  const sourceName = document.getElementById("ws-input-name").value.trim();
  const sourceType = document.getElementById("ws-input-type").value;
  const villageId = document.getElementById("ws-input-village").value;
  const phRaw = document.getElementById("ws-input-ph").value;
  const turbRaw = document.getElementById("ws-input-turbidity").value;
  const bacterial = document.getElementById("ws-input-bacterial").value;
  const lastTested = document.getElementById("ws-input-date").value;

  if (!sourceName) {
    if (errBox) {
      errBox.textContent = "Source name is required.";
      errBox.style.display = "block";
    }
    return;
  }

  const ph = parseFloat(phRaw);
  const turbidity = parseFloat(turbRaw);

  if (isNaN(ph) || isNaN(turbidity)) {
    if (errBox) {
      errBox.textContent = "Please enter valid numeric values for pH and turbidity.";
      errBox.style.display = "block";
    }
    return;
  }

  const payload = {
    source_name: sourceName,
    source_type: sourceType,
    village_id: villageId ? parseInt(villageId, 10) : null,
    ph: ph,
    turbidity: turbidity,
    bacterial_status: bacterial,
    last_tested: lastTested
  };

  const isEdit = Boolean(id);
  const url = isEdit ? `/api/water-sources/${id}` : "/api/water-sources";
  const method = isEdit ? "PUT" : "POST";

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
  }

  try {
    const res = await fetch(url, {
      method: method,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server responded with ${res.status}`);
    }

    // Success: close modal, show toast, refresh grid
    wsCloseModal();
    wsShowToast("Source saved ✓");
    wsFetchSources();

  } catch (err) {
    console.error("Save error:", err);
    if (errBox) {
      errBox.textContent = err.message || "Failed to save water source. Please try again.";
      errBox.style.display = "block";
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Save Source";
    }
  }
}

/**
 * Initialize event listeners
 */
function initWaterSources() {
  // Add Source Button
  const addBtn = document.getElementById("ws-btn-add-source");
  if (addBtn) {
    addBtn.addEventListener("click", wsOpenAddModal);
  }

  // Filter Chips
  ["safe", "warning", "contaminated"].forEach(status => {
    const chip = document.getElementById(`ws-filter-${status}`);
    if (chip) {
      chip.addEventListener("click", () => wsToggleFilter(status));
    }
  });

  // Modal Close buttons & backdrop click
  const closeBtn = document.getElementById("ws-modal-close-btn");
  const cancelBtn = document.getElementById("ws-modal-cancel-btn");
  const backdrop = document.getElementById("ws-modal-backdrop");

  if (closeBtn) closeBtn.addEventListener("click", wsCloseModal);
  if (cancelBtn) cancelBtn.addEventListener("click", wsCloseModal);
  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) wsCloseModal();
    });
  }

  // Form Submit
  const form = document.getElementById("ws-form");
  if (form) {
    form.addEventListener("submit", wsHandleFormSubmit);
  }

  // Retry button
  const retryBtn = document.getElementById("ws-btn-retry");
  if (retryBtn) {
    retryBtn.addEventListener("click", wsFetchSources);
  }

  // Fetch villages and initial sources
  wsFetchVillages();
  wsFetchSources();

  window.addEventListener("languageChanged", () => {
    if (wsAllSources && wsAllSources.length > 0) {
      wsRenderSources();
    }
  });
}

// Global hook for app navigation
window.initWaterSourcesView = function() {
  wsFetchSources();
};

// Initialise on DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  initWaterSources();
});
