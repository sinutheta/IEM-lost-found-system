require('dotenv').config();
const mongoose = require('mongoose'), bcrypt = require('bcryptjs');
const { User, Item, Match, Claim, ClaimLock, Notification } = require('./models');
const { runMatching } = require('./matching');
const day = (n) => new Date(Date.now() - n * 864e5);
(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/iem_lost_found');
  await Promise.all([User, Item, Match, Claim, ClaimLock, Notification].map((m) => m.deleteMany({})));
  const h = await bcrypt.hash('password123', 10);
  const [admin, desk, student] = await User.create([
    { name: 'Admin', email: 'admin@iem.edu.in', passwordHash: h, userType: 'admin' },
    { name: 'Security Desk', email: 'security@iem.edu.in', passwordHash: h, userType: 'staff', department: 'Administration' },
    { name: 'Demo Student', email: 'student@iem.edu.in', passwordHash: h },
  ]);
  const ans = (a) => bcrypt.hashSync(a, 8);
  const items = [
    { type: 'found', name: 'Black Wallet', category: 'Wallet', description: 'Leather wallet with college ID visible inside. Found near the reading section on 2nd floor.', location: 'Library, 2nd Floor', date: day(2), reporter: desk._id, verificationQuestion: 'Whose name is on the ID card inside?', verificationAnswerHash: ans('rahul') },
    { type: 'lost', name: 'Blue Water Bottle', category: 'Bottle', description: 'Blue steel bottle with a sticker', location: 'College Canteen', date: day(0), reporter: student._id },
    { type: 'found', name: 'Student ID Card', category: 'ID Card', description: 'IEM student ID card', location: 'Main Gate', date: day(1), reporter: desk._id, verificationQuestion: 'What is the roll number?', verificationAnswerHash: ans('139') },
    { type: 'lost', name: 'USB Pen Drive', category: 'Electronics', description: 'Black 32GB pen drive', location: 'CSE Dept., Block B', date: day(3), reporter: student._id },
    { type: 'found', name: 'Blue Water Bottle', category: 'Bottle', description: 'Blue bottle with a cat sticker', location: 'College Canteen', date: day(0), reporter: desk._id, verificationQuestion: 'What sticker is on the bottle?', verificationAnswerHash: ans('cat') },
  ];
  for (const i of items) { const it = await Item.create(i); await runMatching(it); }
  console.log('Seeded. Logins (password123): admin@iem.edu.in, student@iem.edu.in, security@iem.edu.in');
  process.exit(0);
})();
