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

  // Add these state variables to your component
  const [retryAudioMessage, setRetryAudioMessage] = useState<string | null>(null);
  const [showAudioRetryButton, setShowAudioRetryButton] = useState(false);

  // Enhanced audio message sending with retry logic
  const sendAudioMessageWithRetry = async (messageText: string, isRetry = false): Promise<boolean> => {
    try {
      console.log('Attempting to send audio message:', messageText);
      
      const result = await supabaseService.current.sendText(messageText, 'audio');
      
      console.log('Supabase audio result:', result);

      if (result.success && result.chat_id && result.message_id) {
        // Update current chat ID if it changed
        if (result.chat_id !== currentChatId) {
          setCurrentChatId(result.chat_id);
        }

        // Wait for AI response with audio URL
        const messages = await supabaseService.current.waitForAIResponse(
          result.chat_id, 
          result.message_id,
          30000 // 30 second timeout for audio processing
        );
        
        if (messages.messages && messages.messages.length > 0) {
          const aiResponse = messages.messages[0];
          
          // Set both audio URL and text response
          setCurrentResponseUrl(aiResponse.audio_url);
          setCurrentResponseText(aiResponse.text);
          
          console.log('Audio response URL:', aiResponse.audio_url);
          
          setRetryAudioMessage(null); // Clear retry state on success
          setShowAudioRetryButton(false);
          return true;
        } else {
          throw new Error('No AI audio response received');
        }
      } else {
        throw new Error(result.error || 'Failed to save audio message');
      }
    } catch (error) {
      console.error('Error sending audio message:', error);
      
      // If this is not a retry, try once more
      if (!isRetry) {
        console.log('Retrying audio message send...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
        return await sendAudioMessageWithRetry(messageText, true);
      }
      
      // If retry also failed, show error and set up retry button
      setRetryAudioMessage(messageText); // Store message for retry button
      setShowAudioRetryButton(true);
      
      // Optionally show error state in UI
      setCurrentResponseText('Failed to process audio message. Connection error occurred.');
      
      return false;
    }
  };

  // Enhanced sentence completion handler with retry logic
  const handleSentenceComplete = async (transcriptText: string) => {
    if (!transcriptText.trim()) return;
    
    setIsProcessing(true);
    console.log("Processing audio transcript:", transcriptText);

    try {
      const success = await sendAudioMessageWithRetry(transcriptText.trim());
      
      if (success) {
        console.log("Audio message processed successfully");
      } else {
        console.log("Audio message processing failed, retry option available");
      }
    } catch (err) {
      console.error('Error handling sentence completion:', err);
      setRetryAudioMessage(transcriptText.trim());
      setShowAudioRetryButton(true);
    } finally {
      setIsProcessing(false);
      
      // Clear transcripts after processing
      setTimeout(() => {
        setTranscript('');
        setInterimTranscript('');
      }, 1000);
    }
  };

  // Retry handler for audio messages
  const handleRetryAudioMessage = async () => {
    if (!retryAudioMessage) return;
    
    setShowAudioRetryButton(false);
    setIsProcessing(true);
    setIsLoading(true);
    
    // Clear any previous error state
    setCurrentResponseUrl('');
    setCurrentResponseText('');
    
    const success = await sendAudioMessageWithRetry(retryAudioMessage);
    
    setIsProcessing(false);
    setIsLoading(false);
    
    if (success) {
      setRetryAudioMessage(null);
    }
  };

  // Alternative: If you want to use the existing saveTranscriptToDatabase function but with retry logic
  const saveTranscriptToDatabaseWithRetry = async (transcriptText: string, isRetry = false): Promise<boolean> => {
    if (!transcriptText.trim()) return false;

    console.log("Saving transcript with retry logic");

    try {
      const result = await supabaseService.current.sendText(transcriptText.trim(), 'audio');
      
      if (result.success) {
        if (result.chat_id && result.chat_id !== currentChatId) {
          setCurrentChatId(result.chat_id);
        }
        
        if (result.chat_id && result.message_id) {
          const success = await fetchResponseUrlWithRetry(result.chat_id, result.message_id);
          if (success) {
            setRetryAudioMessage(null);
            setShowAudioRetryButton(false);
            return true;
          } else {
            throw new Error('Failed to fetch AI response');
          }
        }
        return true;
      } else {
        throw new Error(result.error || 'Failed to save transcript');
      }
    } catch (err) {
      console.error('Exception while saving transcript:', err);
      
      // If this is not a retry, try once more
      if (!isRetry) {
        console.log('Retrying transcript save...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        return await saveTranscriptToDatabaseWithRetry(transcriptText, true);
      }
      
      // If retry also failed, set up retry state
      setRetryAudioMessage(transcriptText);
      setShowAudioRetryButton(true);
      return false;
    }
  };

  // Enhanced fetch response with retry logic
  const fetchResponseUrlWithRetry = async (chatId: string, messageId: string, isRetry = false): Promise<boolean> => {
    try {
      setIsLoading(true);
      const messages = await supabaseService.current.listenToChatMessagesAfter(chatId, messageId);
      
      if (messages.messages && messages.messages.length > 0) {
        setCurrentResponseUrl(messages.messages[0]["audio_url"]);
        setCurrentResponseText(messages.messages[0]["text"]);
        console.log('Audio response URL:', messages.messages[0]["audio_url"]);
        return true;
      } else {
        throw new Error('No messages received');
      }
    } catch (error) {
      console.error('Error fetching audio response:', error);
      
      // If this is not a retry, try once more
      if (!isRetry) {
        console.log('Retrying fetch response...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await fetchResponseUrlWithRetry(chatId, messageId, true);
      }
      
      return false;
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