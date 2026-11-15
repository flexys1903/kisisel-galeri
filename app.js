let siteData = null;
let isAdmin = sessionStorage.getItem('is_admin') === 'true';
let likedPosts = JSON.parse(localStorage.getItem('liked_posts') || '[]');

document.addEventListener('DOMContentLoaded', async () => {
  loadUserPreferences();
  await fetchSiteData();
  await checkUserIPAndLog();
});

function loadUserPreferences() {
  document.documentElement.setAttribute('data-theme', localStorage.getItem('site_theme') || 'dark');
  document.documentElement.setAttribute('data-font', localStorage.getItem('site_font') || 'medium');
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('site_theme', theme);
}

function setFontSize(size) {
  document.documentElement.setAttribute('data-font', size);
  localStorage.setItem('site_font', size);
}

async function fetchSiteData() {
  try {
    const res = await fetch('data.json?t=' + Date.now());
    siteData = await res.json();
    renderSite();
  } catch (err) {
    console.error('Veri yüklenemedi', err);
  }
}

async function checkUserIPAndLog() {
  try {
    const ipRes = await fetch('https://api.ipify.org?format=json');
    const { ip } = await ipRes.json();

    if (siteData && siteData.adminIp) {
      if (!siteData.visitors) siteData.visitors = [];
      const timeNow = new Date().toLocaleString('tr-TR');
      
      const existing = siteData.visitors.find(v => v.ip === ip);
      if (!existing) {
        siteData.visitors.unshift({ ip, date: timeNow });
      }

      if (ip === siteData.adminIp && !isAdmin && !sessionStorage.getItem('ip_prompt_shown')) {
        sessionStorage.setItem('ip_prompt_shown', 'true');
        openModal('ip-prompt-modal');
      }
    }
  } catch (err) {
    console.error('IP kontrolü yapılamadı', err);
  }
}

function acceptAdmin() {
  isAdmin = true;
  sessionStorage.setItem('is_admin', 'true');
  closeModal('ip-prompt-modal');
  enableAdminUI();
  renderSite();
  alert('Yönetici olarak giriş yapıldı!');
}

function enableAdminUI() {
  document.getElementById('admin-panel-btn').classList.remove('hidden');
  document.getElementById('edit-username').value = siteData.profile.username;
  document.getElementById('edit-bio').value = siteData.profile.bio;
  document.getElementById('edit-about').value = siteData.profile.about;
  document.getElementById('edit-purpose').value = siteData.profile.purpose;
  renderVisitorLogs();
}

function renderVisitorLogs() {
  const container = document.getElementById('logs-container');
  if (!siteData.visitors || siteData.visitors.length === 0) {
    container.innerHTML = '<p>Henüz ziyaretçi kaydı yok.</p>';
    return;
  }
  container.innerHTML = siteData.visitors.map(v => `
    <div class="log-item">
      <span><i class="fa-solid fa-globe"></i> <strong>${v.ip}</strong></span>
      <span style="color:var(--muted)">${v.date}</span>
    </div>
  `).join('');
}

function renderSite() {
  const { profile, posts } = siteData;
  document.getElementById('nav-avatar').src = profile.avatar;
  document.getElementById('profile-avatar').src = profile.avatar;
  document.getElementById('nav-username').textContent = `@${profile.username}`;
  document.getElementById('profile-name').textContent = `@${profile.username}`;
  document.getElementById('profile-bio').textContent = profile.bio;
  document.getElementById('total-posts').textContent = posts.length;
  document.getElementById('about-text').textContent = profile.about;
  document.getElementById('purpose-text').textContent = profile.purpose;

  const feed = document.getElementById('feed-container');
  feed.innerHTML = posts.length === 0 ? '<p style="text-align:center;color:var(--muted)">Henüz gönderi yok.</p>' : '';

  posts.forEach(post => {
    const isLiked = likedPosts.includes(post.id);
    const deleteBtn = isAdmin ? `<button class="icon-btn" onclick="deletePost('${post.id}')" title="Sil"><i class="fa-solid fa-trash"></i></button>` : '';
    const commentsHtml = (post.comments || []).map(c => `<div class="comment-item"><strong>${escapeHtml(c.author)}:</strong> ${escapeHtml(c.text)}</div>`).join('');

    feed.innerHTML += `
      <article class="post-card">
        <div class="post-header">
          <div class="post-author">
            <img src="${profile.avatar}" alt="PP">
            <span>@${escapeHtml(profile.username)}</span>
          </div>
          ${deleteBtn}
        </div>
        <img src="${post.image}" class="post-img" alt="Post">
        <div class="post-body">
          <div class="post-actions">
            <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${post.id}')">
              <i class="${isLiked ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
              <span>${post.likes || 0}</span>
            </button>
          </div>
          <p class="post-caption"><strong>@${escapeHtml(profile.username)}</strong> ${escapeHtml(post.caption)}</p>
          <span class="post-date">${post.date}</span>
          <div class="comments-box">
            ${commentsHtml}
            <form class="comment-form" onsubmit="submitComment(event, '${post.id}')">
              <input type="text" class="author-in" placeholder="Adın">
              <input type="text" class="text-in" placeholder="Yorum yaz..." required>
              <button type="submit" class="btn-primary">Gönder</button>
            </form>
          </div>
        </div>
      </article>
    `;
  });

  const grid = document.getElementById('gallery-grid');
  grid.innerHTML = posts.map(p => `<img src="${p.image}" onclick="switchTab('home')" title="${escapeHtml(p.caption)}">`).join('');

  if (isAdmin) enableAdminUI();
}

// Dosyayı Doğrudan Base64'e Çevirerek Kesin Yükleme (Sıfır Hata)
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

// Yeni Post Ekle
async function submitPost() {
  const fileInput = document.getElementById('post-image-file');
  const caption = document.getElementById('post-caption').value;
  if (!fileInput.files[0]) return alert('Lütfen bir resim seçin!');

  const btn = document.getElementById('upload-post-btn');
  btn.disabled = true;
  btn.textContent = 'Yükleniyor...';

  try {
    const base64Image = await toBase64(fileInput.files[0]);

    siteData.posts.unshift({
      id: Date.now().toString(),
      image: base64Image,
      caption: caption || '',
      likes: 0,
      comments: [],
      date: new Date().toLocaleDateString('tr-TR')
    });

    fileInput.value = '';
    document.getElementById('post-caption').value = '';
    closeModal('admin-modal');
    renderSite();
    alert('Post başarıyla paylaşıldı!');
  } catch (err) {
    alert('Resim yüklenirken bir hata oluştu.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Paylaş';
  }
}

// Profil Kaydet (PP Değiştirme Dahil)
async function saveProfile() {
  try {
    const ppFile = document.getElementById('pp-image-file').files[0];
    if (ppFile) {
      siteData.profile.avatar = await toBase64(ppFile);
    }
    siteData.profile.username = document.getElementById('edit-username').value;
    siteData.profile.bio = document.getElementById('edit-bio').value;
    siteData.profile.about = document.getElementById('edit-about').value;
    siteData.profile.purpose = document.getElementById('edit-purpose').value;

    closeModal('admin-modal');
    renderSite();
    alert('Profil güncellendi!');
  } catch (err) {
    alert('Profil güncellenemedi.');
  }
}

function deletePost(id) {
  if (!confirm('Bu gönderiyi silmek istediğine emin misin?')) return;
  siteData.posts = siteData.posts.filter(p => p.id !== id);
  renderSite();
}

function toggleLike(postId) {
  const alreadyLiked = likedPosts.includes(postId);
  if (alreadyLiked) likedPosts = likedPosts.filter(id => id !== postId);
  else likedPosts.push(postId);
  localStorage.setItem('liked_posts', JSON.stringify(likedPosts));

  const post = siteData.posts.find(p => p.id === postId);
  if (post) {
    post.likes = (post.likes || 0) + (alreadyLiked ? -1 : 1);
    if (post.likes < 0) post.likes = 0;
    renderSite();
  }
}

function submitComment(e, postId) {
  e.preventDefault();
  const form = e.target;
  const author = form.querySelector('.author-in').value || 'Ziyaretçi';
  const text = form.querySelector('.text-in').value;

  const post = siteData.posts.find(p => p.id === postId);
  if (post) {
    post.comments.push({ id: Date.now().toString(), author: author.slice(0, 25), text: text.slice(0, 300), date: new Date().toLocaleDateString('tr-TR') });
    renderSite();
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');
  document.querySelector(`.nav-btn[data-tab="${tabName}"]`).classList.add('active');
}

function switchAdminSubTab(sub, btn) {
  document.querySelectorAll('.admin-sub').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.admin-tabs button').forEach(b => b.classList.remove('active'));
  document.getElementById(`admin-${sub}`).classList.remove('hidden');
  btn.classList.add('active');
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
