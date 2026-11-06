(() => {
  "use strict";

  const KEYS = {
    students: "mgi_sms_students",
    attendance: "mgi_sms_attendance",
    tasks: "mgi_sms_tasks",
    activities: "mgi_sms_activities",
    meta: "mgi_sms_meta"
  };
  const COURSES = ["Web Development", "Java Full Stack", "Data Analytics", "UI/UX Design"];
  const STUDENT_STATUSES = ["Active", "Inactive", "Completed"];
  const TASK_STATUSES = ["Pending", "In Progress", "Completed"];
  const ATTENDANCE_STATUSES = ["Present", "Absent", "Leave"];
  const CATEGORIES = {
    Positive: ["Class Participation", "Project Excellence", "Helping Peers", "Consistent Improvement", "Leadership"],
    Negative: ["Late Arrival", "Incomplete Work", "Disruptive Behaviour", "Missed Deadline", "Misconduct"]
  };
  const STORAGE_LIMIT = 5 * 1024 * 1024;
  const RATING_RULES = {
    attendance: { green: 90, amber: 75 },
    completion: { green: 80, amber: 50 },
    overdue: { green: 0, amber: 2 },
    points: { green: 10, amber: 0 }
  };
  const state = { students: [], attendance: [], tasks: [], activities: [], meta: { schemaVersion: 1 } };
  let dialogOpener = null;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const byId = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const today = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const ui = { page: "dashboard", studentQuery: "", studentCourse: "", studentBatch: "", studentStatus: "", studentSort: "name", taskQuery: "", taskStatus: "", taskStudent: "", taskOverdue: false, activityStudent: "", activityType: "", activityCategory: "", activityFrom: "", activityTo: "", attendanceStudent: "", attendanceFrom: "", attendanceTo: "", analysisQuery: "", compared: [], selectedStudent: "", attendanceDate: today(), reportFrom: "", reportTo: "", reportStudent: "" };
  const validDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  };
  const formatDate = value => validDate(value) ? new Date(...value.split("-").map(Number).map((part, index) => index === 1 ? part - 1 : part)).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const formatDateTime = value => value ? new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" }) : "—";
  const isoNow = () => new Date().toISOString();
  const makeId = () => globalThis.crypto?.randomUUID ? crypto.randomUUID() : `mgi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const initials = name => String(name || "?").trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
  const avatar = student => student.photo
    ? `<img class="avatar" src="${esc(student.photo)}" alt="${esc(student.fullName)} profile photo">`
    : `<span class="avatar" role="img" aria-label="${esc(student.fullName)} initials">${esc(initials(student.fullName))}</span>`;
  const studentName = id => state.students.find(student => student.id === id)?.fullName || "Unknown student";
  const percent = (numerator, denominator) => denominator ? `${(numerator / denominator * 100).toFixed(1)}%` : "N/A";
  const percentageValue = (numerator, denominator) => denominator ? Number((numerator / denominator * 100).toFixed(1)) : 0;
  const badge = (text, tone = "gray") => `<span class="badge badge-${tone}">${esc(text)}</span>`;
  const toneForStatus = value => ({ Active: "green", Completed: "blue", Inactive: "gray", Present: "green", Absent: "red", Leave: "amber", Pending: "amber", "In Progress": "blue" }[value] || "gray");
  const nameSort = (a, b) => a.fullName.localeCompare(b.fullName);
  const validTimestamp = value => typeof value === "string" && Number.isFinite(Date.parse(value));

  const Storage = {
    read(key, fallback) {
      try {
        const text = localStorage.getItem(key);
        if (text === null) return fallback;
        try {
          return JSON.parse(text);
        } catch (error) {
          const recoveryKey = `${key}_recovery_${Date.now()}`;
          localStorage.setItem(recoveryKey, text);
          notify(`Saved data for ${key.replace("mgi_sms_", "")} could not be read. The original text was preserved for recovery.`, "warning", true);
          return fallback;
        }
      } catch (error) {
        notify("Browser storage is unavailable. Check your browser privacy settings and reopen this page.", "error", true);
        return fallback;
      }
    },
    load() {
      const readCollection = (key, validator) => {
        const value = this.read(key, []);
        if (!Array.isArray(value)) {
          notify(`The saved ${key.replace("mgi_sms_", "")} collection was not a list, so it was skipped.`, "warning", true);
          return [];
        }
        const accepted = value.filter(validator);
        if (accepted.length !== value.length) notify(`${value.length - accepted.length} invalid ${key.replace("mgi_sms_", "")} record(s) were skipped.`, "warning", true);
        return accepted;
      };
      state.students = readCollection(KEYS.students, item => item
        && typeof item.id === "string" && typeof item.studentCode === "string" && Boolean(item.studentCode.trim())
        && typeof item.fullName === "string" && Boolean(item.fullName.trim()) && typeof item.phone === "string"
        && (typeof item.email === "string" || item.email === undefined) && (typeof item.address === "string" || item.address === undefined)
        && COURSES.includes(item.course) && typeof item.batch === "string" && validDate(item.joiningDate)
        && STUDENT_STATUSES.includes(item.status) && Number.isInteger(item.courseProgress) && item.courseProgress >= 0 && item.courseProgress <= 100
        && (item.photo === null || typeof item.photo === "string") && validTimestamp(item.createdAt) && validTimestamp(item.updatedAt));
      const studentIds = new Set(state.students.map(item => item.id));
      state.attendance = readCollection(KEYS.attendance, item => item
        && typeof item.id === "string" && studentIds.has(item.studentId) && validDate(item.date) && item.date <= today()
        && ATTENDANCE_STATUSES.includes(item.status) && (typeof item.remarks === "string" || item.remarks === undefined)
        && (!item.remarks || item.remarks.length <= 200) && validTimestamp(item.createdAt) && validTimestamp(item.updatedAt));
      state.tasks = readCollection(KEYS.tasks, item => item
        && typeof item.id === "string" && studentIds.has(item.studentId) && typeof item.title === "string"
        && item.title.length >= 3 && item.title.length <= 100 && (typeof item.description === "string" || item.description === undefined)
        && (!item.description || item.description.length <= 500) && validDate(item.assignedDate) && validDate(item.dueDate)
        && item.dueDate >= item.assignedDate && TASK_STATUSES.includes(item.status)
        && (item.status === "Completed" ? validDate(item.completedDate) : item.completedDate === null)
        && validTimestamp(item.createdAt) && validTimestamp(item.updatedAt));
      state.activities = readCollection(KEYS.activities, item => item
        && typeof item.id === "string" && studentIds.has(item.studentId) && validDate(item.date) && item.date <= today()
        && CATEGORIES[item.type]?.includes(item.category) && typeof item.description === "string"
        && item.description.length >= 5 && item.description.length <= 300 && Number.isInteger(item.points)
        && item.points >= 1 && item.points <= 100 && validTimestamp(item.createdAt) && validTimestamp(item.updatedAt));
      const meta = this.read(KEYS.meta, { schemaVersion: 1 });
      state.meta = meta && typeof meta === "object" && !Array.isArray(meta) ? meta : { schemaVersion: 1 };
      const keepUnique = (records, keyFor, label) => {
        const seen = new Set();
        const filtered = records.filter(record => {
          const key = keyFor(record);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        if (filtered.length !== records.length) notify(`Duplicate ${label} records were skipped while loading saved data.`, "warning", true);
        return filtered;
      };
      state.students = keepUnique(state.students, item => item.id, "student record ID");
      state.students = keepUnique(state.students, item => item.studentCode.trim().toLowerCase(), "student ID");
      const acceptedStudentIds = new Set(state.students.map(item => item.id));
      const relatedCount = state.attendance.length + state.tasks.length + state.activities.length;
      state.attendance = state.attendance.filter(item => acceptedStudentIds.has(item.studentId));
      state.tasks = state.tasks.filter(item => acceptedStudentIds.has(item.studentId));
      state.activities = state.activities.filter(item => acceptedStudentIds.has(item.studentId));
      const remainingRelatedCount = state.attendance.length + state.tasks.length + state.activities.length;
      if (remainingRelatedCount !== relatedCount) notify(`${relatedCount - remainingRelatedCount} related record(s) without a valid student were skipped.`, "warning", true);
      state.attendance = keepUnique(state.attendance, item => `${item.studentId}|${item.date}`, "attendance");
      state.tasks = keepUnique(state.tasks, item => item.id, "task");
      state.activities = keepUnique(state.activities, item => item.id, "activity");
    },
    save(next) {
      const payload = {
        [KEYS.students]: next.students,
        [KEYS.attendance]: next.attendance,
        [KEYS.tasks]: next.tasks,
        [KEYS.activities]: next.activities,
        [KEYS.meta]: next.meta
      };
      const previous = {};
      try {
        Object.keys(payload).forEach(key => { previous[key] = localStorage.getItem(key); });
        Object.entries(payload).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
        state.students = next.students;
        state.attendance = next.attendance;
        state.tasks = next.tasks;
        state.activities = next.activities;
        state.meta = next.meta;
        return true;
      } catch (error) {
        Object.entries(previous).forEach(([key, value]) => {
          try {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
          } catch (rollbackError) {
            console.error("Could not roll back a partial Local Storage write.", rollbackError);
          }
        });
        notify("Your change could not be saved because browser storage is full or unavailable. No changes were applied.", "error", true);
        return false;
      }
    },
    snapshot() {
      return { students: [...state.students], attendance: [...state.attendance], tasks: [...state.tasks], activities: [...state.activities], meta: { ...state.meta } };
    },
    usage() {
      try {
        return Object.keys(localStorage).filter(key => key.startsWith("mgi_sms_")).reduce((sum, key) => sum + key.length + localStorage.getItem(key).length, 0) * 2;
      } catch (error) {
        return 0;
      }
    }
  };

  function notify(message, type = "success", persistent = false) {
    const region = byId("toastRegion");
    if (!region) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.setAttribute("role", type === "error" || type === "warning" ? "alert" : "status");
    toast.innerHTML = `<span class="toast-icon" aria-hidden="true">${type === "error" ? "!" : type === "warning" ? "△" : "✓"}</span><div><strong>${type === "error" ? "Something needs attention" : type === "warning" ? "Please note" : "Done"}</strong>${esc(message)}</div>`;
    region.append(toast);
    if (!persistent) window.setTimeout(() => toast.remove(), 4200);
  }

  function totalsForAttendance(records) {
    const totals = records.reduce((result, record) => {
      result[record.status.toLowerCase()] += 1;
      return result;
    }, { present: 0, absent: 0, leave: 0 });
    totals.total = totals.present + totals.absent + totals.leave;
    totals.percentage = percent(totals.present, totals.total);
    return totals;
  }
  function totalsForTasks(tasks) {
    const totals = tasks.reduce((result, task) => {
      result[task.status.toLowerCase().replace(" ", "")] += 1;
      if (task.status !== "Completed" && validDate(task.dueDate) && task.dueDate < today()) result.overdue += 1;
      return result;
    }, { pending: 0, inprogress: 0, completed: 0, overdue: 0 });
    totals.total = tasks.length;
    totals.completion = percent(totals.completed, totals.total);
    return totals;
  }
  function totalsForActivities(activities) {
    const totals = activities.reduce((result, item) => {
      result[item.type === "Positive" ? "positive" : "negative"] += item.points;
      return result;
    }, { positive: 0, negative: 0 });
    totals.net = totals.positive - totals.negative;
    return totals;
  }
  function performance(studentId) {
    const attendance = totalsForAttendance(state.attendance.filter(record => record.studentId === studentId));
    const tasks = totalsForTasks(state.tasks.filter(task => task.studentId === studentId));
    const activities = state.activities.filter(item => item.studentId === studentId);
    const points = totalsForActivities(activities);
    const available = [];
    if (attendance.total) available.push(rate(percentageValue(attendance.present, attendance.total), RATING_RULES.attendance.green, RATING_RULES.attendance.amber, true));
    if (tasks.total) available.push(rate(percentageValue(tasks.completed, tasks.total), RATING_RULES.completion.green, RATING_RULES.completion.amber, true));
    if (tasks.total) available.push(rate(tasks.overdue, RATING_RULES.overdue.green, RATING_RULES.overdue.amber, false));
    if (activities.length) available.push(rate(points.net, RATING_RULES.points.green, RATING_RULES.points.amber, false));
    let overall = "Not Rated";
    if (available.length >= 2) {
      if (available.some(item => item.level === "Red")) overall = "At Risk";
      else if (available.every(item => item.level === "Green")) overall = "Excellent";
      else if (available.some(item => item.level === "Green")) overall = "Good";
      else overall = "Needs Improvement";
    }
    return { studentId, attendance, tasks, points, available, overall };
  }
  function rate(value, green, amber, isPercentage) {
    const level = green === 0 && amber > 0
      ? value === 0 ? "Green" : value <= amber ? "Amber" : "Red"
      : value >= green ? "Green" : value >= amber ? "Amber" : "Red";
    let rule;
    if (isPercentage) rule = level === "Green" ? `Green: at least ${green}%` : level === "Amber" ? `Amber: ${amber}%–${(green - 0.1).toFixed(1)}%` : `Red: below ${amber}%`;
    else if (green === 0) rule = level === "Green" ? "Green: none overdue" : level === "Amber" ? `Amber: 1–${amber} overdue` : `Red: ${amber + 1} or more overdue`;
    else rule = level === "Green" ? `Green: ${green} or more` : level === "Amber" ? `Amber: ${amber} to ${green - 1}` : `Red: below ${amber}`;
    return { value, level, rule };
  }
  function instituteTotals() {
    const attendance = totalsForAttendance(state.attendance);
    const tasks = totalsForTasks(state.tasks);
    const points = totalsForActivities(state.activities);
    const todayRows = state.attendance.filter(item => item.date === ui.attendanceDate);
    const todayCounts = totalsForAttendance(todayRows);
    const activeUnmarked = state.students.filter(student => student.status === "Active" && !todayRows.some(item => item.studentId === student.id)).length;
    return { attendance, tasks, points, todayCounts, activeUnmarked };
  }
  function courseCounts() {
    return COURSES.map(course => ({ course, count: state.students.filter(student => student.course === course).length }));
  }
  function chartBars(rows, labelKey, valueKey, maxValue = null, colors = []) {
    const max = maxValue ?? Math.max(1, ...rows.map(row => Number(row[valueKey]) || 0));
    return rows.length ? rows.map((row, index) => {
      const value = Number(row[valueKey]) || 0;
      const width = max > 0 ? Math.max(value > 0 ? 2 : 0, value / max * 100) : 0;
      return `<div class="bar-row"><span class="bar-label" title="${esc(row[labelKey])}">${esc(row[labelKey])}</span><span class="bar-track"><span class="bar-fill ${colors[index % Math.max(colors.length, 1)] || ""}" style="width:${width.toFixed(1)}%"></span></span><span class="bar-value">${esc(value)}</span></div>`;
    }).join("") : `<div class="no-data">No records to chart yet.</div>`;
  }
  function setPage(page) {
    if (!byId(`${page}View`)) return;
    ui.page = page;
    $$(".page-view").forEach(section => section.classList.toggle("is-visible", section.id === `${page}View`));
    $$(".nav-link[data-view]").forEach(button => button.classList.toggle("is-active", button.dataset.view === page));
    byId("currentPageName").textContent = ({ dashboard: "Overview", students: "Students", attendance: "Attendance", tasks: "Tasks", activities: "Activities", analysis: "Analysis", reports: "Reports", data: "Data & settings" })[page];
    byId("sidebar").classList.remove("is-open");
    byId("sidebarScrim").classList.remove("is-visible");
    byId("menuToggle").setAttribute("aria-expanded", "false");
    renderPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function renderAll() {
    byId("studentNavCount").textContent = state.students.length;
    byId("todayLabel").textContent = new Date().toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
    ["dashboard", "students", "attendance", "tasks", "activities", "analysis", "reports", "data"].forEach(renderPage);
  }
  function renderPage(page) {
    const renderers = { dashboard: renderDashboard, students: renderStudents, attendance: renderAttendance, tasks: renderTasks, activities: renderActivities, analysis: renderAnalysis, reports: renderReports, data: renderData };
    renderers[page]?.();
  }
  function heading(title, description, action = "") {
    const headingIds = { "Good morning, Admin": "dashboardTitle", Students: "studentsTitle", Attendance: "attendanceTitle", Tasks: "tasksTitle", "Activities & behaviour": "activitiesTitle", "Student analysis": "analysisTitle", Reports: "reportsTitle", "Data & settings": "dataTitle", "Student profile": "studentsTitle" };
    const id = headingIds[title] || `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}Title`;
    return `<div class="page-heading"><div><p class="eyebrow">MrGenie Institute</p><h1 id="${id}">${title}</h1><p>${description}</p></div>${action}</div>`;
  }
  function renderDashboard() {
    const page = byId("dashboardView");
    if (!page) return;
    ui.page = ui.page || "dashboard";
    const totals = instituteTotals();
    const courseData = courseCounts();
    const totalStudents = state.students.length;
    const active = state.students.filter(student => student.status === "Active").length;
    const completedRate = totals.tasks.completion;
    const taskRows = [
      { label: "Completed", value: totals.tasks.completed },
      { label: "In progress", value: totals.tasks.inprogress },
      { label: "Pending", value: totals.tasks.pending }
    ];
    const performances = state.students.map(student => ({ student, metrics: performance(student.id) }))
      .filter(item => item.metrics.attendance.total || item.metrics.tasks.total || state.activities.some(activity => activity.studentId === item.student.id))
      .sort((a, b) => b.metrics.points.net - a.metrics.points.net);
    const top = performances.slice(0, 5);
    const bottom = [...performances].reverse().slice(0, 5);
    page.innerHTML = `${heading("Good morning, Admin", "Here’s what’s happening across your institute today.", `<button class="button button-secondary button-small" data-view="reports">View reports <span aria-hidden="true">→</span></button>`)}
      <div class="welcome-banner"><div><h2>Your institute, at a glance.</h2><p>Keep track of student progress, daily attendance and classroom tasks in one place.</p></div><button class="button button-small" data-action="load-sample">Explore with sample data <span aria-hidden="true">→</span></button></div>
      <div class="grid stats-grid">
        ${statCard("Total students", totalStudents, "All student records", "♙", "")}
        ${statCard("Active students", active, `${totalStudents ? Math.round(active / totalStudents * 100) : 0}% of all students`, "↗", "green")}
        ${statCard("Attendance today", `${totals.todayCounts.present}`, `${totals.todayCounts.absent} absent · ${totals.todayCounts.leave} on leave`, "▦", "blue")}
        ${statCard("Task completion", completedRate, `${totals.tasks.overdue} overdue task${totals.tasks.overdue === 1 ? "" : "s"}`, "✓", "amber")}
      </div>
      <div class="grid dashboard-grid">
        <article class="card"><div class="card-header"><div><h2>Student distribution</h2><p>Enrolment across configured courses</p></div><span class="stat-icon">◫</span></div><div class="card-body"><div class="bar-chart">${chartBars(courseData, "course", "count", Math.max(1, ...courseData.map(item => item.count)), ["", "blue", "green", "amber"])}</div><div class="chart-legend"><span class="legend-item"><i class="legend-dot"></i>Students enrolled</span><span class="muted">${totalStudents} students total</span></div></div></article>
        <article class="card"><div class="card-header"><div><h2>Attendance overview</h2><p>All recorded attendance days</p></div><span class="stat-icon green">▦</span></div><div class="card-body">
          ${totals.attendance.total ? `<div class="stacked-bar" role="img" aria-label="Attendance: ${totals.attendance.present} present, ${totals.attendance.absent} absent, ${totals.attendance.leave} leave"><span style="width:${totals.attendance.present / totals.attendance.total * 100}%;background:#48b88a"></span><span style="width:${totals.attendance.absent / totals.attendance.total * 100}%;background:#e2787a"></span><span style="width:${totals.attendance.leave / totals.attendance.total * 100}%;background:#edb350"></span></div>
          <div class="stacked-labels"><div class="stacked-label">Present<strong>${totals.attendance.present}</strong></div><div class="stacked-label">Absent<strong>${totals.attendance.absent}</strong></div><div class="stacked-label">Leave<strong>${totals.attendance.leave}</strong></div><div class="stacked-label">Rate<strong>${totals.attendance.percentage}</strong></div></div>` : `<div class="no-data">No attendance records yet. Start by taking today’s attendance.</div>`}
          <div class="progress-line"><span>Overall attendance</span><strong>${totals.attendance.percentage}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${totals.attendance.total ? totals.attendance.present / totals.attendance.total * 100 : 0}%"></div></div>
        </div></article>
      </div>
      <div class="grid dashboard-grid equal">
        <article class="card"><div class="card-header"><div><h2>Tasks by status</h2><p>${totals.tasks.total} total · ${totals.tasks.overdue} overdue</p></div><button class="link-button" data-view="tasks">View tasks →</button></div><div class="card-body"><div class="bar-chart">${chartBars(taskRows, "label", "value", Math.max(1, totals.tasks.total), ["green", "blue", "amber"])}</div><div class="progress-line"><span>Completion rate</span><strong>${completedRate}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${totals.tasks.total ? totals.tasks.completed / totals.tasks.total * 100 : 0}%"></div></div></div></article>
        <article class="card"><div class="card-header"><div><h2>Performance comparison</h2><p>Top and bottom students by net activity points</p></div><button class="link-button" data-view="analysis">See analysis →</button></div><div class="card-body">${top.length ? `<h3 class="tiny muted" style="margin:0 0 10px">Top performers</h3><div class="compare-list">${top.map((item, index) => `<div class="compare-row"><span class="compare-rank">0${index + 1}</span>${avatar(item.student)}<span class="compare-name">${esc(item.student.fullName)}</span><span class="compare-score">${item.metrics.points.net > 0 ? "+" : ""}${item.metrics.points.net} pts</span></div>`).join("")}</div><h3 class="tiny muted" style="margin:18px 0 10px">Needs attention</h3><div class="compare-list">${bottom.map((item, index) => `<div class="compare-row"><span class="compare-rank">0${index + 1}</span>${avatar(item.student)}<span class="compare-name">${esc(item.student.fullName)}</span><span class="compare-score">${item.metrics.points.net > 0 ? "+" : ""}${item.metrics.points.net} pts</span></div>`).join("")}</div>` : `<div class="no-data">Performance comparisons will appear once student records have activity or attendance.</div>`}</div></article>
      </div>
      <div class="card card-pad"><div class="card-header" style="padding:0"><div><h2>Today’s attendance</h2><p>Quick status of active students</p></div><label class="inline-control" for="dashboardDate">Date <input id="dashboardDate" type="date" value="${esc(ui.attendanceDate)}" max="${today()}"></label></div><div class="card-body" style="padding:17px 0 0"><div class="report-summary"><div><span>Present</span><strong>${totals.todayCounts.present}</strong></div><div><span>Absent</span><strong>${totals.todayCounts.absent}</strong></div><div><span>Leave</span><strong>${totals.todayCounts.leave}</strong></div><div><span>Not marked</span><strong>${totals.activeUnmarked}</strong></div></div></div></div>`;
  }
  function statCard(label, value, foot, icon, tone) {
    return `<article class="card stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon ${tone}">${icon}</span></div><div class="stat-value">${esc(value)}</div><div class="stat-foot">${foot}</div></article>`;
  }
  function renderStudents() {
    const page = byId("studentsView");
    const action = `<button class="button button-primary" data-action="add-student"><span aria-hidden="true">＋</span> Add student</button>`;
    if (ui.selectedStudent) {
      const student = state.students.find(item => item.id === ui.selectedStudent);
      if (student) {
        page.innerHTML = renderProfile(student);
        const courseButton = document.createElement("button");
        courseButton.className = "button button-secondary button-small";
        courseButton.dataset.action = "edit-course-batch";
        courseButton.dataset.id = student.id;
        courseButton.textContent = "Course & batch";
        $(".profile-hero .table-actions", page)?.prepend(courseButton);
        return;
      }
      ui.selectedStudent = "";
    }
    const query = ui.studentQuery.trim().toLowerCase();
    const filtered = state.students.filter(student =>
      `${student.fullName} ${student.studentCode}`.toLowerCase().includes(query)
      && (!ui.studentCourse || student.course === ui.studentCourse)
      && (!ui.studentBatch || student.batch === ui.studentBatch)
      && (!ui.studentStatus || student.status === ui.studentStatus)
    ).sort((a, b) => {
      const direction = ui.studentSort.startsWith("-") ? -1 : 1;
      const key = ui.studentSort.replace("-", "");
      const result = key === "id" ? a.studentCode.localeCompare(b.studentCode) : key === "joining" ? a.joiningDate.localeCompare(b.joiningDate) : a.fullName.localeCompare(b.fullName);
      return result * direction;
    });
    const rows = filtered.map(student => {
      const metrics = performance(student.id);
      return `<tr><td><div class="person-cell">${avatar(student)}<span class="person-name"><strong><button class="link-button" data-action="profile" data-id="${esc(student.id)}">${esc(student.fullName)}</button></strong><small>${esc(student.email || "No email")}</small></span></div></td><td>${esc(student.studentCode)}</td><td>${esc(student.course)}</td><td>${esc(student.batch)}</td><td>${badge(student.status, toneForStatus(student.status))}</td><td>${metrics.attendance.percentage}</td><td>${metrics.tasks.completion}</td><td>${metrics.points.net > 0 ? "+" : ""}${metrics.points.net}</td><td><div class="table-actions"><button title="View profile" aria-label="View ${esc(student.fullName)} profile" data-action="profile" data-id="${esc(student.id)}">↗</button><button title="Edit student" aria-label="Edit ${esc(student.fullName)}" data-action="edit-student" data-id="${esc(student.id)}">✎</button><button title="Delete student" aria-label="Delete ${esc(student.fullName)}" data-action="delete-student" data-id="${esc(student.id)}">×</button></div></td></tr>`;
    }).join("");
    page.innerHTML = `${heading("Students", "Manage student records, courses and individual progress.", action)}
      <div class="card table-card"><div class="table-toolbar"><div class="search-wrap"><span class="search-symbol" aria-hidden="true">⌕</span><label class="sr-only" for="studentSearch">Search students</label><input id="studentSearch" class="search-field" type="search" placeholder="Search name or student ID…" value="${esc(ui.studentQuery)}"></div><label class="sr-only" for="studentCourseFilter">Filter by course</label><select class="filter-select" id="studentCourseFilter"><option value="">All courses</option>${COURSES.map(item => `<option ${ui.studentCourse === item ? "selected" : ""}>${esc(item)}</option>`).join("")}</select><label class="sr-only" for="studentBatchFilter">Filter by batch</label><select class="filter-select" id="studentBatchFilter"><option value="">All batches</option>${[...new Set(state.students.map(item => item.batch))].sort().map(item => `<option ${ui.studentBatch === item ? "selected" : ""}>${esc(item)}</option>`).join("")}</select><label class="sr-only" for="studentStatusFilter">Filter by status</label><select class="filter-select" id="studentStatusFilter"><option value="">All statuses</option>${STUDENT_STATUSES.map(item => `<option ${ui.studentStatus === item ? "selected" : ""}>${item}</option>`).join("")}</select><label class="sr-only" for="studentSort">Sort students</label><select class="filter-select" id="studentSort"><option value="name" ${ui.studentSort === "name" ? "selected" : ""}>Name A–Z</option><option value="-name" ${ui.studentSort === "-name" ? "selected" : ""}>Name Z–A</option><option value="id" ${ui.studentSort === "id" ? "selected" : ""}>ID ascending</option><option value="-id" ${ui.studentSort === "-id" ? "selected" : ""}>ID descending</option><option value="joining" ${ui.studentSort === "joining" ? "selected" : ""}>Joining date ↑</option><option value="-joining" ${ui.studentSort === "-joining" ? "selected" : ""}>Joining date ↓</option></select><span class="muted tiny">${filtered.length} student${filtered.length === 1 ? "" : "s"}</span><span class="toolbar-spacer"></span><button class="button button-secondary button-small" data-action="clear-student-search">Clear filters</button></div>
      <div class="table-wrap"><table><thead><tr><th scope="col">Student</th><th scope="col">Student ID</th><th scope="col">Course</th><th scope="col">Batch</th><th scope="col">Status</th><th scope="col">Attendance</th><th scope="col">Tasks</th><th scope="col">Net points</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows || `<tr><td colspan="9" class="table-empty"><strong>${state.students.length ? "No students match your search" : "No students yet"}</strong>${state.students.length ? "Try a different name or student ID." : "Add a student or load sample data to get started."}<div style="margin-top:12px"><button class="button button-primary button-small" data-action="${state.students.length ? "clear-student-search" : "add-student"}">${state.students.length ? "Clear search" : "Add student"}</button>${state.students.length ? "" : ` <button class="button button-secondary button-small" data-action="load-sample">Load sample data</button>`}</div></td></tr>`}</tbody></table></div><div class="table-foot"><span>Showing ${filtered.length} of ${state.students.length} students</span><span>Attendance and task metrics recalculate automatically</span></div></div>`;
  }
  function renderProfile(student) {
    const metrics = performance(student.id);
    const attendanceRows = state.attendance.filter(item => item.studentId === student.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    const taskRows = state.tasks.filter(item => item.studentId === student.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5);
    const activityRows = state.activities.filter(item => item.studentId === student.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    const reportList = (rows, cols, content) => rows.length ? `<div class="table-wrap"><table><thead><tr>${cols.map(column => `<th scope="col">${column}</th>`).join("")}</tr></thead><tbody>${content}</tbody></table></div>` : `<div class="no-data">No records yet.</div>`;
    return `${heading("Student profile", "Personal information and a complete progress snapshot.", `<button class="button button-secondary button-small" data-action="back-students">← All students</button>`)}
      <article class="card profile-hero"><div>${avatar(student)}</div><div style="flex:1;min-width:0"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px"><div><h2>${esc(student.fullName)}</h2><span class="muted tiny">${esc(student.studentCode)} · ${esc(student.course)}</span></div><div class="table-actions"><button class="button button-secondary button-small" data-action="edit-student" data-id="${esc(student.id)}">Edit profile</button><button class="icon-button" aria-label="Delete student" data-action="delete-student" data-id="${esc(student.id)}">×</button></div></div><div class="profile-meta"><span>${esc(student.phone)}</span><span>${esc(student.email || "No email")}</span><span>${esc(student.batch)}</span><span>Joined ${formatDate(student.joiningDate)}</span>${badge(student.status, toneForStatus(student.status))}</div><div class="profile-grid"><div class="profile-metric"><span>Course progress</span><strong>${student.courseProgress}%</strong><div class="progress-track"><div class="progress-fill" style="width:${student.courseProgress}%"></div></div></div><div class="profile-metric"><span>Attendance</span><strong>${metrics.attendance.percentage}</strong></div><div class="profile-metric"><span>Task completion</span><strong>${metrics.tasks.completion}</strong></div></div></div></article>
      <div class="grid dashboard-grid equal section-spacer"><article class="card card-pad"><div class="card-header" style="padding:0"><div><h2>Performance indicators</h2><p>Overall status: ${badge(metrics.overall, metrics.overall === "Excellent" || metrics.overall === "Good" ? "green" : metrics.overall === "At Risk" ? "red" : "gray")}</p></div></div><div class="card-body" style="padding:14px 0 0"><div class="indicator-grid">${indicatorCards(metrics)}</div></div></article><article class="card card-pad"><div class="card-header" style="padding:0"><div><h2>Student details</h2><p>Profile history</p></div></div><div class="rating-list"><div class="rating-line"><span>Address</span><strong>${esc(student.address || "Not provided")}</strong></div><div class="rating-line"><span>Created</span><strong>${formatDateTime(student.createdAt)}</strong></div><div class="rating-line"><span>Last updated</span><strong>${formatDateTime(student.updatedAt)}</strong></div></div></article></div>
      <div class="grid dashboard-grid equal section-spacer"><article class="card"><div class="card-header"><div><h2>Attendance history</h2><p>${metrics.attendance.present} present · ${metrics.attendance.absent} absent · ${metrics.attendance.leave} leave</p></div></div>${reportList(attendanceRows, ["Date", "Status", "Remark", ""], attendanceRows.map(item => `<tr><td>${formatDate(item.date)}</td><td>${badge(item.status, toneForStatus(item.status))}</td><td>${esc(item.remarks || "—")}</td><td><button class="link-button" data-action="edit-attendance" data-id="${esc(item.id)}">Edit</button></td></tr>`).join(""))}</article><article class="card"><div class="card-header"><div><h2>Tasks</h2><p>${metrics.tasks.completed} completed · ${metrics.tasks.overdue} overdue</p></div></div>${reportList(taskRows, ["Task", "Due date", "Status"], taskRows.map(item => `<tr><td>${esc(item.title)}</td><td>${formatDate(item.dueDate)}</td><td>${badge(item.status, toneForStatus(item.status))}${item.status !== "Completed" && item.dueDate < today() ? ` ${badge("Overdue", "red")}` : ""}</td></tr>`).join(""))}</article></div>
      <div class="card section-spacer"><div class="card-header"><div><h2>Activity history</h2><p>Positive ${metrics.points.positive} points · Negative ${metrics.points.negative} points · Net ${metrics.points.net > 0 ? "+" : ""}${metrics.points.net}</p></div></div>${reportList(activityRows, ["Date", "Category", "Description", "Points"], activityRows.map(item => `<tr><td>${formatDate(item.date)}</td><td>${esc(item.category)}</td><td>${esc(item.description)}</td><td>${item.type === "Positive" ? "+" : "−"}${item.points}</td></tr>`).join(""))}</div>`;
  }
  function indicatorCards(metrics) {
    const values = [
      ["Attendance", metrics.attendance.total ? `${metrics.attendance.percentage} — ${rate(percentageValue(metrics.attendance.present, metrics.attendance.total), RATING_RULES.attendance.green, RATING_RULES.attendance.amber, true).level}` : "N/A", metrics.attendance.total ? rate(percentageValue(metrics.attendance.present, metrics.attendance.total), RATING_RULES.attendance.green, RATING_RULES.attendance.amber, true).rule : "No attendance records"],
      ["Task completion", metrics.tasks.total ? `${metrics.tasks.completion} — ${rate(percentageValue(metrics.tasks.completed, metrics.tasks.total), RATING_RULES.completion.green, RATING_RULES.completion.amber, true).level}` : "N/A", metrics.tasks.total ? rate(percentageValue(metrics.tasks.completed, metrics.tasks.total), RATING_RULES.completion.green, RATING_RULES.completion.amber, true).rule : "No tasks"],
      ["Overdue tasks", metrics.tasks.total ? `${metrics.tasks.overdue} — ${rate(metrics.tasks.overdue, RATING_RULES.overdue.green, RATING_RULES.overdue.amber, false).level}` : "N/A", metrics.tasks.total ? rate(metrics.tasks.overdue, RATING_RULES.overdue.green, RATING_RULES.overdue.amber, false).rule : "No tasks"],
      ["Net activity points", state.activities.some(item => item.studentId === metrics.studentId) ? `${metrics.points.net > 0 ? "+" : ""}${metrics.points.net} — ${rate(metrics.points.net, RATING_RULES.points.green, RATING_RULES.points.amber, false).level}` : `${metrics.points.net} — N/A`, state.activities.some(item => item.studentId === metrics.studentId) ? rate(metrics.points.net, RATING_RULES.points.green, RATING_RULES.points.amber, false).rule : "No activity records"]
    ];
    return values.map(([label, value, rule]) => `<div class="indicator-card"><span>${label}</span><strong>${esc(value)}</strong><small>${esc(rule)}</small></div>`).join("");
  }
  function renderAttendance() {
    const page = byId("attendanceView");
    const activeStudents = state.students.filter(student => student.status === "Active").sort(nameSort);
    const existing = state.attendance.filter(item => item.date === ui.attendanceDate);
    const marked = new Map(existing.map(item => [item.studentId, item]));
    const rows = activeStudents.map(student => {
      const record = marked.get(student.id);
      const status = record?.status || "Present";
      return `<div class="attendance-row" data-attendance-student="${esc(student.id)}"><div class="person-cell">${avatar(student)}<span class="person-name"><strong>${esc(student.fullName)}</strong><small>${esc(student.studentCode)} · ${esc(student.batch)}</small></span></div><div class="attendance-options" role="radiogroup" aria-label="${esc(student.fullName)} attendance">${ATTENDANCE_STATUSES.map(value => `<label><input type="radio" name="att-${esc(student.id)}" value="${value}" ${status === value ? "checked" : ""}><span>${value}</span></label>`).join("")}</div><label class="sr-only" for="remark-${esc(student.id)}">Attendance remark for ${esc(student.fullName)}</label><input class="field attendance-remark" id="remark-${esc(student.id)}" maxlength="200" placeholder="Add a note (optional)" value="${esc(record?.remarks || "")}"></div>`;
    }).join("");
    const invalidRange = ui.attendanceFrom && ui.attendanceTo && ui.attendanceFrom > ui.attendanceTo;
    const periodRecords = state.attendance.filter(record => !invalidRange && (!ui.attendanceFrom || record.date >= ui.attendanceFrom) && (!ui.attendanceTo || record.date <= ui.attendanceTo));
    const selectedPeriod = ui.attendanceStudent ? periodRecords.filter(record => record.studentId === ui.attendanceStudent) : periodRecords;
    const periodTotals = totalsForAttendance(selectedPeriod);
    const dailyRows = [...new Set(periodRecords.map(record => record.date))].sort((a, b) => b.localeCompare(a)).map(date => {
      const daily = periodRecords.filter(record => record.date === date);
      const counts = totalsForAttendance(daily);
      const notMarked = Math.max(0, activeStudents.length - daily.filter(record => activeStudents.some(student => student.id === record.studentId)).length);
      return `<tr><td>${formatDate(date)}</td><td>${counts.present}</td><td>${counts.absent}</td><td>${counts.leave}</td><td>${notMarked}</td><td>${counts.percentage}</td></tr>`;
    }).join("");
    const studentRows = selectedPeriod.sort((a, b) => b.date.localeCompare(a.date)).map(record => `<tr><td>${formatDate(record.date)}</td><td>${badge(record.status, toneForStatus(record.status))}</td><td>${esc(record.remarks || "—")}</td></tr>`).join("");
    page.innerHTML = `${heading("Attendance", "Take a daily register and review attendance records.", `<button class="button button-secondary button-small" data-action="attendance-report">Attendance summary</button>`)}
      <div class="info-banner">Attendance percentage = present days ÷ all recorded days. Leave counts as a recorded day, but not as present.</div>
      <div class="card"><div class="table-toolbar"><label class="inline-control" for="attendanceDate">Attendance date <input id="attendanceDate" type="date" value="${esc(ui.attendanceDate)}" max="${today()}"></label><span class="muted tiny">${activeStudents.length} active student${activeStudents.length === 1 ? "" : "s"} · ${existing.length} already marked</span><span class="toolbar-spacer"></span><button class="button button-secondary button-small" data-action="mark-all-present">Mark all present</button><button class="button button-primary button-small" data-action="save-attendance">Save attendance</button></div>
      <div class="card-body">${rows || `<div class="table-empty"><strong>${state.students.length ? "No active students" : "No students yet"}</strong>Add or activate students before taking attendance.${state.students.length ? "" : `<div style="margin-top:12px"><button class="button button-primary button-small" data-action="add-student">Add student</button></div>`}</div>`}</div></div>
      <div class="grid stats-grid section-spacer">${statCard("Present days", totalsForAttendance(state.attendance).present, "All recorded periods", "✓", "green")}${statCard("Absent days", totalsForAttendance(state.attendance).absent, "All recorded periods", "!", "amber")}${statCard("Leave days", totalsForAttendance(state.attendance).leave, "All recorded periods", "◷", "blue")}${statCard("Overall attendance", totalsForAttendance(state.attendance).percentage, "Pooled institute total", "▦", "")}</div>
      <article class="card section-spacer"><div class="card-header"><div><h2>Attendance reports</h2><p>Review institute totals by date or one student’s records.</p></div></div><div class="table-toolbar"><label class="sr-only" for="attendanceStudentFilter">Choose student or institute summary</label><select class="filter-select" id="attendanceStudentFilter"><option value="">All students · date-wise</option>${state.students.map(item => `<option value="${esc(item.id)}" ${ui.attendanceStudent === item.id ? "selected" : ""}>${esc(item.fullName)}</option>`).join("")}</select><label class="inline-control" for="attendanceFrom">From <input id="attendanceFrom" type="date" value="${esc(ui.attendanceFrom)}"></label><label class="inline-control" for="attendanceTo">To <input id="attendanceTo" type="date" value="${esc(ui.attendanceTo)}"></label></div><div class="card-body">${invalidRange ? `<div class="info-banner">The From date must not be later than the To date.</div>` : `<div class="report-summary"><div><span>Present</span><strong>${periodTotals.present}</strong></div><div><span>Absent</span><strong>${periodTotals.absent}</strong></div><div><span>Leave</span><strong>${periodTotals.leave}</strong></div><div><span>Attendance</span><strong>${periodTotals.percentage}</strong></div></div><div class="table-wrap section-spacer"><table><thead><tr>${ui.attendanceStudent ? `<th scope="col">Date</th><th scope="col">Status</th><th scope="col">Remark</th>` : `<th scope="col">Date</th><th scope="col">Present</th><th scope="col">Absent</th><th scope="col">Leave</th><th scope="col">Not marked</th><th scope="col">Rate</th>`}</tr></thead><tbody>${ui.attendanceStudent ? studentRows : dailyRows}</tbody></table>${(ui.attendanceStudent ? studentRows : dailyRows) ? "" : `<div class="no-data">No attendance recorded for the selected period.</div>`}</div>`}</div></article>`;
  }
  function renderTasks() {
    const page = byId("tasksView");
    const totals = totalsForTasks(state.tasks);
    let tasks = [...state.tasks];
    if (ui.taskQuery.trim()) tasks = tasks.filter(task => task.title.toLowerCase().includes(ui.taskQuery.trim().toLowerCase()));
    if (ui.taskStatus) tasks = tasks.filter(task => task.status === ui.taskStatus);
    if (ui.taskStudent) tasks = tasks.filter(task => task.studentId === ui.taskStudent);
    if (ui.taskOverdue) tasks = tasks.filter(task => task.status !== "Completed" && task.dueDate < today());
    tasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const rows = tasks.map(task => `<tr><td><strong>${esc(task.title)}</strong><div class="muted tiny">${esc(task.description || "No description")}</div></td><td>${esc(studentName(task.studentId))}</td><td>${formatDate(task.dueDate)}</td><td>${badge(task.status, toneForStatus(task.status))} ${task.status !== "Completed" && task.dueDate < today() ? badge("Overdue", "red") : ""}</td><td><select class="filter-select task-status-change" aria-label="Change status for ${esc(task.title)}" data-id="${esc(task.id)}">${TASK_STATUSES.map(status => `<option ${task.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></td><td><div class="table-actions"><button aria-label="Edit ${esc(task.title)}" data-action="edit-task" data-id="${esc(task.id)}">✎</button><button aria-label="Delete ${esc(task.title)}" data-action="delete-task" data-id="${esc(task.id)}">×</button></div></td></tr>`).join("");
    page.innerHTML = `${heading("Tasks", "Create assignments, track progress and catch overdue work.", `<button class="button button-primary" data-action="add-task"><span aria-hidden="true">＋</span> New task</button>`)}
      <div class="grid stats-grid">${statCard("All tasks", totals.total, "Across all students", "▤", "")}${statCard("Completed", totals.completed, `Completion rate ${totals.completion}`, "✓", "green")}${statCard("In progress", totals.inprogress, "Currently being worked on", "↗", "blue")}${statCard("Overdue", totals.overdue, "Due before today, not completed", "◷", "amber")}</div>
      <div class="card table-card"><div class="table-toolbar"><div class="search-wrap"><span class="search-symbol" aria-hidden="true">⌕</span><label class="sr-only" for="taskSearch">Search task titles</label><input id="taskSearch" class="search-field" type="search" placeholder="Search task titles…" value="${esc(ui.taskQuery)}"></div><label class="sr-only" for="taskStatusFilter">Filter by status</label><select class="filter-select" id="taskStatusFilter"><option value="">All statuses</option>${TASK_STATUSES.map(item => `<option ${ui.taskStatus === item ? "selected" : ""}>${item}</option>`).join("")}</select><label class="sr-only" for="taskStudentFilter">Filter by student</label><select class="filter-select" id="taskStudentFilter"><option value="">All students</option>${state.students.map(item => `<option value="${esc(item.id)}" ${ui.taskStudent === item.id ? "selected" : ""}>${esc(item.fullName)}</option>`).join("")}</select><label class="check-label"><input id="taskOverdueFilter" type="checkbox" ${ui.taskOverdue ? "checked" : ""}>Overdue only</label><span class="toolbar-spacer"></span><span class="muted tiny">${tasks.length} results</span></div>
      <div class="table-wrap"><table><thead><tr><th scope="col">Task</th><th scope="col">Student</th><th scope="col">Due date</th><th scope="col">Status</th><th scope="col">Update</th><th scope="col"></th></tr></thead><tbody>${rows || `<tr><td class="table-empty" colspan="6"><strong>${state.tasks.length ? "No tasks match these filters" : "No tasks yet"}</strong>${state.tasks.length ? "Adjust your filters or add a new task." : "Create a task to start tracking student work."}</td></tr>`}</tbody></table></div><div class="table-foot"><span>${totals.pending} pending · ${totals.overdue} overdue</span><span>Overdue is calculated automatically</span></div></div>`;
  }
  function renderActivities() {
    const page = byId("activitiesView");
    const positives = state.activities.filter(item => item.type === "Positive").reduce((sum, item) => sum + item.points, 0);
    const negatives = state.activities.filter(item => item.type === "Negative").reduce((sum, item) => sum + item.points, 0);
    let activities = [...state.activities];
    if (ui.activityStudent) activities = activities.filter(item => item.studentId === ui.activityStudent);
    if (ui.activityType) activities = activities.filter(item => item.type === ui.activityType);
    if (ui.activityCategory) activities = activities.filter(item => item.category === ui.activityCategory);
    if (ui.activityFrom && ui.activityTo && ui.activityFrom > ui.activityTo) activities = [];
    else activities = activities.filter(item => (!ui.activityFrom || item.date >= ui.activityFrom) && (!ui.activityTo || item.date <= ui.activityTo));
    activities.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    const rows = activities.map(item => `<tr><td>${formatDate(item.date)}</td><td>${esc(studentName(item.studentId))}</td><td>${badge(item.type, item.type === "Positive" ? "green" : "red")}</td><td>${esc(item.category)}</td><td>${esc(item.description)}</td><td><strong>${item.type === "Positive" ? "+" : "−"}${item.points}</strong></td><td><div class="table-actions"><button aria-label="Edit activity" data-action="edit-activity" data-id="${esc(item.id)}">✎</button><button aria-label="Delete activity" data-action="delete-activity" data-id="${esc(item.id)}">×</button></div></td></tr>`).join("");
    page.innerHTML = `${heading("Activities & behaviour", "Recognise great work and keep a fair record of behaviour.", `<button class="button button-primary" data-action="add-activity"><span aria-hidden="true">＋</span> Log activity</button>`)}
      <div class="grid stats-grid">${statCard("Positive points", positives, "Earned by students", "✦", "green")}${statCard("Negative points", negatives, "Recorded as positive magnitude", "↓", "amber")}${statCard("Net points", positives - negatives, "Positive minus negative", "↗", "blue")}${statCard("Activity entries", state.activities.length, "Across all students", "▤", "")}</div>
      <div class="card table-card"><div class="table-toolbar"><label class="sr-only" for="activityStudentFilter">Filter by student</label><select class="filter-select" id="activityStudentFilter"><option value="">All students</option>${state.students.map(item => `<option value="${esc(item.id)}" ${ui.activityStudent === item.id ? "selected" : ""}>${esc(item.fullName)}</option>`).join("")}</select><label class="sr-only" for="activityTypeFilter">Filter by type</label><select class="filter-select" id="activityTypeFilter"><option value="">All types</option><option ${ui.activityType === "Positive" ? "selected" : ""}>Positive</option><option ${ui.activityType === "Negative" ? "selected" : ""}>Negative</option></select><label class="sr-only" for="activityCategoryFilter">Filter by category</label><select class="filter-select" id="activityCategoryFilter"><option value="">All categories</option>${[...CATEGORIES.Positive, ...CATEGORIES.Negative].map(item => `<option ${ui.activityCategory === item ? "selected" : ""}>${esc(item)}</option>`).join("")}</select><label class="inline-control" for="activityFrom">From <input id="activityFrom" type="date" value="${esc(ui.activityFrom)}"></label><label class="inline-control" for="activityTo">To <input id="activityTo" type="date" value="${esc(ui.activityTo)}"></label><span class="toolbar-spacer"></span><span class="muted tiny">${activities.length} records · newest first</span></div>
      <div class="table-wrap"><table><thead><tr><th scope="col">Date</th><th scope="col">Student</th><th scope="col">Type</th><th scope="col">Category</th><th scope="col">Description</th><th scope="col">Points</th><th scope="col"></th></tr></thead><tbody>${rows || `<tr><td colspan="7" class="table-empty"><strong>No activity records</strong>Add an entry to start tracking behaviour and achievements.</td></tr>`}</tbody></table></div></div>`;
  }
  function renderAnalysis() {
    const page = byId("analysisView");
    let matching = state.students.filter(student => `${student.fullName} ${student.studentCode} ${student.course} ${student.batch}`.toLowerCase().includes(ui.analysisQuery.trim().toLowerCase())).sort(nameSort);
    const chosen = ui.compared.map(id => state.students.find(student => student.id === id)).filter(Boolean);
    page.innerHTML = `${heading("Student analysis", "Search student progress and compare up to four profiles.")}<div class="split-layout"><div class="card"><div class="table-toolbar"><div class="search-wrap"><span class="search-symbol" aria-hidden="true">⌕</span><label class="sr-only" for="analysisSearch">Search students to compare</label><input id="analysisSearch" class="search-field" placeholder="Search by name, ID, course…" value="${esc(ui.analysisQuery)}"></div></div><div class="table-wrap"><table><thead><tr><th scope="col">Compare</th><th scope="col">Student</th><th scope="col">Course</th><th scope="col">Attendance</th><th scope="col">Tasks</th><th scope="col">Net points</th></tr></thead><tbody>${matching.map(student => { const metrics = performance(student.id); return `<tr><td><input class="compare-check" type="checkbox" aria-label="Add ${esc(student.fullName)} to comparison" data-action="compare-student" data-id="${esc(student.id)}" ${ui.compared.includes(student.id) ? "checked" : ""} ${ui.compared.length >= 4 && !ui.compared.includes(student.id) ? "disabled" : ""}></td><td><div class="person-cell">${avatar(student)}<span class="person-name"><strong>${esc(student.fullName)}</strong><small>${esc(student.studentCode)} · ${esc(student.batch)}</small></span></div></td><td>${esc(student.course)}</td><td>${metrics.attendance.percentage}</td><td>${metrics.tasks.completion}</td><td>${metrics.points.net > 0 ? "+" : ""}${metrics.points.net}</td></tr>`; }).join("") || `<tr><td colspan="6" class="table-empty"><strong>No matching students</strong>Try searching by another name or ID.</td></tr>`}</tbody></table></div><div class="table-foot"><span>${chosen.length} of 4 selected</span><button class="link-button" data-action="clear-comparison">Clear selection</button></div></div><article class="card card-pad"><div class="card-header" style="padding:0"><div><h2>How ratings work</h2><p>Transparent rules, shared across every report</p></div></div><div class="rating-list"><div class="rating-line"><span>Attendance</span><strong>Green ≥90% · Amber 75–89.9% · Red &lt;75%</strong></div><div class="rating-line"><span>Task completion</span><strong>Green ≥80% · Amber 50–79.9% · Red &lt;50%</strong></div><div class="rating-line"><span>Overdue tasks</span><strong>Green 0 · Amber 1–2 · Red 3+</strong></div><div class="rating-line"><span>Net points</span><strong>Green +10+ · Amber 0–9 · Red below 0</strong></div></div><div class="callout section-spacer">Overall status is Not Rated with fewer than two available indicators; At Risk if any available indicator is Red; Excellent if all are Green; Good if none is Red and at least one is Green; otherwise Needs Improvement.</div></article></div>
      <div class="card section-spacer">${chosen.length >= 2 ? renderComparison(chosen) : `<div class="no-data"><strong>Select two to four students</strong><br>Choose students in the table to compare their actual numbers side by side.</div>`}</div>`;
    const ruleLabels = [
      `Green ≥${RATING_RULES.attendance.green}% · Amber ${RATING_RULES.attendance.amber}–${(RATING_RULES.attendance.green - 0.1).toFixed(1)}% · Red &lt;${RATING_RULES.attendance.amber}%`,
      `Green ≥${RATING_RULES.completion.green}% · Amber ${RATING_RULES.completion.amber}–${(RATING_RULES.completion.green - 0.1).toFixed(1)}% · Red &lt;${RATING_RULES.completion.amber}%`,
      `Green ${RATING_RULES.overdue.green} · Amber 1–${RATING_RULES.overdue.amber} · Red ${RATING_RULES.overdue.amber + 1}+`,
      `Green +${RATING_RULES.points.green}+ · Amber ${RATING_RULES.points.amber}–${RATING_RULES.points.green - 1} · Red below ${RATING_RULES.points.amber}`
    ];
    $$(".rating-line strong", page).slice(0, ruleLabels.length).forEach((label, index) => { label.textContent = ruleLabels[index].replace("&lt;", "<"); });
  }
  function renderComparison(students) {
    const rows = students.map(student => {
      const metrics = performance(student.id);
      return { student, metrics };
    });
    return `<div class="card-header"><div><h2>Side-by-side comparison</h2><p>Values are shown beside every rating; no combined score is used.</p></div></div><div class="table-wrap"><table><thead><tr><th scope="col">Indicator</th>${rows.map(item => `<th scope="col">${esc(item.student.fullName)}</th>`).join("")}</tr></thead><tbody><tr><td>Attendance</td>${rows.map(item => `<td>${item.metrics.attendance.percentage} ${item.metrics.attendance.total ? badge(rate(percentageValue(item.metrics.attendance.present, item.metrics.attendance.total), RATING_RULES.attendance.green, RATING_RULES.attendance.amber, true).level, "gray") : ""}</td>`).join("")}</tr><tr><td>Task completion</td>${rows.map(item => `<td>${item.metrics.tasks.completion} ${item.metrics.tasks.total ? badge(rate(percentageValue(item.metrics.tasks.completed, item.metrics.tasks.total), RATING_RULES.completion.green, RATING_RULES.completion.amber, true).level, "gray") : ""}</td>`).join("")}</tr><tr><td>Overdue tasks</td>${rows.map(item => `<td>${item.metrics.tasks.overdue} ${item.metrics.tasks.total ? badge(rate(item.metrics.tasks.overdue, RATING_RULES.overdue.green, RATING_RULES.overdue.amber, false).level, "gray") : "N/A"}</td>`).join("")}</tr><tr><td>Net activity points</td>${rows.map(item => `<td>${item.metrics.points.net > 0 ? "+" : ""}${item.metrics.points.net}</td>`).join("")}</tr><tr><td>Overall status</td>${rows.map(item => `<td>${badge(item.metrics.overall, item.metrics.overall === "At Risk" ? "red" : item.metrics.overall === "Excellent" || item.metrics.overall === "Good" ? "green" : "gray")}</td>`).join("")}</tr></tbody></table></div>`;
  }
  function filterByRange(records, dateKey = "date") {
    return records.filter(item => (!ui.reportFrom || item[dateKey] >= ui.reportFrom) && (!ui.reportTo || item[dateKey] <= ui.reportTo));
  }
  function renderReports() {
    const page = byId("reportsView");
    const selected = state.students.find(student => student.id === ui.reportStudent);
    const attendance = filterByRange(state.attendance);
    const tasks = filterByRange(state.tasks, "dueDate");
    const activities = filterByRange(state.activities);
    const reportRange = ui.reportFrom || ui.reportTo ? `${ui.reportFrom ? formatDate(ui.reportFrom) : "All time"} to ${ui.reportTo ? formatDate(ui.reportTo) : "Today"}` : "All records";
    const reportBasis = "Attendance date · activity date · task due date";
    const hasPeriodRecords = attendance.length + tasks.length + activities.length > 0;
    let content;
    if (selected) {
      const student = selected;
      const studentAttendance = attendance.filter(item => item.studentId === student.id);
      const studentTasks = tasks.filter(item => item.studentId === student.id);
      const studentActivities = activities.filter(item => item.studentId === student.id);
      const metrics = performance(student.id);
      const studentPoints = totalsForActivities(studentActivities);
      content = `<div class="report-block"><h3>Student profile</h3><div class="profile-meta">${esc(student.studentCode)} · ${esc(student.fullName)} · ${esc(student.course)} · ${esc(student.batch)} · ${esc(student.phone)} · ${esc(student.email || "No email")} · ${esc(student.address || "No address")} · ${esc(student.status)} · Joined ${formatDate(student.joiningDate)} · Course progress ${student.courseProgress}%</div></div>
        <div class="report-block"><h3>Performance summary</h3><div class="report-summary"><div><span>Attendance</span><strong>${percent(studentAttendance.filter(item => item.status === "Present").length, studentAttendance.length)}</strong></div><div><span>Task completion</span><strong>${percent(studentTasks.filter(item => item.status === "Completed").length, studentTasks.length)}</strong></div><div><span>Pending tasks</span><strong>${studentTasks.filter(item => item.status === "Pending").length}</strong></div><div><span>In progress</span><strong>${studentTasks.filter(item => item.status === "In Progress").length}</strong></div><div><span>Overdue</span><strong>${totalsForTasks(studentTasks).overdue}</strong></div><div><span>Positive points</span><strong>${studentPoints.positive}</strong></div><div><span>Negative points</span><strong>${studentPoints.negative}</strong></div><div><span>Net points</span><strong>${studentPoints.net > 0 ? "+" : ""}${studentPoints.net}</strong></div></div></div>
        <div class="report-block"><h3>Performance indicators</h3><div class="indicator-grid">${indicatorCards(metrics)}</div></div>
        <div class="report-block"><h3>Attendance records (${studentAttendance.length})</h3>${simpleTable(["Date", "Status", "Remark"], studentAttendance.sort((a,b) => b.date.localeCompare(a.date)).map(item => [formatDate(item.date), item.status, item.remarks || "—"]))}</div>
        <div class="report-block"><h3>Tasks (${studentTasks.length})</h3>${simpleTable(["Task", "Due date", "Status"], studentTasks.sort((a,b) => a.dueDate.localeCompare(b.dueDate)).map(item => [item.title, formatDate(item.dueDate), `${item.status}${item.status !== "Completed" && item.dueDate < today() ? " · Overdue" : ""}`]))}</div>
        <div class="report-block"><h3>Activity history (${studentActivities.length})</h3>${simpleTable(["Date", "Category", "Description", "Points"], studentActivities.sort((a,b) => b.date.localeCompare(a.date)).map(item => [formatDate(item.date), item.category, item.description, `${item.type === "Positive" ? "+" : "−"}${item.points}`]))}</div>
        <div class="grid dashboard-grid equal report-block"><article class="card card-pad"><div class="card-header" style="padding:0"><div><h3>Attendance split</h3></div></div><div class="card-body"><div class="bar-chart">${chartBars(["Present","Absent","Leave"].map(status => ({status, count:studentAttendance.filter(item=>item.status===status).length})), "status", "count", null, ["green","red","amber"])}</div></div></article><article class="card card-pad"><div class="card-header" style="padding:0"><div><h3>Task status</h3></div></div><div class="card-body"><div class="bar-chart">${chartBars(TASK_STATUSES.map(status => ({status,count:studentTasks.filter(item=>item.status===status).length})), "status", "count", null, ["amber","blue","green"])}</div></div></article></div>`;
    } else {
      const visibleStudents = [...state.students];
      const totalAttendance = totalsForAttendance(attendance);
      const taskTotals = totalsForTasks(tasks);
      const pointTotals = totalsForActivities(activities);
      content = `<div class="report-block"><h3>Institute summary</h3><div class="report-summary"><div><span>Total students</span><strong>${visibleStudents.length}</strong></div><div><span>Present days</span><strong>${totalAttendance.present}</strong></div><div><span>Attendance rate</span><strong>${totalAttendance.percentage}</strong></div><div><span>Task completion</span><strong>${taskTotals.completion}</strong></div><div><span>Pending tasks</span><strong>${taskTotals.pending}</strong></div><div><span>Overdue tasks</span><strong>${taskTotals.overdue}</strong></div><div><span>Positive points</span><strong>${pointTotals.positive}</strong></div><div><span>Net points</span><strong>${pointTotals.net > 0 ? "+" : ""}${pointTotals.net}</strong></div></div></div>
        <div class="grid dashboard-grid equal report-block"><article class="card card-pad"><div class="card-header" style="padding:0"><div><h3>Students by course</h3></div></div><div class="card-body"><div class="bar-chart">${chartBars(courseCounts(), "course", "count", null, ["","blue","green","amber"])}</div></div></article><article class="card card-pad"><div class="card-header" style="padding:0"><div><h3>Tasks by status</h3></div></div><div class="card-body"><div class="bar-chart">${chartBars(TASK_STATUSES.map(status => ({status,count:tasks.filter(item=>item.status===status).length})), "status", "count", null, ["amber","blue","green"])}</div></div></article></div>
        <div class="report-block"><h3>Student list</h3>${simpleTable(["Student ID", "Name", "Phone", "Email", "Course", "Batch", "Status"], visibleStudents.sort(nameSort).map(student => [student.studentCode, student.fullName, student.phone, student.email || "—", student.course, student.batch, student.status]))}</div>
        <div class="report-block"><h3>Course-wise student counts</h3>${simpleTable(["Course", "Students"], courseCounts().map(item => [item.course, item.count]))}</div>
        <div class="report-block"><h3>Student performance</h3>${simpleTable(["Student", "Course", "Attendance", "Tasks", "Net points", "Overall"], visibleStudents.sort(nameSort).map(student => { const metrics=performance(student.id); return [student.fullName,student.course,metrics.attendance.percentage,metrics.tasks.completion,`${metrics.points.net>0?"+":""}${metrics.points.net}`,metrics.overall]; }))}</div>
        <div class="report-block"><h3>Attendance and leave summary</h3>${simpleTable(["Present", "Absent", "Leave", "Total recorded", "Attendance"], [[totalAttendance.present,totalAttendance.absent,totalAttendance.leave,totalAttendance.total,totalAttendance.percentage]])}</div>`;
    }
    page.innerHTML = `${heading("Reports", "Generate a print-ready overview from your current records.", `<button class="button button-secondary button-small no-print" data-action="print-report">Print report</button>`)}
      <div class="card card-pad no-print"><div class="date-range"><div class="form-field"><label for="reportFrom">From</label><input class="field" id="reportFrom" type="date" value="${esc(ui.reportFrom)}"></div><div class="form-field"><label for="reportTo">To</label><input class="field" id="reportTo" type="date" value="${esc(ui.reportTo)}"></div><div class="form-field" style="min-width:200px"><label for="reportStudent">Report type</label><select id="reportStudent" class="select-field"><option value="">Institute-wide report</option>${state.students.map(student=>`<option value="${esc(student.id)}" ${student.id===ui.reportStudent?"selected":""}>${esc(student.fullName)} · ${esc(student.studentCode)}</option>`).join("")}</select></div><button class="button button-primary button-small" data-action="apply-report">Update report</button></div><p class="hint">Dates filter attendance by attendance date, activities by activity date and tasks by due date. Select no range to include all records.</p></div>
      <article class="card card-pad section-spacer" id="reportContent"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:15px"><div><p class="eyebrow">MrGenie Institute · Performance report</p><h2 style="margin:0;font-size:21px">${selected ? esc(selected.fullName) : "Institute-wide report"}</h2><p class="muted tiny">Generated ${formatDateTime(isoNow())} · ${esc(reportRange)} · Filter basis: ${reportBasis}</p></div>${selected ? avatar(selected) : ""}</div>${ui.reportFrom || ui.reportTo ? hasPeriodRecords ? content : `<div class="no-data"><strong>No records for the selected period</strong>Try a wider date range or clear the date filters.</div>` : state.students.length || state.attendance.length || state.tasks.length || state.activities.length ? content : `<div class="no-data"><strong>No records for the selected period</strong>Load sample data or add records to build a report.</div>`}</article>`;
  }
  function simpleTable(headers, rows) {
    if (!rows.length) return `<div class="no-data">No records for the selected period.</div>`;
    return `<div class="table-wrap"><table><thead><tr>${headers.map(item => `<th scope="col">${esc(item)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(item => `<td>${esc(item)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  function renderData() {
    const page = byId("dataView");
    const bytes = Storage.usage();
    const usedPercent = Math.min(100, bytes / STORAGE_LIMIT * 100);
    page.innerHTML = `${heading("Data & settings", "Manage your workspace data and understand where it is stored.")}
      <div class="info-banner">This application saves records in this browser’s Local Storage. It works offline and does not send student data to a server.</div>
      <div class="grid data-grid">
        <article class="card data-action"><span class="stat-icon green">✦</span><div><h3>Load sample data</h3><p>Add ten example students, attendance history, tasks and activities. Existing records will be replaced after confirmation.</p><button class="button button-primary button-small" data-action="load-sample">Load sample data</button></div></article>
        <article class="card data-action"><span class="stat-icon blue">⇩</span><div><h3>Export a backup</h3><p>Download all current records as one JSON file for safekeeping or transfer to another browser.</p><button class="button button-secondary button-small" data-action="export-backup">Download backup</button><label class="button button-secondary button-small" for="backupFile" style="margin-left:5px">Restore backup</label><input class="sr-only" id="backupFile" type="file" accept=".json,application/json"></div></article>
        <article class="card data-action"><span class="stat-icon amber">▣</span><div><h3>Storage estimate</h3><p>Approximate browser storage used by this application.</p><div class="progress-line"><span>${(bytes / 1024).toFixed(1)} KB of approximately 5 MB</span><strong>${usedPercent.toFixed(1)}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${usedPercent}%"></div></div></div></article>
        <article class="card data-action"><span class="stat-icon" style="color:var(--red);background:var(--red-pale)">×</span><div><h3>Clear all data</h3><p>Permanently remove every student, attendance, task and activity record from this browser.</p><button class="button button-danger button-small" data-action="clear-data">Clear all data</button></div></article>
      </div>
      <article class="card card-pad section-spacer"><h2 style="margin:0;font-size:15px">Important privacy notice</h2><ul class="notice-list"><li>Local Storage is specific to one browser on one device; it does not provide cloud synchronisation.</li><li>This app does not provide secure multi-user access or authentication.</li><li>Records may be cleared by you or by your browser settings. Export backups regularly.</li><li>This demonstration app is not suitable for confidential real student data.</li></ul></article>`;
  }

  function formField(label, name, value = "", options = {}) {
    const required = options.required ? ` <span class="required-note">(required)</span>` : "";
    const id = `field-${name}`;
    const errorId = `${id}-error`;
    const common = `id="${id}" name="${name}" class="${options.type === "select" ? "select-field" : "field"}" ${options.required ? "required" : ""} ${options.maxlength ? `maxlength="${options.maxlength}"` : ""} ${options.minlength ? `minlength="${options.minlength}"` : ""} ${options.min !== undefined ? `min="${options.min}"` : ""} ${options.max !== undefined ? `max="${options.max}"` : ""} ${options.placeholder ? `placeholder="${esc(options.placeholder)}"` : ""} ${options.readonly ? "readonly" : ""} aria-describedby="${errorId}"`;
    let control;
    if (options.type === "select") {
      control = `<select ${common}><option value="">Select ${esc(label.toLowerCase())}</option>${options.values.map(item => {
        const optionValue = typeof item === "string" ? item : item.value;
        const optionLabel = typeof item === "string" ? item : item.label;
        return `<option value="${esc(optionValue)}" ${optionValue === value ? "selected" : ""}>${esc(optionLabel)}</option>`;
      }).join("")}</select>`;
    } else if (options.type === "textarea") {
      control = `<textarea ${common}>${esc(value)}</textarea>`;
    } else {
      control = `<input ${common} type="${options.type || "text"}" value="${esc(value)}">`;
    }
    return `<div class="form-field ${options.full ? "full" : ""}"><label for="${id}">${esc(label)}${required}</label>${control}<span class="field-error" id="${errorId}" aria-live="polite"></span>${options.hint ? `<span class="hint">${esc(options.hint)}</span>` : ""}</div>`;
  }
  function showDialog(html, focusSelector = null) {
    const dialog = byId("appDialog");
    dialogOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    byId("dialogContent").innerHTML = html;
    if (!dialog.open) dialog.showModal();
    window.setTimeout(() => {
      const target = focusSelector ? $(focusSelector, dialog) : $("button, input, select, textarea", dialog);
      target?.focus();
    }, 0);
  }
  function closeDialog() {
    const dialog = byId("appDialog");
    if (dialog.open) dialog.close();
  }
  function openStudentForm(id = "") {
    const student = state.students.find(item => item.id === id);
    const value = student || { studentCode: "", fullName: "", phone: "", email: "", address: "", course: "", batch: "", joiningDate: today(), status: "Active", courseProgress: 0 };
    const photoMarkup = student?.photo ? `<img class="photo-preview" id="photoPreview" src="${esc(student.photo)}" alt="Current profile photo">` : `<span class="avatar" id="photoFallback">${esc(initials(value.fullName) || "MG")}</span>`;
    showDialog(`<form class="dialog-form" data-form-type="student" data-id="${esc(id)}" novalidate>
      <div class="dialog-heading"><div><p class="eyebrow">${student ? "Update record" : "New enrolment"}</p><h2 id="dialogTitle">${student ? "Edit student" : "Add a student"}</h2><p>Enter the student’s contact and course details.</p></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Close dialog">×</button></div>
      <div class="form-grid">
        ${formField("Student ID", "studentCode", value.studentCode, { required: true, maxlength: 30, placeholder: "e.g. MGI-2026-001" })}
        ${formField("Full name", "fullName", value.fullName, { required: true, maxlength: 60, minlength: 2, placeholder: "Student full name" })}
        ${formField("Phone", "phone", value.phone, { required: true, maxlength: 16, placeholder: "+91 9876543210" })}
        ${formField("Email", "email", value.email, { type: "email", maxlength: 100, placeholder: "name@example.com" })}
        ${formField("Course", "course", value.course, { type: "select", required: true, values: COURSES })}
        ${formField("Batch", "batch", value.batch, { required: true, maxlength: 30, minlength: 2, placeholder: "e.g. 2026-A" })}
        ${formField("Joining date", "joiningDate", value.joiningDate, { type: "date", required: true })}
        ${formField("Status", "status", value.status, { type: "select", required: true, values: STUDENT_STATUSES })}
        ${formField("Course progress (%)", "courseProgress", value.courseProgress, { type: "number", min: 0, max: 100, required: true })}
        ${formField("Address", "address", value.address, { type: "textarea", maxlength: 250, full: true, placeholder: "Optional address" })}
        <div class="form-field full"><label for="photoFile">Profile photo</label><div style="display:flex;align-items:center;gap:14px">${photoMarkup}<div><input class="field file-control" id="photoFile" name="photoFile" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"><input type="hidden" name="removePhoto" value="false"><span class="hint">JPEG, PNG or WebP · up to 2 MB. Images are resized before saving.</span><button type="button" class="link-button" data-action="remove-photo">Remove photo</button></div></div><span class="field-error" id="photoFile-error" aria-live="polite"></span></div>
      </div>
      <div class="dialog-footer"><button type="button" class="button button-secondary" data-action="close-dialog">Cancel</button><button type="submit" class="button button-primary">${student ? "Save changes" : "Add student"}</button></div>
    </form>`, "#field-studentCode");
  }
  function openCourseBatchForm(id) {
    const student = state.students.find(item => item.id === id);
    if (!student) return;
    showDialog(`<form class="dialog-form" data-form-type="courseBatch" data-id="${esc(id)}" novalidate><div class="dialog-heading"><div><p class="eyebrow">Profile update</p><h2 id="dialogTitle">Update course &amp; batch</h2><p>Change these details without re-entering the rest of the profile.</p></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Close dialog">×</button></div><div class="form-grid">${formField("Course", "course", student.course, { type: "select", required: true, values: COURSES })}${formField("Batch", "batch", student.batch, { required: true, maxlength: 30, minlength: 2 })}</div><div class="dialog-footer"><button type="button" class="button button-secondary" data-action="close-dialog">Cancel</button><button type="submit" class="button button-primary">Save details</button></div></form>`, "#field-course");
  }
  function openAttendanceForm(id) {
    const record = state.attendance.find(item => item.id === id);
    if (!record) return;
    showDialog(`<form class="dialog-form" data-form-type="attendance" data-id="${esc(id)}" novalidate><div class="dialog-heading"><div><p class="eyebrow">Attendance record</p><h2 id="dialogTitle">Edit attendance</h2><p>${esc(studentName(record.studentId))} · Current date ${formatDate(record.date)}</p></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Close dialog">×</button></div><input type="hidden" name="studentId" value="${esc(record.studentId)}"><div class="form-grid">${formField("Date", "date", record.date, { type: "date", required: true, max: today() })}${formField("Status", "status", record.status, { type: "select", required: true, values: ATTENDANCE_STATUSES })}${formField("Remark", "remarks", record.remarks, { type: "textarea", maxlength: 200, full: true, placeholder: "Optional remark" })}</div><div class="dialog-footer"><button type="button" class="button button-secondary" data-action="close-dialog">Cancel</button><button type="submit" class="button button-primary">Save attendance</button></div></form>`, "#field-date");
  }
  function openTaskForm(id = "", studentId = "") {
    const task = state.tasks.find(item => item.id === id);
    const value = task || { studentId, title: "", description: "", assignedDate: today(), dueDate: today(), status: "Pending" };
    showDialog(`<form class="dialog-form" data-form-type="task" data-id="${esc(id)}" novalidate><div class="dialog-heading"><div><p class="eyebrow">Student work</p><h2 id="dialogTitle">${task ? "Edit task" : "Create a task"}</h2><p>Set an owner, deadline and current status.</p></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Close dialog">×</button></div>
      <div class="form-grid">${formField("Student", "studentId", value.studentId, { type: "select", required: true, values: state.students.map(item => ({ value: item.id, label: `${item.fullName} · ${item.studentCode}` })), full: true })}${formField("Task title", "title", value.title, { required: true, minlength: 3, maxlength: 100, full: true, placeholder: "What needs to be done?" })}${formField("Description", "description", value.description, { type: "textarea", maxlength: 500, full: true, placeholder: "Optional task details" })}${formField("Assigned date", "assignedDate", value.assignedDate, { type: "date", required: true })}${formField("Due date", "dueDate", value.dueDate, { type: "date", required: true })}${formField("Status", "status", value.status, { type: "select", required: true, values: TASK_STATUSES })}</div>
      <div class="dialog-footer"><button type="button" class="button button-secondary" data-action="close-dialog">Cancel</button><button type="submit" class="button button-primary">${task ? "Save task" : "Create task"}</button></div></form>`, "#field-studentId");
  }
  function openActivityForm(id = "", studentId = "") {
    const activity = state.activities.find(item => item.id === id);
    const value = activity || { studentId, date: today(), type: "Positive", category: "", description: "", points: 5 };
    const categories = CATEGORIES[value.type] || CATEGORIES.Positive;
    showDialog(`<form class="dialog-form" data-form-type="activity" data-id="${esc(id)}" novalidate><div class="dialog-heading"><div><p class="eyebrow">Student recognition</p><h2 id="dialogTitle">${activity ? "Edit activity" : "Log an activity"}</h2><p>Record a positive achievement or an area to improve.</p></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Close dialog">×</button></div>
      <div class="form-grid">${formField("Student", "studentId", value.studentId, { type: "select", required: true, values: state.students.map(item => ({ value: item.id, label: `${item.fullName} · ${item.studentCode}` })), full: true })}${formField("Type", "type", value.type, { type: "select", required: true, values: ["Positive", "Negative"] })}${formField("Category", "category", value.category || categories[0], { type: "select", required: true, values: categories })}${formField("Date", "date", value.date, { type: "date", required: true, max: today() })}${formField("Points", "points", value.points, { type: "number", min: 1, max: 100, required: true })}${formField("Description", "description", value.description, { type: "textarea", required: true, minlength: 5, maxlength: 300, full: true, placeholder: "Describe the activity (5–300 characters)" })}</div>
      <div class="dialog-footer"><button type="button" class="button button-secondary" data-action="close-dialog">Cancel</button><button type="submit" class="button button-primary">${activity ? "Save activity" : "Add activity"}</button></div></form>`, "#field-studentId");
  }
  function showConfirm(title, message, actionLabel, action, danger = true) {
    showDialog(`<div class="confirm-content"><div class="dialog-heading"><div><p class="eyebrow">Please confirm</p><h2 id="dialogTitle">${esc(title)}</h2></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Close dialog">×</button></div><p>${esc(message)}</p><div class="dialog-footer"><button type="button" class="button button-secondary" data-action="close-dialog" data-cancel-focus>Cancel</button><button type="button" class="button ${danger ? "button-danger" : "button-primary"}" data-action="${esc(action)}">${esc(actionLabel)}</button></div></div>`, "[data-cancel-focus]");
  }
  function setFieldError(form, name, message) {
    const control = form.elements.namedItem(name);
    const error = byId(`field-${name}-error`);
    if (control instanceof HTMLElement) {
      control.setAttribute("aria-invalid", message ? "true" : "false");
      if (message) control.focus();
    }
    if (error) error.textContent = message;
  }
  function validateForm(form, rules) {
    let firstInvalid = null;
    Object.entries(rules).forEach(([name, rule]) => {
      const control = form.elements.namedItem(name);
      const value = String(control?.value || "").trim();
      const error = rule(value, form);
      setFieldError(form, name, error || "");
      if (error && !firstInvalid) firstInvalid = control;
    });
    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  }
  const isValidEmail = value => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  function studentRules(form) {
    const id = form.elements.studentCode.value.trim().toLowerCase();
    const currentId = form.dataset.id;
    return {
      studentCode: value => !value ? "Enter a student ID." : state.students.some(item => item.studentCode.trim().toLowerCase() === id && item.id !== currentId) ? "This student ID is already in use." : value.length > 30 ? "Use no more than 30 characters." : "",
      fullName: value => !value ? "Enter the student’s full name." : value.length < 2 || value.length > 60 ? "Use 2 to 60 characters." : !/^[\p{L}\s'.-]+$/u.test(value) ? "Use letters, spaces, apostrophes, hyphens or full stops." : "",
      phone: value => !value ? "Enter a phone number." : !/^\+?\d{10,15}$/.test(value.replace(/[\s()-]/g, "")) ? "Enter 10–15 digits, optionally starting with +." : "",
      email: value => !isValidEmail(value) ? "Enter a valid email address." : "",
      course: value => !COURSES.includes(value) ? "Choose a course." : "",
      batch: value => value.length < 2 || value.length > 30 ? "Enter a batch name from 2 to 30 characters." : "",
      joiningDate: value => !validDate(value) ? "Choose a valid joining date." : "",
      status: value => !STUDENT_STATUSES.includes(value) ? "Choose a status." : "",
      courseProgress: value => !/^\d+$/.test(value) || Number(value) < 0 || Number(value) > 100 ? "Enter a whole number from 0 to 100." : ""
    };
  }
  function taskRules() {
    return {
      studentId: value => !state.students.some(student => student.id === value) ? "Choose an existing student." : "",
      title: value => value.length < 3 || value.length > 100 ? "Enter a title from 3 to 100 characters." : "",
      assignedDate: value => !validDate(value) ? "Choose a valid assigned date." : "",
      dueDate: (value, form) => !validDate(value) ? "Choose a valid due date." : value < form.elements.assignedDate.value ? "The due date cannot be before the assigned date." : "",
      status: value => !TASK_STATUSES.includes(value) ? "Choose a task status." : ""
    };
  }
  function activityRules() {
    return {
      studentId: value => !state.students.some(student => student.id === value) ? "Choose an existing student." : "",
      date: value => !validDate(value) || value > today() ? "Choose a valid date that is not in the future." : "",
      type: value => !Object.hasOwn(CATEGORIES, value) ? "Choose Positive or Negative." : "",
      category: (value, form) => !CATEGORIES[form.elements.type.value]?.includes(value) ? "Choose a category for this type." : "",
      description: value => value.length < 5 || value.length > 300 ? "Enter a description from 5 to 300 characters." : "",
      points: value => !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100 ? "Enter a whole number from 1 to 100." : ""
    };
  }
  function attendanceRules(form) {
    return {
      date: value => !validDate(value) || value > today() ? "Choose a valid date that is not in the future." : "",
      status: value => !ATTENDANCE_STATUSES.includes(value) ? "Choose Present, Absent or Leave." : "",
      remarks: value => value.length > 200 ? "Use no more than 200 characters." : ""
    };
  }
  function processPhoto(file) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve(null);
      const extension = file.name.split(".").pop().toLowerCase();
      const allowed = ["jpg", "jpeg", "png", "webp"];
      const mimeAllowed = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
      if (!allowed.includes(extension) || !mimeAllowed) return reject(new Error("Choose a JPEG, PNG or WebP image."));
      if (file.size > 2 * 1024 * 1024) return reject(new Error("The image must be smaller than 2 MB."));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("The image file could not be read."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("This file could not be decoded as an image."));
        image.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            const scale = Math.min(256 / image.width, 256 / image.height, 1);
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            const context = canvas.getContext("2d");
            if (!context) return reject(new Error("Your browser could not process this image."));
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", 0.7));
          } catch (error) {
            reject(new Error("The image could not be resized. Choose a different image."));
          }
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  async function submitForm(form) {
    const type = form.dataset.formType;
    const rules = type === "student" ? studentRules(form) : type === "task" ? taskRules() : type === "attendance" ? attendanceRules(form) : type === "courseBatch" ? {
      course: value => !COURSES.includes(value) ? "Choose a course." : "",
      batch: value => value.length < 2 || value.length > 30 ? "Enter a batch name from 2 to 30 characters." : ""
    } : activityRules();
    if (!validateForm(form, rules)) return;
    const data = Object.fromEntries(new FormData(form).entries());
    const id = form.dataset.id;
    const now = isoNow();
    const next = Storage.snapshot();
    try {
      if (type === "student") {
        const existing = state.students.find(item => item.id === id);
        const selectedFile = form.elements.photoFile.files[0];
        let photo = form.elements.removePhoto?.value === "true" ? null : existing?.photo || null;
        if (selectedFile) {
          try { photo = await processPhoto(selectedFile); }
          catch (error) { setFieldError(form, "photoFile", error.message); return; }
        }
        const student = {
          id: existing?.id || makeId(), studentCode: data.studentCode.trim(), fullName: data.fullName.trim(),
          phone: data.phone.trim(), email: data.email.trim(), address: data.address.trim(), course: data.course,
          batch: data.batch.trim(), joiningDate: data.joiningDate, status: data.status,
          courseProgress: Number(data.courseProgress), photo, createdAt: existing?.createdAt || now, updatedAt: now
        };
        next.students = existing ? next.students.map(item => item.id === id ? student : item) : [...next.students, student];
      } else if (type === "courseBatch") {
        const existing = next.students.find(item => item.id === id);
        if (!existing) return;
        next.students = next.students.map(item => item.id === id ? { ...item, course: data.course, batch: data.batch.trim(), updatedAt: now } : item);
      } else if (type === "attendance") {
        const existing = next.attendance.find(item => item.id === id);
        if (!existing) return;
        const duplicate = next.attendance.some(item => item.id !== id && item.studentId === existing.studentId && item.date === data.date);
        if (duplicate) {
          notify("This student already has an attendance record for that date. Edit the existing record instead.", "error", true);
          setFieldError(form, "date", "A record already exists for this student on this date.");
          return;
        }
        next.attendance = next.attendance.map(item => item.id === id ? { ...item, date: data.date, status: data.status, remarks: data.remarks.trim(), updatedAt: now } : item);
      } else if (type === "task") {
        const existing = state.tasks.find(item => item.id === id);
        const task = { id: existing?.id || makeId(), studentId: data.studentId, title: data.title.trim(), description: data.description.trim(), assignedDate: data.assignedDate, dueDate: data.dueDate, status: data.status, completedDate: data.status === "Completed" ? existing?.status === "Completed" ? existing.completedDate : today() : null, createdAt: existing?.createdAt || now, updatedAt: now };
        next.tasks = existing ? next.tasks.map(item => item.id === id ? task : item) : [...next.tasks, task];
      } else {
        const existing = state.activities.find(item => item.id === id);
        const activity = { id: existing?.id || makeId(), studentId: data.studentId, date: data.date, type: data.type, category: data.category, description: data.description.trim(), points: Number(data.points), createdAt: existing?.createdAt || now, updatedAt: now };
        next.activities = existing ? next.activities.map(item => item.id === id ? activity : item) : [...next.activities, activity];
      }
      if (!Storage.save(next)) return;
      if (type === "student") ui.selectedStudent = "";
      closeDialog();
      renderAll();
      notify(`${type === "student" ? "Student" : type === "courseBatch" ? "Student course details" : type === "attendance" ? "Attendance" : type === "task" ? "Task" : "Activity"} ${id ? "updated" : "added"} successfully.`);
    } catch (error) {
      notify(`The record could not be saved: ${error.message}`, "error", true);
    }
  }

  function saveAttendance() {
    const date = ui.attendanceDate;
    if (!validDate(date) || date > today()) {
      notify("Choose today or an earlier date for attendance.", "error", true);
      return;
    }
    const next = Storage.snapshot();
    const students = state.students.filter(student => student.status === "Active");
    const dateRecords = state.attendance.filter(record => record.date === date);
    const updatedIds = new Set();
    const now = isoNow();
    students.forEach(student => {
      const row = $(`[data-attendance-student="${CSS.escape(student.id)}"]`, byId("attendanceView"));
      if (!row) return;
      const status = $('input[type="radio"]:checked', row)?.value;
      if (!ATTENDANCE_STATUSES.includes(status)) return;
      const existing = dateRecords.find(record => record.studentId === student.id);
      const record = { id: existing?.id || makeId(), studentId: student.id, date, status, remarks: $(".attendance-remark", row).value.trim(), createdAt: existing?.createdAt || now, updatedAt: now };
      if (existing) next.attendance = next.attendance.map(item => item.id === existing.id ? record : item);
      else next.attendance.push(record);
      updatedIds.add(student.id);
    });
    const unique = new Set();
    const duplicate = next.attendance.some(record => {
      const key = `${record.studentId}|${record.date}`;
      if (unique.has(key)) return true;
      unique.add(key);
      return false;
    });
    if (duplicate) {
      notify("A student already has an attendance record for this date. Reopen the sheet to edit the existing record.", "error", true);
      return;
    }
    if (!Storage.save(next)) return;
    renderAll();
    notify(`Attendance saved for ${updatedIds.size} student${updatedIds.size === 1 ? "" : "s"}.`);
  }
  function deleteStudent(id) {
    const student = state.students.find(item => item.id === id);
    if (!student) return;
    const related = {
      attendance: state.attendance.filter(item => item.studentId === id).length,
      tasks: state.tasks.filter(item => item.studentId === id).length,
      activities: state.activities.filter(item => item.studentId === id).length
    };
    showConfirm(`Delete ${student.fullName}?`, `Student ${student.studentCode} and all related data will be permanently removed: ${related.attendance} attendance record(s), ${related.tasks} task(s) and ${related.activities} activity record(s). This cannot be undone.`, "Delete student", `confirm-delete-student:${id}`);
  }
  function deleteRecord(type, id) {
    const names = { task: "task", activity: "activity", attendance: "attendance record" };
    const collection = type === "task" ? state.tasks : type === "activity" ? state.activities : state.attendance;
    const item = collection.find(record => record.id === id);
    if (!item) return;
    const title = type === "task" ? item.title : type === "activity" ? item.description : `${studentName(item.studentId)} · ${formatDate(item.date)}`;
    showConfirm(`Delete this ${names[type]}?`, `“${title}” will be permanently removed. This action cannot be undone.`, "Delete", `confirm-delete-${type}:${id}`);
  }
  function confirmDelete(type, id) {
    const next = Storage.snapshot();
    if (type === "student") {
      next.students = next.students.filter(item => item.id !== id);
      next.attendance = next.attendance.filter(item => item.studentId !== id);
      next.tasks = next.tasks.filter(item => item.studentId !== id);
      next.activities = next.activities.filter(item => item.studentId !== id);
      if (ui.selectedStudent === id) ui.selectedStudent = "";
    } else if (type === "task") next.tasks = next.tasks.filter(item => item.id !== id);
    else if (type === "activity") next.activities = next.activities.filter(item => item.id !== id);
    else if (type === "attendance") next.attendance = next.attendance.filter(item => item.id !== id);
    if (Storage.save(next)) {
      closeDialog();
      renderAll();
      notify(`${type === "student" ? "Student and related records" : type === "task" ? "Task" : type === "activity" ? "Activity" : "Attendance record"} deleted.`);
    }
  }

  function samplePhoto(name, color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="64" fill="${color}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial,sans-serif" font-size="38" font-weight="700" fill="#ffffff">${initials(name)}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
  function buildSampleData() {
    const now = isoNow();
    const details = [
      ["MGI-2026-001","Aarav Mehta","+91 9876543210","aarav@example.com",COURSES[0],"2026-A","Active",82],
      ["MGI-2026-002","Diya Nair","+91 9876543211","diya@example.com",COURSES[1],"2026-A","Active",65],
      ["MGI-2026-003","Kabir Shah","+91 9876543212","kabir@example.com",COURSES[2],"2026-B","Active",48],
      ["MGI-2026-004","Mira Iyer","+91 9876543213","mira@example.com",COURSES[0],"2026-B","Active",93],
      ["MGI-2026-005","Rohan Das","+91 9876543214","rohan@example.com",COURSES[3],"2026-A","Active",37],
      ["MGI-2026-006","Anaya Rao","+91 9876543215","anaya@example.com",COURSES[1],"2026-B","Active",74],
      ["MGI-2026-007","Ishaan Kapoor","+91 9876543216","ishaan@example.com",COURSES[2],"2026-A","Active",56],
      ["MGI-2026-008","Sara Thomas","+91 9876543217","sara@example.com",COURSES[3],"2026-B","Active",89],
      ["MGI-2026-009","Neil Joseph","+91 9876543218","neil@example.com",COURSES[0],"2025-C","Inactive",100],
      ["MGI-2026-010","Tara Menon","+91 9876543219","tara@example.com",COURSES[1],"2025-C","Completed",100]
    ];
    const colors = ["#6d78d9", "#48a58a", "#d18b53", "#8d70c8", "#cf7182"];
    const students = details.map((row, index) => {
      const student = { id: `sample-student-${index + 1}`, studentCode: row[0], fullName: row[1], phone: row[2], email: row[3], address: `${index + 12} Lake View Road`, course: row[4], batch: row[5], joiningDate: `${index % 2 ? "2026-06" : "2026-05"}-${String((index % 20) + 1).padStart(2, "0")}`, status: row[6], courseProgress: row[7], photo: index % 3 === 0 ? samplePhoto(row[1], colors[index % colors.length]) : null, createdAt: now, updatedAt: now };
      return student;
    });
    const active = students.filter(student => student.status === "Active");
    const attendance = [];
    for (let offset = 13; offset >= 0; offset -= 1) {
      const dateObject = new Date();
      dateObject.setDate(dateObject.getDate() - offset);
      const date = `${dateObject.getFullYear()}-${String(dateObject.getMonth() + 1).padStart(2, "0")}-${String(dateObject.getDate()).padStart(2, "0")}`;
      active.forEach((student, studentIndex) => {
        const status = offset === 0 && studentIndex === 0 ? "Present" : studentIndex === 2 && offset % 3 === 0 ? "Leave" : (offset + studentIndex * 3) % 9 === 0 ? "Absent" : "Present";
        attendance.push({ id: makeId(), studentId: student.id, date, status, remarks: status === "Leave" ? "Approved leave" : "", createdAt: now, updatedAt: now });
      });
    }
    const taskPlan = [
      [0,"Build a responsive landing page",-7,"Completed"],[0,"JavaScript array practice",1,"In Progress"],[1,"Design a course dashboard",-3,"Pending"],
      [1,"Accessibility review",5,"Pending"],[2,"Data visualisation exercise",-2,"In Progress"],[2,"Weekly reflection",2,"Completed"],
      [3,"Portfolio case study",0,"Pending"],[3,"Wireframe a mobile app",4,"Completed"],[4,"CSS layout challenge",-1,"Pending"],
      [4,"DOM events worksheet",3,"In Progress"],[5,"API concepts quiz",7,"Pending"],[5,"Responsive navigation",0,"Completed"],
      [6,"Spreadsheet analysis",2,"Pending"],[7,"Prototype usability test",6,"In Progress"],[7,"Final project outline",8,"Pending"]
    ];
    const tasks = taskPlan.map(([studentIndex, title, days, status], index) => {
      const due = new Date(); due.setDate(due.getDate() + days);
      const dueDate = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
      const assigned = new Date(due); assigned.setDate(assigned.getDate() - 7);
      if (assigned > new Date()) assigned.setTime(new Date().setHours(0, 0, 0, 0));
      const assignedDate = `${assigned.getFullYear()}-${String(assigned.getMonth() + 1).padStart(2, "0")}-${String(assigned.getDate()).padStart(2, "0")}`;
      return { id: `sample-task-${index + 1}`, studentId: active[studentIndex].id, title, description: "Sample assignment for student progress tracking.", assignedDate, dueDate, status, completedDate: status === "Completed" ? today() : null, createdAt: now, updatedAt: now };
    });
    const activityRows = [
      [0,"Positive",0,10],[0,"Positive",2,8],[0,"Negative",0,3],[1,"Positive",1,7],[1,"Negative",1,8],
      [2,"Negative",2,12],[2,"Negative",3,6],[2,"Positive",3,4],[3,"Positive",0,15],[3,"Positive",4,10],
      [4,"Negative",4,9],[4,"Negative",0,7],[4,"Positive",2,3],[5,"Positive",1,6],[5,"Negative",3,4],
      [6,"Positive",3,8],[6,"Negative",1,5],[7,"Positive",2,12],[7,"Positive",4,9],[1,"Positive",0,5]
    ];
    const activities = activityRows.map(([studentIndex, type, categoryIndex, points], index) => {
      const date = new Date(); date.setDate(date.getDate() - index % 12);
      const dateValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return { id: `sample-activity-${index + 1}`, studentId: active[studentIndex].id, date: dateValue, type, category: CATEGORIES[type][categoryIndex], description: type === "Positive" ? "Made a thoughtful contribution and showed strong effort." : "Needs to improve consistency and classroom readiness.", points, createdAt: now, updatedAt: now };
    });
    return { students, attendance, tasks, activities, meta: { schemaVersion: 1, sampleDataLoaded: true } };
  }
  function loadSampleData() {
    showConfirm("Load sample data?", "This replaces all records currently saved in this browser with a fresh set of ten realistic sample students, attendance, tasks and activities.", "Replace with samples", "confirm-load-sample", false);
  }
  function clearAllData() {
    showConfirm("Clear all application data?", "All students and every related attendance, task and activity record will be permanently deleted from this browser.", "Clear all data", "confirm-clear-data", true);
  }
  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  function exportBackup() {
    const backup = { schemaVersion: 1, exportedAt: isoNow(), students: state.students, attendance: state.attendance, tasks: state.tasks, activities: state.activities };
    downloadFile(`mgi-student-data-${today()}.json`, JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
    notify("Backup downloaded.");
  }
  function validateBackup(data) {
    if (!data || data.schemaVersion !== 1 || !Array.isArray(data.students) || !Array.isArray(data.attendance) || !Array.isArray(data.tasks) || !Array.isArray(data.activities)) return false;
    const ids = new Set(data.students.map(item => item?.id));
    return data.students.every(item => item && typeof item.id === "string" && typeof item.studentCode === "string" && typeof item.fullName === "string" && STUDENT_STATUSES.includes(item.status))
      && data.attendance.every(item => item && ids.has(item.studentId) && validDate(item.date) && ATTENDANCE_STATUSES.includes(item.status))
      && data.tasks.every(item => item && ids.has(item.studentId) && TASK_STATUSES.includes(item.status) && typeof item.title === "string")
      && data.activities.every(item => item && ids.has(item.studentId) && CATEGORIES[item.type]?.includes(item.category) && Number.isInteger(item.points));
  }
  async function importBackup(file) {
    if (!file) return;
    try {
      const text = await file.text();
      let data;
      try { data = JSON.parse(text); }
      catch (error) { throw new Error("The selected file is not valid JSON."); }
      if (!validateBackup(data)) throw new Error("The backup structure or its records are invalid. Your current data was not changed.");
      showConfirm("Restore this backup?", `This will replace current data with ${data.students.length} student(s), ${data.attendance.length} attendance record(s), ${data.tasks.length} task(s) and ${data.activities.length} activity record(s).`, "Restore backup", "confirm-restore-backup", false);
      window.pendingBackup = data;
    } catch (error) {
      notify(error.message, "error", true);
    }
  }

  function handleAction(action, target) {
    const id = target.dataset.id;
    if (action.startsWith("confirm-delete-")) {
      const [type, recordId] = action.replace("confirm-delete-", "").split(":");
      confirmDelete(type, recordId);
      return;
    }
    switch (action) {
      case "add-student": ui.selectedStudent = ""; openStudentForm(); break;
      case "edit-student": openStudentForm(id); break;
      case "edit-course-batch": openCourseBatchForm(id); break;
      case "edit-attendance": openAttendanceForm(id); break;
      case "profile": ui.selectedStudent = id; setPage("students"); break;
      case "back-students": ui.selectedStudent = ""; renderStudents(); break;
      case "add-task": openTaskForm("", ui.selectedStudent); break;
      case "edit-task": openTaskForm(id); break;
      case "add-activity": openActivityForm("", ui.selectedStudent); break;
      case "edit-activity": openActivityForm(id); break;
      case "delete-student": deleteStudent(id); break;
      case "delete-task": deleteRecord("task", id); break;
      case "delete-activity": deleteRecord("activity", id); break;
      case "delete-attendance": deleteRecord("attendance", id); break;
      case "close-dialog": closeDialog(); break;
      case "remove-photo": {
        const form = target.closest("form");
        if (form) {
          form.elements.photoFile.value = "";
          form.elements.removePhoto.value = "true";
          $("#photoPreview, #photoFallback", form)?.remove();
          $("#photoFile-error", form).textContent = "";
        }
        break;
      }
      case "clear-student-search": ui.studentQuery = ""; ui.studentCourse = ""; ui.studentBatch = ""; ui.studentStatus = ""; renderStudents(); break;
      case "mark-all-present": $$(".attendance-options input[value='Present']").forEach(input => { input.checked = true; }); break;
      case "save-attendance": saveAttendance(); break;
      case "attendance-report": setPage("reports"); break;
      case "clear-comparison": ui.compared = []; renderAnalysis(); break;
      case "print-report": window.print(); break;
      case "apply-report": {
        const from = $("#reportFrom").value;
        const to = $("#reportTo").value;
        if (from && to && from > to) { notify("The From date must not be later than the To date.", "error", true); $("#reportFrom").focus(); return; }
        ui.reportFrom = from;
        ui.reportTo = to;
        ui.reportStudent = $("#reportStudent").value;
        renderReports();
        break;
      }
      case "load-sample": loadSampleData(); break;
      case "confirm-load-sample": {
        const next = buildSampleData();
        if (Storage.save(next)) { ui.selectedStudent = ""; closeDialog(); renderAll(); notify("Sample data loaded. Explore each section from the navigation."); }
        break;
      }
      case "clear-data": clearAllData(); break;
      case "confirm-clear-data": {
        const next = { students: [], attendance: [], tasks: [], activities: [], meta: { schemaVersion: 1 } };
        if (Storage.save(next)) { ui.selectedStudent = ""; closeDialog(); renderAll(); notify("All application data has been cleared."); }
        break;
      }
      case "export-backup": exportBackup(); break;
      case "confirm-restore-backup": {
        const data = window.pendingBackup;
        if (data && validateBackup(data) && Storage.save({ students: data.students, attendance: data.attendance, tasks: data.tasks, activities: data.activities, meta: { schemaVersion: 1 } })) {
          window.pendingBackup = null; closeDialog(); renderAll(); notify("Backup restored successfully.");
        }
        break;
      }
      default:
        if (action.startsWith("confirm-delete-")) return;
    }
  }

  document.addEventListener("click", event => {
    const nav = event.target.closest("[data-view]");
    if (nav) { event.preventDefault(); setPage(nav.dataset.view); return; }
    const target = event.target.closest("[data-action]");
    if (!target) return;
    handleAction(target.dataset.action, target);
  });
  document.addEventListener("submit", event => {
    const form = event.target.closest("form[data-form-type]");
    if (!form) return;
    event.preventDefault();
    submitForm(form);
  });
  document.addEventListener("input", event => {
    const { id, value } = event.target;
    if (id === "studentSearch") { ui.studentQuery = value; renderStudents(); $("#studentSearch")?.focus(); $("#studentSearch")?.setSelectionRange(value.length, value.length); }
    if (id === "taskSearch") { ui.taskQuery = value; renderTasks(); $("#taskSearch")?.focus(); $("#taskSearch")?.setSelectionRange(value.length, value.length); }
    if (id === "analysisSearch") { ui.analysisQuery = value; renderAnalysis(); $("#analysisSearch")?.focus(); $("#analysisSearch")?.setSelectionRange(value.length, value.length); }
    if (event.target.name === "type" && event.target.closest('[data-form-type="activity"]')) {
      const form = event.target.form;
      const category = form.elements.category;
      const options = CATEGORIES[event.target.value] || CATEGORIES.Positive;
      category.innerHTML = options.map(item => `<option value="${esc(item)}">${esc(item)}</option>`).join("");
    }
    if (id === "photoFile") {
      const file = event.target.files[0];
      const error = byId("photoFile-error");
      if (!file) return;
      const allowed = ["jpg", "jpeg", "png", "webp"].includes(file.name.split(".").pop().toLowerCase()) && ["image/jpeg", "image/png", "image/webp"].includes(file.type);
      if (!allowed || file.size > 2 * 1024 * 1024) {
        error.textContent = !allowed ? "Choose a JPEG, PNG or WebP image." : "The image must be smaller than 2 MB.";
        event.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => {
          const previous = $("#photoPreview, #photoFallback");
          const preview = document.createElement("img");
          preview.className = "photo-preview";
          preview.id = "photoPreview";
          preview.alt = "Selected profile photo preview";
          preview.src = reader.result;
          previous?.replaceWith(preview);
        };
        image.onerror = () => { error.textContent = "This file could not be decoded as an image."; };
        image.src = reader.result;
      };
      reader.onerror = () => { error.textContent = "The image file could not be read."; };
      reader.readAsDataURL(file);
      error.textContent = "";
      event.target.form.elements.removePhoto.value = "false";
    }
  });
  document.addEventListener("change", event => {
    const target = event.target;
    if (target.id === "attendanceDate") {
      if (target.value > today()) { target.value = today(); notify("Future attendance dates are not allowed.", "error", true); }
      ui.attendanceDate = target.value || today();
      renderAttendance();
    } else if (target.id === "dashboardDate") {
      if (target.value > today()) { target.value = today(); notify("Future attendance dates are not allowed.", "error", true); }
      ui.attendanceDate = target.value || today();
      renderDashboard();
    } else if (target.id === "studentCourseFilter") { ui.studentCourse = target.value; renderStudents(); }
    else if (target.id === "studentBatchFilter") { ui.studentBatch = target.value; renderStudents(); }
    else if (target.id === "studentStatusFilter") { ui.studentStatus = target.value; renderStudents(); }
    else if (target.id === "studentSort") { ui.studentSort = target.value; renderStudents(); }
    else if (target.id === "taskStatusFilter") { ui.taskStatus = target.value; renderTasks(); }
    else if (target.id === "taskStudentFilter") { ui.taskStudent = target.value; renderTasks(); }
    else if (target.id === "taskOverdueFilter") { ui.taskOverdue = target.checked; renderTasks(); }
    else if (target.id === "activityStudentFilter") { ui.activityStudent = target.value; renderActivities(); }
    else if (target.id === "activityTypeFilter") { ui.activityType = target.value; renderActivities(); }
    else if (target.id === "activityCategoryFilter") { ui.activityCategory = target.value; renderActivities(); }
    else if (target.id === "activityFrom") { ui.activityFrom = target.value; renderActivities(); }
    else if (target.id === "activityTo") { ui.activityTo = target.value; renderActivities(); }
    else if (target.id === "attendanceStudentFilter") { ui.attendanceStudent = target.value; renderAttendance(); }
    else if (target.id === "attendanceFrom") { ui.attendanceFrom = target.value; renderAttendance(); }
    else if (target.id === "attendanceTo") { ui.attendanceTo = target.value; renderAttendance(); }
    else if (target.matches(".task-status-change")) {
      const next = Storage.snapshot();
      const task = next.tasks.find(item => item.id === target.dataset.id);
      if (!task) return;
      const status = target.value;
      task.status = status;
      task.completedDate = status === "Completed" ? task.completedDate || today() : null;
      task.updatedAt = isoNow();
      if (Storage.save(next)) { renderAll(); notify("Task status updated."); }
    } else if (target.matches('[data-action="compare-student"]')) {
      const id = target.dataset.id;
      if (target.checked && ui.compared.length < 4) ui.compared.push(id);
      else if (!target.checked) ui.compared = ui.compared.filter(item => item !== id);
      renderAnalysis();
    } else if (target.id === "backupFile") {
      importBackup(target.files[0]);
      target.value = "";
    }
  });
  byId("menuToggle").addEventListener("click", () => {
    const open = byId("sidebar").classList.toggle("is-open");
    byId("sidebarScrim").classList.toggle("is-visible", open);
    byId("menuToggle").setAttribute("aria-expanded", String(open));
  });
  byId("sidebarScrim").addEventListener("click", () => {
    byId("sidebar").classList.remove("is-open");
    byId("sidebarScrim").classList.remove("is-visible");
    byId("menuToggle").setAttribute("aria-expanded", "false");
  });
  byId("appDialog").addEventListener("close", () => {
    if (dialogOpener?.isConnected) dialogOpener.focus();
    dialogOpener = null;
  });
  window.addEventListener("storage", event => {
    if (Object.values(KEYS).includes(event.key)) { Storage.load(); renderAll(); notify("Data was updated in another browser tab."); }
  });

  Storage.load();
  renderAll();
  setPage("dashboard");
})();
