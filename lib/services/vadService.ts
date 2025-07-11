class VoiceActivityDetector {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private isActive = false;
  private config: {
    energyThreshold: number;
    spectralCentroidThreshold: number;
    zcr_threshold: number;
    minSpeechDuration: number;
    maxSilenceDuration: number;
    sentenceEndSilence: number;
  };
  private speechStartTime: number | null = null;
  private silenceStartTime: number | null = null;
  private lastSpeechTime: number | null = null;
  private callback: ((result: { isSpeech: boolean; confidence: number; energy: number; sentenceComplete: boolean }) => void) | null = null;

  constructor(config: {
    energyThreshold: number;
    spectralCentroidThreshold: number;
    zcr_threshold: number;
    minSpeechDuration: number;
    maxSilenceDuration: number;
    sentenceEndSilence: number;
  }) {
    this.config = config;
  }

  async initialize(stream: MediaStream): Promise<void> {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.3;

      this.source = this.audioContext.createMediaStreamSource(stream);
      this.scriptProcessor = this.audioContext.createScriptProcessor(2048, 1, 1);
      
      this.source.connect(this.analyser);
      this.analyser.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);

      this.scriptProcessor.onaudioprocess = (event) => {
        if (this.isActive && this.callback) {
          this.processAudio(event);
        }
      };

      console.log('✅ Enhanced VoiceActivityDetector initialized');
    } catch (error) {
      console.error('Failed to initialize VoiceActivityDetector:', error);
      throw error;
    }
  }

  private processAudio(event: AudioProcessingEvent): void {
    const inputBuffer = event.inputBuffer;
    const inputData = inputBuffer.getChannelData(0);
    
    // Calculate energy
    let energy = 0;
    for (let i = 0; i < inputData.length; i++) {
      energy += inputData[i] * inputData[i];
    }
    energy = Math.sqrt(energy / inputData.length);

    // Get frequency domain data
    const frequencyData = new Uint8Array(this.analyser!.frequencyBinCount);
    this.analyser!.getByteFrequencyData(frequencyData);

    // Calculate spectral centroid
    let weightedSum = 0;
    let magnitudeSum = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      const frequency = (i * this.audioContext!.sampleRate) / (2 * frequencyData.length);
      const magnitude = frequencyData[i] / 255.0;
      weightedSum += frequency * magnitude;
      magnitudeSum += magnitude;
    }
    const spectralCentroid = magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;

    // Calculate zero crossing rate
    let zeroCrossings = 0;
    for (let i = 1; i < inputData.length; i++) {
      if ((inputData[i] > 0) !== (inputData[i - 1] > 0)) {
        zeroCrossings++;
      }
    }
    const zcr = zeroCrossings / inputData.length;

    // Voice activity detection
    const energyAboveThreshold = energy > this.config.energyThreshold;
    const spectralCentroidInRange = spectralCentroid > this.config.spectralCentroidThreshold;
    const zcrInRange = zcr < this.config.zcr_threshold;

    const isSpeech = energyAboveThreshold && (spectralCentroidInRange || zcrInRange);
    const confidence = this.calculateConfidence(energy, spectralCentroid, zcr);

    const currentTime = Date.now();
    let finalIsSpeech = false;
    let sentenceComplete = false;

    if (isSpeech && confidence > 0.4) {
      if (this.speechStartTime === null) {
        this.speechStartTime = currentTime;
      }
      this.lastSpeechTime = currentTime;
      this.silenceStartTime = null;

      if (currentTime - this.speechStartTime >= this.config.minSpeechDuration) {
        finalIsSpeech = true;
      }
    } else {
      if (this.silenceStartTime === null && this.lastSpeechTime !== null) {
        this.silenceStartTime = currentTime;
      }

      if (this.lastSpeechTime !== null) {
        const silenceDuration = this.silenceStartTime ? currentTime - this.silenceStartTime : 0;
        
        if (silenceDuration < this.config.maxSilenceDuration) {
          finalIsSpeech = true;
        }
        else if (silenceDuration >= this.config.sentenceEndSilence) {
          finalIsSpeech = false;
          sentenceComplete = true;
          this.speechStartTime = null;
          this.lastSpeechTime = null;
          this.silenceStartTime = null;
        }
      }
    }

    this.callback!({
      isSpeech: finalIsSpeech,
      confidence,
      energy,
      sentenceComplete
    });
  }

  private calculateConfidence(energy: number, spectralCentroid: number, zcr: number): number {
    const energyScore = Math.min(energy / this.config.energyThreshold, 1.0);
    const spectralScore = spectralCentroid > this.config.spectralCentroidThreshold ? 1.0 : 0.5;
    const zcrScore = zcr < this.config.zcr_threshold ? 1.0 : 0.5;
    
    const rawScore = (energyScore * 0.6 + spectralScore * 0.2 + zcrScore * 0.2);
    return (rawScore - 0.3) / 0.7;
  }

  // before
  // private calculateConfidence(energy: number, spectralCentroid: number, zcr: number): number {
  //   const energyScore = Math.min(energy / this.config.energyThreshold, 1.0);
  //   const spectralScore = spectralCentroid > this.config.spectralCentroidThreshold ? 1.0 : 0.5;
  //   const zcrScore = zcr < this.config.zcr_threshold ? 1.0 : 0.5;

  //   console.log(`Scores:\nenergy: ${energy * 0.6}\npectralScore: ${spectralScore * 0.2}\nzcrScore: ${zcrScore * 0.2}`);
    
  //   return (energyScore * 0.6 + spectralScore * 0.2 + zcrScore * 0.2);
  // }

  startDetection(callback: (result: { isSpeech: boolean; confidence: number; energy: number; sentenceComplete: boolean }) => void): void {
    this.callback = callback;
    this.isActive = true;
    console.log('🎧 Enhanced VAD detection started');
  }

  stopDetection(): void {
    this.isActive = false;
    this.callback = null;
    this.speechStartTime = null;
    this.silenceStartTime = null;
    this.lastSpeechTime = null;
    console.log('🎧 Enhanced VAD detection stopped');
  }

  destroy(): void {
    this.stopDetection();
    
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    console.log('🎧 Enhanced VoiceActivityDetector destroyed');
  }
}

export default VoiceActivityDetector;