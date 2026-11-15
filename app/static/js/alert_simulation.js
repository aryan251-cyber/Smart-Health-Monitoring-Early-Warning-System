/**
 * VitalWatch — Feature #16: SMS-Style Alert Simulation
 * 
 * Simulates multi-channel emergency alert delivery when village risk is High:
 *   1. Dashboard Alert
 *   2. ASHA Notification
 *   3. SMS Simulation (phone-style preview bubble)
 * 
 * Core helpers:
 *   - createAlert(village)
 *   - simulateDelivery(alert)
 *   - getAlerts()
 *   - saveAlert(alert)
 *   - renderAlerts()
 */

const SMS_ALERTS_KEY = "vitalwatch_sms_alerts";
const sessionAlertedVillages = new Set();
let isDeliveringAlert = false;

/**
 * 1. Read last 5 alerts from localStorage
 * Always returns an Array.
 */
function getAlerts() {
  try {
    const raw = localStorage.getItem(SMS_ALERTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch (err) {
    console.warn("[AlertSimulation] Error reading alerts:", err);
    return [];
  }
}

/**
 * 2. Save alert into localStorage (keeps last 5 entries)
 */
function saveAlert(alert) {
  if (!alert) return;
  const list = getAlerts();
  list.unshift(alert);
  const trimmed = list.slice(0, 5);
  try {
    localStorage.setItem(SMS_ALERTS_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.error("[AlertSimulation] Failed to save alert:", err);
  }
  renderAlerts();
}

/**
 * 3. Create an alert object and trigger delivery
 */
function createAlert(villageName, isTest = false) {
  const village = (villageName || "Rampur").trim();
  const vKey = village.toLowerCase();

  // Avoid duplicate alerts for the same village within one session (unless manual test)
  if (!isTest && sessionAlertedVillages.has(vKey)) {
    console.log(`[AlertSimulation] Alert already triggered for village '${village}' in this session. Skipping duplicate.`);
    return;
  }
  sessionAlertedVillages.add(vKey);

  const now = new Date();
  const timeFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateFormatted = now.toLocaleDateString([], { month: 'short', day: 'numeric' });

  const alertObj = {
    id: "alert-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    village,
    message: `High waterborne disease risk detected in ${village}. Please inspect water sources and report new cases.`,
    timestamp: now.toISOString(),
    timeFormatted,
    dateFormatted,
    status: "DELIVERED",
    isTest
  };

  simulateDelivery(alertObj);
}

/**
 * 4. Animate multi-channel alert delivery (0.6s intervals)
 */
function simulateDelivery(alert) {
  if (isDeliveringAlert) return;
  isDeliveringAlert = true;

  // Active banner update
  const activeBanner = document.getElementById("sms-active-banner");
  const activeVillage = document.getElementById("sms-active-village");
  const activeTrigger = document.getElementById("sms-active-trigger");
  if (activeVillage) activeVillage.textContent = alert.village;
  if (activeTrigger) activeTrigger.textContent = alert.isTest ? "Manual test trigger" : "Threshold exceeded (≥5 affected, ≥2 symptoms)";
  if (activeBanner) activeBanner.style.display = "flex";

  // SMS Preview bubble elements
  const bubbleTo = document.getElementById("sms-bubble-to");
  const bubbleText = document.getElementById("sms-bubble-text");
  const bubbleStatus = document.getElementById("sms-bubble-status-text");
  const bubbleTime = document.getElementById("sms-bubble-timestamp");
  const previewTime = document.getElementById("sms-preview-time");

  if (bubbleTo) bubbleTo.textContent = `To: ASHA Worker - ${alert.village}`;
  if (bubbleText) bubbleText.textContent = `"${alert.message}"`;
  if (bubbleStatus) bubbleStatus.textContent = "Status: TRANSMITTING...";
  if (bubbleTime) bubbleTime.textContent = alert.timeFormatted;
  if (previewTime) previewTime.textContent = `Last triggered: ${alert.timeFormatted}`;

  // Channel badge elements
  const statusDash = document.getElementById("sms-status-dashboard");
  const statusAsha = document.getElementById("sms-status-asha");
  const statusSms  = document.getElementById("sms-status-sms");

  const metaDash = document.getElementById("sms-meta-dashboard");
  const metaAsha = document.getElementById("sms-meta-asha");
  const metaSms  = document.getElementById("sms-meta-sms");

  // Step 0: Channel 1 starts sending
  setChannelBadge(statusDash, "sending", `<span class="sms-mini-spinner"></span> Sending...`);
  setChannelBadge(statusAsha, "queued", `Queued`);
  setChannelBadge(statusSms,  "queued", `Queued`);
  if (metaDash) metaDash.textContent = "Broadcasting to surveillance dashboard...";
  if (metaAsha) metaAsha.textContent = "Awaiting dispatch queue...";
  if (metaSms)  metaSms.textContent  = "Awaiting cellular gateway...";

  // Step 1 (0.6s): Channel 1 Sent, Channel 2 Sending
  setTimeout(() => {
    setChannelBadge(statusDash, "sent", `<span class="sms-check-anim">✓</span> Sent`);
    setChannelBadge(statusAsha, "sending", `<span class="sms-mini-spinner"></span> Sending...`);
    if (metaDash) metaDash.textContent = `Dispatched • ${alert.timeFormatted}`;
    if (metaAsha) metaAsha.textContent = `Pushing to ASHA mobile app...`;
  }, 600);

  // Step 2 (1.2s): Channel 2 Sent, Channel 3 Sending
  setTimeout(() => {
    setChannelBadge(statusAsha, "sent", `<span class="sms-check-anim">✓</span> Sent`);
    setChannelBadge(statusSms,  "sending", `<span class="sms-mini-spinner"></span> Sending...`);
    if (metaAsha) metaAsha.textContent = `Delivered to device • ${alert.timeFormatted}`;
    if (metaSms)  metaSms.textContent  = `Routing via cellular SMS gateway...`;
  }, 1200);

  // Step 3 (1.8s): Channel 3 Sent, Complete!
  setTimeout(() => {
    setChannelBadge(statusSms, "sent", `<span class="sms-check-anim">✓</span> Sent`);
    if (metaSms) metaSms.textContent = `Delivered to handset • ${alert.timeFormatted}`;
    if (bubbleStatus) bubbleStatus.innerHTML = `Status: <strong style="color: #34D399;">SENT</strong>`;

    // Show toast
    showSmsToast("Alert sent to ASHA Worker");

    // Save alert and update history
    saveAlert(alert);
    isDeliveringAlert = false;
  }, 1800);
}

function setChannelBadge(el, type, html) {
  if (!el) return;
  el.className = `sms-channel-badge badge-${type}`;
  el.innerHTML = html;
}

/**
 * 5. Render the last 5 alerts in the history list
 */
function renderAlerts() {
  const container = document.getElementById("sms-history-list");
  const countEl = document.getElementById("sms-history-count");
  if (!container) return;

  const alerts = getAlerts();
  if (countEl) countEl.textContent = `(${alerts.length})`;

  if (alerts.length === 0) {
    container.innerHTML = `
      <div class="sms-history-empty">
        <span style="font-size: 1.5rem; opacity: 0.5;">📭</span>
        <p>No alert history yet. Trigger an alert above or submit a high-risk report.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = alerts.map((item, idx) => `
    <div class="sms-history-item" style="animation-delay: ${idx * 0.05}s;">
      <div class="sms-item-left">
        <div class="sms-item-village">
          <span class="sms-pulse-dot-red"></span>
          <strong>${escapeSmsHtml(item.village)}</strong>
          ${item.isTest ? '<span class="sms-test-tag">Test</span>' : '<span class="sms-risk-tag">High Risk</span>'}
        </div>
        <p class="sms-item-msg">"${escapeSmsHtml(item.message)}"</p>
      </div>
      <div class="sms-item-right">
        <span class="sms-history-status-badge">
          <span class="sms-check-anim">✓</span> Delivered (3 Channels)
        </span>
        <span class="sms-history-time">📅 ${item.dateFormatted || ''} • ${item.timeFormatted || ''}</span>
      </div>
    </div>
  `).join("");
}

/**
 * Toast Notification for Feature #16
 */
function showSmsToast(msg) {
  const existing = document.getElementById("sms-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "sms-toast";
  toast.className = "sms-toast";
  toast.setAttribute("role", "alert");
  toast.innerHTML = `
    <div class="sms-toast-content">
      <span class="sms-toast-check">✓</span>
      <span>${escapeSmsHtml(msg)}</span>
    </div>
  `;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add("sms-toast-visible");
    });
  });

  setTimeout(() => {
    toast.classList.remove("sms-toast-visible");
    setTimeout(() => toast.remove(), 400);
  }, 3200);
}

function escapeSmsHtml(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

/**
 * Trigger check called from community_reports.js
 * Rule: High risk if 5 or more people affected with 2 or more symptoms
 */
function triggerAlertIfHighRisk(village, peopleAffected, symptoms) {
  const people = parseInt(peopleAffected, 10) || 0;
  const sCount = Array.isArray(symptoms) ? symptoms.length : 0;

  if (people >= 5 && sCount >= 2) {
    createAlert(village, false);
  }
}

/**
 * Initialize event listeners
 */
function initAlertSimulation() {
  const testBtn = document.getElementById("sms-btn-test-alert");
  if (testBtn) {
    testBtn.addEventListener("click", () => {
      // Pick village from input if user typed one, else default to Rampur
      const villageInput = document.getElementById("cr-village");
      const vName = (villageInput && villageInput.value.trim()) ? villageInput.value.trim() : "Rampur";
      createAlert(vName, true);
    });
  }

  const clearBtn = document.getElementById("sms-btn-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      localStorage.removeItem(SMS_ALERTS_KEY);
      renderAlerts();
      showSmsToast("Alert history cleared");
    });
  }

  // Initial render of existing alerts from localStorage
  renderAlerts();
}

// Auto-run when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAlertSimulation);
} else {
  initAlertSimulation();
}

