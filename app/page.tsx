"use client"

import { useState, useEffect, useRef } from 'react';
import { Mic, Volume2, VolumeX, MicOff, MessageCircle, User, Bot } from 'lucide-react';
import Spline from '@splinetool/react-spline';
import { useSpeech } from '../hooks/useSpeech';
import { useAudio } from '../hooks/useAudio';
import "../app/globals.css";

export default function AudioChatPage() {
  const [isMuted, setIsMuted] = useState(false);
  const [userInteractionPrompt, setUserInteractionPrompt] = useState(true);
  // const [currentPlaying, setCurrentPlaying] = useState<string | null>(null);
  // const [isPlaying, setIsPlaying] = useState(false);
  // const [isMutedState, setIsMutedState] = useState(false);
  // const [isLooped, setIsLooped] = useState(false);
  // const [messages, setMessages] = useState([]);
  const splineRef = useRef<HTMLDivElement>(null);
  
  const {
    // isRecording,
    isProcessing,
    transcript,
    interimTranscript,
    // isListening,
    startRecording,
    stopRecording,
    // error,
    vadActive,
    vadConfidence,
    microphoneActive,
    isMonitoring,
    // currentChatId,
    // isSavingToDatabase,
    // clearError,
    // startNewConversation,
    // getChatMessages,
    isConnectedToSupabase,
    isLoading,
    // fetchResponseUrl,
    // currentMessageId,
    currentResponseUrl,
    currentResponseText,
  } = useSpeech();

  const { audioAmplitude, playAudio, hasUserInteracted } = useAudio(isMuted);

  useEffect(() => {
    if (currentResponseUrl && !isMuted && hasUserInteracted) {
      const audio = document.getElementById('audio') as HTMLAudioElement;
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
    if (splineRef.current) {
      const splineInstance = (splineRef.current as any).spline;
      if (splineInstance && splineInstance.setVariable) {
        splineInstance.setVariable('scale', audioAmplitude);
      }
    }
  }, [audioAmplitude]);

  useEffect(() => {
    const audio = document.getElementById('audio') as HTMLAudioElement;
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
        <div className="bg-[#eeeef3] border border-[#d8d8dc] shadow-lg shadow-[#d4d4d8]/20 p-12 rounded-xl text-center max-w-md">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Volume2 className="h-8 w-8 text-gray-600" />
          </div>
          <h2 className="text-xl font-medium mb-3 text-gray-900">Enable Audio</h2>
          <p className="text-gray-600 mb-8 leading-relaxed">
            Allow audio playback to hear voice responses from the assistant.
          </p>
          <button
            onClick={handleInitialInteraction}
            className="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-lg font-medium transition-colors"
          >
            Enable Audio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f4f9] text-gray-900">
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
        onEnded={() => {
          // setCurrentPlaying(null);
          // setIsPlaying(false);
        }}
        onError={(e) => console.error('Audio element error:', e)}
      />

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-medium text-gray-900 mb-2">Study Buddy</h1>
          <p className="text-gray-600">Ask me any query you have</p>
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          
          {/* Left Column - Conversation */}
          <div className="space-y-6">
            
            {/* Current Transcript */}
            <div className="bg-[#eeeef3] border border-[#d8d8dc] shadow-lg shadow-[#d4d4d8]/20 rounded-xl p-6 min-h-[120px] flex items-center">
              <div className="w-full">
                {transcript || interimTranscript || currentResponseText ? (
                  <div className="space-y-4">
                    {transcript && (
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <User className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-600 leading-relaxed">{transcript}</p>
                        </div>
                      </div>
                    )}
                    {interimTranscript && (
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <User className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-500 italic leading-relaxed">{interimTranscript}</p>
                        </div>
                      </div>
                    )}
                    {currentResponseText && (
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-green-100 border border-green-600 shadow-xs shadow-green-700/10 rounded-full flex items-center justify-center flex-shrink-0">
                          <Bot className="h-4 w-4 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-600 leading-relaxed">
                            {currentResponseText.replace(/^Say [^:]*:\s*"?|"?$/g, '')}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <MessageCircle className="h-8 w-8 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500">
                      {isMonitoring 
                        ? "Listening... start speaking to begin"
                        : "Click the microphone to start"
                      }
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Status and Error Messages */}
            {/* {error && (
              <div className="bg-red-50 border border-red-200 shadow-gray-300/20 shadow-lg rounded-lg p-4">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )} */}

            {/* Processing State */}
            {(isLoading || isProcessing) && (
              <div className="bg-[#eeeef3] border border-[#d8d8dc] shadow-lg shadow-[#d4d4d8]/20 rounded-xl p-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                    <Bot className="h-4 w-4 text-gray-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-150"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-300"></div>
                      <span className="text-gray-600 ml-2">
                        {isProcessing ? 'Processing...' : 'Thinking...'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Controls and Visualizer */}
          <div className="space-y-8">
            
            {/* 3D Visualizer */}
            <div className="flex items-center justify-center mb-12">
              <div className="w-96 h-80 rounded-full overflow-hidden bottom-4" ref={splineRef}>
                <Spline
                  scene="https://prod.spline.design/P4Ddg18XE6gwewn8/scene.splinecode"
                  className="w-96! h-96!"
                  onLoad={(spline) => {
                    (splineRef.current as any).spline = spline;
                    spline.setBackgroundColor("#f4f4f9");
                    if (spline.setVariable) {
                      spline.setVariable('scale', audioAmplitude);
                    }
                  }}
                />
              </div>
            </div>

            {/* Status Indicators */}
            <div className="flex flex-wrap gap-2 justify-center">
              {isMonitoring && (
                <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                  <div className={`w-2 h-2 rounded-full ${vadActive ? 'bg-green-500 animate-pulse' : 'bg-green-400'}`}></div>
                  {vadActive ? 'Voice detected' : 'Monitoring'}
                </div>
              )}
              
              {microphoneActive && (
                <div className="flex items-center gap-2 px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                  Recording
                </div>
              )}
            </div>

            {/* Voice Activity Level */}
            {isMonitoring && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>Voice Activity</span>
                  <span>{(vadConfidence * 100).toFixed(0)}%</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-100 rounded-full ${
                      vadActive ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                    style={{ width: `${vadConfidence * 100}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Main Controls */}
            <div className="bg-[#eeeef3] border border-[#d8d8dc] shadow-lg shadow-[#d4d4d8]/20 rounded-xl p-6">
              <div className="flex items-center justify-center gap-4">
                
                {/* Mute Toggle */}
                <button
                  type="button"
                  onClick={() => setIsMuted(!isMuted)}
                  className={`w-12 h-12 rounded-full transition-all duration-200 flex items-center justify-center ${
                    isMuted 
                      ? 'bg-red-100 hover:bg-red-200 text-red-600' 
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                  }`}
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? (
                    <VolumeX className="h-5 w-5" />
                  ) : (
                    <Volume2 className="h-5 w-5" />
                  )}
                </button>

                {/* Main Voice Button */}
                <button
                  type="button"
                  onClick={handleVoiceToggle}
                  disabled={isProcessing}
                  className={`w-16 h-16 rounded-[100%] overflow-clip transition-all duration-200 disabled:opacity-50 flex items-center justify-center ${
                    isMonitoring 
                      ? 'bg-green-100 hover:bg-green-200 text-green-700 ring-2 ring-green-200' 
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

                {/* Connection Status */}
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    isConnectedToSupabase ? 'bg-green-500' : 'bg-red-500'
                  }`}></div>
                  <span className="text-sm text-gray-600">
                    {isConnectedToSupabase ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
              </div>
              
              {/* Instructions */}
              <div className="mt-4 text-center">
                <p className="text-sm text-gray-600">
                  {isMonitoring 
                    ? "Voice monitoring active - speak naturally"
                    : "Click the microphone to start listening"
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}