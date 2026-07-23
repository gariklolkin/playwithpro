// Appended after the generated config.js (see /etc/cont-init.d/10-config in
// jitsi/web). The image's template hardcodes https://+wss:// for the XMPP
// endpoints, which breaks the plain-HTTP localhost setup — localhost is a
// secure browser context, so http/ws are fine here and nobody has to accept
// a self-signed certificate.
config.bosh = 'http://localhost:8000/http-bind';
config.websocket = 'ws://localhost:8000/xmpp-websocket';
