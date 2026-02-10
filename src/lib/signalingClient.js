export class SignalingClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.shouldReconnect = true;
    this.retryCount = 0;
    this.emitter = new EventTarget();
  }

  connect() {
    if (this.ws) return;
    this.shouldReconnect = true;
    this.openSocket();
  }

  openSocket() {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    this.emit('status', { status: 'connecting' });

    ws.onopen = () => {
      this.retryCount = 0;
      this.emit('status', { status: 'open' });
      this.emit('open');
    };

    ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    ws.onclose = () => {
      this.emit('status', { status: 'closed' });
      this.emit('close');
      this.ws = null;
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };

    ws.onerror = () => {
      this.emit('status', { status: 'error' });
      this.emit('socket-error');
    };
  }

  scheduleReconnect() {
    const delay = Math.min(1000 * 2 ** this.retryCount, 5000);
    this.retryCount += 1;
    setTimeout(() => {
      if (this.shouldReconnect && !this.ws) {
        this.openSocket();
      }
    }, delay);
  }

  handleMessage(data) {
    let payload = null;
    try {
      payload = JSON.parse(data);
    } catch (_err) {
      this.emit('error', { code: 'INVALID_JSON', message: 'Server sent invalid JSON' });
      return;
    }

    if (!payload || typeof payload.type !== 'string') {
      return;
    }

    this.emit('message', payload);
    this.emit(payload.type, payload);
  }

  on(type, handler) {
    const wrapped = (event) => handler(event.detail);
    this.emitter.addEventListener(type, wrapped);
    return () => this.emitter.removeEventListener(type, wrapped);
  }

  emit(type, detail = {}) {
    this.emitter.dispatchEvent(new CustomEvent(type, { detail }));
  }

  close() {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(type, payload = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.ws.send(JSON.stringify({ type, ...payload }));
    return true;
  }

  join(roomId, role, extra = {}) {
    return this.send('join', { roomId, role, ...extra });
  }

  signal(to, data) {
    return this.send('signal', { to, data });
  }
}
