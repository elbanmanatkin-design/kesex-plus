const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DATA_DIR = path.join(ROOT, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');
const SECRET = process.env.SESSION_SECRET || 'change-this-secret-before-public-deployment';
fs.mkdirSync(UPLOAD_DIR, { recursive: true }); fs.mkdirSync(DATA_DIR, { recursive: true });
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const writeJson = (file, data) => { const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data, null, 2)); fs.renameSync(tmp, file); };
let users = readJson(USERS_FILE, []); let savedRooms = readJson(ROOMS_FILE, []);
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '1h' }));
app.use(express.static(path.join(ROOT, 'public')));

function signToken(user) { const payload = Buffer.from(JSON.stringify({ id: user.id, exp: Date.now() + 30 * 864e5 })).toString('base64url'); const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url'); return `${payload}.${sig}`; }
function verifyToken(token) { try { const [payload, sig] = String(token || '').split('.'); const expected = crypto.createHmac('sha256', SECRET).update(payload).digest(); const actual = Buffer.from(sig, 'base64url'); if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null; const data = JSON.parse(Buffer.from(payload, 'base64url').toString()); return data.exp > Date.now() ? users.find(u => u.id === data.id) || null : null; } catch { return null; } }
const auth = (req, _res, next) => { req.user = verifyToken((req.headers.authorization || '').replace(/^Bearer\s+/i, '')); next(); };
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => ({ salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') });
app.post('/api/auth/register', (req, res) => { const name = String(req.body.name || '').trim().slice(0, 24); const email = String(req.body.email || '').trim().toLowerCase().slice(0, 120); const password = String(req.body.password || ''); if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return res.status(400).json({ error: 'Укажи ник, корректную почту и пароль минимум из 8 символов.' }); if (users.some(u => u.email === email)) return res.status(409).json({ error: 'Аккаунт с такой почтой уже существует.' }); const creds = hashPassword(password); const user = { id: crypto.randomUUID(), name, email, ...creds, createdAt: Date.now() }; users.push(user); writeJson(USERS_FILE, users); res.json({ token: signToken(user), user: publicUser(user) }); });
app.post('/api/auth/login', (req, res) => { const email = String(req.body.email || '').trim().toLowerCase(); const password = String(req.body.password || ''); const user = users.find(u => u.email === email); if (!user) return res.status(401).json({ error: 'Неверная почта или пароль.' }); const candidate = crypto.scryptSync(password, user.salt, 64); if (!crypto.timingSafeEqual(candidate, Buffer.from(user.hash, 'hex'))) return res.status(401).json({ error: 'Неверная почта или пароль.' }); res.json({ token: signToken(user), user: publicUser(user) }); });
app.get('/api/auth/me', auth, (req, res) => req.user ? res.json({ user: publicUser(req.user) }) : res.status(401).json({ error: 'Не авторизован.' }));
app.get('/api/account/rooms', auth, (req, res) => { if (!req.user) return res.status(401).json({ error: 'Не авторизован.' }); res.json({ rooms: savedRooms.filter(r => r.ownerId === req.user.id).slice(-30).reverse() }); });
function publicUser(u) { return { id: u.id, name: u.name, email: u.email }; }

const storage = multer.diskStorage({ destination: (_req, _file, cb) => cb(null, UPLOAD_DIR), filename: (_req, file, cb) => { const ext = path.extname(file.originalname).toLowerCase(); cb(null, `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${ext}`); } });
const upload = multer({ storage, limits: { fileSize: 1024 * 1024 * 1024 }, fileFilter: (_req, file, cb) => { const allowed = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']; cb(allowed.includes(file.mimetype) ? null : new Error('Поддерживаются MP4, WebM, OGG и MOV.'), allowed.includes(file.mimetype)); } });
app.post('/api/upload', upload.single('video'), (req, res) => { if (!req.file) return res.status(400).json({ error: 'Файл не получен.' }); res.json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname }); });
app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'KESEX+' }));

const rooms = new Map(); const makeCode = () => crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
function persistRoom(room) { const item = { code: room.code, title: room.title, ownerId: room.ownerId || null, ownerName: room.ownerName || 'Гость', updatedAt: Date.now() }; const idx = savedRooms.findIndex(r => r.code === room.code); if (idx >= 0) savedRooms[idx] = item; else savedRooms.push(item); savedRooms = savedRooms.slice(-500); writeJson(ROOMS_FILE, savedRooms); }
function roomSnapshot(room) { return { code: room.code, title: room.title, source: room.source, playing: room.playing, position: room.position, updatedAt: room.updatedAt, members: [...room.members.values()].map(m => ({ id: m.id, name: m.name, host: m.host, account: !!m.userId, voiceEnabled: !!m.voiceEnabled })) }; }
function broadcastRoom(room) { io.to(room.code).emit('room-state', roomSnapshot(room)); }
function isHost(room, id) { const member = room.members.get(id); return !!member?.host; }
function userFromSocket(socket) { return verifyToken(socket.handshake.auth?.token); }

io.on('connection', socket => {
  socket.on('create-room', ({ name, title }, done = () => {}) => { let code = makeCode(); while (rooms.has(code)) code = makeCode(); const user = userFromSocket(socket); const member = { id: socket.id, name: String(user?.name || name || 'Гость').slice(0, 24), host: true, userId: user?.id || null, voiceEnabled: false }; const room = { code, title: String(title || 'Совместный просмотр').slice(0, 70), source: '', playing: false, position: 0, updatedAt: Date.now(), ownerId: user?.id || null, ownerName: member.name, members: new Map([[socket.id, member]]) }; rooms.set(code, room); socket.join(code); socket.data.room = code; socket.data.name = member.name; persistRoom(room); done({ ok: true, room: roomSnapshot(room) }); });
  socket.on('join-room', ({ code, name }, done = () => {}) => { code = String(code || '').trim().toUpperCase(); const room = rooms.get(code); if (!room) return done({ ok: false, error: 'Комната не найдена. Проверь код приглашения.' }); const user = userFromSocket(socket); const member = { id: socket.id, name: String(user?.name || name || 'Гость').slice(0, 24), host: false, userId: user?.id || null, voiceEnabled: false }; room.members.set(socket.id, member); socket.join(code); socket.data.room = code; socket.data.name = member.name; done({ ok: true, room: roomSnapshot(room) }); socket.to(code).emit('system-message', `${member.name} присоединился(ась)`); broadcastRoom(room); });
  socket.on('set-source', ({ source, title }) => { const room = rooms.get(socket.data.room); if (!room || !isHost(room, socket.id)) return; const value = String(source || '').trim(); if (!value || value.length > 2000) return; room.source = value; room.title = String(title || room.title).slice(0, 70); room.position = 0; room.playing = false; room.updatedAt = Date.now(); persistRoom(room); io.to(room.code).emit('source-changed', { source: room.source, title: room.title }); broadcastRoom(room); });
  socket.on('playback', ({ action, position }) => { const room = rooms.get(socket.data.room); if (!room || !isHost(room, socket.id)) return; const p = Number(position); if (!Number.isFinite(p) || p < 0 || !['play', 'pause'].includes(action)) return; room.position = p; room.playing = action === 'play'; room.updatedAt = Date.now(); io.to(room.code).emit('playback-sync', { action, position: p, updatedAt: room.updatedAt, by: socket.id }); });
  socket.on('chat-message', text => { const room = rooms.get(socket.data.room); if (!room) return; const message = String(text || '').trim().slice(0, 500); if (!message) return; io.to(room.code).emit('chat-message', { name: socket.data.name || 'Гость', text: message, at: Date.now() }); });
  socket.on('voice-signal', ({ to, signal }) => { const room = rooms.get(socket.data.room); if (!room || !room.members.has(socket.id) || !room.members.has(to)) return; io.to(to).emit('voice-signal', { from: socket.id, signal }); });
  socket.on('voice-state', enabled => { const room = rooms.get(socket.data.room); const member = room?.members.get(socket.id); if (member) { member.voiceEnabled = !!enabled; socket.to(room.code).emit('voice-state', { id: socket.id, name: socket.data.name, enabled: !!enabled }); broadcastRoom(room); } });
  socket.on('disconnect', () => { const code = socket.data.room; const room = rooms.get(code); if (!room) return; const wasHost = isHost(room, socket.id); room.members.delete(socket.id); socket.to(code).emit('voice-peer-left', socket.id); if (!room.members.size) rooms.delete(code); else { if (wasHost) { const next = room.members.values().next().value; next.host = true; io.to(code).emit('system-message', `${next.name} теперь ведущий комнаты`); } io.to(code).emit('system-message', `${socket.data.name || 'Участник'} вышел(ла) из комнаты`); broadcastRoom(room); } });
});
app.use((err, _req, res, _next) => { res.status(400).json({ error: err.message || 'Ошибка запроса.' }); });
server.listen(PORT, () => console.log(`KESEX+ is running on port ${PORT}`));
