// lib/services/vadIntegrationService.ts
import VoiceActivityDetector from './vadService';

export class VADIntegrationService {
  private vad: VoiceActivityDetector | null = null;
  private audioStream: MediaStream | null = null;
  private isMonitoring = false;
  private callbacks: {
    onVADResult?: (result: VADResult) => void;
    onError?: (error: string) => void;
  } = {};

  constructor() {}

  setCallbacks(callbacks: typeof this.callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  async startMonitoring(): Promise<boolean> {
    if (this.isMonitoring) {
      return true;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      this.audioStream = stream;
      this.vad = new VoiceActivityDetector({
        energyThreshold: 0.012,
        spectralCentroidThreshold: 1200,
        zcr_threshold: 0.5,
        minSpeechDuration: 100,
        maxSilenceDuration: 300,
        sentenceEndSilence: 2000
      });

      await this.vad.initialize(stream);
      this.vad.startDetection(this.handleVADResult.bind(this));
      this.isMonitoring = true;

      return true;
    } catch (error) {
      console.error('Error starting VAD monitoring:', error);
      this.callbacks.onError?.('Could not access microphone for voice monitoring.');
      return false;
    }
  }

  private handleVADResult(result: VADResult) {
    this.callbacks.onVADResult?.(result);
  }

  stopMonitoring() {
    if (this.vad) {
      this.vad.destroy();
      this.vad = null;
    }

    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }

    this.isMonitoring = false;
  }

  isCurrentlyMonitoring(): boolean {
    return this.isMonitoring;
  }

  destroy() {
    this.stopMonitoring();
  }
}