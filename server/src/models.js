const { Schema, model } = require('mongoose');
const ref = (m) => ({ type: Schema.Types.ObjectId, ref: m });
const CATEGORIES = ['Wallet','ID Card','Electronics','Bottle','Books & Stationery','Keys','Bag','Clothing','Other'];

const User = model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  userType: { type: String, enum: ['student','staff','admin'], default: 'student' },
  department: { type: String, default: 'Computer Science' },
}, { timestamps: true }));

const Item = model('Item', new Schema({
  type: { type: String, enum: ['lost','found'], required: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, enum: CATEGORIES, default: 'Other' },
  description: String,
  location: { type: String, required: true },
  date: { type: Date, default: Date.now },
  photo: String,
  // open = in the queue / visible & matchable, claim_pending = removed from the queue while an admin reviews,
  // returned = handed back, cancelled = withdrawn by the reporter
  status: { type: String, enum: ['open','claim_pending','returned','cancelled'], default: 'open' },
  reporter: ref('User'),
  verificationQuestion: String,
  verificationAnswerHash: { type: String, select: false },
}, { timestamps: true }));

const matchSchema = new Schema({
  lost: ref('Item'), found: ref('Item'),
  score: { type: Number, min: 0, max: 100 },
  keywordScore: Number,
  aiScore: Number,
  method: { type: String, enum: ['keyword','ai','manual'], default: 'keyword' },
  reason: String,                      // AI explanation or "Linked manually by ..."
  photos: { type: Number, default: 0 }, // how many photos the AI looked at (0-2)
  createdBy: ref('User'),              // set for manual matches
  status: { type: String, enum: ['suggested','claimed','resolved','dismissed'], default: 'suggested' },
}, { timestamps: true });
matchSchema.index({ lost: 1, found: 1 }, { unique: true });
const Match = model('Match', matchSchema);

const Claim = model('Claim', new Schema({
  item: ref('Item'), match: ref('Match'), claimant: ref('User'), answer: String,
  side: { type: String, enum: ['owner','finder'], default: 'owner' }, // owner = lost reporter, finder = found reporter
  note: String,
  status: { type: String, enum: ['pending_review','approved','rejected'], default: 'pending_review' },
  reviewedBy: ref('User'), reviewedAt: Date,
}, { timestamps: true }));

const lockSchema = new Schema({ user: ref('User'), item: ref('Item'), until: Date });
lockSchema.index({ until: 1 }, { expireAfterSeconds: 0 });
lockSchema.index({ user: 1, item: 1 }, { unique: true });
const ClaimLock = model('ClaimLock', lockSchema);

const Notification = model('Notification', new Schema({
  user: ref('User'), message: String, item: ref('Item'),
  kind: { type: String, enum: ['match','claim','info'], default: 'info' },
  read: { type: Boolean, default: false },
}, { timestamps: true }));

module.exports = { User, Item, Match, Claim, ClaimLock, Notification, CATEGORIES };