"use client"

import { useState, useEffect, useRef, Ref } from 'react';
import { Mic, Volume2, VolumeX, MicOff, Send, User, Bot, LogOut, X, AudioLines, Moon, Sun, AlertCircle } from 'lucide-react';
import Spline from '@splinetool/react-spline';
import { useSpeech } from '../hooks/useSpeech';
import { useAudio } from '../hooks/useAudio';
import "../app/globals.css";
import SupabaseService, { useAuthRedirect, UserDetails } from '../lib/services/supabaseService';
import { Application } from '@splinetool/runtime';
import ReactMarkdown from 'react-markdown';
import { timeStamp } from 'console';

interface Message{
    id: string,
    type: string,
    content: string,
    timestamp: Date,
}

export default function AudioChatPage() {
  const [isMuted, setIsMuted] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [userInteractionPrompt, setUserInteractionPrompt] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isAudioMode, setIsAudioMode] = useState(true);
  
  // Text chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef: Ref<HTMLDivElement | null> = useRef(null);
  const [user, setUser] = useState<UserDetails | null>(null);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  const getUser = async () => {
    setUser(await SupabaseService.getInstance().getCurrentUser());
  };

  useEffect( () => {
    getUser();
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try { 
      const supabaseService = SupabaseService.getInstance();
      await supabaseService.logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const [splineApplication, setSplineApplication] = useState<Application | null>(null);
  
  const {
    isProcessing,
    transcript,
    interimTranscript,
    startRecording,
    stopRecording,
    isMonitoring,
    isConnectedToSupabase,
    isLoading,
    currentResponseUrl,
    currentResponseText,
  } = useSpeech();

  // useAuthRedirect();

  const { playAudio, hasUserInteracted } = useAudio(isMuted);

  // Text chat functions
  const scrollToBottom = () => {
    if(messagesEndRef.current){
      messagesEndRef.current!.scrollIntoView({ behavior: "smooth" });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (splineApplication) {
      splineApplication.setBackgroundColor(isDarkMode ? "#111827" : "#f4f4f9");
    }
  }, [isDarkMode]);

  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [showRetryButton, setShowRetryButton] = useState(false);

  const sendMessageWithRetry = async (messageText: string, isRetry = false): Promise<boolean> => {
    try {
      console.log('Attempting to send message:', messageText);
      
      // Save to Supabase using the same method as speech
      const supabaseService = SupabaseService.getInstance();
      const result = await supabaseService.sendText(messageText, 'text');
      
      console.log('Supabase result:', result);

      if (result.chat_id && result.message_id) {
        // Update current chat ID if it changed
        if (result.chat_id !== currentChatId) {
          setCurrentChatId(result.chat_id);
        }

        // Wait for AI response with shorter timeout
        const messages = await supabaseService.waitForAIResponse(
          result.chat_id, 
          result.message_id,
          30000 // 15 second timeout
        );
        
        if (messages.messages && messages.messages.length > 0) {
          const aiResponse = messages.messages[0];
          const botMessage = {
            id: (Date.now() + 1).toLocaleString(),
            type: 'bot',
            content: aiResponse.text,
            timestamp: new Date(aiResponse.created_at)
          };

          setMessages(prev => [...prev, botMessage]);
          setRetryMessage(null); // Clear retry state on success
          setShowRetryButton(false);
          return true;
        } else {
          throw new Error('No AI response received');
        }
      } else {
        throw new Error(result.error || 'Failed to save user message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      
      // If this is not a retry, try once more
      if (!isRetry) {
        console.log('Retrying message send...');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        return await sendMessageWithRetry(messageText, true);
      }
      
      // If retry also failed, show error and set up retry button
      const errorMessage = {
        id: (Date.now() + 1).toLocaleString(),
        type: 'bot',
        content: 'Failed to send message. Connection error occurred.',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMessage]);
      setRetryMessage(messageText); // Store message for retry button
      setShowRetryButton(true);
      return false;
    }
  };

  const handleSuggestedMessage = async (suggestion) => {
    if (!suggestion.trim()) return;

    const userMessage: Message = {
      id: Date.now().toLocaleString(),
      type: 'user',
      content: suggestion.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const messageText = suggestion.trim();
    setInputValue('');
    setIsTyping(true);
    setIsWaitingForResponse(true);

    const success = await sendMessageWithRetry(messageText);
    
    setIsTyping(false);
    setIsWaitingForResponse(false);
  };

  const handleSendMessage = async () => {

    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toLocaleString(),
      type: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const messageText = inputValue.trim();
    setInputValue('');
    setIsTyping(true);
    setIsWaitingForResponse(true);

    const success = await sendMessageWithRetry(messageText);
    
    setIsTyping(false);
    setIsWaitingForResponse(false);
  };

  const handleRetryMessage = async () => {
    if (!retryMessage) return;
    
    setShowRetryButton(false);
    setIsTyping(true);
    setIsWaitingForResponse(true);
    
    // Remove the last error message before retrying
    setMessages(prev => prev.slice(0, -1));
    
    const success = await sendMessageWithRetry(retryMessage);
    
    setIsTyping(false);
    setIsWaitingForResponse(false);
    
    if (success) {
      setRetryMessage(null);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  useEffect(() => {
    if (currentResponseUrl && !isMuted && hasUserInteracted) {
      const audio = document.getElementById('audio');
      if (audio) {
        const playTimer = setTimeout(async () => {
          try {
            await playAudio(currentResponseUrl);
          } catch (error) {
            console.error('Error in playAudio call:', error);
          }
        }, 500);
        
        return () => {
          clearTimeout(playTimer);
        };
      }
    }
  }, [currentResponseUrl, isMuted, hasUserInteracted, playAudio]);

  // Handle initial user interaction
  const handleInitialInteraction = () => {
    setUserInteractionPrompt(false);
  };

  // Updated voice assistant toggle
  const handleVoiceToggle = () => {
    if (!hasUserInteracted) {
      setUserInteractionPrompt(false);
    }
    
    if (isMonitoring) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  useEffect(() => {
    const audio = document.getElementById('audio');
    if (audio) {
      const handleAudioEnd = () => {
        // setCurrentPlaying(null);
        // setIsPlaying(false);
      };
      
      audio.addEventListener('ended', handleAudioEnd);
      
      return () => {
        audio.removeEventListener('ended', handleAudioEnd);
      };
    }
  }, []);

  // Show interaction prompt if needed
  if (userInteractionPrompt && !hasUserInteracted) {
    return (
      <div className="fixed inset-0 bg-[#fafafc] flex items-center justify-center z-50">
        <div className="bg-white border border-gray-200 shadow-lg shadow-gray-50/20 px-8 py-6 rounded-3xl text-center max-w-md">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Volume2 className="h-8 w-8 text-gray-600" />
          </div>
          <h2 className="text-xl font-medium mb-3 text-gray-900">Enable Audio</h2>
          <p className="text-gray-600 mb-8 leading-relaxed">
            Allow audio playback to hear voice responses from the assistant.
          </p>
          <button
            onClick={handleInitialInteraction}
            className="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-2xl font-medium transition-colors"
          >
            Enable Audio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen transition-colors duration-300 ${
      isDarkMode 
        ? 'bg-gray-900 text-gray-100' 
        : 'bg-[#f4f4f9] text-gray-900'
    }`}>
      {/* Hidden audio element */}
      <audio 
        id="audio" 
        style={{ display: 'none' }}
        preload="auto"
        crossOrigin="anonymous"
        loop={false}
        onLoadStart={() => console.log('Audio load started')}
        onCanPlay={() => console.log('Audio can play')}
        onPlay={() => console.log('Audio play event')}
        onPause={() => console.log('Audio pause event')}
        onError={(e) => console.error('Audio element error:', e)}
      />

      <div className="h-screen mx-auto px-6">
        {/* Header */}
        <div className="text-center max-h-[9rem] py-8">
          <div className="flex items-center justify-center gap-4 mb-2">
            <h1 className={`${
              isDarkMode ? 'text-gray-100' : 'text-gray-900'
            }`}>
              St<span>u</span>dy B<span>u</span>ddy
            </h1>
            
          </div>
          <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
            Ask me any query you have
          </p>
        </div>

        {/* Audio Mode - Original Implementation */}
        {isAudioMode && (
          <div className="flex flex-col lg:flex-row gap-12 items-center justify-center mx-auto">
            <div className="space-y-8 flex flex-col items-center justify-center">
              
              {/* 3D Visualizer */}
              <div className="flex items-center w-3xl max-w-3xl justify-center mb-12">
                <div className="w-96 h-80 rounded-full overflow-hidden bottom-4">
                  <Spline
                    scene="https://prod.spline.design/P4Ddg18XE6gwewn8/scene.splinecode"
                    className="w-96! h-96!"
                    onLoad={(spline) => {
                      spline.setBackgroundColor(isDarkMode ? "#111827" : "#f4f4f9");
                      setSplineApplication(spline);
                    }}
                  />
                </div>
              </div>

              {/* Current Transcript */}
              <div className={`border rounded-3xl w-3xl max-w-3xl py-4 px-6 min-h-[80px] flex items-center shadow-lg transition-colors duration-300 ${
                isDarkMode 
                  ? 'bg-gray-800 border-gray-700 shadow-gray-900/20' 
                  : 'bg-white border-gray-200 shadow-gray-50/20'
              }`}>
                <div className="w-full">
                  {transcript || interimTranscript || currentResponseText ? (
                    <div className="space-y-4">
                      {transcript && (
                        <div className="flex items-start gap-3">
                          {/* <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            isDarkMode ? 'bg-blue-900' : 'bg-blue-50'
                          }`}>
                            <User className="h-4 w-4 text-blue-600" />
                          </div> */}
                          <div className="flex-1">
                            <p className={`leading-relaxed ${
                              isDarkMode ? 'text-gray-300' : 'text-gray-600'
                            }`}>
                              {transcript}
                            </p>
                          </div>
                        </div>
                      )}
                      {currentResponseText && (
                        <div className="flex items-center gap-3 justify-center">
                          <div className={`w-8 h-8 border rounded-full flex items-center justify-center flex-shrink-0 shadow-xs`}>
                            <img src={isDarkMode? "/logo-dark.png": "/logo.png"} className="size-8" />
                          </div>
                          <div className="flex-1">
                            {/* <p className={`leading-relaxed ${
                              isDarkMode ? 'text-gray-300' : 'text-gray-600'
                            }`}> */}
                              <ReactMarkdown>
                                {currentResponseText.replace(/^Say [^:]*:\s*"?|"?$/g, '')}
                              </ReactMarkdown>
                            {/* </p> */}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-2 overflow-visible">
                      <div className={`h-16 w-16 items-center justify-center flex mb-2 mx-auto border p-4 rounded-full overflow-visible ${
                        isDarkMode 
                          ? 'bg-gray-700 border-gray-600' 
                          : 'bg-gray-50 border-gray-300'
                      }`}>
                        <AudioLines className={isDarkMode ? 'text-gray-200' : 'text-gray-800'} />
                      </div> 
                      <p className={`${
                        isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        {isMonitoring 
                          ? "Listening... start speaking to begin"
                          : "Click the microphone to start"
                        }
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Processing State */}
              {(isLoading || isProcessing) && (
                <div className={`border rounded-3xl w-3xl max-w-3xl py-4 px-6 shadow-lg transition-colors duration-300 ${
                  isDarkMode 
                    ? 'bg-gray-800 border-gray-700 shadow-gray-900/20' 
                    : 'bg-white border-gray-200 shadow-gray-50/20'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                    }`}>
                      <Bot className={`h-4 w-4 ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-600'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full animate-pulse ${
                          isDarkMode ? 'bg-gray-500' : 'bg-gray-400'
                        }`}></div>
                        <div className={`w-2 h-2 rounded-full animate-pulse delay-150 ${
                          isDarkMode ? 'bg-gray-500' : 'bg-gray-400'
                        }`}></div>
                        <div className={`w-2 h-2 rounded-full animate-pulse delay-300 ${
                          isDarkMode ? 'bg-gray-500' : 'bg-gray-400'
                        }`}></div>
                        <span className={`ml-2 ${
                          isDarkMode ? 'text-gray-300' : 'text-gray-600'
                        }`}>
                          {isProcessing ? 'Processing...' : 'Thinking...'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Main Controls */}
              <div className={`border rounded-3xl w-3xl max-w-3xl py-4 px-6 shadow-lg transition-colors duration-300 ${
                isDarkMode 
                  ? 'bg-gray-800 border-gray-700 shadow-gray-900/20' 
                  : 'bg-white border-gray-200 shadow-gray-50/20'
              }`}>
                <div className="flex items-center justify-center gap-4">
                  
                  {/* Mute Toggle */}
                  <div className='flex flex-1/3 items-center justify-center'>
                    <button
                      type="button"
                      onClick={() => setIsMuted(!isMuted)}
                      className={`w-12 h-12 rounded-full transition-all duration-200 flex items-center justify-center ${
                        isMuted 
                          ? 'bg-red-100 hover:bg-red-200 text-red-600' 
                          : isDarkMode
                            ? 'bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-300'
                            : 'bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700'
                      }`}
                      title={isMuted ? 'Unmute' : 'Mute'}
                    >
                      {isMuted ? (
                        <VolumeX className="h-5 w-5" />
                      ) : (
                        <Volume2 className="h-5 w-5" />
                      )}
                    </button>
                  </div>

                  {/* Main Voice Button */}
                  <div className='flex flex-1/3 items-center justify-center'>
                    <button
                      type="button"
                      onClick={handleVoiceToggle}
                      disabled={isProcessing}
                      className={`w-16 h-16 rounded-[100%] overflow-clip transition-all duration-200 disabled:opacity-50 flex items-center justify-center ${
                        isMonitoring 
                          ? 'bg-green-100 hover:bg-green-200 text-green-700 ring-2 ring-green-200' 
                          : isDarkMode
                            ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                            : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                      }`}
                      title={isMonitoring ? 'Stop monitoring' : 'Start monitoring'}
                    >
                      {isMonitoring ? (
                        <Mic className="h-7 w-7" />
                      ) : (
                        <MicOff className="h-7 w-7" />
                      )}
                    </button>
                  </div>

                  {/* Switch to Text Mode */}
                  <div className="flex flex-1/3 items-center justify-center">
                    <button
                      onClick={() => setIsAudioMode(false)}
                      className={`w-12 h-12 rounded-full border transition-all duration-200 flex items-center justify-center ${
                        isDarkMode 
                          ? 'bg-gray-700 hover:bg-gray-600 border-gray-600 text-gray-300' 
                          : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700'
                      }`}
                      title="Switch to text mode"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                
                {/* Instructions */}
                <div className="mt-4 text-center">
                  <p className={`text-sm ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    {isMonitoring 
                      ? "Voice monitoring active - speak naturally"
                      : "Click the microphone to start listening"
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Text Mode */}
        {!isAudioMode && (
          <div className="h-[calc(100vh-9rem)] w-full mx-auto flex flex-col">
            {/* Messages Area */}
            <div className={`overflow-y-auto w-full ${messages.length == 0? "": "sm:px-16"} max-w-5xl flex flex-col py-6 mx-auto space-y-4 ${
              messages.length === 0 ? '' : 'grow'
            }`}>
              {messages.length === 0 ? (
                <div className="flex-1 flex items-center justify-center min-h-[50vh]">
                  <div className="text-center w-full max-w-2xl">
                    <h1 className={`text-7xl mb-8 mt-64 flex justify-center ${
                      isDarkMode ? 'text-white *:text-white' : 'text-gray-900 *:text-gray-900'
                    }`}>
                      Welc<span>o</span>me&nbsp;
                      {user != null? `, ${user.name}` : "back"}
                    </h1>
                    
                    {/* Centered Input Area for empty state */}
                    <div className="mb-6">
                      <div className="flex gap-3 items-center">
                        <div className="flex-1">
                          <textarea
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Type your message..."
                            className={`w-full resize-none rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:border-transparent transition-colors duration-200 ${
                              isDarkMode 
                                ? 'bg-gray-700 text-gray-100 placeholder-gray-400 focus:ring-gray-500' 
                                : 'bg-white text-gray-900 placeholder-gray-500 focus:ring-gray-900 border border-gray-200'
                            }`}
                            rows={1}
                            style={{ minHeight: '44px', maxHeight: '120px' }}
                          />
                        </div>
                        <button
                          onClick={handleSendMessage}
                          disabled={!inputValue.trim() || isTyping || isWaitingForResponse}
                          title="Send message"
                          className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                            isDarkMode 
                              ? 'bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-400 text-white' 
                              : 'bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white'
                          }`}
                        >
                          <Send className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => setIsAudioMode(true)}
                          title="Switch to audio mode"
                          className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                            isDarkMode 
                              ? 'bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white' 
                              : 'bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white'
                          }`}
                        >
                          <AudioLines className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Suggested Messages for empty state */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-xl mx-auto">
                      {[
                        // "What can you help me with?",
                        "Can you explain Newton's Laws of Motion in simpler terms?",
                        "Give me some practice questions on World War II history.",
                        "What are the most important formulas I need to know for calculating derivatives?",
                        "What are some effective strategies for memorizing medical terminology?"
                      ].map((suggestion, index) => (
                        <div key={suggestion}>
                        <button
                          key={index}
                          onClick={() => handleSuggestedMessage(suggestion)}
                          disabled={isTyping || isWaitingForResponse}
                          className={`py-3 px-5 rounded-xl text-sm transition-colors text-left ${
                            isDarkMode 
                              ? 'bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:opacity-50 text-gray-300 border border-gray-700' 
                              : 'bg-gray-50 hover:bg-gray-100 disabled:bg-gray-100 disabled:opacity-50 text-gray-700 border border-gray-200'
                          }`}
                        >
                          {suggestion}
                        </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${
                        message.type === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {message.type === 'bot' && (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-xs`}>
                          <img src="/logo.png" className="size-8" />
                        </div>
                      )}
                      <div
                        className={`max-w-[90%] flex px-4 py-2 rounded-2xl ${
                          message.type === 'user'
                            ? isDarkMode
                              ? 'bg-blue-900 text-gray-200 justify-end'
                              : 'bg-[#0041] text-gray-700 justify-end'
                            : isDarkMode
                              ? 'bg-transparent text-gray-300 justify-start'
                              : 'bg-transparent text-gray-700/90 justify-start'
                        }`}
                      >
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                      {/* {message.type === 'user' && (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isDarkMode 
                            ? 'bg-blue-900' 
                            : 'bg-blue-50 border border-blue-100'
                        }`}>
                          <User className="h-4 w-4 text-blue-600" />
                        </div>
                      )} */}
                    </div>
                  ))}
                  
                  {/* Retry Button */}
                  {showRetryButton && retryMessage && (
                    <div className="flex justify-start">
                      <div className="ml-11">
                        <button
                          onClick={handleRetryMessage}
                          disabled={isTyping || isWaitingForResponse}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                            isDarkMode 
                              ? 'bg-red-800 hover:bg-red-700 disabled:bg-red-900 disabled:opacity-50 text-red-200' 
                              : 'bg-red-100 hover:bg-red-200 disabled:bg-red-50 disabled:opacity-50 text-red-700'
                          }`}
                        >
                          {isTyping || isWaitingForResponse ? (
                            <>
                              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                              Retrying...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              Retry Message
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {/* Typing indicator */}
                  {(isTyping || isWaitingForResponse) && (
                    <div className="flex gap-3 justify-start">
                      <div className={`w-8 h-8 border rounded-full flex items-center justify-center flex-shrink-0 shadow-xs`}>
                        <img src={isDarkMode? "/logo-dark.png": "/logo.png"} className="size-8" />
                      </div>
                      <div className={`px-4 py-2 rounded-2xl max-w-xs ${
                        isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
                      }`}>
                        <div className="flex items-center gap-1">
                          <div className={`w-2 h-2 rounded-full animate-pulse ${
                            isDarkMode ? 'bg-gray-500' : 'bg-gray-400'
                          }`}></div>
                          <div className={`w-2 h-2 rounded-full animate-pulse delay-150 ${
                            isDarkMode ? 'bg-gray-500' : 'bg-gray-400'
                          }`}></div>
                          <div className={`w-2 h-2 rounded-full animate-pulse delay-300 ${
                            isDarkMode ? 'bg-gray-500' : 'bg-gray-400'
                          }`}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
              
              <div ref={messagesEndRef} />
            </div>
            
            {/* Input Area - Only shown when messages exist */}
            {messages.length > 0 && (
              <div className="px-4 pb-4 pt-4 min-h-fit w-full max-w-5xl mx-auto">
                <div className="flex gap-3 items-center mb-4">
                  <div className="flex-1">
                    <textarea
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Type your message..."
                      className={`w-full resize-none rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:border-transparent transition-colors duration-200 ${
                        isDarkMode 
                          ? 'bg-gray-700 text-gray-100 placeholder-gray-400 focus:ring-gray-500' 
                          : 'bg-white text-gray-900 placeholder-gray-500 focus:ring-gray-900'
                      }`}
                      rows={1}
                      style={{ minHeight: '44px', maxHeight: '120px' }}
                    />
                  </div>
                  <button
                    onClick={handleSendMessage}
                    disabled={!inputValue.trim() || isTyping || isWaitingForResponse}
                    title="Send message"
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                      isDarkMode 
                        ? 'bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-400 text-white' 
                        : 'bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white'
                    }`}
                  >
                    <Send className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setIsAudioMode(true)}
                    title="Switch to audio mode"
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                      isDarkMode 
                        ? 'bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white' 
                        : 'bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white'
                    }`}
                  >
                    <AudioLines className="h-5 w-5" />
                  </button>
                </div>
                
                {/* Suggested Messages for conversation state */}
                {/* <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    "Continue this topic",
                    "Ask a follow-up question",
                    "Change subject"
                  ].map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => handleSuggestedMessage(suggestion)}
                      disabled={isTyping || isWaitingForResponse}
                      className={`px-3 py-2 rounded-lg text-xs transition-colors ${
                        isDarkMode 
                          ? 'bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:opacity-50 text-gray-400 border border-gray-700' 
                          : 'bg-gray-100 hover:bg-gray-200 disabled:bg-gray-100 disabled:opacity-50 text-gray-600 border border-gray-200'
                      }`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div> */}
              </div>
            )}
          </div>
        )}

        {/* Logout floating action button (FAB) */}
        <div className="fixed bottom-4 right-4 z-50">
          <button
            onClick={handleLogout}
            disabled={isLoggingOut || isLoading}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg shadow-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
              isDarkMode 
                ? 'bg-gray-800 border-gray-700 hover:bg-gray-700 active:bg-gray-600 shadow-gray-900/50' 
                : 'bg-white border-gray-200 hover:bg-gray-50 active:bg-gray-100 shadow-gray-200/50'
            }`}
            title="Logout"
          >
            <LogOut
              size={16} 
              className={`${
                isDarkMode ? 'text-gray-300' : 'text-gray-600'
              } ${isLoggingOut ? 'animate-spin' : ''}`}
            />
            <span className={`text-sm font-medium ${
              isDarkMode ? 'text-gray-200' : 'text-gray-700'
            }`}>
              {isLoggingOut ? 'Logging out...' : 'Logout'}
            </span>
          </button>
        </div>

        {/* Theme toggle button */}
        <button
          onClick={toggleTheme}
          className={`fixed top-4 right-4 z-50 p-4 rounded-full transition-colors duration-200 ${
            isDarkMode 
              ? 'bg-gray-800 hover:bg-gray-700 text-yellow-400' 
              : 'bg-white hover:bg-gray-50 border border-gray-200 text-gray-700'
          }`}
          title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDarkMode ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
}
