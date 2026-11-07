import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSSE } from '../sseParser.js';

test('Yoruba diacritics survive SSE JSON parse/serialize boundaries', () => {
  const samples = [
    'Ẹ kú àbọ̀! Mo jẹ́ YorùbáGPT.',
    'Àṣìṣe kan ṣẹlẹ̀. Jọ̀wọ́ gbìyànjú lẹ́ẹ̀kan sí i.',
    'Ṣàtúnṣe ọ̀rọ̀: Ẹ, Ọ, Ṣ, ẹ, ọ, ṣ, ÀÁ ÈÉ ÌÍ ÒÓ ÙÚ',
    "Owe: 'Ẹni tó bá sun oorun tí kò jẹun, àìsun ni í sùn'.",
  ];
  for (const text of samples) {
    const frame = `event: delta\ndata: ${JSON.stringify({ text })}\n\nevent: done\ndata: ${JSON.stringify({ ok: true })}\n\n`;
    const events = parseSSE(frame);
    assert.equal(JSON.parse(events[0].data).text, text);
  }
});

test('empty and interrupted-stream indicators are representable', () => {
  const events = parseSSE('event: delta\ndata: {"text":""}\n\n');
  assert.equal(JSON.parse(events[0].data).text, '');
});
