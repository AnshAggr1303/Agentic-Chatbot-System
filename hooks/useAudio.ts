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
    isMuted = false;
    // Remove the early return that was blocking audio
    if (!audioUrl) return;
    
    try {
      setIsPlaying(true);
      
      // Get the audio element
      const audio = document.getElementById('audio') as HTMLAudioElement;
      if (!audio) {
        console.error('Audio element not found');
        return;
      }
      
      // Set the source and configure for single play
      audio.src = audioUrl;
      setIsLooped(false);
      setIsMutedState(isMuted); // Use the passed isMuted state
      audio.load();
      
      // Create audio context only if it doesn't exist
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      // Resume audio context if suspended (required for autoplay)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
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
      
      audio.onplay = () => updateAmplitude();
      audio.onended = () => {
        setIsPlaying(false);
        setAudioAmplitude(0.9);
        setIsMutedState(true);
        setIsLooped(true);
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
      
      // Only play if not muted
      if (!isMuted) {
        await audio.play();
      }
    } catch (err) {
      console.error('Error playing audio:', err);
      setIsPlaying(false);
      setAudioAmplitude(0.9);
    }
  }, [isMuted, isPlaying]);

  return { audioAmplitude, playAudio, isPlaying, isLooped, isMutedState, hasUserInteracted };
};