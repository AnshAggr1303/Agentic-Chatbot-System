// hooks/useAudioAmplitude.ts
import { useState, useCallback } from 'react';

export const useAudioAmplitude = (isMuted: boolean) => {
  const [audioAmplitude, setAudioAmplitude] = useState(0.9);
  const [isPlaying, setIsPlaying] = useState(false);

  const playAudioWithAmplitude = useCallback(async (audioUrl: string) => {
    if (isMuted) return;
    
    try {
      setIsPlaying(true);
      const audio = new Audio(audioUrl);
      
      // Create audio context for amplitude analysis
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = ctx.createMediaElementSource(audio);
      const analyserNode = ctx.createAnalyser();
      
      source.connect(analyserNode);
      analyserNode.connect(ctx.destination);
      
      analyserNode.fftSize = 256;
      const bufferLength = analyserNode.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      // Animation loop for amplitude tracking
      const updateAmplitude = () => {
        if (!isPlaying) return;
        
        analyserNode.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
        const normalizedAmplitude = average / 255;
        const scale = 0.9 + (normalizedAmplitude * 0.25);
        
        setAudioAmplitude(scale);
        requestAnimationFrame(updateAmplitude);
      };
      
      audio.onplay = () => updateAmplitude();
      audio.onended = () => {
        setIsPlaying(false);
        setAudioAmplitude(0.9);
        ctx.close();
      };
      
      await audio.play();
    } catch (err) {
      console.error('Error playing audio:', err);
      setIsPlaying(false);
      setAudioAmplitude(0.9);
    }
  }, [isMuted, isPlaying]);

  return { audioAmplitude, playAudioWithAmplitude, isPlaying };
};