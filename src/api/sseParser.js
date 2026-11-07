'use strict';

/**
 * src/api/sseParser.js
 * Pure SSE frame parser (no Firebase/browser auth dependencies) for testability.
 */

function normalizeLine(line) {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

export function createSSEParser({ onEvent }) {
  let buffer = '';
  let event = 'message';
  let dataLines = [];

  const dispatch = () => {
    if (!dataLines.length) { event = 'message'; return; }
    const data = dataLines.join('\n');
    const name = event || 'message';
    event = 'message';
    dataLines = [];
    onEvent({ event: name, data });
  };

  const feedLine = (rawLine) => {
    const line = normalizeLine(rawLine);
    if (line === '') { dispatch(); return; }
    if (line.startsWith(':')) return; // comment / heartbeat
    if (line.startsWith('event:')) { event = line.slice(6).trimStart() || 'message'; return; }
    if (line.startsWith('data:')) { dataLines.push(line.slice(5).replace(/^ /, '')); return; }
    // Ignore unknown SSE fields (id, retry).
  };

  return {
    feed(chunk) {
      buffer += String(chunk).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        feedLine(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 1);
      }
    },
    flush() {
      if (buffer.length) { feedLine(buffer); buffer = ''; }
      if (dataLines.length) dispatch();
    },
  };
}

export function parseSSE(text) {
  const events = [];
  const p = createSSEParser({ onEvent: (e) => events.push(e) });
  p.feed(text);
  p.flush();
  return events;
}
