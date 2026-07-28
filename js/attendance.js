// ── ATTENDANCE TRACKER ──
// Records days a student was present. Data lives on window.attendance as a map
// of "YYYY-MM-DD": true (only present days are stored; a missing key = absent),
// and is persisted to the same Firestore document as the milestone state via
// window.scheduleSave (defined in js/firebase.js).

// State — initialized before the deferred Firebase module runs, so the module
// can Object.assign loaded data onto it (mirrors the pattern in js/app.js).
window.attendance = window.attendance || {};
let attView   = 'month';      // 'day' | 'week' | 'month'
let attCursor = new Date();   // the period currently in view

// ── CONSTANTS ──
const MONTHS        = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WEEKDAYS      = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const WEEKDAYS_SHORT= ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── DATE HELPERS (local-time to avoid UTC off-by-one) ──
function pad(n){ return n<10 ? '0'+n : ''+n; }
function fmt(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function daysInMonth(y,m){ return new Date(y, m+1, 0).getDate(); }
function addDays(d,n){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()+n); }
function addMonths(d,n){ return new Date(d.getFullYear(), d.getMonth()+n, 1); }
function startOfWeek(d){ const x=new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -x.getDay()); }
function isPresent(ds){ return !!window.attendance[ds]; }

function monthPresentCount(){
  const prefix = attCursor.getFullYear()+'-'+pad(attCursor.getMonth()+1)+'-';
  return Object.keys(window.attendance).filter(k => k.indexOf(prefix)===0 && window.attendance[k]).length;
}

// ── PERIOD LABEL ──
function periodLabel(){
  const y = attCursor.getFullYear();
  if(attView==='month') return MONTHS[attCursor.getMonth()]+' '+y;
  if(attView==='week'){
    const s = startOfWeek(attCursor), e = addDays(s,6);
    return MONTHS_SHORT[s.getMonth()]+' '+s.getDate()+' – '+MONTHS_SHORT[e.getMonth()]+' '+e.getDate()+', '+e.getFullYear();
  }
  return WEEKDAYS[attCursor.getDay()]+', '+MONTHS_SHORT[attCursor.getMonth()]+' '+attCursor.getDate()+', '+y;
}

// ── VIEW BUILDERS ──
function monthGridHtml(){
  const y=attCursor.getFullYear(), m=attCursor.getMonth();
  const dim=daysInMonth(y,m);
  const firstDow=new Date(y,m,1).getDay();
  const todayStr=fmt(new Date());
  let cells='';
  WEEKDAYS_SHORT.forEach(w=>{ cells+='<div class="cal-head">'+w+'</div>'; });
  for(let i=0;i<firstDow;i++) cells+='<div class="cal-cell blank"></div>';
  for(let d=1;d<=dim;d++){
    const ds=y+'-'+pad(m+1)+'-'+pad(d);
    const present=isPresent(ds);
    const cls='cal-cell'+(present?' present':'')+(ds===todayStr?' today':'');
    cells+='<div class="'+cls+'" onclick="toggleAttendance(\''+ds+'\')">'
         +   '<span class="cal-num">'+d+'</span>'
         +   (present?'<span class="cal-mark">✓</span>':'')
         + '</div>';
  }
  return '<div class="cal-grid">'+cells+'</div>';
}

function weekListHtml(){
  const start=startOfWeek(attCursor);
  const todayStr=fmt(new Date());
  let rows='';
  for(let i=0;i<7;i++){
    const d=addDays(start,i);
    const ds=fmt(d);
    const present=isPresent(ds);
    rows+='<div class="week-row'+(present?' present':'')+(ds===todayStr?' today':'')+'" onclick="toggleAttendance(\''+ds+'\')">'
        +   '<div class="week-day">'+WEEKDAYS[d.getDay()]+'</div>'
        +   '<div class="week-date">'+MONTHS_SHORT[d.getMonth()]+' '+d.getDate()+'</div>'
        +   '<div class="week-check">'+(present?'✓ Present':'Tap to mark')+'</div>'
        + '</div>';
  }
  return '<div class="week-list">'+rows+'</div>';
}

function dayHtml(){
  const ds=fmt(attCursor);
  const present=isPresent(ds);
  return '<div class="day-card">'
       +   '<div class="day-weekday">'+WEEKDAYS[attCursor.getDay()]+'</div>'
       +   '<div class="day-date">'+MONTHS[attCursor.getMonth()]+' '+attCursor.getDate()+', '+attCursor.getFullYear()+'</div>'
       +   '<button class="day-toggle'+(present?' present':'')+'" onclick="toggleAttendance(\''+ds+'\')">'
       +     (present?'✓ Present':'Tap to mark present')
       +   '</button>'
       + '</div>';
}

// ── MAIN RENDER ──
function renderAttendance(){
  const root=document.getElementById('attendance-root');
  if(!root) return;
  let content;
  if(attView==='month') content=monthGridHtml();
  else if(attView==='week') content=weekListHtml();
  else content=dayHtml();

  const cnt=monthPresentCount();
  const seg=['day','week','month'].map(v=>
    '<button class="att-seg-btn'+(attView===v?' active':'')+'" onclick="setAttView(\''+v+'\')">'+v.charAt(0).toUpperCase()+v.slice(1)+'</button>'
  ).join('');

  root.innerHTML=
    '<div class="section-title gold-accent">Attendance</div>'
  + '<div class="att-seg">'+seg+'</div>'
  + '<div class="att-nav">'
  +   '<button class="att-nav-btn" onclick="attNav(-1)" aria-label="Previous">‹</button>'
  +   '<div class="att-period">'+periodLabel()+'</div>'
  +   '<button class="att-nav-btn" onclick="attNav(1)" aria-label="Next">›</button>'
  + '</div>'
  + content
  + '<div class="att-summary">'+cnt+' day'+(cnt!==1?'s':'')+' present in '+MONTHS[attCursor.getMonth()]+' '+attCursor.getFullYear()+'</div>'
  + '<div class="att-export">'
  +   '<button class="btn-done" onclick="exportAttendancePDF()">⬇ Export PDF</button>'
  +   '<button class="btn-done att-csv" onclick="exportAttendanceCSV()">⬇ Export CSV</button>'
  + '</div>'
  + '<div class="att-note">Tap any day to mark it present. Exports cover the month shown above.</div>';
}

// ── HANDLERS (exposed for inline onclick) ──
window.toggleAttendance = function(ds){
  if(window.attendance[ds]) delete window.attendance[ds];
  else window.attendance[ds]=true;
  renderAttendance();
  if(typeof window.scheduleSave==='function') window.scheduleSave();
};

window.setAttView = function(v){ attView=v; renderAttendance(); };

window.attNav = function(dir){
  if(attView==='month')      attCursor=addMonths(attCursor,dir);
  else if(attView==='week')  attCursor=addDays(attCursor,dir*7);
  else                       attCursor=addDays(attCursor,dir);
  renderAttendance();
};

// Switch between the Home and Attendance views.
window.showView = function(name, btn){
  const home=document.getElementById('view-home');
  const att =document.getElementById('view-attendance');
  const acts=document.getElementById('view-activities');
  const isHome = name==='home';
  if(home) home.hidden=!isHome;
  if(att)  att.hidden=isHome;
  if(acts) acts.hidden=true;
  document.querySelectorAll('.main-nav .nav-tab').forEach(b=>{
    b.classList.toggle('active', btn ? b===btn : b.dataset.view===name);
  });
  if(!isHome) renderAttendance();
  window.scrollTo(0,0);
};

// ── EXPORTS ──
// CSV — one row per day of the selected month: "YYYY-MM-DD,TRUE|FALSE".
window.exportAttendanceCSV = function(){
  const y=attCursor.getFullYear(), m=attCursor.getMonth();
  const dim=daysInMonth(y,m);
  const rows=['Date,Present'];
  for(let d=1;d<=dim;d++){
    const ds=y+'-'+pad(m+1)+'-'+pad(d);
    rows.push(ds+','+(isPresent(ds)?'TRUE':'FALSE'));
  }
  const blob=new Blob([rows.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='attendance-'+y+'-'+pad(m+1)+'.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// PDF — open a print-ready calendar of the selected month (✕ on present days)
// and trigger the browser print dialog, where the user chooses "Save as PDF".
window.exportAttendancePDF = function(){
  const y=attCursor.getFullYear(), m=attCursor.getMonth();
  const dim=daysInMonth(y,m);
  const firstDow=new Date(y,m,1).getDay();
  const nameEl=document.querySelector('.student-name');
  const student=(nameEl && nameEl.textContent.trim()) || 'Student';

  let cells=[], total=0;
  for(let i=0;i<firstDow;i++) cells.push('<td class="blank"></td>');
  for(let d=1;d<=dim;d++){
    const ds=y+'-'+pad(m+1)+'-'+pad(d);
    const present=isPresent(ds);
    if(present) total++;
    cells.push('<td><span class="d">'+d+'</span>'+(present?'<span class="x">✕</span>':'')+'</td>');
  }
  while(cells.length%7!==0) cells.push('<td class="blank"></td>');
  let bodyRows='';
  for(let i=0;i<cells.length;i+=7) bodyRows+='<tr>'+cells.slice(i,i+7).join('')+'</tr>';
  const head=WEEKDAYS_SHORT.map(w=>'<th>'+w+'</th>').join('');

  const html='<!DOCTYPE html><html><head><meta charset="utf-8">'
    +'<title>Attendance '+MONTHS[m]+' '+y+'</title><style>'
    +'body{font-family:Georgia,"Times New Roman",serif;color:#2b2b2b;margin:32px;}'
    +'h1{font-size:22px;margin:0 0 2px;}'
    +'.sub{color:#666;font-size:13px;margin-bottom:18px;}'
    +'table{border-collapse:collapse;width:100%;table-layout:fixed;}'
    +'th{border:1px solid #444;padding:6px;font-size:12px;background:#f0f0f0;text-transform:uppercase;letter-spacing:.5px;}'
    +'td{border:1px solid #444;height:78px;vertical-align:top;position:relative;padding:4px;}'
    +'td.blank{background:#fafafa;}'
    +'.d{font-size:12px;color:#555;}'
    +'.x{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:34px;font-weight:bold;color:#111;}'
    +'.total{margin-top:16px;font-size:14px;}'
    +'@media print{body{margin:12mm;}}'
    +'</style></head><body>'
    +'<h1>Attendance — '+student+'</h1>'
    +'<div class="sub">'+MONTHS[m]+' '+y+'</div>'
    +'<table><thead><tr>'+head+'</tr></thead><tbody>'+bodyRows+'</tbody></table>'
    +'<div class="total"><strong>Total days present:</strong> '+total+'</div>'
    +'<script>window.onload=function(){window.focus();window.print();};<\/script>'
    +'</body></html>';

  const w=window.open('','_blank');
  if(!w){ alert('Please allow pop-ups for this site to export the PDF.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
};

// ── INIT ──
// Expose render so the Firebase module can refresh the view after loading data.
window.renderAttendance = renderAttendance;
renderAttendance();
