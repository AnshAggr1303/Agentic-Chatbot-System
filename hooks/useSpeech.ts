// hooks/useSpeech.ts - Updated version with timer-based transcript processing
"use client"

import { useState, useEffect, useRef } from 'react';
import { SpeechService, AudioMessage } from '../lib/services/speechService';
import SupabaseService from '../lib/services/supabaseService';

// Add SpeechRecognition type for TypeScript
type SpeechRecognition = typeof window.SpeechRecognition extends undefined
  ? typeof window.webkitSpeechRecognition
  : typeof window.SpeechRecognition;

export interface UseSpeechReturn {
  isRecording: boolean;
  audioMessages: AudioMessage[];
  isProcessing: boolean;
  transcript: string;
  interimTranscript: string;
  isListening: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  error: string | null;
  vadActive: boolean;
  vadConfidence: number;
  microphoneActive: boolean;
  isMonitoring: boolean;
  currentChatId: string | null;
  isSavingToDatabase: boolean;
  clearError: () => void;
  startNewConversation: () => void;
  getChatMessages: (chatId: string) => Promise<any>;
  isConnectedToSupabase: boolean;
  manualSaveTest: () => Promise<void>;
  audioFiles: AudioFile[];
  isLoadingFiles: boolean;
  fetchAudioFiles: (chatId: string, messageId: string) => Promise<void>;
  currentMessageId: string;
}

interface AudioFile {
  name: string;
  size: number;
  created_at: string;
  url?: string;
}

// Enhanced VoiceActivityDetector with better sentence detection
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
    
    return (energyScore * 0.6 + spectralScore * 0.2 + zcrScore * 0.2);
  }

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

export const useSpeech = (): UseSpeechReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioMessages, setAudioMessages] = useState<AudioMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vadActive, setVadActive] = useState(false);
  const [vadConfidence, setVadConfidence] = useState(0);
  const [microphoneActive, setMicrophoneActive] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isSavingToDatabase, setIsSavingToDatabase] = useState(false);
  const [isConnectedToSupabase, setIsConnectedToSupabase] = useState(false);
  
  const recognition = useRef<SpeechRecognition | null>(null);
  const speechService = useRef(SpeechService.getInstance());
  const supabaseService = useRef(SupabaseService.getInstance());
  const vadRef = useRef<VoiceActivityDetector | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const speechRecognitionActiveRef = useRef(false);
  const currentRecordingRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const isWaitingForSentenceEnd = useRef(false);
  
  // Add timer ref for processing management
  const processingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Add these after your existing useState declarations
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [currentMessageId, setCurrentMessageId] = useState<string>('');
  
  // Store completed transcripts separately
  const completedTranscriptRef = useRef<string>('');
  const pendingTranscriptRef = useRef<string>('');

  // Test Supabase connection on mount using dedicated testConnection method
  useEffect(() => {
  console.log('🔍 Bypassing Supabase connection test...');
  setIsConnectedToSupabase(true);
  setError(null);
}, []);

  // Auto-start VAD monitoring on component mount
  useEffect(() => {
    const initializeAlwaysOnVAD = async () => {
      try {
        await startVADMonitoring();
        console.log('🎧 Always-on VAD initialized');
      } catch (err) {
        console.error('Failed to initialize always-on VAD:', err);
        setError('Could not initialize voice monitoring. Please allow microphone access.');
      }
    };

    initializeAlwaysOnVAD();

    return () => {
      cleanup();
    };
  }, []);

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = 'en-US';
      
      recognitionInstance.onresult = (event) => {
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
        
        if (finalTranscript) {
          // Store final transcript in ref and state
          completedTranscriptRef.current += finalTranscript;
          setTranscript(prev => prev + finalTranscript);
          console.log('📝 Final transcript added:', finalTranscript);
          console.log('📝 Complete transcript so far:', completedTranscriptRef.current);
        }
        
        // Store interim transcript in ref
        pendingTranscriptRef.current = interimTranscript;
        setInterimTranscript(interimTranscript);
      };
      
      recognitionInstance.onstart = () => {
        console.log('✅ Speech recognition started');
        setIsListening(true);
        speechRecognitionActiveRef.current = true;
      };
      
      // Alternative approach - modify the speech recognition onend handler
recognitionInstance.onend = async () => {
  console.log('⏹️ Speech recognition ended');
  setIsListening(false);
  speechRecognitionActiveRef.current = false;
  setInterimTranscript('');
  
  console.log('🔧 Speech recognition ended - checking for transcript to save');
  
  // Force processing when speech recognition ends
  if (!isWaitingForSentenceEnd.current) {
    const refTranscript = (completedTranscriptRef.current + pendingTranscriptRef.current).trim();
    const stateTranscript = (transcript + interimTranscript).trim();
    const completeTranscript = refTranscript.length > stateTranscript.length ? refTranscript : stateTranscript;
    
    console.log('📝 Force processing on speech end:', {
      refTranscript,
      stateTranscript,
      completeTranscript,
      length: completeTranscript.length,
      connected: isConnectedToSupabase
    });
    
    if (completeTranscript && completeTranscript.length > 0) {
      console.log('💾 Force processing: Initiating database save...');
      isWaitingForSentenceEnd.current = true;
      
      const saveSuccess = await saveTranscriptToDatabase(completeTranscript);
      
      if (saveSuccess) {
        console.log('✅ Force processing: Database save completed successfully');
      } else {
        console.log('❌ Force processing: Database save failed');
      }
      
      // Clear UI transcript after processing
      setTimeout(() => {
        setTranscript('');
        setInterimTranscript('');
        completedTranscriptRef.current = '';
        pendingTranscriptRef.current = '';
        isWaitingForSentenceEnd.current = false;
        console.log('🔄 Force processing: Ready for next sentence...');
      }, 1000);
    }
  }
};
      
      recognitionInstance.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        speechRecognitionActiveRef.current = false;
        setIsListening(false);
        
        if (event.error !== 'aborted' && event.error !== 'no-speech') {
          setError(`Speech recognition error: ${event.error}`);
        }
      };
      
      recognition.current = recognitionInstance;
    }
  }, []);

  // Updated cleanup function to include timer cleanup
  const cleanup = () => {
    // Clear processing timer
    if (processingTimerRef.current) {
      clearTimeout(processingTimerRef.current);
      processingTimerRef.current = null;
    }
    
    if (vadRef.current) {
      vadRef.current.destroy();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (currentRecordingRef.current && currentRecordingRef.current.state !== 'inactive') {
      currentRecordingRef.current.stop();
    }
    if (recognition.current && speechRecognitionActiveRef.current) {
      recognition.current.stop();
    }
  };

  // Enhanced function to save transcript to Supabase with better error handling
  const saveTranscriptToDatabase = async (transcriptText: string) => {
    console.log('💾 === saveTranscriptToDatabase called ===');
    console.log('💾 Input transcript:', transcriptText);
    console.log('💾 Input transcript type:', typeof transcriptText);
    console.log('💾 Input transcript length:', transcriptText.length);
    
    if (!transcriptText || !transcriptText.trim()) {
      console.log('⚠️ No transcript to save - empty or whitespace only');
      return false;
    }

    const trimmedTranscript = transcriptText.trim();
    
    console.log('💾 Starting database save process...');
    console.log('💾 Trimmed transcript:', trimmedTranscript);
    console.log('💾 Trimmed transcript length:', trimmedTranscript.length);
    console.log('💾 Supabase connected:', isConnectedToSupabase);
    console.log('💾 Current chat ID:', currentChatId);

    //if (!isConnectedToSupabase) {
    //  console.error('❌ Cannot save - not connected to Supabase');
    //  setError('Not connected to database');
    //  return false;
    //}

    setIsSavingToDatabase(true);
    
    try {
      console.log('💾 Calling supabaseService.sendSpeechText...');
      
      const result = await supabaseService.current.sendSpeechText(trimmedTranscript);
      
      console.log('💾 Supabase response received:', result);
      console.log('💾 Response success:', result.success);
      console.log('💾 Response error:', result.error);
      console.log('💾 Response chat_id:', result.chat_id);
      console.log('💾 Response message_id:', result.message_id);
      
      if (result.success) {
        console.log('✅ Transcript saved successfully to database');
        console.log('✅ Chat ID:', result.chat_id);
        console.log('✅ Message ID:', result.message_id);
        
        // Update current chat ID if this is a new chat
        if (result.chat_id && result.chat_id !== currentChatId) {
          setCurrentChatId(result.chat_id);
          console.log('✅ Updated current chat ID:', result.chat_id);
        }
        
        // Clear any previous errors
        setError(null);
        return true;
      } else {
        console.error('❌ Failed to save transcript:', result.error);
        setError(`Failed to save to database: ${result.error}`);
        return false;
      }
    } catch (err) {
      console.error('❌ Exception while saving transcript:', err);
      console.error('❌ Exception details:', {
        name: err instanceof Error ? err.name : 'Unknown',
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : 'No stack trace'
      });
      setError(`Error saving transcript: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    } finally {
      setIsSavingToDatabase(false);
      console.log('💾 === saveTranscriptToDatabase completed ===');
    }
  };

  // Enhanced VAD monitoring with better sentence detection
  const startVADMonitoring = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      audioStreamRef.current = stream;
      setIsMonitoring(true);
      
      vadRef.current = new VoiceActivityDetector({
        energyThreshold: 0.012,
        spectralCentroidThreshold: 1200,
        zcr_threshold: 0.5,
        minSpeechDuration: 100,
        maxSilenceDuration: 300,
        sentenceEndSilence: 2000 // Increased to 2 seconds for better detection
      });
      
      await vadRef.current.initialize(stream);
      vadRef.current.startDetection(handleVADResult);
      
      console.log('🎧 Enhanced VAD monitoring started');
      
    } catch (err) {
      console.error('Error starting VAD monitoring:', err);
      setError('Could not access microphone for voice monitoring.');
      throw err;
    }
  };

  // Updated VAD result handling with timer-based processing
 // Updated VAD result handling with timer-based processing
const handleVADResult = async (result: { isSpeech: boolean; confidence: number; energy: number; sentenceComplete: boolean }) => {
  setVadConfidence(result.confidence);
  setVadActive(result.isSpeech);
  
  if (result.isSpeech && result.confidence > 0.5) {
    if (!microphoneActive && !isWaitingForSentenceEnd.current) {
      console.log('🗣️ Speech detected, starting sentence recording...');
      
      // Clear any pending processing timer
      if (processingTimerRef.current) {
        clearTimeout(processingTimerRef.current);
        processingTimerRef.current = null;
      }
      
      // Clear previous transcript refs for new sentence
      completedTranscriptRef.current = '';
      pendingTranscriptRef.current = '';
      
      startActiveRecording();
      startSpeechRecognition();
    }
  } else if (!result.isSpeech && microphoneActive && !isWaitingForSentenceEnd.current) {
    // When speech stops, start a timer to process the transcript
    console.log('🔇 Speech stopped, starting processing timer...');
    
    // Clear any existing timer
    if (processingTimerRef.current) {
      clearTimeout(processingTimerRef.current);
    }
    
    // Set a timer to process the transcript after 1.5 seconds of silence
    processingTimerRef.current = setTimeout(async () => {
      console.log('⏰ Processing timer triggered, processing transcript...');
      
      if (microphoneActive && !isWaitingForSentenceEnd.current) {
        isWaitingForSentenceEnd.current = true;
        
        // Stop recording and recognition
        stopActiveRecording();
        stopSpeechRecognition();
        
        // Give time for final results
        setTimeout(async () => {
          const refTranscript = (completedTranscriptRef.current + pendingTranscriptRef.current).trim();
          const stateTranscript = (transcript + interimTranscript).trim();
          const completeTranscript = refTranscript.length > stateTranscript.length ? refTranscript : stateTranscript;
          
          console.log('📝 Timer-based processing:', {
            refTranscript,
            stateTranscript,
            completeTranscript,
            length: completeTranscript.length,
            connected: isConnectedToSupabase
          });
          
          if (completeTranscript && completeTranscript.length > 0 && isConnectedToSupabase) {
            console.log('💾 Timer: Initiating database save...');
            const saveSuccess = await saveTranscriptToDatabase(completeTranscript);
            
            if (saveSuccess) {
              console.log('✅ Timer: Database save completed successfully');
            } else {
              console.log('❌ Timer: Database save failed');
            }
          } else {
            console.log('⚠️ Timer: No transcript to save or not connected to database');
          }
          
          // Clear UI transcript after processing
          setTimeout(() => {
            setTranscript('');
            setInterimTranscript('');
            completedTranscriptRef.current = '';
            pendingTranscriptRef.current = '';
            isWaitingForSentenceEnd.current = false;
            console.log('🔄 Timer: Ready for next sentence...');
          }, 1000);
        }, 500);
      }
    }, 1500); // Process after 1.5 seconds of silence
  }
  
  // Add additional check for sentence completion
  if (result.sentenceComplete && microphoneActive && !isWaitingForSentenceEnd.current) {
    console.log('✅ Sentence completion detected by VAD');
    
    // Clear any existing timer
    if (processingTimerRef.current) {
      clearTimeout(processingTimerRef.current);
    }
    
    // Immediately process the sentence
    isWaitingForSentenceEnd.current = true;
    stopActiveRecording();
    stopSpeechRecognition();
    
    setTimeout(async () => {
      const refTranscript = (completedTranscriptRef.current + pendingTranscriptRef.current).trim();
      const stateTranscript = (transcript + interimTranscript).trim();
      const completeTranscript = refTranscript.length > stateTranscript.length ? refTranscript : stateTranscript;
      
      console.log('📝 Sentence completion processing:', {
        refTranscript,
        stateTranscript,
        completeTranscript,
        length: completeTranscript.length,
        connected: isConnectedToSupabase
      });
      
      if (completeTranscript && completeTranscript.length > 0 && isConnectedToSupabase) {
        console.log('💾 Sentence completion: Initiating database save...');
        const saveSuccess = await saveTranscriptToDatabase(completeTranscript);
        
        if (saveSuccess) {
          console.log('✅ Sentence completion: Database save completed successfully');
        } else {
          console.log('❌ Sentence completion: Database save failed');
        }
      }
      
      // Clear UI transcript after processing
      setTimeout(() => {
        setTranscript('');
        setInterimTranscript('');
        completedTranscriptRef.current = '';
        pendingTranscriptRef.current = '';
        isWaitingForSentenceEnd.current = false;
        console.log('🔄 Sentence completion: Ready for next sentence...');
      }, 1000);
    }, 300);
  }
};

  const startSpeechRecognition = () => {
    if (!recognition.current || speechRecognitionActiveRef.current) {
      return;
    }

    try {
      console.log('🎤 Starting speech recognition...');
      recognition.current.start();
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      if (error instanceof Error && !error.message.includes('already started')) {
        setError('Could not start speech recognition');
      }
    }
  };

  const stopSpeechRecognition = () => {
    if (recognition.current && speechRecognitionActiveRef.current) {
      try {
        console.log('⏹️ Stopping speech recognition...');
        recognition.current.stop();
      } catch (error) {
        console.error('Error stopping speech recognition:', error);
      }
    }
  };

  const startActiveRecording = async () => {
    if (currentRecordingRef.current) {
      return;
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
      
      recordingStreamRef.current = stream;
      
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        try {
          setIsProcessing(true);
          const audioBlob = new Blob(chunks, { type: 'audio/wav' });

          const completeTranscript = (completedTranscriptRef.current + pendingTranscriptRef.current).trim();

          if (completeTranscript) {
        console.log('📝 Processing sentence for speech service:', completeTranscript);

        // Generate IDs for this conversation
        const chatId = currentChatId || generateChatId();
        const messageId = generateMessageId();

        if (!currentChatId) {
          setCurrentChatId(chatId);
        }
        setCurrentMessageId(messageId); // Add this line

        const result = await speechService.current.processAudio(audioBlob, completeTranscript);

        if (result.success && result.message) {
          setAudioMessages(prev => [...prev, result.message!]);

          // Fetch audio files after successful processing
          await fetchAudioFiles(chatId, messageId);
        }
          }

          setIsProcessing(false);

        } catch (err) {
          console.error('Processing failed:', err);
          setError('Processing failed');
          setIsProcessing(false);
        }

        if (recordingStreamRef.current) {
          recordingStreamRef.current.getTracks().forEach(track => track.stop());
          recordingStreamRef.current = null;
        }
      };

      recorder.start();
      currentRecordingRef.current = recorder;
      setMediaRecorder(recorder);
      setMicrophoneActive(true);
      
      console.log('🎤 Sentence recording started');
      
    } catch (err) {
      console.error('Error starting recording:', err);
      setError('Could not start recording.');
    }
  };

  const stopActiveRecording = () => {
    if (currentRecordingRef.current && currentRecordingRef.current.state !== 'inactive') {
      currentRecordingRef.current.stop();
      currentRecordingRef.current = null;
      setMicrophoneActive(false);
      console.log('🎤 Sentence recording stopped');
    }
  };

  const startRecording = async () => {
    if (!isMonitoring) {
      await startVADMonitoring();
    }
    setIsRecording(true);
  };

  const stopRecording = () => {
    // Clear processing timer when stopping recording
    if (processingTimerRef.current) {
      clearTimeout(processingTimerRef.current);
      processingTimerRef.current = null;
    }
    
    stopActiveRecording();
    stopSpeechRecognition();
    
    if (vadRef.current) {
      vadRef.current.destroy();
      vadRef.current = null;
    }
    
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    
    setIsRecording(false);
    setIsMonitoring(false);
    setMicrophoneActive(false);
    setVadActive(false);
    setVadConfidence(0);
    setTranscript('');
    setInterimTranscript('');
    setIsListening(false);
    
    // Clear refs as well
    completedTranscriptRef.current = '';
    pendingTranscriptRef.current = '';
    
    console.log('⏹️ Recording stopped completely');
  };

  // Clear error function
  const clearError = () => {
    setError(null);
  };

  // Start new conversation
  const startNewConversation = () => {
    // Clear processing timer
    if (processingTimerRef.current) {
      clearTimeout(processingTimerRef.current);
      processingTimerRef.current = null;
    }
    
    supabaseService.current.startNewConversation();
    setCurrentChatId(null);
    setAudioMessages([]);
    setTranscript('');
    setInterimTranscript('');
    
    // Clear refs as well
    completedTranscriptRef.current = '';
    pendingTranscriptRef.current = '';
    
    console.log('🆕 New conversation started');
  };

  // Get chat messages
  const getChatMessages = async (chatId: string) => {
    try {
      const result = await supabaseService.current.getChatMessages(chatId);
      return result;
    } catch (error) {
      console.error('Error fetching chat messages:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  };

  // Sync current chat ID with Supabase service
  useEffect(() => {
    const serviceChatId = supabaseService.current.getCurrentChatId();
    if (serviceChatId && serviceChatId !== currentChatId) {
      setCurrentChatId(serviceChatId);
    }
  }, [currentChatId]);
  // Add this function to your useSpeech hook for testing
const manualSaveTest = async () => {
  const refTranscript = (completedTranscriptRef.current + pendingTranscriptRef.current).trim();
  const stateTranscript = (transcript + interimTranscript).trim();
  const completeTranscript = refTranscript.length > stateTranscript.length ? refTranscript : stateTranscript;
  
  console.log('🧪 Manual save test:', {
    refTranscript,
    stateTranscript,
    completeTranscript,
    length: completeTranscript.length,
    connected: isConnectedToSupabase
  });
  
  if (completeTranscript && completeTranscript.length > 0) {
    console.log('💾 Manual test: Initiating database save...');
    const saveSuccess = await saveTranscriptToDatabase(completeTranscript);
    
    if (saveSuccess) {
      console.log('✅ Manual test: Database save completed successfully');
    } else {
      console.log('❌ Manual test: Database save failed');
    }
  }
};

// Add this function before the return statement
const fetchAudioFiles = async (chatId: string, messageId: string) => {
  try {
    setIsLoadingFiles(true);
    const response = await fetch(`/api/files?chat_id=${chatId}&message_id=${messageId}`);
    const data = await response.json();
    
    if (data.success) {
      const audioFiles = data.files.filter((file: AudioFile) => 
        file.name.match(/\.(mp3|wav|ogg|m4a)$/i)
      );
      setAudioFiles(audioFiles);
    }
  } catch (error) {
    console.error('Error fetching audio files:', error);
  } finally {
    setIsLoadingFiles(false);
  }
};

// Add these helper functions before the return statement
const generateChatId = () => `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return {
    isRecording,
    audioMessages,
    isProcessing,
    transcript,
    interimTranscript,
    isListening,
    startRecording,
    stopRecording,
    error,
    vadActive,
    vadConfidence,
    microphoneActive,
    isMonitoring,
    currentChatId,
    isSavingToDatabase,
    clearError,
    startNewConversation,
    getChatMessages,
    isConnectedToSupabase,
    manualSaveTest,
    audioFiles,
    isLoadingFiles,
    fetchAudioFiles,
    currentMessageId,
    
  };
};