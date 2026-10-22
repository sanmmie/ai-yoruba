import { auth } from '../firebase-config.js';

const API_ENDPOINT = import.meta.env.VITE_AI_STREAM_ENDPOINT || 'https://us-central1-ai-yoruba.cloudfunctions.net/yorubaAIv2/chat/stream';

export async function streamChat({ sessionId, message }, { onDelta, onDone, onError }) {
  const token = await auth.currentUser.getIdToken(false);
  const ctrl = new AbortController();
  const res = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ sessionId, message }),
    signal: ctrl.signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'request_failed');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      if (!part.trim()) continue;
      const lines = part.split('\n');
      let event = 'message';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        if (line.startsWith('data: ')) data = line.slice(6);
      }
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        if (event === 'delta' && onDelta) onDelta(parsed.text || '');
        if (event === 'done' && onDone) onDone(parsed);
        if (event === 'error' && onError) onError(parsed);
      } catch (e) {}
    }
  }
  return ctrl;
}
