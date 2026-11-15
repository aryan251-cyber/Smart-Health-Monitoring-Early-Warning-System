/**
 * VitalWatch — Village Risk Dashboard Component Logic
 * Feature #4: Modular cards component, modular table component, filter handling, and animations.
 */

// ----------------------------------------------------
// 1. CARDS COMPONENT
// ----------------------------------------------------
const VillageSummaryCards = {
  render() {
    const container = document.getElementById("vr-summary-cards");
    if (!container) return;

    const stats = getVillageRiskSummary();

    const cardsData = [
      {
        id: "vr-card-villages",
        icon: "🏘️",
        value: stats.villagesMonitored,
        label: "Villages Monitored"
      },
      {
        id: "vr-card-cases",
        icon: "🦠",
        value: stats.activeCases,
        label: "Active Cases",
        subtitle: stats.derivedFromCommunityReports ? "From Community Reports" : null
      },
      {
        id: "vr-card-water",
        icon: "💧",
        value: stats.waterSourcesTested,
        label: "Water Sources Tested"
      },
      {
        id: "vr-card-highrisk",
        icon: "⚠️",
        value: stats.highRiskVillages,
        label: "High Risk Villages"
      },
      {
        id: "vr-card-alerts",
        icon: "🔔",
        value: stats.activeAlerts,
        label: "Active Alerts"
      }
    ];

    container.innerHTML = cardsData.map(c => `
      <div class="vr-card vr-glass-card" id="${c.id}">
        <div class="vr-card-top">
          <span class="vr-card-icon">${c.icon}</span>
        </div>
        <div class="vr-card-number" data-target="${c.value}">0</div>
        <div class="vr-card-label">${c.label}</div>
        ${c.subtitle ? `<div class="vr-card-sublabel">${c.subtitle}</div>` : ""}
      </div>
    `).join("");

    // Trigger count-up animation for each card
    this.animateCounters(container);
  },

  animateCounters(container) {
    const counters = container.querySelectorAll(".vr-card-number");
    counters.forEach(counter => {
      const target = parseInt(counter.dataset.target, 10) || 0;
      const duration = 750; // ms
      const startTime = performance.now();

      function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(easeOut * target);

        counter.textContent = current;

        if (progress < 1) {
          requestAnimationFrame(update);
        } else {
          counter.textContent = target;
        }
      }

      requestAnimationFrame(update);
    });
  }
};

// ----------------------------------------------------
// 2. TABLE COMPONENT
// ----------------------------------------------------
const VillageRiskTable = {
  currentFilter: "All",

  getStatusInfo(status) {
    const s = (status || "").toLowerCase();
    if (s === "red") {
      return {
        label: "High Risk",
        dotClass: "vr-dot-red vr-pulse-dot",
        textClass: "vr-status-red"
      };
    }
    if (s === "yellow") {
      return {
        label: "Watch",
        dotClass: "vr-dot-yellow",
        textClass: "vr-status-yellow"
      };
    }
    return {
      label: "Safe",
      dotClass: "vr-dot-green",
      textClass: "vr-status-green"
    };
  },

  getPillClass(level) {
    const l = (level || "").toLowerCase();
    if (l === "high") return "vr-pill vr-pill-high";
    if (l === "medium") return "vr-pill vr-pill-medium";
    return "vr-pill vr-pill-low";
  },

  filterData(data) {
    if (this.currentFilter === "All") return data;
    const f = this.currentFilter.toLowerCase();
    return data.filter(row => {
      if (f === "high") return row.status.toLowerCase() === "red";
      if (f === "medium") return row.status.toLowerCase() === "yellow";
      if (f === "low") return row.status.toLowerCase() === "green";
      return true;
    });
  },

  render() {
    const tbody = document.getElementById("vr-table-tbody");
    const mobileCards = document.getElementById("vr-mobile-cards");
    if (!tbody) return;

    const allData = getVillageRiskData();
    const rows = this.filterData(allData);

    if (rows.length === 0) {
      const emptyHtml = `
        <tr>
          <td colspan="5" class="vr-table-empty">
            <div class="vr-empty-state">
              <span>🔍</span>
              <p>No villages matching "${this.currentFilter}" filter.</p>
            </div>
          </td>
        </tr>
      `;
      tbody.innerHTML = emptyHtml;
      if (mobileCards) {
        mobileCards.innerHTML = `
          <div class="vr-empty-state" style="padding: 24px;">
            <span>🔍</span>
            <p>No villages matching "${this.currentFilter}" filter.</p>
          </div>
        `;
      }
      return;
    }

    // Desktop table rows
    tbody.innerHTML = rows.map(r => {
      const statusInfo = this.getStatusInfo(r.status);
      const waterPillClass = this.getPillClass(r.waterRisk);
      const diseasePillClass = this.getPillClass(r.diseaseRisk);

      return `
        <tr class="vr-table-row">
          <td class="vr-cell-village">
            <strong>${r.village}</strong>
          </td>
          <td class="vr-cell-cases">
            <span class="vr-cases-num">${r.cases}</span>
          </td>
          <td>
            <span class="${waterPillClass}">${r.waterRisk}</span>
          </td>
          <td>
            <span class="${diseasePillClass}">${r.diseaseRisk}</span>
          </td>
          <td class="vr-cell-status">
            <div class="vr-status-wrapper">
              <span class="vr-status-dot ${statusInfo.dotClass}"></span>
              <span class="vr-status-label ${statusInfo.textClass}">${statusInfo.label}</span>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    // Mobile stacked cards
    if (mobileCards) {
      mobileCards.innerHTML = rows.map(r => {
        const statusInfo = this.getStatusInfo(r.status);
        const waterPillClass = this.getPillClass(r.waterRisk);
        const diseasePillClass = this.getPillClass(r.diseaseRisk);

        return `
          <div class="vr-mobile-card vr-glass-card">
            <div class="vr-mobile-card-header">
              <div class="vr-mobile-village-name">${r.village}</div>
              <div class="vr-status-wrapper">
                <span class="vr-status-dot ${statusInfo.dotClass}"></span>
                <span class="vr-status-label ${statusInfo.textClass}">${statusInfo.label}</span>
              </div>
            </div>
            <div class="vr-mobile-card-body">
              <div class="vr-mobile-stat">
                <span class="vr-mobile-label">Active Cases:</span>
                <span class="vr-cases-num">${r.cases}</span>
              </div>
              <div class="vr-mobile-stat">
                <span class="vr-mobile-label">Water Risk:</span>
                <span class="${waterPillClass}">${r.waterRisk}</span>
              </div>
              <div class="vr-mobile-stat">
                <span class="vr-mobile-label">Disease Risk:</span>
                <span class="${diseasePillClass}">${r.diseaseRisk}</span>
              </div>
            </div>
          </div>
        `;
      }).join("");
    }
  },

  bindFilters() {
    const filterButtons = document.querySelectorAll(".vr-filter-btn");
    filterButtons.forEach(btn => {
      if (btn._vrBound) return;
      btn._vrBound = true;

      btn.addEventListener("click", () => {
        filterButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.currentFilter = btn.dataset.filter || "All";
        this.render();
      });
    });
  }
};

// ----------------------------------------------------
// 3. MAIN CONTROLLER
// ----------------------------------------------------
function initVillageRiskDashboard() {
  VillageSummaryCards.render();
  VillageRiskTable.bindFilters();
  VillageRiskTable.render();
}

// Auto-init on load if tab is visible
document.addEventListener("DOMContentLoaded", () => {
  const hash = window.location.hash.replace("#", "");
  if (hash === "community-health" || window.location.pathname === "/community-health") {
    initVillageRiskDashboard();
  }
});
