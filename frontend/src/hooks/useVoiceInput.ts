import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceState = "idle" | "recording" | "transcribing";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const SILENCE_THRESHOLD = 5; // 0-128 scale
const SILENCE_DURATION_MS = 1500;

function getAudioMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "audio/webm";
}

function getFileExtension(mimeType: string): string {
  if (mimeType.includes("mp4")) return ".mp4";
  return ".webm";
}

export function useVoiceInput(onResult: (text: string) => void) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const stopAndCleanup = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getAudioMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];

      // --- Silence detection via AudioContext ---
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.fftSize);
      let silenceStart: number | null = null;

      const checkSilence = () => {
        if (recorderRef.current?.state !== "recording") return;

        analyser.getByteTimeDomainData(dataArray);

        // Check if audio is below threshold (silence)
        // Values center around 128; silence means all values are near 128
        let maxDeviation = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const deviation = Math.abs(dataArray[i] - 128);
          if (deviation > maxDeviation) maxDeviation = deviation;
        }

        const isSilent = maxDeviation < SILENCE_THRESHOLD;

        if (isSilent) {
          if (silenceStart === null) {
            silenceStart = performance.now();
          } else if (performance.now() - silenceStart >= SILENCE_DURATION_MS) {
            // Silence exceeded threshold — auto-stop
            recorderRef.current?.stop();
            return;
          }
        } else {
          silenceStart = null;
        }

        rafIdRef.current = requestAnimationFrame(checkSilence);
      };

      rafIdRef.current = requestAnimationFrame(checkSilence);
      // --- End silence detection ---

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Clean up silence detection
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        if (audioCtxRef.current) {
          audioCtxRef.current.close();
          audioCtxRef.current = null;
        }

        const mType = recorder.mimeType || mimeType;
        const blob = new Blob(chunksRef.current, { type: mType });

        // Release mic tracks immediately
        if (streamRef.current) {
          for (const track of streamRef.current.getTracks()) {
            track.stop();
          }
          streamRef.current = null;
        }

        if (blob.size === 0) {
          setVoiceState("idle");
          return;
        }

        setVoiceState("transcribing");
        try {
          const ext = getFileExtension(mType);
          const formData = new FormData();
          formData.append("file", blob, `recording${ext}`);

          const res = await fetch(`${API_URL}/transcribe`, {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const detail = await res.text();
            throw new Error(detail || `Transcription failed (${res.status})`);
          }

          const data = await res.json();
          if (data.text) {
            onResult(data.text);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Transcription failed");
        } finally {
          setVoiceState("idle");
        }
      };

      recorder.start();
      setVoiceState("recording");
    } catch (err) {
      stopAndCleanup();
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Microphone access denied");
      } else {
        setError(
          err instanceof Error ? err.message : "Could not start recording",
        );
      }
      setVoiceState("idle");
    }
  }, [onResult, stopAndCleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAndCleanup();
    };
  }, [stopAndCleanup]);

  return { voiceState, startRecording, error };
}
