// Compatibility wrapper for the upstream Node preview implementation.
// Cloudflare fetch performs authenticated WebSocket handshakes on the server.
import { EventEmitter } from 'node:events';
export default class WebSocket extends EventEmitter {
  static OPEN = 1;
  static CONNECTING = 0;
  constructor(url, options = {}) {
    super(); this.readyState = 0; this.bufferedAmount = 0;
    void this.connect(url, options);
  }
  async connect(url, options) {
    try {
      const response = await fetch(url.replace(/^wss:/, 'https:'), { headers: { ...options.headers, Upgrade: 'websocket' }, signal: AbortSignal.timeout(options.handshakeTimeout || 12000) });
      if (!response.webSocket) throw new Error('WebSocket upgrade rejected');
      if (this.readyState === 3) { response.webSocket.accept(); response.webSocket.close(); return; }
      this.socket = response.webSocket; this.socket.accept(); this.readyState = 1;
      this.socket.addEventListener('message', event => {
        const data = typeof event.data === 'string' ? Buffer.from(event.data) : Buffer.from(event.data);
        if (data.length > (options.maxPayload || 2_000_000)) { this.emit('error', new Error('Payload too large')); this.close(); return; }
        this.emit('message', data);
      });
      this.socket.addEventListener('close', () => { this.readyState = 3; this.emit('close'); });
      this.socket.addEventListener('error', error => this.emit('error', error));
      this.emit('open');
    } catch (error) { this.readyState = 3; this.emit('error', error); }
  }
  send(data) { if (this.readyState === 1) this.socket.send(data); }
  close() { this.readyState = 3; this.socket?.close(); }
  terminate() { this.close(); }
}
export class WebSocketServer { constructor() { throw new Error('Use the native Cloudflare WebSocket gateway'); } }
