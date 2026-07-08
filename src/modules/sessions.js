/**
 * src/modules/sessions.js
 * Firestore-backed session management.
 *
 * Before → After:
 *   Firestore writes/message: 3-5 → 1 (single updateDoc per exchange)
 *   Reads/session-switch: ~4 poll → ~1 cache hit after initial snapshot
 *   Cross-tab sync: none → onSnapshot real-time subscription
 *   History size: unbounded → capped at 100 messages
 */

import { db } from '../firebase-config.js';
import {
  collection, doc, getDoc, getDocs,
  setDoc, updateDoc, deleteDoc,
  query, orderBy, limit,
  serverTimestamp, onSnapshot,
} from 'firebase/firestore';

export const MAX_SESSIONS         = 50;
export const MAX_HISTORY_MESSAGES = 100;

let _cache      = [];
let _unsub      = null;

const col = uid      => collection(db, 'users', uid, 'sessions');
const ref = (uid,id) => doc(db, 'users', uid, 'sessions', id);

export const getCache = () => _cache;

export function subscribeToSessions(uid, onUpdate) {
  teardownSubscription();
  const q = query(col(uid), orderBy('updatedAt', 'desc'), limit(MAX_SESSIONS));
  _unsub = onSnapshot(q,
    snap => { _cache = snap.docs.map(toMeta); onUpdate(_cache); },
    err  => { console.error('[Sessions] snapshot:', err.code); loadSessions(uid).then(onUpdate).catch(console.error); }
  );
  return teardownSubscription;
}

export function teardownSubscription() {
  _unsub?.(); _unsub = null; _cache = [];
}

export async function loadSessions(uid) {
  const q = query(col(uid), orderBy('updatedAt', 'desc'), limit(MAX_SESSIONS));
  _cache  = (await getDocs(q)).docs.map(toMeta);
  return _cache;
}

export async function createSession(uid, title = 'Ìbánisọ̀rọ̀ Tuntun') {
  const id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  await setDoc(ref(uid, id), { title, history: [], draft: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  _cache.unshift({ id, title, createdAt: new Date(), updatedAt: new Date() });
  return id;
}

export async function getSessionData(uid, id) {
  const snap = await getDoc(ref(uid, id));
  return snap.exists() ? snap.data() : { title: 'Ìbánisọ̀rọ̀ Tuntun', history: [], draft: '' };
}

export async function saveSessionData(uid, id, history, draft = '', title) {
  const payload = { history: history.slice(-MAX_HISTORY_MESSAGES), draft, updatedAt: serverTimestamp() };
  if (title !== undefined) payload.title = title;
  await updateDoc(ref(uid, id), payload);
  if (title !== undefined) { const c = _cache.find(s => s.id === id); if (c) c.title = title; }
}

export async function saveDraft(uid, id, draft) {
  await updateDoc(ref(uid, id), { draft, updatedAt: serverTimestamp() });
}

export async function renameSession(uid, id, newTitle) {
  await updateDoc(ref(uid, id), { title: newTitle, updatedAt: serverTimestamp() });
  const c = _cache.find(s => s.id === id); if (c) c.title = newTitle;
}

export async function deleteSession(uid, id) {
  await deleteDoc(ref(uid, id));
  _cache = _cache.filter(s => s.id !== id);
}

function toMeta(d) {
  return {
    id:        d.id,
    title:     d.data().title || 'Ìbánisọ̀rọ̀ Tuntun',
    updatedAt: d.data().updatedAt?.toDate?.() ?? new Date(),
    createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
  };
}
