let siteData = null;
let repoOwner = localStorage.getItem('gh_owner') || '';
let repoName = localStorage.getItem('gh_repo') || '';
let githubToken = localStorage.getItem('gh_token') || '';
let likedPosts = JSON.parse(localStorage.getItem('liked_posts') || '[]');

document.addEventListener('DOMContentLoaded', async () => {
  loadUserPreferences();
  await fetchSiteData();
  if (githubToken && repoOwner && repoName) {
    enableAdminUI();
  }
});

function loadUserPreferences() {
  const savedTheme = localStorage.getItem('site_theme') || 'dark';
  const savedFont = localStorage.getItem('site_font') || 'medium';
  document.documentElement.setAttribute('data-theme', savedTheme);
  document.documentElement.setAttribute('data-font', savedFont);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('site_theme', theme);
}

function setFontSize(size) {
  document.documentElement.setAttribute('data-font', size);
  localStorage.setItem('site_font', size);
}

// GitHub'dan data.json verisini çek
async function fetchSiteData() {
  try {
    // Eğer repo bilgileri kayıtlı değilse varsayılan olarak bulunduğumuz host'tan tahmin etmeye çalış veya data.json'ı direkt çek
    let owner = repoOwner || 'utku'; // ilk açılış için
    let repo = repoName || 'kisisel-galeri';
    
    // Doğrudan aynı dizindeki data.json'ı okumayı dene (hızlı yükleme için)
    const res = await fetch('data.json?t=' + Date.now());
    siteData = await res.json();
    renderSite();
  } catch (err) {
    console.error('Veri yüklenemedi:', err);
  }
}

// GitHub API üzerinden data.json ve dosyaları güncelleme fonksiyonları
async function getGitHubFile(path) {
  const url = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${githubToken}`, 'Accept': 'application/vnd.github.v3+json' },
    cache: 'no-store'
  });
  return await res.json();
}

async function updateGitHubFile(path, contentObj, message) {
  const fileData = await getGitHubFile(path);
  const sha = fileData.sha;
  const url = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path}`;
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(contentObj, null, 2))));

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message, content: encoded, sha })
  });
  return res.ok;
}

async function uploadImageToGitHub(base64Data, fileName) {
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const path = `uploads/${Date.now()}_${fileName}`;
  const url = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: `Görsel yüklendi: ${fileName}`,
      content: cleanBase64
    })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Resim yüklenemedi');
  return `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/${path}`;
}

// Yönetici Token Doğrulama
async function verifyAdminToken() {
  repoOwner = document.getElementById('repo-owner').value.trim();
  repoName = document.getElementById('repo-name').value.trim();
  githubToken = document.getElementById('github-token').value.trim();

  if (!repoOwner || !repoName || !githubToken) {
    return alert('Lütfen tüm alanları doldurun!');
  }

  // Test isteği atalım
  const testRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/data.json`, {
    headers: { 'Authorization': `Bearer ${githubToken}` }
  });

  if (testRes.ok) {
    localStorage.setItem('gh_owner', repoOwner);
    localStorage.setItem('gh_repo', repoName);
    localStorage.setItem('gh_token', githubToken);
    closeModal('login-modal');
    enableAdminUI();
    alert('Yönetici girişi başarılı!');
  } else {
    alert('Bağlantı kurulamadı! Kullanıcı adı, repo adı veya Token hatalı.');
  }
}

function enableAdminUI() {
  document.getElementById('admin-panel-btn').classList.remove('hidden');
  document.getElementById('edit-username').value = siteData.profile.username;
  document.getElementById('edit-bio').value = siteData.profile.bio;
  document.getElementById('edit-about').value = siteData.profile.about;
  document.getElementById('edit-purpose').value = siteData.profile.purpose;
}

// Arayüzü Çiz
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

  // Ana Sayfa Akışı
  const feed = document.getElementById('feed-container');
  feed.innerHTML = posts.length === 0 ? '<p style="text-align:center;color:var(--muted)">Henüz fotoğraf paylaşılmamış.</p>' : '';

  posts.forEach(post => {
    const isLiked = likedPosts.includes(post.id);
    const deleteBtn = githubToken 
      ? `<button class="icon-btn" onclick="deletePost('${post.id}')" title="Sil"><i class="fa-solid fa-trash"></i></button>` 
      : '';

    const commentsHtml = (post.comments || []).map(c => 
      `<div class="comment-item"><strong>${escapeHtml(c.author)}:</strong> ${escapeHtml(c.text)}</div>`
    ).join('');

    feed.innerHTML += `
      <article class="post-card">
        <div class="post-header">
          <div class="post-author">
            <img src="${profile.avatar}" alt="PP">
            <span>@${escapeHtml(profile.username)}</span>
          </div>
          ${deleteBtn}
        </div>
        <img src="${post.image}" class="post-img" alt="Gönderi">
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
              <input type="text" class="text-in" placeholder="Yorum ekle..." required>
              <button type="submit" class="btn-primary">Gönder</button>
            </form>
          </div>
        </div>
      </article>
    `;
  });

  // Resimler Izgara
  const grid = document.getElementById('gallery-grid');
  grid.innerHTML = posts.map(p => `<img src="${p.image}" onclick="switchTab('home')" title="${escapeHtml(p.caption)}">`).join('');
}

// Yeni Gönderi Yükle
async function submitPost() {
  const fileInput = document.getElementById('post-image-file');
  const caption = document.getElementById('post-caption').value;
  if (!fileInput.files[0]) return alert('Lütfen bir resim seçin!');

  const btn = document.getElementById('upload-post-btn');
  btn.disabled = true;
  btn.textContent = 'GitHub’a Yükleniyor...';

  try {
    const base64 = await toBase64(fileInput.files[0]);
    const imageUrl = await uploadImageToGitHub(base64, fileInput.files[0].name);

    const newPost = {
      id: Date.now().toString(),
      image: imageUrl,
      caption: caption || '',
      likes: 0,
      comments: [],
      date: new Date().toLocaleDateString('tr-TR')
    };

    siteData.posts.unshift(newPost);
    await updateGitHubFile('data.json', siteData, 'Yeni gönderi eklendi');

    fileInput.value = '';
    document.getElementById('post-caption').value = '';
    closeModal('admin-modal');
    renderSite();
    alert('Başarıyla paylaşıldı!');
  } catch (err) {
    alert('Hata: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "GitHub'a Yükle ve Paylaş";
  }
}

// Profil / Hakkımda / Amacım Güncelle
async function saveProfile() {
  const btn = document.getElementById('save-profile-btn');
  btn.disabled = true;
  btn.textContent = 'Kaydediliyor...';

  try {
    const ppFile = document.getElementById('pp-image-file').files[0];
    if (ppFile) {
      const base64 = await toBase64(ppFile);
      siteData.profile.avatar = await uploadImageToGitHub(base64, ppFile.name);
    }

    siteData.profile.username = document.getElementById('edit-username').value;
    siteData.profile.bio = document.getElementById('edit-bio').value;
    siteData.profile.about = document.getElementById('edit-about').value;
    siteData.profile.purpose = document.getElementById('edit-purpose').value;

    await updateGitHubFile('data.json', siteData, 'Profil güncellendi');
    closeModal('admin-modal');
    renderSite();
    alert('Değişiklikler kaydedildi!');
  } catch (err) {
    alert('Hata: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Bilgileri Kaydet';
  }
}

// Gönderi Sil
async function deletePost(id) {
  if (!confirm('Bu gönderiyi silmek istediğine emin misin?')) return;
  siteData.posts = siteData.posts.filter(p => p.id !== id);
  await updateGitHubFile('data.json', siteData, 'Gönderi silindi');
  renderSite();
}

// Beğeni (Anonim)
async function toggleLike(postId) {
  const alreadyLiked = likedPosts.includes(postId);
  if (alreadyLiked) {
    likedPosts = likedPosts.filter(id => id !== postId);
  } else {
    likedPosts.push(postId);
  }
  localStorage.setItem('liked_posts', JSON.stringify(likedPosts));

  const post = siteData.posts.find(p => p.id === postId);
  if (post) {
    post.likes = (post.likes || 0) + (alreadyLiked ? -1 : 1);
    if (post.likes < 0) post.likes = 0;
    await updateGitHubFile('data.json', siteData, 'Beğeni güncellendi');
    renderSite();
  }
}

// Yorum (Anonim)
async function submitComment(e, postId) {
  e.preventDefault();
  const form = e.target;
  const author = form.querySelector('.author-in').value || 'Ziyaretçi';
  const text = form.querySelector('.text-in').value;

  const post = siteData.posts.find(p => p.id === postId);
  if (post) {
    post.comments.push({
      id: Date.now().toString(),
      author: author.trim().slice(0, 25),
      text: text.trim().slice(0, 300),
      date: new Date().toLocaleDateString('tr-TR')
    });
    await updateGitHubFile('data.json', siteData, 'Yeni yorum eklendi');
    renderSite();
  }
}

// Yardımcı Fonksiyonlar
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

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
