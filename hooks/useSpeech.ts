// hooks/useSpeech.ts
"use client"

import { useState, useEffect, useRef } from 'react';
import { SpeechService, AudioMessage } from '../lib/services/speechService';
import SupabaseService from '../lib/services/supabaseService';
import { SpeechOrchestrationService } from '../lib/services/orchestrationService';
import { ConversationService } from '../lib/services/conversationService';

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
  isLoading: boolean;
  fetchResponseUrl: (chatId: string) => Promise<void>;
  currentMessageId: string;
  currentResponseUrl: string;
}

interface AudioFile {
  name: string;
  size: number;
  created_at: string;
  url?: string;
}

export const useSpeech = (): UseSpeechReturn => {
  // State management
  const [isRecording, setIsRecording] = useState(false);
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
  const [isLoading, setIsLoading] = useState(false);
  const [currentMessageId, setCurrentMessageId] = useState<string>('');
  const [currentResponseUrl, setCurrentResponseUrl] = useState<string>('');

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
      onError: (errorMessage) => {
        setError(errorMessage);
      }
    });

    // Setup conversation service callbacks
    conversationService.current.setCallbacks({
      onChatIdChange: (chatId) => {
        setCurrentChatId(chatId);
      },
      onMessageIdChange: (messageId) => {
        setCurrentMessageId(messageId);
      }
    });

    // Test Supabase connection
    setIsConnectedToSupabase(true);
    setError(null);

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

    setIsSavingToDatabase(true);
    setIsProcessing(true);

    try {
      // Save transcript to database
      // const saveResult = 
      await saveTranscriptToDatabase(transcriptText);
      
      await fetchResponseUrl(currentChatId!);

    } catch (err) {
      console.error('Error handling sentence completion:', err);
      setError('Error processing sentence');
    } finally {
      setIsSavingToDatabase(false);
      setIsProcessing(false);
      
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

    try {
      const result = await supabaseService.current.sendSpeechText(transcriptText.trim());
      
      if (result.success) {
        if (result.chat_id && result.chat_id !== currentChatId) {
          setCurrentChatId(result.chat_id);
        }
        if(result.message_id){
          console.log("current message id set!!!!!1");
          setCurrentMessageId(result.message_id);
        }
        setError(null);
        return true;
      } else {
        setError(`Failed to save to database: ${result.error}`);
        return false;
      }
    } catch (err) {
      console.error('Exception while saving transcript:', err);
      setError(`Error saving transcript: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    }
  };

  // Fetch audio files
  const fetchResponseUrl = async (chatId: string) => {
    try {
      setIsLoading(true);
      const messages = await supabaseService.current.listenToChatMessagesAfter(chatId, currentMessageId);
      if(messages.messages){
        setCurrentResponseUrl(messages.messages[0]["audio_url"]);
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
    if (started) {
      setIsRecording(true);
    }
  };

  const stopRecording = () => {
    if (orchestrationService.current) {
      orchestrationService.current.stop();
    }
    setIsRecording(false);
    setIsMonitoring(false);
    setMicrophoneActive(false);
    setVadActive(false);
    setVadConfidence(0);
    setTranscript('');
    setInterimTranscript('');
    setIsListening(false);
  };

  const clearError = () => {
    setError(null);
  };

  const startNewConversation = () => {
    if (conversationService.current) {
      conversationService.current.startNewConversation();
    }
    setAudioMessages([]);
    setTranscript('');
    setInterimTranscript('');
  };

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

  const manualSaveTest = async () => {
    const completeTranscript = (transcript + interimTranscript).trim();
    
    if (completeTranscript) {
      const saveSuccess = await saveTranscriptToDatabase(completeTranscript);
      console.log('Manual test result:', saveSuccess);
    }
  };

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
    isLoading,
    fetchResponseUrl,
    currentMessageId,
    currentResponseUrl,
  };
};