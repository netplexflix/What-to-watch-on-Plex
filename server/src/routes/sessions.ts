// Frouter.patch('/:id', (req, res) => {ile: server/src/routes/sessions.ts
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
    console.log('[Sessions] Create request body:', JSON.stringify(req.body));
    
    const { mediaType, displayName, isGuest, plexToken, timedDuration } = req.body;
    
    // Validate required fields
    if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
      console.log('[Sessions] Create failed: Display name is required');
      return res.status(400).json({ error: 'Display name is required' });
    }
    
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
    
    if (attempts >= 10) {
      console.log('[Sessions] Create failed: Could not generate unique code');
      return res.status(500).json({ error: 'Failed to generate unique session code' });
    }
    
    const sessionId = generateId();
    const participantId = generateId();
    
    // Handle timedDuration - convert to number or null
    const duration = timedDuration && typeof timedDuration === 'number' && timedDuration > 0 
      ? timedDuration 
      : null;
    
    console.log('[Sessions] Creating session:', { sessionId, code, mediaType, duration, displayName: displayName.trim() });
    
    // Create session - check if timed_duration column exists
    try {
      db.prepare(`
        INSERT INTO sessions (id, code, status, media_type, preferences, timed_duration, created_at, updated_at)
        VALUES (?, ?, 'waiting', ?, '{}', ?, datetime('now'), datetime('now'))
      `).run(sessionId, code, mediaType || 'both', duration);
    } catch (dbError: any) {
      // If timed_duration column doesn't exist, try without it
      if (dbError.message && dbError.message.includes('timed_duration')) {
        console.log('[Sessions] timed_duration column not found, creating session without it');
        db.prepare(`
          INSERT INTO sessions (id, code, status, media_type, preferences, created_at, updated_at)
          VALUES (?, ?, 'waiting', ?, '{}', datetime('now'), datetime('now'))
        `).run(sessionId, code, mediaType || 'both');
      } else {
        throw dbError;
      }
    }
    
    // Add host as first participant
    db.prepare(`
      INSERT INTO session_participants (id, session_id, display_name, is_guest, plex_token, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(participantId, sessionId, displayName.trim(), isGuest ? 1 : 0, plexToken || null);
    
    // Update session with host ID
    db.prepare('UPDATE sessions SET host_user_id = ? WHERE id = ?').run(participantId, sessionId);
    
    console.log(`[Sessions] Created session ${code} (ID: ${sessionId}) with host ${displayName.trim()}`);
    
    res.json({
      session: { id: sessionId, code },
      participant: { id: participantId },
    });
  } catch (error) {
    console.error('[Sessions] Error creating session:', error);
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
        preferences,
        timed_duration: session.timed_duration || null,
        timer_end_at: session.timer_end_at || null,
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
        preferences,
        timed_duration: session.timed_duration || null,
        timer_end_at: session.timer_end_at || null,
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
    
    // Get current session to check for timed_duration
    const currentSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any;
    
    if (!currentSession) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
      
      // If transitioning to swiping and this is a timed session, set the timer_end_at
      if (updates.status === 'swiping' && currentSession.timed_duration && currentSession.timed_duration > 0) {
        // Only set timer_end_at if it's not already set (prevents resetting on reconnect)
        if (!currentSession.timer_end_at) {
          const endTime = new Date(Date.now() + currentSession.timed_duration * 60 * 1000).toISOString();
          fields.push('timer_end_at = ?');
          values.push(endTime);
          console.log(`[Sessions] Setting timer_end_at to ${endTime} for timed session ${id} (duration: ${currentSession.timed_duration} minutes)`);
        } else {
          console.log(`[Sessions] Timer already set for session ${id}: ${currentSession.timer_end_at}`);
        }
      }
    }
    
    if (updates.winner_item_key !== undefined) {
      fields.push('winner_item_key = ?');
      values.push(updates.winner_item_key);
    }
    if (updates.timer_end_at !== undefined) {
      fields.push('timer_end_at = ?');
      values.push(updates.timer_end_at);
    }
    if (updates.timed_duration !== undefined) {
      fields.push('timed_duration = ?');
      values.push(updates.timed_duration);
    }
    if (updates.preferences !== undefined) {
      fields.push('preferences = ?');
      // Merge with existing preferences
      let existingPrefs = {};
      if (currentSession.preferences) {
        try {
          existingPrefs = JSON.parse(currentSession.preferences);
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
      
      // Get the updated session for broadcasting
      const updatedSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any;
      
      // Build broadcast data - include timer_end_at for timed sessions
      const broadcastData: any = { ...updates };
      if (updatedSession?.timer_end_at) {
        broadcastData.timer_end_at = updatedSession.timer_end_at;
      }
      if (updatedSession?.timed_duration) {
        broadcastData.timed_duration = updatedSession.timed_duration;
      }
      
      // Broadcast update to all participants
      broadcastToSession(id, 'session_updated', broadcastData);
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
        preferences,
        timed_duration: session.timed_duration || null,
        timer_end_at: session.timer_end_at || null,
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
    
    if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
      return res.status(400).json({ error: 'Display name is required' });
    }
    
    const db = getDb();
    
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const participantId = generateId();
    
    db.prepare(`
      INSERT INTO session_participants (id, session_id, display_name, is_guest, plex_token, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(participantId, id, displayName.trim(), isGuest ? 1 : 0, plexToken || null);
    
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
    
    if (!participantId || !itemKey) {
      return res.status(400).json({ error: 'participantId and itemKey are required' });
    }
    
    const db = getDb();
    const voteId = generateId();
    
    // Insert the vote
    db.prepare(`
      INSERT INTO votes (id, session_id, participant_id, item_key, vote, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(voteId, id, participantId, itemKey, vote ? 1 : 0);
    
    // Broadcast vote to other participants
    broadcastToSession(id, 'vote_added', { participantId, itemKey, vote });
    
    // Check session type (timed or not)
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any;
    
    // For timed sessions, don't check for immediate match
    if (session?.timed_duration) {
      return res.json({ success: true, voteId, match: false });
    }
    
    // Check for match if this was a YES vote (non-timed session)
    if (vote) {
      const matchResult = checkForMatchServer(db, id, itemKey);
      if (matchResult.isMatch) {
        console.log(`[Sessions] Match found for item ${itemKey} in session ${id}`);
        
        // Update session with winner
        db.prepare(`
          UPDATE sessions SET winner_item_key = ?, status = 'completed', updated_at = datetime('now')
          WHERE id = ?
        `).run(itemKey, id);
        
        // Record in session history
        recordSessionHistory(db, id, itemKey);
        
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

// Record session in history
function recordSessionHistory(db: any, sessionId: string, winnerItemKey: string | null) {
  try {
    // Check if session_history table exists
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='session_history'"
    ).get();
    
    if (!tableExists) {
      console.log('[Sessions] session_history table does not exist, skipping history recording');
      return;
    }
    
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
    const participants = db.prepare('SELECT display_name FROM session_participants WHERE session_id = ?').all(sessionId) as any[];
    
    if (!session) return;
    
    // Get winner details from cache
    let winnerTitle = null;
    let winnerThumb = null;
    
    if (winnerItemKey) {
      const configRow = db.prepare('SELECT value FROM app_config WHERE key = ?').get('plex') as { value: string } | undefined;
      if (configRow) {
        try {
          const config = JSON.parse(configRow.value);
          const sortedLibraryKeys = [...(config.libraries || [])].sort().join(',');
          const cacheType = session.media_type || 'both';
          
          const cached = db.prepare(
            'SELECT items FROM media_items_cache WHERE library_keys = ? AND media_type = ?'
          ).get(sortedLibraryKeys, cacheType) as { items: string } | undefined;
          
          if (cached?.items) {
            const items = JSON.parse(cached.items);
            const winner = items.find((item: any) => item.ratingKey === winnerItemKey);
            if (winner) {
              winnerTitle = winner.title;
              winnerThumb = winner.thumb;
            }
          }
        } catch (e) {
          console.error('[Sessions] Error getting winner details:', e);
        }
      }
    }
    
    const participantNames = participants.map(p => p.display_name);
    
    db.prepare(`
      INSERT INTO session_history (id, session_code, participants, winner_item_key, winner_title, winner_thumb, media_type, was_timed, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      generateId(),
      session.code,
      JSON.stringify(participantNames),
      winnerItemKey,
      winnerTitle,
      winnerThumb,
      session.media_type,
      session.timed_duration ? 1 : 0
    );
    
    console.log(`[Sessions] Recorded session ${session.code} in history`);
  } catch (error) {
    console.error('[Sessions] Error recording session history:', error);
    // Don't throw - this is not critical
  }
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

// Get matches for timed session
router.get('/:id/matches', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    
    // Get all participants
    const participants = db.prepare('SELECT id FROM session_participants WHERE session_id = ?').all(id) as any[];
    const totalParticipants = participants.length;
    
    if (totalParticipants === 0) {
      return res.json({ matches: [], topLiked: [] });
    }
    
    // Find items that ALL participants liked
    const matchQuery = db.prepare(`
      SELECT item_key, COUNT(DISTINCT participant_id) as like_count
      FROM votes
      WHERE session_id = ? AND vote = 1
      GROUP BY item_key
      HAVING like_count = ?
    `).all(id, totalParticipants) as { item_key: string; like_count: number }[];
    
    const matches = matchQuery.map(m => m.item_key);
    
    // Also get top liked items (for fallback if no matches)
    const topLikedQuery = db.prepare(`
      SELECT item_key, COUNT(DISTINCT participant_id) as like_count
      FROM votes
      WHERE session_id = ? AND vote = 1
      GROUP BY item_key
      ORDER BY like_count DESC
      LIMIT 10
    `).all(id) as { item_key: string; like_count: number }[];
    
    const topLiked = topLikedQuery.map(t => ({ itemKey: t.item_key, likeCount: t.like_count }));
    
    res.json({ matches, topLiked });
  } catch (error) {
    console.error('Error getting matches:', error);
    res.status(500).json({ error: 'Failed to get matches' });
  }
});

// Cast final vote (for timed sessions)
router.post('/:id/final-vote', (req, res) => {
  try {
    const { id } = req.params;
    const { participantId, itemKey } = req.body;
    
    if (!participantId || !itemKey) {
      return res.status(400).json({ error: 'participantId and itemKey are required' });
    }
    
    const db = getDb();
    
    // Check if final_votes table exists
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='final_votes'"
    ).get();
    
    if (!tableExists) {
      return res.status(500).json({ error: 'Final votes feature not available' });
    }
    
    // Upsert final vote
    db.prepare(`
      INSERT INTO final_votes (id, session_id, participant_id, item_key, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(session_id, participant_id) DO UPDATE SET item_key = excluded.item_key, created_at = datetime('now')
    `).run(generateId(), id, participantId, itemKey);
    
    // Broadcast vote update
    broadcastToSession(id, 'final_vote_cast', { participantId, itemKey });
    
    // Check if all participants have voted
    const participants = db.prepare('SELECT id FROM session_participants WHERE session_id = ?').all(id) as any[];
    const finalVotes = db.prepare('SELECT * FROM final_votes WHERE session_id = ?').all(id) as any[];
    
    if (finalVotes.length === participants.length) {
      // All voted - determine winner
      const voteCounts = new Map<string, number>();
      finalVotes.forEach((v: any) => {
        voteCounts.set(v.item_key, (voteCounts.get(v.item_key) || 0) + 1);
      });
      
      // Find max votes
      let maxVotes = 0;
      voteCounts.forEach((count) => {
        if (count > maxVotes) maxVotes = count;
      });
      
      // Get items with max votes
      const topItems: string[] = [];
      voteCounts.forEach((count, itemKey) => {
        if (count === maxVotes) topItems.push(itemKey);
      });
      
      let winner: string;
      let wasTie = false;
      
      if (topItems.length === 1) {
        winner = topItems[0];
      } else {
        // Tie - pick random
        wasTie = true;
        winner = topItems[Math.floor(Math.random() * topItems.length)];
      }
      
      // Update session
      db.prepare(`
        UPDATE sessions SET winner_item_key = ?, status = 'completed', updated_at = datetime('now')
        WHERE id = ?
      `).run(winner, id);
      
      // Record in history
      recordSessionHistory(db, id, winner);
      
      // Broadcast result
      broadcastToSession(id, 'voting_complete', { 
        winner, 
        wasTie, 
        tiedItems: wasTie ? topItems : [],
        voteCounts: Object.fromEntries(voteCounts)
      });
      
      return res.json({ 
        success: true, 
        allVoted: true, 
        winner, 
        wasTie, 
        tiedItems: wasTie ? topItems : [] 
      });
    }
    
    res.json({ success: true, allVoted: false, votedCount: finalVotes.length, totalCount: participants.length });
  } catch (error) {
    console.error('Error casting final vote:', error);
    res.status(500).json({ error: 'Failed to cast vote' });
  }
});

// Get final votes status
router.get('/:id/final-votes', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    
    // Check if final_votes table exists
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='final_votes'"
    ).get();
    
    if (!tableExists) {
      return res.json({ finalVotes: [], votedCount: 0, totalCount: 0, allVoted: false });
    }
    
    const finalVotes = db.prepare('SELECT * FROM final_votes WHERE session_id = ?').all(id);
    const participants = db.prepare('SELECT id FROM session_participants WHERE session_id = ?').all(id);
    
    res.json({ 
      finalVotes,
      votedCount: finalVotes.length,
      totalCount: participants.length,
      allVoted: finalVotes.length === participants.length
    });
  } catch (error) {
    console.error('Error getting final votes:', error);
    res.status(500).json({ error: 'Failed to get final votes' });
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

// Broadcast roulette started event
router.post('/:id/broadcast-roulette', (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`[Sessions] Broadcasting roulette_started for session ${id}`);
    
    // Broadcast to all participants in the session
    broadcastToSession(id, 'roulette_started', {});
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Sessions] Error broadcasting roulette start:', error);
    res.status(500).json({ error: 'Failed to broadcast roulette start' });
  }
});

export { router as sessionRoutes };