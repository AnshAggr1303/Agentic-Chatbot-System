// lib/services/orchestrationService.ts
import { TranscriptionService } from './transcriptionService';
import { AudioRecordingService } from './audioRecordingService';
import { SpeechStateService } from './speechStateService';
import { VADIntegrationService } from './vadIntegrationService';
import { VADResult } from '../../types/audio';

export class SpeechOrchestrationService {
  private transcriptionService: TranscriptionService;
  private recordingService: AudioRecordingService;
  private stateService: SpeechStateService;
  private vadService: VADIntegrationService;
  private isActive = false;
  private callbacks: {
    onTranscriptChange?: (transcript: string, isInterim: boolean) => void;
    onRecordingStateChange?: (isRecording: boolean) => void;
    onVADStateChange?: (isActive: boolean, confidence: number) => void;
    onSentenceComplete?: (transcript: string, audioBlob?: Blob) => void;
    onError?: (error: string) => void;
  } = {};

  constructor() {
    this.transcriptionService = new TranscriptionService();
    this.recordingService = new AudioRecordingService();
    this.stateService = new SpeechStateService();
    this.vadService = new VADIntegrationService();
    
    this.setupServiceCallbacks();
  }

  private setupServiceCallbacks() {
    // Transcription callbacks
    this.transcriptionService.setCallbacks({
      onTranscript: (transcript, isInterim) => {
        if (isInterim) {
          this.stateService.setPendingTranscript(transcript);
        } else {
          this.stateService.addCompletedTranscript(transcript);
        }
        this.callbacks.onTranscriptChange?.(transcript, isInterim);
      },
      onEnd: () => {
        this.stateService.processSentence();
      },
      onError: (error) => {
        this.callbacks.onError?.(error);
      }
    });

    // Recording callbacks
    this.recordingService.setCallbacks({
      onRecordingStart: () => {
        this.callbacks.onRecordingStateChange?.(true);
      },
      onRecordingStop: (audioBlob) => {
        this.callbacks.onRecordingStateChange?.(false);
        const transcript = this.stateService.getCompleteTranscript();
        if (transcript) {
          this.callbacks.onSentenceComplete?.(transcript, audioBlob);
        }
      },
      onError: (error) => {
        this.callbacks.onError?.(error);
      }
    });

    // State service callbacks
    this.stateService.setCallbacks({
      onSentenceComplete: (transcript) => {
        this.recordingService.stopRecording();
        this.transcriptionService.stop();
        
        setTimeout(() => {
          this.stateService.finishProcessing();
        }, 1000);
      }
    });

    // VAD callbacks
    this.vadService.setCallbacks({
      onVADResult: (result) => {
        this.callbacks.onVADStateChange?.(result.isSpeech, result.confidence);
        this.handleVADResult(result);
      },
      onError: (error) => {
        this.callbacks.onError?.(error);
      }
    });
  }

  private handleVADResult(result: VADResult) {
    if (result.isSpeech && result.confidence > 0.5) {
      if (!this.recordingService.isCurrentlyRecording() && !this.stateService.isProcessing()) {
        this.stateService.clearProcessingTimer();
        this.recordingService.startRecording();
        this.transcriptionService.start();
      }
    } else if (!result.isSpeech && this.recordingService.isCurrentlyRecording() && !this.stateService.isProcessing()) {
      this.stateService.startProcessingTimer();
    }

    if (result.sentenceComplete && this.recordingService.isCurrentlyRecording() && !this.stateService.isProcessing()) {
      this.stateService.clearProcessingTimer();
      this.stateService.processSentence();
    }
  }

  setCallbacks(callbacks: typeof this.callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  async start(): Promise<boolean> {
    if (this.isActive) {
      return true;
    }

    const vadStarted = await this.vadService.startMonitoring();
    if (vadStarted) {
      this.isActive = true;
      return true;
    }

    return false;
  }

  stop() {
    if (!this.isActive) {
      return;
    }

    this.recordingService.stopRecording();
    this.transcriptionService.stop();
    this.vadService.stopMonitoring();
    this.stateService.reset();
    this.isActive = false;
  }

  isRunning(): boolean {
    return this.isActive;
  }

  destroy() {
    this.stop();
    this.recordingService.destroy();
    this.vadService.destroy();
  }
}