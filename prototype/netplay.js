'use strict';
// ---------- zero-middleware browser-to-browser connection ----------
// A WebRTC DataChannel between two browsers, with no signaling server: the host and guest exchange
// one short text "blob" each (copy-paste, QR code, chat message - whatever), by hand, outside this
// code entirely. A public STUN server is used only to discover each side's reachable address (NAT
// traversal); it never sees or carries any game traffic - once connected, data flows peer to peer.
// (Two sides behind a strict/symmetric NAT with no STUN-discoverable route would need a TURN relay
// instead, which *is* middleware for the data itself - out of scope for this prototype.)
const STUN = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const encodeBlob = obj => btoa(JSON.stringify(obj));
const decodeBlob = blob => JSON.parse(atob(blob.trim()));

// the blob must carry every ICE candidate up front (no live trickle to exchange by hand),
// so we wait for ICE gathering to finish before reading pc.localDescription
function gatherComplete(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    pc.addEventListener('icegatheringstatechange', function onChange() {
      if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', onChange); resolve(); }
    });
  });
}
function wireChannel(ch, handlers) {
  ch.onopen = () => handlers.onOpen?.(ch);
  ch.onclose = () => handlers.onClose?.();
  ch.onmessage = e => handlers.onMessage?.(JSON.parse(e.data));
}

// host: creates the connection and an offer blob to hand to the guest
async function createInvite(handlers = {}) {
  const pc = new RTCPeerConnection(STUN);
  const ch = pc.createDataChannel('stick2-netplay');
  wireChannel(ch, handlers);
  await pc.setLocalDescription(await pc.createOffer());
  await gatherComplete(pc);
  return { pc, ch, inviteBlob: encodeBlob(pc.localDescription) };
}
// host: once the guest sends their answer blob back, this completes the connection
async function acceptAnswer(pc, answerBlob) {
  await pc.setRemoteDescription(decodeBlob(answerBlob));
}
// guest: takes the host's invite blob, creates an answer blob to hand back
async function acceptInvite(inviteBlob, handlers = {}) {
  const pc = new RTCPeerConnection(STUN);
  let ch = null;
  pc.ondatachannel = e => { ch = e.channel; wireChannel(ch, handlers); };
  await pc.setRemoteDescription(decodeBlob(inviteBlob));
  await pc.setLocalDescription(await pc.createAnswer());
  await gatherComplete(pc);
  return { pc, getChannel: () => ch, answerBlob: encodeBlob(pc.localDescription) };
}

if (typeof module !== 'undefined') module.exports = { createInvite, acceptAnswer, acceptInvite, encodeBlob, decodeBlob };
