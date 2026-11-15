const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Render Environment Variables (Render panelinden ayarlayacağız)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER; // GitHub kullanıcı adın
const GITHUB_REPO = process.env.GITHUB_REPO;   // Repo adın
const ADMIN_IP = process.env.ADMIN_IP || '66.249.67.65';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'utku1903';

const headers = {
  'Authorization': `Bearer ${GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
  'User-Agent': 'Render-Gallery-App'
};

// GitHub'dan data.json okuma
async function getData() {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data.json`;
  const res = await fetch(url, { headers });
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
  const path = `public/uploads/${Date.now()}_${fileName}`;
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  
  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Görsel yüklendi: ${fileName}`,
      content: cleanBase64
    })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Resim yüklenemedi');
  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/${path}`;
}

// 1. Başlangıç ve IP Kontrolü
app.get('/api/init', async (req, res) => {
  try {
    const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const isAdminIp = (clientIp === ADMIN_IP || clientIp.includes('127.0.0.1') || clientIp.includes('::1'));
    
    const { content } = await getData();

    // Ziyaretçiyi loglara ekle
    if (!content.visitors) content.visitors = [];
    const timeNow = new Date().toLocaleString('tr-TR');
    if (!content.visitors.find(v => v.ip === clientIp)) {
      content.visitors.unshift({ ip: clientIp, date: timeNow });
      // Arka planda logu kaydet (hata verse bile engelleme)
      const { sha } = await getData();
      await updateData(content, sha, 'Ziyaretçi kaydedildi').catch(() => {});
    }

    res.json({ data: content, isAdminIp });
  } catch (err) {
    res.status(500).json({ error: 'Veri alınamadı: ' + err.message });
  }
});

// 2. Şifre Doğrulama
app.post('/api/verify-admin', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Hatalı şifre!' });
  }
});

// 3. Yeni Gönderi Paylaş (Yönetici)
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
  const { password, id } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Yetkisiz işlem' });

  try {
    const { content, sha } = await getData();
    content.posts = content.posts.filter(p => p.id !== id);
    await updateData(content, sha, 'Gönderi silindi');
    res.json({ success: true, data: content });
  } catch (err) {
    res.status(500).json({ error: 'Silme başarısız' });
  }
});

// 5. Profil / Hakkımda / Amacım / PP Güncelle (Yönetici)
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

    await updateData(content, sha, 'Profil güncellendi');
    res.json({ success: true, data: content });
  } catch (err) {
    res.status(500).json({ error: 'Profil güncellenemedi' });
  }
});

// 6. Beğeni (Anonim)
app.post('/api/like/:id', async (req, res) => {
  try {
    const { unlike } = req.body;
    const { content, sha } = await getData();
    const post = content.posts.find(p => p.id === req.params.id);
    if (post) {
      post.likes = (post.likes || 0) + (unlike ? -1 : 1);
      if (post.likes < 0) post.likes = 0;
      await updateData(content, sha, 'Beğeni güncellendi');
    }
    res.json({ success: true, data: content });
  } catch (err) {
    res.status(500).json({ error: 'Beğeni kaydedilemedi' });
  }
});

// 7. Yorum (Anonim)
app.post('/api/comment/:id', async (req, res) => {
  const { author, text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Boş yorum' });

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
      await updateData(content, sha, 'Yorum eklendi');
    }
    res.json({ success: true, data: content });
  } catch (err) {
    res.status(500).json({ error: 'Yorum eklenemedi' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));
