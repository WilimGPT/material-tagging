// ==========================
  // == Global Data/Handles  ==
  // ==========================
  let pdfDoc = null;
  let pagesText = [], pagesOcrText = [], pagesTopicTags = [], pagesVocabTags = [];
  let currentPage = 1;
  const scale = 1.5;

  let allTags = [];
  let allAliases = [];

    async function loadTagData() {
    const [tagsResp, aliasesResp] = await Promise.all([
        fetch('assets/tags.json'),
        fetch('assets/aliases.json')
    ]);
    allTags = await tagsResp.json();
    allAliases = await aliasesResp.json();
    }

  // DOM element handles
  let fileInput, goButton, prevButton, nextButton, copyBtn;
  let canvas, ctx, output, ocrOutput, pageIndicator;
  let topicInput, vocabInput, topicSuggest, vocabSuggest;

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
  function getSuggestions(value, category) {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    const tagMatches = allTags
        .filter(t => t.category === category && t.string.toLowerCase().startsWith(q))
        .map(t => t.string);
    const aliasMatches = allAliases
        .filter(a => a.alias.toLowerCase().startsWith(q))
        .map(a => {
        const tagObj = allTags.find(t => t.id == a.id);
        return tagObj ? tagObj.string : null;
        })
        .filter(Boolean);
    return Array.from(new Set([...tagMatches, ...aliasMatches])).slice(0, 10);
    }

  // Display suggestions for the relevant input
  function showSuggestions(which) {
    const isTopic = which === 'topic';
    const cat     = isTopic ? 'predefined' : 'vocab';
    const input   = isTopic ? topicInput  : vocabInput;
    const list    = isTopic ? topicSuggest : vocabSuggest;
    const matches = getSuggestions(input.value, cat);

    list.innerHTML = '';
    matches.forEach(m => {
      const li = document.createElement('li');
      li.textContent = m;
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
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = topicInput.value.trim();
      if (!val) return;
      // Use first suggestion if exists, else plain value
      const suggestion = getSuggestions(val, 'predefined')[0] || val;
      selectSuggestion(suggestion, 'topic');
    }
  }

  // Respond to ENTER in vocab field
  function onVocabKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = vocabInput.value.trim();
      if (!val) return;
      const suggestion = getSuggestions(val, 'vocab')[0] || val;
      selectSuggestion(suggestion, 'vocab');
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

    // ---- Initial rendering (tags blank) ---
    renderTags();
  });