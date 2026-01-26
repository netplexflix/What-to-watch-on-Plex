// File: server/src/routes/sessions.ts
import { Router } from 'express';
import { getDb, generateId } from '../db.js';
import { broadcastToSession } from '../websocket.js';

const router = Router();

function generateSessionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Create session
router.post('/create', (req, res) => {
  try {
    const { mediaType, displayName, isGuest, plexToken } = req.body;
    
    const db = getDb();
    
    // Generate unique code
    let code = generateSessionCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = db.prepare('SELECT id FROM sessions WHERE code = ?').get(code);
      if (!existing) break;
      code = generateSessionCode();
      attempts++;
    }
    
    const sessionId = generateId();
    const participantId = generateId();
    
    // Create session with empty preferences JSON
    db.prepare(`
      INSERT INTO sessions (id, code, status, media_type, preferences, created_at, updated_at)
      VALUES (?, ?, 'waiting', ?, '{}', datetime('now'), datetime('now'))
    `).run(sessionId, code, mediaType || 'both');
    
    // Add host as first participant
    db.prepare(`
      INSERT INTO session_participants (id, session_id, display_name, is_guest, plex_token, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(participantId, sessionId, displayName, isGuest ? 1 : 0, plexToken || null);
    
    // Update session with host ID
    db.prepare('UPDATE sessions SET host_user_id = ? WHERE id = ?').run(participantId, sessionId);
    
    res.json({
      session: { id: sessionId, code },
      participant: { id: participantId },
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Get session by code
router.get('/code/:code', (req, res) => {
  try {
    const { code } = req.params;
    const db = getDb();
    
    const session = db.prepare('SELECT * FROM sessions WHERE code = ?').get(code.toUpperCase()) as any;
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Parse preferences JSON
    let preferences = {};
    if (session.preferences) {
      try {
        preferences = JSON.parse(session.preferences);
      } catch (e) {
        preferences = {};
      }
    }
    
    res.json({ 
      session: {
        ...session,
        preferences
      }
    });
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// Get session by ID
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any;
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Parse preferences JSON
    let preferences = {};
    if (session.preferences) {
      try {
        preferences = JSON.parse(session.preferences);
      } catch (e) {
        preferences = {};
      }
    }
    
    res.json({ 
      session: {
        ...session,
        preferences
      }
    });
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// Update session
router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const db = getDb();
    
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.winner_item_key !== undefined) {
      fields.push('winner_item_key = ?');
      values.push(updates.winner_item_key);
    }
    if (updates.preferences !== undefined) {
      fields.push('preferences = ?');
      // Merge with existing preferences
      const existing = db.prepare('SELECT preferences FROM sessions WHERE id = ?').get(id) as any;
      let existingPrefs = {};
      if (existing?.preferences) {
        try {
          existingPrefs = JSON.parse(existing.preferences);
        } catch (e) {
          existingPrefs = {};
        }
      }
      const mergedPrefs = { ...existingPrefs, ...updates.preferences };
      values.push(JSON.stringify(mergedPrefs));
    }
    
    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(id);
      
      db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      
      // Broadcast update to all participants
      broadcastToSession(id, 'session_updated', updates);
    }
    
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any;
    
    // Parse preferences for response
    let preferences = {};
    if (session?.preferences) {
      try {
        preferences = JSON.parse(session.preferences);
      } catch (e) {
        preferences = {};
      }
    }
    
    res.json({ 
      session: session ? {
        ...session,
        preferences
      } : null 
    });
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// Join session
router.post('/:id/join', (req, res) => {
  try {
    const { id } = req.params;
    const { displayName, isGuest, plexToken } = req.body;
    
    const db = getDb();
    
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const participantId = generateId();
    
    db.prepare(`
      INSERT INTO session_participants (id, session_id, display_name, is_guest, plex_token, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(participantId, id, displayName, isGuest ? 1 : 0, plexToken || null);
    
    const participant = db.prepare('SELECT * FROM session_participants WHERE id = ?').get(participantId);
    
    // Broadcast new participant
    broadcastToSession(id, 'participant_joined', { participant });
    
    res.json({ participant });
  } catch (error) {
    console.error('Error joining session:', error);
    res.status(500).json({ error: 'Failed to join session' });
  }
});

// Get participants
router.get('/:id/participants', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    
    const participants = db.prepare('SELECT * FROM session_participants WHERE session_id = ?').all(id);
    
    // Parse preferences JSON
    const parsed = participants.map((p: any) => ({
      ...p,
      preferences: p.preferences ? JSON.parse(p.preferences) : null,
      is_guest: !!p.is_guest,
      questions_completed: !!p.questions_completed,
    }));
    
    res.json({ participants: parsed });
  } catch (error) {
    console.error('Error getting participants:', error);
    res.status(500).json({ error: 'Failed to get participants' });
  }
});

// Update participant
router.patch('/participants/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const db = getDb();
    
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.preferences !== undefined) {
      fields.push('preferences = ?');
      values.push(JSON.stringify(updates.preferences));
    }
    if (updates.questions_completed !== undefined) {
      fields.push('questions_completed = ?');
      values.push(updates.questions_completed ? 1 : 0);
    }
    if (updates.display_name !== undefined) {
      fields.push('display_name = ?');
      values.push(updates.display_name);
    }
    
    if (fields.length > 0) {
      values.push(id);
      db.prepare(`UPDATE session_participants SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      
      // Get session ID for broadcast
      const participant = db.prepare('SELECT * FROM session_participants WHERE id = ?').get(id) as any;
      if (participant) {
        broadcastToSession(participant.session_id, 'participant_updated', {
          participantId: id,
          ...updates,
        });
      }
    }
    
    const participant = db.prepare('SELECT * FROM session_participants WHERE id = ?').get(id) as any;
    res.json({
      participant: participant ? {
        ...participant,
        preferences: participant.preferences ? JSON.parse(participant.preferences) : null,
        is_guest: !!participant.is_guest,
        questions_completed: !!participant.questions_completed,
      } : null,
    });
  } catch (error) {
    console.error('Error updating participant:', error);
    res.status(500).json({ error: 'Failed to update participant' });
  }
});

// Add vote - with automatic match detection
router.post('/:id/votes', (req, res) => {
  try {
    const { id } = req.params;
    const { participantId, itemKey, vote } = req.body;
    
    const db = getDb();
    const voteId = generateId();
    
    // Insert the vote
    db.prepare(`
      INSERT INTO votes (id, session_id, participant_id, item_key, vote, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(voteId, id, participantId, itemKey, vote ? 1 : 0);
    
    // Broadcast vote to other participants
    broadcastToSession(id, 'vote_added', { participantId, itemKey, vote });
    
    // Check for match if this was a YES vote
    if (vote) {
      const matchResult = checkForMatchServer(db, id, itemKey);
      if (matchResult.isMatch) {
        console.log(`[Sessions] Match found for item ${itemKey} in session ${id}`);
        
        // Update session with winner
        db.prepare(`
          UPDATE sessions SET winner_item_key = ?, status = 'completed', updated_at = datetime('now')
          WHERE id = ?
        `).run(itemKey, id);
        
        // Broadcast match to all participants
        broadcastToSession(id, 'session_updated', { 
          winner_item_key: itemKey, 
          status: 'completed' 
        });
        
        return res.json({ success: true, voteId, match: true, winnerItemKey: itemKey });
      }
    }
    
    res.json({ success: true, voteId, match: false });
  } catch (error) {
    console.error('Error adding vote:', error);
    res.status(500).json({ error: 'Failed to add vote' });
  }
});

// Server-side match detection
function checkForMatchServer(db: any, sessionId: string, itemKey: string): { isMatch: boolean } {
  // Get all participants
  const participants = db.prepare('SELECT id FROM session_participants WHERE session_id = ?').all(sessionId);
  const totalParticipants = participants.length;
  
  if (totalParticipants === 0) {
    return { isMatch: false };
  }
  
  // Count YES votes for this specific item
  const yesVotes = db.prepare(`
    SELECT COUNT(DISTINCT participant_id) as count 
    FROM votes 
    WHERE session_id = ? AND item_key = ? AND vote = 1
  `).get(sessionId, itemKey) as { count: number };
  
  console.log(`[Sessions] Match check: ${yesVotes.count}/${totalParticipants} YES votes for item ${itemKey}`);
  
  return { isMatch: yesVotes.count === totalParticipants };
}

// Get votes
router.get('/:id/votes', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    
    const votes = db.prepare('SELECT * FROM votes WHERE session_id = ?').all(id);
    
    res.json({
      votes: votes.map((v: any) => ({
        ...v,
        vote: !!v.vote,
      })),
    });
  } catch (error) {
    console.error('Error getting votes:', error);
    res.status(500).json({ error: 'Failed to get votes' });
  }
});

// Delete vote
router.delete('/:sessionId/votes/:participantId/:itemKey', (req, res) => {
  try {
    const { sessionId, participantId, itemKey } = req.params;
    const db = getDb();
    
    db.prepare(
      'DELETE FROM votes WHERE session_id = ? AND participant_id = ? AND item_key = ?'
    ).run(sessionId, participantId, itemKey);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting vote:', error);
    res.status(500).json({ error: 'Failed to delete vote' });
  }
});

// Get app config (for session settings)
router.get('/config/:key', (req, res) => {
  try {
    const { key } = req.params;
    const db = getDb();
    
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(key) as { value: string } | undefined;
    
    res.json({ value: row ? JSON.parse(row.value) : null });
  } catch (error) {
    console.error('Error getting config:', error);
    res.status(500).json({ error: 'Failed to get config' });
  }
});

// Get media items from cache
router.get('/cache/media', (req, res) => {
  try {
    const { mediaType } = req.query;
    const db = getDb();
    
    // Get plex config for library keys
    const configRow = db.prepare('SELECT value FROM app_config WHERE key = ?').get('plex') as { value: string } | undefined;
    if (!configRow) {
      return res.json({ items: [] });
    }
    
    const config = JSON.parse(configRow.value);
    const sortedLibraryKeys = [...(config.libraries || [])].sort().join(',');
    
    const cacheType = mediaType === 'movies' ? 'movies' : mediaType === 'shows' ? 'shows' : 'both';
    
    const cached = db.prepare(
      'SELECT items FROM media_items_cache WHERE library_keys = ? AND media_type = ?'
    ).get(sortedLibraryKeys, cacheType) as { items: string } | undefined;
    
    if (cached?.items) {
      const items = JSON.parse(cached.items);
      console.log(`[Sessions] Returning ${items.length} cached items for type: ${cacheType}`);
      return res.json({ items });
    }
    
    res.json({ items: [] });
  } catch (error) {
    console.error('Error getting cached media:', error);
    res.status(500).json({ error: 'Failed to get cached media' });
  }
});

export { router as sessionRoutes };