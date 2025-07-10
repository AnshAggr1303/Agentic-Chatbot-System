// lib/services/speechStateService.ts
export class SpeechStateService {
  private completedTranscript = '';
  private pendingTranscript = '';
  private isWaitingForSentenceEnd = false;
  private processingTimer: NodeJS.Timeout | null = null;
  private callbacks: {
    onTranscriptUpdate?: (completed: string, pending: string) => void;
    onSentenceComplete?: (transcript: string) => void;
    onStateChange?: (state: SpeechState) => void;
  } = {};

  constructor() {}

  setCallbacks(callbacks: typeof this.callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  addCompletedTranscript(transcript: string) {
    this.completedTranscript += transcript;
    this.callbacks.onTranscriptUpdate?.(this.completedTranscript, this.pendingTranscript);
  }

  setPendingTranscript(transcript: string) {
    this.pendingTranscript = transcript;
    this.callbacks.onTranscriptUpdate?.(this.completedTranscript, this.pendingTranscript);
  }

  getCompleteTranscript(): string {
    return (this.completedTranscript + this.pendingTranscript).trim();
  }

  isProcessing(): boolean {
    return this.isWaitingForSentenceEnd;
  }

  startProcessingTimer(delay: number = 1500) {
    this.clearProcessingTimer();
    
    this.processingTimer = setTimeout(() => {
      this.processSentence();
    }, delay);
  }

  clearProcessingTimer() {
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }
  }

  processSentence() {
    if (this.isWaitingForSentenceEnd) {
      return;
    }

    const completeTranscript = this.getCompleteTranscript();
    if (completeTranscript) {
      this.isWaitingForSentenceEnd = true;
      this.callbacks.onSentenceComplete?.(completeTranscript);
    }
  }

  reset() {
    this.clearProcessingTimer();
    this.completedTranscript = '';
    this.pendingTranscript = '';
    this.isWaitingForSentenceEnd = false;
    this.callbacks.onTranscriptUpdate?.('', '');
  }

  finishProcessing() {
    this.reset();
  }
}