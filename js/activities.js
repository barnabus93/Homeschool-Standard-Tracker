// ── ACTIVITIES TRACKER ──
// Lets a parent log one or more lesson/activity records per standard, each
// with materials, resources, and notes on how it went / whether it was
// mastered. Data lives on window.activities (initialized in js/app.js so it
// already exists before that file's first render reads activity counts) as
// { [milestoneId]: [activity, ...] }, synced through the same Firestore
// document via js/firebase.js.
//
// Note: this is a classic script sharing top-level scope with data.js/app.js/
// attendance.js (loaded earlier), so identifiers here are kept distinct from
// theirs (e.g. attendance.js already declares MONTHS/pad/fmt — this file uses
// toLocaleDateString instead of duplicating those).

window.activities = window.activities || {};

let actMilestoneId = null;   // which standard's activities are open
let actMode = 'list';        // 'list' | 'form'
let actEditingId = null;     // activity id being edited, or null when adding
let actReturnView = 'home';  // which top-level view to restore on Back

const ACT_FIELDS = [
  {key:'name', label:'Activity Name', type:'input', required:true, placeholder:'e.g., Writing practice worksheet'},
  {key:'teacherMaterials', label:'Teacher Materials', type:'textarea', placeholder:'What you need to prepare or bring'},
  {key:'studentMaterials', label:'Student Materials', type:'textarea', placeholder:'What Oliver needs'},
  {key:'books', label:'Books', type:'textarea', placeholder:'Related books'},
  {key:'videos', label:'Videos', type:'textarea', placeholder:'Related videos'},
  {key:'fieldTrip', label:'Field Trip / Co-op / Outing', type:'textarea', placeholder:'Related outing or co-op activity'},
  {key:'links', label:'Links', type:'textarea', placeholder:'Paste any relevant links'},
  {key:'notes', label:'Notes / Outcome', type:'textarea', placeholder:'How did it go? Has Oliver mastered this?'},
];

const ACT_GRADE_NAMES = {K:'Kindergarten',1:'1st Grade',2:'2nd Grade'};

function escapeHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function getMilestoneById(id){
  return (typeof MILESTONES!=='undefined' ? MILESTONES : []).find(m=>m.id===id);
}

function genActivityId(){
  return 'act_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
}

function fmtActDate(ts){
  if(!ts) return '';
  try{ return new Date(ts).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}); }
  catch(e){ return ''; }
}

// ── RENDER ──
function renderActivitiesView(){
  const root=document.getElementById('activities-root');
  if(!root) return;
  const m=getMilestoneById(actMilestoneId);
  if(!m){
    root.innerHTML='<div class="empty-state"><div class="empty-icon">🤔</div><div class="empty-text">That standard could not be found.</div></div>';
    return;
  }

  const refCard =
      '<div class="std-ref-card">'
    +   '<div class="card-grade-badge">'+escapeHtml((ACT_GRADE_NAMES[m.grade]||m.grade)+' · '+m.subject)+'</div>'
    +   '<div class="card-text">'+escapeHtml(m.text)+'</div>'
    +   '<div class="card-std">AL COS '+escapeHtml(m.code)+' · '+escapeHtml(m.tag)+'</div>'
    + '</div>';

  const body = actMode==='form' ? activityFormHtml(m) : activityListHtml(m);

  root.innerHTML =
      '<button class="back-btn" onclick="backToStandards()">‹ Back to Standards</button>'
    + refCard
    + body;
}

function activityListHtml(m){
  const list = window.activities[m.id] || [];
  let items;
  if(list.length===0){
    items = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">No activities logged yet for this standard.</div></div>';
  } else {
    items = '<div class="act-list">' + list.map(a=>{
      const rawNotes = a.notes || '';
      const truncated = rawNotes.length>140;
      const preview = escapeHtml(truncated ? rawNotes.slice(0,140) : rawNotes);
      return '<div class="act-card">'
        +   '<div class="act-card-head">'
        +     '<div class="act-name">'+escapeHtml(a.name||'(untitled activity)')+'</div>'
        +     '<div class="act-date">Updated '+fmtActDate(a.updatedAt||a.createdAt)+'</div>'
        +   '</div>'
        +   (preview ? '<div class="act-preview">'+preview+(truncated?'…':'')+'</div>' : '')
        +   '<div class="act-card-btns">'
        +     '<button class="m-btn" onclick="editActivity(\''+a.id+'\')">Edit</button>'
        +     '<button class="m-btn" onclick="deleteActivity(\''+a.id+'\')">Delete</button>'
        +   '</div>'
        + '</div>';
    }).join('') + '</div>';
  }
  return '<div class="section-title gold-accent">Activities Log</div>'
       + items
       + '<button class="btn-done act-add-btn" onclick="addActivity()">+ Add Activity</button>';
}

function activityFormHtml(m){
  const list = window.activities[m.id] || [];
  const existing = actEditingId ? list.find(a=>a.id===actEditingId) : null;

  const fields = ACT_FIELDS.map(f=>{
    const val = existing ? (existing[f.key]||'') : '';
    const reqMark = f.required ? ' <span class="req">*</span>' : '';
    const control = f.type==='input'
      ? '<input type="text" id="act-f-'+f.key+'" class="act-input" placeholder="'+escapeHtml(f.placeholder)+'" value="'+escapeHtml(val)+'">'
      : '<textarea id="act-f-'+f.key+'" class="act-textarea" placeholder="'+escapeHtml(f.placeholder)+'">'+escapeHtml(val)+'</textarea>';
    return '<label class="act-label">'+f.label+reqMark+'</label>'+control;
  }).join('');

  return '<div class="section-title gold-accent">'+(existing?'Edit Activity':'New Activity')+'</div>'
    + '<div class="act-form">'
    +   fields
    +   '<div class="act-form-btns">'
    +     '<button class="btn-done" onclick="saveActivityForm()">Save</button>'
    +     '<button class="btn-snooze" onclick="cancelActivityForm()">Cancel</button>'
    +     (existing ? '<button class="btn-snooze act-delete" onclick="deleteActivity(\''+existing.id+'\')">Delete</button>' : '')
    +   '</div>'
    + '</div>';
}

// ── NAVIGATION ──
window.showActivities = function(milestoneId){
  actMilestoneId = milestoneId;
  actMode = 'list';
  actEditingId = null;

  const home = document.getElementById('view-home');
  const att  = document.getElementById('view-attendance');
  const acts = document.getElementById('view-activities');
  actReturnView = (att && !att.hidden) ? 'attendance' : 'home';

  if(home) home.hidden = true;
  if(att)  att.hidden  = true;
  if(acts) acts.hidden = false;

  renderActivitiesView();
  window.scrollTo(0,0);
};

window.backToStandards = function(){
  const acts = document.getElementById('view-activities');
  if(acts) acts.hidden = true;
  if(typeof window.showView === 'function') window.showView(actReturnView);
  if(typeof window.renderAll === 'function') window.renderAll(); // refresh activity-count badges
  window.scrollTo(0,0);
};

// ── CRUD ──
window.addActivity = function(){
  actMode = 'form';
  actEditingId = null;
  renderActivitiesView();
};

window.editActivity = function(id){
  actMode = 'form';
  actEditingId = id;
  renderActivitiesView();
};

window.cancelActivityForm = function(){
  actMode = 'list';
  actEditingId = null;
  renderActivitiesView();
};

window.saveActivityForm = function(){
  const nameEl = document.getElementById('act-f-name');
  const name = nameEl ? nameEl.value.trim() : '';
  if(!name){
    alert('Please give this activity a name before saving.');
    if(nameEl) nameEl.focus();
    return;
  }

  const list = window.activities[actMilestoneId] = window.activities[actMilestoneId] || [];
  const now = Date.now();
  let record = actEditingId ? list.find(a=>a.id===actEditingId) : null;
  if(!record){
    record = {id: genActivityId(), createdAt: now};
    list.push(record);
  }

  ACT_FIELDS.forEach(f=>{
    const el = document.getElementById('act-f-'+f.key);
    record[f.key] = el ? el.value : '';
  });
  record.updatedAt = now;

  actMode = 'list';
  actEditingId = null;
  renderActivitiesView();
  if(typeof window.renderAll === 'function') window.renderAll(); // refresh activity-count badges
  if(typeof window.scheduleSave === 'function') window.scheduleSave();
};

window.deleteActivity = function(id){
  const list = window.activities[actMilestoneId];
  if(!list) return;
  if(!confirm('Delete this activity? This cannot be undone.')) return;
  window.activities[actMilestoneId] = list.filter(a=>a.id!==id);

  actMode = 'list';
  actEditingId = null;
  renderActivitiesView();
  if(typeof window.renderAll === 'function') window.renderAll();
  if(typeof window.scheduleSave === 'function') window.scheduleSave();
};

// ── INIT ──
// Expose render so the Firebase module can refresh this view after loading
// data (harmless no-op if no standard is currently open).
window.renderActivities = renderActivitiesView;
