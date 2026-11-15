/**
 * VitalWatch — Community Risk Map Controller (Feature #7)
 * Leaflet.js interactive geospatial disease surveillance mapping with
 * colored risk markers, animated pulsing rings on high-risk locations,
 * glassmorphic detail panel, and filter chips.
 *
 * Tile layers: OpenStreetMap (default) + Esri World Imagery (satellite)
 * Real villages: Central Gujarat (Kheda / Anand area), India
 */

let crmMapInstance = null;
let crmMarkersLayer = null;
let crmAllVillages = [];
let crmCurrentFilter = "ALL"; // "ALL", "High", "Medium", "Low"
let crmSelectedVillage = null;
let crmOsmLayer = null;
let crmEsriLayer = null;

// Fallback center (Central Gujarat: Kheda / Anand inland region)
const CRM_DEFAULT_CENTER = [22.70, 72.87];
const CRM_DEFAULT_ZOOM = 10;

/**
 * Initialize or refresh the Community Risk Map view.
 */
async function initCommunityRiskMap() {
  const container = document.getElementById("community-risk-map");
  if (!container) return;

  // 1. Initialize Leaflet Map if not already created
  if (!crmMapInstance) {
    setupLeafletMap();
    bindCrmControls();
  }

  // 2. Fetch fresh villages data
  await loadCrmVillages();

  // Invalidate size after section becomes visible
  setTimeout(() => {
    if (crmMapInstance) crmMapInstance.invalidateSize();
  }, 150);
}

/**
 * Creates the Leaflet map instance with OSM + Esri Satellite layers.
 */
function setupLeafletMap() {
  const container = document.getElementById("community-risk-map");
  if (!container || typeof L === "undefined") {
    console.warn("[VitalWatch Map] Leaflet library not loaded yet.");
    return;
  }

  // ── Tile Layers ────────────────────────────────────────────────────────────
  // Layer 1: Standard OpenStreetMap (free, no API key, default)
  crmOsmLayer = L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
      maxZoom: 19
    }
  );

  // Layer 2: Esri World Imagery / Satellite (free, no API key)
  crmEsriLayer = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: 'Tiles &copy; <a href="https://www.esri.com/" target="_blank">Esri</a>',
      maxZoom: 18
    }
  );

  // ── Map Instance with Gujarat Bounds Lockdown ──────────────────────────────
  // Restrict panning to Gujarat box: SW [20.0, 68.0], NE [24.8, 74.6]
  const gujaratBounds = L.latLngBounds([20.0, 68.0], [24.8, 74.6]);

  crmMapInstance = L.map("community-risk-map", {
    center: CRM_DEFAULT_CENTER,
    zoom: CRM_DEFAULT_ZOOM,
    zoomControl: true,
    attributionControl: true,
    minZoom: 7,
    maxZoom: 18,
    maxBounds: gujaratBounds,
    maxBoundsViscosity: 0.8,
    layers: [crmOsmLayer]          // OSM is the default base layer
  });

  // ── Layer Switcher Control ─────────────────────────────────────────────────
  const baseMaps = {
    "🗺️ Map": crmOsmLayer,
    "🛰️ Satellite": crmEsriLayer
  };
  L.control.layers(baseMaps, null, {
    position: "topright",
    collapsed: false
  }).addTo(crmMapInstance);

  // ── Markers layer group ────────────────────────────────────────────────────
  crmMarkersLayer = L.layerGroup().addTo(crmMapInstance);

  // Re-evaluate label visibility on every zoom change
  crmMapInstance.on("zoomend", updateTooltipVisibility);

  // Initial reflow trigger so tiles load in hidden tabs
  setTimeout(() => {
    if (crmMapInstance) crmMapInstance.invalidateSize();
  }, 200);
}

/**
 * Show/hide permanent village-name tooltips depending on current zoom level.
 * Labels are visible only at zoom >= 11 so they don't clutter out-zoomed views.
 */
function updateTooltipVisibility() {
  if (!crmMapInstance || !crmMarkersLayer) return;
  const show = crmMapInstance.getZoom() >= 11;
  crmMarkersLayer.eachLayer(layer => {
    const tt = layer.getTooltip && layer.getTooltip();
    if (tt) {
      const el = tt.getElement();
      if (el) el.style.display = show ? "" : "none";
    }
  });
}


/**
 * Fetch villages data from backend GET /api/villages.
 */
async function loadCrmVillages() {
  try {
    let villages = [];
    if (typeof VitalApi !== "undefined" && typeof VitalApi.getVillages === "function") {
      const res = await VitalApi.getVillages();
      villages = res.villages || [];
    } else {
      const res = await fetch("/api/villages");
      const data = await res.json();
      villages = data.villages || [];
    }

    // Quick sanity check: verify coordinates fall inside Gujarat & inland district bounds
    villages.forEach(v => {
      if (v.lat < 20.1 || v.lat > 24.7 || v.lng < 68.1 || v.lng > 74.5) {
        console.warn(`[VitalWatch Map] ⚠️ Warning: Village "${v.name}" (${v.lat}, ${v.lng}) is outside Gujarat bounds!`);
      }
      if (v.lat < 22.2 || v.lat > 23.1 || v.lng < 72.3 || v.lng > 73.3) {
        console.warn(`[VitalWatch Map] ⚠️ Warning: Village "${v.name}" (${v.lat}, ${v.lng}) is outside Central Gujarat district area!`);
      }
    });

    crmAllVillages = villages;

    // Update summary counts and line
    updateCrmSummaryAndChips(villages);

    // Render Markers on Map
    renderCrmMarkers();

    // Trigger map reflow / invalidateSize once loaded
    setTimeout(() => {
      if (crmMapInstance) crmMapInstance.invalidateSize();
    }, 200);

  } catch (err) {
    console.error("[VitalWatch Map] Failed to load villages:", err);
  }
}

/**
 * Updates the summary line and chip counters.
 */
function updateCrmSummaryAndChips(villages) {
  let countHigh = 0;
  let countMed = 0;
  let countLow = 0;

  villages.forEach(v => {
    const lvl = v.riskLevel || (v.riskScore >= 70 ? "High" : (v.riskScore >= 40 ? "Medium" : "Low"));
    if (lvl === "High") countHigh++;
    else if (lvl === "Medium") countMed++;
    else countLow++;
  });

  // Summary line
  const elVillages = document.getElementById("crm-summary-villages");
  const elHighRisk = document.getElementById("crm-summary-highrisk");
  if (elVillages) elVillages.textContent = `${villages.length} villages monitored`;
  if (elHighRisk) elHighRisk.textContent = `${countHigh} high risk`;

  // Chip counters
  const elAll = document.getElementById("crm-count-all");
  const elH = document.getElementById("crm-count-high");
  const elM = document.getElementById("crm-count-medium");
  const elL = document.getElementById("crm-count-low");

  if (elAll) elAll.textContent = villages.length;
  if (elH) elH.textContent = countHigh;
  if (elM) elM.textContent = countMed;
  if (elL) elL.textContent = countLow;
}

/**
 * Renders circular risk markers on the Leaflet map.
 */
function renderCrmMarkers() {
  if (!crmMarkersLayer || !crmMapInstance) return;

  crmMarkersLayer.clearLayers();

  const filtered = crmAllVillages.filter(v => {
    const lvl = v.riskLevel || (v.riskScore >= 70 ? "High" : (v.riskScore >= 40 ? "Medium" : "Low"));
    if (crmCurrentFilter === "ALL") return true;
    return lvl.toLowerCase() === crmCurrentFilter.toLowerCase();
  });

  const markerList = [];

  filtered.forEach(v => {
    const lvl = v.riskLevel || (v.riskScore >= 70 ? "High" : (v.riskScore >= 40 ? "Medium" : "Low"));
    const isHigh = (lvl === "High");
    const isMedium = (lvl === "Medium");

    const colorClass = isHigh ? "marker-high" : (isMedium ? "marker-medium" : "marker-low");

    // DivIcon — larger dot (22px) with soft pulsing ring on High risk only
    const html = isHigh
      ? `<div class="crm-custom-marker ${colorClass}">
           <div class="crm-marker-pulse"></div>
           <div class="crm-marker-dot"></div>
         </div>`
      : `<div class="crm-custom-marker ${colorClass}">
           <div class="crm-marker-dot"></div>
         </div>`;

    const icon = L.divIcon({
      className: "crm-div-icon-wrapper",
      html: html,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -14],
      tooltipAnchor: [0, 14]
    });

    const marker = L.marker([v.lat, v.lng], {
      icon: icon,
      title: `${v.name} (${lvl} Risk)`
    });

    // Permanent name label — visibility toggled by zoom level (>= 11)
    marker.bindTooltip(v.name, {
      permanent: true,
      direction: "bottom",
      className: "crm-marker-tooltip",
      offset: [0, 6]
    });

    // Glass styled Leaflet popup
    const popupContent = `
      <div class="crm-map-popup">
        <div class="crm-popup-header">
          <strong>${escapeHtml(v.name)}</strong>
          <span class="crm-popup-badge ${colorClass}">${lvl.toUpperCase()}</span>
        </div>
        <div class="crm-popup-body">
          <div>Score: <strong>${v.riskScore}%</strong></div>
          <div>Cases: <strong>${v.activeCases}</strong></div>
        </div>
      </div>
    `;

    marker.bindPopup(popupContent, {
      className: "crm-glass-leaflet-popup",
      closeButton: false,
      offset: [0, -10]
    });

    // Click handler: smooth flyTo + open detail panel
    marker.on("click", () => {
      if (crmMapInstance) {
        crmMapInstance.flyTo([v.lat, v.lng], Math.max(crmMapInstance.getZoom(), 12), {
          duration: 0.9,
          easeLinearity: 0.25
        });
      }
      selectCrmVillage(v);
    });

    marker.addTo(crmMarkersLayer);
    markerList.push(marker);
  });

  // ── Fit map bounds so all visible markers are in view ─────────────────────
  if (markerList.length > 0) {
    const group = L.featureGroup(markerList);
    crmMapInstance.fitBounds(group.getBounds(), { padding: [40, 40] });
  }

  // Apply initial tooltip visibility based on current zoom
  setTimeout(updateTooltipVisibility, 100);
}

/**
 * Displays and populates the detail panel with chosen village metrics.
 */
function selectCrmVillage(village) {
  crmSelectedVillage = village;

  const panel = document.getElementById("crm-detail-panel");
  const content = document.getElementById("crm-panel-content");
  if (!panel || !content) return;

  // Populate data before showing (avoids flash of stale data)
  const nameEl = document.getElementById("crm-village-name");
  const badgeEl = document.getElementById("crm-village-badge");
  const popEl = document.getElementById("crm-val-population");
  const casesEl = document.getElementById("crm-val-cases");
  const waterEl = document.getElementById("crm-val-water");
  const contamEl = document.getElementById("crm-val-contaminated");
  const riskScoreEl = document.getElementById("crm-val-risk-score");
  const riskFillEl = document.getElementById("crm-risk-bar-fill");

  const lvl = (village.riskLevel || (village.riskScore >= 70 ? "High" : (village.riskScore >= 40 ? "Medium" : "Low"))).toUpperCase();

  if (nameEl) nameEl.textContent = village.name;
  if (badgeEl) {
    badgeEl.textContent = `${lvl} RISK`;
    badgeEl.className = `crm-risk-badge badge-${lvl.toLowerCase()}`;
  }

  if (popEl) popEl.textContent = Number(village.population).toLocaleString();
  if (casesEl) casesEl.textContent = village.activeCases;
  if (waterEl) waterEl.textContent = `${village.waterSources} total`;
  if (contamEl) contamEl.textContent = `${village.contaminatedSources} unsafe`;

  const score = Math.round(village.riskScore || 0);
  if (riskScoreEl) riskScoreEl.textContent = `${score}%`;
  if (riskFillEl) {
    riskFillEl.style.width = `${score}%`;
    riskFillEl.className = `crm-risk-bar-fill fill-${lvl.toLowerCase()}`;
  }

  // Show panel
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");

  // Hide hint line once user has clicked a marker
  const hint = document.getElementById("crm-map-hint");
  if (hint) hint.style.visibility = "hidden";

  // On mobile: pan so the marker lands in the upper half of the visible area,
  // leaving the bottom 40% free for the sheet.
  if (crmMapInstance && window.innerWidth <= 768) {
    const mapHeight = crmMapInstance.getSize().y;
    // Pan marker upward by ~25% of map height so it clears the sheet
    crmMapInstance.panBy([0, -(mapHeight * 0.25)], { animate: true, duration: 0.4 });
  }

  // Reflow the map so tiles fill correctly after panel appears
  setTimeout(() => {
    if (crmMapInstance) crmMapInstance.invalidateSize();
  }, 300);
}

/**
 * Closes the detail panel.
 */
function closeCrmDetailPanel() {
  crmSelectedVillage = null;
  const panel = document.getElementById("crm-detail-panel");

  if (panel) {
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
  }

  // Reflow map after panel slides away
  setTimeout(() => {
    if (crmMapInstance) crmMapInstance.invalidateSize();
  }, 280);
}

/**
 * Binds UI triggers: filter chips, reset view, panel close, Esc key, map click.
 */
function bindCrmControls() {
  // Filter chips
  const chips = document.querySelectorAll(".crm-chip");
  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      chips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      crmCurrentFilter = chip.dataset.filter || "ALL";
      renderCrmMarkers();
    });
  });

  // Reset view button — fly back to fit all villages
  const btnReset = document.getElementById("crm-btn-reset-view");
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      if (crmMapInstance && crmMarkersLayer) {
        const layers = [];
        crmMarkersLayer.eachLayer(l => layers.push(l));
        if (layers.length > 0) {
          const group = L.featureGroup(layers);
          crmMapInstance.flyToBounds(group.getBounds(), {
            padding: [40, 40],
            duration: 1.0
          });
        } else {
          crmMapInstance.flyTo(CRM_DEFAULT_CENTER, CRM_DEFAULT_ZOOM, { duration: 1.0 });
        }
      }
      closeCrmDetailPanel();
    });
  }

  // Panel close button (X)
  const btnClose = document.getElementById("crm-panel-close");
  if (btnClose) {
    btnClose.addEventListener("click", closeCrmDetailPanel);
  }

  // Close on Esc key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && crmSelectedVillage) {
      closeCrmDetailPanel();
    }
  });

  // Close when clicking an empty area of the map (not a marker)
  if (crmMapInstance) {
    crmMapInstance.on("click", (e) => {
      // Only close if the click was on the map background (not a marker)
      if (crmSelectedVillage && e.originalEvent.target.closest(".crm-div-icon-wrapper") === null) {
        closeCrmDetailPanel();
      }
    });
  }

  // "View Details" button inside panel
  const btnViewDetails = document.getElementById("crm-btn-view-details");
  if (btnViewDetails) {
    btnViewDetails.addEventListener("click", () => {
      if (!crmSelectedVillage) return;
      const vName = crmSelectedVillage.name;

      if (typeof showEarlyAlertToast === "function") {
        showEarlyAlertToast(`Navigating to surveillance details for ${vName}...`, "🔍");
      }

      // Switch to Community Health Surveillance tab
      if (typeof switchTab === "function") {
        switchTab("community-health");
      }
    });
  }
}

// Global initialization hook
document.addEventListener("DOMContentLoaded", () => {
  // Auto-init if risk-map is currently active on start
  if (window.location.hash === "#risk-map" || window.location.pathname.endsWith("/risk-map")) {
    initCommunityRiskMap();
  }
});
