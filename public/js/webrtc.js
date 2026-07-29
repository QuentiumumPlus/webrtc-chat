class WebRTCManager {
  constructor(socket) {
    this.socket = socket;
    this.peers = new Map();
    this.localStream = null;
    this.dataChannels = new Map();
    this.onMessage = null;
    this.onFile = null;
    this.onCall = null;
    this.onCallEnd = null;
    this.onSignal = null;
  }

  createPeerConnection(peerId) {
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    };

    const peer = new RTCPeerConnection(config);
    this.peers.set(peerId, peer);

    peer.onicecandidate = (event) => {
      if (event.candidate && this.onSignal) {
        this.onSignal(peerId, 'ice-candidate', {
          candidate: event.candidate
        });
      }
    };

    peer.ontrack = (event) => {
      const remoteVideo = document.getElementById('remote-video');
      if (remoteVideo && event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
      }
    };

    peer.ondatachannel = (event) => {
      this.setupDataChannel(peerId, event.channel);
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') {
        this.endCall(peerId);
      }
    };

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        peer.addTrack(track, this.localStream);
      });
    }

    const dataChannel = peer.createDataChannel('chat', {
      ordered: true
    });
    this.setupDataChannel(peerId, dataChannel);

    return peer;
  }

  setupDataChannel(peerId, channel) {
    channel.onopen = () => {
      console.log(`Data channel opened with ${peerId}`);
      this.dataChannels.set(peerId, channel);
    };

    channel.onclose = () => {
      console.log(`Data channel closed with ${peerId}`);
      this.dataChannels.delete(peerId);
    };

    channel.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'message' && this.onMessage) {
        this.onMessage(data);
      } else if (data.type === 'file' && this.onFile) {
        this.onFile(data);
      }
    };

    if (channel.readyState === 'open') {
      this.dataChannels.set(peerId, channel);
    }
  }

  sendMessage(peerId, message) {
    const channel = this.dataChannels.get(peerId);
    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify({
        type: 'message',
        content: message,
        timestamp: Date.now()
      }));
      return true;
    }
    return false;
  }

  sendFile(peerId, fileInfo) {
    const channel = this.dataChannels.get(peerId);
    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify({
        type: 'file',
        ...fileInfo
      }));
      return true;
    }
    return false;
  }

  async getLocalStream(audio = true, video = false) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio,
        video
      });

      const localVideo = document.getElementById('local-video');
      if (localVideo && video) {
        localVideo.srcObject = this.localStream;
      }

      this.peers.forEach((peer) => {
        this.localStream.getTracks().forEach(track => {
          peer.addTrack(track, this.localStream);
        });
      });

      return this.localStream;
    } catch (error) {
      console.error('Error getting local stream:', error);
      throw error;
    }
  }

  toggleAudio() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return audioTrack.enabled;
      }
    }
    return false;
  }

  toggleVideo() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        return videoTrack.enabled;
      }
    }
    return false;
  }

  endCall(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.close();
      this.peers.delete(peerId);
    }

    this.dataChannels.delete(peerId);

    if (this.peers.size === 0) {
      this.stopLocalStream();
    }

    if (this.onCallEnd) {
      this.onCallEnd({ peerId });
    }
  }

  stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;

      const localVideo = document.getElementById('local-video');
      const remoteVideo = document.getElementById('remote-video');
      if (localVideo) localVideo.srcObject = null;
      if (remoteVideo) remoteVideo.srcObject = null;
    }
  }

  endAllCalls() {
    this.peers.forEach((peer, peerId) => {
      peer.close();
    });
    this.peers.clear();
    this.dataChannels.clear();
    this.stopLocalStream();
  }
}

window.WebRTCManager = WebRTCManager;
