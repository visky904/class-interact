import { Router } from 'express';
import { StatusCodes as S } from 'http-status-codes';
import { Session } from './models.js';

const router = Router();

// Create/replace session
router.post('/session', async (req, res) => {
  const { code, topic } = req.body || {};
  if (!code) return res.status(S.BAD_REQUEST).json({ error: 'code required' });
  await Session.deleteOne({ code });
  const s = await Session.create({
    code,
    topic,
    reviews: { scale: 5, style: 'stars', buckets: [0,0,0,0,0] }
  });
  res.status(S.CREATED).json({ ok: true, session: { code: s.code } });
});

// End session
router.post('/session/:code/end', async (req, res) => {
  await Session.updateOne({ code: req.params.code }, { $set: { isActive: false, activity: null } });
  res.json({ ok: true });
});

// Export leaderboard
router.get('/session/:code/leaderboard', async (req, res) => {
  const s = await Session.findOne({ code: req.params.code });
  if (!s) return res.status(S.NOT_FOUND).json({ error: 'not found' });
  res.json({ leaderboard: s.leaderboard.sort((a,b)=>b.xp-a.xp) });
});

export default router;
