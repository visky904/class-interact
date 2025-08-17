import mongoose from 'mongoose';

const ParticipantSchema = new mongoose.Schema({
  userId: String,
  name: String,
  avatar: String,           // base64 PNG from canvas
  xp: { type: Number, default: 0 }
}, { _id: false });

const QAItemSchema = new mongoose.Schema({
  text: String,
  fromUserId: String,
  answered: { type: Boolean, default: false },
  up: { type: Number, default: 0 }
}, { timestamps: true });

const FeedbackItemSchema = new mongoose.Schema({
  text: String,
  fromUserId: String
}, { timestamps: true });

const MCQSchema = new mongoose.Schema({
  question: String,
  options: [{ text: String }],
  correctIndex: { type: Number, default: null },
  counts: { type: [Number], default: [] }
}, { _id: false });

const ReviewSchema = new mongoose.Schema({
  scale: { type: Number, default: 5 },   // 3–5
  style: { type: String, enum: ['stars','emoji'], default: 'stars' },
  buckets: { type: [Number], default: [0,0,0,0,0] }
}, { _id: false });

const MiniGameResultSchema = new mongoose.Schema({
  roundId: String,
  results: [{ id: String, name: String, avatar: String, time: Number }]
}, { _id: false });

const SessionSchema = new mongoose.Schema({
  code: { type: String, unique: true, index: true },
  topic: String,
  isActive: { type: Boolean, default: true },
  locked: { type: Boolean, default: false },

  activity: { type: String, enum: ['mcq','wordcloud','reviews','qa','feedback','minigame', null], default: null },

  // MCQ
  mcq: { type: MCQSchema, default: {} },

  // Word cloud
  profanityFilter: { type: Boolean, default: true },
  wordcloud: { type: Map, of: Number, default: {} }, // word -> count

  // Reviews
  reviews: { type: ReviewSchema, default: {} },

  // Q&A + Feedback
  qa: { type: [QAItemSchema], default: [] },
  feedback: { type: [FeedbackItemSchema], default: [] },
  fbPrompt: { type: String, default: null },

  // Mini-game state (latest round)
  minigame: {
    status: { type: String, default: 'idle' }, // idle | armed | go
    roundId: { type: String, default: null },
    goAt: { type: Number, default: null },
    lastResults: { type: [MiniGameResultSchema], default: [] }
  },

  // Participants + Leaderboard
  leaderboard: { type: [ParticipantSchema], default: [] }
}, { timestamps: true });

export const Session = mongoose.model('Session', SessionSchema);
