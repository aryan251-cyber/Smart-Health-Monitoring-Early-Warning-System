/**
 * VitalWatch - Application Core Controller
 * Manages UI state, views, tab navigation, forms, AI evaluation feedback, and charts.
 */

let trendChartInstance = null;
let currentSelectedRole = "patient";

// Initialize on DOM loaded
document.addEventListener("DOMContentLoaded", () => {
  initAuthView();
  initNavigation();
  initOverviewView();
  initVitalsForm();
  initAlertsView();
  initHistoryView();

  // Listen for unauthorized 401 events
  window.addEventListener("vitalwatch:unauthorized", () => {
    VitalApi.clearSession();
    window.location.href = "/";
  });

  // Strict route & auth protection
  const isAuth = VitalApi.isAuthenticated();
  const currentPath = window.location.pathname;

  if (!isAuth) {
    // Protected pages: redirect to login page "/" if not authenticated
    if (currentPath !== "/") {
      window.location.replace("/");
      return;
    }
    // First load: Show login page only. Dashboard and features are hidden.
    showAuthView();
  } else {
    // If authenticated:
    if (currentPath === "/") {
      const user = VitalApi.getUser();
      if (user && user.role === "ASHA_WORKER") {
        window.location.replace("/asha/dashboard");
      } else {
        window.location.replace("/dashboard");
      }
      return;
    }
    showAppView();
  }
});

// View Switching
function showAuthView() {
  const authView = document.getElementById("auth-view");
  const appView = document.getElementById("app-view");
  if (authView) authView.style.display = "flex";
  if (appView) appView.style.display = "none";
}

function showAppView(requestedTab) {
  const authView = document.getElementById("auth-view");
  const appView = document.getElementById("app-view");
  if (authView) authView.style.display = "none";
  if (appView) appView.style.display = "flex";
  
  const user = VitalApi.getUser();
  if (user) {
    updateUserBadge(user);
  } else {
    VitalApi.getMe().then(updateUserBadge).catch(() => {
      const nameEl = document.getElementById("current-user-name");
      const roleEl = document.getElementById("current-user-role");
      if (nameEl && (!nameEl.textContent || nameEl.textContent === "Loading...")) nameEl.textContent = "Healthcare User";
      if (roleEl && (!roleEl.textContent || roleEl.textContent === "Patient")) roleEl.textContent = "DOCTOR";

      const topbarName = document.getElementById("topbar-user-name");
      const topbarRole = document.getElementById("topbar-user-role");
      if (topbarName && (!topbarName.textContent || topbarName.textContent === "Loading...")) topbarName.textContent = "Healthcare User";
      if (topbarRole && (!topbarRole.textContent || topbarRole.textContent === "PATIENT")) topbarRole.textContent = "DOCTOR";
    });
  }

  // Load requested tab, URL hash, or default overview
  const hash = window.location.hash.replace("#", "");
  const path = window.location.pathname.replace(/^\//, "");
  const ALL_VIEWS = ["overview", "dashboard", "vitals", "history", "alerts", "water", "water-sources", "actions", "community", "community-health", "risk-score", "risk-map", "trends", "awareness"];
  const targetTab = requestedTab ||
    (hash && ALL_VIEWS.includes(hash) ? hash :
    (ALL_VIEWS.includes(path) ? path : "overview"));
  switchTab(targetTab);
}

function updateUserBadge(user) {
  const fullName = user.full_name || user.name || "Healthcare User";
  const role = user.role || "patient";
  const initial = fullName.charAt(0).toUpperCase();

  // Sidebar profile card
  const nameEl = document.getElementById("current-user-name");
  const roleEl = document.getElementById("current-user-role");
  const avatarEl = document.getElementById("current-user-avatar");

  if (nameEl) nameEl.textContent = fullName;
  if (roleEl) roleEl.textContent = role;
  if (avatarEl) avatarEl.textContent = initial;

  // Slim topbar profile elements
  const topbarName = document.getElementById("topbar-user-name");
  const topbarRole = document.getElementById("topbar-user-role");
  const topbarAvatar = document.getElementById("topbar-avatar");

  if (topbarName) topbarName.textContent = fullName;
  if (topbarRole) topbarRole.textContent = role.toUpperCase();
  if (topbarAvatar) topbarAvatar.textContent = initial;
}

// ----------------------------------------------------
// Authentication Logic
// ----------------------------------------------------
function initAuthView() {
  const tabLogin = document.getElementById("tab-login-btn");
  const tabRegister = document.getElementById("tab-register-btn");
  const formLogin = document.getElementById("form-login");
  const formRegister = document.getElementById("form-register");
  const authError = document.getElementById("auth-error-msg");

  tabLogin.addEventListener("click", () => {
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    formLogin.style.display = "block";
    formRegister.style.display = "none";
    authError.style.display = "none";
  });

  tabRegister.addEventListener("click", () => {
    tabRegister.classList.add("active");
    tabLogin.classList.remove("active");
    formLogin.style.display = "none";
    formRegister.style.display = "block";
    authError.style.display = "none";
  });

  // Role selector for registration
  const roleBtns = document.querySelectorAll(".role-btn");
  roleBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      roleBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentSelectedRole = btn.dataset.role;
    });
  });

  // Login submit
  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.style.display = "none";
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value.trim();
    const btn = formLogin.querySelector("button[type='submit']");

    if (!email || !password) {
      authError.textContent = "Please enter both email and password.";
      authError.style.display = "block";
      return;
    }

    try {
      btn.disabled = true;
      btn.textContent = "Signing In...";
      const res = await VitalApi.login(email, password);
      // If the server gives a redirect URL (for ASHA_WORKER etc.), navigate there
      const targetUrl = res.redirect_to || "/dashboard";
      window.location.href = targetUrl;
    } catch (err) {
      authError.textContent = err.message || "Invalid email or password";
      authError.style.display = "block";
    } finally {
      btn.disabled = false;
      btn.textContent = "Sign In";
    }
  });

  // Register submit
  formRegister.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.style.display = "none";
    const fullName = document.getElementById("reg-name").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value.trim();
    const roleSelect = document.getElementById("reg-role-select");
    const roleToSubmit = roleSelect ? roleSelect.value : currentSelectedRole;
    const btn = formRegister.querySelector("button[type='submit']");

    if (!fullName || !email || !password) {
      authError.textContent = "Please fill in all registration fields.";
      authError.style.display = "block";
      return;
    }

    try {
      btn.disabled = true;
      btn.textContent = "Creating Account...";
      const res = await VitalApi.register(fullName, email, password, roleToSubmit);
      const targetUrl = (res && res.redirect_to) ? res.redirect_to : "/dashboard";
      window.location.href = targetUrl;
    } catch (err) {
      authError.textContent = err.message || "Failed to create account";
      authError.style.display = "block";
    } finally {
      btn.disabled = false;
      btn.textContent = "Create Account";
    }
  });

  // Demo fill buttons
  const demoPatientBtn = document.getElementById("demo-patient-btn");
  const demoDoctorBtn = document.getElementById("demo-doctor-btn");
  const demoAshaBtn = document.getElementById("demo-asha-btn");

  if (demoPatientBtn) {
    demoPatientBtn.addEventListener("click", () => {
      document.getElementById("login-email").value = "patient@vitalwatch.org";
      document.getElementById("login-password").value = "password123";
    });
  }

  if (demoDoctorBtn) {
    demoDoctorBtn.addEventListener("click", () => {
      document.getElementById("login-email").value = "doctor@vitalwatch.org";
      document.getElementById("login-password").value = "password123";
    });
  }

  if (demoAshaBtn) {
    demoAshaBtn.addEventListener("click", () => {
      document.getElementById("login-email").value = "asha@test.com";
      document.getElementById("login-password").value = "asha123";
    });
  }

  // Logout buttons
  const logoutBtns = document.querySelectorAll(".btn-logout, #mobile-logout-btn");
  logoutBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      VitalApi.clearSession();
      window.location.href = "/";
    });
  });
}

// ----------------------------------------------------
// Navigation & Tabs (Desktop & Mobile Unified Navigation)
// ----------------------------------------------------
function openSidebar() {
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  if (sidebar) sidebar.classList.add("open");
  if (backdrop) backdrop.classList.add("active");
  document.body.classList.add("drawer-open");
}

function closeSidebar() {
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  if (sidebar) sidebar.classList.remove("open");
  if (backdrop) backdrop.classList.remove("active");
  document.body.classList.remove("drawer-open");
}

function initNavigation() {
  const navLinks = document.querySelectorAll(".nav-link[data-tab]");
  navLinks.forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const tab = link.dataset.tab;
      window.location.hash = tab;
      switchTab(tab);
      closeSidebar();
    });
  });

  // Mobile Bottom Navigation Bar buttons
  const bottomNavItems = document.querySelectorAll(".bottom-nav-item[data-tab]");
  bottomNavItems.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const tab = btn.dataset.tab;
      window.location.hash = tab;
      switchTab(tab);
      closeSidebar();
    });
  });

  // Mobile Bottom Navigation "More" button
  const bottomMoreBtn = document.getElementById("bottom-nav-more");
  if (bottomMoreBtn) {
    bottomMoreBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const sidebar = document.querySelector(".sidebar");
      if (sidebar && sidebar.classList.contains("open")) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  }

  // Mobile Drawer Backdrop click to close
  const backdrop = document.getElementById("sidebar-backdrop");
  if (backdrop) {
    backdrop.addEventListener("click", closeSidebar);
  }

  // Mobile Drawer X close button
  const sidebarCloseBtn = document.getElementById("sidebar-close-btn");
  if (sidebarCloseBtn) {
    sidebarCloseBtn.addEventListener("click", closeSidebar);
  }

  // Close drawer on Escape key press
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeSidebar();
    }
  });

  // Hash change listener for browser navigation
  window.addEventListener("hashchange", () => {
    if (!VitalApi.isAuthenticated()) {
      window.location.replace("/");
      return;
    }
    const hash = window.location.hash.replace("#", "");
    const views = ["overview", "dashboard", "vitals", "history", "alerts", "water", "water-sources", "actions", "community", "community-health", "risk-score", "risk-map", "trends", "awareness", "cases", "reports"];
    if (hash && views.includes(hash)) {
      switchTab(hash);
    }
  });

  // Mobile menu toggle button in slim topbar
  const mobileToggle = document.getElementById("mobile-menu-toggle");
  if (mobileToggle) {
    mobileToggle.addEventListener("click", (e) => {
      e.preventDefault();
      const sidebar = document.querySelector(".sidebar");
      if (sidebar && sidebar.classList.contains("open")) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  }

  // Auto-scroll active nav item into view on initial load
  setTimeout(() => {
    const activeLink = document.querySelector(".nav-link.active");
    if (activeLink) {
      activeLink.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, 100);
}

function switchTab(tabName) {
  if (!VitalApi.isAuthenticated()) {
    showAuthView();
    return;
  }
  // Update sidebar active states and scroll into view
  document.querySelectorAll(".nav-link[data-tab]").forEach(link => {
    if (link.dataset.tab === tabName) {
      link.classList.add("active");
      link.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } else {
      link.classList.remove("active");
    }
  });

  // Update bottom navigation bar active states
  document.querySelectorAll(".bottom-nav-item[data-tab]").forEach(item => {
    if (item.dataset.tab === tabName) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // Close mobile drawer if open
  closeSidebar();

  // Hide all views, display chosen view with smooth animation
  const views = ["overview", "dashboard", "vitals", "history", "alerts", "water", "water-sources", "actions", "community", "community-health", "risk-score", "risk-map", "trends", "awareness", "cases", "reports"];
  views.forEach(v => {
    const el = document.getElementById(`tab-view-${v}`);
    if (el) {
      if (v === tabName) {
        el.style.display = "block";
        el.classList.remove("tab-anim-fade");
        void el.offsetWidth; // force browser reflow
        el.classList.add("tab-anim-fade");
      } else {
        el.style.display = "none";
      }
    }
  });

  // Update slim topbar page label
  const pageLabelKeys = {
    overview:   "page_overview",
    dashboard:  "page_dashboard",
    vitals:     "page_vitals",
    history:    "page_history",
    alerts:     "page_alerts",
    water:      "page_water_quality",
    "water-sources": "page_water_sources",
    actions:    "page_recommended_actions",
    community:  "page_community_reports",
    "community-health": "page_community_health",
    "risk-score": "page_risk_score",
    "risk-map": "page_risk_map",
    trends: "page_health_trends",
    awareness: "page_awareness",
    cases: "page_cases",
    reports: "page_reports"
  };
  const pageLabels = {
    overview:   "Surveillance Overview",
    dashboard:  "Health Status Dashboard",
    vitals:     "Log Vital Parameters",
    history:    "Clinical Vitals History",
    alerts:     "Active Clinical Alerts",
    water:      "Water Quality Testing",
    "water-sources": "Water Sources Management",
    actions:    "Recommended Protocol Actions",
    community:  "Community Reports",
    "community-health": "Community Health Surveillance",
    "risk-score": "Disease Risk Score Calculator",
    "risk-map": "Community Risk Map",
    trends: "Community Health Trends",
    awareness: "Health Awareness & Prevention",
    cases: "Case Follow-up",
    reports: "Monthly Community Health Report"
  };
  window.currentActiveTab = tabName;
  const labelEl = document.getElementById("current-page-label");
  const tFn = (typeof window.t === "function") ? window.t : null;
  const translated = (tFn && pageLabelKeys[tabName]) ? tFn(pageLabelKeys[tabName]) : null;
  if (labelEl) {
    labelEl.textContent = translated || pageLabels[tabName] || "Surveillance Overview";
    if (pageLabelKeys[tabName]) labelEl.setAttribute("data-i18n", pageLabelKeys[tabName]);
  }

  // Fetch view specific fresh data
  if (tabName === "overview") {
    loadOverviewData();
  } else if (tabName === "dashboard") {
    loadDashboardData();
    if (typeof PCL !== "undefined") PCL.init();
  } else if (tabName === "vitals") {
    if (typeof PCL !== "undefined") PCL.init();
  } else if (tabName === "history") {
    loadHistoryData();
  } else if (tabName === "alerts") {
    loadAlertsData();
  } else if (tabName === "water") {
    wqRenderRecentTests();
  } else if (tabName === "water-sources") {
    if (typeof initWaterSourcesView === "function") initWaterSourcesView();
  } else if (tabName === "actions") {
    if (typeof initRecommendedActionsView === "function") initRecommendedActionsView();
  } else if (tabName === "community") {
    if (typeof crInit === "function") crInit();
  } else if (tabName === "community-health") {
    if (typeof initVillageRiskDashboard === "function") initVillageRiskDashboard();
  } else if (tabName === "risk-score") {
    if (typeof DiseaseRiskController !== "undefined") DiseaseRiskController.init();
  } else if (tabName === "risk-map") {
    if (typeof initCommunityRiskMap === "function") initCommunityRiskMap();
  } else if (tabName === "trends") {
    if (typeof initHealthTrends === "function") initHealthTrends();
  } else if (tabName === "awareness") {
    if (typeof initHealthAwarenessView === "function") initHealthAwarenessView();
  } else if (tabName === "cases") {
    if (typeof initCaseFollowUpView === "function") initCaseFollowUpView();
  } else if (tabName === "reports") {
    if (typeof initAdminReportsView === "function") initAdminReportsView();
  }
}

// ----------------------------------------------------
// Overview Tab Controller (Village Surveillance & Activity)
// ----------------------------------------------------
const WQ_ACK_KEY = "vitalwatch_ack_water_alerts";

function getAcknowledgedWaterAlerts() {
  try {
    return JSON.parse(localStorage.getItem(WQ_ACK_KEY)) || [];
  } catch {
    return [];
  }
}

function handleAcknowledgeWaterAlert(datetime) {
  const acks = getAcknowledgedWaterAlerts();
  if (!acks.includes(datetime)) {
    acks.push(datetime);
    localStorage.setItem(WQ_ACK_KEY, JSON.stringify(acks));
  }
  loadAlertsData();
  loadOverviewData();
}

function initOverviewView() {
  // Stat card click listeners
  const cardReports = document.getElementById("card-stat-reports");
  if (cardReports) {
    cardReports.addEventListener("click", () => switchTab("history"));
    cardReports.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") switchTab("history");
    });
  }

  const cardAlerts = document.getElementById("card-stat-alerts");
  if (cardAlerts) {
    cardAlerts.addEventListener("click", () => switchTab("alerts"));
    cardAlerts.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") switchTab("alerts");
    });
  }

  const cardHighRisk = document.getElementById("card-stat-highrisk");
  if (cardHighRisk) {
    cardHighRisk.addEventListener("click", () => {
      document.getElementById("overview-villages-card")?.scrollIntoView({ behavior: "smooth" });
    });
    cardHighRisk.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        document.getElementById("overview-villages-card")?.scrollIntoView({ behavior: "smooth" });
      }
    });
  }

  // Quick action buttons
  const btnLogVitals = document.getElementById("btn-quick-log-vitals");
  if (btnLogVitals) {
    btnLogVitals.addEventListener("click", () => switchTab("vitals"));
  }

  const btnAddWater = document.getElementById("btn-quick-add-water");
  if (btnAddWater) {
    btnAddWater.addEventListener("click", () => switchTab("water"));
  }

  // View all activity link
  const viewAllActivity = document.getElementById("overview-activity-view-all");
  if (viewAllActivity) {
    viewAllActivity.addEventListener("click", (e) => {
      e.preventDefault();
      switchTab("history");
    });
  }

  // Slim topbar logout button
  const topbarLogout = document.getElementById("topbar-logout-btn");
  if (topbarLogout) {
    topbarLogout.addEventListener("click", () => {
      VitalApi.clearSession();
      window.location.href = "/";
    });
  }
}

/**
 * Adjusts village risk level based on its latest water test.
 * Easy to edit:
 * - If latest water test is Contaminated: at least High Risk.
 * - If latest water test is Caution: at least Medium.
 * - Otherwise: retains base risk level.
 */
function calculateEffectiveVillageRisk(baseRisk, waterStatus) {
  const normBase = (baseRisk || "LOW").toUpperCase();
  const normWater = (waterStatus || "").toUpperCase();

  const riskRank = { "LOW": 1, "MEDIUM": 2, "HIGH": 3 };
  let effectiveRank = riskRank[normBase] || 1;

  if (normWater === "CONTAMINATED") {
    effectiveRank = Math.max(effectiveRank, 3); // At least High Risk
  } else if (normWater === "CAUTION") {
    effectiveRank = Math.max(effectiveRank, 2); // At least Medium
  }

  const rankToLevel = { 1: "LOW", 2: "MEDIUM", 3: "HIGH" };
  return rankToLevel[effectiveRank];
}

async function loadOverviewData() {
  const statVillages = document.getElementById("stat-villages");
  const statWorkers = document.getElementById("stat-workers");
  const statReports = document.getElementById("stat-reports");
  const statAlerts = document.getElementById("stat-alerts");
  const statHighRisk = document.getElementById("stat-highrisk");
  const villagesTbody = document.getElementById("overview-villages-tbody");
  const activityList = document.getElementById("overview-activity-list");

  // Show skeletons if values not loaded
  if (statVillages && statVillages.textContent === "--") {
    statVillages.innerHTML = `<span class="skeleton" style="width: 36px; height: 28px;"></span>`;
    statWorkers.innerHTML = `<span class="skeleton" style="width: 36px; height: 28px;"></span>`;
    statReports.innerHTML = `<span class="skeleton" style="width: 36px; height: 28px;"></span>`;
    statAlerts.innerHTML = `<span class="skeleton" style="width: 36px; height: 28px;"></span>`;
    statHighRisk.innerHTML = `<span class="skeleton" style="width: 36px; height: 28px;"></span>`;

    if (villagesTbody) {
      villagesTbody.innerHTML = `
        <tr><td colspan="4" style="text-align:center; padding: 20px;"><span class="skeleton" style="width: 80%; height: 18px;"></span></td></tr>
        <tr><td colspan="4" style="text-align:center; padding: 20px;"><span class="skeleton" style="width: 65%; height: 18px;"></span></td></tr>
      `;
    }
    if (activityList) {
      activityList.innerHTML = `
        <div style="padding: 14px;"><span class="skeleton" style="width: 100%; height: 36px;"></span></div>
        <div style="padding: 14px;"><span class="skeleton" style="width: 100%; height: 36px;"></span></div>
      `;
    }
  }

  try {
    const data = await VitalApi.getOverview();
    const waterTests = wqLoadTests();
    const ackWaterAlerts = getAcknowledgedWaterAlerts();

    // Map latest water test by village name (case-insensitive)
    const latestWaterByVillage = {};
    waterTests.forEach(t => {
      const vKey = (t.village || "").trim().toLowerCase();
      if (!latestWaterByVillage[vKey]) {
        latestWaterByVillage[vKey] = t;
      }
    });

    // Count unacknowledged contaminated water tests
    const unackContaminatedCount = waterTests.filter(t => 
      t.status === "CONTAMINATED" && !ackWaterAlerts.includes(t.datetime)
    ).length;

    const totalActiveAlerts = (data.activeAlerts || 0) + unackContaminatedCount;

    // Calculate effective risk for villages
    const rawVillages = data.topRiskVillages || [];
    let highRiskCount = 0;

    const processedVillages = rawVillages.map(v => {
      const vKey = (v.name || "").trim().toLowerCase();
      const waterTest = latestWaterByVillage[vKey];
      const waterStatus = waterTest ? waterTest.status : null;
      const effectiveRisk = calculateEffectiveVillageRisk(v.risk_level, waterStatus);

      if (effectiveRisk === "HIGH") {
        highRiskCount++;
      }

      return {
        ...v,
        waterStatus,
        effectiveRisk
      };
    });

    // Populate stat cards
    if (statVillages) statVillages.textContent = data.totalVillages ?? 0;
    if (statWorkers) statWorkers.textContent = data.totalAshaWorkers ?? 0;
    if (statReports) statReports.textContent = data.totalReportsToday ?? 0;
    if (statAlerts) statAlerts.textContent = totalActiveAlerts;
    if (statHighRisk) statHighRisk.textContent = highRiskCount || (data.highRiskVillages ?? 0);

    // Update sidebar alerts badge
    updateAlertBadgeCounters(totalActiveAlerts);

    // Render High Priority Villages Table & Mobile Cards
    renderOverviewVillages(processedVillages);

    // Render Recent Activity (merged backend + water tests)
    renderOverviewActivity(data.recentActivity || [], waterTests);

  } catch (err) {
    console.error("Overview load error:", err);
  }
}

function renderOverviewVillages(villages) {
  const tbody = document.getElementById("overview-villages-tbody");
  const cardsMobile = document.getElementById("overview-villages-cards-mobile");

  if (!villages.length) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px; color: var(--text-tertiary);">No village surveillance records found.</td></tr>`;
    if (cardsMobile) cardsMobile.innerHTML = `<div style="text-align:center; padding: 16px; color: var(--text-tertiary);">No village surveillance records.</div>`;
    return;
  }

  const waterBadgeHtml = (status) => {
    if (!status) return `<span class="wq-badge-none">-</span>`;
    const s = status.toUpperCase();
    if (s === "SAFE") return `<span class="wq-badge wq-badge-safe" title="Safe">🟢 Safe</span>`;
    if (s === "CAUTION") return `<span class="wq-badge wq-badge-caution" title="Caution">🟡 Caution</span>`;
    if (s === "CONTAMINATED") return `<span class="wq-badge wq-badge-contaminated" title="Contaminated">🔴 Contaminated</span>`;
    return `<span class="wq-badge-none">-</span>`;
  };

  const riskBadgeHtml = (risk) => {
    const r = (risk || "LOW").toUpperCase();
    if (r === "HIGH") return `<span class="vital-badge badge-critical">High Risk</span>`;
    if (r === "MEDIUM") return `<span class="vital-badge badge-warning">Medium</span>`;
    return `<span class="vital-badge badge-normal">Low Risk</span>`;
  };

  if (tbody) {
    tbody.innerHTML = villages.map(v => `
      <tr>
        <td><strong>${escapeHtml(v.name)}</strong></td>
        <td><span style="color: var(--text-secondary);">${escapeHtml(v.district || 'District')}</span></td>
        <td>${riskBadgeHtml(v.effectiveRisk)}</td>
        <td>${waterBadgeHtml(v.waterStatus)}</td>
      </tr>
    `).join("");
  }

  if (cardsMobile) {
    cardsMobile.innerHTML = villages.map(v => `
      <div class="village-card-mobile">
        <div class="village-card-mobile-row">
          <span class="village-card-mobile-label">Village</span>
          <strong>${escapeHtml(v.name)}</strong>
        </div>
        <div class="village-card-mobile-row">
          <span class="village-card-mobile-label">District</span>
          <span style="color: var(--text-secondary);">${escapeHtml(v.district || 'District')}</span>
        </div>
        <div class="village-card-mobile-row">
          <span class="village-card-mobile-label">Risk Level</span>
          <span>${riskBadgeHtml(v.effectiveRisk)}</span>
        </div>
        <div class="village-card-mobile-row">
          <span class="village-card-mobile-label">Water</span>
          <span>${waterBadgeHtml(v.waterStatus)}</span>
        </div>
      </div>
    `).join("");
  }
}

function renderOverviewActivity(serverActivity, waterTests) {
  const listEl = document.getElementById("overview-activity-list");
  if (!listEl) return;

  // Transform water tests into activity events
  const waterEvents = (waterTests || []).map(t => ({
    type: "water",
    severity: t.status === "CONTAMINATED" ? "CRITICAL" : (t.status === "CAUTION" ? "WARNING" : "NORMAL"),
    message: `Water test at ${t.village} (${t.source || 'Water Source'}): ${t.status}`,
    timestamp: t.datetime,
    dt: new Date(t.datetime)
  }));

  // Map server events
  const serverEvents = (serverActivity || []).map(s => ({
    type: s.type || "alert",
    severity: s.severity || "WARNING",
    message: s.message || "Clinical activity recorded",
    timestamp: s.timestamp,
    dt: s.timestamp ? new Date(s.timestamp) : new Date(0)
  }));

  // Merge and sort newest first
  const merged = [...waterEvents, ...serverEvents].sort((a, b) => b.dt - a.dt).slice(0, 5);

  if (!merged.length) {
    listEl.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-tertiary);">
        <p>No recent surveillance activity.</p>
      </div>
    `;
    return;
  }

  const icons = {
    alert: { cls: "icon-alert", icon: "🔔" },
    report: { cls: "icon-report", icon: "🩺" },
    water: { cls: "icon-water", icon: "💧" }
  };

  listEl.innerHTML = merged.map((item, idx) => {
    const iconMeta = icons[item.type] || icons.alert;
    const isLong = item.message.length > 70;
    const msgId = `act-msg-${idx}`;
    const btnId = `act-btn-${idx}`;

    return `
      <div class="activity-item" data-act-type="${item.type}" role="button" tabindex="0">
        <div class="activity-icon ${iconMeta.cls}">
          ${iconMeta.icon}
        </div>
        <div class="activity-details">
          <div class="activity-msg" id="${msgId}">
            ${escapeHtml(item.message)}
          </div>
          ${isLong ? `
            <button type="button" class="activity-read-more" id="${btnId}" onclick="event.stopPropagation(); toggleReadMore('${msgId}', '${btnId}')">
              Read more
            </button>
          ` : ''}
          <div class="activity-meta">
            ${item.timestamp ? formatTimestamp(item.timestamp) : 'Recently recorded'}
          </div>
        </div>
      </div>
    `;
  }).join("");

  // Connect click navigation
  listEl.querySelectorAll(".activity-item").forEach(item => {
    const handler = () => {
      const type = item.dataset.actType;
      if (type === "water") {
        switchTab("water");
      } else if (type === "alert") {
        switchTab("alerts");
      } else {
        switchTab("history");
      }
    };
    item.addEventListener("click", handler);
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") handler();
    });
  });
}

function toggleReadMore(msgId, btnId) {
  const msgEl = document.getElementById(msgId);
  const btnEl = document.getElementById(btnId);
  if (!msgEl || !btnEl) return;
  const isExpanded = msgEl.classList.toggle("expanded");
  btnEl.textContent = isExpanded ? "Show less" : "Read more";
}

// ----------------------------------------------------
// Dashboard Tab Controller
// ----------------------------------------------------
async function loadDashboardData() {
  try {
    const data = await VitalApi.getDashboard();
    renderDashboard(data);
  } catch (err) {
    console.error("Dashboard error:", err);
  }
}

function renderDashboard(data) {
  const { latest_reading, current_risk, current_risk_score, latest_explanation, trend_readings, unacknowledged_alerts_count, recent_alerts } = data;

  // Feature #13: pass fresh vitals to the Community Link module
  if (typeof PCL !== "undefined") {
    PCL.updateVitals(latest_reading);
    PCL.refresh();
  }

  // 1. Update Alert Badges
  updateAlertBadgeCounters(unacknowledged_alerts_count);

  // 2. Risk Status Banner
  const banner = document.getElementById("dashboard-risk-banner");
  const bannerStatusText = document.getElementById("risk-banner-title");
  const bannerExplText = document.getElementById("risk-banner-desc");
  const bannerScoreNum = document.getElementById("risk-banner-score");
  const pulseIcon = document.getElementById("risk-banner-icon");

  banner.classList.remove("status-normal", "status-warning", "status-critical");
  
  if (current_risk === "CRITICAL") {
    banner.classList.add("status-critical");
    bannerStatusText.textContent = "CRITICAL RISK LEVEL DETECTED";
    pulseIcon.innerHTML = "🚨";
  } else if (current_risk === "WARNING") {
    banner.classList.add("status-warning");
    bannerStatusText.textContent = "ELEVATED RISK WARNING";
    pulseIcon.innerHTML = "⚠️";
  } else {
    banner.classList.add("status-normal");
    bannerStatusText.textContent = "NORMAL VITAL STABILITY";
    pulseIcon.innerHTML = "🫀";
  }

  bannerExplText.textContent = latest_explanation || "Vital signs are stable and within standard parameters.";
  bannerScoreNum.textContent = `${current_risk_score.toFixed(1)}%`;

  // Feature #18 & #19: Environmental Risk (Season & Weather) integration
  if (typeof SeasonalRisk !== "undefined") {
    SeasonalRisk.update(current_risk_score);
  }
  if (typeof WeatherRisk !== "undefined") {
    WeatherRisk.updateCombinedRisk();
  }

  // 3. Vitals Cards Grid
  const cardVals = {
    hr: { val: latest_reading?.heart_rate, unit: "bpm", label: "Heart Rate" },
    spo2: { val: latest_reading?.spo2, unit: "%", label: "Oxygen Saturation" },
    bp: { 
      val: (latest_reading?.systolic_bp && latest_reading?.diastolic_bp) ? `${Math.round(latest_reading.systolic_bp)}/${Math.round(latest_reading.diastolic_bp)}` : "--", 
      unit: "mmHg", 
      label: "Blood Pressure" 
    },
    temp: { val: latest_reading?.temperature ? latest_reading.temperature.toFixed(1) : "--", unit: "°C", label: "Temperature" },
    resp: { val: latest_reading?.respiratory_rate, unit: "/min", label: "Respiratory Rate" },
    gluc: { val: latest_reading?.glucose || "--", unit: "mg/dL", label: "Blood Glucose" }
  };

  for (const [key, item] of Object.entries(cardVals)) {
    const el = document.getElementById(`val-card-${key}`);
    if (el) el.textContent = item.val !== undefined && item.val !== null ? item.val : "--";
  }

  // 4. Render Trends Chart
  renderTrendsChart(trend_readings || []);

  // 5. Recent Alerts Snapshot
  renderDashboardAlertsPreview(recent_alerts || []);
}

function updateAlertBadgeCounters(count) {
  const sidebarBadge = document.getElementById("sidebar-alerts-badge");
  const bottomBadge = document.getElementById("bottom-alerts-badge");
  [sidebarBadge, bottomBadge].forEach(badge => {
    if (badge) {
      if (count > 0) {
        badge.textContent = count > 99 ? "99+" : count;
        badge.style.display = "inline-flex";
      } else {
        badge.style.display = "none";
      }
    }
  });
}

function renderTrendsChart(readings) {
  const canvas = document.getElementById("vitals-trend-chart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  // Format labels & datasets
  const labels = readings.map(r => {
    const d = new Date(r.recorded_at);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  });

  const hrData = readings.map(r => r.heart_rate);
  const spo2Data = readings.map(r => r.spo2);
  const sbpData = readings.map(r => r.systolic_bp);
  const dbpData = readings.map(r => r.diastolic_bp);

  if (trendChartInstance) {
    trendChartInstance.destroy();
  }

  trendChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels.length ? labels : ["No data"],
      datasets: [
        {
          label: "Heart Rate (bpm)",
          data: hrData.length ? hrData : [0],
          borderColor: "#EF4444",
          backgroundColor: "rgba(239, 68, 68, 0.08)",
          tension: 0.35,
          borderWidth: 2.2,
          pointRadius: 3,
          pointHoverRadius: 6
        },
        {
          label: "SpO2 (%)",
          data: spo2Data.length ? spo2Data : [0],
          borderColor: "#06B6D4",
          backgroundColor: "rgba(6, 182, 212, 0.08)",
          tension: 0.35,
          borderWidth: 2.2,
          pointRadius: 3,
          pointHoverRadius: 6
        },
        {
          label: "Systolic BP (mmHg)",
          data: sbpData.length ? sbpData : [0],
          borderColor: "#F59E0B",
          backgroundColor: "rgba(245, 158, 11, 0.06)",
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3
        },
        {
          label: "Diastolic BP (mmHg)",
          data: dbpData.length ? dbpData : [0],
          borderColor: "#10B981",
          backgroundColor: "rgba(16, 185, 129, 0.06)",
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          position: "top",
          labels: {
            color: "#9CA3AF",
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
            boxWidth: 12,
            usePointStyle: true
          }
        },
        tooltip: {
          backgroundColor: "rgba(17, 24, 39, 0.92)",
          borderColor: "rgba(255, 255, 255, 0.1)",
          borderWidth: 1,
          titleFont: { family: "'Plus Jakarta Sans', sans-serif", weight: 'bold' },
          bodyFont: { family: "'Plus Jakarta Sans', sans-serif" }
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(255, 255, 255, 0.04)" },
          ticks: { color: "#6B7280", font: { size: 11 } }
        },
        y: {
          grid: { color: "rgba(255, 255, 255, 0.04)" },
          ticks: { color: "#6B7280", font: { size: 11 } }
        }
      }
    }
  });
}

function renderDashboardAlertsPreview(alerts) {
  const container = document.getElementById("dashboard-alerts-preview-list");
  if (!container) return;

  if (!alerts.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 24px;">
        <div class="empty-state-icon">🛡️</div>
        <p style="font-size: 0.85rem;">No active alerts. System healthy.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = alerts.map(a => `
    <div class="alert-preview-item">
      <div class="alert-preview-header">
        <span class="vital-badge ${a.severity === 'CRITICAL' ? 'badge-critical' : 'badge-warning'}">
          ${a.severity}
        </span>
        <span style="font-size: 0.72rem; color: var(--text-tertiary);">
          ${formatTimestamp(a.created_at)}
        </span>
      </div>
      <div class="alert-preview-msg">${escapeHtml(a.message)}</div>
      <div class="alert-preview-footer">
        <span>${a.acknowledged ? '✓ Acknowledged' : '⚠️ Pending action'}</span>
        ${!a.acknowledged ? `<button class="btn-ack" onclick="handleAcknowledgeAlert(${a.id}, true)">Acknowledge</button>` : ''}
      </div>
    </div>
  `).join("");
}

// ----------------------------------------------------
// Log Vitals Tab Controller
// ----------------------------------------------------
function initVitalsForm() {
  const form = document.getElementById("form-log-vital");
  const resultCard = document.getElementById("vitals-ai-result-card");

  // Preset Buttons
  const presets = {
    normal: { hr: 72, spo2: 98, sbp: 118, dbp: 76, temp: 36.8, resp: 16, gluc: 92 },
    warning: { hr: 104, spo2: 94, sbp: 148, dbp: 94, temp: 38.0, resp: 22, gluc: 160 },
    critical: { hr: 136, spo2: 88, sbp: 188, dbp: 112, temp: 39.4, resp: 28, gluc: 210 }
  };

  document.querySelectorAll(".preset-btn[data-preset]").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = presets[btn.dataset.preset];
      if (p) {
        document.getElementById("input-hr").value = p.hr;
        document.getElementById("input-spo2").value = p.spo2;
        document.getElementById("input-sbp").value = p.sbp;
        document.getElementById("input-dbp").value = p.dbp;
        document.getElementById("input-temp").value = p.temp;
        document.getElementById("input-resp").value = p.resp;
        document.getElementById("input-gluc").value = p.gluc;
      }
    });
  });

  // Submit Handler
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type='submit']");
    const errorEl = document.getElementById("vitals-form-error");
    errorEl.style.display = "none";

    const payload = {
      heart_rate: parseFloat(document.getElementById("input-hr").value),
      spo2: parseFloat(document.getElementById("input-spo2").value),
      systolic_bp: parseFloat(document.getElementById("input-sbp").value),
      diastolic_bp: parseFloat(document.getElementById("input-dbp").value),
      temperature: parseFloat(document.getElementById("input-temp").value),
      respiratory_rate: parseFloat(document.getElementById("input-resp").value),
      glucose: document.getElementById("input-gluc").value ? parseFloat(document.getElementById("input-gluc").value) : null
    };

    try {
      btn.disabled = true;
      btn.textContent = "Analyzing Clinical Vitals...";

      const res = await VitalApi.logVital(payload);
      displayAiResult(res.record, res.evaluation, res.alert);

      // Refresh dashboard background stats
      loadDashboardData();

      if (typeof PCL !== "undefined") {
        PCL.updateVitals(res.record);
        PCL.refresh();
      }
    } catch (err) {
      errorEl.textContent = err.message || "Failed to submit vital signs";
      errorEl.style.display = "block";
    } finally {
      btn.disabled = false;
      btn.textContent = "Analyze & Save Reading";
    }
  });
}

function displayAiResult(record, evaluation, alert) {
  const card = document.getElementById("vitals-ai-result-card");
  const badge = document.getElementById("ai-result-badge");
  const scoreEl = document.getElementById("ai-result-score");
  const explEl = document.getElementById("ai-result-explanation");
  const findingsList = document.getElementById("ai-result-findings");
  const alertNotice = document.getElementById("ai-result-alert-notice");

  badge.className = "vital-badge " + (
    record.risk_level === "CRITICAL" ? "badge-critical" :
    record.risk_level === "WARNING" ? "badge-warning" : "badge-normal"
  );
  badge.textContent = record.risk_level;

  scoreEl.textContent = `Risk Score: ${record.risk_score.toFixed(1)}%`;
  explEl.textContent = record.ai_explanation;

  if (evaluation && evaluation.findings && evaluation.findings.length > 0) {
    findingsList.innerHTML = evaluation.findings.map(f => `<li>• ${escapeHtml(f)}</li>`).join("");
    findingsList.style.display = "block";
  } else {
    findingsList.innerHTML = "<li>• All vital signs are within healthy baseline parameters.</li>";
    findingsList.style.display = "block";
  }

  if (alert) {
    alertNotice.style.display = "block";
    alertNotice.innerHTML = `⚠️ <strong>Automated Alert Triggered:</strong> A new clinical warning record (#${alert.id}) was registered in the early warning queue.`;
  } else {
    alertNotice.style.display = "none";
  }

  card.style.display = "block";
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ----------------------------------------------------
// History Tab Controller
// ----------------------------------------------------
let historyRecordsCache = [];

function initHistoryView() {
  const filter = document.getElementById("history-filter-select");
  if (filter) {
    filter.addEventListener("change", () => {
      renderHistoryTable(historyRecordsCache, filter.value);
    });
  }
}

async function loadHistoryData() {
  try {
    const data = await VitalApi.getHistory(50);
    historyRecordsCache = data.records || [];
    const filter = document.getElementById("history-filter-select")?.value || "ALL";
    renderHistoryTable(historyRecordsCache, filter);
  } catch (err) {
    console.error("History load error:", err);
  }
}

function renderHistoryTable(records, filter = "ALL") {
  const tbody = document.getElementById("history-table-body");
  if (!tbody) return;

  const filtered = (filter === "ALL") ? records : records.filter(r => r.risk_level === filter);

  if (!filtered.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">No vital history records found matching criteria.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td><strong>${formatTimestamp(r.recorded_at)}</strong></td>
      <td>${Math.round(r.heart_rate)} bpm</td>
      <td>${Math.round(r.spo2)}%</td>
      <td>${Math.round(r.systolic_bp)}/${Math.round(r.diastolic_bp)} mmHg</td>
      <td>${r.temperature.toFixed(1)}°C</td>
      <td>${Math.round(r.respiratory_rate)}/min</td>
      <td>
        <span class="vital-badge ${
          r.risk_level === 'CRITICAL' ? 'badge-critical' :
          r.risk_level === 'WARNING' ? 'badge-warning' : 'badge-normal'
        }">
          ${r.risk_level} (${r.risk_score.toFixed(0)}%)
        </span>
      </td>
    </tr>
  `).join("");
}

// ----------------------------------------------------
// ----------------------------------------------------
// Feature #6: Early Warning Alerts Tab Controller
// ----------------------------------------------------
let currentAlertsStatus = "active"; // "active" or "resolved"
let currentAlertsLevel = "ALL";     // "ALL", "CRITICAL", "ELEVATED", "WATCH", "NORMAL"
let currentAssignAlertId = null;
let currentAssignVillage = "";
let cachedEarlyAlerts = [];

function initAlertsView() {
  // 1. Level Summary Chips (click to filter by level)
  const levelChips = document.querySelectorAll(".alert-level-chip");
  levelChips.forEach(chip => {
    chip.addEventListener("click", () => {
      levelChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      currentAlertsLevel = chip.dataset.level || "ALL";
      filterAndRenderAlerts();
    });
  });

  // 2. Active / Resolved Toggle Buttons
  const btnActive = document.getElementById("btn-tab-status-active");
  const btnResolved = document.getElementById("btn-tab-status-resolved");
  if (btnActive && btnResolved) {
    btnActive.addEventListener("click", () => {
      btnActive.classList.add("active");
      btnActive.setAttribute("aria-selected", "true");
      btnResolved.classList.remove("active");
      btnResolved.setAttribute("aria-selected", "false");
      currentAlertsStatus = "active";
      filterAndRenderAlerts();
    });

    btnResolved.addEventListener("click", () => {
      btnResolved.classList.add("active");
      btnResolved.setAttribute("aria-selected", "true");
      btnActive.classList.remove("active");
      btnActive.setAttribute("aria-selected", "false");
      currentAlertsStatus = "resolved";
      filterAndRenderAlerts();
    });
  }

  // 3. Assign ASHA Worker Modal Triggers
  const btnCloseAssign = document.getElementById("btn-close-assign-modal");
  const btnCancelAssign = document.getElementById("btn-cancel-assign");
  const btnConfirmAssign = document.getElementById("btn-confirm-assign");
  const modalAssign = document.getElementById("modal-assign-asha");

  const closeAssignModal = () => {
    if (modalAssign) modalAssign.style.display = "none";
    currentAssignAlertId = null;
    currentAssignVillage = "";
  };

  if (btnCloseAssign) btnCloseAssign.addEventListener("click", closeAssignModal);
  if (btnCancelAssign) btnCancelAssign.addEventListener("click", closeAssignModal);
  if (btnConfirmAssign) {
    btnConfirmAssign.addEventListener("click", async () => {
      const selectWorker = document.getElementById("select-asha-worker");
      const workerName = selectWorker ? selectWorker.value : "Sunita Devi (ASHA - Zone A)";
      if (!currentAssignAlertId) return closeAssignModal();

      try {
        btnConfirmAssign.disabled = true;
        btnConfirmAssign.textContent = "Assigning...";
        await VitalApi.assignAlert(currentAssignAlertId, workerName);
        showEarlyAlertToast(`Assigned ${workerName} to ${currentAssignVillage || 'alert'}!`, "👤");
        closeAssignModal();
        await loadAlertsData();
      } catch (err) {
        alert("Failed to assign ASHA worker: " + err.message);
      } finally {
        if (btnConfirmAssign) {
          btnConfirmAssign.disabled = false;
          btnConfirmAssign.textContent = "Confirm Assignment";
        }
      }
    });
  }

  // 4. Create Test Alert Modal Triggers (Demo Purpose)
  const btnOpenTestModal = document.getElementById("btn-open-create-alert-modal");
  const btnCloseTestModal = document.getElementById("btn-close-create-alert-modal");
  const btnCancelTestModal = document.getElementById("btn-cancel-create-alert");
  const btnSubmitTestModal = document.getElementById("btn-submit-create-alert");
  const modalTestAlert = document.getElementById("modal-create-test-alert");
  const inputTestScore = document.getElementById("input-test-score");
  const labelTestScore = document.getElementById("label-test-score-val");

  const closeTestModal = () => {
    if (modalTestAlert) modalTestAlert.style.display = "none";
  };

  if (btnOpenTestModal && modalTestAlert) {
    btnOpenTestModal.addEventListener("click", () => {
      modalTestAlert.style.display = "flex";
    });
  }

  if (btnCloseTestModal) btnCloseTestModal.addEventListener("click", closeTestModal);
  if (btnCancelTestModal) btnCancelTestModal.addEventListener("click", closeTestModal);

  if (inputTestScore && labelTestScore) {
    inputTestScore.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
      let lvl = "NORMAL";
      let color = "#10b981";
      if (val >= 75) { lvl = "CRITICAL"; color = "#ef4444"; }
      else if (val >= 50) { lvl = "ELEVATED"; color = "#f97316"; }
      else if (val >= 25) { lvl = "WATCH"; color = "#eab308"; }

      labelTestScore.textContent = `${val} (${lvl})`;
      labelTestScore.style.color = color;
    });
  }

  if (btnSubmitTestModal) {
    btnSubmitTestModal.addEventListener("click", async () => {
      const villageInput = document.getElementById("input-test-village");
      const scoreInput = document.getElementById("input-test-score");
      const reasonsInput = document.getElementById("input-test-reasons");

      const village = (villageInput ? villageInput.value : "").trim() || "Lakhipur";
      const riskScore = scoreInput ? parseInt(scoreInput.value, 10) : 85;
      const reasonsRaw = reasonsInput ? reasonsInput.value : "8 diarrhea cases reported";
      const reasons = reasonsRaw.split(/[,;\n]+/).map(r => r.trim()).filter(Boolean);

      try {
        btnSubmitTestModal.disabled = true;
        btnSubmitTestModal.textContent = "Creating...";
        await VitalApi.createAlert({ village, riskScore, reasons });
        showEarlyAlertToast(`Created ${riskScore >= 75 ? 'CRITICAL' : 'warning'} alert for ${village}!`, "🚨");
        closeTestModal();
        await loadAlertsData();
      } catch (err) {
        alert("Failed to create alert: " + err.message);
      } finally {
        if (btnSubmitTestModal) {
          btnSubmitTestModal.disabled = false;
          btnSubmitTestModal.textContent = "Create Alert";
        }
      }
    });
  }
}

async function loadAlertsData() {
  try {
    const data = await VitalApi.getAlerts("all");
    const backendAlerts = data.alerts || [];

    // Also pull local water contamination alerts to keep water testing synchronized
    const waterTests = wqLoadTests();
    const ackWaterAlerts = getAcknowledgedWaterAlerts();

    const waterAlertItems = waterTests
      .filter(t => t.status === "CONTAMINATED")
      .map(t => {
        const isAck = ackWaterAlerts.includes(t.datetime);
        return {
          id: `water-${t.datetime}`,
          isWaterAlert: true,
          waterDatetime: t.datetime,
          village: t.village || "Unknown Village",
          level: "CRITICAL",
          severity: "CRITICAL",
          riskScore: 84,
          risk_score: 84,
          reasons: [
            `Water source contamination: ${t.source}`,
            `Parameters: pH ${t.ph}, Turbidity ${t.turbidity} NTU, Bacterial: ${t.bacterial}`
          ],
          recommendedAction: "Inspect primary water source and conduct community awareness",
          recommended_action: "Inspect primary water source and conduct community awareness",
          assignedTo: null,
          assigned_to: null,
          status: isAck ? "resolved" : "active",
          acknowledged: isAck,
          created_at: t.datetime,
          createdAt: t.datetime
        };
      });

    // Merge and sort
    const levelRank = { CRITICAL: 0, ELEVATED: 1, WATCH: 2, NORMAL: 3 };
    const allAlerts = [...waterAlertItems, ...backendAlerts].sort((a, b) => {
      const rA = levelRank[(a.level || a.severity || "").toUpperCase()] ?? 4;
      const rB = levelRank[(b.level || b.severity || "").toUpperCase()] ?? 4;
      if (rA !== rB) return rA - rB;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    cachedEarlyAlerts = allAlerts;

    // Calculate Summary Counts
    updateAlertSummaryCounters(allAlerts);

    // Filter and Render
    filterAndRenderAlerts();

  } catch (err) {
    console.error("[VitalWatch] Early Warning Alerts load error:", err);
  }
}

function updateAlertSummaryCounters(alerts) {
  let activeCount = 0;
  let resolvedCount = 0;
  let countCrit = 0;
  let countElev = 0;
  let countWatch = 0;
  let countNorm = 0;

  alerts.forEach(a => {
    const isResolved = (a.status === "resolved") || a.acknowledged;
    if (isResolved) {
      resolvedCount++;
    } else {
      activeCount++;
      const lvl = (a.level || a.severity || "NORMAL").toUpperCase();
      if (lvl === "CRITICAL") countCrit++;
      else if (lvl === "ELEVATED") countElev++;
      else if (lvl === "WATCH") countWatch++;
      else if (lvl === "NORMAL") countNorm++;
    }
  });

  // Level Chips Counts (shows active counts for instant prioritization)
  const elAll = document.getElementById("chip-count-all");
  const elCrit = document.getElementById("chip-count-critical");
  const elElev = document.getElementById("chip-count-elevated");
  const elWatch = document.getElementById("chip-count-watch");
  const elNorm = document.getElementById("chip-count-normal");

  if (elAll) elAll.textContent = activeCount;
  if (elCrit) elCrit.textContent = countCrit;
  if (elElev) elElev.textContent = countElev;
  if (elWatch) elWatch.textContent = countWatch;
  if (elNorm) elNorm.textContent = countNorm;

  // Active / Resolved Tabs Counts
  const elTabActive = document.getElementById("status-count-active");
  const elTabResolved = document.getElementById("status-count-resolved");
  if (elTabActive) elTabActive.textContent = activeCount;
  if (elTabResolved) elTabResolved.textContent = resolvedCount;

  // Global sidebar & overview counters
  updateAlertBadgeCounters(activeCount);
}

function filterAndRenderAlerts() {
  const container = document.getElementById("alerts-list-wrapper");
  const emptyState = document.getElementById("alerts-empty-state");
  if (!container) return;

  // 1. Status Filter
  let filtered = cachedEarlyAlerts.filter(a => {
    const isResolved = (a.status === "resolved") || a.acknowledged;
    if (currentAlertsStatus === "active") return !isResolved;
    if (currentAlertsStatus === "resolved") return isResolved;
    return true;
  });

  // 2. Level Filter
  if (currentAlertsLevel !== "ALL") {
    filtered = filtered.filter(a => {
      const lvl = (a.level || a.severity || "NORMAL").toUpperCase();
      return lvl === currentAlertsLevel;
    });
  }

  // Handle Empty State
  if (!filtered.length) {
    container.innerHTML = "";
    if (emptyState) emptyState.style.display = "block";
    return;
  }

  if (emptyState) emptyState.style.display = "none";
  container.innerHTML = filtered.map(a => renderEarlyAlertCardHtml(a)).join("");
}

function renderEarlyAlertCardHtml(a) {
  const level = (a.level || a.severity || "NORMAL").toUpperCase();
  const levelClass = `level-${level.toLowerCase()}`;
  const badgeClass = `badge-${level.toLowerCase()}`;
  
  const score = Math.round(a.riskScore != null ? a.riskScore : (a.risk_score != null ? a.risk_score : 0));
  const isResolved = (a.status === "resolved") || a.acknowledged;

  // Reasons list (2-3 short bullets)
  let reasons = a.reasons || [];
  if (typeof reasons === "string") {
    try { reasons = JSON.parse(reasons); } catch { reasons = [reasons]; }
  }
  if (!Array.isArray(reasons) || !reasons.length) {
    reasons = [a.message || "Surveillance threshold exceeded"];
  }

  const reasonsHtml = reasons.map(r => `<li>${escapeHtml(r)}</li>`).join("");
  const recAction = a.recommendedAction || a.recommended_action || "No action needed";
  const assigned = a.assignedTo || a.assigned_to;

  const alertIdAttr = a.isWaterAlert ? `'${a.id}'` : a.id;
  const villageAttr = escapeHtml(a.village || "Village");

  return `
    <div class="early-alert-card ${levelClass} ${isResolved ? 'resolved-card' : ''}" id="alert-card-${a.id}">
      <!-- Header: Level Badge, Village Name, Risk Score & Time -->
      <div class="early-card-header">
        <div class="early-card-title-group">
          <div class="early-village-name">
            <span>📍</span> ${escapeHtml(a.village || "General Community")}
          </div>
          <div class="early-time-badge">${formatTimestamp(a.createdAt || a.created_at)}</div>
        </div>
        <div class="early-card-badges">
          <span class="early-score-chip">${score}% Risk</span>
          <span class="early-level-badge ${badgeClass}">${level}</span>
        </div>
      </div>

      <!-- Reasons Bullets -->
      <div>
        <div style="font-size: 0.74rem; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px;">
          Detected Reasons:
        </div>
        <ul class="early-reasons-list">
          ${reasonsHtml}
        </ul>
      </div>

      <!-- Recommended Action Box -->
      <div class="early-action-box">
        <span class="early-action-icon">${level === 'CRITICAL' ? '⚠️' : '⚡'}</span>
        <div class="early-action-content">
          <span class="early-action-label">Recommended Protocol</span>
          <span class="early-action-text">${escapeHtml(recAction)}</span>
        </div>
      </div>

      <!-- Footer: ASHA Assignment & Actions -->
      <div class="early-card-footer">
        <div class="early-assigned-info">
          ${assigned ? `
            <span>👤</span> Assigned: <strong>${escapeHtml(assigned)}</strong>
          ` : `
            <span class="early-assigned-unassigned"><span>⚠️</span> Unassigned</span>
          `}
        </div>

        <div class="early-card-actions">
          ${!isResolved ? `
            <button type="button" class="early-btn-assign" onclick="openAssignAshaModal(${alertIdAttr}, '${villageAttr}')" title="Assign an ASHA health worker">
              👤 Assign ASHA
            </button>
            <button type="button" class="early-btn-resolve" onclick="handleResolveAlert(${alertIdAttr}, '${villageAttr}', this)" title="Mark this alert as resolved">
              ✓ Mark Resolved
            </button>
          ` : `
            <span class="early-resolved-tag">✓ Resolved</span>
          `}
        </div>
      </div>
    </div>
  `;
}

function openAssignAshaModal(alertId, villageName) {
  currentAssignAlertId = alertId;
  currentAssignVillage = villageName;

  const villageLabel = document.getElementById("modal-assign-village-name");
  if (villageLabel) villageLabel.textContent = `${villageName} (Alert #${alertId})`;

  const modal = document.getElementById("modal-assign-asha");
  if (modal) modal.style.display = "flex";
}

async function handleResolveAlert(alertId, villageName, btnElement) {
  try {
    const card = btnElement ? btnElement.closest(".early-alert-card") : null;
    if (card) {
      card.classList.add("resolving");
    }

    if (typeof alertId === "string" && alertId.startsWith("water-")) {
      const dt = alertId.replace("water-", "");
      handleAcknowledgeWaterAlert(dt);
    } else {
      await VitalApi.resolveAlert(alertId);
    }

    showEarlyAlertToast(`Alert #${alertId} for ${villageName} marked as resolved! ✓`, "✅");

    // Smooth resolve animation before updating list
    setTimeout(() => {
      // Update in cache
      const item = cachedEarlyAlerts.find(a => String(a.id) === String(alertId));
      if (item) {
        item.status = "resolved";
        item.acknowledged = true;
      }
      updateAlertSummaryCounters(cachedEarlyAlerts);
      filterAndRenderAlerts();
    }, 320);

  } catch (err) {
    if (btnElement && btnElement.closest(".early-alert-card")) {
      btnElement.closest(".early-alert-card").classList.remove("resolving");
    }
    alert("Failed to resolve alert: " + err.message);
  }
}

// Backward compatibility helper for legacy vitals alerts acknowledgment
async function handleAcknowledgeAlert(alertId, reloadDashboard = false) {
  try {
    await VitalApi.resolveAlert(alertId);
    if (reloadDashboard) {
      loadDashboardData();
    } else {
      loadAlertsData();
    }
  } catch (err) {
    alert("Failed to acknowledge alert: " + err.message);
  }
}

function showEarlyAlertToast(msg, icon = "🔔") {
  const container = document.getElementById("early-alert-toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "early-toast";
  toast.innerHTML = `
    <span style="font-size: 1.1rem; line-height: 1;">${icon}</span>
    <span>${escapeHtml(msg)}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 3000);
}

// ----------------------------------------------------
// Utility Functions
// ----------------------------------------------------
function formatTimestamp(isoStr) {
  if (!isoStr) return "--";
  const d = new Date(isoStr);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================
// WATER QUALITY MODULE
// ============================================================

const WQ_STORAGE_KEY = "vitalwatch_water_tests";
const WQ_MAX_RECENT  = 5;

/**
 * Risk rules helper function (easy to edit).
 * risk = 0
 * - if pH < 6.5 or pH > 8.5: risk += 1
 * - if turbidity > 5: risk += 1
 * - if bacterial_test == "positive": risk += 2
 * Return { risk, status, reasons[] }.
 */
function calculateWaterRisk(ph, turbidity, bacterialTest) {
  let risk = 0;
  const reasons = [];

  const numPh = parseFloat(ph);
  const numTurbidity = parseFloat(turbidity);
  const isBacterialPositive = String(bacterialTest).trim().toLowerCase() === "positive";

  if (numPh < 6.5 || numPh > 8.5) {
    risk += 1;
    reasons.push("pH out of safe range (6.5-8.5)");
  }
  if (numTurbidity > 5) {
    risk += 1;
    reasons.push("Turbidity above 5 NTU");
  }
  if (isBacterialPositive) {
    risk += 2;
    reasons.push("Bacterial test positive");
  }

  let status = "SAFE";
  if (risk >= 3) {
    status = "CONTAMINATED";
  } else if (risk >= 1) {
    status = "CAUTION";
  }

  return { risk, status, reasons };
}

// Alias for compatibility
function wqEvaluateRisk(values) {
  return calculateWaterRisk(values.ph, values.turbidity, values.bacterialTest || values.bacterial);
}

/** Load stored tests from localStorage */
function wqLoadTests() {
  try {
    return JSON.parse(localStorage.getItem(WQ_STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

/** Save tests array to localStorage */
function wqSaveTests(tests) {
  localStorage.setItem(WQ_STORAGE_KEY, JSON.stringify(tests));
}

/** Persist a new test entry (keep last 5) */
function wqAddTest(entry) {
  const tests = wqLoadTests();
  tests.unshift(entry);
  wqSaveTests(tests.slice(0, WQ_MAX_RECENT));
}

/** Format a JS Date as "DD Mon YYYY, HH:MM" */
function wqFormatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

/** Render the status badge CSS class by status string */
function wqStatusClass(status) {
  return { SAFE: "wq-badge-safe", CAUTION: "wq-badge-caution", CONTAMINATED: "wq-badge-contaminated" }[status] || "";
}

/** Render recent tests into the table and mobile cards */
function wqRenderRecentTests() {
  const tests = wqLoadTests();

  const tbody       = document.getElementById("wq-table-body");
  const cardsEl     = document.getElementById("wq-recent-cards");
  const emptyEl     = document.getElementById("wq-empty");
  const tableWrap   = document.getElementById("wq-table-wrap");

  if (!tbody) return;

  if (tests.length === 0) {
    tableWrap && (tableWrap.style.display = "none");
    cardsEl   && (cardsEl.style.display  = "none");
    emptyEl   && (emptyEl.style.display  = "flex");
    return;
  }

  emptyEl && (emptyEl.style.display = "none");

  // Determine layout: table for desktop, cards for mobile
  const isMobile = window.innerWidth < 640;
  if (isMobile) {
    tableWrap && (tableWrap.style.display = "none");
    cardsEl   && (cardsEl.style.display  = "flex");
  } else {
    tableWrap && (tableWrap.style.display = "block");
    cardsEl   && (cardsEl.style.display  = "none");
  }

  const statusBadges = {
    SAFE: "🟢 SAFE",
    CAUTION: "🟡 CAUTION",
    CONTAMINATED: "🔴 CONTAMINATED"
  };

  // Table rows
  tbody.innerHTML = tests.map(t => `
    <tr>
      <td>${escapeHtml(t.village)}</td>
      <td>${escapeHtml(t.source)}</td>
      <td><span class="wq-badge ${wqStatusClass(t.status)}" role="status">${statusBadges[t.status] || escapeHtml(t.status)}</span></td>
      <td>${escapeHtml(wqFormatDate(t.datetime))}</td>
    </tr>
  `).join("");

  // Mobile cards (stacked, no horizontal scroll)
  if (cardsEl) {
    cardsEl.innerHTML = tests.map(t => `
      <div class="wq-mobile-card">
        <div class="wq-mobile-row"><span class="wq-mobile-label">Village</span><span>${escapeHtml(t.village)}</span></div>
        <div class="wq-mobile-row"><span class="wq-mobile-label">Source</span><span>${escapeHtml(t.source)}</span></div>
        <div class="wq-mobile-row"><span class="wq-mobile-label">Status</span><span class="wq-badge ${wqStatusClass(t.status)}" role="status">${statusBadges[t.status] || escapeHtml(t.status)}</span></div>
        <div class="wq-mobile-row"><span class="wq-mobile-label">Date &amp; Time</span><span>${escapeHtml(wqFormatDate(t.datetime))}</span></div>
      </div>
    `).join("");
  }
}

/** Show / update the result card with smooth fade-in */
function wqShowResult({ status, reasons }) {
  const wrapper   = document.getElementById("wq-result-wrapper");
  const badgeEl   = document.getElementById("wq-status-badge");
  const iconEl    = document.getElementById("wq-status-icon");
  const textEl    = document.getElementById("wq-status-text");
  const reasonsEl = document.getElementById("wq-reasons-list");
  const safeMsg   = document.getElementById("wq-safe-msg");
  const layout    = document.querySelector(".wq-layout");

  if (!wrapper) return;

  // Icon + text
  const icons = { SAFE: "🟢", CAUTION: "🟡", CONTAMINATED: "🔴" };
  iconEl.textContent = icons[status] || "";
  textEl.textContent = status;

  // Badge colour class & glow
  badgeEl.className = "wq-status-badge " + wqStatusClass(status);

  // Reasons
  reasonsEl.innerHTML = reasons.map(r => `<li>${escapeHtml(r)}</li>`).join("");

  if (reasons.length === 0) {
    safeMsg && (safeMsg.style.display = "block");
  } else {
    safeMsg && (safeMsg.style.display = "none");
  }

  // Unhide wrapper and expand desktop layout
  wrapper.style.display = "block";
  if (layout) layout.classList.add("wq-has-result");

  // Trigger fade/slide-in animation
  wrapper.classList.remove("wq-result-visible");
  void wrapper.offsetWidth; // force browser reflow
  wrapper.classList.add("wq-result-visible");
}

/** Clear all inline validation errors */
function wqClearErrors() {
  ["village", "source", "ph", "turbidity", "temp", "bacterial"].forEach(f => {
    const el = document.getElementById(`err-${f}`);
    if (el) el.textContent = "";
  });
  document.querySelectorAll(".wq-input").forEach(i => i.classList.remove("wq-input-error"));
}

/** Show an inline error for a field */
function wqSetError(field, msg) {
  const errEl = document.getElementById(`err-${field}`);
  const inputEl = document.getElementById(`wq-${field}`);
  if (errEl)   errEl.textContent = msg;
  if (inputEl) inputEl.classList.add("wq-input-error");
}

/** Validate the form; returns parsed values or null on failure */
function wqValidateForm() {
  wqClearErrors();
  let valid = true;

  const village    = document.getElementById("wq-village")?.value.trim();
  const source     = document.getElementById("wq-source")?.value;
  const phRaw      = document.getElementById("wq-ph")?.value;
  const turbRaw    = document.getElementById("wq-turbidity")?.value;
  const tempRaw    = document.getElementById("wq-temp")?.value;
  const bacterial  = document.getElementById("wq-bacterial")?.value;

  if (!village) {
    wqSetError("village", "Village name is required.");
    valid = false;
  }
  if (!source) {
    wqSetError("source", "Please select a source type.");
    valid = false;
  }

  const ph = parseFloat(phRaw);
  if (phRaw === "" || isNaN(ph) || ph < 0 || ph > 14) {
    wqSetError("ph", "Enter a valid pH number (0 – 14).");
    valid = false;
  }

  const turbidity = parseFloat(turbRaw);
  if (turbRaw === "" || isNaN(turbidity) || turbidity < 0) {
    wqSetError("turbidity", "Enter a valid turbidity number (≥ 0 NTU).");
    valid = false;
  }

  const temp = parseFloat(tempRaw);
  if (tempRaw === "" || isNaN(temp)) {
    wqSetError("temp", "Enter a valid temperature in °C.");
    valid = false;
  }

  if (!bacterial) {
    wqSetError("bacterial", "Please select a bacterial test result.");
    valid = false;
  }

  if (!valid) return null;
  return { village, source, ph, turbidity, temp, bacterialTest: bacterial };
}

/** Initialise the Water Quality form handler */
function initWaterQuality() {
  const form = document.getElementById("wq-form");
  if (!form) return;

  // Real-time inline error clearing on input/change
  ["village", "source", "ph", "turbidity", "temp", "bacterial"].forEach(field => {
    const el = document.getElementById(`wq-${field}`);
    if (el) {
      const clearErr = () => {
        const errEl = document.getElementById(`err-${field}`);
        if (errEl) errEl.textContent = "";
        el.classList.remove("wq-input-error");
      };
      el.addEventListener("input", clearErr);
      el.addEventListener("change", clearErr);
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const values = wqValidateForm();
    if (!values) return;

    const { risk, status, reasons } = calculateWaterRisk(values.ph, values.turbidity, values.bacterialTest);

    // Persist to localStorage (last 5 tests)
    wqAddTest({
      village:   values.village,
      source:    values.source,
      ph:        values.ph,
      turbidity: values.turbidity,
      temp:      values.temp,
      bacterial: values.bacterialTest,
      risk,
      status,
      datetime:  new Date().toISOString()
    });

    // Show result card with calculated badge and reasons
    wqShowResult({ status, reasons });

    // Refresh recent tests table / cards
    wqRenderRecentTests();

    // Sync Overview stat cards and Alerts badge immediately
    loadOverviewData();
    loadAlertsData();
  });

  // Re-render on resize for responsive table/cards
  window.addEventListener("resize", () => {
    const tabEl = document.getElementById("tab-view-water");
    if (tabEl && tabEl.style.display !== "none") {
      wqRenderRecentTests();
    }
  });

  // Render existing tests on first load
  wqRenderRecentTests();
}

// Add initWaterQuality to DOMContentLoaded listener
document.addEventListener("DOMContentLoaded", () => {
  initWaterQuality();
});
