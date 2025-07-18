import { useCallback, useState, useRef, useEffect } from "react";

export const useAudio = (isMuted: boolean) => {
  const [audioAmplitude, setAudioAmplitude] = useState(0.9);
  const [isPlaying, setIsPlaying] = useState(false);
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

 // Updated useAudio hook - only changed functions shown

  const playAudio = useCallback(async (audioUrl: string) => {
    if (!audioUrl || isMuted) return;
      
    try {
      console.log('Playing audio:', audioUrl);
      isInitializingRef.current = true;
      
      // Get the audio element
      const audio = document.getElementById('audio') as HTMLAudioElement;
      if (!audio) {
        console.error('Audio element not found');
        isInitializingRef.current = false;
        return;
      }

      // Reset audio state
      if (!audio.paused) {
        audio.pause();
        audio.currentTime = 0;
      }

      // Set new source
      audio.src = audioUrl;
      audio.loop = false; // Always set to false for single playback
      audio.muted = false; // Ensure not muted
      
      // Create audio context only if it doesn't exist
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      // Resume audio context if suspended
      if (audioContextRef.current?.state === 'suspended') {
        try {
          await audioContextRef.current.resume();
        } catch (error) {
          console.warn('Failed to resume audio context:', error);
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
      
      // Set up event listeners (only once)
      const setupEventListeners = () => {
        audio.onloadstart = () => console.log('Audio loading started');
        audio.oncanplay = () => console.log('Audio can play');
        audio.onplay = () => {
          console.log('Audio started playing');
          setIsPlaying(true);
          updateAmplitude();
        };
        
        audio.onended = () => {
          console.log('Audio ended');
          setIsPlaying(false);
          setAudioAmplitude(0.9);
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
      };

      setupEventListeners();

      // Wait for audio to be ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Audio ready timeout'));
        }, 10000); // Increased timeout
        
        const onCanPlay = () => {
          console.log('Audio ready to play');
          clearTimeout(timeout);
          audio.removeEventListener('canplaythrough', onCanPlay);
          resolve();
        };
        
        if (audio.readyState >= 3) { // HAVE_FUTURE_DATA
          clearTimeout(timeout);
          resolve();
        } else {
          audio.addEventListener('canplaythrough', onCanPlay);
          audio.load(); // Force load
        }
      });
      
      // Attempt to play
      try {
        console.log('Attempting to play audio...');
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
          await playPromise;
          console.log('Audio playing successfully');
        }
      } catch (playError) {
        console.error('Audio play failed:', playError);
        
        // Fallback: try to play without waiting
        try {
          audio.play();
        } catch (fallbackError) {
          console.error('Fallback play also failed:', fallbackError);
        }
        
        setIsPlaying(false);
        setAudioAmplitude(0.9);
      }
      
      isInitializingRef.current = false;
    } catch (err) {
      console.error('Error in playAudio:', err);
      setIsPlaying(false);
      setAudioAmplitude(0.9);
      isInitializingRef.current = false;
    }
  }, [isMuted]);

  return { audioAmplitude, playAudio, hasUserInteracted };
};