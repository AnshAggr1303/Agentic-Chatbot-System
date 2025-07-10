// lib/services/audioRecordingService.ts
export class AudioRecordingService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;
  private isRecording = false;
  private audioChunks: BlobPart[] = [];
  private callbacks: {
    onRecordingStart?: () => void;
    onRecordingStop?: (audioBlob: Blob) => void;
    onError?: (error: string) => void;
  } = {};

  setCallbacks(callbacks: typeof this.callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  async startRecording(): Promise<boolean> {
    if (this.isRecording) {
      return false;
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
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data);
      };

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
        this.callbacks.onRecordingStop?.(audioBlob);
        this.cleanup();
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      this.callbacks.onRecordingStart?.();
      
      return true;
    } catch (error) {
      console.error('Error starting recording:', error);
      this.callbacks.onError?.('Could not start recording.');
      return false;
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
    }
  }

  private cleanup() {
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  destroy() {
    this.stopRecording();
    this.cleanup();
  }
}