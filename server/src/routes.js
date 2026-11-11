const router = require('express').Router();
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), multer = require('multer'), path = require('path');
const { User, Item, Match, Claim, ClaimLock, Notification, CATEGORIES } = require('./models');
const { auth, adminOnly } = require('./middleware');
const { runMatching, notify } = require('./matching');

const LOCK_MIN = +process.env.CLAIM_LOCK_MINUTES || 30;
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({ destination: path.join(__dirname, '../uploads'), filename: (r, f, cb) => cb(null, Date.now() + EXT[f.mimetype]) }),
  fileFilter: (r, f, cb) => cb(null, !!EXT[f.mimetype]), // anything that is not jpg/png/gif/webp is ignored
  limits: { fileSize: 5e6 },
});
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const sign = (u) => jwt.sign({ id: u.id, userType: u.userType }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, userType: u.userType, department: u.department });
const idOf = (x) => x?._id || x;
const same = (a, b) => String(idOf(a)) === String(idOf(b));
const normAns = (s) => String(s || '').trim().toLowerCase();

// ---------- Auth ----------
router.post('/auth/register', wrap(async (req, res) => {
  const { name, email, password, department, userType } = req.body;
  const dom = process.env.ALLOWED_EMAIL_DOMAIN ?? 'iemcal.edu.in';
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ message: 'Name, email and a 6+ character password are required' });
  if (dom && !email.toLowerCase().endsWith('@' + dom)) return res.status(400).json({ message: `Please use your @${dom} email` });
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ message: 'Email already registered' });
  const validTypes = ['student', 'faculty', 'staff'];
  const type = validTypes.includes(userType) ? userType : 'student';
  const u = await User.create({ name, email, department, userType: type, passwordHash: await bcrypt.hash(password, 10) });
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
  const { type, q, mine, category, location, fromDate, toDate } = req.query, f = {};
  if (mine) f.reporter = req.user.id; else f.status = { $in: ['Reported', 'Matched', 'open'] }; // claim_pending / returned items leave the public queue
  if (type) f.type = type;
  if (category) f.category = category;
  if (location) f.location = new RegExp(String(location).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (fromDate || toDate) {
    f.date = {};
    if (fromDate) f.date.$gte = new Date(fromDate);
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      f.date.$lte = end;
    }
  }
  if (q) { const r = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); f.$or = [{ name: r }, { location: r }, { description: r }]; }
  res.json(await Item.find(f).sort('-createdAt').populate('reporter', 'name userType department'));
}));
router.get('/items/:id', auth, wrap(async (req, res) => {
  const item = await Item.findById(req.params.id).populate('reporter', 'name email userType department');
  if (!item) return res.status(404).json({ message: 'Item not found' });
  res.json({ ...item.toObject(), isOwner: same(item.reporter, req.user.id) });
}));
router.post('/items', auth, upload.single('photo'), wrap(async (req, res) => {
  const b = req.body;
  if (!['lost', 'found'].includes(b.type) || !b.name || !b.location) return res.status(400).json({ message: 'Type, item name and location are required' });
  const doc = {
    type: b.type,
    name: b.name,
    category: b.category || 'Other',
    description: b.description,
    location: b.location,
    date: b.date || Date.now(),
    reporter: req.user.id,
    photo: req.file ? '/uploads/' + req.file.filename : undefined,
    status: 'Reported',
    statusHistory: [{ status: 'Reported', changedAt: new Date(), changedBy: req.user.id, note: 'Initial report submitted' }],
  };
  if (b.type === 'found') {
    if (!b.verificationQuestion || !b.verificationAnswer) return res.status(400).json({ message: 'Found items need a verification question and answer' });
    doc.verificationQuestion = b.verificationQuestion;
    doc.verificationAnswerHash = await bcrypt.hash(normAns(b.verificationAnswer), 8);
  }
  const item = await Item.create(doc);
  const out = item.toObject(); delete out.verificationAnswerHash;
  res.status(201).json(out);
  // matching (keyword or AI) runs in the background so the reporter is not kept waiting
  runMatching(item).catch((e) => console.error('[matching] failed:', e.message));
}));
router.put('/items/:id', auth, upload.single('photo'), wrap(async (req, res) => {
  const item = await Item.findById(req.params.id);
  if (!item) return res.status(404).json({ message: 'Item not found' });
  if (!same(item.reporter, req.user.id)) return res.status(403).json({ message: 'Only the original reporter can edit this item' });
  if (!['Reported', 'Matched', 'open'].includes(item.status)) return res.status(400).json({ message: 'Only active/open reports can be edited' });
  const b = req.body;
  if (b.name) item.name = b.name.trim();
  if (b.category) item.category = b.category;
  if (b.description !== undefined) item.description = b.description;
  if (b.location) item.location = b.location;
  if (b.date) item.date = b.date;
  if (req.file) item.photo = '/uploads/' + req.file.filename;
  if (item.type === 'found') {
    if (b.verificationQuestion) item.verificationQuestion = b.verificationQuestion;
    if (b.verificationAnswer) item.verificationAnswerHash = await bcrypt.hash(normAns(b.verificationAnswer), 8);
  }
  if (!item.statusHistory) item.statusHistory = [];
  item.statusHistory.push({ status: item.status, changedAt: new Date(), changedBy: req.user.id, note: 'Report details edited' });
  await item.save();
  const out = item.toObject(); delete out.verificationAnswerHash;
  res.json(out);
  runMatching(item).catch((e) => console.error('[matching] failed:', e.message));
}));
router.post('/items/:id/cancel', auth, wrap(async (req, res) => {
  const item = await Item.findOne({ _id: req.params.id, reporter: req.user.id, status: { $in: ['Reported', 'Matched', 'open'] } });
  if (!item) return res.status(404).json({ message: 'Cannot cancel this item' });
  item.status = 'Cancelled';
  if (!item.statusHistory) item.statusHistory = [];
  item.statusHistory.push({ status: 'Cancelled', changedAt: new Date(), changedBy: req.user.id, note: 'Cancelled by reporter' });
  await item.save();
  await Match.updateMany({ status: 'suggested', $or: [{ lost: item.id }, { found: item.id }] }, { status: 'dismissed' });
  res.json(item);
}));
router.post('/items/:id/rematch', auth, wrap(async (req, res) => {
  const item = await Item.findOne({ _id: req.params.id, reporter: req.user.id, status: { $in: ['Reported', 'Matched', 'open'] } });
  if (!item) return res.status(404).json({ message: 'Only your open reports can be re-checked' });
  await runMatching(item);
  res.json({ ok: true });
}));

// Admin item moderation & deletion (FR-16)
router.delete('/items/:id', auth, adminOnly, wrap(async (req, res) => {
  const item = await Item.findById(req.params.id);
  if (!item) return res.status(404).json({ message: 'Item not found' });
  await Match.updateMany({ $or: [{ lost: item.id }, { found: item.id }] }, { status: 'dismissed' });
  await Claim.updateMany({ item: item.id }, { status: 'rejected' });
  await Item.findByIdAndDelete(req.params.id);
  res.json({ ok: true, message: 'Report permanently removed by administrator' });
}));
router.post('/items/:id/moderate', auth, adminOnly, wrap(async (req, res) => {
  const item = await Item.findById(req.params.id);
  if (!item) return res.status(404).json({ message: 'Item not found' });
  const { action, reason, status } = req.body;
  if (!item.statusHistory) item.statusHistory = [];
  if (action === 'remove') {
    item.status = 'Cancelled';
    item.statusHistory.push({
      status: 'Cancelled',
      changedAt: new Date(),
      changedBy: req.user.id,
      note: reason || 'Removed by admin as inappropriate'
    });
    await item.save();
    await Match.updateMany({ status: 'suggested', $or: [{ lost: item.id }, { found: item.id }] }, { status: 'dismissed' });
    return res.json({ ok: true, message: 'Report removed as inappropriate', item });
  }
  if (status) {
    item.status = status;
    item.statusHistory.push({
      status,
      changedAt: new Date(),
      changedBy: req.user.id,
      note: reason || `Status set to ${status} by admin`
    });
    await item.save();
    return res.json({ ok: true, message: `Report status updated to ${status}`, item });
  }
  res.status(400).json({ message: 'Specify action: "remove" or status to update' });
}));

// Matches shown to the reporter (or an admin) of an item
router.get('/items/:id/matches', auth, wrap(async (req, res) => {
  const item = await Item.findById(req.params.id);
  if (!item) return res.json([]);
  if (!same(item.reporter, req.user.id) && req.user.userType !== 'admin') return res.json([]);
  const ms = await Match.find({ [item.type]: item.id, status: { $in: ['suggested', 'claimed'] } })
    .sort('-score').populate('lost found', 'name type category description location status photo reporter');
  const rows = ms.map((m) => ({
    _id: m.id, score: m.score, method: m.method, reason: m.reason, photos: m.photos, status: m.status,
    side: item.type === 'lost' ? 'owner' : 'finder', other: item.type === 'lost' ? m.found : m.lost,
  })).filter((r) => r.other && (r.status === 'claimed' || ['Reported', 'Matched', 'open'].includes(r.other.status)));
  res.json(rows);
}));

// ---------- Manual matching ----------
router.post('/matches', auth, wrap(async (req, res) => {
  const [lost, found] = await Promise.all([Item.findById(req.body.lostId), Item.findById(req.body.foundId)]);
  if (!lost || !found || lost.type !== 'lost' || found.type !== 'found') return res.status(400).json({ message: 'Pick one lost report and one found item' });
  if (!['Reported', 'Matched', 'open'].includes(lost.status) || !['Reported', 'Matched', 'open'].includes(found.status)) return res.status(409).json({ message: 'Both items must still be open' });
  const admin = req.user.userType === 'admin';
  if (!admin && !same(lost.reporter, req.user.id) && !same(found.reporter, req.user.id)) return res.status(403).json({ message: 'You can only link your own reports' });
  if (same(lost.reporter, found.reporter)) return res.status(400).json({ message: 'Both reports belong to the same person' });
  const me = await User.findById(req.user.id);
  const reason = `Linked manually by ${me.name}${admin ? ' (admin)' : ''}`;
  let m = await Match.findOne({ lost: lost.id, found: found.id });
  if (!m) m = new Match({ lost: lost.id, found: found.id });
  Object.assign(m, { method: 'manual', score: 100, reason, createdBy: req.user.id, status: 'suggested' });
  await m.save();
  for (const it of [lost, found]) {
    if (it.status === 'Reported' || it.status === 'open') {
      it.status = 'Matched';
      if (!it.statusHistory) it.statusHistory = [];
      it.statusHistory.push({ status: 'Matched', changedAt: new Date(), changedBy: req.user.id, note: reason });
      await it.save();
    }
  }
  if (!same(lost.reporter, req.user.id)) await notify(lost.reporter, `Your lost "${lost.name}" was linked to a found "${found.name}". ${reason}. Open your item to claim it.`, 'match', lost);
  if (!same(found.reporter, req.user.id)) await notify(found.reporter, `Your found "${found.name}" was linked to lost report "${lost.name}". ${reason}. Open your item to review.`, 'match', found);
  res.status(201).json(m);
}));
router.post('/matches/:id/dismiss', auth, wrap(async (req, res) => {
  const m = await Match.findById(req.params.id).populate('lost found', 'reporter');
  if (!m || m.status !== 'suggested') return res.status(404).json({ message: 'No open suggestion found' });
  const allowed = req.user.userType === 'admin' || same(m.lost.reporter, req.user.id) || same(m.found.reporter, req.user.id);
  if (!allowed) return res.status(403).json({ message: 'Not your match' });
  m.status = 'dismissed'; await m.save();
  res.json({ ok: true });
}));
router.get('/matches', auth, adminOnly, wrap(async (req, res) => {
  const ms = await Match.find({ status: { $in: ['suggested', 'claimed'] } }).sort('-score').limit(50).populate('lost found', 'name location status');
  res.json(ms.filter((m) => m.lost && m.found && (m.status === 'claimed' || (m.lost.status === 'open' && m.found.status === 'open'))));
}));

// ---------- Claims (verification question -> admin review) ----------
const lockOf = async (user, item) => {
  const record = await ClaimLock.findOne({ user, item });
  if (record && record.until && record.until > new Date()) return record;
  return null;
};
const recordFailedAttempt = async (user, item) => {
  let record = await ClaimLock.findOne({ user, item });
  if (!record) record = new ClaimLock({ user, item, failedAttempts: 0 });
  if (record.until && record.until <= new Date()) {
    record.failedAttempts = 0;
    record.until = undefined;
  }
  record.failedAttempts = (record.failedAttempts || 0) + 1;
  if (record.failedAttempts >= 3) {
    record.until = new Date(Date.now() + LOCK_MIN * 60000);
    record.failedAttempts = 0;
    await record.save();
    return { locked: true, until: record.until, failedAttempts: 3, remaining: 0 };
  }
  await record.save();
  const remaining = 3 - record.failedAttempts;
  return { locked: false, failedAttempts: record.failedAttempts, remaining };
};
const resetFailedAttempts = async (user, item) => {
  await ClaimLock.deleteOne({ user, item });
};

// Takes the found item (and its matched lost report) out of the queue and opens the claim for admin review
async function openClaim({ found, lost, match, claimant, answer, side, note }) {
  const locked = await Item.findOneAndUpdate(
    { _id: found._id, status: { $in: ['Reported', 'Matched', 'open'] } },
    {
      status: 'Pending Verification',
      $push: { statusHistory: { status: 'Pending Verification', changedAt: new Date(), changedBy: idOf(claimant), note: `Claim submitted by ${side === 'finder' ? 'finder' : 'owner'}` } }
    },
    { new: true }
  );
  if (!locked) return null; // someone else claimed it first
  if (lost) {
    await Item.updateOne(
      { _id: idOf(lost), status: { $in: ['Reported', 'Matched', 'open'] } },
      {
        status: 'Pending Verification',
        $push: { statusHistory: { status: 'Pending Verification', changedAt: new Date(), changedBy: idOf(claimant), note: 'Linked to pending claim' } }
      }
    );
  }
  if (match) { match.status = 'claimed'; await match.save(); }
  const claim = await Claim.create({ item: found._id, match: match?._id, claimant, answer, side, note, failedAttempts: 0 });
  for (const a of await User.find({ userType: 'admin' })) {
    await notify(a, `New ${side === 'finder' ? 'hand-over' : 'ownership'} claim on "${found.name}" awaiting review`, 'claim', found);
  }
  return claim;
}

router.get('/items/:id/question', auth, wrap(async (req, res) => {
  const item = await Item.findById(req.params.id);
  if (!item || item.type !== 'found' || !['Reported', 'Matched', 'open'].includes(item.status)) return res.status(404).json({ message: 'This item cannot be claimed' });
  const lock = await lockOf(req.user.id, item.id);
  if (lock) return res.status(423).json({ message: 'Too many wrong attempts. Try again later.', until: lock.until });
  res.json({ question: item.verificationQuestion });
}));

// Claim by browsing (no match needed)
router.post('/items/:id/claim', auth, wrap(async (req, res) => {
  const item = await Item.findById(req.params.id).select('+verificationAnswerHash');
  if (!item || item.type !== 'found') return res.status(404).json({ message: 'Found item not found' });
  if (!['Reported', 'Matched', 'open'].includes(item.status)) return res.status(409).json({ message: 'This item is not available to claim' });
  if (same(item.reporter, req.user.id)) return res.status(400).json({ message: 'You reported this item' });
  const lock = await lockOf(req.user.id, item.id);
  if (lock) return res.status(423).json({ message: 'Claim is locked due to 3 consecutive wrong attempts. Try again later.', until: lock.until });
  if (!item.verificationAnswerHash || !(await bcrypt.compare(normAns(req.body.answer), item.verificationAnswerHash))) {
    const outcome = await recordFailedAttempt(req.user.id, item.id);
    if (outcome.locked) {
      return res.status(423).json({ message: `Incorrect answer. 3 failed attempts reached. Locked for ${LOCK_MIN} minutes.`, until: outcome.until });
    }
    return res.status(403).json({ message: `Incorrect answer. ${outcome.remaining} attempt(s) remaining before a 30-minute lockout.`, failedAttempts: outcome.failedAttempts, remaining: outcome.remaining });
  }
  await resetFailedAttempts(req.user.id, item.id);
  const mine = await Item.find({ reporter: req.user.id, type: 'lost', status: { $in: ['Reported', 'Matched', 'open'] } }).distinct('_id');
  const match = await Match.findOne({ found: item.id, lost: { $in: mine }, status: 'suggested' });
  const claim = await openClaim({ found: item, lost: match?.lost, match, claimant: req.user.id, answer: req.body.answer, side: 'owner' });
  if (!claim) return res.status(409).json({ message: 'This item is no longer available to claim' });
  res.status(201).json(claim);
}));

// Claim from a match: the lost reporter (owner) answers the question; the found reporter (finder) offers a hand-over
router.post('/matches/:id/claim', auth, wrap(async (req, res) => {
  const m = await Match.findById(req.params.id);
  if (!m || m.status !== 'suggested') return res.status(409).json({ message: 'This match is not available to claim' });
  const lost = await Item.findById(m.lost);
  const found = await Item.findById(m.found).select('+verificationAnswerHash');
  if (!lost || !found || !['Reported', 'Matched', 'open'].includes(lost.status) || !['Reported', 'Matched', 'open'].includes(found.status)) return res.status(409).json({ message: 'One of the items is no longer in the queue' });
  const isOwner = same(lost.reporter, req.user.id), isFinder = same(found.reporter, req.user.id);
  if (isOwner === isFinder) return res.status(isOwner ? 400 : 403).json({ message: isOwner ? 'Both reports are yours' : 'Only the two reporters can claim this match' });
  if (isOwner) {
    const lock = await lockOf(req.user.id, found.id);
    if (lock) return res.status(423).json({ message: 'Claim is locked due to 3 consecutive wrong attempts. Try again later.', until: lock.until });
    if (!found.verificationAnswerHash || !(await bcrypt.compare(normAns(req.body.answer), found.verificationAnswerHash))) {
      const outcome = await recordFailedAttempt(req.user.id, found.id);
      if (outcome.locked) {
        return res.status(423).json({ message: `Incorrect answer. 3 failed attempts reached. Locked for ${LOCK_MIN} minutes.`, until: outcome.until });
      }
      return res.status(403).json({ message: `Incorrect answer. ${outcome.remaining} attempt(s) remaining before a 30-minute lockout.`, failedAttempts: outcome.failedAttempts, remaining: outcome.remaining });
    }
    await resetFailedAttempts(req.user.id, found.id);
  }
  const claim = await openClaim({ found, lost, match: m, claimant: req.user.id, answer: req.body.answer, side: isOwner ? 'owner' : 'finder', note: String(req.body.note || '').slice(0, 300) });
  if (!claim) return res.status(409).json({ message: 'This item is no longer available to claim' });
  res.status(201).json(claim);
}));

router.get('/claims', auth, adminOnly, wrap(async (req, res) =>
  res.json(await Claim.find({ status: req.query.status || 'pending_review' }).sort('-createdAt')
    .populate('item', 'name location type').populate('claimant', 'name email department')
    .populate({ path: 'match', populate: { path: 'lost', select: 'name location' } }))));

const review = (status) => wrap(async (req, res) => {
  const c = await Claim.findById(req.params.id).populate('item');
  if (!c || c.status !== 'pending_review') return res.status(404).json({ message: 'No pending claim found' });
  Object.assign(c, { status, reviewedBy: req.user.id, reviewedAt: new Date() }); await c.save();
  const approved = status === 'approved';
  const newStatus = approved ? 'Returned' : 'Rejected';
  c.item.status = newStatus;
  if (!c.item.statusHistory) c.item.statusHistory = [];
  c.item.statusHistory.push({ status: newStatus, changedAt: new Date(), changedBy: req.user.id, note: `Claim ${status} by admin` });
  await c.item.save();
  const m = c.match ? await Match.findById(c.match) : null;
  if (m) {
    await Item.updateOne(
      { _id: m.lost },
      {
        status: newStatus,
        $push: { statusHistory: { status: newStatus, changedAt: new Date(), changedBy: req.user.id, note: `Claim ${status} by admin` } }
      }
    );
    m.status = approved ? 'resolved' : 'dismissed'; await m.save();
    if (approved) { // both items are gone from the queue, so every other suggestion involving them is void
      await Match.updateMany({ _id: { $ne: m._id }, status: { $in: ['suggested', 'claimed'] }, $or: [{ lost: m.lost }, { found: m.found }] }, { status: 'dismissed' });
      const lost = await Item.findById(m.lost);
      const others = [[lost.reporter, `Your lost "${lost.name}" has been matched and returned.`, lost], [c.item.reporter, `Your found "${c.item.name}" has been handed over to its owner. Thank you!`, c.item]];
      for (const [u, msg, it] of others) if (!same(u, c.claimant)) await notify(u, msg, 'claim', it);
    }
  }
  await notify(await User.findById(c.claimant), `Your claim on "${c.item.name}" was ${status}`, 'claim', c.item);
  res.json(c);
});
router.post('/claims/:id/approve', auth, adminOnly, review('approved'));
router.post('/claims/:id/reject', auth, adminOnly, review('rejected'));

// ---------- Admin Dashboard Statistics ----------
router.get('/admin/stats', auth, adminOnly, wrap(async (req, res) => {
  const [totalReports, activeReports, pendingClaims] = await Promise.all([
    Item.countDocuments(),
    Item.countDocuments({ status: { $in: ['open', 'Reported', 'Matched'] } }),
    Claim.countDocuments({ status: 'pending_review' }),
  ]);
  const [matchedLost, matchedFound] = await Promise.all([
    Match.distinct('lost', { status: { $in: ['suggested', 'claimed', 'resolved'] } }),
    Match.distinct('found', { status: { $in: ['suggested', 'claimed', 'resolved'] } }),
  ]);
  const matchedItems = new Set([...matchedLost.map(String), ...matchedFound.map(String)]).size;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const returnedItemsThisMonth = await Item.countDocuments({
    status: { $in: ['returned', 'Returned'] },
    updatedAt: { $gte: startOfMonth },
  });
  const sampleMatches = await Match.find({ status: { $ne: 'dismissed' } })
    .populate('lost found', 'createdAt')
    .sort('-createdAt')
    .limit(200);
  let totalDiffMs = 0, count = 0;
  for (const m of sampleMatches) {
    if (m.lost && m.found) {
      const reportTime = Math.max(new Date(m.lost.createdAt).getTime(), new Date(m.found.createdAt).getTime());
      const matchTime = new Date(m.createdAt).getTime();
      const diff = Math.max(0, matchTime - reportTime);
      totalDiffMs += diff;
      count++;
    }
  }
  const avgHours = count > 0 ? (totalDiffMs / count / 36e5).toFixed(1) : '0.0';
  const avgTimeToMatch = count > 0 ? `${avgHours} hrs` : 'N/A';
  res.json({
    totalReports,
    activeReports,
    matchedItems,
    pendingClaims,
    returnedItemsThisMonth,
    avgTimeToMatch,
  });
}));

// ---------- Notifications ----------
router.get('/notifications', auth, wrap(async (req, res) => res.json(await Notification.find({ user: req.user.id }).sort('-createdAt').limit(30))));
router.post('/notifications/read', auth, wrap(async (req, res) => { await Notification.updateMany({ user: req.user.id }, { read: true }); res.json({ ok: true }); }));

module.exports = router;