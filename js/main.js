// ==========================
  // == Global Data/Handles  ==
  // ==========================
  let pdfDoc = null;
  let pagesText = [], pagesOcrText = [], pagesTopicTags = [], pagesVocabTags = [];
  let currentPage = 1;
  const scale = 1.5;

  let allTags = [];
  let allAliases = [];
  let levelSelected = '';
  let topicSelectedIdx = -1, vocabSelectedIdx = -1;



    async function loadTagData() {
    const [tagsResp, aliasesResp] = await Promise.all([
        fetch('assets/tags.json'),
        fetch('assets/aliases.json')
    ]);
    allTags = await tagsResp.json();
    allAliases = await aliasesResp.json();
    }

    // Resolves a tag string: replaces alias with canonical tag if found
      function resolveTagString(tagStr) {
        const normalized = tagStr.trim().toLowerCase();
        // 1. Look for alias match (case-insensitive)
        const aliasObj = allAliases.find(a => a.alias.trim().toLowerCase() === normalized);
        if (aliasObj) {
          // 2. Find the canonical tag
          const canonicalTag = allTags.find(t => t.id == aliasObj.id);
          if (canonicalTag) return canonicalTag.string;
        }
        // 3. Not found? Return as is
        return tagStr;
      }

  // DOM element handles
  let fileInput, goButton, prevButton, nextButton, copyBtn;
  let canvas, ctx, output, ocrOutput, pageIndicator;
  let topicInput, vocabInput, topicSuggest, vocabSuggest;



  // --- Compose Export Object for this PDF/Tag job ---
    function buildExportObject() {
    // Get filename from file input
    const fname = fileInput.files[0] ? fileInput.files[0].name : 'unknown.pdf';

    // Build per-page text array (with optional OCR key)
    const textArr = pagesText.map((scraped, idx) => {
        const ob = { page: idx+1, scrapedText: scraped };
        if (pagesOcrText[idx] && pagesOcrText[idx].trim()) {
        ob.OCR = pagesOcrText[idx];
        }
        return ob;
    });

    // Build the tag occurrence map:
    // key: tagString, value: Set of page numbers (1-based)
    const tagMap = {};
    pagesTopicTags.forEach((arr, idx) => {
        arr.forEach(tag => {
        if (!tagMap[tag]) tagMap[tag] = new Set();
        tagMap[tag].add(idx+1);
        });
    });
    pagesVocabTags.forEach((arr, idx) => {
        arr.forEach(tag => {
        const asVocab = 'vocab: ' + tag;
        if (!tagMap[asVocab]) tagMap[asVocab] = new Set();
        tagMap[asVocab].add(idx+1);
        });
    });

    // Map to canonical, then group pages by canonical string
      const canonTagMap = {};
      Object.entries(tagMap).forEach(([string, pagesSet]) => {
        const canonical = resolveTagString(string);
        if (!canonTagMap[canonical]) canonTagMap[canonical] = new Set();
        pagesSet.forEach(page => canonTagMap[canonical].add(page));
      });
      const tagArr = Object.entries(canonTagMap).map(([string, pagesSet]) => ({
        string,
        pages: Array.from(pagesSet)
      }));

    // FINAL OBJECT
    return {
        filename: fname,
        text: textArr,
        Tags: tagArr,
        Level: levelSelected || ""
    };
    }


    async function appendOutputToServer(newEntry) {
        const resp = await fetch('/append_output', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newEntry)
        });
        const result = await resp.json();
        if (!resp.ok || result.status !== 'success') {
            alert('Failed to append output');
        } else {
            alert('Output appended!');
        }
    }

  // ==========================
  // == Core PDF Functions   ==
  // ==========================
  function renderPage(pageNum) {
    return pdfDoc.getPage(pageNum).then(page => {
      const vp = page.getViewport({ scale });
      canvas.width = vp.width;
      canvas.height = vp.height;
      return page.render({ canvasContext: ctx, viewport: vp }).promise;
    });
  }

  function updateNav() {
    pageIndicator.textContent = `Page ${currentPage} / ${pagesText.length}`;
    prevButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= pagesText.length;

    output.textContent = pagesText[currentPage - 1] || '';
    ocrOutput.textContent = pagesOcrText[currentPage - 1] || '';

    renderPage(currentPage);
    renderTags();
  }

  // Load & OCR a PDF, fill per-page arrays
  async function loadPdf() {
    const file = fileInput.files[0];
    if (!file) return alert('Please select a PDF.');

    goButton.disabled = true;
    output.textContent = 'Loading...';

    const reader = new FileReader();
    reader.onload = async () => {
      const data = new Uint8Array(reader.result);
      pdfDoc = await pdfjsLib.getDocument(data).promise;
      const maxPages = pdfDoc.numPages;

      // Reinitialize per-page storage
      pagesText = [];
      pagesOcrText = [];
      pagesTopicTags = Array.from({ length: maxPages }, () => []);
      pagesVocabTags = Array.from({ length: maxPages }, () => []);

      for (let i = 1; i <= maxPages; i++) {
        const page = await pdfDoc.getPage(i);
        const tc = await page.getTextContent();
        const scraped = tc.items.map(it => it.str).join(' ').trim();

        let ocrText = '';
        if (scraped.split(/\s+/).length < 10) {
          await renderPage(i);
          const res = await Tesseract.recognize(canvas, 'eng');
          ocrText = res.data.text;
        }

        pagesText.push(scraped);
        pagesOcrText.push(ocrText);
      }

      currentPage = 1;
      updateNav();
      goButton.disabled = false;
    };
    reader.readAsArrayBuffer(file);
  }

  // ==============================
  // ==== Tag UI/Logic Section ====
  // ==============================

  // Render tags for current page (does NOT touch suggestion <ul>s!)
  function renderTags() {
    const idx = currentPage - 1;
    const topicTagsDiv = document.getElementById('topicTags');
    const vocabTagsDiv = document.getElementById('vocabTags');
    topicTagsDiv.innerHTML = '';
    vocabTagsDiv.innerHTML = '';

    // Render topic tags
    pagesTopicTags[idx].forEach((t, i) => {
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = t;
      // Remove tag X
      const x = document.createElement('span');
      x.className = 'remove'; x.textContent = '×';
      x.onclick = () => { pagesTopicTags[idx].splice(i, 1); renderTags(); };
      span.appendChild(x);
      topicTagsDiv.appendChild(span);
    });

    // Render vocab tags
    pagesVocabTags[idx].forEach((v, i) => {
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = v;
      const x = document.createElement('span');
      x.className = 'remove'; x.textContent = '×';
      x.onclick = () => { pagesVocabTags[idx].splice(i, 1); renderTags(); };
      span.appendChild(x);
      vocabTagsDiv.appendChild(span);
    });
  }

  // Suggestion helper
 function getSuggestions(value, which) {
    // which: 'topic' or 'vocab'
    const q = value.trim().toLowerCase();
    if (!q) return [];
    let allowedCats, targetCat;
    if (which === 'topic') {
      allowedCats = ['predefined', 'custom'];
      targetCat = 'predefined';
    } else {
      allowedCats = ['vocab', 'custom vocab'];
      targetCat = 'vocab';
    }
    // Main tag matches
    const tagMatches = allTags
      .filter(t => allowedCats.includes(t.category) && t.string.toLowerCase().startsWith(q))
      .map(t => t.string);
    // Aliases, but only if their canonical tag is the right type
    const aliasMatches = allAliases
      .map(a => {
        const tagObj = allTags.find(t => String(t.id) === String(a.id));
        if (!tagObj) return null;
        if (tagObj.category !== targetCat) return null;
        if (!a.alias.toLowerCase().startsWith(q)) return null;
        return tagObj.string;
      })
      .filter(Boolean);
    // Deduplicate
    return Array.from(new Set([...tagMatches, ...aliasMatches])).slice(0, 10);
  }

  // Display suggestions for the relevant input
  function showSuggestions(which) {
    const isTopic = which === 'topic';
    const input   = isTopic ? topicInput : vocabInput;
    const list    = isTopic ? topicSuggest : vocabSuggest;
    const matches = getSuggestions(input.value, which);
    const selectedIdx = isTopic ? topicSelectedIdx : vocabSelectedIdx;

    list.innerHTML = '';
    matches.forEach((m, i) => {
      const li = document.createElement('li');
      li.textContent = m;
      if (i === selectedIdx) li.classList.add('selected');
      li.addEventListener('mousedown', e => {
        e.preventDefault();
        selectSuggestion(m, which);
        if (isTopic) topicSelectedIdx = -1;
        else vocabSelectedIdx = -1;
      });
      list.appendChild(li);
    });
    list.style.display = matches.length ? 'block' : 'none';
  }


  // Add a tag to the appropriate page's array and update tags UI
  function selectSuggestion(text, which) {
    const idx = currentPage - 1;
    if (which === 'topic') {
      if (!pagesTopicTags[idx].includes(text)) // prevent duplicates
        pagesTopicTags[idx].push(text);
      topicInput.value = '';
      topicSuggest.innerHTML = '';
      topicSuggest.style.display = 'none';
    } else {
      if (!pagesVocabTags[idx].includes(text))
        pagesVocabTags[idx].push(text);
      vocabInput.value = '';
      vocabSuggest.innerHTML = '';
      vocabSuggest.style.display = 'none';
    }
    renderTags();
  }

  // Respond to ENTER in topic field
  function onTopicKeydown(e) {
    const matches = getSuggestions(topicInput.value, 'topic');
    if (e.key === 'ArrowDown') {
      if (matches.length) {
        topicSelectedIdx = Math.min(matches.length - 1, topicSelectedIdx + 1);
        showSuggestions('topic');
        e.preventDefault();
      }
    } else if (e.key === 'ArrowUp') {
      if (matches.length) {
        topicSelectedIdx = Math.max(-1, topicSelectedIdx - 1);
        showSuggestions('topic');
        e.preventDefault();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (topicSelectedIdx >= 0 && matches[topicSelectedIdx]) {
        selectSuggestion(matches[topicSelectedIdx], 'topic');
        topicSelectedIdx = -1;
      } else {
        const val = topicInput.value.trim();
        if (!val) return;
        selectSuggestion(val, 'topic');
        topicSelectedIdx = -1;
      }
    } else {
      topicSelectedIdx = -1;
      setTimeout(() => showSuggestions('topic'), 0);
    }
  }

// Respond to ENTER in vocab field
  function onVocabKeydown(e) {
    const matches = getSuggestions(vocabInput.value, 'vocab');
    if (e.key === 'ArrowDown') {
      if (matches.length) {
        vocabSelectedIdx = Math.min(matches.length - 1, vocabSelectedIdx + 1);
        showSuggestions('vocab');
        e.preventDefault();
      }
    } else if (e.key === 'ArrowUp') {
      if (matches.length) {
        vocabSelectedIdx = Math.max(-1, vocabSelectedIdx - 1);
        showSuggestions('vocab');
        e.preventDefault();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (vocabSelectedIdx >= 0 && matches[vocabSelectedIdx]) {
        selectSuggestion(matches[vocabSelectedIdx], 'vocab');
        vocabSelectedIdx = -1;
      } else {
        const val = vocabInput.value.trim();
        if (!val) return;
        selectSuggestion(val, 'vocab');
        vocabSelectedIdx = -1;
      }
    } else {
      vocabSelectedIdx = -1;
      setTimeout(() => showSuggestions('vocab'), 0);
    }
  }


  // Copy tags from current page to all pages
  function copyToAll() {
    const idx = currentPage - 1;
    const t = [...pagesTopicTags[idx]];
    const v = [...pagesVocabTags[idx]];
    pagesTopicTags = pagesTopicTags.map(() => [...t]);
    pagesVocabTags = pagesVocabTags.map(() => [...v]);
    renderTags();
  }

    async function exportNewTagsToServer() {
        // 1. Gather all tags the user used (from all pages)
        const allTopicTags = new Set();
        pagesTopicTags.forEach(arr => arr.forEach(tag => allTopicTags.add(tag.trim())));

        const allVocabTags = new Set();
        pagesVocabTags.forEach(arr => arr.forEach(tag => allVocabTags.add(tag.trim())));

        // 2. Fetch existing tags.json
        let serverTags = [];
        try {
            const resp = await fetch('assets/tags.json');
            if (resp.ok) {
            serverTags = await resp.json();
            }
        } catch (e) { serverTags = []; }

        const serverTagStrings = new Set(serverTags.map(t => t.string.trim().toLowerCase()));

        // 3. Compute new tags (those not present)
        const newTags = [];
        for (let tag of allTopicTags) {
            if (!serverTagStrings.has(tag.toLowerCase())) {
            newTags.push({string: tag, category: "custom"});
            }
        }
        for (let tag of allVocabTags) {
            if (!serverTagStrings.has(tag.toLowerCase())) {
            newTags.push({string: tag, category: "custom vocab"});
            }
        }

        // 4. If any, POST them to Flask
        if (newTags.length) {
            const resp = await fetch('/append_tags', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(newTags)
            });
            const result = await resp.json();
            if (result.status === 'success' && result.added && result.added.length > 0) {
            alert(`Added new tags:\n${result.added.map(t => t.string + " (" + t.category + ")").join("\n")}`);
            } else {
            alert('No new tags were added.');
            }
        } else {
            alert('No new tags found!');
        }
    }

  // ==============================
  // ====== Main Loop: Init =======
  // ==============================
  window.addEventListener('DOMContentLoaded', async () => {
    await loadTagData();

    // --- Collect all elements ---
    fileInput     = document.getElementById('fileInput');
    goButton      = document.getElementById('goButton');
    prevButton    = document.getElementById('prevButton');
    nextButton    = document.getElementById('nextButton');
    copyBtn       = document.getElementById('copyToAll');
    canvas        = document.getElementById('pdfViewer');
    ctx           = canvas.getContext('2d');
    output        = document.getElementById('output');
    ocrOutput     = document.getElementById('ocrOutput');
    pageIndicator = document.getElementById('pageIndicator');
    topicInput    = document.getElementById('topicInput');
    vocabInput    = document.getElementById('vocabInput');
    topicSuggest  = document.getElementById('topicSuggestions');
    vocabSuggest  = document.getElementById('vocabSuggestions');

    levelSelect = document.getElementById('levelSelect');
    levelSelected = levelSelect.value;
    levelSelect.addEventListener('change', () => {
      levelSelected = levelSelect.value;
    });

    // --- Main PDF events ---
    goButton.addEventListener('click', loadPdf);
    prevButton.addEventListener('click', () => { if(currentPage > 1) { currentPage--; updateNav(); } });
    nextButton.addEventListener('click', () => { if(currentPage < pagesText.length) { currentPage++; updateNav(); } });
    copyBtn.addEventListener('click', copyToAll);

    // === Tag inputs: input, keydown, click suggestion
    topicInput.addEventListener('input',  () => showSuggestions('topic'));
    topicInput.addEventListener('keydown', onTopicKeydown);
    vocabInput.addEventListener('input',  () => showSuggestions('vocab'));
    vocabInput.addEventListener('keydown', onVocabKeydown);

    // Hide suggestions when input loses focus (with delay for click)
    topicInput.addEventListener('blur', () => setTimeout(() => topicSuggest.style.display = 'none', 120));
    vocabInput.addEventListener('blur', () => setTimeout(() => vocabSuggest.style.display = 'none', 120));


    topicInput.addEventListener('blur', () => {
      setTimeout(() => {
        topicSuggest.style.display = 'none';
        topicSelectedIdx = -1;
      }, 120);
    });
    vocabInput.addEventListener('blur', () => {
      setTimeout(() => {
        vocabSuggest.style.display = 'none';
        vocabSelectedIdx = -1;
      }, 120);
    });

    // Suggestion list: click to select
    topicSuggest.addEventListener('click', e => {
      if (e.target.tagName === 'LI') {
        selectSuggestion(e.target.textContent, 'topic');
      }
    });
    vocabSuggest.addEventListener('click', e => {
      if (e.target.tagName === 'LI') {
        selectSuggestion(e.target.textContent, 'vocab');
      }
    });

    // EXPORT BUTTONS
    document.getElementById('exportOutput').addEventListener('click', () => {
    const exportData = buildExportObject();
    appendOutputToServer(exportData); // send to Flask
    });

    document.getElementById('exportTags').addEventListener('click', exportNewTagsToServer);


    // ---- Initial rendering (tags blank) ---
    renderTags();
  });