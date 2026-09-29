require('dotenv').config();
const express = require('express'), cors = require('cors'), mongoose = require('mongoose'), path = require('path'), fs = require('fs');
fs.mkdirSync(path.join(__dirname, '../uploads'), { recursive: true });
const app = express();
app.use(cors(), express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.get('/', (req, res) => res.json({ ok: true, service: 'IEM Lost & Found API' }));
app.use('/api', require('./routes'));
app.use((err, req, res, next) => { console.error(err); res.status(err.status || 500).json({ message: err.message || 'Server error' }); });
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/iem_lost_found')
  .then(() => app.listen(process.env.PORT || 3000, () => console.log('API on :' + (process.env.PORT || 3000))))
  .catch((e) => { console.error('MongoDB connection failed:', e.message); process.exit(1); });
