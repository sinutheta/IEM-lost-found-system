require('dotenv').config();
const mongoose = require('mongoose');
const { Item, Match } = require('./models');

async function migrateStatuses() {
  const shouldDisconnect = mongoose.connection.readyState === 0;
  if (shouldDisconnect) {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/iem_lost_found');
  }

  const items = await Item.find({});
  let updatedCount = 0;
  for (const it of items) {
    let updated = false;
    const old = it.status;
    if (old === 'open') {
      const hasMatch = await Match.findOne({ $or: [{ lost: it._id }, { found: it._id }], status: { $in: ['suggested', 'claimed'] } });
      it.status = hasMatch ? 'Matched' : 'Reported';
      updated = true;
    } else if (old === 'claim_pending') {
      it.status = 'Pending Verification';
      updated = true;
    } else if (old === 'returned') {
      it.status = 'Returned';
      updated = true;
    } else if (old === 'cancelled') {
      it.status = 'Cancelled';
      updated = true;
    } else if (!it.status) {
      it.status = 'Reported';
      updated = true;
    }

    if (!it.statusHistory || it.statusHistory.length === 0) {
      it.statusHistory = [{
        status: it.status,
        changedAt: it.updatedAt || it.createdAt || new Date(),
        note: `Initial status tracking (migrated from ${old})`
      }];
      updated = true;
    }

    if (updated) {
      await it.save();
      updatedCount++;
    }
  }

  console.log(`[migration] Checked ${items.length} items, updated ${updatedCount} items to new status enum.`);
  if (shouldDisconnect) {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  migrateStatuses()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('[migration] failed:', e);
      process.exit(1);
    });
}

module.exports = migrateStatuses;
