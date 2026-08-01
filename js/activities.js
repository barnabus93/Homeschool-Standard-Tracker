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
let actMode = 'list';        // 'list' | 'view' | 'form'
let actActivityId = null;    // activity id being viewed/edited, or null in list mode / when adding
let actReturnView = 'home';  // which top-level view to restore on Back
let actPhotoUploading = false; // true while a photo/PDF is compressing/uploading

// New fields are purely additive: existing saved activities simply don't have
// them yet and render as blank until edited — nothing is migrated or rewritten.
const ACT_FIELDS = [
  {key:'name', label:'Activity Name', type:'input', required:true, placeholder:'e.g., Writing practice worksheet'},
  {key:'description', label:'Description', type:'textarea', placeholder:'Describe this activity in more detail'},
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

function genLocalId(prefix){
  return prefix+'_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
}

function fmtActDate(ts){
  if(!ts) return '';
  try{ return new Date(ts).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}); }
  catch(e){ return ''; }
}

// Downscales the picked image to at most maxDim on its long edge and encodes
// it as a JPEG blob, so uploads stay fast and cheap on Firebase Storage.
function resizeImageToBlob(file, maxDim, quality){
  maxDim = maxDim || 1600;
  quality = quality || 0.8;
  return new Promise(function(resolve, reject){
    const objUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function(){
      let width = img.naturalWidth, height = img.naturalHeight;
      if(width > maxDim || height > maxDim){
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width*scale);
        height = Math.round(height*scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(function(blob){
        URL.revokeObjectURL(objUrl);
        if(blob) resolve(blob); else reject(new Error('Could not process image.'));
      }, 'image/jpeg', quality);
    };
    img.onerror = function(){
      URL.revokeObjectURL(objUrl);
      reject(new Error('Could not load the selected image.'));
    };
    img.src = objUrl;
  });
}

// Photos and PDFs share one "attachments" array (still called `photos` on the
// record, unchanged, so existing saved activities keep working). An entry is
// treated as a PDF only when explicitly marked type:'pdf'; anything else
// (including older entries saved before PDFs existed, which have no `type`
// at all) is treated as an image, preserving old data exactly as it renders.
function isPdfAttachment(p){
  return !!p && p.type === 'pdf';
}

// Small (36px) preview used in the activity list's summary strip.
function attachmentMiniHtml(p){
  if(isPdfAttachment(p)){
    return '<a class="act-photo-mini act-file-mini" href="'+escapeHtml(p.url)+'" target="_blank" rel="noopener" title="'+escapeHtml(p.name||'PDF')+'">📄</a>';
  }
  return '<img class="act-photo-mini" src="'+escapeHtml(p.url)+'" alt="Activity photo">';
}

// Larger (84px) tile used in the form's editable grid and the read-only view.
// Every tile opens the file in a new tab; `removable` adds the ✕ button.
function attachmentTileHtml(p, removable){
  const isPdf = isPdfAttachment(p);
  const inner = isPdf
    ? '<div class="act-file-icon">📄<span class="act-file-name">'+escapeHtml(p.name||'PDF')+'</span></div>'
    : '<img src="'+escapeHtml(p.url)+'" alt="Activity photo">';
  const removeBtn = removable
    ? '<button type="button" class="act-photo-remove" onclick="removeActivityPhoto(\''+p.id+'\')" aria-label="Remove photo">✕</button>'
    : '';
  return '<div class="act-photo-thumb'+(isPdf?' act-file-tile':'')+'">'
       +   '<a href="'+escapeHtml(p.url)+'" target="_blank" rel="noopener">'+inner+'</a>'
       +   removeBtn
       + '</div>';
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

  const body = actMode==='form' ? activityFormHtml(m)
             : actMode==='view' ? activityViewHtml(m)
             : activityListHtml(m);

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
      const photos = a.photos || [];
      const photoStrip = photos.length ? (
          '<div class="act-photo-strip">'
        +   photos.slice(0,3).map(attachmentMiniHtml).join('')
        +   (photos.length>3 ? '<span class="act-photo-more">+'+(photos.length-3)+'</span>' : '')
        + '</div>'
      ) : '';
      return '<div class="act-card">'
        +   '<div class="act-card-head">'
        +     '<div class="act-name">'+escapeHtml(a.name||'(untitled activity)')+'</div>'
        +     '<div class="act-date">Updated '+fmtActDate(a.updatedAt||a.createdAt)+'</div>'
        +   '</div>'
        +   (preview ? '<div class="act-preview">'+preview+(truncated?'…':'')+'</div>' : '')
        +   photoStrip
        +   '<div class="act-card-btns">'
        +     '<button class="m-btn" onclick="viewActivity(\''+a.id+'\')">View</button>'
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

// Read-only detail view of one activity — everything filled in, plus its
// photos/PDFs, without switching into the editable form.
function activityViewHtml(m){
  const list = window.activities[m.id] || [];
  const a = list.find(function(x){ return x.id===actActivityId; });
  if(!a){
    return '<button class="back-btn" onclick="backToActivityList()">‹ Back to Activities</button>'
      + '<div class="empty-state"><div class="empty-icon">🤔</div><div class="empty-text">That activity could not be found.</div></div>';
  }

  const viewFields = ACT_FIELDS.filter(function(f){ return f.key!=='name'; }).map(function(f){
    const val = a[f.key];
    if(!val) return '';
    return '<div class="act-view-field">'
      +   '<div class="act-view-label">'+f.label+'</div>'
      +   '<div class="act-view-value">'+escapeHtml(val)+'</div>'
      + '</div>';
  }).join('');

  const photos = a.photos || [];
  const attachmentsSection = photos.length ? (
      '<div class="act-view-field">'
    +   '<div class="act-view-label">Photos &amp; Files</div>'
    +   '<div class="act-photo-grid">' + photos.map(function(p){ return attachmentTileHtml(p, false); }).join('') + '</div>'
    + '</div>'
  ) : '';

  return '<button class="back-btn" onclick="backToActivityList()">‹ Back to Activities</button>'
    + '<div class="section-title gold-accent">'+escapeHtml(a.name||'(untitled activity)')+'</div>'
    + '<div class="act-view-meta">Updated '+fmtActDate(a.updatedAt||a.createdAt)+'</div>'
    + '<div class="act-view-card">'
    +   (viewFields || '<div class="act-photo-hint">No additional details recorded yet.</div>')
    +   attachmentsSection
    + '</div>'
    + '<div class="act-form-btns">'
    +   '<button class="btn-done" onclick="editActivity(\''+a.id+'\')">✎ Edit</button>'
    +   '<button class="btn-snooze act-delete" onclick="deleteActivity(\''+a.id+'\')">Delete</button>'
    + '</div>';
}

function activityFormHtml(m){
  const list = window.activities[m.id] || [];
  const existing = actActivityId ? list.find(a=>a.id===actActivityId) : null;

  const fields = ACT_FIELDS.map(f=>{
    const val = existing ? (existing[f.key]||'') : '';
    const reqMark = f.required ? ' <span class="req">*</span>' : '';
    const control = f.type==='input'
      ? '<input type="text" id="act-f-'+f.key+'" class="act-input" placeholder="'+escapeHtml(f.placeholder)+'" value="'+escapeHtml(val)+'">'
      : '<textarea id="act-f-'+f.key+'" class="act-textarea" placeholder="'+escapeHtml(f.placeholder)+'">'+escapeHtml(val)+'</textarea>';
    return '<label class="act-label">'+f.label+reqMark+'</label>'+control;
  }).join('');

  // Photos/PDFs attach to an already-saved activity (so there's always a
  // stable id/path to key on); a brand-new, not-yet-saved activity shows a
  // hint instead until the first Save.
  const photosSection = existing ? (
      '<label class="act-label">Photos &amp; Files</label>'
    + '<div class="act-photo-grid">'
    +   (existing.photos||[]).map(function(p){ return attachmentTileHtml(p, true); }).join('')
    +   '<button type="button" class="act-photo-add"'+(actPhotoUploading?' disabled':'')+' onclick="triggerPhotoPicker()">'
    +     (actPhotoUploading ? 'Uploading…' : '📎 Add Photo/PDF')
    +   '</button>'
    + '</div>'
    + '<input type="file" accept="image/*,application/pdf" id="act-photo-input" style="display:none" onchange="handlePhotoFile(event)">'
  ) : '<label class="act-label">Photos &amp; Files</label><div class="act-photo-hint">Save this activity to add photos or PDFs.</div>';

  return '<div class="section-title gold-accent">'+(existing?'Edit Activity':'New Activity')+'</div>'
    + '<div class="act-form">'
    +   fields
    +   photosSection
    +   '<div class="act-form-btns">'
    +     '<button class="btn-done" onclick="saveActivityForm()">Save</button>'
    +     '<button class="btn-snooze" onclick="cancelActivityForm()">'+(existing?'Done':'Cancel')+'</button>'
    +     (existing ? '<button class="btn-snooze act-delete" onclick="deleteActivity(\''+existing.id+'\')">Delete</button>' : '')
    +   '</div>'
    + '</div>';
}

// ── NAVIGATION ──
window.showActivities = function(milestoneId){
  actMilestoneId = milestoneId;
  actMode = 'list';
  actActivityId = null;

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
  actActivityId = null;
  renderActivitiesView();
};

window.editActivity = function(id){
  actMode = 'form';
  actActivityId = id;
  renderActivitiesView();
};

window.viewActivity = function(id){
  actMode = 'view';
  actActivityId = id;
  renderActivitiesView();
  window.scrollTo(0,0);
};

window.backToActivityList = function(){
  actMode = 'list';
  actActivityId = null;
  renderActivitiesView();
};

window.cancelActivityForm = function(){
  window.backToActivityList();
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
  const isNewRecord = !actActivityId;
  let record = actActivityId ? list.find(a=>a.id===actActivityId) : null;
  if(!record){
    record = {id: genLocalId('act'), createdAt: now};
    list.push(record);
  }

  ACT_FIELDS.forEach(f=>{
    const el = document.getElementById('act-f-'+f.key);
    record[f.key] = el ? el.value : '';
  });
  record.updatedAt = now;

  if(isNewRecord){
    // Stay on the form (now editing this just-created record) so photos can
    // be attached right away instead of bouncing back to the list.
    actActivityId = record.id;
  } else {
    actMode = 'list';
    actActivityId = null;
  }

  renderActivitiesView();
  if(typeof window.renderAll === 'function') window.renderAll(); // refresh activity-count badges
  if(typeof window.scheduleSave === 'function') window.scheduleSave();
};

window.deleteActivity = function(id){
  const list = window.activities[actMilestoneId];
  if(!list) return;
  if(!confirm('Delete this activity? This cannot be undone.')) return;
  const removed = list.find(a=>a.id===id);
  window.activities[actMilestoneId] = list.filter(a=>a.id!==id);

  actMode = 'list';
  actActivityId = null;
  renderActivitiesView();
  if(typeof window.renderAll === 'function') window.renderAll();
  if(typeof window.scheduleSave === 'function') window.scheduleSave();

  // Best-effort cleanup so deleted activities don't leave orphaned photos
  // sitting in Storage.
  if(removed && removed.photos && removed.photos.length && typeof window.deleteActivityPhoto === 'function'){
    removed.photos.forEach(function(p){
      window.deleteActivityPhoto(p.path).catch(function(e){
        console.error('Storage cleanup failed (activity already removed from the log):', e);
      });
    });
  }
};

// ── PHOTOS ──
window.triggerPhotoPicker = function(){
  if(actPhotoUploading) return;
  const input = document.getElementById('act-photo-input');
  if(input) input.click();
};

window.handlePhotoFile = function(event){
  const file = event.target.files && event.target.files[0];
  event.target.value = ''; // reset so picking the same file again still fires change
  if(!file || !actActivityId) return;

  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');

  actPhotoUploading = true;
  renderActivitiesView();

  // PDFs upload as-is (compression only applies to images).
  const prep = isPdf ? Promise.resolve(file) : resizeImageToBlob(file, 1600, 0.8);

  prep
    .then(function(blob){
      if(typeof window.uploadActivityPhoto !== 'function'){
        throw new Error('Uploads are not available yet.');
      }
      const photoId = genLocalId('photo');
      const path = 'activity-photos/'+actMilestoneId+'/'+actActivityId+'/'+photoId+(isPdf?'.pdf':'.jpg');
      const contentType = isPdf ? 'application/pdf' : 'image/jpeg';
      return window.uploadActivityPhoto(path, blob, contentType).then(function(url){
        const list = window.activities[actMilestoneId] || [];
        const record = list.find(function(a){ return a.id===actActivityId; });
        if(record){
          record.photos = record.photos || [];
          record.photos.push({
            id: photoId, url: url, path: path,
            type: isPdf ? 'pdf' : 'image',
            name: file.name || '',
            uploadedAt: Date.now()
          });
          record.updatedAt = Date.now();
        }
      });
    })
    .then(function(){
      if(typeof window.scheduleSave === 'function') window.scheduleSave();
    })
    .catch(function(e){
      console.error('Upload failed:', e);
      alert('Sorry, that file could not be uploaded. Please try again.');
    })
    .finally(function(){
      actPhotoUploading = false;
      renderActivitiesView();
      if(typeof window.renderAll === 'function') window.renderAll();
    });
};

window.removeActivityPhoto = function(photoId){
  const list = window.activities[actMilestoneId] || [];
  const record = list.find(function(a){ return a.id===actActivityId; });
  if(!record || !record.photos) return;
  const photo = record.photos.find(function(p){ return p.id===photoId; });
  if(!photo) return;
  if(!confirm('Remove this photo?')) return;

  record.photos = record.photos.filter(function(p){ return p.id!==photoId; });
  record.updatedAt = Date.now();
  renderActivitiesView();
  if(typeof window.renderAll === 'function') window.renderAll();
  if(typeof window.scheduleSave === 'function') window.scheduleSave();

  if(typeof window.deleteActivityPhoto === 'function'){
    window.deleteActivityPhoto(photo.path).catch(function(e){
      console.error('Storage cleanup failed (photo already removed from the log):', e);
    });
  }
};

// ── INIT ──
// Expose render so the Firebase module can refresh this view after loading
// data (harmless no-op if no standard is currently open).
window.renderActivities = renderActivitiesView;
