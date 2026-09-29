const router = require('express').Router();
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), multer = require('multer'), path = require('path');
const { User, Item, Match, Claim, ClaimLock, Notification, CATEGORIES } = require('./models');
const { auth, adminOnly } = require('./middleware');
const { runMatching, notify } = require('./matching');

const LOCK_MIN = +process.env.CLAIM_LOCK_MINUTES || 30;
const upload = multer({ storage: multer.diskStorage({ destination: path.join(__dirname, '../uploads'), filename: (r, f, cb) => cb(null, Date.now() + path.extname(f.originalname)) }), limits: { fileSize: 5e6 } });
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const sign = (u) => jwt.sign({ id: u.id, userType: u.userType }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, userType: u.userType, department: u.department });

// ---------- Auth ----------
router.post('/auth/register', wrap(async (req, res) => {
  const { name, email, password, department } = req.body;
  const dom = process.env.ALLOWED_EMAIL_DOMAIN ?? 'iem.edu.in';
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ message: 'Name, email and a 6+ character password are required' });
  if (dom && !email.toLowerCase().endsWith('@' + dom)) return res.status(400).json({ message: `Please use your @${dom} email` });
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ message: 'Email already registered' });
  const u = await User.create({ name, email, department, passwordHash: await bcrypt.hash(password, 10) });
  res.status(201).json({ token: sign(u), user: pub(u) });
}));
router.post('/auth/login', wrap(async (req, res) => {
  const u = await User.findOne({ email: (req.body.email || '').toLowerCase() }).select('+passwordHash');
  if (!u || !(await bcrypt.compare(req.body.password || '', u.passwordHash))) return res.status(401).json({ message: 'Invalid email or password' });
  res.json({ token: sign(u), user: pub(u) });
}));
router.get('/auth/me', auth, wrap(async (req, res) => res.json(pub(await User.findById(req.user.id)))));
router.get('/categories', (req, res) => res.json(CATEGORIES));

// ---------- Items ----------
router.get('/items', auth, wrap(async (req, res) => {
  const { type, q, mine } = req.query, f = {};
  if (mine) f.reporter = req.user.id; else f.status = { $in: ['open', 'claim_pending'] };
  if (type) f.type = type;
  if (q) { const r = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); f.$or = [{ name: r }, { location: r }, { description: r }]; }
  res.json(await Item.find(f).sort('-createdAt').populate('reporter', 'name userType department'));
}));
router.get('/items/:id', auth, wrap(async (req, res) => {
  const item = await Item.findById(req.params.id).populate('reporter', 'name email userType department');
  if (!item) return res.status(404).json({ message: 'Item not found' });
  res.json({ ...item.toObject(), isOwner: String(item.reporter._id) === req.user.id });
}));
router.post('/items', auth, upload.single('photo'), wrap(async (req, res) => {
  const b = req.body;
  if (!['lost', 'found'].includes(b.type) || !b.name || !b.location) return res.status(400).json({ message: 'Type, item name and location are required' });
  const doc = { type: b.type, name: b.name, category: b.category || 'Other', description: b.description, location: b.location, date: b.date || Date.now(), reporter: req.user.id, photo: req.file ? '/uploads/' + req.file.filename : undefined };
  if (b.type === 'found') {
    if (!b.verificationQuestion || !b.verificationAnswer) return res.status(400).json({ message: 'Found items need a verification question and answer' });
    doc.verificationQuestion = b.verificationQuestion;
    doc.verificationAnswerHash = await bcrypt.hash(b.verificationAnswer.trim().toLowerCase(), 8);
  }
  const item = await Item.create(doc);
  await runMatching(item);
  res.status(201).json(item);
}));
router.post('/items/:id/cancel', auth, wrap(async (req, res) => {
  const item = await Item.findOne({ _id: req.params.id, reporter: req.user.id, status: 'open' });
  if (!item) return res.status(404).json({ message: 'Cannot cancel this item' });
  item.status = 'cancelled'; await item.save(); res.json(item);
}));
router.get('/items/:id/matches', auth, wrap(async (req, res) => {
  const item = await Item.findOne({ _id: req.params.id, reporter: req.user.id });
  if (!item) return res.json([]);
  const ms = await Match.find({ $or: [{ lost: item.id }, { found: item.id }] }).sort('-score').populate('lost found', 'name type location status');
  res.json(ms.map((m) => ({ _id: m.id, score: m.score, other: item.type === 'lost' ? m.found : m.lost })));
}));

// ---------- Claims (verification question -> admin review) ----------
const lockOf = (user, item) => ClaimLock.findOne({ user, item, until: { $gt: new Date() } });
router.get('/items/:id/question', auth, wrap(async (req, res) => {
  const item = await Item.findById(req.params.id);
  if (!item || item.type !== 'found' || item.status !== 'open') return res.status(404).json({ message: 'This item cannot be claimed' });
  const lock = await lockOf(req.user.id, item.id);
  if (lock) return res.status(423).json({ message: 'Too many wrong attempts. Try again later.', until: lock.until });
  res.json({ question: item.verificationQuestion });
}));
router.post('/items/:id/claim', auth, wrap(async (req, res) => {
  const item = await Item.findById(req.params.id).select('+verificationAnswerHash');
  if (!item || item.type !== 'found') return res.status(404).json({ message: 'Found item not found' });
  if (item.status !== 'open') return res.status(409).json({ message: 'This item is not available to claim' });
  if (String(item.reporter) === req.user.id) return res.status(400).json({ message: 'You reported this item' });
  const lock = await lockOf(req.user.id, item.id);
  if (lock) return res.status(423).json({ message: 'Too many wrong attempts. Try again later.', until: lock.until });
  if (!(await bcrypt.compare((req.body.answer || '').trim().toLowerCase(), item.verificationAnswerHash))) {
    const until = new Date(Date.now() + LOCK_MIN * 60000);
    await ClaimLock.findOneAndUpdate({ user: req.user.id, item: item.id }, { until }, { upsert: true });
    return res.status(403).json({ message: `Incorrect answer. Locked for ${LOCK_MIN} minutes.`, until });
  }
  const mine = await Item.find({ reporter: req.user.id, type: 'lost' }).distinct('_id');
  const match = await Match.findOne({ found: item.id, lost: { $in: mine } });
  const claim = await Claim.create({ item: item.id, match: match?.id, claimant: req.user.id, answer: req.body.answer });
  item.status = 'claim_pending'; await item.save();
  if (match) { match.status = 'claimed'; await match.save(); }
  for (const a of await User.find({ userType: 'admin' })) await notify(a, `New claim on "${item.name}" awaiting review`, 'claim', item);
  res.status(201).json(claim);
}));
router.get('/claims', auth, adminOnly, wrap(async (req, res) =>
  res.json(await Claim.find({ status: req.query.status || 'pending_review' }).sort('-createdAt')
    .populate('item', 'name location type').populate('claimant', 'name email department'))));
const review = (status) => wrap(async (req, res) => {
  const c = await Claim.findById(req.params.id).populate('item');
  if (!c || c.status !== 'pending_review') return res.status(404).json({ message: 'No pending claim found' });
  Object.assign(c, { status, reviewedBy: req.user.id, reviewedAt: new Date() }); await c.save();
  c.item.status = status === 'approved' ? 'returned' : 'open'; await c.item.save();
  if (status === 'approved' && c.match) { const m = await Match.findById(c.match); if (m) await Item.findByIdAndUpdate(m.lost, { status: 'returned' }); }
  await notify(await User.findById(c.claimant), `Your claim on "${c.item.name}" was ${status}`, 'claim', c.item);
  res.json(c);
});
router.post('/claims/:id/approve', auth, adminOnly, review('approved'));
router.post('/claims/:id/reject', auth, adminOnly, review('rejected'));

// ---------- Notifications ----------
router.get('/notifications', auth, wrap(async (req, res) => res.json(await Notification.find({ user: req.user.id }).sort('-createdAt').limit(30))));
router.post('/notifications/read', auth, wrap(async (req, res) => { await Notification.updateMany({ user: req.user.id }, { read: true }); res.json({ ok: true }); }));

module.exports = router;
