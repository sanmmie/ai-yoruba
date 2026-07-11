// src/chat.js
import { auth, functions, httpsCallable } from './firebase.js';
import { onAuthStateChanged } from 'firebase/auth';

let currentUser = null;
let chatHistory = [];

// Wait for user to be signed in
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    console.log('User is signed in:', user.uid);
  } else {
    console.log('User is not signed in');
  }
});

// Function to send a message to YorùbáGPT
async function sendMessage(userInput, history = []) {
  try {
    if (!currentUser) {
      throw new Error('User is not authenticated');
    }

    // ✅ CORRECT: Use httpsCallable
    const yorubaAI = httpsCallable(functions, 'yorubaAI');
    
    // Call the Cloud Function
    const result = await yorubaAI({
      message: userInput,
      history: history
    });

    return result.data.response;
    
  } catch (error) {
    console.error('Error calling YorùbáGPT:', error);
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
  
  // Add user message to UI
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

// Helper to add messages to UI
function addMessageToUI(text, sender) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  
  const div = document.createElement('div');
  div.className = `message ${sender}`;
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// Make sendMessage available globally for debugging
window.sendMessage = sendMessage;