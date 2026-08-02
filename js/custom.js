// ── CUSTOM STANDARDS ──
// Parent-defined standards that live alongside the official Alabama COS
// milestones, created one at a time with a freeform category instead of a
// fixed subject. They reuse the same status tracking (window.statuses) and
// Activities log (window.activities) as official standards -- a custom
// standard is just a milestone-shaped object with a "custom_" id instead of
// an AL COS code, rendered through app.js's existing milestoneRowHtml().
//
// Deliberately kept OUT of the header Mastered/Total stats and the overall
// progress bar in js/app.js, since those are specifically about official
// Alabama Course of Study coverage (e.g. "118 Total"); custom standards get
// their own small count in their own accordion header instead.

window.customStandards = window.customStandards || [];

let customFormOpen = false;  // is the add/edit form currently showing?
let customEditingId = null;  // id being edited, or null when adding a new one

function genCustomId(){
  return 'custom_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
}

function customRowExtraBtns(id){
  return '<button class="m-btn" onclick="event.stopPropagation();editCustomStandard(\''+id+'\')">Edit</button>'
       + '<button class="m-btn" onclick="event.stopPropagation();deleteCustomStandard(\''+id+'\')">Delete</button>';
}

function customFormHtml(){
  const existing = customEditingId ? window.customStandards.find(c=>c.id===customEditingId) : null;
  const category = existing ? (existing.tag||'') : '';
  const text = existing ? (existing.text||'') : '';
  const note = existing ? (existing.code||'') : '';

  return '<div class="act-form" style="margin-top:4px;">'
    +   '<label class="act-label">Category <span class="req">*</span></label>'
    +   '<input type="text" id="custom-f-category" class="act-input" placeholder="e.g., Art, Life Skills, Faith" value="'+escapeHtml(category)+'">'
    +   '<label class="act-label">Standard Description <span class="req">*</span></label>'
    +   '<textarea id="custom-f-text" class="act-textarea" placeholder="Describe what you want to track">'+escapeHtml(text)+'</textarea>'
    +   '<label class="act-label">Note (optional)</label>'
    +   '<textarea id="custom-f-note" class="act-textarea" placeholder="Any extra detail">'+escapeHtml(note)+'</textarea>'
    +   '<div class="act-form-btns">'
    +     '<button class="btn-done" onclick="saveCustomStandard()">Save</button>'
    +     '<button class="btn-snooze" onclick="closeCustomForm()">Cancel</button>'
    +   '</div>'
    + '</div>';
}

// Renders the "Custom Standards" accordion — always shown (even with zero
// items, so the feature is discoverable) at the top of the milestones list.
function customStandardsAccordionHtml(){
  const items = window.customStandards;
  const isOpen = window.openSubjects['Custom Standards'] !== false;
  const doneCount = items.filter(c=>getStatus(c.id)==='done').length;
  const statsHtml = items.length ? '<div class="subj-stats">'+doneCount+'/'+items.length+' done</div>' : '';

  let bodyHtml;
  if(items.length===0 && !customFormOpen){
    bodyHtml = '<div class="empty-state"><div class="empty-icon">⭐</div><div class="empty-text">Add your own standards to track — anything not covered by the official Alabama Course of Study.</div></div>';
  } else {
    bodyHtml = items.map(c => milestoneRowHtml(c, customRowExtraBtns(c.id))).join('');
  }

  bodyHtml += customFormOpen ? customFormHtml() : '<button class="btn-done act-add-btn" onclick="openCustomForm()">+ Add Custom Standard</button>';

  return '<div class="subject-accordion custom-standards">'
    +   '<div class="subj-header'+(isOpen?' open':'')+'" onclick="toggleSubject(\'Custom Standards\')">'
    +     '<div class="subj-icon">⭐</div>'
    +     '<div class="subj-name">Custom Standards</div>'
    +     statsHtml
    +     '<div class="subj-chevron">▼</div>'
    +   '</div>'
    +   '<div class="subj-body'+(isOpen?' open':'')+'">'+bodyHtml+'</div>'
    + '</div>';
}

// ── FORM HANDLERS ──
window.openCustomForm = function(){
  customFormOpen = true;
  customEditingId = null;
  window.renderAll();
};

window.editCustomStandard = function(id){
  customFormOpen = true;
  customEditingId = id;
  window.renderAll();
};

window.closeCustomForm = function(){
  customFormOpen = false;
  customEditingId = null;
  window.renderAll();
};

window.saveCustomStandard = function(){
  const catEl = document.getElementById('custom-f-category');
  const textEl = document.getElementById('custom-f-text');
  const noteEl = document.getElementById('custom-f-note');
  const category = catEl ? catEl.value.trim() : '';
  const text = textEl ? textEl.value.trim() : '';
  if(!category || !text){
    alert('Please fill in both Category and Standard Description before saving.');
    return;
  }

  let record = customEditingId ? window.customStandards.find(c=>c.id===customEditingId) : null;
  if(!record){
    record = {id: genCustomId(), icon:'⭐', subject:'Custom Standards', createdAt: Date.now()};
    window.customStandards.push(record);
  }
  record.tag = category;
  record.text = text;
  record.code = noteEl ? noteEl.value.trim() : '';
  record.updatedAt = Date.now();

  customFormOpen = false;
  customEditingId = null;
  window.renderAll();
  if(typeof window.scheduleSave === 'function') window.scheduleSave();
};

window.deleteCustomStandard = function(id){
  if(!confirm('Delete this custom standard? Any activities logged under it will be removed too. This cannot be undone.')) return;

  const relatedActivities = (window.activities && window.activities[id]) || [];
  window.customStandards = window.customStandards.filter(c=>c.id!==id);
  delete window.statuses[id];
  if(window.activities) delete window.activities[id];

  if(customEditingId===id){ customFormOpen=false; customEditingId=null; }

  window.renderAll();
  if(typeof window.scheduleSave === 'function') window.scheduleSave();

  // Best-effort cleanup so a deleted standard doesn't leave orphaned
  // photos/PDFs sitting in Storage (mirrors js/activities.js's deleteActivity).
  if(typeof window.deleteActivityPhoto === 'function'){
    relatedActivities.forEach(function(a){
      (a.photos||[]).forEach(function(p){
        window.deleteActivityPhoto(p.path).catch(function(e){
          console.error('Storage cleanup failed (custom standard already removed):', e);
        });
      });
    });
  }
};
