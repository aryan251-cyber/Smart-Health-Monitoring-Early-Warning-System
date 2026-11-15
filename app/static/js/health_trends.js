/**
 * VitalWatch - Feature #8: Health Trends (Community Trend Graphs)
 * 
 * Manages 6 small line charts of community epidemiological trends over recent days.
 * Includes reusable renderTrendChart(canvasId, endpoint, color) with smooth draw animation,
 * loading / error states, gradient area fill, and latest value badge with trend arrow.
 */

// Global registry of Chart.js instances for trends
const trendChartInstances = {};

/**
 * Utility: Convert HEX color to RGBA string with custom opacity
 */
function trendHexToRgba(hex, alpha = 1) {
  const cleanHex = hex.replace("#", "");
  const num = parseInt(cleanHex, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Reusable function to fetch trend data and render a smooth line chart with points.
 * 
 * @param {string} canvasId - HTML element id of the <canvas>
 * @param {string} endpoint - API route to fetch data from (e.g. /api/trends/diarrhea)
 * @param {string} color    - Accent color hex code for line, points, and fill
 */
async function renderTrendChart(canvasId, endpoint, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const card = canvas.closest(".trend-card");
  const loadingEl = card ? card.querySelector(".trend-loading-state") : null;
  const errorEl = card ? card.querySelector(".trend-error-state") : null;
  const badgeEl = card ? card.querySelector(".trend-badge") : null;

  // Show loading state
  if (loadingEl) loadingEl.style.display = "flex";
  if (errorEl) errorEl.style.display = "none";
  canvas.style.opacity = "0";

  try {
    const response = await fetch(endpoint, {
      headers: {
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Endpoint returned status ${response.status}`);
    }

    const data = await response.json();
    const labels = Array.isArray(data.labels) ? data.labels : [];
    const cases = Array.isArray(data.cases) ? data.cases : [];

    // Calculate latest value and trend arrow vs previous day
    if (badgeEl && cases.length > 0) {
      const latest = cases[cases.length - 1];
      const previous = cases.length > 1 ? cases[cases.length - 2] : latest;
      const diff = latest - previous;

      let arrow = "→";
      let trendClass = "trend-badge-neutral";
      if (diff > 0) {
        arrow = "↑";
        trendClass = "trend-badge-up";
      } else if (diff < 0) {
        arrow = "↓";
        trendClass = "trend-badge-down";
      }

      const diffText = diff > 0 ? `+${diff}` : `${diff}`;
      badgeEl.className = `trend-badge ${trendClass}`;
      badgeEl.innerHTML = `<span class="badge-latest">${latest}</span> <span class="badge-arrow">${arrow}</span> <span class="badge-diff">(${diffText})</span>`;
    }

    // Set up canvas context and smooth gradient fill under the line
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 210);
    gradient.addColorStop(0, trendHexToRgba(color, 0.28));
    gradient.addColorStop(0.7, trendHexToRgba(color, 0.06));
    gradient.addColorStop(1, trendHexToRgba(color, 0.00));

    // Destroy prior instance if already exists
    if (trendChartInstances[canvasId]) {
      trendChartInstances[canvasId].destroy();
    }

    // Initialize smooth line chart with points
    trendChartInstances[canvasId] = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          data: cases,
          borderColor: color,
          backgroundColor: gradient,
          fill: true,
          tension: 0.4,
          borderWidth: 2.5,
          pointBackgroundColor: color,
          pointBorderColor: "#111827",
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: "#FFFFFF",
          pointHoverBorderColor: color,
          pointHoverBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 900,
          easing: "easeOutQuart"
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: "rgba(17, 24, 39, 0.95)",
            titleColor: "#F3F4F6",
            bodyColor: "#F3F4F6",
            borderColor: "rgba(255, 255, 255, 0.12)",
            borderWidth: 1,
            padding: 8,
            displayColors: false,
            callbacks: {
              label: (context) => ` Cases: ${context.parsed.y}`
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: "rgba(255, 255, 255, 0.06)",
              drawBorder: false
            },
            ticks: {
              color: "#9CA3AF",
              font: {
                family: "'Plus Jakarta Sans', sans-serif",
                size: 11
              }
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: "rgba(255, 255, 255, 0.06)",
              drawBorder: false
            },
            ticks: {
              color: "#9CA3AF",
              font: {
                family: "'Plus Jakarta Sans', sans-serif",
                size: 11
              },
              precision: 0
            }
          }
        }
      }
    });

    // Hide loading and show canvas
    if (loadingEl) loadingEl.style.display = "none";
    canvas.style.opacity = "1";
    canvas.style.transition = "opacity 0.3s ease";

  } catch (error) {
    console.error(`Error loading trend chart [${canvasId}]:`, error);
    if (loadingEl) loadingEl.style.display = "none";
    if (errorEl) errorEl.style.display = "flex";
  }
}

/**
 * Fetch and render all 6 trend charts
 */
function fetchAllTrendCharts() {
  const configs = [
    { canvasId: "trend-chart-diarrhea",           endpoint: "/api/trends/diarrhea",           color: "#F43F5E" },
    { canvasId: "trend-chart-fever",              endpoint: "/api/trends/fever",              color: "#F59E0B" },
    { canvasId: "trend-chart-water-contamination",endpoint: "/api/trends/water-contamination",color: "#06B6D4" },
    { canvasId: "trend-chart-high-risk-villages", endpoint: "/api/trends/high-risk-villages", color: "#EF4444" },
    { canvasId: "trend-chart-temperature",        endpoint: "/api/trends/temperature",        color: "#EC4899" },
    { canvasId: "trend-chart-respiratory",        endpoint: "/api/trends/respiratory",        color: "#8B5CF6" }
  ];

  configs.forEach(cfg => {
    renderTrendChart(cfg.canvasId, cfg.endpoint, cfg.color);
  });
}

// Global hook for app navigation
window.initHealthTrends = function() {
  fetchAllTrendCharts();
};

// Fetch all 6 charts on page load
document.addEventListener("DOMContentLoaded", () => {
  fetchAllTrendCharts();
});
