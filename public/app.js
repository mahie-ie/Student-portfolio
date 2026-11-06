const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
let currentUser = null;
let toastTimer;
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Something went wrong.');
  return data;
}
function showMessage(element, message = '') { if (element) element.textContent = message; }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600); }
function showAuth() { $('#authView').classList.remove('hidden'); $('#appView').classList.add('hidden'); }
function showApp() { $('#authView').classList.add('hidden'); $('#appView').classList.remove('hidden'); window.scrollTo(0, 0); }
function setMode(mode) {
  const register = mode === 'register';
  $$('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode));
  $('#nameField').classList.toggle('hidden', !register);
  $('#nameField input').required = register;
  $('#authTitle').innerHTML = register ? 'Create your <span class="accent-word">account.</span>' : 'Sign in to your <span class="accent-word">portfolio.</span>';
  $('#authSubtitle').textContent = register ? 'Save your profile and projects in one place.' : 'Enter your email and password to continue.';
  $('#authButtonText').textContent = register ? 'Create your portfolio' : 'Sign in';
  $('#authForm [name="password"]').autocomplete = register ? 'new-password' : 'current-password';
  showMessage($('#authMessage'));
}
function render(user) {
  currentUser = user;
  const isNewPortfolio = !user.bio?.trim() && !user.location?.trim() && !(user.skills || []).length && !(user.projects || []).length;
  $('#portfolioHint').textContent = isNewPortfolio
    ? 'Add your profile details, skills and first project to get started.'
    : 'Use Edit profile, Edit skills and Add a project to update your portfolio.';
  $('#navName').textContent = user.name;
  $('#displayName').innerHTML = `${escapeHtml(user.name)}<br><em><span class="accent-word">Portfolio</span></em>`;
  $('#avatar').textContent = user.name.trim().charAt(0).toUpperCase() || 'S';
  $('#displayHeadline').textContent = !user.headline || user.headline === 'Student • Aspiring creator' ? 'Student' : user.headline;
  $('#displayLocation').textContent = user.location || 'Location not added';
  $('#displayBio').textContent = user.bio || 'Add a short introduction about yourself.';
  renderProjects(user.projects || []);
  renderSkills(user.skills || []);
  showApp();
}
function showPortfolioSavedMessage() {
  $('#portfolioHint').textContent = 'Your profile and project changes are saved to your account.';
}
function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function safeLink(value = '') { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }
function renderProjects(projects) {
  const root = $('#projectList');
  if (!projects.length) {
    root.innerHTML = '<div class="empty-state">No projects added yet.<button class="text-button" id="emptyAdd">Add your first project <span>↗</span></button></div>';
    $('#emptyAdd').addEventListener('click', () => openProject());
    return;
  }
  root.innerHTML = projects.map((project, index) => {
    const link = safeLink(project.link);
    return `<article class="project-card"><span class="project-number">PROJECT / ${String(index + 1).padStart(2, '0')}</span>${link ? `<a class="project-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(project.title)}">↗</a>` : ''}<h3>${escapeHtml(project.title)}</h3><p>${escapeHtml(project.description)}</p>${project.tech ? `<div class="project-tags">${escapeHtml(project.tech)}</div>` : ''}<div class="project-actions"><button data-edit="${project._id}">Edit</button><button data-delete="${project._id}">Delete</button></div></article>`;
  }).join('');
  $$('[data-edit]', root).forEach(button => button.addEventListener('click', () => openProject(projects.find(p => p._id === button.dataset.edit))));
  $$('[data-delete]', root).forEach(button => button.addEventListener('click', () => removeProject(button.dataset.delete)));
}
function renderSkills(skills) {
  $('#skillList').innerHTML = skills.length ? skills.map(skill => `<span class="skill-chip">${escapeHtml(skill)}</span>`).join('') : '<span class="skill-empty">Add the tools and skills you’re picking up.</span>';
}
$$('.tab').forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
$('#authForm').addEventListener('submit', async event => {
  event.preventDefault();
  const authForm = event.currentTarget;
  const form = new FormData(authForm);
  const register = !$('#nameField').classList.contains('hidden');
  const payload = { email: form.get('email'), password: form.get('password') };
  if (register) payload.name = form.get('name');
  try {
    const data = await api(register ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
    authForm.reset();
    render(data.user);
  } catch (error) { showMessage($('#authMessage'), error.message); }
});
$('#logoutBtn').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); currentUser = null; showAuth(); setMode('login'); toast('You’re signed out. See you soon.'); }
  catch (error) { toast(error.message); }
});
function openDialog(id) { $(id).showModal(); }
$$('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$$('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
$('#editProfileBtn').addEventListener('click', () => {
  const form = $('#profileForm'); for (const key of ['name', 'headline', 'location', 'bio']) form.elements[key].value = currentUser[key] || '';
  showMessage($('[data-form-message]', form)); openDialog('#profileDialog');
});
$('#profileForm').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget, values = Object.fromEntries(new FormData(form));
  try { const data = await api('/api/me', { method: 'PATCH', body: JSON.stringify(values) }); form.closest('dialog').close(); render(data.user); showPortfolioSavedMessage(); toast('Profile updated.'); }
  catch (error) { showMessage($('[data-form-message]', form), error.message); }
});
$('#editSkillsBtn').addEventListener('click', () => {
  const form = $('#skillsForm'); form.elements.skills.value = (currentUser.skills || []).join(', '); showMessage($('[data-form-message]', form)); openDialog('#skillsDialog');
});
$('#skillsForm').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget;
  const skills = form.elements.skills.value.split(',').map(value => value.trim()).filter(Boolean).slice(0, 12);
  try { const data = await api('/api/me', { method: 'PATCH', body: JSON.stringify({ skills }) }); form.closest('dialog').close(); render(data.user); showPortfolioSavedMessage(); toast('Your skills are updated.'); }
  catch (error) { showMessage($('[data-form-message]', form), error.message); }
});
function openProject(project = null) {
  const form = $('#projectForm'); form.reset(); form.elements.projectId.value = project?._id || '';
  $('#projectModalTitle').textContent = project ? 'Edit your project' : 'Add a project';
  for (const key of ['title', 'description', 'tech', 'link']) form.elements[key].value = project?.[key] || '';
  showMessage($('[data-form-message]', form)); openDialog('#projectDialog');
}
$('#addProjectBtn').addEventListener('click', () => openProject());
$('#projectForm').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget, values = Object.fromEntries(new FormData(form));
  const id = values.projectId; delete values.projectId;
  try {
    const data = await api(id ? `/api/projects/${encodeURIComponent(id)}` : '/api/projects', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(values) });
    currentUser.projects = data.projects; renderProjects(data.projects); form.closest('dialog').close(); showPortfolioSavedMessage(); toast(id ? 'Project updated.' : 'Project added.');
  } catch (error) { showMessage($('[data-form-message]', form), error.message); }
});
async function removeProject(id) {
  const project = currentUser.projects.find(item => item._id === id);
  if (!project || !window.confirm(`Delete “${project.title}”?`)) return;
  try { const data = await api(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }); currentUser.projects = data.projects; renderProjects(data.projects); showPortfolioSavedMessage(); toast('Project deleted.'); }
  catch (error) { toast(error.message); }
}
(async function init() {
  try { const data = await api('/api/me'); render(data.user); }
  catch { showAuth(); }
})();



