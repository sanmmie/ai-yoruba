// Base path pointing to your local emulator engine or production endpoints
const FUNCTIONS_BASE_URL = import.meta.env.VITE_FUNCTIONS_BASE_URL || 'https://us-central1-ai-yoruba.cloudfunctions.net';

/**
 * Transcribes audio recordings caught by the browser microphone
 * @param {Blob} audioBlob - WebM audio recording data
 */
export async function sendAudioToSTT(audioBlob) {
  const reader = new FileReader();
  
  return new Promise((resolve, reject) => {
    reader.readAsDataURL(audioBlob);
    reader.onloadend = async () => {
      // Remove data metadata prefixes from base64 encoding
      const base64Data = reader.result.split(',')[1];

      try {
        const response = await fetch(`${FUNCTIONS_BASE_URL}/transcribeYorubaAudio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioBase64: base64Data })
        });
        const data = await response.json();
        resolve(data.text);
      } catch (err) {
        reject(err);
      }
    };
  });
}

/**
 * Synthesizes Yoruba text into an audible audio element play stream
 * @param {string} textWithDiacritics - Proper tone-marked string
 */
export async function playYorubaVoice(textWithDiacritics) {
  try {
    const response = await fetch(`${FUNCTIONS_BASE_URL}/synthesizeYorubaVoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: textWithDiacritics })
    });
    
    const data = await response.json();
    if (data.audioContent) {
      const audioSource = `data:audio/mp3;base64,${data.audioContent}`;
      const audio = new Audio(audioSource);
      await audio.play();
    }
  } catch (err) {
    console.error("Could not play synthesized audio:", err);
  }
}
