require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const app = express();
app.use(express.json({ limit: '30kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const projectSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 90 },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  link: { type: String, trim: true, maxlength: 300, default: '' },
  tech: { type: String, trim: true, maxlength: 120, default: '' }
}, { timestamps: true });
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 70 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  headline: { type: String, trim: true, maxlength: 120, default: 'Student' },
  bio: { type: String, trim: true, maxlength: 500, default: '' },
  location: { type: String, trim: true, maxlength: 80, default: '' },
  skills: { type: [String], default: [] },
  projects: { type: [projectSchema], default: [] }
}, { timestamps: true });
const User = mongoose.model('User', userSchema);
const cookieOptions = () => ({ httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 });
function issueToken(user) { return jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '7d' }); }
function auth(req, res, next) {
  try {
    const token = req.cookies.portfolio_token;
    if (!token) return res.status(401).json({ message: 'Please sign in to continue.' });
    req.userId = jwt.verify(token, process.env.JWT_SECRET).id;
    next();
  } catch { return res.status(401).json({ message: 'Your session has expired. Please sign in again.' }); }
}
function safeUser(user) {
  return { id: user._id, name: user.name, email: user.email, headline: user.headline, bio: user.bio, location: user.location, skills: user.skills, projects: user.projects };
}
function cleanText(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const name = cleanText(req.body.name, 70), email = cleanText(req.body.email, 160).toLowerCase();
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || typeof req.body.password !== 'string' || req.body.password.length < 8) return res.status(400).json({ message: 'Enter your name, a valid email, and a password with at least 8 characters.' });
    if (await User.exists({ email })) return res.status(409).json({ message: 'An account with this email already exists.' });
    const user = await User.create({ name, email, password: await bcrypt.hash(req.body.password, 12) });
    res.cookie('portfolio_token', issueToken(user), cookieOptions()).status(201).json({ user: safeUser(user) });
  } catch (err) { next(err); }
});
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = cleanText(req.body.email, 160).toLowerCase();
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await bcrypt.compare(req.body.password || '', user.password))) return res.status(401).json({ message: 'Email or password is incorrect.' });
    res.cookie('portfolio_token', issueToken(user), cookieOptions()).json({ user: safeUser(user) });
  } catch (err) { next(err); }
});
app.post('/api/auth/logout', (req, res) => res.clearCookie('portfolio_token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }).json({ message: 'Signed out.' }));
app.get('/api/me', auth, async (req, res, next) => {
  try { const user = await User.findById(req.userId); if (!user) return res.status(401).json({ message: 'Account not found.' }); res.json({ user: safeUser(user) }); }
  catch (err) { next(err); }
});
app.patch('/api/me', auth, async (req, res, next) => {
  try {
    const fields = {};
    if ('name' in req.body) fields.name = cleanText(req.body.name, 70);
    if ('headline' in req.body) fields.headline = cleanText(req.body.headline, 120);
    if ('bio' in req.body) fields.bio = cleanText(req.body.bio, 500);
    if ('location' in req.body) fields.location = cleanText(req.body.location, 80);
    if ('skills' in req.body) fields.skills = Array.isArray(req.body.skills) ? req.body.skills.map(x => cleanText(x, 30)).filter(Boolean).slice(0, 12) : [];
    if ('name' in fields && !fields.name) return res.status(400).json({ message: 'Name cannot be empty.' });
    const user = await User.findByIdAndUpdate(req.userId, { $set: fields }, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: 'Account not found.' });
    res.json({ user: safeUser(user) });
  } catch (err) { next(err); }
});
app.post('/api/projects', auth, async (req, res, next) => {
  try {
    const title = cleanText(req.body.title, 90), description = cleanText(req.body.description, 500);
    if (!title || !description) return res.status(400).json({ message: 'Project title and description are required.' });
    const user = await User.findById(req.userId);
    user.projects.unshift({ title, description, tech: cleanText(req.body.tech, 120), link: cleanText(req.body.link, 300) });
    await user.save(); res.status(201).json({ projects: user.projects });
  } catch (err) { next(err); }
});
app.patch('/api/projects/:projectId', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId), project = user?.projects.id(req.params.projectId);
    if (!project) return res.status(404).json({ message: 'Project not found.' });
    for (const key of ['title', 'description', 'tech', 'link']) if (key in req.body) project[key] = cleanText(req.body[key], key === 'description' ? 500 : key === 'title' ? 90 : key === 'link' ? 300 : 120);
    if (!project.title || !project.description) return res.status(400).json({ message: 'Project title and description are required.' });
    await user.save(); res.json({ projects: user.projects });
  } catch (err) { next(err); }
});
app.delete('/api/projects/:projectId', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId), project = user?.projects.id(req.params.projectId);
    if (!project) return res.status(404).json({ message: 'Project not found.' });
    project.deleteOne(); await user.save(); res.json({ projects: user.projects });
  } catch (err) { next(err); }
});
app.use('/api', (req, res) => res.status(404).json({ message: 'API route not found.' }));
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === 11000) return res.status(409).json({ message: 'An account with this email already exists.' });
  res.status(500).json({ message: 'Something went wrong. Please try again.' });
});
const port = Number(process.env.PORT) || 3000;
if (!process.env.JWT_SECRET) throw new Error('Set JWT_SECRET in your .env file.');
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/student_portfolio')
  .then(() => app.listen(port, () => console.log(`Student Portfolio running at http://localhost:${port}`)))
  .catch(err => { console.error('Could not connect to MongoDB:', err.message); process.exit(1); });
