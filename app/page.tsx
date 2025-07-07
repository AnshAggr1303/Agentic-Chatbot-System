// components/AudioChatPage.tsx
import { useState, useEffect, useRef } from 'react';
import { Mic, Volume2, VolumeX } from 'lucide-react';
import Spline from '@splinetool/react-spline';
import { useSpeech } from '../hooks/useSpeech';
import { useAudioAmplitude } from '../hooks/useAudioAmplitude';
import "../app/globals.css";

export default function AudioChatPage() {
  const [isMuted, setIsMuted] = useState(false);
  const splineRef = useRef<HTMLDivElement>(null);
  
  const {
    isRecording,
    audioMessages,
    isProcessing,
    transcript,
    interimTranscript,
    isListening,
    startRecording,
    stopRecording,
    error
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
        
        {/* Transcript Display */}
        <div className="mb-8 min-h-[120px] flex items-center justify-center">
          <div className="w-full max-w-2xl">
            {(isListening || transcript || interimTranscript) && (
              <div className="bg-black/20 backdrop-blur-sm rounded-lg p-6 border border-white/10">
                <div className="text-center">
                  {isListening && (
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="text-sm text-gray-300">Listening...</span>
                    </div>
                  )}
                  
                  <div className="text-lg text-white leading-relaxed min-h-[60px] flex items-center justify-center">
                    {transcript && <span className="mr-1">{transcript}</span>}
                    {interimTranscript && <span className="text-gray-400 italic">{interimTranscript}</span>}
                    {!transcript && !interimTranscript && isListening && (
                      <span className="text-gray-400 italic">Start speaking...</span>
                    )}
                    {!transcript && !interimTranscript && !isListening && (
                      <span className="text-gray-500">Press and hold the microphone to speak</span>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {!isListening && !transcript && !interimTranscript && (
              <div className="text-center">
                <div className="text-gray-400 text-lg">
                  Press and hold the microphone to start speaking
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Audio Controls */}
        <div className="relative">
          <div className="flex items-center justify-center gap-6">
            
            {/* Mute Toggle */}
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className={`w-16 h-16 rounded-full transition-all duration-200 flex items-center justify-center ${
                isMuted 
                  ? 'bg-[#444] hover:bg-[#666]' 
                  : 'bg-[#444] hover:bg-[#666]'
              }`}
            >
              {isMuted ? (
                <VolumeX className="h-6 w-6 text-white" />
              ) : (
                <Volume2 className="h-6 w-6 text-white" />
              )}
            </button>

            {/* Main Recording Button */}
            <button
              type="button"
              onMouseDown={isRecording ? stopRecording : startRecording}
              onMouseUp={isRecording ? stopRecording : undefined}
              onTouchStart={isRecording ? stopRecording : startRecording}
              onTouchEnd={isRecording ? stopRecording : undefined}
              disabled={isProcessing}
              className={`w-16 h-16 rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center ${
                isRecording 
                  ? 'bg-red-500 hover:bg-red-600' 
                  : 'bg-red-500 hover:bg-red-600'
              }`}
            >
              <Mic className="h-6 w-6 text-white" />
            </button>

            {/* Close Button */}
            <button
              type="button"
              className="w-16 h-16 rounded-full bg-[#444] hover:bg-[#666] transition-all duration-200 flex items-center justify-center"
            >
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}