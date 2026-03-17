import { useRef, useCallback, useEffect } from "react";

const defaultStunServers = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
];

const envStunServers = (import.meta.env.VITE_STUN_URLS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const turnUrls = (import.meta.env.VITE_TURN_URLS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const turnUsername = import.meta.env.VITE_TURN_USERNAME;
const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

const iceServers = [
  ...(envStunServers.length ? envStunServers : defaultStunServers).map((urls) => ({ urls })),
  // Free Open Relay TURN servers for NAT traversal
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  ...(turnUrls.length && turnUsername && turnCredential
    ? [{ urls: turnUrls, username: turnUsername, credential: turnCredential }]
    : []),
];

const ICE_SERVERS = { iceServers };

export function useWebRTC(socketRef) {
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  // Callback ref so we can invoke it whenever we need to push a new remote stream
  const onRemoteStreamCbRef = useRef(null);

  const createPeerConnection = useCallback((onRemoteStream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    onRemoteStreamCbRef.current = onRemoteStream;

    pc.onicecandidate = (e) => {
      if (e.candidate && socketRef.current?._callTarget) {
        socketRef.current.emit("webrtc_ice_candidate", {
          targetId: socketRef.current._callTarget,
          candidate: e.candidate,
        });
      }
    };

    pc.ontrack = (e) => {
      // Prefer the native remote stream from the track event when available.
      const eventStream = e.streams && e.streams[0];
      if (eventStream) {
        remoteStreamRef.current = eventStream;
        onRemoteStreamCbRef.current?.(eventStream);
        return;
      }

      // Fallback for browsers that do not include e.streams.
      const stream = remoteStreamRef.current || new MediaStream();
      if (!stream.getTracks().some((t) => t.id === e.track.id)) {
        stream.addTrack(e.track);
      }
      remoteStreamRef.current = stream;
      onRemoteStreamCbRef.current?.(stream);
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[WebRTC] ICE state:", pc.iceConnectionState);
      if (pc.iceConnectionState === "failed") {
        pc.restartIce();
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("[WebRTC] Connection state:", pc.connectionState);
    };

    pcRef.current = pc;
    return pc;
  }, [socketRef]);

  const getLocalStream = useCallback(async (video = true) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: video ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
      });
      localStreamRef.current = stream;
      return stream;
    } catch (err) {
      console.error("getUserMedia error:", err);
      // Fallback to audio only if video fails
      if (video) {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = audioStream;
        return audioStream;
      }
      throw err;
    }
  }, []);

  // ─── Caller side: prepare local stream + PC, but do NOT send offer yet ───
  const prepareCall = useCallback(async (targetId, video, onRemoteStream) => {
    const stream = await getLocalStream(video);
    const pc = createPeerConnection(onRemoteStream);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    if (socketRef.current) socketRef.current._callTarget = targetId;
    return stream;
  }, [getLocalStream, createPeerConnection, socketRef]);

  // ─── Caller side: send the offer (called only after callee accepts) ───
  const sendOffer = useCallback(async (targetId) => {
    const pc = pcRef.current;
    if (!pc) return;
    if (socketRef.current) socketRef.current._callTarget = targetId;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socketRef.current?.emit("webrtc_offer", { targetId, offer });
  }, [socketRef]);

  // ─── Legacy startCall (kept for backward compat but now calls prepareCall + sendOffer) ───
  const startCall = useCallback(async (targetId, video, onRemoteStream) => {
    const stream = await prepareCall(targetId, video, onRemoteStream);
    await sendOffer(targetId);
    return stream;
  }, [prepareCall, sendOffer]);

  const answerCall = useCallback(async (callerId, offer, video, onRemoteStream) => {
    const stream = await getLocalStream(video);
    const pc = createPeerConnection(onRemoteStream);

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    if (socketRef.current) socketRef.current._callTarget = callerId;

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    // Apply any pending ICE candidates
    for (const c of pendingCandidatesRef.current) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
    pendingCandidatesRef.current = [];

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socketRef.current?.emit("webrtc_answer", { targetId: callerId, answer });

    return stream;
  }, [getLocalStream, createPeerConnection, socketRef]);

  const handleAnswer = useCallback(async (answer) => {
    if (pcRef.current && pcRef.current.signalingState !== "stable") {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));

      for (const c of pendingCandidatesRef.current) {
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)); } catch {}
      }
      pendingCandidatesRef.current = [];
    }
  }, []);

  const handleIceCandidate = useCallback(async (candidate) => {
    if (pcRef.current && pcRef.current.remoteDescription) {
      try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    } else {
      pendingCandidatesRef.current.push(candidate);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return false;
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled; // true = muted
    }
    return false;
  }, []);

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return false;
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return !videoTrack.enabled; // true = video off
    }
    return true;
  }, []);

  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current = null;
    localStreamRef.current = null;
    onRemoteStreamCbRef.current = null;

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    pendingCandidatesRef.current = [];

    if (socketRef.current) delete socketRef.current._callTarget;
  }, [socketRef]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    localStreamRef,
    remoteStreamRef,
    pcRef,
    prepareCall,
    sendOffer,
    startCall,
    answerCall,
    handleAnswer,
    handleIceCandidate,
    toggleMute,
    toggleVideo,
    cleanup,
    getLocalStream,
    createPeerConnection,
  };
}
