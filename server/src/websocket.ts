///server/src/websocket.ts
import { WebSocketServer, WebSocket } from 'ws';
import { getDb } from './db.js';

interface Client {
  ws: WebSocket;
  sessionId?: string;
  participantId?: string;
}

const clients = new Map<WebSocket, Client>();
const sessionSubscriptions = new Map<string, Set<WebSocket>>();

export function setupWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws) => {
    clients.set(ws, { ws });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(ws, message);
      } catch (e) {
        console.error('Invalid WebSocket message:', e);
      }
    });

    ws.on('close', () => {
      const client = clients.get(ws);
      if (client?.sessionId) {
        const subs = sessionSubscriptions.get(client.sessionId);
        if (subs) {
          subs.delete(ws);
          if (subs.size === 0) {
            sessionSubscriptions.delete(client.sessionId);
          }
        }
      }
      clients.delete(ws);
    });
  });
}

function handleMessage(ws: WebSocket, message: any) {
  const client = clients.get(ws);
  if (!client) return;

  switch (message.type) {
    case 'subscribe':
      if (message.sessionId && message.participantId) {
        // Verify participant belongs to this session
        try {
          const db = getDb();
          const valid = db.prepare(
            'SELECT 1 FROM session_participants WHERE id = ? AND session_id = ?'
          ).get(message.participantId, message.sessionId);
          if (!valid) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid session or participant' }));
            break;
          }
        } catch (e) {
          ws.send(JSON.stringify({ type: 'error', message: 'Subscription validation failed' }));
          break;
        }

        client.sessionId = message.sessionId;
        client.participantId = message.participantId;

        if (!sessionSubscriptions.has(message.sessionId)) {
          sessionSubscriptions.set(message.sessionId, new Set());
        }
        sessionSubscriptions.get(message.sessionId)!.add(ws);

        ws.send(JSON.stringify({ type: 'subscribed', sessionId: message.sessionId }));
      }
      break;

    case 'unsubscribe':
      if (client.sessionId) {
        const subs = sessionSubscriptions.get(client.sessionId);
        if (subs) {
          subs.delete(ws);
        }
        client.sessionId = undefined;
        client.participantId = undefined;
      }
      break;
  }
}

export function broadcastToSession(sessionId: string, event: string, data: any, excludeWs?: WebSocket) {
  const subs = sessionSubscriptions.get(sessionId);
  if (!subs) return;

  const message = JSON.stringify({ type: 'event', event, data });
  
  subs.forEach((ws) => {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

export function broadcastToAll(event: string, data: any) {
  const message = JSON.stringify({ type: 'event', event, data });
  
  clients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  });
}