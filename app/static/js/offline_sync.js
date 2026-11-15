/**
 * VitalWatch — Feature #15: Simple Offline / Low Connectivity Mode
 * 
 * Provides:
 *   1. Offline detection (navigator.onLine + online/offline events)
 *   2. Status pill in header with pulsing dot (Online=green, Offline=amber)
 *   3. Slide-down glassmorphic offline warning banner
 *   4. Pending Sync card & live badge listing saved reports
 *   5. Auto-upload when internet returns (/api/reports)
 *   6. Core helpers: getPending(), savePending(report), syncPending(), updateStatusUI()
 */

const PENDING_KEY = "pendingReports";
let isSyncing = false;

/**
 * 1. Read pending reports array from localStorage
 * ALWAYS returns an Array.
 */
function getPending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("[OfflineSync] Error reading pendingReports:", err);
    return [];
  }
}

/**
 * 2. Save a report into the pendingReports array in localStorage
 */
function savePending(report) {
  if (!report) return;
  const list = getPending();
  
  // Ensure unique id and timestamp
  const item = {
    ...report,
    id: report.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
    timestamp: report.timestamp || new Date().toISOString(),
    status: "pending"
  };

  list.push(item);
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("[OfflineSync] Failed to write to localStorage:", err);
  }

  updateStatusUI();
}

/**
 * 3. Auto-upload pending reports when connection is available
 */
async function syncPending() {
  if (isSyncing || !navigator.onLine) return;
  
  const pending = getPending();
  if (pending.length === 0) {
    updateStatusUI();
    return;
  }

  isSyncing = true;
  updateStatusUI();

  let syncedCount = 0;
  const remaining = [];

  for (const report of pending) {
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report)
      });

      if (res.ok) {
        syncedCount++;
        // Remove this item from localStorage immediately so partial sync is safe
        const currentList = getPending();
        const updatedList = currentList.filter(r => r.id !== report.id);
        localStorage.setItem(PENDING_KEY, JSON.stringify(updatedList));
      } else {
        remaining.push(report);
      }
    } catch (err) {
      // Network failure or offline again
      remaining.push(report);
    }
  }

  // Ensure remaining list is stored
  if (remaining.length > 0) {
    localStorage.setItem(PENDING_KEY, JSON.stringify(remaining));
  }

  isSyncing = false;
  updateStatusUI();

  if (syncedCount > 0) {
    showOfflineToast(`Back online. ${syncedCount} report${syncedCount > 1 ? "s" : ""} synced ✓`, "success");
  }
}

/**
 * 4. Update UI for status pill, offline banner, and Pending Sync card
 */
function updateStatusUI() {
  const isOnline = navigator.onLine;
  const pending = getPending();
  const count = pending.length;

  // ── A. Header Status Pill ──
  const pill = document.getElementById("net-status-pill");
  const textEl = document.getElementById("net-status-text");
  const spinner = document.getElementById("net-sync-spinner");

  if (pill && textEl) {
    pill.classList.remove("online", "offline", "syncing");
    
    if (isSyncing) {
      pill.classList.add("syncing");
      textEl.textContent = "Syncing...";
      if (spinner) spinner.style.display = "inline-block";
    } else if (isOnline) {
      pill.classList.add("online");
      textEl.textContent = "Online";
      if (spinner) spinner.style.display = "none";
    } else {
      pill.classList.add("offline");
      textEl.textContent = "Offline";
      if (spinner) spinner.style.display = "none";
    }
  }

  // ── B. Slide-down Offline Banner ──
  const banner = document.getElementById("net-offline-banner");
  const bannerBadge = document.getElementById("net-banner-pending-badge");
  if (banner) {
    if (!isOnline) {
      banner.style.display = "block";
      if (bannerBadge) {
        bannerBadge.textContent = `${count} pending`;
        bannerBadge.style.display = count > 0 ? "inline-block" : "none";
      }
    } else {
      banner.style.display = "none";
    }
  }

  // ── C. Pending Sync Card in Community Reports tab ──
  const pendingCard = document.getElementById("cr-pending-sync-card");
  const countEl = document.getElementById("cr-pending-count");
  const listEl = document.getElementById("cr-pending-list");

  if (pendingCard) {
    if (count > 0) {
      pendingCard.style.display = "block";
      if (countEl) countEl.textContent = count;
      if (listEl) {
        listEl.innerHTML = pending.map(item => {
          const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleDateString("en-US", {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
          }) : "Just now";

          const village = item.village || "Unknown Village";
          const people = item.peopleAffected || 1;
          const symptoms = Array.isArray(item.symptoms) ? item.symptoms.join(", ") : (item.symptoms || "");

          return `
            <div class="cr-pending-item">
              <div class="cr-pending-item-main">
                <div class="cr-pending-item-top">
                  <span class="cr-pending-village">📍 ${escapeOfflineHtml(village)}</span>
                  <span class="cr-pending-tag">⏳ Pending</span>
                </div>
                <div class="cr-pending-item-meta">
                  <span>📅 ${dateStr}</span>
                  <span>👥 ${people} affected</span>
                  ${symptoms ? `<span>🩺 ${escapeOfflineHtml(symptoms)}</span>` : ''}
                </div>
              </div>
            </div>
          `;
        }).join("");
      }
    } else {
      pendingCard.style.display = "none";
    }
  }
}

/**
 * Helper: Toast notification with glassmorphism and animations
 */
function showOfflineToast(msg, type = "success") {
  const existing = document.getElementById("net-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "net-toast";
  toast.className = `net-toast net-toast-${type}`;
  toast.setAttribute("role", "alert");
  toast.setAttribute("aria-live", "polite");

  const icon = type === "success" ? `<span class="toast-check-anim">✓</span>` : `<span class="toast-amber-dot">⚠️</span>`;
  toast.innerHTML = `<div class="toast-inner">${icon}<span>${escapeOfflineHtml(msg)}</span></div>`;

  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add("net-toast-visible");
    });
  });

  setTimeout(() => {
    toast.classList.remove("net-toast-visible");
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

function escapeOfflineHtml(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

/**
 * Initialise listeners on load
 */
function initOfflineSync() {
  // Online / Offline window events
  window.addEventListener("online", () => {
    updateStatusUI();
    syncPending();
  });

  window.addEventListener("offline", () => {
    updateStatusUI();
  });

  // Manual sync button if present
  const manualBtn = document.getElementById("cr-btn-sync-now");
  if (manualBtn) {
    manualBtn.addEventListener("click", () => {
      if (!navigator.onLine) {
        showOfflineToast("Device is offline. Will sync when reconnected.", "amber");
      } else {
        syncPending();
      }
    });
  }

  // Update UI immediately
  updateStatusUI();

  // If online at launch, trigger sync check for any pending reports from earlier
  if (navigator.onLine) {
    syncPending();
  }
}

// Auto-run when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initOfflineSync);
} else {
  initOfflineSync();
}

