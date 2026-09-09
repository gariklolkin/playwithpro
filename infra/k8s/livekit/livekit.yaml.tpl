# LiveKit production config template. Rendered by infra/scripts/apply-secrets.sh
# with envsubst from ~/.playwithpro-prod.env into Secret `livekit-config`
# (key livekit.yaml) — the api key/secret pair must match the api's, and one
# source file guarantees that.
port: 7880
keys:
  ${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}
rtc:
  # Single muxed UDP port (one ufw rule) + ICE over TCP as first fallback.
  udp_port: 7882
  tcp_port: 7881
  use_external_ip: false
  node_ip: ${LIVEKIT_NODE_IP}
room:
  auto_create: true
  # A session room is exactly the two parties.
  max_participants: 2
  empty_timeout: 300
  departure_timeout: 20
turn:
  # Embedded TURN replaces coturn. TLS cert comes from the cert-manager
  # Secret of the meet.play-with.pro ingress (mounted read-only); LiveKit
  # reads it at start, so restart the Deployment after a renewal.
  enabled: true
  domain: ${LIVEKIT_TURN_DOMAIN}
  udp_port: 3478
  tls_port: 5349
  cert_file: /etc/livekit-tls/tls.crt
  key_file: /etc/livekit-tls/tls.key
webhook:
  api_key: ${LIVEKIT_API_KEY}
  urls:
    - http://api:4000/livekit/webhook
logging:
  level: info
