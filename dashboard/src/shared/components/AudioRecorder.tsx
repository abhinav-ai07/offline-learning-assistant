import { useEffect, useRef, useState } from "react";
import { getStoredToken } from "../../api";
import type { DemoLine } from "../../types";
import { MicIcon, PauseIcon, PlayIcon, StopIcon, WarningIcon } from "../../components/icons";
import { LiveTranscriptBox } from "./LiveTranscriptBox";

interface AudioRecorderProps {
  onRecordingComplete: (audioFile: File, durationSeconds: number, liveLines?: DemoLine[]) => void;
  disabled?: boolean;
}

function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  const targetRate = 16000;
  if (inputRate === targetRate) return input;
  const ratio = inputRate / targetRate;
  const newLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += input[j];
    }
    out[i] = sum / (end - start);
  }
  return out;
}

export function AudioRecorder({ onRecordingComplete, disabled }: AudioRecorderProps) {
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "paused">("idle");
  const [duration, setDuration] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<string>("");
  const [liveFinals, setLiveFinals] = useState<DemoLine[]>([]);
  const [livePartial, setLivePartial] = useState<string>("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const pausedRef = useRef<boolean>(false);
  const durationRef = useRef<number>(0);
  const finalsRef = useRef<DemoLine[]>([]);
  const pendingFileRef = useRef<File | null>(null);
  const finalizeTimerRef = useRef<number | null>(null);

  const cleanupAudioPipeline = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (finalizeTimerRef.current) clearTimeout(finalizeTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      cleanupAudioPipeline();
      wsRef.current?.close();
    };
  }, []);

  const formatDuration = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const finishWithFile = (file: File) => {
    if (finalizeTimerRef.current) {
      clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
    pendingFileRef.current = null;
    onRecordingComplete(file, durationRef.current, [...finalsRef.current]);
  };

  const startRecording = async () => {
    setError(null);
    setLiveFinals([]);
    finalsRef.current = [];
    setLivePartial("");
    setLiveStatus("Connecting live ASR...");
    pausedRef.current = false;
    pendingFileRef.current = null;

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      audioChunksRef.current = [];

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const token = getStoredToken();
      const query = token ? `?token=${encodeURIComponent(token)}` : "";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/live-mic${query}`);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "status" && msg.stage === "loading_model") {
            setLiveStatus("Loading local Whisper...");
          } else if (msg.type === "ready") {
            setLiveStatus("Listening live");
          } else if (msg.type === "caption") {
            if (msg.kind === "partial") {
              setLivePartial(msg.text || "");
            } else if (msg.kind === "final" && msg.text) {
              const line: DemoLine = { text: msg.text, start: msg.start ?? 0, end: msg.end ?? 0 };
              finalsRef.current = [...finalsRef.current, line];
              setLiveFinals(finalsRef.current);
              setLivePartial("");
            }
          } else if (msg.type === "done") {
            setLivePartial("");
            setLiveStatus("Live transcript ready");
            if (pendingFileRef.current) {
              finishWithFile(pendingFileRef.current);
            }
          } else if (msg.type === "error") {
            setLiveStatus("Live ASR fallback");
          }
        } catch {
          // Ignore malformed frame
        }
      };

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      let audioCtx: AudioContext;
      try {
        audioCtx = new AudioCtx({ sampleRate: 16000 });
      } catch {
        audioCtx = new AudioCtx();
      }
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      audioCtxRef.current = audioCtx;
      const sourceNode = audioCtx.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;
      const bufferSize = audioCtx.sampleRate <= 24000 ? 2048 : 4096;
      const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (pausedRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          return;
        }
        const channel = e.inputBuffer.getChannelData(0);
        const pcm16k = downsampleTo16k(channel, audioCtx.sampleRate);
        wsRef.current.send(pcm16k.buffer);
      };
      // Route through a muted GainNode so live mic never echoes back into speakers.
      const muteGain = audioCtx.createGain();
      muteGain.gain.value = 0;
      sourceNode.connect(processor);
      processor.connect(muteGain);
      muteGain.connect(audioCtx.destination);

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        cleanupAudioPipeline();
        stream.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const ext = mimeType.includes("webm") ? "webm" : "ogg";
        const filename = `classroom_lecture_${new Date().toISOString().slice(0, 10)}_${Date.now()}.${ext}`;
        const file = new File([audioBlob], filename, { type: mimeType });

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          pendingFileRef.current = file;
          setLiveStatus("Finalizing transcript...");
          wsRef.current.send(JSON.stringify({ action: "stop" }));
          finalizeTimerRef.current = window.setTimeout(() => {
            if (pendingFileRef.current) {
              finishWithFile(pendingFileRef.current);
            }
          }, 8000);
        } else {
          finishWithFile(file);
        }
      };

      mediaRecorder.start(250);
      setRecordingState("recording");
      durationRef.current = 0;
      setDuration(0);

      timerRef.current = window.setInterval(() => {
        durationRef.current += 1;
        setDuration(durationRef.current);
      }, 1000);
    } catch {
      cleanupAudioPipeline();
      setError("Microphone access denied or unavailable. Please enable microphone permissions in your browser.");
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.pause();
      pausedRef.current = true;
      setRecordingState("paused");
      setLiveStatus("Paused");
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
      mediaRecorderRef.current.resume();
      pausedRef.current = false;
      setRecordingState("recording");
      setLiveStatus("Listening live");
      timerRef.current = window.setInterval(() => {
        durationRef.current += 1;
        setDuration(durationRef.current);
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setRecordingState("idle");
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  return (
    <div className="audio-recorder-container">
      <div className="recorder-consent-banner">
        <WarningIcon width={16} height={16} />
        <span>
          <strong>Classroom Audio Notice:</strong> Audio recording must be conducted with appropriate classroom consent and clear notification to participants.
        </span>
      </div>

      <div className="recorder-status-card">
        <div className="recorder-visualizer">
          <div className={`recording-dot ${recordingState === "recording" ? "pulsing" : recordingState === "paused" ? "paused" : ""}`} />
          {recordingState === "recording" && <span aria-hidden="true" className="audio-bars">{[0,1,2,3,4,5,6].map(i=><i key={i} style={{animationDelay:(i%4)*-.19+"s"}}/>)}</span>}
          <div className="recording-timer">{formatDuration(duration)}</div>
          <span className="recording-state-label">
            {recordingState === "recording" ? "Recording in progress..." : recordingState === "paused" ? "Recording paused" : "Microphone ready"}
          </span>
        </div>

        {error && (
          <div className="form-error-alert" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div className="recorder-controls">
          {recordingState === "idle" && (
            <button
              type="button"
              className="btn btn-primary btn-record"
              onClick={startRecording}
              disabled={disabled}
            >
              <MicIcon width={18} height={18} />
              Start Live Recording
            </button>
          )}

          {recordingState === "recording" && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={pauseRecording}
              >
                <PauseIcon width={16} height={16} />
                Pause
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={stopRecording}
              >
                <StopIcon width={16} height={16} />
                Stop &amp; Save Audio
              </button>
            </>
          )}

          {recordingState === "paused" && (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={resumeRecording}
              >
                <PlayIcon width={16} height={16} />
                Resume
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={stopRecording}
              >
                <StopIcon width={16} height={16} />
                Stop &amp; Save Audio
              </button>
            </>
          )}
        </div>
      </div>

      {(recordingState !== "idle" || liveFinals.length > 0 || livePartial) && (
        <div style={{ marginTop: 16 }}>
          <LiveTranscriptBox
            finals={liveFinals}
            partial={livePartial}
            active={recordingState === "recording"}
            statusLabel={liveStatus || undefined}
            emptyText="Speak into your microphone — live captions will appear here in real time."
          />
        </div>
      )}
    </div>
  );
}
