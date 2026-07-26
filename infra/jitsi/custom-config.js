// Appended after the generated config.js (see /etc/cont-init.d/10-config in
// jitsi/web). The image's template hardcodes https://+wss:// for the XMPP
// endpoints, which breaks the plain-HTTP localhost setup — localhost is a
// secure browser context, so http/ws are fine here and nobody has to accept
// a self-signed certificate.
config.bosh = 'http://localhost:8000/http-bind';
config.websocket = 'ws://localhost:8000/xmpp-websocket';

// The image's default codec order puts AV1 first: Firefox fails the whole
// negotiation on it (ICE failed, no video either way), and VP9-first in turn
// broke Firefox→Safari (older Safari can't decode VP9). VP8 is the one
// codec every browser both encodes and decodes, so it goes first; quality
// is a non-goal in the dev stack.
config.videoQuality = config.videoQuality || {};
config.videoQuality.codecPreferenceOrder = ['VP8', 'H264', 'VP9'];
// P2P mode is one more moving part that misbehaves between Safari and
// Firefox (the call drops the moment the second participant joins), so
// every call goes through the JVB instead. But direct UDP to the JVB is
// the Rancher/Lima trap: STUN checks pass while media silently dies, so
// browsers must be forced onto the coturn TCP relay — the only verified
// media path in this dev setup.
config.forceTurnRelay = true;
// The bridge's SSRC rewriting is the last Firefox breaker: with it on,
// media from the JVB never renders in Firefox (fine in Chromium).
config.flags = Object.assign({}, config.flags, { ssrcRewritingEnabled: false });
config.p2p = config.p2p || {};
config.p2p.enabled = false;
config.p2p.codecPreferenceOrder = ['VP8', 'H264', 'VP9'];
