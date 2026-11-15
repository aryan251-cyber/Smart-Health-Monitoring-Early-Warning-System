/**
 * VitalWatch — Feature #19: Simple Weather Data
 *
 * Implements mock weather data, environmental risk evaluation,
 * interactive preset preview, and feeds into the combined Community Risk calculation.
 */

const WeatherRisk = {
  // 3 Demo Mock Presets
  presets: {
    heavy_rain: {
      key: "heavy_rain",
      name: "Heavy Rain",
      icon: "🌧️",
      rainfall: "High",
      rainfallLevel: 85, // Progress bar %
      temperature: 27,
      tempLevel: 55,     // Progress bar %
      humidity: 82,
      humidityLevel: 82, // Progress bar %
      themeClass: "weather-theme-rain"
    },
    normal: {
      key: "normal",
      name: "Normal",
      icon: "⛅",
      rainfall: "Medium",
      rainfallLevel: 50,
      temperature: 30,
      tempLevel: 65,
      humidity: 60,
      humidityLevel: 60,
      themeClass: "weather-theme-normal"
    },
    hot_dry: {
      key: "hot_dry",
      name: "Hot & Dry",
      icon: "☀️",
      rainfall: "Low",
      rainfallLevel: 20,
      temperature: 38,
      tempLevel: 92,
      humidity: 35,
      humidityLevel: 35,
      themeClass: "weather-theme-hot"
    }
  },

  // Default preset: Heavy Rain
  activePresetKey: "heavy_rain",

  /**
   * Environmental Risk Evaluation:
   * - Rainfall High OR humidity > 75 -> Elevated, +10% (Red)
   * - Rainfall Medium -> Moderate, +5% (Amber)
   * - Otherwise -> Low, 0% (Green)
   */
  getEnvironmentalRisk(weather) {
    const isHighRain = (weather.rainfall || "").toLowerCase() === "high";
    const isHighHumidity = typeof weather.humidity === "number" && weather.humidity > 75;
    const isMedRain = (weather.rainfall || "").toLowerCase() === "medium";

    if (isHighRain || isHighHumidity) {
      return {
        level: "Elevated",
        adjustment: 0.10,
        adjText: "+10%",
        badgeClass: "badge-risk-high"
      };
    } else if (isMedRain) {
      return {
        level: "Moderate",
        adjustment: 0.05,
        adjText: "+5%",
        badgeClass: "badge-risk-med"
      };
    } else {
      return {
        level: "Low",
        adjustment: 0.00,
        adjText: "0%",
        badgeClass: "badge-risk-low"
      };
    }
  },

  getActiveWeather() {
    return this.presets[this.activePresetKey] || this.presets.heavy_rain;
  },

  init() {
    const select = document.getElementById("weather-preview-select");
    if (select) {
      select.value = this.activePresetKey;
      select.addEventListener("change", (e) => {
        this.activePresetKey = e.target.value;
        this.render();
      });
    }

    this.render();
  },

  render() {
    const weather = this.getActiveWeather();
    const env = this.getEnvironmentalRisk(weather);
    const card = document.getElementById("weather-risk-card");

    if (card) {
      // Clean previous theme classes
      card.classList.remove("weather-theme-rain", "weather-theme-normal", "weather-theme-hot");
      card.classList.add(weather.themeClass);

      // Icon & Name
      const iconEl = document.getElementById("weather-icon-display");
      if (iconEl) iconEl.textContent = weather.icon;

      const nameEl = document.getElementById("weather-preset-name");
      if (nameEl) nameEl.textContent = weather.name;

      // Risk Badge
      const badgeEl = document.getElementById("weather-risk-badge");
      if (badgeEl) {
        badgeEl.textContent = `Environmental Risk: ${env.level}`;
        badgeEl.className = `weather-risk-badge ${env.badgeClass}`;
      }

      // Adjustment factor tag
      const adjEl = document.getElementById("weather-adj-display");
      if (adjEl) adjEl.textContent = env.adjText;

      // Rainfall Metric
      const valRainfall = document.getElementById("weather-val-rainfall");
      if (valRainfall) valRainfall.textContent = weather.rainfall;
      const barRainfall = document.getElementById("weather-bar-rainfall");
      if (barRainfall) barRainfall.style.width = `${weather.rainfallLevel}%`;

      // Temperature Metric
      const valTemp = document.getElementById("weather-val-temp");
      if (valTemp) valTemp.textContent = `${weather.temperature}°C`;
      const barTemp = document.getElementById("weather-bar-temp");
      if (barTemp) barTemp.style.width = `${weather.tempLevel}%`;

      // Humidity Metric
      const valHumidity = document.getElementById("weather-val-humidity");
      if (valHumidity) valHumidity.textContent = `${weather.humidity}%`;
      const barHumidity = document.getElementById("weather-bar-humidity");
      if (barHumidity) barHumidity.style.width = `${weather.humidityLevel}%`;
    }

    // Always recalculate combined Community Risk across Health, Water, Season, Weather
    this.updateCombinedRisk();
  },

  /**
   * Combine Health Data + Water Data + Season + Weather -> Community Risk
   * finalRisk = baseRisk * (1 + seasonAdjustment + weatherAdjustment), capped at 100
   */
  updateCombinedRisk() {
    const base = (typeof SeasonalRisk !== "undefined" && SeasonalRisk.baseRisk) ? SeasonalRisk.baseRisk : 60;
    const season = (typeof SeasonalRisk !== "undefined") 
      ? SeasonalRisk.getActiveSeason() 
      : { adjustment: 0.05, adjText: "+5%", icon: "🍂", name: "Post-Monsoon" };

    const weather = this.getActiveWeather();
    const env = this.getEnvironmentalRisk(weather);

    const totalMultiplier = 1 + season.adjustment + env.adjustment;
    const rawFinal = base * totalMultiplier;
    const finalRisk = Math.min(100, Math.round(rawFinal * 10) / 10);

    const formulaStr = `Base ${base}% + Season ${season.adjText} + Weather ${env.adjText} = ${finalRisk}%`;

    // 1. Update main risk banner score & formula pill
    const bannerScore = document.getElementById("risk-banner-score");
    if (bannerScore) {
      bannerScore.textContent = `${finalRisk.toFixed(1)}%`;
    }

    const bannerFormulaSub = document.getElementById("risk-banner-formula-sub");
    if (bannerFormulaSub) {
      bannerFormulaSub.style.display = "block";
      bannerFormulaSub.textContent = formulaStr;
    }

    // 2. Update Seasonal card formula
    const seasonalFormula = document.getElementById("seasonal-formula-display");
    if (seasonalFormula) {
      seasonalFormula.innerHTML = `Base <strong>${base}%</strong> + Season <strong>${season.adjText}</strong> + Weather <strong>${env.adjText}</strong> = <span class="seasonal-final-score">${finalRisk}%</span>`;
    }

    // 3. Update Weather card formula
    const weatherFormula = document.getElementById("weather-formula-display");
    if (weatherFormula) {
      weatherFormula.innerHTML = `Base <strong>${base}%</strong> + Season <strong>${season.adjText}</strong> + Weather <strong>${env.adjText}</strong> = <span class="weather-final-score">${finalRisk}%</span>`;
    }

    // 4. Update Risk Factors Strip (Health -> Water -> Season -> Weather -> Community Risk)
    const rfSeasonIcon = document.getElementById("rf-season-icon");
    const rfSeasonLabel = document.getElementById("rf-season-label");
    if (rfSeasonIcon) rfSeasonIcon.textContent = season.icon;
    if (rfSeasonLabel) rfSeasonLabel.textContent = `Season (${season.adjText})`;

    const rfWeatherIcon = document.getElementById("rf-weather-icon");
    const rfWeatherLabel = document.getElementById("rf-weather-label");
    if (rfWeatherIcon) rfWeatherIcon.textContent = weather.icon;
    if (rfWeatherLabel) rfWeatherLabel.textContent = `Weather (${env.adjText})`;

    const rfFinalLabel = document.getElementById("rf-final-label");
    if (rfFinalLabel) rfFinalLabel.innerHTML = `Community Risk: <strong>${finalRisk}%</strong>`;

    // 5. Update Status Banner Level & Indicator
    const banner = document.getElementById("dashboard-risk-banner");
    const bannerTitle = document.getElementById("risk-banner-title");
    const pulseIcon = document.getElementById("risk-banner-icon");
    if (banner && bannerTitle) {
      banner.classList.remove("status-normal", "status-warning", "status-critical");
      if (finalRisk >= 70) {
        banner.classList.add("status-critical");
        bannerTitle.textContent = "CRITICAL RISK LEVEL DETECTED";
        if (pulseIcon) pulseIcon.innerHTML = "🚨";
      } else if (finalRisk >= 40) {
        banner.classList.add("status-warning");
        bannerTitle.textContent = "ELEVATED RISK WARNING";
        if (pulseIcon) pulseIcon.innerHTML = "⚠️";
      } else {
        banner.classList.add("status-normal");
        bannerTitle.textContent = "NORMAL VITAL STABILITY";
        if (pulseIcon) pulseIcon.innerHTML = "🫀";
      }
    }
  }
};

// Global helper function for external callers as requested in prompt: getEnvironmentalRisk(weather)
function getEnvironmentalRisk(weather) {
  return WeatherRisk.getEnvironmentalRisk(weather || WeatherRisk.getActiveWeather());
}

// Auto-initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  WeatherRisk.init();
});

