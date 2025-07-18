// hooks/useSpeech.ts
"use client"

import { useState, useEffect, useRef } from 'react';
import SupabaseService from '../lib/services/supabaseService';
import { SpeechOrchestrationService } from '../lib/services/orchestrationService';
import { ConversationService } from '../lib/services/conversationService';

export interface UseSpeechReturn {
  isProcessing: boolean;
  transcript: string;
  interimTranscript: string;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  vadActive: boolean;
  vadConfidence: number;
  microphoneActive: boolean;
  isMonitoring: boolean;
  isConnectedToSupabase: boolean;
  isLoading: boolean;
  currentResponseUrl: string | null;
  currentResponseText: string | null;
}

export const useSpeech = (): UseSpeechReturn => {
  // State management
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [vadActive, setVadActive] = useState(false);
  const [vadConfidence, setVadConfidence] = useState(0);
  const [microphoneActive, setMicrophoneActive] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isConnectedToSupabase, setIsConnectedToSupabase] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentResponseUrl, setCurrentResponseUrl] = useState<string | null>(null);
  const [currentResponseText, setCurrentResponseText] = useState<string | null>(null);

  // Service instances
  const orchestrationService = useRef<SpeechOrchestrationService | null>(null);
  const conversationService = useRef<ConversationService | null>(null);
  // const speechService = useRef(SpeechService.getInstance());
  const supabaseService = useRef(SupabaseService.getInstance());

  // Initialize services
  useEffect(() => {
    orchestrationService.current = new SpeechOrchestrationService();
    conversationService.current = new ConversationService();

    // Setup orchestration service callbacks
    orchestrationService.current.setCallbacks({
      onTranscriptChange: (transcriptText, isInterim) => {
        if (isInterim) {
          setInterimTranscript(transcriptText);
        } else {
          setTranscript(prev => prev + transcriptText);
        }
      },
      onRecordingStateChange: (recording) => {
        setMicrophoneActive(recording);
      },
      onVADStateChange: (active, confidence) => {
        setVadActive(active);
        setVadConfidence(confidence);
      },
      onSentenceComplete: async (transcriptText) => {
        await handleSentenceComplete(transcriptText);
      },
    });

    // Setup conversation service callbacks
    conversationService.current.setCallbacks({
      onChatIdChange: (chatId) => {
        setCurrentChatId(chatId);
      },
    });

    // Test Supabase connection
    setIsConnectedToSupabase(true);

    // Start VAD monitoring
    const initializeServices = async () => {
      if (orchestrationService.current) {
        const started = await orchestrationService.current.start();
        if (started) {
          setIsMonitoring(true);
        }
      }
    };

    initializeServices();

    return () => {
      if (orchestrationService.current) {
        orchestrationService.current.destroy();
      }
    };
  }, []);

  // Handle completed sentences
  const handleSentenceComplete = async (transcriptText: string) => {
    if (!transcriptText.trim()) return;
    setIsProcessing(true);

    console.log("1");

    try {
      // Save transcript to database
      // const saveResult = 
      await saveTranscriptToDatabase(transcriptText);

      console.log("2");

    } catch (err) {
      console.error('Error handling sentence completion:', err);
    } finally {
      setIsProcessing(false);

    console.log("3");
      
      // Clear transcripts after processing
      setTimeout(() => {
        setTranscript('');
        setInterimTranscript('');
      }, 1000);
    }
  };

  // Save transcript to database
  const saveTranscriptToDatabase = async (transcriptText: string): Promise<boolean> => {
    if (!transcriptText.trim()) return false;

    console.log("11");

    try {
      const result = await supabaseService.current.sendText(transcriptText.trim());

      console.log("12");
      
      if (result.success) {
        if (result.chat_id && result.chat_id !== currentChatId) {
          setCurrentChatId(result.chat_id);
        }
        if(result.chat_id && result.message_id){
          fetchResponseUrl(result.chat_id, result.message_id);
        }

        console.log("13");
        return true;
      } else {
        return false;
      }
    } catch (err) {
      console.error('Exception while saving transcript:', err);
      return false;
    }
  };

  // Fetch audio files
  const fetchResponseUrl = async (chatId: string, messageId: string) => {
    try {
      setIsLoading(true);
      const messages = await supabaseService.current.listenToChatMessagesAfter(chatId, messageId);
      if(messages.messages){
        setCurrentResponseUrl(messages.messages[0]["audio_url"]);
        setCurrentResponseText(messages.messages[0]["text"]);
        console.log(messages.messages[0]["audio_url"]);
      }
    } catch (error) {
      console.error('Error fetching audio files:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Public methods
  const startRecording = async () => {
    if (!orchestrationService.current) return;
    
    const started = await orchestrationService.current.start();
  };

  const stopRecording = () => {
    if (orchestrationService.current) {
      orchestrationService.current.stop();
    }
    setIsMonitoring(false);
    setMicrophoneActive(false);
    setVadActive(false);
    setVadConfidence(0);
    setTranscript('');
    setInterimTranscript('');
  }

  return {
    isProcessing,
    transcript,
    interimTranscript,
    startRecording,
    stopRecording,
    vadActive,
    vadConfidence,
    microphoneActive,
    isMonitoring,
    isConnectedToSupabase,
    isLoading,
    currentResponseUrl,
    currentResponseText,
  };
}