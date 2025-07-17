let tags = [], aliases = [];
let lastId = 1;


// Returns the next available custom tag ID, as a string "x1", "x2", etc.
function getNextCustomId() {
  // Look for tags whose ID is a string starting with 'x'
  const customIds = tags
    .filter(t => typeof t.id === 'string' && t.id.startsWith('x'))
    .map(t => parseInt(t.id.slice(1), 10));
  const maxCustom = customIds.length ? Math.max(...customIds) : 0;
  return 'x' + (maxCustom + 1);
}

// Returns the next available integer tag ID for predefined/vocab
function getNextIntegerId() {
  const intIds = tags
    .filter(t => typeof t.id === 'number')
    .map(t => t.id);
  const maxId = intIds.length ? Math.max(...intIds) : 0;
  return maxId + 1;
}

const updateMsg = (msg, isError = false) => {
  const el = document.getElementById('updateMsg');
  el.innerHTML = msg ? (isError ? `<span class="error">${msg}</span>` : `<span class="success">${msg}</span>`) : '';
  setTimeout(() => { el.innerHTML = ''; }, 2200);
};

async function loadData() {
  tags = await fetch('assets/tags.json').then(r=>r.json());
  aliases = await fetch('assets/aliases.json').then(r=>r.json());
  renderAll();
}

function renderAll() {
  renderCustomTagsTable();
  renderPredefTable();
  renderVocabTable();
  renderAliasesSection();
}

function renderCustomTagsTable() {
  const filter = document.getElementById('customFilter').value.trim().toLowerCase();
  const table = document.getElementById('customTagsTable');
  const customTags = tags.filter(t => (t.category === 'custom' || t.category === 'custom vocab') && (!filter || t.string.toLowerCase().includes(filter)));

  table.innerHTML = `
    <thead>
      <tr>
        <th>String</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${customTags.length === 0
        ? `<tr><td colspan="2"><em>No custom tags found.</em></td></tr>`
        : customTags.map(tag => renderCustomTagRow(tag)).join('')}
    </tbody>
  `;
}

window.showAliasDropdown = function(btn, id) {
  hideAllAliasDropdowns();
  const row = btn.closest('tr');
  const dropdownCell = row.querySelector('.aliasDropdown');
  dropdownCell.style.display = 'inline';
  dropdownCell.innerHTML = `
    <input type="text" id="aliasFilterInput_${id}" placeholder="Type to filter…" style="width:170px;" autocomplete="off" oninput="updateAliasDropdownOptions(${id})">
    <select id="aliasSelect_${id}" size="7" style="width:220px;margin-left:3px;margin-right:6px;"></select>
    <button onclick="onAliasSelect(${id})">Add</button>
    <button onclick="hideAllAliasDropdowns()">Cancel</button>
  `;
  updateAliasDropdownOptions(id);
  setTimeout(() => {
    document.getElementById(`aliasFilterInput_${id}`).focus();
  }, 0);
};

window.updateAliasDropdownOptions = function(id) {
  const filterInput = document.getElementById(`aliasFilterInput_${id}`);
  const filter = filterInput ? filterInput.value.trim().toLowerCase() : '';
  const select = document.getElementById(`aliasSelect_${id}`);
  if (!select) return;
  const options = tags.filter(t =>
    (t.category === 'predefined' || t.category === 'vocab') &&
    (!filter || t.string.toLowerCase().includes(filter))
  );
  select.innerHTML = options.length === 0
    ? `<option disabled>(No matches)</option>`
    : options.map(t => `<option value="${t.id}">${t.string} (${t.category})</option>`).join('');
};

window.onAliasSelect = function(id) {
  const select = document.getElementById(`aliasSelect_${id}`);
  const selectedId = select && select.value;
  if (!selectedId) return;
  window.addAliasAndRemove(id, selectedId);
};

window.hideAllAliasDropdowns = function() {
  document.querySelectorAll('.aliasDropdown').forEach(e => e.style.display = 'none');
};

window.convertCustomTag = function(id, category) {
  const idx = tags.findIndex(t => String(t.id) === String(id));
  if (idx === -1) return updateMsg('Tag not found.', true);

  tags[idx].category = category;
  tags[idx].id = getNextIntegerId();   // <--- convert xN to next integer
  renderAll();
  updateMsg(`Tag "${tags[idx].string}" converted to ${category}.`);
};

window.addAliasAndRemove = function(id, targetId) {
  if (!targetId) return;
  const idx = tags.findIndex(t => String(t.id) === String(id));
  const aliasString = tags[idx].string;
  aliases.push({ alias: aliasString, id: Number(targetId) });
  tags.splice(idx, 1);
  renderAll();
  updateMsg(`"${aliasString}" added as alias.`);
};

window.deleteCustomTag = function(id) {
  const idx = tags.findIndex(t => String(t.id) === String(id));
  const str = tags[idx].string;
  if (!confirm(`Delete custom tag "${str}"?`)) return;
  tags.splice(idx, 1);
  renderAll();
  updateMsg(`Tag "${str}" deleted.`);
};

function renderCustomTagRow(tag) {
  // Disable Predef if it's custom vocab; disable Vocab if it's custom
  const disablePredef = tag.category === 'custom vocab' ? 'disabled' : '';
  const disableVocab = tag.category === 'custom' ? 'disabled' : '';
  // If tag is being edited, show input and save/cancel buttons
  if (tag._editing) {
    return `
      <tr data-id="c${tag.id}">
        <td>
          <input id="editCustomInput_${tag.id}" type="text" value="${tag.string}" style="width:160px;">
        </td>
        <td class="actions">
          <button onclick="saveCustomTagEdit('${tag.id}')">Save</button>
          <button onclick="cancelCustomTagEdit('${tag.id}')">Cancel</button>
        </td>
      </tr>
    `;
  }
  return `
    <tr data-id="c${tag.id}">
      <td>${tag.string}</td>
      <td class="actions">
        <button onclick="convertCustomTag('${tag.id}', 'predefined')" ${disablePredef}>Predef</button>
        <button onclick="convertCustomTag('${tag.id}', 'vocab')" ${disableVocab}>Vocab</button>
        <button onclick="showAliasDropdown(this, '${tag.id}')">Alias ▼</button>
        <button onclick="editCustomTag('${tag.id}')">Edit</button>
        <button onclick="deleteCustomTag('${tag.id}')" style="color:#a00;">Delete</button>
        <span class="aliasDropdown" style="display:none"></span>
      </td>
    </tr>
  `;
}


window.editCustomTag = function(id) {
  const idx = tags.findIndex(t => t.id === id);
  if (idx === -1) return updateMsg('Tag not found.', true);
  tags[idx]._editing = true;
  renderAll();
  setTimeout(() => {
    document.getElementById(`editCustomInput_${id}`).focus();
  }, 0);
};

window.saveCustomTagEdit = function(id) {
  const input = document.getElementById(`editCustomInput_${id}`);
  const newVal = input.value.trim();
  if (!newVal) return updateMsg('Tag cannot be empty.', true);
  const idx = tags.findIndex(t => t.id === id);
  tags[idx].string = newVal;
  delete tags[idx]._editing;
  renderAll();
  updateMsg('Tag updated.');
};

window.cancelCustomTagEdit = function(id) {
  const idx = tags.findIndex(t => t.id === id);
  if (idx !== -1) delete tags[idx]._editing;
  renderAll();
};


window.deleteTag = function(id) {
  const idx = tags.findIndex(t => String(t.id) === String(id));
  if (idx === -1) return;
  const str = tags[idx].string;
  if (!confirm(`Delete tag "${str}" (${tags[idx].category})? This will break aliases pointing to it.`)) return;
  tags.splice(idx, 1);
  renderAll();
  updateMsg(`Tag "${str}" deleted.`);
};

window.editTag = function(id) {
  const row = document.querySelector(`tr[data-id="t${id}"]`);
  if (!row) return;
  const tag = tags.find(t => String(t.id) === String(id));
  const input = `<input id="editInput_${id}" type="text" value="${tag.string}" style="width:160px;">`;
  row.querySelector('.tagStringCell').innerHTML = input;
  row.querySelector('.actions').innerHTML = `
    <button onclick="saveTagEdit(${id})">Save</button>
    <button onclick="renderAll()">Cancel</button>
  `;
  row.querySelector(`#editInput_${id}`).focus();
};

window.saveTagEdit = function(id) {
  const input = document.getElementById(`editInput_${id}`);
  const newVal = input.value.trim();
  if (!newVal) return updateMsg('Tag cannot be empty.', true);
  const idx = tags.findIndex(t => String(t.id) === String(id));
  tags[idx].string = newVal;
  renderAll();
  updateMsg('Tag updated.');
};

function renderTagTable(list) {
  return `
    <table>
      <thead>
        <tr><th>ID</th><th>String</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${list.map(t => `
          <tr data-id="t${t.id}">
            <td>${t.id}</td>
            <td class="tagStringCell">${t.string}</td>
            <td class="actions">
              <button onclick="editTag(${t.id})">Edit</button>
              <button onclick="deleteTag(${t.id})" style="color:#a00;">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderPredefTable() {
  const list = tags.filter(t => t.category === 'predefined');
  document.getElementById('predefTagsTable').innerHTML = renderTagTable(list);
}

function renderVocabTable() {
  const list = tags.filter(t => t.category === 'vocab');
  document.getElementById('vocabTagsTable').innerHTML = renderTagTable(list);
}

// --------- ALIAS LIST SECTION ---------

function renderAliasesSection() {
  let section = document.getElementById('aliasSection');
  if (!section) {
    section = document.createElement('div');
    section.id = 'aliasSection';
    section.innerHTML = `
      <details>
        <summary><b>Show Alias List</b></summary>
        <div id="aliasTableContainer"></div>
      </details>
    `;
    document.body.appendChild(section);
  }
  renderAliasTable();
}

function renderAliasTable() {
  const tagMap = {};
  tags.forEach(t => tagMap[t.id] = t.string);
  // Also include deleted tag strings for aliases (from initial load)
  aliases.forEach(a => {
    if (!tagMap[a.id]) {
      // Try to find in localStorage for session edits, else show ID
      tagMap[a.id] = '(ID '+a.id+')';
    }
  });

  const html = `
    <table>
      <thead>
        <tr>
          <th>Alias String</th>
          <th>Target Tag</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${aliases.length === 0
          ? `<tr><td colspan="3"><em>No aliases defined.</em></td></tr>`
          : aliases.map((a, idx) => renderAliasRow(a, idx, tagMap)).join('')}
      </tbody>
    </table>
  `;
  document.getElementById('aliasTableContainer').innerHTML = html;
}

function renderAliasRow(aliasObj, idx, tagMap) {
  if (aliasObj._editing) {
    return `
      <tr data-aliasidx="${idx}">
        <td>
          <input type="text" id="editAliasInput_${idx}" value="${aliasObj.alias}" style="width:160px;">
        </td>
        <td>${tagMap[aliasObj.id] || '(not found)'}</td>
        <td>
          <button onclick="saveAliasEdit(${idx})">Save</button>
          <button onclick="cancelAliasEdit(${idx})">Cancel</button>
        </td>
      </tr>
    `;
  }
  return `
    <tr data-aliasidx="${idx}">
      <td>${aliasObj.alias}</td>
      <td>${tagMap[aliasObj.id] || '(not found)'}</td>
      <td>
        <button onclick="editAlias(${idx})">Edit</button>
        <button onclick="deleteAlias(${idx})" style="color:#a00;">Delete</button>
      </td>
    </tr>
  `;
}

window.editAlias = function(idx) {
  aliases[idx]._editing = true;
  renderAliasTable();
  setTimeout(() => {
    document.getElementById(`editAliasInput_${idx}`).focus();
  }, 0);
};

window.saveAliasEdit = function(idx) {
  const input = document.getElementById(`editAliasInput_${idx}`);
  const newVal = input.value.trim();
  if (!newVal) return updateMsg('Alias cannot be empty.', true);
  aliases[idx].alias = newVal;
  delete aliases[idx]._editing;
  renderAliasTable();
  updateMsg('Alias updated.');
};

window.cancelAliasEdit = function(idx) {
  delete aliases[idx]._editing;
  renderAliasTable();
};

window.deleteAlias = function(idx) {
  if (!confirm(`Delete alias "${aliases[idx].alias}"?`)) return;
  aliases.splice(idx, 1);
  renderAliasTable();
  updateMsg('Alias deleted.');
};

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  document.getElementById('customFilter').addEventListener('input', renderCustomTagsTable);
  document.getElementById('saveAll').addEventListener('click', async () => {
    try {
      const [resTags, resAliases] = await Promise.all([
        fetch('/save_tags', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(tags)
        }),
        fetch('/save_aliases', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(aliases)
        })
      ]);
      // Only read the responses ONCE each!
      const resTagsJson = await resTags.json();
      const resAliasesJson = await resAliases.json();

      const ok1 = resTags.ok && resTagsJson.status === 'success';
      const ok2 = resAliases.ok && resAliasesJson.status === 'success';
      if (ok1 && ok2) {
        updateMsg('Saved successfully!');
      } else {
        updateMsg('Failed to save changes.', true);
      }
    } catch (e) {
      updateMsg('Failed to save changes.', true);
    }
  });
});


