const { Item, Match, Notification, User } = require('./models');
const THRESHOLD = +process.env.MATCH_THRESHOLD || 70;

const tok = (s) => new Set((s || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
const overlap = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; a.forEach((x) => b.has(x) && n++); return n / Math.min(a.size, b.size); };

// Score 0-100: category 30, name 30, description 15, location 15, date proximity 10
function score(a, b) {
  const days = Math.abs(new Date(a.date) - new Date(b.date)) / 864e5;
  return Math.round(
    (a.category === b.category ? 30 : 0) + 30 * overlap(tok(a.name), tok(b.name)) +
    15 * overlap(tok(a.description), tok(b.description)) + 15 * overlap(tok(a.location), tok(b.location)) +
    (days <= 1 ? 10 : days <= 3 ? 7 : days <= 7 ? 4 : 0));
}

async function notify(user, message, kind, item) {
  await Notification.create({ user: user._id || user, message, kind, item: item?._id });
  const u = user.email ? user : await User.findById(user);
  console.log(`[email -> ${u?.email}] ${message}`); // swap for nodemailer / SMS gateway
}

async function runMatching(item) {
  const others = await Item.find({ type: item.type === 'lost' ? 'found' : 'lost', status: 'open', _id: { $ne: item._id } });
  for (const o of others) {
    const s = score(item, o);
    if (s < THRESHOLD) continue;
    const [lost, found] = item.type === 'lost' ? [item, o] : [o, item];
    const r = await Match.updateOne({ lost: lost._id, found: found._id }, { $set: { score: s }, $setOnInsert: { notified: true } }, { upsert: true });
    if (r.upsertedCount) {
      await notify(lost.reporter, `Possible match (${s}%) for your lost "${lost.name}"`, 'match', found);
      await notify(found.reporter, `Your found "${found.name}" matches a lost report (${s}%)`, 'match', found);
    }
  }
}
module.exports = { runMatching, notify, score };
