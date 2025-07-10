export interface VADResult {
  isSpeech: boolean;
  confidence: number;
  energy: number;
  sentenceComplete: boolean;
}

export interface SpeechState {
  isRecording: boolean;
  isListening: boolean;
  isProcessing: boolean;
  vadActive: boolean;
  vadConfidence: number;
  microphoneActive: boolean;
  isMonitoring: boolean;
}