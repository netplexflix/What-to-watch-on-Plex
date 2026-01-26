// file: src/lib/websocket.ts
type EventHandler = (data: any) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private participantId: string | null = null;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private connectionPromise: Promise<void> | null = null;
  private connectionResolver: (() => void) | null = null;

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(): Promise<void> {
    // If already connected, return resolved promise
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    // If connection is in progress, return existing promise
    if (this.connectionPromise && this.ws?.readyState === WebSocket.CONNECTING) {
      return this.connectionPromise;
    }

    // Create new connection promise
    this.connectionPromise = new Promise((resolve) => {
      this.connectionResolver = resolve;
    });

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    try {
      this.ws = new WebSocket(wsUrl);
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.connectionResolver?.();
      return this.connectionPromise;
    }

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      
      // Re-subscribe if we have a session
      if (this.sessionId) {
        this.doSubscribe(this.sessionId, this.participantId || undefined);
      }
      
      // Resolve connection promise
      this.connectionResolver?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'event') {
          const eventHandlers = this.handlers.get(message.event);
          if (eventHandlers) {
            eventHandlers.forEach(handler => {
              try {
                handler(message.data);
              } catch (e) {
                console.error('Error in event handler:', e);
              }
            });
          }
        } else if (message.type === 'subscribed') {
          console.log('WebSocket subscribed to session:', message.sessionId);
        }
      } catch (e) {
        console.error('Error parsing WebSocket message:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      // Resolve any pending connection promise
      this.connectionResolver?.();
      this.connectionPromise = null;
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      // Resolve any pending connection promise on error
      this.connectionResolver?.();
    };

    return this.connectionPromise;
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Attempting to reconnect in ${delay}ms...`);
    setTimeout(() => this.connect(), delay);
  }

  private doSubscribe(sessionId: string, participantId?: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        sessionId,
        participantId,
      }));
    }
  }

  async subscribe(sessionId: string, participantId?: string): Promise<void> {
    this.sessionId = sessionId;
    this.participantId = participantId || null;

    // Ensure connection is established before subscribing
    await this.connect();
    this.doSubscribe(sessionId, participantId);
  }

  unsubscribe() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'unsubscribe' }));
    }
    this.sessionId = null;
    this.participantId = null;
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  off(event: string, handler?: EventHandler) {
    if (handler) {
      this.handlers.get(event)?.delete(handler);
    } else {
      this.handlers.delete(event);
    }
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.handlers.clear();
    this.sessionId = null;
    this.participantId = null;
    this.connectionPromise = null;
    this.connectionResolver = null;
  }
}

export const wsClient = new WebSocketClient();