// src/chat.js
import { auth, functions, httpsCallable } from './firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { logger } from './utils/logger.js';

let currentUser = null;
const chatHistory = [];

// Wait for user to be signed in
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    logger.info('User is signed in:', { uid: user.uid });
  } else {
    logger.info('User is not signed in');
  }
});

// Function to send a message to YorùbáGPT
async function sendMessage(userInput, history = []) {
  try {
    if (!currentUser) {
      throw new Error('User is not authenticated');
    }

    const yorubaAI = httpsCallable(functions, 'yorubaAI');
    const result = await yorubaAI({
      message: userInput,
      history: history
    });

    logger.info('AI Response generated', { response: result.data.response });
    return result.data.response;
    
  } catch (error) {
    logger.error('Error calling YorùbáGPT:', error);
    
    if (error.code === 'unauthenticated') {
      logger.error('User is not authenticated. Please sign in.');
    } else if (error.code === 'resource-exhausted') {
      logger.error('Rate limit exceeded or daily quota reached.');
    } else if (error.code === 'internal') {
      logger.error('Internal server error. Please try again later.');
    }
    
    throw error;
  }
}

// Handle chat form submission
document.getElementById('chat-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const input = document.getElementById('user-input');
  const text = input?.value?.trim();
  if (!text || !currentUser) return;
  
  input.value = '';
  input.style.height = 'auto';
  
  addMessageToUI(text, 'user');
  chatHistory.push({ role: 'user', content: text });
  
  try {
    const reply = await sendMessage(text, chatHistory);
    addMessageToUI(reply, 'assistant');
    chatHistory.push({ role: 'assistant', content: reply });
  } catch (error) {
    addMessageToUI('Àṣìṣe kan ṣẹlẹ̀. Jọ̀wọ́ gbìyànjú lẹ́ẹ̀kan sí i.', 'error');
  }
});

function addMessageToUI(text, sender) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  
  const div = document.createElement('div');
  div.className = `message ${sender}`;
  div.textContent = text;
  
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

document.getElementById('user-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('chat-form')?.dispatchEvent(new Event('submit'));
  }
});

document.getElementById('user-input')?.addEventListener('input', (e) => {
  e.target.style.height = 'auto';
  e.target.style.height = e.target.scrollHeight + 'px';
});

window.sendMessage = sendMessage;