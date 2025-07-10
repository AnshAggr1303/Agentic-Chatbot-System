// globals.d.ts
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

export {};