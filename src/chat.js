// src/chat.js
import { auth, functions, httpsCallable } from './firebase.js';
import { onAuthStateChanged } from 'firebase/auth';

// DOM elements
const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const chatForm = document.getElementById('chat-form');
const statusText = document.getElementById('status-text');
const statusDot = document.querySelector('.status-dot');

// State
let currentUser = null;
let chatHistory = [];

// Wait for user to be signed in
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    console.log('User is signed in:', user.uid);
    setStatus('ready', 'Ìmúra');
    // Load previous sessions if needed
  } else {
    currentUser = null;
    console.log('User is not signed in');
    setStatus('offline', 'Kò sí ìgbàláàyè');
  }
});

// Set status indicator
function setStatus(state, text) {
  statusDot.className = 'status-dot ' + state;
  statusText.textContent = text;
}

// Function to send a message to YorùbáGPT
async function sendMessage(userInputText, history = []) {
  try {
    // Check if user is signed in
    if (!currentUser) {
      throw new Error('User is not authenticated');
    }

    // Update status
    setStatus('thinking', 'Ń ronú…');

    // Create a callable reference to the Cloud Function
    const yorubaAI = httpsCallable(functions, 'yorubaAI');

    // Call the function with your message and history
    const result = await yorubaAI({
      message: userInputText,
      history: history
    });

    // The response is in result.data
    const reply = result.data.response;
    console.log('AI Response:', reply);
    
    // Update status
    setStatus('ready', 'Ìmúra');
    
    return reply;
    
  } catch (error) {
    console.error('Error calling YorùbáGPT:', error);
    setStatus('error', 'Àṣìṣe');
    
    // Handle specific error codes
    if (error.code === 'unauthenticated') {
      console.error('User is not authenticated. Please sign in.');
    } else if (error.code === 'resource-exhausted') {
      console.error('Rate limit exceeded or daily quota reached.');
    } else if (error.code === 'internal') {
      console.error('Internal server error. Please try again later.');
    }
    
    throw error;
  }
}

// Add message to chat UI
function addMessage(text, sender) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${sender}`;
  
  const content = document.createElement('div');
  content.className = 'message-content';
  content.textContent = text;
  
  messageDiv.appendChild(content);
  chatMessages.appendChild(messageDiv);
  
  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Handle form submission
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const text = userInput.value.trim();
  if (!text || !currentUser) return;
  
  // Clear input
  userInput.value = '';
  userInput.style.height = 'auto';
  
  // Add user message
  addMessage(text, 'user');
  
  // Add to history
  chatHistory.push({ role: 'user', content: text });
  
  // Get AI response
  try {
    const reply = await sendMessage(text, chatHistory);
    addMessage(reply, 'assistant');
    chatHistory.push({ role: 'assistant', content: reply });
  } catch (error) {
    addMessage('Àṣìṣe kan ṣẹlẹ̀. Jọ̀wọ́ gbìyànjú lẹ́ẹ̀kan sí i.', 'error');
  }
});

// Auto-resize textarea
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = userInput.scrollHeight + 'px';
});

// Send on Enter (Shift+Enter for new line)
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit'));
  }
});

// Export for use in other files
export { sendMessage, addMessage, chatHistory, currentUser };