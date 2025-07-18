// lib/services/transcriptionService.ts


type SpeechRecognition = typeof window.SpeechRecognition extends undefined
  ? typeof window.webkitSpeechRecognition
  : typeof window.SpeechRecognition;

export class TranscriptionService {
  private recognition: SpeechRecognition | null = null;
  private isActive = false;
  private callbacks: {
    onTranscript?: (transcript: string, isInterim: boolean) => void;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (error: string) => void;
  } = {};

  constructor() {
    this.initializeRecognition();
  }

  private initializeRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';
      
      this.recognition.onresult = this.handleResult.bind(this);
      this.recognition.onstart = this.handleStart.bind(this);
      this.recognition.onend = this.handleEnd.bind(this);
      this.recognition.onerror = this.handleError.bind(this);
    }
  }

  private handleResult(event) {
    let finalTranscript = '';
    let interimTranscript = '';
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }
    
    if (finalTranscript && this.callbacks.onTranscript) {
      this.callbacks.onTranscript(finalTranscript, false);
    }
    
    if (interimTranscript && this.callbacks.onTranscript) {
      this.callbacks.onTranscript(interimTranscript, true);
    }
  }

  private handleStart() {
    this.isActive = true;
    this.callbacks.onStart?.();
  }

  private handleEnd() {
    this.isActive = false;
    this.callbacks.onEnd?.();
  }

  private handleError(event) {
    this.isActive = false;
    if (event.error !== 'aborted' && event.error !== 'no-speech') {
      this.callbacks.onError?.(`Speech recognition error: ${event.error}`);
    }
  }

  setCallbacks(callbacks: typeof this.callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  start(): boolean {
    if (!this.recognition || this.isActive) {
      return false;
    }

    try {
      this.recognition.start();
      return true;
    } catch (error) {
      // console.log('Failed to start speech recognition:', error);
      return false;
    }
  }

  stop() {
    if (this.recognition && this.isActive) {
      try {
        this.recognition.stop();
      } catch (error) {
        console.error('Error stopping speech recognition:', error);
      }
    }
  }

  isListening(): boolean {
    return this.isActive;
  }
}