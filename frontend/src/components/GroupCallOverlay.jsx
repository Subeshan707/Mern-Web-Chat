import { useEffect, useRef, useState } from "react";

export default function GroupCallOverlay({
  callState, // 'incoming' | 'outgoing' | 'connected' | null
  callType,
  groupName,
  callerName,
  participants, // [{ userId, username, profilePicture, stream }]
  localStream,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onToggleVideo,
  socketBaseUrl,
}) {
  const localVideoRef = useRef(null);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(callType === "audio");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (callState !== "connected") {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [callState]);

  if (!callState) return null;

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="call-overlay group-call-overlay">
      <div className="call-overlay-bg" />

      <div className="call-overlay-content">
        <div className="call-info">
          <h2 className="call-peer-name">{groupName}</h2>
          <p className="call-status-text">
            {callState === "incoming" && `${callerName} started a ${callType} call`}
            {callState === "outgoing" && "Starting group call..."}
            {callState === "connected" && `${formatTime(elapsed)} • ${(participants?.length || 0) + 1} participants`}
          </p>
        </div>

        {/* Participant grid */}
        {callState === "connected" && (
          <div className={`group-call-grid grid-${Math.min((participants?.length || 0) + 1, 6)}`}>
            {/* Local */}
            <div className="group-call-tile">
              {callType === "video" && !videoOff ? (
                <video ref={localVideoRef} autoPlay playsInline muted className="group-call-video" />
              ) : (
                <div className="group-call-avatar-tile">
                  <span>You</span>
                </div>
              )}
              <span className="group-call-name">You{muted ? " 🔇" : ""}</span>
            </div>

            {/* Remote participants */}
            {(participants || []).map((p) => (
              <GroupCallTile key={p.userId} participant={p} callType={callType} socketBaseUrl={socketBaseUrl} />
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="call-controls">
          {callState === "incoming" && (
            <>
              <button className="call-btn call-btn-accept" onClick={onAccept} title="Join">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="#fff">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                </svg>
              </button>
              <button className="call-btn call-btn-reject" onClick={onReject} title="Decline">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="#fff">
                  <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
                </svg>
              </button>
            </>
          )}

          {(callState === "outgoing" || callState === "connected") && (
            <>
              <button
                className={`call-btn call-btn-mute ${muted ? "active" : ""}`}
                onClick={() => { setMuted(onToggleMute()); }}
                title={muted ? "Unmute" : "Mute"}
              >
                <svg viewBox="0 0 24 24" width="24" height="24" fill="#fff">
                  {muted ? (
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                  ) : (
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                  )}
                </svg>
              </button>

              {callType === "video" && (
                <button
                  className={`call-btn call-btn-video ${videoOff ? "active" : ""}`}
                  onClick={() => { setVideoOff(onToggleVideo()); }}
                  title={videoOff ? "Turn on camera" : "Turn off camera"}
                >
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="#fff">
                    {videoOff ? (
                      <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/>
                    ) : (
                      <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                    )}
                  </svg>
                </button>
              )}

              <button className="call-btn call-btn-end" onClick={onEnd} title="Leave call">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="#fff">
                  <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupCallTile({ participant, callType, socketBaseUrl }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  const avatarUrl = participant.profilePicture
    ? `${socketBaseUrl}${participant.profilePicture}`
    : `https://placehold.co/80x80/202c33/aebac1?text=${(participant.username?.[0] || "?").toUpperCase()}`;

  return (
    <div className="group-call-tile">
      {callType === "video" && participant.stream ? (
        <video ref={videoRef} autoPlay playsInline className="group-call-video" />
      ) : (
        <div className="group-call-avatar-tile">
          <img src={avatarUrl} alt={participant.username} />
        </div>
      )}
      <span className="group-call-name">{participant.username}</span>
    </div>
  );
}
