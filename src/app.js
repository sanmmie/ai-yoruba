/**
 * src/app.js
 * YorùbáGPT Production Chat Core v2
 *
 * Security:
 *  - Firebase ID token on every AI request (server verifies)
 *  - Structured messages array — no string interpolation
 *  - All DOM writes via textContent/createElement (never innerHTML with user data)
 *  - Modal replaces all prompt()/confirm()
 *  - Exponential backoff retry on 429/5xx
 *
 * Performance:
 *  - 1 Firestore write per message exchange (was 3-5)
 *  - Debounced draft save (800 ms)
 *  - onSnapshot real-time sidebar (no polling)
 */

import { auth }  from './firebase-config.js';
import {
  subscribeToSessions, teardownSubscription,
  loadSessions, getCache,
  createSession, getSessionData, saveSessionData,
  saveDraft, renameSession, deleteSession,
} from './modules/sessions.js';
import { Modal }                              from './modules/modal.js';
import { subscribeToSubscription, startCheckout } from './modules/paymentService.js';
import { logger }                             from './utils/logger.js';

// ── Constants ─────────────────────────────────────────────────
const API_ENDPOINT     = import.meta.env.VITE_AI_ENDPOINT ?? '/api/yoruba-ai';
const MAX_MSG_LEN      = 2000;
const DEBOUNCE_MS      = 800;
const MAX_RETRIES      = 2;
const FREE_DAILY_LIMIT = 10;

const MSG = {
  GENERIC_ERR: 'Àṣìṣe kan ṣẹlẹ̀. Jọ̀wọ́ gbìyànjú lẹ́ẹ̀kan sí i.',
  TIMEOUT:     'Ìsopọ̀ nẹ́tíwọ́ọ̀kì rọra jù. Jọ̀wọ́ gbìyànjú lẹ́ẹ̀kan sí i.',
  RATE_LIMIT:  'Ìwọ̀n ìbéèrè jù. Jọ̀wọ́ dúró díẹ̀ kí o gbìyànjú lẹ́ẹ̀kan sí i.',
  PROCESSING:  'YorùbáGPT ń dáhùn…',
  READY:       'Ìmúra',
  WAIT:        'Jọ̀wọ́ dúró fún ìdáhùn tó ń bọ̀…',
  UPGRADE:     'O ti dé ìwọ̀n ìbéèrè ọfẹ̀ rẹ fún ọjọ́ yìí. Gba Premium láti tẹsiwaju.',
  WELCOME:     'Ẹ kú àbọ̀! Mo jẹ́ YorùbáGPT — olùrànlọ́wọ́ AI kan fún èdè Yorùbá, àṣà, àti ìtàn. Ẹ̀rọ yìí jẹ́ ìfọwọ́sowọ́pọ̀ ìwádìí àárín DeltaOS Core àti Department of Yorùbá Studies, Adekunle Ajasin University. Báwo ni mo ṣe lè ràn ọ́ lọ́wọ́ lónìí?',
};

class AppError extends Error {
  constructor(msg, code) { super(msg); this.name = 'AppError'; this.code = code; }
}

// ── Lazy DOM refs ─────────────────────────────────────────────
const dom = {};
function D() {
  if (dom._) return dom;
  const $ = id => document.getElementById(id);
  Object.assign(dom, {
    chatMessages:        $('chat-messages'),
    userInput:           $('user-input'),
    sendButton:          $('send-button'),
    chatForm:            $('chat-form'),
    statusText:          $('status-text'),
    statusDot:           document.querySelector('.status-dot'),
    clearButton:         $('clear-button'),
    charCount:           $('char-count'),
    sessionTitle:        $('current-session-title'),
    sessionList:         $('session-list'),
    newSessionBtn:       $('new-session-btn'),
    sidebarToggle:       $('sidebar-toggle'),
    sidebarOverlay:      $('sidebar-overlay'),
    sidebar:             $('sessions-sidebar'),
    suggestionsToggle:   $('suggestions-toggle'),
    suggestionList:      $('suggestion-list'),
    upgradeBtn:          $('upgrade-btn'),
    sidebarUpgradeCTA:   $('sidebar-upgrade-cta'),
  });
  dom._ = true; return dom;
}

// ── State ─────────────────────────────────────────────────────
let currentUser = null, activeSessionId = null, conversationHistory = [];
let isProcessing = false, isSidebarOpen = false, debounceTimer = null;
let unsubPlan = null, currentPlan = 'free', dailyCount = 0;

// ── Daily counter (UX hint — server enforces the real limit) ──
const todayKey  = () => `ygpt_daily_${new Date().toISOString().slice(0,10)}`;
const loadDaily = () => { try { dailyCount = parseInt(localStorage.getItem(todayKey()) ?? '0', 10); } catch { dailyCount = 0; } };
const bumpDaily = () => { dailyCount++; try { localStorage.setItem(todayKey(), String(dailyCount)); } catch {} };

// ── Status bar ────────────────────────────────────────────────
function setStatus(text, type = 'info') {
  const d = D();
  if (d.statusText) d.statusText.textContent = text;
  if (d.statusDot) {
    d.statusDot.style.backgroundColor  = { error:'#ef476f', processing:'#ffd166', info:'#95d5b2' }[type] ?? '#95d5b2';
    d.statusDot.style.animationDuration = type === 'processing' ? '0.5s' : '2s';
  }
}

// ── DOM-safe message render ───────────────────────────────────
function addMessage(content, isUser, timestamp = null) {
  const d = D();
  const wrap = document.createElement('div');
  wrap.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
  wrap.setAttribute('role', 'article');
  wrap.setAttribute('aria-label', isUser ? 'Ìbéèrè rẹ' : 'Ìdáhùn YorùbáGPT');

  const bubble = document.createElement('div');
  bubble.className   = 'message-content';
  bubble.textContent = content; // ← textContent, never innerHTML

  const time = document.createElement('div');
  time.className   = 'message-time';
  time.textContent = timestamp ?? fmtTime();

  wrap.appendChild(bubble); wrap.appendChild(time);
  d.chatMessages.appendChild(wrap);
  d.chatMessages.scrollTop = d.chatMessages.scrollHeight;
}

function addTypingIndicator() {
  const d = D();
  const el = document.createElement('div');
  el.className = 'typing-indicator'; el.id = 'typing-indicator';
  el.setAttribute('role','status'); el.setAttribute('aria-label','YorùbáGPT ń kọ̀wé…');
  for (let i = 0; i < 3; i++) { const s = document.createElement('span'); s.setAttribute('aria-hidden','true'); el.appendChild(s); }
  d.chatMessages.appendChild(el);
  d.chatMessages.scrollTop = d.chatMessages.scrollHeight;
}
function removeTypingIndicator() { document.getElementById('typing-indicator')?.remove(); }
const fmtTime = () => new Date().toLocaleTimeString('yo-NG', { hour:'2-digit', minute:'2-digit', hour12:true });

// ── Session list render ───────────────────────────────────────
function renderSessionList() {
  const { sessionList } = D();
  if (!sessionList) return;
  const sessions = getCache();
  while (sessionList.firstChild) sessionList.removeChild(sessionList.firstChild);

  if (!sessions.length) {
    const empty = document.createElement('div'); empty.className = 'session-empty'; empty.setAttribute('role','status');
    const l1 = document.createElement('span'); l1.textContent = 'Kò sí ìbánisọ̀rọ̀ tẹ́lẹ̀.';
    const l2 = document.createElement('span'); l2.className = 'session-empty-hint'; l2.textContent = 'Bẹ̀rẹ̀ ìbánisọ̀rọ̀ tuntun';
    empty.appendChild(l1); empty.appendChild(document.createElement('br')); empty.appendChild(l2);
    sessionList.appendChild(empty); return;
  }

  for (const s of sessions) {
    const item = document.createElement('div');
    item.className = `session-item${s.id === activeSessionId ? ' active' : ''}`;
    item.setAttribute('role','listitem'); item.dataset.sessionId = s.id;

    const ttl = document.createElement('span'); ttl.className = 'session-item-title'; ttl.title = s.title; ttl.textContent = s.title;
    const acts = document.createElement('div'); acts.className = 'session-item-actions';

    const rBtn = mkBtn('✏️','rename','Ṣàtúnṣe orúkọ');
    const dBtn = mkBtn('🗑️','delete','Pa ìbánisọ̀rọ̀', true);

    acts.appendChild(rBtn); acts.appendChild(dBtn);
    item.appendChild(ttl); item.appendChild(acts);
    sessionList.appendChild(item);

    item.addEventListener('click', e => { if (!e.target.closest('.session-item-actions')) switchSession(s.id); });
    rBtn.addEventListener('click', e => { e.stopPropagation(); handleRename(s.id, s.title); });
    dBtn.addEventListener('click', e => { e.stopPropagation(); handleDelete(s.id); });
  }
}

function mkBtn(emoji, action, label, danger = false) {
  const b = document.createElement('button');
  b.className = `session-action-btn${danger ? ' danger' : ''}`;
  b.dataset.action = action; b.setAttribute('aria-label', label); b.setAttribute('title', label);
  b.textContent = emoji; return b;
}

// ── Session switching ─────────────────────────────────────────
async function switchSession(id) {
  if (id === activeSessionId) { closeSidebar(); return; }
  if (isProcessing) { setStatus(MSG.WAIT, 'info'); return; }
  try {
    if (activeSessionId && currentUser) { clearTimeout(debounceTimer); await saveDraft(currentUser.uid, activeSessionId, D().userInput?.value ?? ''); }
    activeSessionId = id;
    const s = getCache().find(x => x.id === id);
    if (s && D().sessionTitle) D().sessionTitle.textContent = s.title;
    const data = await getSessionData(currentUser.uid, id);
    conversationHistory = data.history ?? [];
    D().chatMessages.innerHTML = '';
    if (!conversationHistory.length) addMessage(MSG.WELCOME, false);
    else conversationHistory.forEach(m => addMessage(m.content, m.role === 'user', m.timestamp));
    D().userInput.value = data.draft ?? ''; updateCharCount(); renderSessionList();
    setStatus(`Ìbánisọ̀rọ̀: ${s?.title ?? 'Tuntun'}`, 'info'); closeSidebar();
  } catch (err) { logger.error('switchSession failed', err, { id }); setStatus('Kò lè ṣí ìbánisọ̀rọ̀ yìí.','error'); }
}

async function createNewSession() {
  if (!currentUser) return;
  try {
    const id = await createSession(currentUser.uid);
    renderSessionList(); await switchSession(id);
    D().userInput?.focus(); setStatus('Ìbánisọ̀rọ̀ tuntun bẹ̀rẹ̀','info');
  } catch (err) { logger.error('createNewSession failed', err); setStatus('Kò lè ṣẹ̀dá ìbánisọ̀rọ̀ tuntun.','error'); }
}

async function handleRename(id, current) {
  const newTitle = await Modal.prompt('Tẹ orúkọ tuntun fún ìbánisọ̀rọ̀ yìí:', current);
  if (!newTitle || newTitle === current) return;
  try {
    await renameSession(currentUser.uid, id, newTitle);
    if (id === activeSessionId && D().sessionTitle) D().sessionTitle.textContent = newTitle;
    renderSessionList(); setStatus('Orúkọ ti ṣàtúnṣe','info');
  } catch (err) { logger.error('renameSession failed', err, { id }); setStatus('Kò lè ṣàtúnṣe orúkọ.','error'); }
}

async function handleDelete(id) {
  const ok = await Modal.confirm('Ṣe ó dá ọ lójú pé o fẹ́ pa ìbánisọ̀rọ̀ yìí?', { danger: true });
  if (!ok) return;
  try {
    await deleteSession(currentUser.uid, id); renderSessionList();
    if (id === activeSessionId) { const r = getCache(); if (r.length) await switchSession(r[0].id); else await createNewSession(); }
    setStatus('Ìbánisọ̀rọ̀ ti pa','info');
  } catch (err) { logger.error('deleteSession failed', err, { id }); setStatus('Kò lè pa ìbánisọ̀rọ̀ yìí.','error'); }
}

// ── AI call ───────────────────────────────────────────────────
async function callAI(message, attempt = 0) {
  const token = await auth.currentUser.getIdToken(false);
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${token}`, 'X-Requested-With':'XMLHttpRequest' },
      body: JSON.stringify({ message, history: conversationHistory.slice(0,-1).map(({ role, content }) => ({ role, content })) }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      logger.warn(`AI ${res.status}, retry in ${delay|0}ms`, null, { attempt });
      await new Promise(r => setTimeout(r, delay)); return callAI(message, attempt + 1);
    }
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      if (res.status === 401) throw new AppError('Kò sí ìgbàláàyè. Jọ̀wọ́ wọlé lẹ́ẹ̀kan sí i.','UNAUTHORIZED');
      if (res.status === 402) throw new AppError(MSG.UPGRADE, 'PAYMENT_REQUIRED');
      if (res.status === 429) throw new AppError(b.error ?? MSG.RATE_LIMIT, 'RATE_LIMITED');
      throw new AppError(b.error ?? MSG.GENERIC_ERR, `HTTP_${res.status}`);
    }
    const data = await res.json();
    if (!data.response) throw new AppError(MSG.GENERIC_ERR, 'NO_RESPONSE');
    return data.response;
  } catch (err) { clearTimeout(timer); if (err.name === 'AbortError') throw new AppError(MSG.TIMEOUT,'TIMEOUT'); throw err; }
}

// ── Send message ──────────────────────────────────────────────
async function sendMessage() {
  if (isProcessing) { setStatus(MSG.WAIT,'info'); return; }
  if (currentPlan === 'free' && dailyCount >= FREE_DAILY_LIMIT) {
    const go = await Modal.confirm(`${MSG.UPGRADE}\n\nGba Premium báyìí?`);
    if (go) startCheckout('stripe','premium').catch(e => logger.error('Checkout failed',e));
    return;
  }
  const { userInput, sendButton } = D();
  const raw = userInput.value.trim();
  if (!raw) { setStatus('Jọ̀wọ́ kọ ìbéèrè rẹ síbí.','error'); return; }
  const message = raw.slice(0, MAX_MSG_LEN);

  userInput.value = ''; updateCharCount();
  isProcessing = true; sendButton.disabled = true;
  sendButton.setAttribute('aria-label','YorùbáGPT ń dáhùn');
  setStatus(MSG.PROCESSING,'processing');

  const ts = fmtTime();
  addMessage(message, true, ts);
  conversationHistory.push({ role:'user', content:message, timestamp:ts });
  addTypingIndicator();

  try {
    const response = await callAI(message);
    removeTypingIndicator();
    const rts = fmtTime();
    addMessage(response, false, rts);
    conversationHistory.push({ role:'assistant', content:response, timestamp:rts });
    bumpDaily();

    if (activeSessionId && currentUser) {
      const isFirst = conversationHistory.length === 2;
      const newTitle = isFirst ? message.slice(0,50) + (message.length > 50 ? '…' : '') : undefined;
      await saveSessionData(currentUser.uid, activeSessionId, conversationHistory, '', newTitle);
      if (isFirst && newTitle) { if (D().sessionTitle) D().sessionTitle.textContent = newTitle; renderSessionList(); }
    }
    setStatus(MSG.READY,'info'); logger.info('Message sent', { sessionId: activeSessionId });
  } catch (err) {
    removeTypingIndicator();
    const m = err instanceof AppError ? err.message : MSG.GENERIC_ERR;
    logger.error('sendMessage failed', err, { sessionId: activeSessionId });
    addMessage(`❌ ${m}`, false);
    if (err.code === 'PAYMENT_REQUIRED') {
      const go = await Modal.confirm(`${MSG.UPGRADE}\n\nGba Premium báyìí?`);
      if (go) startCheckout('stripe','premium').catch(e => logger.error('Checkout failed',e));
    }
    setStatus(m,'error');
  } finally {
    isProcessing = false; sendButton.disabled = false;
    sendButton.setAttribute('aria-label','Fífiranṣẹ'); userInput.focus();
  }
}

// ── Clear chat ────────────────────────────────────────────────
async function clearChat() {
  if (isProcessing) { setStatus(MSG.WAIT,'info'); return; }
  if (!conversationHistory.length) { setStatus('Kò sí ìbánisọ̀rọ̀ láti nu.','info'); return; }
  const ok = await Modal.confirm('Ṣe ó dá ọ lójú pé o fẹ́ nu gbogbo ìbánisọ̀rọ̀ yìí?', { danger:true });
  if (!ok) return;
  const { chatMessages, userInput } = D();
  chatMessages.innerHTML = ''; conversationHistory = []; userInput.value = ''; updateCharCount();
  addMessage(MSG.WELCOME, false);
  if (activeSessionId && currentUser) await saveSessionData(currentUser.uid, activeSessionId, [], '');
  setStatus('Ìbánisọ̀rọ̀ ti nu','info');
}

// ── Suggestion chips ──────────────────────────────────────────
function handleSuggestion(e) {
  const chip = e.target.closest('.suggestion-chip'), prompt = chip?.dataset.prompt;
  if (!prompt) return;
  const { userInput, suggestionList, suggestionsToggle } = D();
  userInput.value = prompt; updateCharCount(); userInput.focus();
  if (suggestionList) suggestionList.hidden = true;
  if (suggestionsToggle) suggestionsToggle.setAttribute('aria-expanded','false');
  setTimeout(() => { if (userInput.value.trim()) sendMessage(); }, 300);
}

// ── UI helpers ────────────────────────────────────────────────
function updateCharCount() {
  const { userInput, charCount } = D();
  if (!userInput || !charCount) return;
  const n = userInput.value.length;
  charCount.textContent = n; charCount.style.color = n > MAX_MSG_LEN * 0.9 ? '#ef476f' : '';
}
function resizeInput() {
  const { userInput } = D(); if (!userInput) return;
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 140) + 'px';
}
function toggleSidebar()  { isSidebarOpen = !isSidebarOpen; applySidebar(); }
function closeSidebar()   { isSidebarOpen = false;           applySidebar(); }
function applySidebar() {
  const { sidebar, sidebarOverlay, sidebarToggle } = D();
  sidebar?.classList.toggle('open', isSidebarOpen);
  sidebarOverlay?.classList.toggle('visible', isSidebarOpen);
  sidebarToggle?.setAttribute('aria-expanded', String(isSidebarOpen));
  document.body.style.overflow = isSidebarOpen ? 'hidden' : '';
}
function toggleSuggestions() {
  const { suggestionsToggle, suggestionList } = D();
  const open = suggestionsToggle?.getAttribute('aria-expanded') === 'true';
  if (suggestionList) suggestionList.hidden = open;
  if (suggestionsToggle) suggestionsToggle.setAttribute('aria-expanded', String(!open));
}
function handleKeyboard(e) {
  if ((e.metaKey||e.ctrlKey) && e.key === 'k') { e.preventDefault(); toggleSidebar(); }
  if (e.key === 'Escape' && isSidebarOpen) closeSidebar();
  if ((e.metaKey||e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); const { userInput } = D(); if (!isProcessing && userInput?.value.trim()) sendMessage(); }
}
function scheduleDraft(uid, id, draft) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => saveDraft(uid, id, draft).catch(e => logger.warn('Draft save failed', e)), DEBOUNCE_MS);
}

// ── Event wiring ──────────────────────────────────────────────
function bindEvents() {
  const d = D();
  d.chatForm?.addEventListener('submit', e => { e.preventDefault(); if (!isProcessing && d.userInput?.value.trim()) sendMessage(); });
  d.userInput?.addEventListener('input', () => { updateCharCount(); resizeInput(); if (currentUser && activeSessionId) scheduleDraft(currentUser.uid, activeSessionId, d.userInput.value); });
  d.userInput?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!isProcessing && d.userInput.value.trim()) sendMessage(); } });
  d.sendButton?.addEventListener('click', () => { if (!isProcessing && d.userInput?.value.trim()) sendMessage(); });
  d.clearButton?.addEventListener('click', clearChat);
  d.newSessionBtn?.addEventListener('click', createNewSession);
  d.sidebarToggle?.addEventListener('click', toggleSidebar);
  d.sidebarOverlay?.addEventListener('click', closeSidebar);
  d.suggestionsToggle?.addEventListener('click', toggleSuggestions);
  d.suggestionList?.addEventListener('click', handleSuggestion);
  d.upgradeBtn?.addEventListener('click', async () => {
    try { await startCheckout('stripe','premium'); }
    catch (err) { logger.error('Checkout redirect failed', err); await Modal.alert('Kò lè bẹ̀rẹ̀ ìsanwó. Jọ̀wọ́ gbìyànjú lẹ́ẹ̀kan sí i.'); }
  });
  document.addEventListener('keydown', handleKeyboard);
  window.matchMedia('(min-width:768px)').addEventListener('change', mq => { if (mq.matches && isSidebarOpen) closeSidebar(); });
  if (window.location.search.includes('payment=success')) {
    Modal.alert('🎉 Ẹ kú oríire! Premium ti ṣiṣẹ. Ẹ jẹ́ kí a tẹ̀síwájú!');
    history.replaceState({}, '', window.location.pathname);
  }
}

// ── Public API ────────────────────────────────────────────────
export async function initializeChat(user) {
  currentUser = user; loadDaily(); D(); bindEvents();

  unsubPlan = subscribeToSubscription(user.uid, ({ plan }) => {
    currentPlan = plan;
    const { upgradeBtn, sidebarUpgradeCTA } = D();
    if (upgradeBtn)       upgradeBtn.hidden       = plan === 'premium';
    if (sidebarUpgradeCTA) sidebarUpgradeCTA.hidden = plan === 'premium';
  });

  try {
    await loadSessions(user.uid);
    subscribeToSessions(user.uid, () => renderSessionList());
    const sessions   = getCache();
    const sessionId  = sessions.length ? sessions[0].id : await createSession(user.uid);
    activeSessionId  = sessionId;
    const s          = getCache().find(x => x.id === sessionId);
    if (s && D().sessionTitle) D().sessionTitle.textContent = s.title;
    const data       = await getSessionData(user.uid, sessionId);
    conversationHistory = data.history ?? [];
    D().chatMessages.innerHTML = '';
    if (!conversationHistory.length) addMessage(MSG.WELCOME, false);
    else conversationHistory.forEach(m => addMessage(m.content, m.role === 'user', m.timestamp));
    D().userInput.value = data.draft ?? ''; updateCharCount();
    renderSessionList(); setStatus(MSG.READY,'info'); D().userInput.focus();
    logger.info('Chat initialized', { uid: user.uid, sessionId });
  } catch (err) { logger.error('initializeChat failed', err); setStatus('Kò lè bẹ̀rẹ̀ ìbánisọ̀rọ̀','error'); throw err; }
}

export function teardownChat() {
  teardownSubscription(); unsubPlan?.(); unsubPlan = null;
  clearTimeout(debounceTimer);
  if (currentUser && activeSessionId && dom.userInput?.value)
    saveDraft(currentUser.uid, activeSessionId, dom.userInput.value).catch(() => {});
  currentUser = null; activeSessionId = null; conversationHistory = [];
  isProcessing = false; isSidebarOpen = false; currentPlan = 'free';
  const { chatMessages, userInput } = D();
  if (chatMessages) chatMessages.innerHTML = '';
  if (userInput)    userInput.value = '';
  updateCharCount(); setStatus('A ti jáde','info'); logger.info('Chat torn down');
}
