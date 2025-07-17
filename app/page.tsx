"use client"

// app/page.tsx

import { useState, useEffect, useRef } from 'react';
import { Mic, Volume2, VolumeX, MicOff, Play, Pause, Download } from 'lucide-react';
import Spline from '@splinetool/react-spline';
import { useSpeech } from '../hooks/useSpeech';
import { useAudioAmplitude } from '../hooks/useAudioAmplitude';
import "../app/globals.css";

export default function AudioChatPage() {
  const [isMuted, setIsMuted] = useState(false);
  const [currentPlaying, setCurrentPlaying] = useState<string | null>(null);
  const splineRef = useRef<HTMLDivElement>(null);
  
  const {
    isRecording,
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
    isLoading,
    fetchResponseUrl,
    currentMessageId,
    currentResponseUrl,
  } = useSpeech();
  
  const { audioAmplitude, playAudioWithAmplitude } = useAudioAmplitude(isMuted);

  useEffect(() => {
    if (splineRef.current) {
      const splineInstance = (splineRef.current as any).spline;
      if (splineInstance && splineInstance.setVariable) {
        splineInstance.setVariable('scale', audioAmplitude);
      }
    }
  }, [audioAmplitude]);

  const bgColor = "#bbc9d8";

  // Audio playback functions
  const playAudio = (filename: string) => {
    if (currentPlaying) {
      const currentAudio = document.getElementById(currentPlaying) as HTMLAudioElement;
      if (currentAudio) {
        currentAudio.pause();
      }
    }

    const audioElement = document.getElementById(filename) as HTMLAudioElement;
    if (audioElement) {
      audioElement.play();
      setCurrentPlaying(filename);
    }
  };

  const stopAudio = (filename: string) => {
    const audioElement = document.getElementById(filename) as HTMLAudioElement;
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }
    setCurrentPlaying(null);
  };

  return (
    <div className="relative min-h-screen bg-background text-gray-100 overflow-hidden">
      <div className="fixed left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl px-4">
        
        {/* Spline 3D Scene */}
        <div className="flex items-center justify-center mb-12">
          <div className="w-96 h-80 rounded-full overflow-hidden bottom-4" ref={splineRef}>
            <Spline
              scene="https://prod.spline.design/P4Ddg18XE6gwewn8/scene.splinecode"
              className="w-96! h-96!"
              onLoad={(spline) => {
                (splineRef.current as any).spline = spline;
                spline.setBackgroundColor(bgColor);
                if (spline.setVariable) {
                  spline.setVariable('scale', audioAmplitude);
                }
              }}
            />
          </div>
        </div>
        
        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
            <p className="text-red-300 text-center">{error}</p>
          </div>
        )}
        
        {/* Status Indicators */}
        <div className="mb-4 flex items-center justify-center gap-4">
          {isMonitoring && (
            <div className="flex items-center gap-2 px-3 py-1 bg-green-500/20 rounded-full">
              <div className={`w-2 h-2 rounded-full ${vadActive ? 'bg-green-400 animate-pulse' : 'bg-green-600'}`}></div>
              <span className="text-sm text-green-400">
                {vadActive ? 'Voice detected' : 'Monitoring...'}
              </span>
            </div>
          )}
          
          {microphoneActive && (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-500/20 rounded-full">
              <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></div>
              <span className="text-sm text-red-400">Recording...</span>
            </div>
          )}
          
          {isListening && (
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/20 rounded-full">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
              <span className="text-sm text-blue-400">Listening...</span>
            </div>
          )}
          
          {isProcessing && (
            <div className="flex items-center gap-2 px-3 py-1 bg-yellow-500/20 rounded-full">
              <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></div>
              <span className="text-sm text-yellow-400">Processing...</span>
            </div>
          )}
        </div>
        
        {/* VAD Confidence Display */}
        {isMonitoring && (
          <div className="mb-4 flex items-center justify-center">
            <div className="w-64 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-100 ${
                  vadActive ? 'bg-green-500' : 'bg-gray-500'
                }`}
                style={{ width: `${vadConfidence * 100}%` }}
              ></div>
            </div>
            <span className="ml-2 text-sm text-gray-400">
              {(vadConfidence * 100).toFixed(0)}%
            </span>
          </div>
        )}
        
        {/* Transcript Display */}
        <div className="mb-8 min-h-[120px] flex items-center justify-center">
          <div className="w-full max-w-2xl">
            <div className="bg-black/20 backdrop-blur-sm rounded-lg p-6 border border-white/10">
              <div className="text-center">
                <div className="text-lg text-white leading-relaxed min-h-[60px] flex items-center justify-center">
                  {transcript && <span className="mr-1">{transcript}</span>}
                  {interimTranscript && <span className="text-gray-400 italic">{interimTranscript}</span>}
                  {!transcript && !interimTranscript && isMonitoring && !vadActive && (
                    <span className="text-gray-400 italic">
                      Ready to listen... Say something to start recording
                    </span>
                  )}
                  {!transcript && !interimTranscript && vadActive && (
                    <span className="text-green-400 italic">
                      Voice detected, processing...
                    </span>
                  )}
                  {!transcript && !interimTranscript && !isMonitoring && (
                    <span className="text-gray-500">
                      Click the mic button to start voice monitoring
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Loading */}
        {isLoading && (
          <div className="mb-6 flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-sm text-gray-400">Thinking...</span>
          </div>
        )}
        
        {/* Controls */}
        <div className="relative">
          <div className="flex items-center justify-center gap-6">
            
            {/* Mute Toggle */}
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className={`w-16 h-16 rounded-full transition-all duration-200 flex items-center justify-center ${
                isMuted 
                  ? 'bg-red-600 hover:bg-red-700' 
                  : 'bg-gray-600 hover:bg-gray-700'
              }`}
            >
              {isMuted ? (
                <VolumeX className="h-6 w-6 text-white" />
              ) : (
                <Volume2 className="h-6 w-6 text-white" />
              )}
            </button>

            {/* Voice Assistant Toggle */}
            <button
              type="button"
              onClick={isMonitoring ? stopRecording : startRecording}
              disabled={isProcessing}
              className={`w-20 h-20 rounded-full transition-all duration-200 disabled:opacity-50 flex items-center justify-center ${
                isMonitoring 
                  ? 'bg-green-600 hover:bg-green-700 ring-2 ring-green-400' 
                  : 'bg-gray-600 hover:bg-gray-700'
              } ${microphoneActive ? 'animate-pulse' : ''}`}
            >
              {isMonitoring ? (
                <Mic className={`h-8 w-8 text-white ${vadActive ? 'animate-pulse' : ''}`} />
              ) : (
                <MicOff className="h-8 w-8 text-white" />
              )}
            </button>

            {/* Status Text */}
            <div className="text-sm text-gray-400 max-w-32 text-center">
              {isMonitoring ? (
                <div>
                  <div className="font-medium">Voice Active</div>
                  <div className="text-xs">
                    {microphoneActive ? 'Recording...' : 'Waiting...'}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="font-medium">Voice Off</div>
                  <div className="text-xs">Click to start</div>
                </div>
              )}
            </div>
          </div>
          
          {/* Instructions */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              {isMonitoring 
                ? "Speak naturally - recording will start and stop automatically"
                : "Click the microphone to enable voice monitoring"
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}