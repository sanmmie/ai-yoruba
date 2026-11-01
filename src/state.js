'use strict';

/**
 * src/state.js
 *
 * Single source of truth for client-side chat state.
 *
 *  - One in-flight stream per session guarded by state (R10).
 *  - Each stream carries a streamId and an AbortController; late chunks
 *    from an aborted or superseded stream are ignored.
 *  - onSnapshot is the source of truth for history and remaining quota;
 *    listeners are unsubscribed on sign-out.
 */
const state = {
  user: null,
  currentSessionId: null,
  sessions: new Map(),
  history: [],
  streaming: false,
  activeStreamId: null,
  abortController: null,
  remaining: null,
  limit: null,
  listeners: new Set(),
  draft: '',
};

export function getState() { return state; }

export function setUser(user) {
  state.user = user;
  notify();
}

export function setCurrentSessionId(sid) {
  state.currentSessionId = sid;
  notify();
}

export function setStreaming(on, streamId) {
  state.streaming = on;
  state.activeStreamId = on ? streamId : null;
  if (!on) state.abortController = null;
  notify();
}

export function isStreamingFor(streamId) {
  return state.streaming && state.activeStreamId === streamId;
}

export function getAbortController() { return state.abortController; }
export function setAbortController(ctrl) { state.abortController = ctrl; }

export function setRemaining(remaining, limit) {
  state.remaining = remaining;
  state.limit = limit;
  notify();
}

export function setSessions(sessions) {
  state.sessions = new Map(sessions.map(s => [s.id, s]));
  notify();
}

export function upsertSession(s) {
  state.sessions.set(s.id, s);
  notify();
}

export function removeSession(sid) {
  state.sessions.delete(sid);
  if (state.currentSessionId === sid) state.currentSessionId = null;
  notify();
}

export function setDraft(text) {
  state.draft = text;
}

export function subscribe(fn) {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

function notify() {
  for (const fn of state.listeners) {
    try { fn(state); } catch (e) { console.error('[state] listener error', e); }
  }
}