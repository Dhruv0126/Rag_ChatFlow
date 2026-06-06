/* ===== Config & State ===== */
const CHAT_MEMORY_KEY = 'chat_history';
const ACTIVE_DOC_KEY = 'active_doc_id';
const BOT_AVATAR_SRC = '/static/images/blackbot.jpg';

const popSound = new Audio('/static/sounds/pop-cartoon-328167.mp3');
popSound.preload = 'auto';

let currentSources = [];
let usedChunkIds = new Set();
let selectedFile = null;
let activeDocId = localStorage.getItem(ACTIVE_DOC_KEY) || '';
let indexedDocuments = [];

const userInitials = document.body.dataset.userInitials || 'U';
const botAvatarImg = BOT_AVATAR_SRC;

/* ===== Markdown ===== */
marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(text) {
  const raw = marked.parse(text || '');
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'a'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  });
}

/* ===== Toast ===== */
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? 'check-circle' : 'alert-circle';
  toast.innerHTML = `<i data-lucide="${icon}"></i><span>${message}</span>`;
  container.appendChild(toast);
  lucide.createIcons({ nodes: [toast] });
  setTimeout(() => toast.remove(), 4000);
}

/* ===== Theme ===== */
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.setAttribute('data-lucide', theme === 'light' ? 'moon' : 'sun');
    lucide.createIcons({ nodes: [icon.parentElement] });
  }
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(saved || (prefersDark ? 'dark' : 'light'));
  document.getElementById('toggleTheme')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'light' ? 'dark' : 'light');
  });
}

/* ===== Welcome State ===== */
function updateWelcomeVisibility() {
  const messages = document.getElementById('chatMessages');
  const welcome = document.getElementById('welcomeState');
  const hasMessages = messages.children.length > 0;
  welcome.classList.toggle('hidden', hasMessages);
}

/* ===== Avatars ===== */
function createAvatar(sender) {
  const el = document.createElement('div');
  el.className = `avatar ${sender}-avatar`;
  if (sender === 'user') {
    el.textContent = userInitials;
  } else {
    const img = document.createElement('img');
    img.src = botAvatarImg;
    img.alt = 'Bot';
    el.appendChild(img);
  }
  return el;
}

/* ===== Messages ===== */
function scrollToBottom() {
  const win = document.getElementById('chatWindow');
  if (win) win.scrollTop = win.scrollHeight;
}

function addCopyButton(wrapper, text) {
  const btn = document.createElement('button');
  btn.className = 'copy-btn';
  btn.title = 'Copy';
  btn.innerHTML = '<i data-lucide="copy"></i>';
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      btn.innerHTML = '<i data-lucide="check"></i>';
      lucide.createIcons({ nodes: [btn] });
      setTimeout(() => {
        btn.innerHTML = '<i data-lucide="copy"></i>';
        lucide.createIcons({ nodes: [btn] });
      }, 1500);
    } catch {
      showToast('Could not copy text', 'error');
    }
  });
  wrapper.appendChild(btn);
}

function getChunkKey(src) {
  return src.chunk_key || `${src.doc_id || activeDocId}:${src.chunk}`;
}

function setActiveDocument(docId, { persist = true } = {}) {
  activeDocId = docId || '';
  if (persist) {
    if (activeDocId) {
      localStorage.setItem(ACTIVE_DOC_KEY, activeDocId);
    } else {
      localStorage.removeItem(ACTIVE_DOC_KEY);
    }
  }
  const select = document.getElementById('docSelect');
  if (select && select.value !== activeDocId) {
    select.value = activeDocId;
  }
  updateDocSelectorState();
}

function updateDocSelectorState() {
  const select = document.getElementById('docSelect');
  const hint = document.getElementById('docSelectHint');
  if (!select) return;

  const hasDocs = indexedDocuments.length > 0;
  select.disabled = !hasDocs;
  if (hint) {
    hint.hidden = hasDocs;
  }
}

async function loadDocuments({ preferredDocId = null } = {}) {
  try {
    const res = await fetch('/documents');
    const data = await res.json();
    indexedDocuments = data.documents || [];
    renderDocumentSelector();

    const nextDocId = preferredDocId
      || (activeDocId && indexedDocuments.some((doc) => doc.doc_id === activeDocId) ? activeDocId : '')
      || (indexedDocuments.length ? indexedDocuments[indexedDocuments.length - 1].doc_id : '');

    setActiveDocument(nextDocId);
    updateDocBadge();
  } catch {
    /* silent */
  }
}

function renderDocumentSelector() {
  const select = document.getElementById('docSelect');
  if (!select) return;

  const previous = activeDocId;
  select.innerHTML = '';

  if (!indexedDocuments.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No documents uploaded';
    select.appendChild(option);
    updateDocSelectorState();
    return;
  }

  indexedDocuments.forEach((doc) => {
    const option = document.createElement('option');
    option.value = doc.doc_id;
    option.textContent = `${doc.source} (${doc.chunk_count} chunks)`;
    select.appendChild(option);
  });

  if (previous && indexedDocuments.some((doc) => doc.doc_id === previous)) {
    select.value = previous;
  } else if (indexedDocuments.length) {
    select.value = indexedDocuments[indexedDocuments.length - 1].doc_id;
  }

  updateDocSelectorState();
}

function addCitationPills(wrapper, sources) {
  if (!sources || !sources.length) return;
  const pills = document.createElement('div');
  pills.className = 'citation-pills';
  sources.forEach((src, i) => {
    const pill = document.createElement('button');
    pill.className = 'citation-pill';
    pill.textContent = `[${i + 1}] ${src.source || 'Source'}`;
    pill.title = `Chunk #${src.chunk} · ${(src.relevance * 100).toFixed(0)}% match`;
    pill.addEventListener('click', () => jumpToSource(getChunkKey(src)));
    pills.appendChild(pill);
  });
  wrapper.appendChild(pills);
}

function addMessage(text, sender, options = {}) {
  const { shouldSave = true, sources = null, isError = false } = options;
  const chatMessages = document.getElementById('chatMessages');
  const row = document.createElement('div');
  row.className = `message-row ${sender}-message`;

  const avatar = createAvatar(sender);
  row.appendChild(avatar);

  if (sender === 'user') {
    const bubble = document.createElement('div');
    bubble.className = 'user-bubble';
    bubble.textContent = text;
    const wrap = document.createElement('div');
    wrap.className = 'bubble-wrapper';
    wrap.appendChild(bubble);
    row.appendChild(wrap);
  } else {
    const wrap = document.createElement('div');
    wrap.className = 'bubble-wrapper';
    const bubble = document.createElement('div');
    bubble.className = `bot-bubble markdown-body${isError ? ' error-bubble' : ''}`;
    if (isError) {
      bubble.textContent = text;
    } else {
      bubble.innerHTML = renderMarkdown(text);
    }
    wrap.appendChild(bubble);
    if (!isError) {
      addCopyButton(wrap, text);
      if (sources) addCitationPills(wrap, sources);
    }
    row.appendChild(wrap);
  }

  chatMessages.appendChild(row);
  updateWelcomeVisibility();
  setTimeout(scrollToBottom, 80);

  if (shouldSave) saveChatToMemory();
}

function saveChatToMemory() {
  const rows = document.getElementById('chatMessages').querySelectorAll('.message-row:not(.typing-row)');
  const messages = [];
  rows.forEach((row) => {
    const isUser = row.classList.contains('user-message');
    const bubble = row.querySelector('.user-bubble, .bot-bubble');
    if (bubble) {
      messages.push({
        text: isUser ? bubble.textContent : bubble.textContent,
        sender: isUser ? 'user' : 'bot',
        timestamp: new Date().toISOString(),
      });
    }
  });
  localStorage.setItem(CHAT_MEMORY_KEY, JSON.stringify(messages));
}

function loadChatFromMemory() {
  const saved = localStorage.getItem(CHAT_MEMORY_KEY);
  if (!saved) return;
  try {
    JSON.parse(saved).forEach((msg) => addMessage(msg.text, msg.sender, { shouldSave: false }));
  } catch { /* ignore corrupt data */ }
}

/* ===== Typing Indicator ===== */
function showTyping() {
  removeTyping();
  const chatMessages = document.getElementById('chatMessages');
  const row = document.createElement('div');
  row.className = 'message-row bot-message typing-row';
  row.id = 'typingRow';
  row.appendChild(createAvatar('bot'));
  const wrap = document.createElement('div');
  wrap.className = 'bubble-wrapper';
  const bubble = document.createElement('div');
  bubble.className = 'typing-bubble';
  bubble.innerHTML = '<span></span><span></span><span></span>';
  wrap.appendChild(bubble);
  row.appendChild(wrap);
  chatMessages.appendChild(row);
  updateWelcomeVisibility();
  scrollToBottom();
}

function removeTyping() {
  document.getElementById('typingRow')?.remove();
}

/* ===== Chat ===== */
async function sendMessage() {
  const input = document.getElementById('userInput');
  const message = input.value.trim();
  if (!message) return;

  if (!activeDocId) {
    showToast('Upload or select a document before asking questions', 'error');
    return;
  }

  addMessage(message, 'user');
  input.value = '';
  autoResizeInput();

  showTyping();

  try {
    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, doc_id: activeDocId }),
    });
    const data = await res.json();
    removeTyping();

    if (res.ok) {
      addMessage(data.answer, 'bot', { sources: data.sources });
      if (data.sources) {
        currentSources = data.sources;
        data.sources.forEach((s) => usedChunkIds.add(getChunkKey(s)));
        updateSourceDisplay();
        if (window.innerWidth <= 900) {
          switchMobilePanel('sources');
        }
      }
      playFeedback();
    } else {
      addMessage(`Sorry, something went wrong: ${data.error || 'Unknown error'}`, 'bot', { isError: true });
    }
  } catch (err) {
    removeTyping();
    addMessage(`Network error: ${err.message}`, 'bot', { isError: true });
  }
}

/* ===== Sources ===== */
function updateSourceDisplay() {
  const sourceContent = document.getElementById('sourceContent');
  const showOnlyUsed = document.getElementById('showOnlyUsed').checked;
  const allSources = currentSources;

  document.getElementById('totalChunks').textContent = `Total: ${allSources.length}`;
  document.getElementById('usedChunks').textContent = `Used: ${usedChunkIds.size}`;

  const toShow = showOnlyUsed
    ? allSources.filter((s) => usedChunkIds.has(getChunkKey(s)))
    : allSources;

  sourceContent.innerHTML = '';

  if (!toShow.length) {
    sourceContent.innerHTML = `
      <div class="source-empty" id="sourceEmpty">
        <i data-lucide="search"></i>
        <p>Sources will appear here when the bot answers your questions.</p>
      </div>`;
    lucide.createIcons({ nodes: [sourceContent] });
    return;
  }

  toShow.forEach((src, idx) => {
    const chunkKey = getChunkKey(src);
    const chunk = document.createElement('div');
    chunk.className = `source-chunk${usedChunkIds.has(chunkKey) ? ' used' : ''}`;
    chunk.id = `source-chunk-${chunkKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    chunk.dataset.chunk = chunkKey;

    const pct = (src.relevance * 100).toFixed(0);
    chunk.innerHTML = `
      <div class="source-chunk-header">
        <div class="source-chunk-meta">
          <span>[${idx + 1}] ${src.source || 'Unknown'}</span>
          <span>Chunk #${src.chunk}</span>
          <span>${src.word_count} words</span>
        </div>
        <span class="relevance-badge">${pct}%</span>
      </div>
      <div class="source-chunk-content">${escapeHtml(src.content)}</div>`;

    sourceContent.appendChild(chunk);
  });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function jumpToSource(chunkKey) {
  if (window.innerWidth <= 900) switchMobilePanel('sources');
  const safeId = `source-chunk-${String(chunkKey).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const el = document.getElementById(safeId);
  const container = document.getElementById('sourceContent');
  if (el && container) {
    const top = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    el.classList.add('highlight-flash');
    setTimeout(() => el.classList.remove('highlight-flash'), 1200);
  }
}

/* ===== Upload ===== */
function openUploadModal() {
  const overlay = document.getElementById('uploadOverlay');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeUploadModal() {
  const overlay = document.getElementById('uploadOverlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  resetUploadForm();
}

function resetUploadForm() {
  selectedFile = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('filePreview').hidden = true;
  document.getElementById('uploadProgress').hidden = true;
  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('uploadBtn').disabled = true;
  document.getElementById('dropZone').classList.remove('drag-over');
}

function setSelectedFile(file) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['pdf', 'txt'].includes(ext)) {
    showToast('Only PDF and TXT files are supported', 'error');
    return;
  }
  selectedFile = file;
  const preview = document.getElementById('filePreview');
  preview.hidden = false;
  document.getElementById('filePreviewName').textContent = file.name;
  document.getElementById('filePreviewIcon').setAttribute('data-lucide', 'file-text');
  lucide.createIcons({ nodes: [preview] });
  document.getElementById('uploadBtn').disabled = false;
}

function uploadDocument() {
  if (!selectedFile) return;

  const btn = document.getElementById('uploadBtn');
  const progressWrap = document.getElementById('uploadProgress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');

  btn.disabled = true;
  progressWrap.hidden = false;
  progressFill.style.width = '0%';
  progressText.textContent = 'Uploading…';

  const formData = new FormData();
  formData.append('file', selectedFile);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/upload');

  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      progressFill.style.width = `${pct}%`;
      progressText.textContent = `Uploading… ${pct}%`;
    }
  });

  xhr.addEventListener('load', async () => {
    try {
      const data = JSON.parse(xhr.responseText);
      if (xhr.status === 200 && !data.error) {
        progressFill.style.width = '100%';
        progressText.textContent = 'Done!';
        showToast(`${data.successful_chunks} chunks indexed from ${selectedFile.name}`, 'success');
        playFeedback();
        await loadDocuments({ preferredDocId: data.doc_id });
        setTimeout(closeUploadModal, 600);
      } else {
        showToast(data.error || 'Upload failed', 'error');
        btn.disabled = false;
        progressWrap.hidden = true;
      }
    } catch {
      showToast('Upload failed — invalid response', 'error');
      btn.disabled = false;
      progressWrap.hidden = true;
    }
  });

  xhr.addEventListener('error', () => {
    showToast('Upload failed — network error', 'error');
    btn.disabled = false;
    progressWrap.hidden = true;
  });

  xhr.send(formData);
}

async function updateDocBadge() {
  try {
    const res = await fetch('/stats');
    const data = await res.json();
    const docCount = data.document_count ?? indexedDocuments.length;
    const chunkCount = data.doc_count ?? 0;
    document.getElementById('docCountText').textContent = `${docCount} doc${docCount === 1 ? '' : 's'} · ${chunkCount} chunks`;
  } catch { /* silent */ }
}

function initUpload() {
  const fab = document.getElementById('uploadFab');
  const overlay = document.getElementById('uploadOverlay');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');

  fab.addEventListener('click', openUploadModal);
  document.getElementById('closeUpload').addEventListener('click', closeUploadModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeUploadModal(); });
  document.getElementById('browseBtn').addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  document.getElementById('clearFile').addEventListener('click', (e) => { e.stopPropagation(); resetUploadForm(); });
  document.getElementById('uploadBtn').addEventListener('click', uploadDocument);

  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) setSelectedFile(fileInput.files[0]); });

  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) setSelectedFile(e.dataTransfer.files[0]);
  });
}

/* ===== Mobile Tabs ===== */
function switchMobilePanel(panel) {
  const chatPanel = document.getElementById('chatPanel');
  const sourcePanel = document.getElementById('sourcePanel');
  const tabChat = document.getElementById('tabChat');
  const tabSources = document.getElementById('tabSources');

  if (panel === 'sources') {
    chatPanel.classList.add('hidden-mobile');
    sourcePanel.classList.add('active');
    tabChat.classList.remove('active');
    tabSources.classList.add('active');
  } else {
    chatPanel.classList.remove('hidden-mobile');
    sourcePanel.classList.remove('active');
    tabChat.classList.add('active');
    tabSources.classList.remove('active');
  }
}

function initMobileTabs() {
  document.querySelectorAll('.mobile-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchMobilePanel(tab.dataset.panel));
  });
}

/* ===== Input ===== */
function autoResizeInput() {
  const ta = document.getElementById('userInput');
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
}

function initInput() {
  const input = document.getElementById('userInput');
  input.addEventListener('input', autoResizeInput);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  document.getElementById('sendBtn').addEventListener('click', sendMessage);
}

/* ===== Keyboard Shortcuts ===== */
function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('userInput').focus();
    }
    if (e.key === 'Escape') closeUploadModal();
  });
}

/* ===== Prompt Chips ===== */
function initPromptChips() {
  document.querySelectorAll('.prompt-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.getElementById('userInput').value = chip.dataset.prompt;
      autoResizeInput();
      sendMessage();
    });
  });
}

/* ===== Clear Chat ===== */
function playFeedback() {
  popSound.currentTime = 0;
  popSound.play().catch(() => {});
  if (navigator.vibrate) navigator.vibrate(50);
}

function clearChatHistory() {
  const overlay = document.createElement('div');
  overlay.className = 'clear-confirmation';
  overlay.innerHTML = `
    <div class="clear-dialog">
      <p>Clear all chat history?</p>
      <div class="clear-dialog-btns">
        <button class="confirm-clear">Yes, clear</button>
        <button class="cancel-clear">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('.confirm-clear').addEventListener('click', () => {
    document.getElementById('chatMessages').innerHTML = '';
    localStorage.removeItem(CHAT_MEMORY_KEY);
    updateWelcomeVisibility();
    overlay.remove();
    playFeedback();
  });
  overlay.querySelector('.cancel-clear').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

/* ===== Init ===== */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initInput();
  initUpload();
  initMobileTabs();
  initShortcuts();
  initPromptChips();
  lucide.createIcons();

  document.getElementById('docSelect')?.addEventListener('change', (e) => {
    setActiveDocument(e.target.value);
    currentSources = [];
    usedChunkIds.clear();
    updateSourceDisplay();
  });

  loadDocuments();
  loadChatFromMemory();
  updateWelcomeVisibility();
  scrollToBottom();

  document.getElementById('showOnlyUsed').addEventListener('change', updateSourceDisplay);
  document.getElementById('clearSources').addEventListener('click', () => {
    currentSources = [];
    usedChunkIds.clear();
    updateSourceDisplay();
  });

  const clearBtn = document.createElement('button');
  clearBtn.className = 'clear-chat';
  clearBtn.title = 'Clear chat';
  clearBtn.innerHTML = '<i data-lucide="trash-2"></i>';
  clearBtn.addEventListener('click', clearChatHistory);
  document.body.appendChild(clearBtn);
  lucide.createIcons({ nodes: [clearBtn] });
});
