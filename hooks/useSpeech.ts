// hooks/useSpeech.ts
import { useState, useEffect, useRef } from 'react';
import { SpeechService, AudioMessage } from '../lib/services/speechService';

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
  const [retryCount, setRetryCount] = useState(0);
  
  const recognition = useRef<SpeechRecognition | null>(null);
  const speechService = useRef(SpeechService.getInstance());
  const isStoppingRef = useRef(false);
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
          setTranscript(prev => prev + finalTranscript);
        }
        setInterimTranscript(interimTranscript);
      };
      
      recognitionInstance.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        
        // Don't treat "aborted" as a real error - it's expected when stopping
        if (event.error === 'aborted') {
          setIsListening(false);
          return;
        }
        
        setIsListening(false);
        
        if (event.error === 'network') {
          console.log('Network error - speech recognition unavailable');
          
          if (retryCount < 3) {
            setRetryCount(prev => prev + 1);
            restartTimeoutRef.current = setTimeout(() => {
              try {
                if (recognition.current && !isStoppingRef.current) {
                  recognition.current.start();
                }
              } catch (e) {
                console.error('Failed to restart recognition:', e);
              }
            }, 2000 * retryCount);
          } else {
            setError('Speech recognition unavailable due to network issues');
            setRetryCount(0);
          }
        } else if (event.error !== 'no-speech') {
          setError(`Speech recognition error: ${event.error}`);
        }
      };

      recognitionInstance.onstart = () => {
        setIsListening(true);
        setError(null);
        setRetryCount(0);
        isStoppingRef.current = false;
      };
      
      recognitionInstance.onend = () => {
        setIsListening(false);
        setInterimTranscript('');
        
        // Only restart if we're not intentionally stopping
        if (!isStoppingRef.current && isRecording) {
          restartTimeoutRef.current = setTimeout(() => {
            try {
              if (recognition.current && !isStoppingRef.current) {
                recognition.current.start();
              }
            } catch (e) {
              console.error('Failed to restart recognition:', e);
            }
          }, 100);
        }
      };
      
      recognition.current = recognitionInstance;
    }
  }, []);

  const startRecording = async () => {
    try {
      setError(null);
      isStoppingRef.current = false;
      
      // Clear any pending restart
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      
      // Start speech recognition
      if (recognition.current) {
        // Stop any existing recognition first
        if (isListening) {
          recognition.current.stop();
          // Wait a bit before starting again
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        setTranscript('');
        setInterimTranscript('');
        
        try {
          recognition.current.start();
        } catch (e) {
          console.error('Recognition start error:', e);
          // If it fails, it might already be running, so we continue
        }
      }
      
      // Start audio recording
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        try {
          setIsProcessing(true);
          const audioBlob = new Blob(chunks, { type: 'audio/wav' });
          const audioUrl = URL.createObjectURL(audioBlob);
          
          // Add user message
          const userMessage: AudioMessage = {
            id: Date.now(),
            type: 'user',
            audioUrl: audioUrl,
            text: transcript,
            timestamp: new Date()
          };
          
          setAudioMessages(prev => [...prev, userMessage]);
          
          // Process with AI
          const result = await speechService.current.processAudio(audioBlob, transcript);
          
          if (result.success && result.message) {
            setAudioMessages(prev => [...prev, result.message!]);
          } else {
            setError(result.error || 'Processing failed');
          }
          
          setIsProcessing(false);
        } catch (err) {
          console.error('Processing failed:', err);
          setError('Processing failed');
          setIsProcessing(false);
        }
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Could not access microphone. Please check your permissions.');
    }
  };

  const stopRecording = () => {
    isStoppingRef.current = true;
    
    // Clear any pending restart
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    
    if (recognition.current && isListening) {
      recognition.current.stop();
    }
    
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
      if (recognition.current && isListening) {
        recognition.current.stop();
      }
    };
  }, [isListening]);

  return {
    isRecording,
    audioMessages,
    isProcessing,
    transcript,
    interimTranscript,
    isListening,
    startRecording,
    stopRecording,
    error
  };
};