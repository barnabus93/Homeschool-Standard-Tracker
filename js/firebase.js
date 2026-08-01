// ── FIREBASE ──
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDasbXp_VKykDHzs_O7yM0szlUqTl52VeU",
  authDomain: "homeschool-b92f2.firebaseapp.com",
  projectId: "homeschool-b92f2",
  storageBucket: "homeschool-b92f2.firebasestorage.app",
  messagingSenderId: "368586442253",
  appId: "1:368586442253:web:67ac63ae17af571408b744"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const DOC_REF = doc(db, "tracker", "oliver");
const storage = getStorage(app);

// ── SYNC STATUS INDICATOR ──
function setSyncStatus(state) {
  const el = document.getElementById("sync-status");
  if (!el) return;
  const states = {
    loading: { text: "Loading…",  color: "var(--text-muted)" },
    saving:  { text: "Saving…",   color: "var(--gold)" },
    saved:   { text: "✓ Synced",  color: "var(--sage)" },
    offline: { text: "⚠ Offline", color: "var(--rose)" },
  };
  const s = states[state] || states.saved;
  el.textContent = s.text;
  el.style.color = s.color;
}

// ── SAVE TO FIRESTORE ──
let saveTimer = null;
function scheduleSave() {
  setSyncStatus("saving");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await setDoc(DOC_REF, {
        statuses: window.statuses,
        openSubjects: window.openSubjects,
        expandedGroups: window.expandedGroups,
        attendance: window.attendance,
        activities: window.activities,
        lastUpdated: Date.now()
      });
      setSyncStatus("saved");
    } catch(e) {
      console.error("Save failed:", e);
      setSyncStatus("offline");
    }
  }, 800);
}

// ── LOAD FROM FIRESTORE (initial) ──
async function loadFromFirestore() {
  setSyncStatus("loading");
  try {
    const snap = await getDoc(DOC_REF);
    if (snap.exists()) {
      const data = snap.data();
      if (data.statuses)       Object.assign(window.statuses, data.statuses);
      if (data.openSubjects)   Object.assign(window.openSubjects, data.openSubjects);
      if (data.expandedGroups) Object.assign(window.expandedGroups, data.expandedGroups);
      if (data.attendance)   { window.attendance = window.attendance || {}; Object.assign(window.attendance, data.attendance); }
      if (data.activities)   { window.activities = window.activities || {}; Object.assign(window.activities, data.activities); }
    }
    setSyncStatus("saved");
  } catch(e) {
    console.error("Load failed:", e);
    setSyncStatus("offline");
  }
  // renderAll / renderAttendance / renderActivities are defined in the classic
  // scripts; by the time this async function resolves, those scripts will
  // have run.
  if (typeof window.renderAll === 'function') window.renderAll();
  if (typeof window.renderAttendance === 'function') window.renderAttendance();
  if (typeof window.renderActivities === 'function') window.renderActivities();
}

// ── ACTIVITY PHOTOS & FILES (Firebase Storage) ──
// Only small metadata (url/path) is stored in Firestore; the file bytes
// (images or PDFs) themselves live in Storage. Requires Cloud Storage to be
// enabled and its Security Rules published in the Firebase console (see
// README.md).
window.uploadActivityPhoto = async function(path, blob, contentType) {
  const sRef = ref(storage, path);
  await uploadBytes(sRef, blob, { contentType: contentType || "image/jpeg" });
  return await getDownloadURL(sRef);
};
window.deleteActivityPhoto = async function(path) {
  const sRef = ref(storage, path);
  await deleteObject(sRef);
};

// ── EXPOSE GLOBALS so inline onclick handlers can call them ──
// State lives in the regular script as let vars; we access via window refs.
// renderAll is also exposed on window once the regular script runs.
// Attendance handlers (js/attendance.js) call scheduleSave to persist changes.
window.scheduleSave = scheduleSave;
window.setStatus      = function(id, val) {
  window.statuses[id] = val;
  window.renderAll();
  scheduleSave();
};
window.cycleStatus    = function(id) {
  const s = window.statuses[id] || "none";
  window.statuses[id] = s === "none" ? "working" : s === "working" ? "done" : "none";
  window.renderAll();
  scheduleSave();
};
window.setGradeFilter = function(g, btn) {
  window.gradeFilter = g;
  document.querySelectorAll(".grade-tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  window.renderAll();
};
window.toggleSubject  = function(name) {
  window.openSubjects[name] = window.openSubjects[name] === false ? true : false;
  window.renderAll();
};
window.toggleGroup    = function(key) {
  window.expandedGroups[key] = !window.expandedGroups[key];
  window.renderAll();
};

loadFromFirestore();
