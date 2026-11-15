/**
 * VitalWatch - Feature #12: Health Awareness (Awareness / Prevention Module)
 * Manages prevention guides, multilingual display, category filtering,
 * "Read More" glass modal with step-by-step guidance & copy feature,
 * and admin guide creation/editing without page reload.
 */

let awCurrentCategory = "all";
let awAllGuides = [];
let awActiveModalGuide = null;

/**
 * Check if the currently logged-in user has admin / clinician privileges
 */
function awIsUserAdmin() {
  try {
    if (typeof VitalApi !== "undefined" && typeof VitalApi.getUser === "function") {
      const user = VitalApi.getUser();
      if (user) {
        const role = (user.role || "").toUpperCase();
        if (["ADMIN", "DOCTOR", "DISTRICT_HEALTH_OFFICER"].includes(role) || user.isAdmin === true) {
          return true;
        }
      }
    }
  } catch {}
  return false;
}

/**
 * Get category metadata (accent classes, labels, default icons)
 */
function awGetCategoryMeta(category) {
  const c = (category || "other").toLowerCase().trim();
  switch (c) {
    case "water":
      return { label: "Water Safety", class: "aw-cat-water", icon: "💧" };
    case "disease":
      return { label: "Disease Prevention", class: "aw-cat-disease", icon: "🦠" };
    case "hygiene":
      return { label: "Hand Hygiene", class: "aw-cat-hygiene", icon: "🧼" };
    default:
      return { label: "General Health", class: "aw-cat-other", icon: "📌" };
  }
}

/**
 * Fetch awareness guides from backend
 */
async function awFetchGuides() {
  const grid = document.getElementById("aw-grid");
  const loading = document.getElementById("aw-loading-state");
  const errorBox = document.getElementById("aw-error-state");
  const emptyBox = document.getElementById("aw-empty-state");
  const addBtn = document.getElementById("aw-btn-add-guide");

  // Show / hide Admin Add Button based on user role
  if (addBtn) {
    addBtn.style.display = awIsUserAdmin() ? "inline-flex" : "none";
  }

  if (loading) loading.style.display = "flex";
  if (errorBox) errorBox.style.display = "none";
  if (emptyBox) emptyBox.style.display = "none";
  if (grid) grid.innerHTML = "";

  const lang = (typeof currentLang !== "undefined" ? currentLang : (localStorage.getItem("vitalwatch_lang") || "en"));
  let url = `/api/awareness?language=${encodeURIComponent(lang)}`;
  if (awCurrentCategory && awCurrentCategory !== "all") {
    url += `&category=${encodeURIComponent(awCurrentCategory)}`;
  }

  try {
    const headers = {};
    if (typeof VitalApi !== "undefined" && typeof VitalApi.getToken === "function") {
      const token = VitalApi.getToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);

    const data = await res.json();
    awAllGuides = Array.isArray(data) ? data : [];

    if (loading) loading.style.display = "none";

    if (awAllGuides.length === 0) {
      if (emptyBox) emptyBox.style.display = "flex";
    } else {
      awRenderCards(awAllGuides);
    }
  } catch (err) {
    console.error("[HealthAwareness] Error fetching guides:", err);
    if (loading) loading.style.display = "none";
    if (errorBox) errorBox.style.display = "flex";
  }
}

/**
 * Render cards into the awareness grid
 */
function awRenderCards(guides) {
  const grid = document.getElementById("aw-grid");
  if (!grid) return;

  const isAdmin = awIsUserAdmin();

  grid.innerHTML = guides.map((g, idx) => {
    const meta = awGetCategoryMeta(g.category);
    const icon = g.icon || meta.icon;
    const animDelay = (idx * 0.06).toFixed(2);

    return `
      <article class="aw-card ${meta.class}" style="animation-delay: ${animDelay}s;">
        <div class="aw-card-top">
          <div class="aw-icon-circle" aria-hidden="true">${icon}</div>
          <span class="aw-cat-badge">${meta.label}</span>
        </div>

        <div class="aw-card-body">
          <h3 class="aw-card-title">${awEscape(g.title)}</h3>
          <p class="aw-card-desc">${awEscape(g.description)}</p>
        </div>

        <div class="aw-card-footer">
          <button type="button" class="btn-primary aw-btn-read" onclick="awOpenReadModal(${g.id})">
            <span>📖</span> Read More
          </button>
          ${isAdmin ? `
            <button type="button" class="preset-btn aw-btn-edit" onclick="awOpenEditModal(${g.id})" title="Edit Guide">
              <span>✏️</span> Edit
            </button>
          ` : ""}
        </div>
      </article>
    `;
  }).join("");
}

/**
 * Open the "Read More" Modal showing detailed numbered steps
 */
function awOpenReadModal(guideId) {
  const guide = awAllGuides.find(g => g.id === guideId);
  if (!guide) return;

  awActiveModalGuide = guide;
  const meta = awGetCategoryMeta(guide.category);
  const icon = guide.icon || meta.icon;

  document.getElementById("aw-read-icon").textContent = icon;
  document.getElementById("aw-read-cat").textContent = meta.label;
  document.getElementById("aw-read-cat").className = `aw-cat-badge ${meta.class}`;
  document.getElementById("aw-read-title").textContent = guide.title;
  document.getElementById("aw-read-desc").textContent = guide.description;

  const stepsList = document.getElementById("aw-read-steps-list");
  if (stepsList) {
    const steps = (guide.steps && guide.steps.length > 0)
      ? guide.steps
      : guide.content.split("\n").map(s => s.trim()).filter(Boolean);

    stepsList.innerHTML = steps.map((step, idx) => `
      <li class="aw-step-item" style="animation-delay: ${(idx * 0.05).toFixed(2)}s;">
        <span class="aw-step-num">${idx + 1}</span>
        <div class="aw-step-text">${awEscape(step)}</div>
      </li>
    `).join("");
  }

  const copyBtn = document.getElementById("aw-read-copy-btn");
  if (copyBtn) {
    copyBtn.innerHTML = `<span>📋</span> Copy Text`;
    copyBtn.classList.remove("copied");
  }

  const modal = document.getElementById("aw-read-modal-backdrop");
  if (modal) modal.style.display = "flex";
}

/**
 * Close "Read More" Modal
 */
function awCloseReadModal() {
  const modal = document.getElementById("aw-read-modal-backdrop");
  if (modal) modal.style.display = "none";
  awActiveModalGuide = null;
}

/**
 * Copy guide content & steps to clipboard for workers to share
 */
function awCopyActiveGuide() {
  if (!awActiveModalGuide) return;
  const g = awActiveModalGuide;
  const steps = (g.steps && g.steps.length > 0)
    ? g.steps
    : g.content.split("\n").map(s => s.trim()).filter(Boolean);

  const formattedSteps = steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const shareText = `*${g.title}*\n${g.description}\n\n${formattedSteps}\n\n— Shared via VitalWatch`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareText).then(() => {
      awMarkCopySuccess();
    }).catch(() => {
      awFallbackCopy(shareText);
    });
  } else {
    awFallbackCopy(shareText);
  }
}

function awMarkCopySuccess() {
  const copyBtn = document.getElementById("aw-read-copy-btn");
  if (copyBtn) {
    copyBtn.innerHTML = `<span>✓</span> Copied!`;
    copyBtn.classList.add("copied");
    setTimeout(() => {
      copyBtn.innerHTML = `<span>📋</span> Copy Text`;
      copyBtn.classList.remove("copied");
    }, 2200);
  }
}

function awFallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand("copy");
    awMarkCopySuccess();
  } catch (e) {
    console.warn("Copy command failed:", e);
  }
  document.body.removeChild(ta);
}

/**
 * Open Admin Modal for Creating a New Guide
 */
function awOpenAddModal() {
  document.getElementById("aw-form-id").value = "";
  document.getElementById("aw-form-title").value = "";
  document.getElementById("aw-form-desc").value = "";
  document.getElementById("aw-form-cat").value = "water";
  document.getElementById("aw-form-lang").value = (typeof currentLang !== "undefined" ? currentLang : "en");
  document.getElementById("aw-form-icon").value = "💧";
  document.getElementById("aw-form-content").value = "";
  
  const errBox = document.getElementById("aw-form-error");
  if (errBox) errBox.style.display = "none";

  document.getElementById("aw-modal-form-title").textContent = "Add Prevention Guide";
  document.getElementById("aw-modal-submit-btn").textContent = "Save Guide";

  const modal = document.getElementById("aw-form-modal-backdrop");
  if (modal) modal.style.display = "flex";
}

/**
 * Open Admin Modal for Editing an Existing Guide
 */
function awOpenEditModal(guideId) {
  const guide = awAllGuides.find(g => g.id === guideId);
  if (!guide) return;

  document.getElementById("aw-form-id").value = guide.id;
  document.getElementById("aw-form-title").value = guide.title;
  document.getElementById("aw-form-desc").value = guide.description;
  document.getElementById("aw-form-cat").value = guide.category;
  document.getElementById("aw-form-lang").value = guide.language || "en";
  document.getElementById("aw-form-icon").value = guide.icon || "";
  document.getElementById("aw-form-content").value = guide.content;

  const errBox = document.getElementById("aw-form-error");
  if (errBox) errBox.style.display = "none";

  document.getElementById("aw-modal-form-title").textContent = "Edit Prevention Guide";
  document.getElementById("aw-modal-submit-btn").textContent = "Update Guide";

  const modal = document.getElementById("aw-form-modal-backdrop");
  if (modal) modal.style.display = "flex";
}

/**
 * Close Admin Form Modal
 */
function awCloseFormModal() {
  const modal = document.getElementById("aw-form-modal-backdrop");
  if (modal) modal.style.display = "none";
}

/**
 * Handle Admin Guide Form Submit (POST / PUT)
 */
async function awHandleFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("aw-form-id").value;
  const title = document.getElementById("aw-form-title").value.trim();
  const description = document.getElementById("aw-form-desc").value.trim();
  const category = document.getElementById("aw-form-cat").value;
  const language = document.getElementById("aw-form-lang").value;
  const icon = document.getElementById("aw-form-icon").value.trim();
  const content = document.getElementById("aw-form-content").value.trim();
  const errBox = document.getElementById("aw-form-error");
  const submitBtn = document.getElementById("aw-modal-submit-btn");

  if (!title || !description || !content) {
    if (errBox) {
      errBox.textContent = "Please fill in title, description, and steps content.";
      errBox.style.display = "block";
    }
    return;
  }

  const payload = { title, description, category, language, icon, content };
  const url = id ? `/api/awareness/${id}` : "/api/awareness";
  const method = id ? "PUT" : "POST";

  const headers = { "Content-Type": "application/json" };
  if (typeof VitalApi !== "undefined" && typeof VitalApi.getToken === "function") {
    const token = VitalApi.getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  headers["X-Admin-Role"] = "true"; // Fallback admin flag for demo convenience

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving...";
    }

    const res = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to save (Status ${res.status})`);
    }

    awCloseFormModal();
    awShowToast("Content saved ✓");
    await awFetchGuides();
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message || "Something went wrong while saving.";
      errBox.style.display = "block";
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = id ? "Update Guide" : "Save Guide";
    }
  }
}

/**
 * Toast Notification on Save
 */
function awShowToast(msg = "Content saved ✓") {
  const toast = document.getElementById("aw-toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = "block";
  toast.classList.remove("aw-toast-anim");
  void toast.offsetWidth; // trigger reflow
  toast.classList.add("aw-toast-anim");

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.display = "none";
  }, 2600);
}

/**
 * HTML Escaping helper
 */
function awEscape(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

/**
 * Initialise Awareness Module
 */
function initAwarenessView() {
  // Bind category filter chips
  document.querySelectorAll(".aw-cat-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".aw-cat-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      awCurrentCategory = chip.dataset.category || "all";
      awFetchGuides();
    });
  });

  // Admin Add Button
  const addBtn = document.getElementById("aw-btn-add-guide");
  if (addBtn) addBtn.addEventListener("click", awOpenAddModal);

  // Admin Form Modal controls
  const form = document.getElementById("aw-form");
  if (form) form.addEventListener("submit", awHandleFormSubmit);

  const formCloseBtn = document.getElementById("aw-modal-form-close");
  if (formCloseBtn) formCloseBtn.addEventListener("click", awCloseFormModal);

  const formCancelBtn = document.getElementById("aw-modal-cancel-btn");
  if (formCancelBtn) formCancelBtn.addEventListener("click", awCloseFormModal);

  // Read Modal controls
  const readCloseBtn = document.getElementById("aw-read-modal-close");
  if (readCloseBtn) readCloseBtn.addEventListener("click", awCloseReadModal);

  const readCloseBtn2 = document.getElementById("aw-read-close-btn");
  if (readCloseBtn2) readCloseBtn2.addEventListener("click", awCloseReadModal);

  const copyBtn = document.getElementById("aw-read-copy-btn");
  if (copyBtn) copyBtn.addEventListener("click", awCopyActiveGuide);

  // Close modals on backdrop click
  ["aw-read-modal-backdrop", "aw-form-modal-backdrop"].forEach(id => {
    const bd = document.getElementById(id);
    if (bd) {
      bd.addEventListener("click", (e) => {
        if (e.target === bd) {
          bd.style.display = "none";
        }
      });
    }
  });

  // Retry button
  const retryBtn = document.getElementById("aw-btn-retry");
  if (retryBtn) retryBtn.addEventListener("click", awFetchGuides);

  // Fetch initial guides
  awFetchGuides();

  // Listen to Language Change event from Feature #11
  window.addEventListener("languageChanged", () => {
    awFetchGuides();
  });
}

// Global hook for app navigation
window.initHealthAwarenessView = function() {
  awFetchGuides();
};

document.addEventListener("DOMContentLoaded", () => {
  initAwarenessView();
});
