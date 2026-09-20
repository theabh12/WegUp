/**
 * WegUp Main Application Controller
 * Handles view routing, event delegation, and UI rendering.
 */

import {
  initState,
  getState,
  getActiveGoal,
  setActiveGoal,
  addGoal,
  deleteGoal,
  saveState,
  logActivity,
  exportData,
  importData,
  resetAllData,
  setApiKey,
  getApiKey,
  dateKey,
  addDays,
  daysUntil,
  prettyDate,
  escapeHTML,
  uid
} from "./state.js";

import { testGeminiConnection, isLiveAIMode } from "./api.js";
import { PRESET_ROLES, generateRoadmap } from "./roadmap.js";
import { InterviewSession, INTERVIEW_TYPES } from "./interview.js";
import { analyzeResumeATS } from "./resume.js";
import { generateQuiz, recordQuizResult, POPULAR_TOPICS } from "./quiz.js";
import { askCareerCoach } from "./coach.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// App runtime states
let currentView = "dashboard";
let toastTimer = null;
let activeInterview = null;
let activeQuiz = null;
let coachConversation = [];

/**
 * Global Toast Notification
 */
export function showToast(message, duration = 3200) {
  clearTimeout(toastTimer);
  const toast = $("#toast");
  if (!toast) return;
  toast.innerHTML = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, duration);
}

/**
 * Initialize Application
 */
function init() {
  initState();
  const state = getState();

  // Setup Role Dropdown in Onboarding
  const roleSelect = $("#setup-career");
  if (roleSelect) {
    roleSelect.innerHTML = Object.entries(PRESET_ROLES)
      .map(([key, r]) => `<option value="${key}">${escapeHTML(r.name)}</option>`)
      .concat(`<option value="custom">Other / Custom Role...</option>`)
      .join("");
    roleSelect.value = "fullstack";
  }

  const deadlineInput = $("#setup-deadline");
  if (deadlineInput) {
    deadlineInput.min = dateKey();
    deadlineInput.value = addDays(dateKey(), 60);
  }

  setupEventListeners();

  if (state.profile && state.goals.length > 0) {
    showApp();
  } else {
    showOnboarding();
  }
}

/**
 * Setup DOM Event Listeners
 */
function setupEventListeners() {
  // Navigation
  $("#navigation")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (btn) navigateTo(btn.dataset.view);
  });

  // Goal Switcher
  $("#goal-select")?.addEventListener("change", (e) => {
    setActiveGoal(e.target.value);
    renderCurrentView();
  });

  // Add Goal Button
  $("#add-goal")?.addEventListener("click", () => {
    showOnboarding(true);
  });

  // Onboarding Role Change
  $("#setup-career")?.addEventListener("change", (e) => {
    const isCustom = e.target.value === "custom";
    const customField = $("#custom-career-field");
    if (customField) customField.hidden = !isCustom;
    const customInput = $("#setup-custom");
    if (customInput) customInput.required = isCustom;
  });

  // Onboarding Form Submit
  $("#setup-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#setup-form button[type='submit']");
    const err = $("#setup-error");
    if (err) err.textContent = "";

    const name = $("#setup-name").value.trim();
    const roleKey = $("#setup-career").value;
    const customRole = $("#setup-custom")?.value.trim();
    const level = $("#setup-level").value;
    const skills = $("#setup-skills").value.trim();
    const minutes = Number($("#setup-minutes").value);
    const deadline = $("#setup-deadline").value;
    const companyType = $("#setup-company")?.value || "Tech MNCs & High-Growth Startups";

    const apiKey = $("#setup-apikey")?.value.trim();
    if (apiKey) {
      setApiKey(apiKey);
    }

    if (!name) {
      if (err) err.textContent = "Please enter your name.";
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Architecting AI Roadmap...";
    }

    try {
      const state = getState();
      state.profile = {
        name,
        college: "Engineering College",
        year: "3rd Year"
      };

      const planResult = await generateRoadmap({
        roleKey,
        customRoleName: customRole,
        level,
        knownSkills: skills,
        dailyMinutes: minutes,
        targetDate: deadline,
        companyType
      });

      const roleName = roleKey === "custom" ? customRole : (PRESET_ROLES[roleKey]?.name || "Software Engineer");

      const newGoal = {
        id: uid(),
        roleKey,
        name: roleName,
        level,
        skills,
        minutes,
        deadline,
        companyType,
        summary: planResult.summary,
        tasks: planResult.tasks,
        createdAt: new Date().toISOString()
      };

      addGoal(newGoal);
      showToast("🚀 Your tailored AI roadmap has been generated!");
      showApp();
    } catch (error) {
      if (err) err.textContent = `Error generating roadmap: ${error.message}`;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Build my preparation path ↗";
      }
    }
  });

  // Global view delegated click/change events
  $("#content")?.addEventListener("click", handleContentClicks);
  $("#content")?.addEventListener("change", handleContentChanges);
  $("#content")?.addEventListener("submit", handleContentSubmits);

  // Status Badge in Topbar
  $("#ai-status-badge")?.addEventListener("click", () => {
    navigateTo("settings");
  });
}

function showOnboarding(allowCancel = false) {
  const cancelBtn = $("#cancel-goal");
  if (cancelBtn) cancelBtn.hidden = !allowCancel;
  $("#onboarding").hidden = false;
  $("#app").hidden = true;
  const nameInput = $("#setup-name");
  if (nameInput) {
    nameInput.value = getState().profile?.name || "";
    nameInput.focus();
  }
}

function showApp() {
  $("#onboarding").hidden = true;
  $("#app").hidden = false;
  updateTopBar();
  navigateTo(currentView);
}

function updateTopBar() {
  const goal = getActiveGoal();
  const state = getState();

  const todayLabel = $("#today-label");
  if (todayLabel) {
    todayLabel.textContent = new Date().toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "short"
    });
  }

  const goalSelect = $("#goal-select");
  if (goalSelect && state.goals.length) {
    goalSelect.innerHTML = state.goals
      .map((g) => `<option value="${g.id}" ${g.id === goal?.id ? "selected" : ""}>${escapeHTML(g.name)}</option>`)
      .join("");
  }

  const statusBadge = $("#ai-status-badge");
  if (statusBadge) {
    const isLive = isLiveAIMode();
    statusBadge.className = `mode-badge ${isLive ? "live" : "offline"}`;
    statusBadge.innerHTML = isLive
      ? `<span class="pulse-dot live"></span> Live AI (Gemini)`
      : `<span class="pulse-dot offline"></span> Offline Mode (Tap to configure API)`;
  }
}

function navigateTo(view) {
  currentView = view;

  // Update navigation styles
  $$(".nav-button").forEach((btn) => {
    const isActive = btn.dataset.view === view;
    btn.classList.toggle("active", isActive);
    if (isActive) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });

  updateTopBar();
  renderCurrentView();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderCurrentView() {
  const goal = getActiveGoal();
  const container = $("#content");
  if (!container) return;

  switch (currentView) {
    case "dashboard":
      container.innerHTML = renderDashboardView(goal);
      break;
    case "roadmap":
      container.innerHTML = renderRoadmapView(goal);
      break;
    case "interview":
      container.innerHTML = renderInterviewView(goal);
      break;
    case "resume":
      container.innerHTML = renderResumeView(goal);
      break;
    case "practice":
      container.innerHTML = renderPracticeView(goal);
      break;
    case "coach":
      container.innerHTML = renderCoachView(goal);
      break;
    case "history":
      container.innerHTML = renderHistoryView();
      break;
    case "settings":
      container.innerHTML = renderSettingsView(goal);
      break;
    default:
      container.innerHTML = renderDashboardView(goal);
  }
}

/* ==========================================================================
   VIEW RENDERERS
   ========================================================================== */

function renderDashboardView(goal) {
  if (!goal) {
    return `<div class="card"><p>No active career goal. Click "+ Add goal" to build one.</p></div>`;
  }

  const state = getState();
  const completed = goal.tasks.filter((t) => t.done);
  const pending = goal.tasks.filter((t) => !t.done);
  const percent = goal.tasks.length ? Math.round((completed.length / goal.tasks.length) * 100) : 0;
  const daysLeft = daysUntil(goal.deadline);
  const todayFocus = pending.slice(0, 3);
  const recentActivity = state.activity.slice(0, 4);

  return `
    <div class="page-heading">
      <div>
        <h1 id="view-title">Welcome back, ${escapeHTML(state.profile?.name || "Engineer")} 👋</h1>
        <p>Your personalized placement preparation command center.</p>
      </div>
      <div class="heading-badges">
        <span class="pill purple">${escapeHTML(goal.companyType || "Campus Placements")}</span>
        <span class="pill">${escapeHTML(goal.level.toUpperCase())}</span>
      </div>
    </div>

    <!-- Hero Card -->
    <section class="card hero">
      <div class="hero-left">
        <span class="eyebrow">ACTIVE PATHWAY</span>
        <h2>${escapeHTML(goal.name)}</h2>
        <p class="hero-desc">
          Targeting readiness in <strong>${daysLeft > 0 ? daysLeft : 0} days</strong> (${prettyDate(goal.deadline)}) with a commitment of <strong>${goal.minutes} mins/day</strong>.
        </p>
        <div class="hero-actions">
          <button class="button primary" data-navigate="roadmap">Continue AI Roadmap ↗</button>
          <button class="button secondary" data-navigate="interview">🎙️ Start Mock Interview</button>
          <button class="button ghost" data-navigate="resume">📄 Scan Resume</button>
        </div>
      </div>
      <div class="progress-ring" style="--progress: ${percent}%" role="img" aria-label="${percent}% complete">
        <div><strong>${percent}%</strong><span>Completed</span></div>
      </div>
    </section>

    <!-- Stats Grid -->
    <div class="stats-grid">
      <div class="card stat-card">
        <p>Completed Tasks</p>
        <span class="stat-value">${completed.length} / ${goal.tasks.length}</span>
        <small>${percent}% total roadmap progress</small>
      </div>
      <div class="card stat-card">
        <p>Mock Interviews</p>
        <span class="stat-value">${state.interviews?.length || 0}</span>
        <small>Simulated Placement Sessions</small>
      </div>
      <div class="card stat-card">
        <p>Quiz Practice</p>
        <span class="stat-value">${state.quizAttempts?.length || 0}</span>
        <small>Assessed Question Sets</small>
      </div>
      <div class="card stat-card">
        <p>Days to Target</p>
        <span class="stat-value">${daysLeft < 0 ? "Due" : daysLeft + "d"}</span>
        <small>Target: ${prettyDate(goal.deadline)}</small>
      </div>
    </div>

    <!-- Two Column: Today's Tasks & Quick Launch -->
    <div class="two-column">
      <section class="card">
        <div class="card-heading">
          <h2>🎯 Today's Recommended Focus</h2>
          <span class="pill">${todayFocus.reduce((s, t) => s + t.minutes, 0)} min total</span>
        </div>
        <p class="small">High-priority items queued from your AI learning plan.</p>

        <div class="task-list">
          ${todayFocus.length
            ? todayFocus.map((t) => renderTaskItem(t)).join("")
            : `<p class="muted">All scheduled tasks completed! Add more from the Roadmap tab.</p>`}
        </div>
      </section>

      <div class="stack">
        <!-- Quick AI Pillars -->
        <section class="card feature-spotlight">
          <div class="card-heading">
            <h2>⚡ AI Placement Suite</h2>
            <span class="pill purple">${isLiveAIMode() ? "Gemini Live" : "Offline Ready"}</span>
          </div>
          <div class="feature-links">
            <button class="feature-button" data-navigate="interview">
              <span class="feature-icon">🎙️</span>
              <div>
                <strong>AI Mock Interview</strong>
                <p>Simulate technical & HR rounds with live scoring</p>
              </div>
            </button>
            <button class="feature-button" data-navigate="resume">
              <span class="feature-icon">📄</span>
              <div>
                <strong>ATS Resume Matcher</strong>
                <p>Analyze resume keyword fit & rewrite bullets</p>
              </div>
            </button>
            <button class="feature-button" data-navigate="practice">
              <span class="feature-icon">🧠</span>
              <div>
                <strong>Adaptive Quiz Engine</strong>
                <p>Generate on-demand placement questions</p>
              </div>
            </button>
          </div>
        </section>

        <!-- Recent Activity -->
        <section class="card">
          <div class="card-heading"><h2>🕒 Recent Momentum</h2></div>
          <div class="activity-feed">
            ${recentActivity.map((a) => `
              <div class="history-item">
                <p>${escapeHTML(a.text)}</p>
                <span class="small">${new Date(a.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            `).join("") || `<p class="small">Activity will log here as you make progress.</p>`}
          </div>
        </section>
      </div>
    </div>
  `;
}

function renderRoadmapView(goal) {
  if (!goal) return `<div class="card"><p>No active goal selected.</p></div>`;

  const phases = [...new Set(goal.tasks.map((t) => t.phase))];

  return `
    <div class="page-heading">
      <div>
        <h1 id="view-title">Dynamic AI Career Pathway</h1>
        <p>Curated specifically for <strong>${escapeHTML(goal.name)}</strong> (${escapeHTML(goal.companyType)})</p>
      </div>
      <button class="button primary compact" data-action="regen-roadmap">⚡ Regenerate Plan</button>
    </div>

    ${goal.summary ? `
      <div class="notice">
        <strong>Strategic Blueprint:</strong> ${escapeHTML(goal.summary)}
      </div>
    ` : ""}

    <div class="two-column">
      <div class="phases-container">
        ${phases.map((phaseName, idx) => {
          const phaseTasks = goal.tasks.filter((t) => t.phase === phaseName);
          const doneCount = phaseTasks.filter((t) => t.done).length;
          const pct = phaseTasks.length ? Math.round((doneCount / phaseTasks.length) * 100) : 0;

          return `
            <details class="card phase" ${doneCount < phaseTasks.length ? "open" : ""}>
              <summary>
                <span class="phase-number">${idx + 1}</span>
                <span class="phase-name">${escapeHTML(phaseName)}</span>
                <span class="pill">${doneCount}/${phaseTasks.length}</span>
              </summary>
              <div class="progress-track" role="img" aria-label="${pct}% complete">
                <div class="progress-fill" style="width: ${pct}%"></div>
              </div>
              <div class="task-list">
                ${phaseTasks.map((t) => renderTaskItem(t, true)).join("")}
              </div>
            </details>
          `;
        }).join("")}
      </div>

      <!-- Add Custom Task Form -->
      <section class="card">
        <h2>+ Add Custom Milestone</h2>
        <p class="small">Add a targeted session to your learning pathway.</p>
        <form id="add-task-form" class="task-form">
          <label>
            Task Title
            <input name="title" placeholder="e.g. Implement JWT Refresh Token Rotation" required maxlength="150" />
          </label>
          <label>
            Phase
            <select name="phase">
              ${phases.map((p) => `<option value="${escapeHTML(p)}">${escapeHTML(p)}</option>`).join("")}
            </select>
          </label>
          <div class="form-row">
            <label>
              Estimated Time
              <select name="minutes">
                <option value="15">15 min</option>
                <option value="30" selected>30 min</option>
                <option value="45">45 min</option>
                <option value="60">1 hour</option>
              </select>
            </label>
            <label>
              Type
              <select name="type">
                <option value="concept">Concept / Theory</option>
                <option value="exercise">Hands-on Lab</option>
                <option value="project">Project Work</option>
                <option value="interview">Interview Practice</option>
              </select>
            </label>
          </div>
          <button class="button primary" type="submit">+ Insert Task</button>
        </form>
      </section>
    </div>
  `;
}

function renderTaskItem(task, editable = false) {
  return `
    <div class="task ${task.done ? "completed" : ""}">
      <label>
        <input type="checkbox" data-task-id="${escapeHTML(task.id)}" ${task.done ? "checked" : ""} />
        <span>
          <span class="task-title">${escapeHTML(task.title)}</span>
          <span class="task-meta">
            ${task.type ? `<span class="pill tiny">${escapeHTML(task.type)}</span>` : ""}
            ${task.minutes}m · ${escapeHTML(task.phase || "")}
          </span>
        </span>
      </label>
      ${editable ? `
        <button class="icon-button" data-delete-task="${escapeHTML(task.id)}" aria-label="Delete task" title="Delete">×</button>
      ` : ""}
    </div>
  `;
}

/* ==========================================================================
   AI MOCK INTERVIEW VIEW
   ========================================================================== */

function renderInterviewView(goal) {
  const state = getState();
  const pastSessions = state.interviews || [];

  if (activeInterview) {
    return renderActiveInterviewRoom(activeInterview);
  }

  return `
    <div class="page-heading">
      <div>
        <h1 id="view-title">🎙️ AI Mock Interview Simulator</h1>
        <p>Interactive placement interview rounds with real-time coaching & scoring.</p>
      </div>
      <span class="pill purple">${isLiveAIMode() ? "Gemini Multiturn Engine" : "Offline Simulator"}</span>
    </div>

    <div class="two-column">
      <!-- Config Card -->
      <section class="card">
        <h2>Start New Mock Interview</h2>
        <p class="small">Choose your interview focus to begin realistic round simulations.</p>

        <form id="start-interview-form" class="interview-setup-form">
          <label>
            Target Engineering Role
            <input name="role" value="${escapeHTML(goal ? goal.name : "Full Stack Engineer")}" required />
          </label>

          <label>
            Interview Round Type
            <select name="type">
              ${INTERVIEW_TYPES.map((t) => `
                <option value="${t.id}">${t.name} — ${t.desc}</option>
              `).join("")}
            </select>
          </label>

          <label>
            Difficulty Level
            <select name="difficulty">
              <option value="Fresher (Campus Tier 1/2)">Fresher (Campus Placements / Entry Level)</option>
              <option value="Intermediate (SDE-1)">Intermediate (Product Startup / SDE-1)</option>
              <option value="Challenging (FAANG/MNC)">Challenging (FAANG / Big Tech Rounds)</option>
            </select>
          </label>

          <button class="button primary" type="submit">Begin Interview Session ↗</button>
        </form>
      </section>

      <!-- History Card -->
      <section class="card">
        <h2>Recent Interview Scorecards</h2>
        <div class="history-list">
          ${pastSessions.length ? pastSessions.slice(0, 4).map((s) => `
            <div class="scorecard-snippet">
              <div class="scorecard-header">
                <strong>${escapeHTML(s.role)} (${escapeHTML(s.type)})</strong>
                <span class="badge score-${s.scorecard.overallScore >= 75 ? "good" : "avg"}">
                  ${s.scorecard.overallScore}/100
                </span>
              </div>
              <p class="small">${escapeHTML(s.scorecard.summary)}</p>
              <small class="muted">${prettyDate(s.date.split("T")[0])}</small>
            </div>
          `).join("") : `<p class="muted">No mock interviews completed yet. Launch your first round above!</p>`}
        </div>
      </section>
    </div>
  `;
}

function renderActiveInterviewRoom(session) {
  return `
    <div class="page-heading">
      <div>
        <h1 id="view-title">Live Interview: ${escapeHTML(session.role)}</h1>
        <p>Round: <strong>${escapeHTML(session.type.toUpperCase())}</strong> · Question ${Math.min(session.totalSteps, session.currentStep + 1)} of ${session.totalSteps}</p>
      </div>
      <button class="button danger compact" data-action="end-interview">Quit Session</button>
    </div>

    <section class="card chat-container">
      <div class="chat-log" id="interview-chat-log" role="log" aria-live="polite">
        ${session.messages.map((m) => `
          <div class="message ${m.role === "candidate" ? "user" : "coach"}">
            <strong>${m.role === "candidate" ? "You (Candidate)" : "Interviewer"}</strong>
            <p>${escapeHTML(m.text).replace(/\n/g, "<br />")}</p>
          </div>
        `).join("")}
      </div>

      ${session.completed && session.scorecard ? `
        <div class="scorecard-modal card">
          <div class="scorecard-top">
            <div>
              <span class="eyebrow">INTERVIEW EVALUATION REPORT</span>
              <h2>Overall Placement Score: ${session.scorecard.overallScore}/100</h2>
            </div>
            <span class="stat-value">${session.scorecard.overallScore}%</span>
          </div>

          <p class="scorecard-summary">${escapeHTML(session.scorecard.summary)}</p>

          <div class="scorecard-columns">
            <div class="card-inner">
              <h3>✅ Core Strengths</h3>
              <ul>${session.scorecard.strengths.map((s) => `<li>${escapeHTML(s)}</li>`).join("")}</ul>
            </div>
            <div class="card-inner">
              <h3>⚠️ Improvement Focus</h3>
              <ul>${session.scorecard.improvements.map((i) => `<li>${escapeHTML(i)}</li>`).join("")}</ul>
            </div>
          </div>

          <div class="pro-tip-box">
            <strong>💡 Placement Pro-Tip:</strong> ${escapeHTML(session.scorecard.proTip)}
          </div>

          <button class="button primary" data-action="close-interview">Back to Interview Hub</button>
        </div>
      ` : `
        <form id="interview-reply-form" class="chat-form">
          <textarea
            id="interview-input"
            name="answer"
            rows="3"
            placeholder="Type your structured answer here (e.g. explain your technical rationale, time complexity, or STAR situation)..."
            required
          ></textarea>
          <button class="button primary" type="submit">Submit Answer ↗</button>
        </form>
      `}
    </section>
  `;
}

/* ==========================================================================
   AI RESUME & ATS SCANNER VIEW
   ========================================================================== */

function renderResumeView(goal) {
  const state = getState();
  const defaultRole = goal ? goal.name : "Software Engineer";

  return `
    <div class="page-heading">
      <div>
        <h1 id="view-title">📄 AI Resume & ATS Scanner</h1>
        <p>Audit keyword density, compute ATS match score, and optimize bullet points using the Google XYZ formula.</p>
      </div>
      <span class="pill purple">${isLiveAIMode() ? "Gemini ATS Engine" : "Smart Heuristic ATS"}</span>
    </div>

    <div class="two-column">
      <!-- Input Card -->
      <section class="card">
        <h2>Paste Resume & Target Role</h2>
        <form id="resume-scan-form">
          <label>
            Target Job Title
            <input name="targetRole" value="${escapeHTML(defaultRole)}" required />
          </label>

          <label>
            Job Description (Optional, but recommended)
            <textarea name="jobDescription" rows="4" placeholder="Paste requirements or skills from the company's job posting..."></textarea>
          </label>

          <label>
            Resume Text (Paste from Word / PDF / Markdown)
            <textarea name="resumeText" rows="9" placeholder="Paste your resume content here (experience, skills, projects, achievements)..." required></textarea>
          </label>

          <button class="button primary" type="submit" id="btn-scan-resume">Analyze with ATS Engine ↗</button>
        </form>
      </section>

      <!-- Output / Results Container -->
      <div id="resume-results-container">
        <section class="card empty-state">
          <div class="empty-icon">📄</div>
          <h3>Awaiting Resume Input</h3>
          <p class="small">Paste your resume and click Analyze to receive keyword match scores, missing technologies, and STAR bullet point rewrites.</p>
        </section>
      </div>
    </div>
  `;
}

/* ==========================================================================
   ADAPTIVE PRACTICE & QUIZ VIEW
   ========================================================================== */

function renderPracticeView(goal) {
  const state = getState();
  const attempts = state.quizAttempts || [];

  return `
    <div class="page-heading">
      <div>
        <h1 id="view-title">🧠 Adaptive Technical Quiz Engine</h1>
        <p>Unlimited placement practice questions across Data Structures, SQL, Web Dev & Core CS.</p>
      </div>
      <span class="pill purple">${isLiveAIMode() ? "Dynamic Gemini Questions" : "Curated Topic Bank"}</span>
    </div>

    <div class="two-column">
      <!-- Config & Generator -->
      <section class="card">
        <h2>Generate Placement Quiz</h2>
        <form id="quiz-gen-form">
          <label>
            Technical Subject / Topic
            <select name="topic" id="quiz-topic-select">
              ${POPULAR_TOPICS.map((t) => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join("")}
              <option value="custom">Enter Custom Topic...</option>
            </select>
          </label>

          <label id="custom-topic-field" hidden>
            Custom Topic Name
            <input name="customTopic" placeholder="e.g. Microservices & Kafka" />
          </label>

          <div class="form-row">
            <label>
              Difficulty
              <select name="difficulty">
                <option value="Beginner">Foundational</option>
                <option value="Intermediate" selected>Standard Campus Placement</option>
                <option value="Advanced">Advanced / SDE-1</option>
              </select>
            </label>
            <label>
              Question Count
              <select name="count">
                <option value="3">3 Questions (Sprint)</option>
                <option value="4" selected>4 Questions (Standard)</option>
              </select>
            </label>
          </div>

          <button class="button primary" type="submit" id="btn-generate-quiz">Generate Quiz ↗</button>
        </form>
      </section>

      <!-- Active Quiz Area -->
      <div id="quiz-active-area">
        ${activeQuiz ? renderActiveQuiz(activeQuiz) : `
          <section class="card">
            <h2>Recent Assessment Performance</h2>
            <div class="quiz-history">
              ${attempts.length ? attempts.slice(0, 4).map((a) => `
                <div class="history-item">
                  <div>
                    <strong>${escapeHTML(a.topic)}</strong>
                    <p class="small">${a.correct} of ${a.total} correct</p>
                  </div>
                  <span class="pill ${a.percentage >= 75 ? "green" : "purple"}">${a.percentage}%</span>
                </div>
              `).join("") : `<p class="muted">No quizzes completed yet. Choose a topic above to practice!</p>`}
            </div>
          </section>
        `}
      </div>
    </div>
  `;
}

function renderActiveQuiz(quiz) {
  const currentQ = quiz.questions[quiz.currentIndex];
  const isAnswered = quiz.answers[quiz.currentIndex] !== undefined;

  return `
    <section class="card quiz-card">
      <div class="card-heading">
        <span class="pill purple">${escapeHTML(quiz.topic)} · Q${quiz.currentIndex + 1} of ${quiz.questions.length}</span>
        <span class="small">Score: ${quiz.score}/${quiz.questions.length}</span>
      </div>

      <h2 class="quiz-question-text">${escapeHTML(currentQ.text)}</h2>

      <div class="options">
        ${currentQ.options.map((opt, idx) => {
          let extraClass = "";
          if (isAnswered) {
            if (idx === currentQ.answer) extraClass = "correct";
            else if (idx === quiz.answers[quiz.currentIndex]) extraClass = "wrong";
          }
          return `
            <button
              class="option ${extraClass}"
              data-quiz-answer="${idx}"
              ${isAnswered ? "disabled" : ""}
            >
              ${escapeHTML(opt)}
            </button>
          `;
        }).join("")}
      </div>

      ${isAnswered ? `
        <div class="answer-feedback">
          <strong>${quiz.answers[quiz.currentIndex] === currentQ.answer ? "✅ Correct!" : "❌ Incorrect"}</strong>
          <p>${escapeHTML(currentQ.explanation)}</p>
          ${quiz.currentIndex < quiz.questions.length - 1 ? `
            <button class="button primary compact" data-action="next-quiz-q">Next Question →</button>
          ` : `
            <button class="button primary compact" data-action="finish-quiz">Finish Assessment ✓</button>
          `}
        </div>
      ` : ""}
    </section>
  `;
}

/* ==========================================================================
   AI CAREER COACH VIEW
   ========================================================================== */

function renderCoachView(goal) {
  const state = getState();
  const studentName = state.profile?.name || "there";

  return `
    <div class="page-heading">
      <div>
        <h1 id="view-title">✦ AI Placement & Career Mentor</h1>
        <p>Personalized, context-aware engineering advice tailored to your roadmap.</p>
      </div>
      <span class="pill purple">${isLiveAIMode() ? "Gemini AI" : "Local Mentor"}</span>
    </div>

    <section class="card chat-container">
      <div class="chat-log" id="coach-chat-log" role="log">
        ${coachConversation.length ? coachConversation.map((m) => `
          <div class="message ${m.role === "user" ? "user" : "coach"}">
            <strong>${m.role === "user" ? "You" : "WegUp AI Coach"}</strong>
            <p>${escapeHTML(m.text).replace(/\n/g, "<br />")}</p>
          </div>
        `).join("") : `
          <div class="message coach">
            <strong>WegUp AI Coach</strong>
            <p>Hey ${escapeHTML(studentName)}! I'm your dedicated career coach for <strong>${escapeHTML(goal ? goal.name : "Software Engineering")}</strong>.<br /><br />
            Ask me anything about interview strategy, project architecture, explaining technical challenges, or what to focus on today!</p>
          </div>
        `}
      </div>

      <!-- Quick prompts -->
      <div class="suggestion-row">
        <button class="button ghost compact" data-prompt="What should I focus on studying today?">What to study today?</button>
        <button class="button ghost compact" data-prompt="How do I explain my project using STAR method?">STAR Project Pitch</button>
        <button class="button ghost compact" data-prompt="Give me a cold outreach message for recruiters on LinkedIn">LinkedIn Outreach</button>
        <button class="button ghost compact" data-prompt="How to answer: Tell me about a time you had a technical disagreement?">Conflict Resolution</button>
      </div>

      <form id="coach-chat-form" class="chat-form">
        <input
          id="coach-input"
          name="message"
          placeholder="Ask your career coach about interviews, roadmaps, or projects..."
          required
        />
        <button class="button primary" type="submit">Ask ↗</button>
      </form>
    </section>
  `;
}

/* ==========================================================================
   HISTORY & ACTIVITY VIEW
   ========================================================================== */

function renderHistoryView() {
  const state = getState();
  const activity = state.activity || [];

  return `
    <div class="page-heading">
      <div>
        <h1 id="view-title">🕒 Activity & Momentum History</h1>
        <p>Audit trail of all roadmap progress, practice tests, and simulated interviews.</p>
      </div>
      <button class="button ghost compact" data-action="export-json">Export History (JSON)</button>
    </div>

    <section class="card">
      <div class="history-list">
        ${activity.length ? activity.map((item) => `
          <div class="history-item">
            <div>
              <p>${escapeHTML(item.text)}</p>
              <small class="muted">${new Date(item.time).toLocaleString("en-IN")}</small>
            </div>
            <span class="pill tiny">${escapeHTML(item.type || "log")}</span>
          </div>
        `).join("") : `<p class="muted">No activity logged yet.</p>`}
      </div>
    </section>
  `;
}

/* ==========================================================================
   SETTINGS & PROFILE VIEW (WITH GEMINI API KEY CONFIG)
   ========================================================================== */

function renderSettingsView(goal) {
  const state = getState();
  const hasKey = Boolean(state.apiKey);

  return `
    <div class="page-heading">
      <div>
        <h1 id="view-title">⚙️ Settings & System Configuration</h1>
        <p>Configure Google Gemini API, update career targets, and manage persistent storage.</p>
      </div>
      <span class="pill ${hasKey ? "green" : "purple"}">${hasKey ? "AI Connected" : "Local Mode"}</span>
    </div>

    <div class="two-column">
      <!-- Gemini API Integration Setup -->
      <section class="card api-config-card">
        <div class="card-heading">
          <h2>Google Gemini AI Configuration</h2>
          <span class="pill ${hasKey ? "green" : "purple"}">${hasKey ? "Configured" : "Not Set"}</span>
        </div>
        <p class="small">
          Empower WegUp with real Google Gemini models for live dynamic roadmaps, resume analysis, and realistic interview dialogs.
        </p>

        <form id="api-key-form">
          <label>
            Gemini API Key
            <div class="api-key-input-wrapper">
              <input
                id="api-key-input"
                name="apiKey"
                type="password"
                value="${escapeHTML(state.apiKey || "")}"
                placeholder="AIzaSy..."
              />
              <button type="button" class="button ghost compact" id="toggle-key-visibility">Show</button>
            </div>
          </label>

          <label>
            Preferred Model
            <select name="model" id="api-model-select">
              <option value="gemini-2.0-flash" ${state.model === "gemini-2.0-flash" || !state.model ? "selected" : ""}>Gemini 2.0 Flash (Recommended & Fast)</option>
              <option value="gemini-2.5-flash" ${state.model === "gemini-2.5-flash" ? "selected" : ""}>Gemini 2.5 Flash (Hybrid Reasoning)</option>
              <option value="gemini-2.5-flash-lite" ${state.model === "gemini-2.5-flash-lite" ? "selected" : ""}>Gemini 2.5 Flash-Lite (Low Latency)</option>
              <option value="gemini-1.5-flash-latest" ${state.model === "gemini-1.5-flash-latest" || state.model === "gemini-1.5-flash" ? "selected" : ""}>Gemini 1.5 Flash (Latest)</option>
            </select>
          </label>

          <div class="api-buttons-row">
            <button class="button primary compact" type="submit">Save Settings</button>
            <button class="button secondary compact" type="button" id="btn-test-gemini">Test Live Connection ⚡</button>
          </div>
          <p id="api-test-status" class="small field-note"></p>
        </form>

        <div class="api-guide-box">
          <strong>How to get a free API Key:</strong>
          <ol class="small">
            <li>Visit <a href="https://aistudio.google.com/" target="_blank" rel="noopener">Google AI Studio</a>.</li>
            <li>Click <strong>"Get API Key"</strong> $\rightarrow$ Create new key.</li>
            <li>Paste it here and click Save.</li>
          </ol>
        </div>
      </section>

      <!-- Profile & Data Controls -->
      <div class="stack">
        <section class="card">
          <h2>Student Profile</h2>
          <form id="profile-form">
            <label>
              Full Name
              <input name="name" value="${escapeHTML(state.profile?.name || "")}" required />
            </label>
            <label>
              Daily Study Target (Minutes)
              <input name="minutes" type="number" min="15" max="360" value="${goal ? goal.minutes : 60}" required />
            </label>
            <label>
              Placement Target Date
              <input name="deadline" type="date" value="${goal ? goal.deadline : dateKey()}" required />
            </label>
            <button class="button primary compact" type="submit">Update Profile</button>
          </form>
        </section>

        <section class="card">
          <h2>Data Portability & Reset</h2>
          <p class="small">All data is stored directly in your browser's local sandbox.</p>
          <div class="button-row">
            <button class="button compact" data-action="export-json">Export Backup ↓</button>
            <button class="button danger compact" data-action="reset-data">Reset All Data ⚠</button>
          </div>
        </section>
      </div>
    </div>
  `;
}

/* ==========================================================================
   EVENT HANDLERS
   ========================================================================== */

function handleContentClicks(e) {
  const btn = e.target.closest("button");
  if (!btn) return;

  // View Navigation Links
  if (btn.dataset.navigate) {
    navigateTo(btn.dataset.navigate);
    return;
  }

  // Task Completion Checkbox Click
  if (btn.dataset.deleteTask) {
    const taskId = btn.dataset.deleteTask;
    const goal = getActiveGoal();
    if (goal) {
      goal.tasks = goal.tasks.filter((t) => t.id !== taskId);
      saveState();
      renderCurrentView();
      showToast("Task deleted.");
    }
    return;
  }

  // Interview actions
  if (btn.dataset.action === "end-interview" || btn.dataset.action === "close-interview") {
    activeInterview = null;
    renderCurrentView();
    return;
  }

  // Quiz Options Click
  if (btn.hasAttribute("data-quiz-answer") && activeQuiz) {
    const selectedIdx = Number(btn.dataset.quizAnswer);
    const currQ = activeQuiz.questions[activeQuiz.currentIndex];
    activeQuiz.answers[activeQuiz.currentIndex] = selectedIdx;
    if (selectedIdx === currQ.answer) {
      activeQuiz.score += 1;
    }
    renderCurrentView();
    return;
  }

  if (btn.dataset.action === "next-quiz-q" && activeQuiz) {
    activeQuiz.currentIndex += 1;
    renderCurrentView();
    return;
  }

  if (btn.dataset.action === "finish-quiz" && activeQuiz) {
    recordQuizResult(activeQuiz.topic, activeQuiz.score, activeQuiz.questions.length);
    showToast(`Quiz completed! You scored ${activeQuiz.score}/${activeQuiz.questions.length}`);
    activeQuiz = null;
    renderCurrentView();
    return;
  }

  // Coach suggestion chip click
  if (btn.dataset.prompt) {
    const promptText = btn.dataset.prompt;
    handleCoachMessage(promptText);
    return;
  }

  // Regenerate Roadmap
  if (btn.dataset.action === "regen-roadmap") {
    if (confirm("Regenerate roadmap with AI? Completed custom tasks will be replaced.")) {
      showOnboarding(true);
    }
    return;
  }

  // Toggle API Key visibility
  if (btn.id === "toggle-key-visibility") {
    const input = $("#api-key-input");
    if (input) {
      input.type = input.type === "password" ? "text" : "password";
      btn.textContent = input.type === "password" ? "Show" : "Hide";
    }
    return;
  }

  // Test Gemini Connection Button
  if (btn.id === "btn-test-gemini") {
    const input = $("#api-key-input");
    const statusEl = $("#api-test-status");
    const key = input ? input.value.trim() : "";
    if (!key) {
      if (statusEl) statusEl.innerHTML = `<span style="color:#ff7575">Please enter an API key first.</span>`;
      return;
    }
    btn.disabled = true;
    btn.textContent = "Connecting...";
    const modelSelect = $("#api-model-select");
    const chosenModel = modelSelect ? modelSelect.value : (getState().model || "gemini-2.0-flash");
    if (statusEl) statusEl.textContent = `Pinging Google Gemini API (${chosenModel})...`;

    testGeminiConnection(key, chosenModel)
      .then((res) => {
        if (res.ok) {
          const activeModel = res.model || chosenModel;
          setApiKey(key, activeModel);
          if (modelSelect && res.model) {
            modelSelect.value = res.model;
          }
          if (statusEl) {
            statusEl.innerHTML = `<span style="color:#75ffaa">✓ Connection Verified! Google Gemini model <strong>${escapeHTML(activeModel)}</strong> responded successfully.</span>`;
          }
          updateTopBar();
        } else {
          if (statusEl) statusEl.innerHTML = `<span style="color:#ff7575">✗ Connection failed: ${escapeHTML(res.error)}</span>`;
        }
      })
      .finally(() => {
        btn.disabled = false;
        btn.textContent = "Test Live Connection ⚡";
      });
    return;
  }

  // Export JSON
  if (btn.dataset.action === "export-json") {
    exportData();
    showToast("Data exported successfully.");
    return;
  }

  // Reset Data
  if (btn.dataset.action === "reset-data") {
    if (confirm("Are you sure you want to reset all data in this browser? This cannot be undone.")) {
      resetAllData();
      showToast("All data cleared.");
      showOnboarding();
    }
    return;
  }
}

function handleContentChanges(e) {
  // Task toggle checkbox
  if (e.target.dataset.taskId) {
    const taskId = e.target.dataset.taskId;
    const goal = getActiveGoal();
    if (goal) {
      const task = goal.tasks.find((t) => t.id === taskId);
      if (task) {
        task.done = e.target.checked;
        task.completedAt = task.done ? new Date().toISOString() : null;
        logActivity(`${task.done ? "Completed" : "Reopened"}: ${task.title}`);
        saveState();
        renderCurrentView();
        showToast(task.done ? "✓ Milestone marked complete!" : "Milestone pending.");
      }
    }
  }

  // Quiz topic select custom toggle
  if (e.target.id === "quiz-topic-select") {
    const isCustom = e.target.value === "custom";
    const customField = $("#custom-topic-field");
    if (customField) customField.hidden = !isCustom;
  }
}

async function handleContentSubmits(e) {
  e.preventDefault();
  const form = e.target;
  const goal = getActiveGoal();

  // Add Custom Task Form
  if (form.id === "add-task-form") {
    const data = new FormData(form);
    const title = data.get("title").trim();
    const phase = data.get("phase");
    const minutes = Number(data.get("minutes"));
    const type = data.get("type");

    if (goal) {
      goal.tasks.push({
        id: uid(),
        title,
        phase,
        minutes,
        type,
        scheduled: dateKey(),
        done: false,
        completedAt: null
      });
      saveState();
      renderCurrentView();
      showToast("Task added to learning pathway.");
    }
    return;
  }

  // Start Interview Form
  if (form.id === "start-interview-form") {
    const data = new FormData(form);
    const role = data.get("role").trim();
    const type = data.get("type");
    const difficulty = data.get("difficulty");

    const session = new InterviewSession(type, role, difficulty);
    activeInterview = session;
    renderCurrentView();

    await session.start();
    renderCurrentView();
    return;
  }

  // Interview Reply Form
  if (form.id === "interview-reply-form") {
    const input = $("#interview-input");
    const answer = input ? input.value.trim() : "";
    if (!answer || !activeInterview) return;

    const btn = form.querySelector("button[type='submit']");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Analyzing Response...";
    }

    await activeInterview.submitAnswer(answer);
    renderCurrentView();

    const log = $("#interview-chat-log");
    if (log) log.scrollTop = log.scrollHeight;
    return;
  }

  // Resume Scan Form
  if (form.id === "resume-scan-form") {
    const data = new FormData(form);
    const role = data.get("targetRole").trim();
    const jd = data.get("jobDescription").trim();
    const resume = data.get("resumeText").trim();

    const btn = $("#btn-scan-resume");
    const container = $("#resume-results-container");

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Auditing ATS Keywords...";
    }

    try {
      const results = await analyzeResumeATS(resume, jd, role);
      if (container) {
        container.innerHTML = `
          <section class="card resume-report">
            <div class="ats-gauge-row">
              <div class="ats-gauge ${results.atsScore >= 75 ? "score-high" : results.atsScore >= 55 ? "score-mid" : "score-low"}">
                <span class="ats-number">${results.atsScore}%</span>
                <span class="ats-caption">ATS Match Score</span>
              </div>
              <div>
                <h2>Placement Readiness: ${escapeHTML(results.matchLevel)}</h2>
                <p class="small">${escapeHTML(results.summary)}</p>
              </div>
            </div>

            <div class="keywords-analysis">
              <div>
                <h3>✓ Matched Competencies (${results.matchedKeywords?.length || 0})</h3>
                <div class="keyword-tags">
                  ${(results.matchedKeywords || []).map((k) => `<span class="pill green">${escapeHTML(k)}</span>`).join("")}
                </div>
              </div>
              <div style="margin-top:14px">
                <h3>⚠️ Missing High-Priority Keywords (${results.missingKeywords?.length || 0})</h3>
                <div class="keyword-tags">
                  ${(results.missingKeywords || []).map((k) => `<span class="pill red">${escapeHTML(k)}</span>`).join("")}
                </div>
              </div>
            </div>

            <div class="bullet-optimizations" style="margin-top:18px">
              <h3>⭐ STAR / Google XYZ Bullet Point Rewriter</h3>
              <p class="small">Transformed weak bullet descriptions into quantified achievements:</p>
              ${(results.bulletImprovements || []).map((b) => `
                <div class="bullet-card">
                  <div class="bullet-before">
                    <span class="badge-tag">Original Draft</span>
                    <p>${escapeHTML(b.original)}</p>
                  </div>
                  <div class="bullet-after">
                    <span class="badge-tag green">Optimized STAR Format</span>
                    <p>${escapeHTML(b.improved)}</p>
                    <small class="field-note"><strong>Why this works:</strong> ${escapeHTML(b.reason)}</small>
                  </div>
                </div>
              `).join("")}
            </div>

            <div class="formatting-tips-box" style="margin-top:14px">
              <h4>📋 Recruiter Formatting Advice</h4>
              <ul>${(results.formattingTips || []).map((t) => `<li>${escapeHTML(t)}</li>`).join("")}</ul>
            </div>
          </section>
        `;
      }
      showToast("Resume analysis complete!");
    } catch (err) {
      alert(err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Analyze with ATS Engine ↗";
      }
    }
    return;
  }

  // Quiz Generation Form
  if (form.id === "quiz-gen-form") {
    const data = new FormData(form);
    const selectedTopic = data.get("topic");
    const customTopic = data.get("customTopic")?.trim();
    const topic = selectedTopic === "custom" ? (customTopic || "Data Structures") : selectedTopic;
    const difficulty = data.get("difficulty");
    const count = Number(data.get("count"));

    const btn = $("#btn-generate-quiz");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Generating Assessment...";
    }

    try {
      const questions = await generateQuiz(topic, difficulty, count);
      activeQuiz = {
        topic,
        questions,
        currentIndex: 0,
        score: 0,
        answers: {}
      };
      renderCurrentView();
    } catch (err) {
      alert("Failed to generate quiz: " + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Generate Quiz ↗";
      }
    }
    return;
  }

  // Coach Chat Form
  if (form.id === "coach-chat-form") {
    const input = $("#coach-input");
    const text = input ? input.value.trim() : "";
    if (text) handleCoachMessage(text);
    return;
  }

  // API Key Form
  if (form.id === "api-key-form") {
    const data = new FormData(form);
    const key = data.get("apiKey").trim();
    const model = data.get("model");
    setApiKey(key, model);
    showToast(key ? "Gemini API key saved!" : "Switched to offline mode.");
    updateTopBar();
    renderCurrentView();
    return;
  }

  // Profile Form
  if (form.id === "profile-form") {
    const data = new FormData(form);
    const name = data.get("name").trim();
    const minutes = Number(data.get("minutes"));
    const deadline = data.get("deadline");

    const state = getState();
    state.profile = { ...state.profile, name };
    if (goal) {
      goal.minutes = minutes;
      goal.deadline = deadline;
    }
    saveState();
    showToast("Profile updated.");
    renderCurrentView();
    return;
  }
}

async function handleCoachMessage(text) {
  coachConversation.push({ role: "user", text });
  renderCurrentView();

  const input = $("#coach-input");
  if (input) input.value = "";

  const reply = await askCareerCoach(text, coachConversation);
  coachConversation.push({ role: "coach", text: reply });
  renderCurrentView();

  const log = $("#coach-chat-log");
  if (log) log.scrollTop = log.scrollHeight;
}

// Start app on DOMContentLoaded
window.addEventListener("DOMContentLoaded", init);
