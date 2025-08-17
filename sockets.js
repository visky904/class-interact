import { Server } from 'socket.io';
import { Session } from './models.js';
import xss from 'xss';
import { hasProfanity } from './profanity.js';

const clean = (s, n=200) => xss(String(s ?? '').slice(0, n));

export function attachSockets(httpServer, corsOrigins) {
  const io = new Server(httpServer, { cors: { origin: corsOrigins } });

  io.on('connection', (socket) => {
    let roomCode = null;
    const userId = socket.handshake.auth?.userId || socket.id;
    const name = clean(socket.handshake.auth?.name || '');
    const avatar = socket.handshake.auth?.avatar || '';

    // TEACHER creates room
    socket.on('teacher:create', async ({ code, topic }, ack) => {
      try {
        await Session.deleteOne({ code });
        const s = await Session.create({
          code, topic: clean(topic, 140),
          reviews: { scale: 5, style: 'stars', buckets: [0,0,0,0,0] }
        });
        roomCode = code;
        socket.join(code);
        io.to(code).emit('session:state', await Session.findOne({ code }));
        ack?.({ ok: true });
      } catch (e) { ack?.({ ok: false, error: e.message }); }
    });

    socket.on('teacher:end', async ({ code }, ack) => {
      await Session.updateOne({ code }, { $set: { isActive: false, activity: null } });
      io.to(code).emit('session:ended');
      ack?.({ ok: true });
    });

    socket.on('session:setTopic', async ({ code, topic }) => {
      await Session.updateOne({ code }, { $set: { topic: clean(topic, 160) } });
      io.to(code).emit('session:state', await Session.findOne({ code }));
    });

    socket.on('session:setActivity', async ({ code, activity }) => {
      await Session.updateOne({ code }, { $set: { activity } });
      io.to(code).emit('session:state', await Session.findOne({ code }));
    });

    // Lock / Unlock
    socket.on('session:setLocked', async ({ code, locked }) => {
      await Session.updateOne({ code }, { $set: { locked: !!locked } });
      io.to(code).emit('session:locked', { locked: !!locked });
    });

    // STUDENT join
    socket.on('student:join', async ({ code, name: n, avatar: av }, ack) => {
      const s = await Session.findOne({ code, isActive: true });
      if (!s) return ack?.({ ok: false, error: 'invalid or inactive code' });
      if (s.locked && !s.leaderboard.some(p => p.userId === userId)) {
        return ack?.({ ok: false, error: 'locked' });
      }
      roomCode = code;
      socket.join(code);
      // upsert participant
      const idx = s.leaderboard.findIndex(p => p.userId === userId);
      if (idx === -1) s.leaderboard.push({ userId, name: clean(n, 20), avatar: av, xp: 0 });
      else {
        s.leaderboard[idx].name = clean(n, 20);
        s.leaderboard[idx].avatar = av;
      }
      await s.save();
      io.to(socket.id).emit('session:state', s);
      io.to(code).emit('leaderboard:update', s.leaderboard.sort((a,b)=>b.xp-a.xp).slice(0,10));
      ack?.({ ok: true, userId });
    });

    /* ---------------- MCQ ---------------- */
    socket.on('mcq:publish', async ({ code, question, options, correctIndex }) => {
      const cleanOpts = (options || []).map(t => ({ text: clean(t, 120) }));
      await Session.updateOne({ code }, {
        $set: {
          activity: 'mcq',
          mcq: { question: clean(question, 300), options: cleanOpts, correctIndex, counts: new Array(cleanOpts.length).fill(0) }
        }
      });
      io.to(code).emit('session:state', await Session.findOne({ code }));
    });

    socket.on('mcq:answer', async ({ code, index }) => {
      const s = await Session.findOne({ code, isActive: true });
      if (!s) return;
      const i = Number(index) || 0;
      if (s.mcq.counts[i] == null) return;
      s.mcq.counts[i] += 1;
      // XP
      const correct = (s.mcq.correctIndex != null && i === s.mcq.correctIndex);
      const p = s.leaderboard.find(p => p.userId === userId);
      if (p) p.xp += 5 + (correct ? 15 : 0);
      await s.save();
      io.to(code).emit('session:state', s);
      io.to(code).emit('leaderboard:update', s.leaderboard.sort((a,b)=>b.xp-a.xp).slice(0,10));
      io.to(socket.id).emit('mcq:result', { correct });
    });

    /* ---------------- Word Cloud ---------------- */
    socket.on('wc:word', async ({ code, word }) => {
      const s = await Session.findOne({ code, isActive: true });
      if (!s) return;
      const w = clean(word, 40).toLowerCase();
      if (s.profanityFilter && hasProfanity(w)) return;
      s.wordcloud.set(w, (s.wordcloud.get(w) || 0) + 1);
      const p = s.leaderboard.find(p => p.userId === userId);
      if (p) p.xp += 3;
      await s.save();
      io.to(code).emit('session:state', s);
      io.to(code).emit('leaderboard:update', s.leaderboard.sort((a,b)=>b.xp-a.xp).slice(0,10));
    });

    socket.on('wc:setFilter', async ({ code, on }) => {
      await Session.updateOne({ code }, { $set: { profanityFilter: !!on } });
      io.to(code).emit('session:state', await Session.findOne({ code }));
    });

    /* ---------------- Reviews ---------------- */
    socket.on('reviews:open', async ({ code, scale, style }) => {
      const sc = Math.min(5, Math.max(3, Number(scale) || 5));
      const st = (style === 'emoji') ? 'emoji' : 'stars';
      await Session.updateOne({ code }, { $set: { activity: 'reviews', reviews: { scale: sc, style: st, buckets: Array(sc).fill(0) } } });
      io.to(code).emit('session:state', await Session.findOne({ code }));
    });

    socket.on('reviews:submit', async ({ code, value }) => {
      const s = await Session.findOne({ code, isActive: true });
      if (!s) return;
      const v = Math.min(s.reviews.scale, Math.max(1, Number(value) || 1));
      s.reviews.buckets[v - 1] = (s.reviews.buckets[v - 1] || 0) + 1;
      const p = s.leaderboard.find(p => p.userId === userId);
      if (p) p.xp += 2;
      await s.save();
      io.to(code).emit('session:state', s);
      io.to(code).emit('leaderboard:update', s.leaderboard.sort((a,b)=>b.xp-a.xp).slice(0,10));
    });

    /* ---------------- Q&A ---------------- */
    socket.on('qa:ask', async ({ code, text }) => {
      const s = await Session.findOne({ code, isActive: true });
      if (!s) return;
      s.qa.push({ text: clean(text), fromUserId: userId });
      const p = s.leaderboard.find(p => p.userId === userId);
      if (p) p.xp += 4;
      await s.save();
      io.to(code).emit('session:state', s);
      io.to(code).emit('leaderboard:update', s.leaderboard.sort((a,b)=>b.xp-a.xp).slice(0,10));
    });

    socket.on('qa:markAnswered', async ({ code, index, answered }) => {
      const s = await Session.findOne({ code });
      if (!s) return;
      if (s.qa[index]) s.qa[index].answered = !!answered;
      await s.save();
      io.to(code).emit('session:state', s);
    });

    /* ---------------- Feedback ---------------- */
    socket.on('fb:setPrompt', async ({ code, prompt }) => {
      await Session.updateOne({ code }, { $set: { activity: 'feedback', fbPrompt: clean(prompt, 200) } });
      io.to(code).emit('session:state', await Session.findOne({ code }));
    });

    socket.on('fb:submit', async ({ code, text }) => {
      const s = await Session.findOne({ code, isActive: true });
      if (!s) return;
      s.feedback.push({ text: clean(text, 200), fromUserId: userId });
      const p = s.leaderboard.find(p => p.userId === userId);
      if (p) p.xp += 5;
      await s.save();
      io.to(code).emit('session:state', s);
      io.to(code).emit('leaderboard:update', s.leaderboard.sort((a,b)=>b.xp-a.xp).slice(0,10));
    });

    /* ---------------- Mini-game: Reaction Dash ---------------- */
    socket.on('mg:new', async ({ code, roundId }) => {
      await Session.updateOne({ code }, { $set: { activity: 'minigame', 'minigame.status':'armed', 'minigame.roundId': roundId, 'minigame.goAt': null } });
      io.to(code).emit('session:state', await Session.findOne({ code }));
    });

    socket.on('mg:start', async ({ code, goAt }) => {
      await Session.updateOne({ code }, { $set: { 'minigame.status':'go', 'minigame.goAt': goAt } });
      io.to(code).emit('session:state', await Session.findOne({ code }));
    });

    socket.on('mg:hit', async ({ code, roundId, time, name, avatar }) => {
      const s = await Session.findOne({ code, isActive: true });
      if (!s || s.minigame.roundId !== roundId || s.minigame.status !== 'go') return;

      // guard duplicate
      if (!s.minigame.lastResults) s.minigame.lastResults = [];
      let round = s.minigame.lastResults.find(r => r.roundId === roundId);
      if (!round) { round = { roundId, results: [] }; s.minigame.lastResults.push(round); }
      if (round.results.some(r => r.id === userId)) return;

      round.results.push({ id: userId, name: clean(name, 20), avatar, time: Number(time) || 9999 });

      // XP awards for ranks 1..3
      const sorted = round.results.slice().sort((a,b)=>a.time-b.time);
      const myRank = sorted.findIndex(r => r.id === userId);
      const p = s.leaderboard.find(p => p.userId === userId);
      if (p) {
        p.xp += 5; // participate
        if (myRank === 0) p.xp += 20;
        else if (myRank === 1) p.xp += 12;
        else if (myRank === 2) p.xp += 8;
      }
      await s.save();

      io.to(code).emit('mg:results', { roundId, results: sorted });
      io.to(code).emit('leaderboard:update', s.leaderboard.sort((a,b)=>b.xp-a.xp).slice(0,10));
      if (myRank === 0) io.to(socket.id).emit('mg:win'); // client triggers confetti
    });

    /* ---------------- XP manual sync (optional) ---------------- */
    socket.on('xp:set', async ({ code, xp }) => {
      const s = await Session.findOne({ code, isActive: true });
      if (!s) return;
      const p = s.leaderboard.find(p => p.userId === userId);
      if (p) p.xp = Number(xp) || p.xp;
      await s.save();
      io.to(code).emit('leaderboard:update', s.leaderboard.sort((a,b)=>b.xp-a.xp).slice(0,10));
    });

    socket.on('disconnect', () => {
      if (roomCode) socket.leave(roomCode);
    });
  });

  return io;
}
