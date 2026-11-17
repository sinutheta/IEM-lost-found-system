const fs = require('fs'), path = require('path');
const { Item, Match, Notification, User } = require('./models');
const { analyzeItemImage, compareItemsWithAI, getAiEngineInfo } = require('./ai-vision');

const THRESHOLD = () => +process.env.MATCH_THRESHOLD || 70;
const MAX_CANDIDATES = () => +process.env.AI_MAX_CANDIDATES || 10;
const aiEnabled = () => true; // AI is always enabled with our dual Cloud + Embedded Vision engine

/* ------------------------------------------------------------------ */
/* 1. Keyword scoring (fast semantic baseline)                        */
/* ------------------------------------------------------------------ */
const GROUPS = [
  ['wallet', 'purse', 'billfold'], ['bottle', 'flask', 'sipper', 'tumbler'],
  ['phone', 'mobile', 'smartphone', 'cellphone'], ['bag', 'backpack', 'rucksack', 'satchel', 'handbag'],
  ['key', 'keychain', 'keyring'], ['earphone', 'earbud', 'headphone', 'headset', 'airpod'],
  ['charger', 'adapter', 'adaptor'], ['watch', 'wristwatch', 'smartwatch'],
  ['glass', 'spectacle', 'eyeglass', 'specs'], ['pendrive', 'usb', 'flashdrive'],
  ['card', 'idcard'], ['umbrella', 'brolly'], ['laptop', 'macbook', 'notebookpc'],
];
const CANON = new Map();
GROUPS.forEach((g) => g.forEach((w) => CANON.set(w, g[0])));
const canon = (w) => CANON.get(w) ?? CANON.get(w.replace(/s$/, '')) ?? CANON.get(w.replace(/es$/, '')) ?? w.replace(/s$/, '');
const tok = (s) => new Set((s || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2).map(canon));
const overlap = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; a.forEach((x) => b.has(x) && n++); return n / Math.min(a.size, b.size); };

// 0-100: category 30 (not "Other"), name 30, description 15, location 15, date proximity 10
function score(a, b) {
  const days = Math.abs(new Date(a.date) - new Date(b.date)) / 864e5;
  return Math.round(
    (a.category === b.category && a.category !== 'Other' ? 30 : 0) + 30 * overlap(tok(a.name), tok(b.name)) +
    15 * overlap(tok(a.description), tok(b.description)) + 15 * overlap(tok(a.location), tok(b.location)) +
    (days <= 1 ? 10 : days <= 3 ? 7 : days <= 7 ? 4 : 0));
}

/* ------------------------------------------------------------------ */
/* 2. Notifications & saving matches                                  */
/* ------------------------------------------------------------------ */
async function notify(user, message, kind, item) {
  await Notification.create({ user: user._id || user, message, kind, item: item?._id });
  const u = user.email ? user : await User.findById(user);
  console.log(`[email -> ${u?.email}] ${message}`);
}

async function saveMatch(item, other, data) {
  if (!data || data.score === null || data.score === undefined || data.score === '') {
    throw new Error('Validation error: match score is required');
  }
  const num = typeof data.score === 'string' ? Number(data.score) : data.score;
  if (typeof num !== 'number' || isNaN(num) || !Number.isFinite(num)) {
    throw new Error('Validation error: match score must be numeric');
  }
  const s = Math.round(num);
  if (s < 0 || s > 100) {
    throw new Error(`Validation error: match score must be between 0 and 100, received ${s}`);
  }
  data.score = s;

  const [lost, found] = item.type === 'lost' ? [item, other] : [other, item];
  let m = await Match.findOne({ lost: lost._id, found: found._id });
  if (m) {
    if (m.status === 'suggested' && m.method !== 'manual') {
      Object.assign(m, data);
      await m.save();
    }
    return m;
  }
  try {
    m = await Match.create({ lost: lost._id, found: found._id, ...data });
  } catch (e) {
    if (e.code === 11000) return null;
    throw e;
  }

  const pct = data.score;
  for (const it of [lost, found]) {
    if (it.status === 'Reported' || it.status === 'open') {
      it.status = 'Matched';
      if (!it.statusHistory) it.statusHistory = [];
      it.statusHistory.push({ status: 'Matched', changedAt: new Date(), note: `AI match identified with score ${pct}%` });
      await it.save();
    }
  }

  const reasonSnippet = data.reason ? ` (${data.reason})` : '';
  await notify(lost.reporter, `Possible AI match (${pct}%) for your lost "${lost.name}": a found "${found.name}" was reported${reasonSnippet}. Open your item to claim it.`, 'match', lost);
  await notify(found.reporter, `Your found "${found.name}" may belong to a lost report "${lost.name}" (${pct}%)${reasonSnippet}. Open your item to review.`, 'match', found);
  return m;
}

/* ------------------------------------------------------------------ */
/* 3. AI Multimodal Matching Run                                      */
/* ------------------------------------------------------------------ */
async function runMatching(item) {
  // Step A: If the item has a photo, analyze it immediately with AI
  if (item.photo && !item.aiVisualDescription) {
    try {
      const visualAnalysis = await analyzeItemImage(item);
      if (visualAnalysis) {
        Object.assign(item, visualAnalysis);
        item.aiProcessedAt = new Date();
        await item.save();
      }
    } catch (e) {
      console.warn('[ai-matching] Could not analyze item photo:', e.message);
    }
  }

  // Step B: Query opposite candidate items
  const opposite = item.type === 'lost' ? 'found' : 'lost';
  const others = await Item.find({
    type: opposite,
    status: { $in: ['Reported', 'Matched', 'open'] },
    _id: { $ne: item._id }
  }).limit(500);

  if (!others.length) return [];

  // Shortlist candidates by keyword + photo presence
  const ranked = others.map((o) => {
    const kw = score(item, o);
    const hasPhotoBonus = (item.photo || o.photo) ? 15 : 0;
    const sameCategoryBonus = (item.category === o.category && item.category !== 'Other') ? 20 : 0;
    return { o, priority: kw + hasPhotoBonus + sameCategoryBonus, kw };
  }).sort((x, y) => y.priority - x.priority);

  const pool = ranked.slice(0, MAX_CANDIDATES());

  const results = await Promise.all(pool.map(async ({ o, kw }) => {
    // Ensure candidate photo is also analyzed if present
    if (o.photo && !o.aiVisualDescription) {
      try {
        const oAnalysis = await analyzeItemImage(o);
        if (oAnalysis) {
          Object.assign(o, oAnalysis);
          o.aiProcessedAt = new Date();
          await o.save();
        }
      } catch (_) {}
    }

    const [lost, found] = item.type === 'lost' ? [item, o] : [o, item];
    try {
      const aiRes = await compareItemsWithAI(lost, found);
      const finalScore = Math.max(aiRes.score, kw);
      return {
        o,
        data: {
          score: finalScore,
          keywordScore: kw,
          aiScore: aiRes.score,
          method: (item.photo || o.photo || aiRes.photos > 0) ? 'ai' : 'keyword',
          reason: aiRes.reason || 'AI evaluated physical and visual match.',
          photos: aiRes.photos,
          visualSimilarity: aiRes.visualSimilarity || finalScore
        }
      };
    } catch (e) {
      console.error('[ai-matching] Comparison error, using keyword fallback:', e.message);
      return {
        o,
        data: {
          score: kw,
          keywordScore: kw,
          aiScore: 0,
          method: 'keyword',
          reason: 'Matched by category, name, location and date proximity',
          photos: 0,
          visualSimilarity: 0
        }
      };
    }
  }));

  const createdMatches = [];
  for (const { o, data } of results) {
    if (data.score >= THRESHOLD()) {
      const m = await saveMatch(item, o, data);
      if (m) createdMatches.push(m);
    }
  }
  return createdMatches;
}

/* ------------------------------------------------------------------ */
/* 4. Global AI Re-Match Scan across all open items                   */
/* ------------------------------------------------------------------ */
async function scanAllWithAI() {
  const activeLost = await Item.find({ type: 'lost', status: { $in: ['Reported', 'Matched', 'open'] } });
  let totalMatches = 0;
  for (const lostItem of activeLost) {
    const matches = await runMatching(lostItem);
    totalMatches += (matches ? matches.length : 0);
  }
  return { scannedItems: activeLost.length, totalMatches };
}

module.exports = {
  runMatching,
  notify,
  score,
  saveMatch,
  aiEnabled,
  getAiEngineInfo,
  analyzeItemImage,
  scanAllWithAI
};
