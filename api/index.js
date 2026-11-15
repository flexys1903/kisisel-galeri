const express = require('express');
const app = express();

app.use(express.json({ limit: '15mb' })); // Yüksek çözünürlüklü resimler için limit

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER; // GitHub kullanıcı adın
const GITHUB_REPO = process.env.GITHUB_REPO;   // Repo adın
const ADMIN_IPS = (process.env.ADMIN_IPS || '').split(',').map(ip => ip.trim());
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const headers = {
  'Authorization': `Bearer ${GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
  'User-Agent': 'Vercel-Gallery-App'
};

// GitHub'dan data.json okuma
async function getData() {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data.json`;
  const res = await fetch(url, { headers, cache: 'no-store' });
  const json = await res.json();
  const content = JSON.parse(Buffer.from(json.content, 'base64').toString('utf-8'));
  return { content, sha: json.sha };
}

// GitHub'daki data.json dosyasını güncelleme
async function updateData(newContent, sha, message) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data.json`;
  const encoded = Buffer.from(JSON.stringify(newContent, null, 2)).toString('base64');
  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ message, content: encoded, sha })
  });
  return res.ok;
}

// GitHub'a resim yükleme
async function uploadImageToGitHub(base64Data, fileName) {
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const path = `uploads/${Date.now()}_${fileName}`;
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  
  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Görsel yüklendi: ${fileName}`,
      content: cleanBase64
    })
  });

  if (!res.ok) throw new Error('Resim GitHub’a yüklenemedi');
  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/${path}`;
}

// 1. Verileri Getir ve IP Kontrolü Yap
app.get('/api/init', async (req, res) => {
  try {
    const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const isAdminIp = ADMIN_IPS.includes(clientIp);
    const { content } = await getData();
    res.json({ data: content, isAdminIp, detectedIp: clientIp });
  } catch (err) {
    res.status(500).json({ error: 'Veri çekilemedi' });
  }
});

// 2. Yönetici Şifre Doğrulama
app.post('/api/verify-admin', (req, res) => {
  const { password } = req.body;
  if (password && password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Hatalı şifre!' });
  }
});

// 3. Yeni Gönderi Ekle (Yönetici)
app.post('/api/post', async (req, res) => {
  const { password, imageBase64, fileName, caption } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Yetkisiz işlem' });

  try {
    const imageUrl = await uploadImageToGitHub(imageBase64, fileName);
    const { content, sha } = await getData();
    
    const newPost = {
      id: Date.now().toString(),
      image: imageUrl,
      caption: caption || '',
      likes: 0,
      comments: [],
      date: new Date().toLocaleDateString('tr-TR')
    };

    content.posts.unshift(newPost);
    await updateData(content, sha, 'Yeni gönderi eklendi');
    res.json({ success: true, data: content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Gönderi Sil (Yönetici)
app.delete('/api/post/:id', async (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Yetkisiz işlem' });

  try {
    const { content, sha } = await getData();
    content.posts = content.posts.filter(p => p.id !== req.params.id);
    await updateData(content, sha, 'Gönderi silindi');
    res.json({ success: true, data: content });
  } catch (err) {
    res.status(500).json({ error: 'Silme başarısız' });
  }
});

// 5. Profil Ayarları, PP, Hakkımda ve Amacım Güncelleme (Yönetici)
app.post('/api/profile', async (req, res) => {
  const { password, username, bio, about, purpose, avatarBase64, avatarName } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Yetkisiz işlem' });

  try {
    const { content, sha } = await getData();
    if (avatarBase64) {
      content.profile.avatar = await uploadImageToGitHub(avatarBase64, avatarName || 'pp.png');
    }
    if (username !== undefined) content.profile.username = username;
    if (bio !== undefined) content.profile.bio = bio;
    if (about !== undefined) content.profile.about = about;
    if (purpose !== undefined) content.profile.purpose = purpose;

    await updateData(content, sha, 'Profil bilgileri güncellendi');
    res.json({ success: true, data: content });
  } catch (err) {
    res.status(500).json({ error: 'Profil güncellenemedi' });
  }
});

// 6. Anonim Beğeni Atma
app.post('/api/like/:id', async (req, res) => {
  try {
    const { content, sha } = await getData();
    const post = content.posts.find(p => p.id === req.params.id);
    if (post) {
      post.likes = (post.likes || 0) + (req.body.unlike ? -1 : 1);
      if (post.likes < 0) post.likes = 0;
      await updateData(content, sha, 'Beğeni güncellendi');
    }
    res.json({ success: true, data: content });
  } catch (err) {
    res.status(500).json({ error: 'Beğeni işlenemedi' });
  }
});

// 7. Anonim Yorum Yapma
app.post('/api/comment/:id', async (req, res) => {
  const { author, text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Boş yorum atılamaz' });

  try {
    const { content, sha } = await getData();
    const post = content.posts.find(p => p.id === req.params.id);
    if (post) {
      post.comments.push({
        id: Date.now().toString(),
        author: (author || 'Ziyaretçi').trim().slice(0, 25),
        text: text.trim().slice(0, 300),
        date: new Date().toLocaleDateString('tr-TR')
      });
      await updateData(content, sha, 'Yeni yorum eklendi');
    }
    res.json({ success: true, data: content });
  } catch (err) {
    res.status(500).json({ error: 'Yorum eklenemedi' });
  }
});

module.exports = app;
