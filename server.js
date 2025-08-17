import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import routes from './routes.js';
import { attachSockets } from './sockets.js';

const {
  PORT = 8080,
  MONGO_URI = 'mongodb://localhost:27017/class_interact',
  CORS_ORIGIN = ''
} = process.env;

await mongoose.connect(MONGO_URI);

const app = express();
app.use(express.static('public'));
app.use(helmet());
app.use(express.json({ limit: '200kb' }));
const allow = CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => (!origin ? cb(null, true) : cb(null, allow.includes(origin))),
  credentials: true
}));
app.use(rateLimit({ windowMs: 60_000, max: 600 }));

app.get('/health', (_, res) => res.json({ ok: true }));
app.use('/api', routes);
app.get('/', (req, res) => {
  res.send('<h1>Server Test Successful!</h1>');
});

const server = http.createServer(app);
attachSockets(server, allow);

server.listen(PORT, () => console.log(`Server on :${PORT}`));
