/**
 * VitalWatch — Feature #18: Simple Seasonal Risk
 *
 * Implements rule-based seasonal risk adjustments for rural waterborne disease surveillance.
 * Maps month -> Season, Historical Risk, and Risk Adjustment factor.
 * Provides interactive preview override and integrates with the dashboard risk score.
 */

const SeasonalRisk = {
  baseRisk: 60, // Default baseline for demonstration / initial load
  selectedOverride: "auto",
  
  /**
   * Month to Season lookup (month 1-12)
   * 6, 7, 8, 9   -> Monsoon 🌧️      | Historical Risk: HIGH   | Adjustment: +10%
   * 3, 4, 5      -> Summer ☀️       | Historical Risk: MEDIUM | Adjustment: +5%
   * 10, 11       -> Post-Monsoon 🍂 | Historical Risk: MEDIUM | Adjustment: +5%
   * 12, 1, 2     -> Winter ❄️       | Historical Risk: LOW    | Adjustment: 0%
   */
  getSeason(month) {
    const m = (typeof month === "number" && month >= 1 && month <= 12) 
      ? month 
      : (new Date().getMonth() + 1);

    if (m >= 6 && m <= 9) {
      return {
        key: "monsoon",
        name: "Monsoon",
        icon: "🌧️",
        riskLevel: "HIGH",
        badgeClass: "badge-risk-high",
        adjustment: 0.10,
        adjText: "+10%",
        themeClass: "season-theme-monsoon"
      };
    } else if (m >= 3 && m <= 5) {
      return {
        key: "summer",
        name: "Summer",
        icon: "☀️",
        riskLevel: "MEDIUM",
        badgeClass: "badge-risk-med",
        adjustment: 0.05,
        adjText: "+5%",
        themeClass: "season-theme-summer"
      };
    } else if (m === 10 || m === 11) {
      return {
        key: "post-monsoon",
        name: "Post-Monsoon",
        icon: "🍂",
        riskLevel: "MEDIUM",
        badgeClass: "badge-risk-med",
        adjustment: 0.05,
        adjText: "+5%",
        themeClass: "season-theme-post-monsoon"
      };
    } else {
      // 12, 1, 2
      return {
        key: "winter",
        name: "Winter",
        icon: "❄️",
        riskLevel: "LOW",
        badgeClass: "badge-risk-low",
        adjustment: 0.00,
        adjText: "0%",
        themeClass: "season-theme-winter"
      };
    }
  },

  getSeasonByKey(key) {
    switch ((key || "").toLowerCase()) {
      case "monsoon":
        return {
          key: "monsoon",
          name: "Monsoon",
          icon: "🌧️",
          riskLevel: "HIGH",
          badgeClass: "badge-risk-high",
          adjustment: 0.10,
          adjText: "+10%",
          themeClass: "season-theme-monsoon"
        };
      case "summer":
        return {
          key: "summer",
          name: "Summer",
          icon: "☀️",
          riskLevel: "MEDIUM",
          badgeClass: "badge-risk-med",
          adjustment: 0.05,
          adjText: "+5%",
          themeClass: "season-theme-summer"
        };
      case "post-monsoon":
        return {
          key: "post-monsoon",
          name: "Post-Monsoon",
          icon: "🍂",
          riskLevel: "MEDIUM",
          badgeClass: "badge-risk-med",
          adjustment: 0.05,
          adjText: "+5%",
          themeClass: "season-theme-post-monsoon"
        };
      case "winter":
      default:
        return {
          key: "winter",
          name: "Winter",
          icon: "❄️",
          riskLevel: "LOW",
          badgeClass: "badge-risk-low",
          adjustment: 0.00,
          adjText: "0%",
          themeClass: "season-theme-winter"
        };
    }
  },

  /**
   * Calculate adjusted risk: finalRisk = baseRisk * (1 + adjustment), capped at 100
   */
  calculateFinalRisk(base, adjustment) {
    const raw = base * (1 + adjustment);
    const capped = Math.min(100, raw);
    // Return rounded to 1 decimal place or whole number
    return Math.round(capped * 10) / 10;
  },

  init() {
    const select = document.getElementById("seasonal-preview-select");
    const currentActualSeason = this.getSeason();

    if (select) {
      // Update label of auto option with current real season
      const autoOption = select.querySelector("option[value='auto']");
      if (autoOption) {
        autoOption.textContent = `Current (${currentActualSeason.name}) ${currentActualSeason.icon}`;
      }

      select.addEventListener("change", (e) => {
        this.selectedOverride = e.target.value;
        this.render();
      });
    }

    // Initial render
    this.render();
  },

  update(baseScore) {
    if (typeof baseScore === "number" && baseScore > 0) {
      this.baseRisk = Math.round(baseScore * 10) / 10;
    }
    this.render();
  },

  getActiveSeason() {
    if (this.selectedOverride && this.selectedOverride !== "auto") {
      return this.getSeasonByKey(this.selectedOverride);
    }
    return this.getSeason();
  },

  render() {
    const card = document.getElementById("seasonal-risk-card");
    const season = this.getActiveSeason();
    const finalRisk = this.calculateFinalRisk(this.baseRisk, season.adjustment);

    if (card) {
      // Clean previous theme classes
      card.classList.remove(
        "season-theme-monsoon",
        "season-theme-summer",
        "season-theme-post-monsoon",
        "season-theme-winter"
      );
      card.classList.add(season.themeClass);

      // Icon
      const iconEl = document.getElementById("seasonal-icon-display");
      if (iconEl) iconEl.textContent = season.icon;

      // Name
      const nameEl = document.getElementById("seasonal-name-display");
      if (nameEl) nameEl.textContent = season.name;

      // Badge
      const badgeEl = document.getElementById("seasonal-risk-badge");
      if (badgeEl) {
        badgeEl.textContent = `Historical Risk: ${season.riskLevel}`;
        badgeEl.className = `seasonal-risk-badge ${season.badgeClass}`;
      }

      // Adjustment text
      const adjEl = document.getElementById("seasonal-adj-display");
      if (adjEl) adjEl.textContent = season.adjText;

      // Formula display
      const formulaEl = document.getElementById("seasonal-formula-display");
      if (formulaEl) {
        formulaEl.innerHTML = `Base <strong>${this.baseRisk}%</strong> + Seasonal <strong>${season.adjText}</strong> = <span class="seasonal-final-score">${finalRisk}%</span>`;
      }
    }

    // Also update main dashboard risk banner if present
    const bannerScore = document.getElementById("risk-banner-score");
    const bannerFormulaSub = document.getElementById("risk-banner-formula-sub");
    if (bannerScore) {
      bannerScore.textContent = `${finalRisk.toFixed(1)}%`;
    }
    if (bannerFormulaSub) {
      bannerFormulaSub.style.display = "block";
      bannerFormulaSub.textContent = `Base ${this.baseRisk}% + Season ${season.adjText} = ${finalRisk}%`;
    }

    // Optional category bump check on banner status
    const banner = document.getElementById("dashboard-risk-banner");
    const bannerTitle = document.getElementById("risk-banner-title");
    const pulseIcon = document.getElementById("risk-banner-icon");
    if (banner && bannerTitle) {
      if (finalRisk >= 70) {
        banner.classList.remove("status-normal", "status-warning");
        banner.classList.add("status-critical");
        bannerTitle.textContent = "CRITICAL RISK LEVEL DETECTED";
        if (pulseIcon) pulseIcon.innerHTML = "🚨";
      } else if (finalRisk >= 40) {
        banner.classList.remove("status-normal", "status-critical");
        banner.classList.add("status-warning");
        bannerTitle.textContent = "ELEVATED RISK WARNING";
        if (pulseIcon) pulseIcon.innerHTML = "⚠️";
      } else {
        banner.classList.remove("status-warning", "status-critical");
        banner.classList.add("status-normal");
        bannerTitle.textContent = "NORMAL VITAL STABILITY";
        if (pulseIcon) pulseIcon.innerHTML = "🫀";
    // Coordinate with WeatherRisk if available (Feature #19)
    if (typeof WeatherRisk !== "undefined" && typeof WeatherRisk.updateCombinedRisk === "function") {
      WeatherRisk.updateCombinedRisk();
    }
  }
};

// Global helper function for external callers as requested in prompt: getSeason(month)
function getSeason(month) {
  return SeasonalRisk.getSeason(month);
}

// Auto-initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  SeasonalRisk.init();
});

