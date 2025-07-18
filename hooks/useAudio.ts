import { useCallback, useState, useRef, useEffect } from "react";

export const useAudio = (isMuted: boolean) => {
  const [audioAmplitude, setAudioAmplitude] = useState(0.9);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooped, setIsLooped] = useState(true);
  const [isMutedState, setIsMutedState] = useState(true);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  
  // Store audio context and source to prevent recreation
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const isInitializingRef = useRef(false);

  // Track user interaction for autoplay policy compliance
  useEffect(() => {
    const handleUserInteraction = () => {
      setHasUserInteracted(true);
      // Remove listeners after first interaction
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
    };

    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('keydown', handleUserInteraction);
    document.addEventListener('touchstart', handleUserInteraction);

    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
    };
  }, []);

  useEffect(() => {
    if (hasUserInteracted && !isMuted) {
      // Audio context setup can be done here if needed
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
    }
  }, [hasUserInteracted, isMuted]);

  const playAudio = useCallback(async (audioUrl: string) => {
  if (!audioUrl || isMuted) return;
    
    try {
      isInitializingRef.current = true;
      // Get the audio element
      const audio = document.getElementById('audio') as HTMLAudioElement;
      if (!audio) {
        console.error('Audio element not found');
        isInitializingRef.current = false;
        return;
      }

      audio.src = audioUrl;
      audio.loop = isLooped;

      if (!audio.paused) {
        audio.pause();
        audio.currentTime = 0;
      }
      
      // Create audio context only if it doesn't exist
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      if (audioContextRef.current?.state === 'suspended') {
        try {
          await audioContextRef.current.resume();
        } catch (error) {
          console.warn('Failed to resume audio context:', error);
          isInitializingRef.current = false;
          return;
        }
      }
      
      // Create source node only if it doesn't exist
      if (!sourceNodeRef.current) {
        sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audio);
        analyserRef.current = audioContextRef.current.createAnalyser();
        
        sourceNodeRef.current.connect(analyserRef.current);
        analyserRef.current.connect(audioContextRef.current.destination);
        
        analyserRef.current.fftSize = 256;
      }
      
      const bufferLength = analyserRef.current!.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      // Animation loop for amplitude tracking
      const updateAmplitude = () => {
        if (!isPlaying) return;
        
        analyserRef.current!.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
        const normalizedAmplitude = average / 255;
        const scale = 0.9 + (normalizedAmplitude * 0.25);
        
        setAudioAmplitude(scale);
        animationRef.current = requestAnimationFrame(updateAmplitude);
      };
      
      if (!audio.onplay) {
        audio.onplay = () => {
          setIsPlaying(true);
          setIsMutedState(false);
          updateAmplitude();
        }
      
        audio.onended = () => {
          setIsPlaying(false);
          setAudioAmplitude(0.9);
          setIsMutedState(true);
          setIsLooped(true);
          if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
          }
        };

        audio.onerror = (error) => {
          console.error('Audio playback error:', error);
          setIsPlaying(false);
          setAudioAmplitude(0.9);
          isInitializingRef.current = false;
        };
      }

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Audio ready timeout'));
        }, 5000);
        
        const onCanPlay = () => {
          clearTimeout(timeout);
          audio.removeEventListener('canplay', onCanPlay);
          resolve();
        };
        
        if (audio.readyState >= 3) { // HAVE_FUTURE_DATA
          clearTimeout(timeout);
          resolve();
        } else {
          audio.addEventListener('canplay', onCanPlay);
        }
      });
      
      try {
        await audio.play();

      } catch (playError) {
        console.error('Audio play failed:', playError);
        setIsPlaying(false);
        setAudioAmplitude(0.9);
      }
    }catch (err) {
      console.error('Error playing audio:', err);
      setIsPlaying(false);
      setAudioAmplitude(0.9);
      isInitializingRef.current = false;
    }
  }, [isMuted, isPlaying]);

  return { audioAmplitude, playAudio, isPlaying, isLooped, isMutedState, hasUserInteracted };
};