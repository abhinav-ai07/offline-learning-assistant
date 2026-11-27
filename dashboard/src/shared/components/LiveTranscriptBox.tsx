import { useEffect, useRef } from "react";
import { formatTime } from "../../format";
import type { DemoLine } from "../../types";
import { MicIcon } from "../../components/icons";

interface LiveTranscriptBoxProps {
  finals: DemoLine[];
  partial?: string;
  active?: boolean;
  statusLabel?: string;
  emptyText?: string;
}

export function LiveTranscriptBox({
  finals,
  partial = "",
  active = false,
  statusLabel,
  emptyText = "Spoken sentences will appear here in real time as Whisper transcribes.",
}: LiveTranscriptBoxProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [finals.length, partial]);

  return (
    <div className="live-transcript-box">
      <div className="live-transcript-header">
        <div className="live-transcript-title">
          <MicIcon width={14} height={14} />
          <span>Live Real-Time Transcript</span>
        </div>
        <span className={`badge ${active ? "badge-success" : ""}`}>
          {statusLabel || (active ? "Transcribing live..." : `${finals.length} utterances`)}
        </span>
      </div>

      <div className="live-transcript-scroll" ref={scrollRef}>
        {finals.length === 0 && !partial ? (
          <p className="live-transcript-empty">{emptyText}</p>
        ) : (
          <>
            {finals.map((line, idx) => (
              <div key={idx} className="caption-line">
                <span className="caption-time">{formatTime(line.start ?? 0)}</span>
                <span className="caption-text">{line.text}</span>
              </div>
            ))}
            {partial && (
              <div className="caption-line partial">
                <span className="caption-time">LIVE</span>
                <span className="caption-text">
                  {partial}
                  <span className="live-cursor" aria-hidden="true" />
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
