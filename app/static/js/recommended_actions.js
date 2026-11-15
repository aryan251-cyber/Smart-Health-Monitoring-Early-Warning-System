/**
 * VitalWatch - Feature #10: Recommended Actions
 * Decision-support tool rendering action checklists per active risk trigger.
 * Persists action ticks in localStorage and syncs with the Overview Top 3 Actions card.
 */

const RA_STORAGE_KEY = "vitalwatch_rec_actions_ticks";
let raAllRecommendations = [];

/**
 * Get ticked indices map from localStorage: { [recId]: [index, index, ...] }
 */
function raGetStoredTicks() {
  try {
    return JSON.parse(localStorage.getItem(RA_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

/**
 * Save ticked indices map to localStorage
 */
function raSaveTicks(ticksMap) {
  try {
    localStorage.setItem(RA_STORAGE_KEY, JSON.stringify(ticksMap));
  } catch {}
}

/**
 * Toggle an action checklist item tick
 */
function raToggleActionTick(recId, actionIdx) {
  const ticksMap = raGetStoredTicks();
  const list = ticksMap[recId] || [];
  const idxPos = list.indexOf(actionIdx);

  if (idxPos > -1) {
    list.splice(idxPos, 1);
  } else {
    list.push(actionIdx);
  }

  ticksMap[recId] = list;
  raSaveTicks(ticksMap);

  // Re-render UI cards to reflect updated progress
  raRenderCards(raAllRecommendations);
  raRenderOverviewTopActions(raAllRecommendations);
}

/**
 * Fetch recommended actions from backend
 */
async function raFetchActions() {
  const grid = document.getElementById("ra-grid");
  const loading = document.getElementById("ra-loading-state");
  const errorBox = document.getElementById("ra-error-state");
  const emptyBox = document.getElementById("ra-empty-state");

  if (loading) loading.style.display = "flex";
  if (errorBox) errorBox.style.display = "none";
  if (emptyBox) emptyBox.style.display = "none";
  if (grid) grid.style.display = "none";

  try {
    const res = await fetch("/api/recommended-actions", {
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    raAllRecommendations = Array.isArray(data) ? data : [];

    if (loading) loading.style.display = "none";

    raUpdateSummaryChips(raAllRecommendations);
    raRenderCards(raAllRecommendations);
    raRenderOverviewTopActions(raAllRecommendations);

  } catch (err) {
    console.error("Failed to load recommended actions:", err);
    if (loading) loading.style.display = "none";
    if (errorBox) errorBox.style.display = "flex";
    if (grid) grid.style.display = "none";
  }
}

/**
 * Update High / Medium / Low summary count chips
 */
function raUpdateSummaryChips(recs) {
  let high = 0;
  let medium = 0;
  let low = 0;

  recs.forEach(r => {
    const s = (r.severity || "").toLowerCase();
    if (s === "high") high++;
    else if (s === "medium") medium++;
    else if (s === "low") low++;
  });

  const hEl = document.getElementById("ra-count-high");
  const mEl = document.getElementById("ra-count-medium");
  const lEl = document.getElementById("ra-count-low");

  if (hEl) hEl.textContent = high;
  if (mEl) mEl.textContent = medium;
  if (lEl) lEl.textContent = low;
}

/**
 * Render the full grid of recommendation cards
 */
function raRenderCards(recs) {
  const grid = document.getElementById("ra-grid");
  const emptyBox = document.getElementById("ra-empty-state");
  if (!grid) return;

  if (!recs || recs.length === 0) {
    grid.innerHTML = "";
    grid.style.display = "none";
    if (emptyBox) emptyBox.style.display = "flex";
    return;
  }

  if (emptyBox) emptyBox.style.display = "none";
  grid.style.display = "grid";

  const ticksMap = raGetStoredTicks();

  grid.innerHTML = recs.map((rec, cardIdx) => {
    const severity = (rec.severity || "medium").toLowerCase();
    const actions = rec.actions || [];
    const total = actions.length;
    const ticked = (ticksMap[rec.id] || []).filter(idx => idx >= 0 && idx < total);
    const countDone = ticked.length;
    const isAllDone = total > 0 && countDone === total;
    const progressPct = total > 0 ? Math.round((countDone / total) * 100) : 0;
    const delay = (cardIdx * 0.05).toFixed(2);

    let severityClass = "ra-card-medium";
    let badgeClass = "ra-badge-medium";
    let badgeText = "Medium";
    let dotHtml = `<span class="ra-status-dot dot-medium"></span>`;

    if (severity === "high") {
      severityClass = "ra-card-high";
      badgeClass = "ra-badge-high";
      badgeText = "High";
      dotHtml = `<span class="ra-status-dot dot-high pulse-dot"></span>`;
    } else if (severity === "low") {
      severityClass = "ra-card-low";
      badgeClass = "ra-badge-low";
      badgeText = "Low";
      dotHtml = `<span class="ra-status-dot dot-low"></span>`;
    }

    const itemsHtml = actions.map((act, actIdx) => {
      const isDone = ticked.includes(actIdx);
      const checkedAttr = isDone ? "checked" : "";
      const itemDoneClass = isDone ? "ra-item-done" : "";

      return `
        <label class="ra-action-item ${itemDoneClass}" onclick="event.stopPropagation();">
          <input type="checkbox" class="ra-action-checkbox" ${checkedAttr} onchange="raToggleActionTick('${rec.id}', ${actIdx})" />
          <span class="ra-action-checkmark">✓</span>
          <span class="ra-action-text">${act}</span>
        </label>
      `;
    }).join("");

    return `
      <div class="ra-card ${severityClass}" style="animation-delay: ${delay}s;" data-id="${rec.id}">
        <!-- Header: Condition title, Village, and Severity Badge -->
        <div class="ra-card-header">
          <div>
            <h3 class="ra-card-title">${rec.condition}</h3>
            <span class="ra-card-village">📍 ${rec.village || "Community"}</span>
          </div>
          <div class="ra-badge ${badgeClass}">
            ${dotHtml}
            <span>${badgeText}</span>
          </div>
        </div>

        <!-- Trigger Detail -->
        <p class="ra-card-detail">ℹ️ ${rec.detail || ""}</p>

        <!-- Progress Bar & Count -->
        <div class="ra-progress-wrapper">
          <div class="ra-progress-meta">
            <span class="ra-progress-label">Protocol Progress</span>
            <span class="ra-progress-fraction">${countDone}/${total} done (${progressPct}%)</span>
          </div>
          <div class="ra-progress-track">
            <div class="ra-progress-bar ${isAllDone ? 'ra-progress-complete' : ''}" style="width: ${progressPct}%;"></div>
          </div>
        </div>

        <!-- Actions Checklist -->
        <div class="ra-checklist">
          ${itemsHtml}
        </div>

        <!-- All Done State Banner -->
        ${isAllDone ? `
          <div class="ra-all-done-banner">
            <span>🎉 All protocol actions completed ✓</span>
          </div>
        ` : ''}
      </div>
    `;
  }).join("");
}

/**
 * Render compact "Top 3 Actions" card on Overview tab
 */
function raRenderOverviewTopActions(recs) {
  const container = document.getElementById("overview-top-actions-list");
  if (!container) return;

  if (!recs || recs.length === 0) {
    container.innerHTML = `
      <div style="padding: 16px; text-align: center; color: var(--text-secondary); font-size: 0.85rem;">
        ✅ No urgent protocol actions required right now. All clear!
      </div>
    `;
    return;
  }

  const ticksMap = raGetStoredTicks();
  const top3 = recs.slice(0, 3);

  container.innerHTML = top3.map(rec => {
    const actions = rec.actions || [];
    const firstAction = actions[0] || "Screen affected area";
    const isDone = (ticksMap[rec.id] || []).includes(0);
    const severity = (rec.severity || "medium").toLowerCase();
    const severityBadge = severity === "high" 
      ? `<span class="ra-mini-badge badge-high">High</span>` 
      : `<span class="ra-mini-badge badge-med">Med</span>`;

    return `
      <div class="overview-action-row" onclick="window.location.hash='actions'; switchTab('actions');">
        <div class="overview-action-left">
          <input type="checkbox" class="ra-mini-checkbox" ${isDone ? "checked" : ""} onclick="event.stopPropagation(); raToggleActionTick('${rec.id}', 0);" />
          <div>
            <div class="overview-action-cond">
              ${severityBadge}
              <strong>${rec.condition}</strong> &bull; <span style="color: var(--text-secondary);">${rec.village}</span>
            </div>
            <div class="overview-action-sub ${isDone ? 'ra-text-strike' : ''}">${firstAction}</div>
          </div>
        </div>
        <span class="card-arrow">&rarr;</span>
      </div>
    `;
  }).join("");
}

// Global hook for tab navigation
window.initRecommendedActionsView = function() {
  raFetchActions();
};

// Initialise on DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  const retryBtn = document.getElementById("ra-btn-retry");
  if (retryBtn) retryBtn.addEventListener("click", raFetchActions);

  window.addEventListener("languageChanged", () => {
    if (raAllRecommendations && raAllRecommendations.length > 0) {
      raRenderCards(raAllRecommendations);
      raRenderOverviewTopActions(raAllRecommendations);
    }
  });

  raFetchActions();
});
