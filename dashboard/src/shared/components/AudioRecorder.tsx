import { useEffect, useRef, useState } from "react";
import { MicIcon, PauseIcon, PlayIcon, StopIcon, WarningIcon } from "../../components/icons";

interface AudioRecorderProps {
  onRecordingComplete: (audioFile: File, durationSeconds: number) => void;
  disabled?: boolean;
}

export function AudioRecorder({ onRecordingComplete, disabled }: AudioRecorderProps) {
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "paused">("idle");
  const [duration, setDuration] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const formatDuration = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

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
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const ext = mimeType.includes("webm") ? "webm" : "ogg";
        const filename = `classroom_lecture_${new Date().toISOString().slice(0, 10)}_${Date.now()}.${ext}`;
        const file = new File([audioBlob], filename, { type: mimeType });
        onRecordingComplete(file, duration);
        // Stop stream tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(250);
      setRecordingState("recording");
      startTimeRef.current = Date.now();
      setDuration(0);

      timerRef.current = window.setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch {
      setError("Microphone access denied or unavailable. Please enable microphone permissions in your browser.");
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.pause();
      setRecordingState("paused");
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
      mediaRecorderRef.current.resume();
      setRecordingState("recording");
      timerRef.current = window.setInterval(() => {
        setDuration((prev) => prev + 1);
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
              Start Classroom Recording
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
    </div>
  );
}
