// ── STATE ──
// ── STATE (lives on window so the Firebase ES module can share it) ──
window.statuses       = window.statuses       || {};
window.gradeFilter    = window.gradeFilter    || 'all';
window.openSubjects   = window.openSubjects   || {};
window.expandedGroups = window.expandedGroups || {};
// Initialized here (not in js/activities.js) so it's guaranteed to exist
// before this file's own renderAll() call below reads activity counts.
window.activities     = window.activities     || {};

// Local aliases so existing code reads naturally
// These are REFERENCES to the window objects, so mutations are shared
const statuses       = window.statuses;
const openSubjects   = window.openSubjects;
const expandedGroups = window.expandedGroups;

function getStatus(id){ return statuses[id]||'none'; }

// setStatus, cycleStatus, setGradeFilter, toggleSubject, toggleGroup
// are defined as window.* in the Firebase module (js/firebase.js) so inline
// onclick handlers can reach them. Do not redefine here.

// ── FILTER ──
function filteredMilestones(){
  const gf = window.gradeFilter;
  if(gf==='all') return MILESTONES;
  return MILESTONES.filter(m=>m.grade===gf);
}

// ── STATS ──
function calcStats(ms){
  let done=0,working=0,total=ms.length;
  ms.forEach(m=>{
    if(statuses[m.id]==='done') done++;
    else if(statuses[m.id]==='working') working++;
  });
  return {done,working,total};
}

function calcSubjectStats(subject, ms){
  const sub = ms.filter(m=>m.subject===subject);
  const done = sub.filter(m=>statuses[m.id]==='done').length;
  return {done, total:sub.length};
}

// ── RENDER ──
function renderAll(){
  const ms = filteredMilestones();
  const {done,working,total} = calcStats(ms);
  const pct = total>0?Math.round((done/total)*100):0;

  // header stats (always all)
  const allStats = calcStats(MILESTONES);
  document.getElementById('stat-done').textContent = allStats.done;
  document.getElementById('stat-working').textContent = allStats.working;
  document.getElementById('stat-total').textContent = allStats.total;

  // progress bar
  document.getElementById('big-bar').style.width = pct+'%';
  document.getElementById('progress-pct').textContent = pct+'% complete';
  document.getElementById('progress-fraction').textContent = done+' of '+total+' milestones met';

  // sub-bars
  const subjects = ['Language Arts','Mathematics','Motor Skills','Social & Emotional'];
  const subColors = ['fill-lang','fill-math','fill-motor','fill-social'];
  const subIcons  = ['📖','🔢','✍️','🤝'];
  let subHtml = '';
  subjects.forEach((s,i)=>{
    const ss = calcSubjectStats(s, ms);
    const sp = ss.total>0?Math.round((ss.done/ss.total)*100):0;
    subHtml += `<div class="sub-bar-item">
      <div class="sub-bar-label"><span>${subIcons[i]} ${s}</span><span>${ss.done}/${ss.total}</span></div>
      <div class="sub-bar-track"><div class="sub-bar-fill ${subColors[i]}" style="width:${sp}%"></div></div>
    </div>`;
  });
  document.getElementById('sub-bars').innerHTML = subHtml;

  // active cards
  const working_items = ms.filter(m=>statuses[m.id]==='working');
  const activeEl = document.getElementById('active-cards');
  if(working_items.length===0){
    activeEl.innerHTML = `<div class="empty-state"><div class="empty-icon">🌱</div><div class="empty-text">Mark milestones as "Working" below and they'll appear here.</div></div>`;
  } else {
    activeEl.innerHTML = working_items.map(m=>{
      const actCount = (window.activities[m.id]||[]).length;
      const actLabel = '📋 Activities'+(actCount?' ('+actCount+')':'');
      return `
      <div class="active-card">
        <div class="card-icon">${m.icon}</div>
        <div class="card-body">
          <div class="card-grade-badge">${m.grade==='K'?'Kindergarten':m.grade==='1'?'1st Grade':'2nd Grade'} · ${m.subject}</div>
          <div class="card-text">${m.text}</div>
          <div class="card-std">AL COS ${m.code} · ${m.tag}</div>
        </div>
        <div class="card-actions">
          <button class="btn-done" onclick="setStatus('${m.id}','done')">Mark Done ✓</button>
          <button class="btn-snooze" onclick="showActivities('${m.id}')">${actLabel}</button>
          <button class="btn-snooze" onclick="setStatus('${m.id}','none')">Remove</button>
        </div>
      </div>`;
    }).join('');
  }

  // accordion
  renderAccordion(ms);
}

function renderAccordion(ms){
  const subjects = [
    {name:'Language Arts', icon:'📖'},
    {name:'Mathematics', icon:'🔢'},
    {name:'Motor Skills', icon:'✍️'},
    {name:'Social & Emotional', icon:'🤝'},
  ];
  const grades = window.gradeFilter==='all'?['K','1','2']:[window.gradeFilter];
  const gradeNames = {K:'Kindergarten',1:'1st Grade',2:'2nd Grade'};
  const container = document.getElementById('accordion-container');

  const VISIBLE = 2;   // always-visible rows
  const PEEK    = 1;   // rows shown as fade-peek
  const MAX     = 5;   // max rows before "… and N more" truncation

  let html = '';
  subjects.forEach(subj=>{
    // Mastered items stay in place (grayed out via .state-done) instead of
    // being filtered out to a separate completed list.
    const subjItems = ms.filter(m=>m.subject===subj.name);
    if(subjItems.length===0) return;
    const doneCount = ms.filter(m=>m.subject===subj.name && getStatus(m.id)==='done').length;
    const totalCount = ms.filter(m=>m.subject===subj.name).length;
    const isOpen = openSubjects[subj.name]!==false;

    html += `<div class="subject-accordion">
      <div class="subj-header${isOpen?' open':''}" onclick="toggleSubject('${subj.name}')">
        <div class="subj-icon">${subj.icon}</div>
        <div class="subj-name">${subj.name}</div>
        <div class="subj-stats">${doneCount}/${totalCount} done</div>
        <div class="subj-chevron">▼</div>
      </div>
      <div class="subj-body${isOpen?' open':''}">`;

    grades.forEach(g=>{
      const gradeItems = subjItems.filter(m=>m.grade===g);
      if(gradeItems.length===0) return;

      const groupKey = subj.name+'|'+g;
      const isExpanded = !!expandedGroups[groupKey];

      if(window.gradeFilter==='all'){
        html += `<div class="grade-group-label">${gradeNames[g]}</div>`;
      }

      html += `<div class="grade-group-rows">`;

      // rows 0 and 1 — always visible
      const alwaysItems = gradeItems.slice(0, VISIBLE);
      alwaysItems.forEach(m=>{ html += milestoneRowHtml(m); });

      // rows 2–4 — peek/expand zone (only if they exist)
      const peekItems = gradeItems.slice(VISIBLE, MAX);
      if(peekItems.length > 0){
        const peekRowCount = Math.min(PEEK, peekItems.length);
        const peekOnly   = peekItems.slice(0, peekRowCount);   // row 2 (faded)
        const hiddenRest = peekItems.slice(peekRowCount);       // rows 3–4

        html += `<div class="peek-wrap${isExpanded?' expanded':''}" id="peek-${groupKey.replace(/[^a-z0-9]/gi,'_')}">`;
        peekOnly.forEach(m=>{ html += milestoneRowHtml(m); });
        hiddenRest.forEach(m=>{ html += milestoneRowHtml(m); });
        html += `<div class="peek-fade"></div>`;
        html += `</div>`;

        const remaining = gradeItems.length - MAX;
        const btnLabel = isExpanded
          ? 'Show fewer'
          : `Show ${peekItems.length} more milestone${peekItems.length!==1?'s':''}`;
        html += `<button class="show-more-btn${isExpanded?' open':''}"
          onclick="toggleGroup('${groupKey}')">
          ${btnLabel} <span class="show-more-arrow">▼</span>
        </button>`;

        // if there are items beyond MAX, note them when collapsed
        if(!isExpanded && remaining > 0){
          html += `<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:6px 0 4px;">
            + ${remaining} more milestone${remaining!==1?'s':''} in this group
          </div>`;
        }
      }

      html += `</div>`; // .grade-group-rows
    });

    html += `</div></div>`; // .subj-body, .subject-accordion
  });

  if(html===''){
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🎉</div><div class="empty-text">All milestones in this grade level are completed!</div></div>`;
  } else {
    container.innerHTML = html;
  }
}

function milestoneRowHtml(m){
  const s = getStatus(m.id);
  const stateClass = s==='done'?'state-done':s==='working'?'state-working':'';
  const checkContent = s==='done'?'✓':s==='working'?'~':'';
  const actCount = (window.activities[m.id]||[]).length;
  const actLabel = '📋 Activities'+(actCount?' ('+actCount+')':'');

  let stateBtns;
  if(s==='done'){
    stateBtns = `<button class="m-btn" onclick="event.stopPropagation();setStatus('${m.id}','none')">↺ Undo</button>`;
  } else {
    stateBtns = (s!=='working'
      ? `<button class="m-btn" onclick="event.stopPropagation();setStatus('${m.id}','working')">Working</button>`
      : '')
      + `<button class="m-btn" onclick="event.stopPropagation();setStatus('${m.id}','done')">Done ✓</button>`;
  }

  return `<div class="milestone-row ${stateClass}" onclick="cycleStatus('${m.id}')">
    <div class="m-check">${checkContent}</div>
    <div class="m-body">
      <div class="m-text">${m.text}</div>
      <div class="m-meta">
        <span class="m-code">${m.code}</span>
        <span class="m-subj-tag">${m.tag}</span>
      </div>
    </div>
    <div class="m-btns">
      ${stateBtns}
      <button class="m-btn activities-btn" onclick="event.stopPropagation();showActivities('${m.id}')">${actLabel}</button>
    </div>
  </div>`;
}

// toggleGroup and toggleSubject defined as window.* in the Firebase module (js/firebase.js).
// showActivities defined as window.* in js/activities.js.

// ── INIT ──
// Expose renderAll on window so the Firebase module can call it after loading data.
window.renderAll = renderAll;

// Render immediately so UI isn't blank while Firestore loads.
renderAll();
