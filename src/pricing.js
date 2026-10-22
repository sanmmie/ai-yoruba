/**
 * src/pricing.js — Pricing page controller
 * Guards page (unauthenticated → redirect to login).
 * Wires Stripe (USD) and Flutterwave (NGN) checkout buttons.
 */

import { onAuthStateChanged } from 'firebase/auth';
import { auth }               from './firebase-config.js';
import { startCheckout }      from './modules/paymentService.js';
import { logger }             from './utils/logger.js';

const $ = id => document.getElementById(id);

onAuthStateChanged(auth, user => {
  if (!user) { sessionStorage.setItem('ygpt_post_login', '/pricing.html'); window.location.href = '/index.html'; }
});

function showErr(msg) { const e = $('pricing-error'); if (!e) return; e.textContent = msg; e.classList.add('visible'); }
function clearErr()   { const e = $('pricing-error'); if (!e) return; e.textContent = ''; e.classList.remove('visible'); }
function setLoading(btn, on) {
  if (!btn) return; btn.disabled = on;
  if (on) { btn.dataset.orig = btn.textContent; btn.textContent = 'Ń múrasílẹ̀…'; }
  else if (btn.dataset.orig) { btn.textContent = btn.dataset.orig; delete btn.dataset.orig; }
}

$('checkout-stripe-btn')?.addEventListener('click', async () => {
  clearErr(); setLoading($('checkout-stripe-btn'), true);
  try { await startCheckout('stripe', 'premium'); }
  catch (err) { logger.error('Stripe checkout failed', err); showErr('Kò lè bẹ̀rẹ̀ ìsanwó Stripe. Jọ̀wọ́ gbìyànjú lẹ́ẹ̀kan sí i.'); setLoading($('checkout-stripe-btn'), false); }
});

$('checkout-flw-btn')?.addEventListener('click', async () => {
  clearErr(); setLoading($('checkout-flw-btn'), true);
  try { await startCheckout('flutterwave', 'premium'); }
  catch (err) { logger.error('Flutterwave checkout failed', err); showErr('Kò lè bẹ̀rẹ̀ ìsanwó Flutterwave. Jọ̀wọ́ gbìyànjú lẹ́ẹ̀kan sí i.'); setLoading($('checkout-flw-btn'), false); }
});
