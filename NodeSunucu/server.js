// Sunucu ayarlarımı burada yaptım, gerekli tüm paketleri dahil ettim.
// SQLite veritabanı tablolarımı da güvenli bir şekilde kurdum.
// Kullanıcı kayıtları, şifreleme ve WebSocket trafiğini buradan yönetiyorum.
require('dotenv').config();
const express = require('express');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 8080;
const SECRET_KEY = "gizli_anahtar_degistirin"; 

const onayBekleyenKullanicilar = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [eposta, data] of onayBekleyenKullanicilar.entries()) {
        if (now > data.expiresAt) {
            onayBekleyenKullanicilar.delete(eposta);
        }
    }
}, 15 * 60 * 1000);

const dbPath = path.join(__dirname, 'veritabani.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Veritabanı bağlantı hatası:", err.message);
    } else {
        console.log("SQLite veritabanına bağlanıldı.");
        db.run(`CREATE TABLE IF NOT EXISTS Kullanicilar (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kullanici_adi TEXT NOT NULL,
            eposta TEXT UNIQUE NOT NULL,
            dogum_tarihi DATE NOT NULL,
            sifre TEXT NOT NULL,
            reset_otp TEXT
        )`);
        
        db.run(`ALTER TABLE Kullanicilar ADD COLUMN reset_otp TEXT`, (err) => {});
    }
});

let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});
console.log(`Gerçek Mail Sunucusu Ayarlandı: ${process.env.EMAIL_USER}`);

app.use(helmet({ contentSecurityPolicy: false })); 
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../Istemci')));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    message: { basarili: false, mesaj: "Çok fazla istek gönderdiniz, lütfen daha sonra tekrar deneyin." }
});

const uploadsDir = path.join(__dirname, '../Istemci/uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, 
    fileFilter: (req, file, cb) => {
        
        const guvenliUzantilar = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.mp4', '.mp3', '.txt', '.doc', '.docx'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (!guvenliUzantilar.includes(ext)) {
            return cb(new Error("Bu dosya türüne (ör. çalıştırılabilir veya script içeren dosyalar) güvenlik nedeniyle izin verilmiyor."));
        }
        cb(null, true);
    }
});

app.post('/api/kayit', apiLimiter, async (req, res) => {
    let { kullaniciAdi, eposta, dogumTarihi, sifre } = req.body;

    if (!kullaniciAdi || !eposta || !dogumTarihi || !sifre) {
        return res.status(400).json({ basarili: false, mesaj: 'Tüm alanları doldurmalısınız.' });
    }

    kullaniciAdi = kullaniciAdi.trim();
    eposta = eposta.trim();
    sifre = sifre.trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(eposta) || eposta.length > 50) {
        return res.status(400).json({ basarili: false, mesaj: 'Geçersiz veya çok uzun bir e-posta adresi girdiniz.' });
    }

    if (kullaniciAdi.length < 3 || kullaniciAdi.length > 20) {
        return res.status(400).json({ basarili: false, mesaj: 'Kullanıcı adı 3 ile 20 karakter arasında olmalıdır.' });
    }

    if (sifre.length < 6 || sifre.length > 64 || !/\d/.test(sifre) || !/[a-zA-Z]/.test(sifre)) {
        return res.status(400).json({ basarili: false, mesaj: 'Şifreniz en az 6 karakter olmalı ve harf ile rakam içermelidir.' });
    }

    const bugun = new Date();
    const dogumGunu = new Date(dogumTarihi);
    let yas = bugun.getFullYear() - dogumGunu.getFullYear();
    const m = bugun.getMonth() - dogumGunu.getMonth();
    if (m < 0 || (m === 0 && bugun.getDate() < dogumGunu.getDate())) {
        yas--;
    }

    if (yas <= 14) {
        return res.status(400).json({ basarili: false, mesaj: 'Kayıt olabilmek için 14 yaşından büyük olmalısınız.' });
    }

    try {
        const hashliSifre = await bcrypt.hash(sifre, 10);
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString(); 

        db.get(`SELECT id FROM Kullanicilar WHERE eposta = ?`, [eposta], (err, row) => {
            if (err) return res.status(500).json({ basarili: false, mesaj: 'Veritabanı hatası.' });
            if (row) return res.status(400).json({ basarili: false, mesaj: 'Bu e-posta adresi zaten kayıtlı.' });

            onayBekleyenKullanicilar.set(eposta, {
                kullaniciAdi,
                eposta, 
                dogumTarihi,
                sifreHash: hashliSifre,
                otpCode,
                expiresAt: Date.now() + 15 * 60 * 1000
            });

            if (transporter && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
                transporter.sendMail({
                    from: `"ChimeVerse Güvenlik" <${process.env.EMAIL_USER}>`,
                    to: eposta,
                    subject: 'Hesap Doğrulama (OTP) Kodunuz',
                    text: `Merhaba ${kullaniciAdi},\n\nHesabınızı aktifleştirmek için 6 haneli doğrulama kodunuz: ${otpCode}\n\nBu kod 15 dakika geçerlidir.`
                }, (error, info) => {
                    if (!error) {
                        console.log('\n--- GERÇEK OTP GÖNDERİLDİ ---');
                        console.log('Alıcı: ' + eposta);
                        console.log('-----------------------------\n');
                    } else {
                        console.error('OTP Gönderim Hatası:', error);
                    }
                });
            } else {
                console.error('SMTP Ayarları (.env) eksik. Mail gönderilemedi!');
            }

            res.json({ basarili: true, mesaj: 'Kayıt başarılı! Lütfen e-postanıza gönderilen 6 haneli doğrulama kodunu giriniz.', yonlendir: 'dogrulama.html?eposta=' + encodeURIComponent(eposta) });
        });
    } catch (err) {
        res.status(500).json({ basarili: false, mesaj: 'Sunucu hatası.' });
    }
});

app.post('/api/dogrula', apiLimiter, (req, res) => {
    const { eposta, otp } = req.body;
    if (!eposta || !otp) return res.status(400).json({ basarili: false, mesaj: 'Lütfen doğrulama kodunu girin.' });

    const pendingUser = onayBekleyenKullanicilar.get(eposta);
    
    if (!pendingUser) {
        return res.status(400).json({ basarili: false, mesaj: 'Kayıt bulunamadı veya süresi dolmuş.' });
    }

    if (Date.now() > pendingUser.expiresAt) {
        onayBekleyenKullanicilar.delete(eposta);
        return res.status(400).json({ basarili: false, mesaj: 'Doğrulama kodunun süresi dolmuş (15 dakika). Lütfen tekrar kayıt olun.' });
    }

    if (pendingUser.otpCode === otp) {
        
        db.run(`INSERT INTO Kullanicilar (kullanici_adi, eposta, dogum_tarihi, sifre) VALUES (?, ?, ?, ?)`, 
            [pendingUser.kullaniciAdi, pendingUser.eposta, pendingUser.dogumTarihi, pendingUser.sifreHash], 
            function(err) {
                if (err) {
                    console.error("Doğrulama DB Insert Hatası:", err.message);
                    return res.status(500).json({ basarili: false, mesaj: 'Veritabanı hatası: ' + err.message });
                }

                onayBekleyenKullanicilar.delete(eposta);
                res.json({ basarili: true, mesaj: 'Hesabınız başarıyla doğrulandı! Artık giriş yapabilirsiniz.', yonlendir: 'giris.html' });
            }
        );
    } else {
        res.status(400).json({ basarili: false, mesaj: 'Hatalı doğrulama kodu. Lütfen e-postanızı kontrol edin.' });
    }
});

app.post('/api/giris', apiLimiter, (req, res) => {
    const { eposta, sifre } = req.body;

    if (!eposta || !sifre) {
        return res.status(400).json({ basarili: false, mesaj: 'E-posta veya şifre boş olamaz.' });
    }

    db.get(`SELECT * FROM Kullanicilar WHERE eposta = ?`, [eposta], async (err, kullanici) => {
        if (err) return res.status(500).json({ basarili: false, mesaj: 'Veritabanı hatası.' });
        
        if (kullanici && await bcrypt.compare(sifre, kullanici.sifre)) {
            
            const token = jwt.sign({ id: kullanici.id, kullaniciAdi: kullanici.kullanici_adi }, SECRET_KEY, { expiresIn: '24h' });
            res.json({ basarili: true, kullaniciAdi: kullanici.kullanici_adi, token });
        } else {
            res.status(401).json({ basarili: false, mesaj: 'E-posta veya şifre hatalı.' });
        }
    });
});

app.post('/api/sifre-sifirlama-talebi', apiLimiter, (req, res) => {
    const { eposta } = req.body;
    if (!eposta) return res.status(400).json({ basarili: false, mesaj: 'E-posta adresi gereklidir.' });

    db.get(`SELECT id, kullanici_adi FROM Kullanicilar WHERE eposta = ?`, [eposta], (err, kullanici) => {
        if (err) return res.status(500).json({ basarili: false, mesaj: 'Veritabanı hatası.' });
        if (!kullanici) return res.status(400).json({ basarili: false, mesaj: 'Bu e-posta adresine ait bir hesap bulunamadı.' });

        const resetOtpCode = Math.floor(100000 + Math.random() * 900000).toString(); 
        const expiresAt = Date.now() + 15 * 60 * 1000; 
        const dbResetString = `${resetOtpCode}|${expiresAt}`; 
        
        db.run(`UPDATE Kullanicilar SET reset_otp = ? WHERE eposta = ?`, [dbResetString, eposta], function(err) {
            if (err) return res.status(500).json({ basarili: false, mesaj: 'Sıfırlama kodu oluşturulamadı.' });

            if (transporter && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
                transporter.sendMail({
                    from: `"ChimeVerse Güvenlik" <${process.env.EMAIL_USER}>`,
                    to: eposta,
                    subject: 'Şifre Sıfırlama Kodunuz',
                    text: `Merhaba ${kullanici.kullanici_adi},\n\nŞifrenizi sıfırlamak için 6 haneli kodunuz: ${resetOtpCode}\n\nBu kod 15 dakika geçerlidir.`
                }, (error, info) => {
                    if (!error) {
                        console.log('\n--- ŞİFRE SIFIRLAMA KODU GÖNDERİLDİ ---');
                        console.log('Alıcı: ' + eposta);
                        console.log('---------------------------------------\n');
                    } else {
                        console.error('Şifre sıfırlama maili gönderilemedi:', error);
                    }
                });
            }
            res.json({ basarili: true, mesaj: 'Şifre sıfırlama kodu e-postanıza gönderildi.', yonlendir: 'yeni_sifre.html?eposta=' + encodeURIComponent(eposta) });
        });
    });
});

app.post('/api/yeni-sifre-belirle', apiLimiter, async (req, res) => {
    const { eposta, otp, yeniSifre } = req.body;
    
    if (!eposta || !otp || !yeniSifre) {
        return res.status(400).json({ basarili: false, mesaj: 'Tüm alanları doldurun.' });
    }

    if (yeniSifre.length < 6 || yeniSifre.length > 64 || !/\d/.test(yeniSifre) || !/[a-zA-Z]/.test(yeniSifre)) {
        return res.status(400).json({ basarili: false, mesaj: 'Şifreniz en az 6 karakter olmalı ve harf ile rakam içermelidir.' });
    }

    db.get(`SELECT id, reset_otp FROM Kullanicilar WHERE eposta = ?`, [eposta], async (err, kullanici) => {
        if (err || !kullanici) return res.status(400).json({ basarili: false, mesaj: 'Kullanıcı bulunamadı.' });

        if (!kullanici.reset_otp || !kullanici.reset_otp.includes('|')) {
            return res.status(400).json({ basarili: false, mesaj: 'Geçersiz veya süresi dolmuş kod.' });
        }

        const [storedOtp, expiryStr] = kullanici.reset_otp.split('|');
        const expiresAt = parseInt(expiryStr, 10);

        if (Date.now() > expiresAt) {
            db.run(`UPDATE Kullanicilar SET reset_otp = NULL WHERE eposta = ?`, [eposta]);
            return res.status(400).json({ basarili: false, mesaj: 'Şifre sıfırlama kodunuzun 15 dakikalık süresi dolmuş.' });
        }

        if (storedOtp === otp) {
            const hashliSifre = await bcrypt.hash(yeniSifre, 10);
            db.run(`UPDATE Kullanicilar SET sifre = ?, reset_otp = NULL WHERE eposta = ?`, [hashliSifre, eposta], function(err) {
                if (err) return res.status(500).json({ basarili: false, mesaj: 'Şifre güncellenemedi.' });
                res.json({ basarili: true, mesaj: 'Şifreniz başarıyla güncellendi! Giriş yapabilirsiniz.', yonlendir: 'giris.html' });
            });
        } else {
            res.status(400).json({ basarili: false, mesaj: 'Hatalı sıfırlama kodu girdiniz.' });
        }
    });
});

app.post('/api/upload', (req, res) => {
    upload.single('dosya')(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ basarili: false, mesaj: 'Dosya yükleme hatası: ' + err.message });
        } else if (err) {
            return res.status(400).json({ basarili: false, mesaj: err.message });
        }

        if (!req.file) {
            return res.status(400).json({ basarili: false, mesaj: 'Dosya yüklenemedi veya geçersiz tür.' });
        }
        
        res.json({ 
            basarili: true, 
            url: 'uploads/' + req.file.filename, 
            ad: req.file.originalname 
        });
    });
});

const baglantilar = {}; 
const odalar = {}; 
const ozelSohbetler = {}; 
let odaIdSayaci = 1;

wss.on('connection', (ws, req) => {

    let connectedUser = null;

    ws.on('message', (messageAsString) => {
        try {
            const message = JSON.parse(messageAsString);

            if (message.aksiyon === 'kayitOl') {
                const { token } = message;
                try {
                    const decoded = jwt.verify(token, SECRET_KEY); 
                    connectedUser = decoded.kullaniciAdi; 
                    baglantilar[connectedUser] = ws;

                    const odaIsimleri = Object.keys(odalar).map(odaAdi => ({ ad: odaAdi, kurucuAdi: odalar[odaAdi].kurucuAdi, kullaniciSayisi: odalar[odaAdi].uyeler.length }));
                    ws.send(JSON.stringify({ aksiyon: 'odalarListesiGuncelle', odalar: odaIsimleri }));

                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ aksiyon: 'kullaniciListesiGuncelle', kullanicilar: Object.keys(baglantilar) }));
                        }
                    });
                } catch(err) {
                    ws.send(JSON.stringify({ aksiyon: 'hata', mesaj: 'Geçersiz veya süresi dolmuş oturum. Lütfen tekrar giriş yapın.' }));
                    ws.close();
                }
                return;
            }

            if (!connectedUser) return; 

            switch (message.aksiyon) {
                case 'odaKur':
                    const yeniOda = message.odaAdi || `Oda ${odaIdSayaci++}`;
                    if (!odalar[yeniOda]) {
                        odalar[yeniOda] = { kurucuAdi: connectedUser, uyeler: [] }; 
                        herkeseOdaListesiGonder();
                    }
                    break;

                case 'odayaKatil':
                    const katilOda = message.odaAdi;
                    if (!odalar[katilOda]) {
                        odalar[katilOda] = { kurucuAdi: connectedUser, uyeler: [] };
                    }
                    
                    odalardanCikar(connectedUser);
                    odalar[katilOda].uyeler.push(connectedUser);
                    herkeseOdaListesiGonder();
                    odadakilereKullaniciListesiGonder(katilOda);
                    break;
                
                case 'odadanCik':
                    odalardanCikar(connectedUser);
                    break;

                case 'yeniMesaj':
                    
                    message.kullaniciAdi = connectedUser; 
                    odadakilereMesajGonder(message.odaAdi, message);
                    break;
                
                case 'ozelMesaj':
                    const hedefWs = baglantilar[message.alici];
                    if (hedefWs && hedefWs.readyState === WebSocket.OPEN) {
                        hedefWs.send(JSON.stringify(message));
                    }
                    break;

                case 'teklif':
                case 'cevap':
                case 'aday':
                case 'aramaDaveti':
                case 'davetKabul':
                case 'davetRed':
                case 'gorusmeSonlandi':
                case 'kameraDurumu':
                case 'sesDurumu':
                    const hedefPeer = baglantilar[message.hedef];
                    if (hedefPeer && hedefPeer.readyState === WebSocket.OPEN) {
                        hedefPeer.send(JSON.stringify(message));
                    }
                    break;
                
                case 'odaKapat':
                    const kapananOda = message.odaAdi;
                    if (odalar[kapananOda]) {
                        
                        if (odalar[kapananOda].kurucuAdi !== connectedUser) {
                            ws.send(JSON.stringify({ aksiyon: 'hata', mesaj: 'Bu odayı silme yetkiniz yok.' }));
                            break;
                        }
                        odalar[kapananOda].uyeler.forEach(kisi => {
                            if (baglantilar[kisi] && baglantilar[kisi].readyState === WebSocket.OPEN) {
                                baglantilar[kisi].send(JSON.stringify({ aksiyon: 'atildi', odaAdi: kapananOda }));
                            }
                        });
                        delete odalar[kapananOda];
                        herkeseOdaListesiGonder();
                    }
                    break;
                
                case 'mesajDuzenle':
                case 'mesajSil':
                    
                    message.kullaniciAdi = connectedUser; 
                    odadakilereMesajGonder(message.odaAdi, message);
                    break;
            }

        } catch (e) {
            console.error("Mesaj isleme hatasi:", e);
        }
    });

    ws.on('close', () => {
        if (connectedUser) {
            odalardanCikar(connectedUser);
            delete baglantilar[connectedUser];
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ aksiyon: 'kullaniciListesiGuncelle', kullanicilar: Object.keys(baglantilar) }));
                }
            });
        }
    });

    function odalardanCikar(kullanici) {
        for (const oda in odalar) {
            const index = odalar[oda].uyeler.indexOf(kullanici);
            if (index > -1) {
                odalar[oda].uyeler.splice(index, 1);
                odadakilereKullaniciListesiGonder(oda);
                if (odalar[oda].uyeler.length === 0) {
                    delete odalar[oda]; 
                }
            }
        }
        herkeseOdaListesiGonder();
    }

    function herkeseOdaListesiGonder() {
        const odaIsimleri = Object.keys(odalar).map(odaAdi => ({ ad: odaAdi, kurucuAdi: odalar[odaAdi].kurucuAdi, kullaniciSayisi: odalar[odaAdi].uyeler.length }));
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ aksiyon: 'odalarListesiGuncelle', odalar: odaIsimleri }));
            }
        });
    }

    function odadakilereKullaniciListesiGonder(odaAdi) {
        if (!odalar[odaAdi]) return;
        odalar[odaAdi].uyeler.forEach(kisi => {
            const wsClient = baglantilar[kisi];
            if (wsClient && wsClient.readyState === WebSocket.OPEN) {
                wsClient.send(JSON.stringify({ 
                    aksiyon: 'odaKullanicilariGuncelle', 
                    kullanicilar: odalar[odaAdi].uyeler 
                }));
            }
        });
    }

    function odadakilereMesajGonder(odaAdi, mesajObjesi) {
        if (!odalar[odaAdi]) return;
        odalar[odaAdi].uyeler.forEach(kisi => {
            const wsClient = baglantilar[kisi];
            if (wsClient && wsClient.readyState === WebSocket.OPEN) {
                wsClient.send(JSON.stringify(mesajObjesi));
            }
        });
    }
}); 

const localtunnel = require('localtunnel');

server.listen(PORT, 'localhost', async () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Yerel Sunucu Başladı: http://localhost:${PORT}`);
    console.log(`======================================================\n`);
    console.log(`⏳ Otomatik olarak internete açılıyor, lütfen bekleyin...`);

    const { spawn } = require('child_process');
    const tunnel = spawn('npx.cmd', ['cloudflared', 'tunnel', '--url', `http://localhost:${PORT}`], { shell: true });

    let urlFound = false;

    tunnel.stderr.on('data', (data) => {
        const cikti = data.toString();
        const urlMatch = cikti.match(/(https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com)/);
        
        if (urlMatch && !urlFound) {
            urlFound = true;
            console.log(`\n✅ BAŞARILI! Arkadaşlarına Göndereceğin Link:\n`);
            console.log(`👉  ${urlMatch[1]}/giris.html  👈\n`);
            console.log(`Bu linki kopyalayıp arkadaşlarına atabilirsin. Siten hem sende hem de onlarda %100 sorunsuz açılacaktır!\n`);
        }
    });

    tunnel.on('close', (code) => {
        console.log(`\n❌ Tünel kapatıldı veya bir hata oluştu.`);
    });
});
