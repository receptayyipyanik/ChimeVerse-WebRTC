// İstemci (tarayıcı) tarafındaki işlemleri buradan yönetiyorum.
// Arayüz butonlarını ve WebRTC (Kamera/Ses) bağlantılarını burada ayarladım.
// Mesajlaşma için sunucu ile olan WebSocket iletişimini bu dosyadan kuruyorum.
let webSoket;
let yerelYayin;
let baglantilar = {};
let veriKanallari = {};
let gecerliOda = "";
let gecerliOdaKurucuMu = false;
let kullaniciAdi;
let kameraAcik = true;
let sesAcik = true;
let seciliKullanici = null;
let ozelSohbetMesajlari = {};
let okunmamisMesajlar = new Set();

const yerelVideo = document.getElementById('yerelVideo');
const odaListesi = document.getElementById('odaListesi');
const kullaniciListesi = document.getElementById('kullaniciListesi');
const odadakiKullaniciListesi = document.getElementById('odadakiKullaniciListesi');
const mesajlarDiv = document.getElementById('mesajlar');
const mesajGirdisi = document.getElementById('mesajGirdisi');
const gonderButonu = document.getElementById('gonderButonu');
const kameraAcKapatButonu = document.getElementById('kameraAcKapatButonu');
const sesAcKapatButonu = document.getElementById('sesAcKapatButonu');
const odadanCikButonu = document.getElementById('odadanCikButonu');
const ozelSohbetKutusu = document.getElementById('ozelSohbet');
const ozelSohbetBasligi = document.getElementById('ozelSohbetBasligi');
const ozelMesajlarDiv = document.getElementById('ozelMesajlar');
const ozelMesajGirdisi = document.getElementById('ozelMesajGirdisi');
const ozelGonderButonu = document.getElementById('ozelGonderButonu');

const odaMesajlari = {};
const beklemedekiAdaylar = {};
const baglantiAyar = { 
    'iceServers': [
        { 'urls': 'stun:stun.l.google.com:19302' },
        { 'urls': 'stun:stun1.l.google.com:19302' },
        { 
            'urls': 'turn:openrelay.metered.ca:80',
            'username': 'openrelayproject',
            'credential': 'openrelayproject'
        },
        { 
            'urls': 'turn:openrelay.metered.ca:443?transport=tcp',
            'username': 'openrelayproject',
            'credential': 'openrelayproject'
        }
    ] 
};

function uygulamayiBaslat() {
    kullaniciAdi = localStorage.getItem('kullaniciAdi');
    if (!kullaniciAdi) {
        window.location.href = 'giris.html';
        return;
    }
    olayDinleyicileriKur();
    webSoketBaglan();
}

function olayDinleyicileriKur() {
    gonderButonu.addEventListener('click', mesajGonder);
    mesajGirdisi.addEventListener('keypress', (e) => e.key === 'Enter' && mesajGonder());
    kameraAcKapatButonu.addEventListener('click', kameraAcKapat);
    sesAcKapatButonu.addEventListener('click', sesAcKapat);
    odadanCikButonu?.addEventListener('click', odadanCikisYap);
}

function webSoketBaglan() {
    let sunucuUrl = typeof WS_URL !== 'undefined' ? WS_URL : 'ws://localhost:8080/';
    
    webSoket = new WebSocket(sunucuUrl);

    webSoket.onopen = () => {
        kullaniciKayit();
    };

    webSoket.onmessage = webSoketMesajiIsle;
}

function kullaniciKayit() {
    const token = localStorage.getItem('token');
    webSoket.send(JSON.stringify({
        aksiyon: "kayitOl",
        kullaniciAdi: kullaniciAdi,
        token: token
    }));
}

function webSoketMesajiIsle(olay) {
    const veri = JSON.parse(olay.data);

    switch (veri.aksiyon) {
        case 'kullaniciListesiGuncelle':
            kullaniciListesiGuncelle(veri.kullanicilar);
            break;
        case 'odaKullanicilariGuncelle':
            odaKullanicilariGuncelle(veri.kullanicilar);
            break;
        case 'yeniMesaj':
            gelenMesajiIsle(veri);
            break;
        case 'ozelMesaj':
            ozelMesajiIsleGelen(veri);
            break;
        case 'teklif':
            teklifIsle(veri);
            break;
        case 'cevap':
            cevapIsle(veri);
            break;
        case 'aday':
            adayIsle(veri);
            break;
        case 'kameraDurumu':
            kullaniciKameraDurumuGuncelle(veri.kullaniciAdi, veri.durum);
            sohbeteMesajEkle(`[Sistem]: ${veri.kullaniciAdi} kamerasini ${veri.durum ? 'acti' : 'kapatti'}.`);
            break;
        case 'sesDurumu':
            kullaniciSesDurumuGuncelle(veri.kullaniciAdi, veri.durum);
            break;
        case 'aramaDaveti':
            aramaDavetiGeldi(veri);
            break;
        case 'davetKabul':
            davetKabulEdildi(veri);
            break;
        case 'davetRed':
            davetReddedildi(veri);
            break;
        case 'gorusmeSonlandi':
            if (baglantilar[veri.gonderen]) {
                baglantilar[veri.gonderen].close();
                delete baglantilar[veri.gonderen];
            }
            uzakVideoyuKaldir(veri.gonderen);
            sohbeteMesajEkle(`[Sistem]: ${veri.gonderen} gorusmeyi sonlandirdi.`);
            break;
        case 'odalarListesiGuncelle':
            odalarListesiniGuncelle(veri.odalar);
            break;
        case 'mesajSil':
            const silinecekMesaj = document.getElementById('msg_' + veri.id);
            if (silinecekMesaj) silinecekMesaj.remove();
            if (odaMesajlari[veri.odaAdi]) {
                odaMesajlari[veri.odaAdi] = odaMesajlari[veri.odaAdi].filter(m => m.id !== veri.id);
            }
            break;
        case 'mesajDuzenle':
            const duzenlenecekMesaj = document.getElementById('msg_' + veri.id);
            if (duzenlenecekMesaj) {
                const icerikDiv = duzenlenecekMesaj.querySelector('.message-content');
                if (icerikDiv) {
                    const yeniMetinTam = `[${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}] ${veri.kullaniciAdi}: ${veri.yeniMetin} (Duzenlendi)`;
                    mesajIcerigiOlustur(icerikDiv, yeniMetinTam);
                }
            }
            if (odaMesajlari[veri.odaAdi]) {
                for (let i = 0; i < odaMesajlari[veri.odaAdi].length; i++) {
                    if (odaMesajlari[veri.odaAdi][i].id === veri.id) {
                        odaMesajlari[veri.odaAdi][i].metin = veri.yeniMetin + " (Duzenlendi)";
                        break;
                    }
                }
            }
            break;
        case 'atildi':
            alert(`Oda kapatildi: ${veri.odaAdi}. Lutfen baska bir odaya gecin.`);
            if (gecerliOda === veri.odaAdi) {
                gecerliOda = "";
                mesajlarDiv.innerHTML = "";
                odadakiKullaniciListesi.innerHTML = "";
                document.getElementById('videolar').innerHTML = "";
                Object.keys(baglantilar).forEach(p => {
                    baglantilar[p].close();
                    delete baglantilar[p];
                });
                aktifOdaButonunuGuncelle("");
            }
            break;
        case 'engellendin':
            alert(veri.mesaj);
            if (gecerliOda) {
                gecerliOda = "";
                mesajlarDiv.innerHTML = "";
                odadakiKullaniciListesi.innerHTML = "";
                document.getElementById('videolar').innerHTML = "";
                aktifOdaButonunuGuncelle("");
            }
            break;
    }
}

function mesajGonder() {
    const metin = mesajGirdisi.value.trim();
    if (!metin || !gecerliOda) return;

    webSoket.send(JSON.stringify({
        aksiyon: "yeniMesaj",
        kullaniciAdi: kullaniciAdi,
        odaAdi: gecerliOda,
        metin: metin
    }));

    mesajGirdisi.value = "";
    mesajGirdisi.focus();
}

function gelenMesajiIsle(veri) {
    const suAn = new Date();
    const zamanDamgasi = `[${suAn.getHours().toString().padStart(2, '0')}:${suAn.getMinutes().toString().padStart(2, '0')}]`;
    veri.zamanDamgasi = zamanDamgasi;

    odayaMesajEkle(veri.odaAdi, veri);

    if (veri.odaAdi === gecerliOda) {
        sohbeteMesajEkle(veri);
    }
    
    if (veri.kullaniciAdi !== kullaniciAdi && veri.kullaniciAdi !== 'Sistem') {
        bildirimSesiCal();
    }
}

function sohbeteMesajEkle(veri) {
    if (typeof veri === 'string') {
        const mesajElemani = document.createElement('div');
        mesajElemani.className = 'chat-message';
        mesajIcerigiOlustur(mesajElemani, veri);
        mesajlarDiv.appendChild(mesajElemani);
        mesajlarDiv.scrollTop = mesajlarDiv.scrollHeight;
        return;
    }

    const mesajElemani = document.createElement('div');
    mesajElemani.className = 'chat-message';
    if (veri.id) mesajElemani.id = 'msg_' + veri.id;

    const icerikDiv = document.createElement('div');
    icerikDiv.className = 'message-content';
    const tamMetin = `${veri.zamanDamgasi || ''} ${veri.kullaniciAdi}: ${veri.metin}`;
    mesajIcerigiOlustur(icerikDiv, tamMetin);
    mesajElemani.appendChild(icerikDiv);

    if (veri.kullaniciAdi === kullaniciAdi && veri.id) {
        const actionDiv = document.createElement('div');
        actionDiv.className = 'message-actions';
        
        const btnDuzenle = document.createElement('button');
        btnDuzenle.className = 'msg-btn';
        btnDuzenle.innerHTML = '&#9998;';
        btnDuzenle.title = "Düzenle";
        btnDuzenle.onclick = () => {
            const yeniMetin = prompt("Mesaji duzenle:", veri.metin);
            if (yeniMetin !== null && yeniMetin.trim() !== '') {
                webSoket.send(JSON.stringify({ aksiyon: "mesajDuzenle", id: veri.id, kullaniciAdi: kullaniciAdi, odaAdi: veri.odaAdi, yeniMetin: yeniMetin.trim() }));
            }
        };
        
        const btnSil = document.createElement('button');
        btnSil.className = 'msg-btn';
        btnSil.innerHTML = '&#128465;';
        btnSil.title = "Sil";
        btnSil.onclick = () => {
            if (confirm("Bu mesaji silmek istediginize emin misiniz?")) {
                webSoket.send(JSON.stringify({ aksiyon: "mesajSil", id: veri.id, kullaniciAdi: kullaniciAdi, odaAdi: veri.odaAdi }));
            }
        };
        
        actionDiv.appendChild(btnDuzenle);
        actionDiv.appendChild(btnSil);
        mesajElemani.appendChild(actionDiv);
    }

    mesajlarDiv.appendChild(mesajElemani);
    mesajlarDiv.scrollTop = mesajlarDiv.scrollHeight;
}

function mesajIcerigiOlustur(eleman, mesaj) {
    if (mesaj.includes("[DOSYA]")) {
        const parcalar = mesaj.split("[DOSYA]");
        eleman.textContent = parcalar[0];
        
        const dosyaKismi = parcalar[1];
        if (dosyaKismi) {
            const [url, ad] = dosyaKismi.split("|");
            const link = document.createElement('a');
            link.href = url;
            link.target = "_blank";
            link.textContent = " 📁 " + (ad || "Dosya Indir");
            link.style.color = "#60a5fa";
            link.style.textDecoration = "underline";
            link.style.marginLeft = "10px";
            eleman.appendChild(link);
        }
    } else {
        eleman.textContent = mesaj;
    }
}

function odayaMesajEkle(odaAdi, mesaj) {
    if (!odaMesajlari[odaAdi]) {
        odaMesajlari[odaAdi] = [];
    }
    odaMesajlari[odaAdi].push(mesaj);
}

async function kameraAcKapat() {
    if (!yerelYayin) return;

    const videoIzi = yerelYayin.getVideoTracks()[0];
    if (videoIzi) {
        kameraAcik = !kameraAcik;
        videoIzi.enabled = kameraAcik; 

        const profilSimgesi = document.getElementById('yerelProfilSimgesi');
        if (kameraAcik) {
            yerelVideo.style.display = 'block';
            if (profilSimgesi) profilSimgesi.style.display = 'none';
        } else {
            yerelVideo.style.display = 'none';
            if (profilSimgesi) profilSimgesi.style.display = 'flex';
        }
    }

    medyaButonDurumlariniGuncelle();
    medyaDurumGuncellemesiBildir('kameraDurumu', kameraAcik);
}

async function sesAcKapat() {
    if (!yerelYayin) return;

    const sesIzi = yerelYayin.getAudioTracks()[0];
    if (sesIzi) {
        sesAcik = !sesIzi.enabled;
        sesIzi.enabled = sesAcik;
        medyaButonDurumlariniGuncelle();
        medyaDurumGuncellemesiBildir('sesDurumu', sesAcik);
    }
}

function medyaButonDurumlariniGuncelle() {
    kameraAcKapatButonu.textContent = kameraAcik ? 'Kamera Kapat' : 'Kamera Ac';
    kameraAcKapatButonu.className = kameraAcik ? 'btn-status-on' : 'btn-status-off';
    sesAcKapatButonu.textContent = sesAcik ? 'Sesi Kapat' : 'Sesi Ac';
    sesAcKapatButonu.className = sesAcik ? 'btn-status-on' : 'btn-status-off';
}

function medyaDurumGuncellemesiBildir(aksiyonTipi, durum) {
    if (gecerliOda) {
        webSoket.send(JSON.stringify({
            aksiyon: aksiyonTipi,
            kullaniciAdi: kullaniciAdi,
            odaAdi: gecerliOda,
            durum: durum
        }));
    }
}

async function yerelYayiniBaslat() {
    try {
        
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
        
        let videoKisitlamalari;
        
        if (isMobile) {
            
            videoKisitlamalari = {
                width: { ideal: 480, max: 640 },
                height: { ideal: 360, max: 480 },
                frameRate: { ideal: 15, max: 24 }
            };
        } else {
            
            videoKisitlamalari = {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            };
        }
        
        yerelYayin = await navigator.mediaDevices.getUserMedia({ 
            video: videoKisitlamalari, 
            audio: { echoCancellation: true, noiseSuppression: true } 
        });
        yerelVideo.srcObject = yerelYayin;
        kameraAcik = true;
        sesAcik = true;
        medyaButonDurumlariniGuncelle();
    } catch (hata) {
        console.error('Medya cihazlarina erisilemedi:', hata);
    }
}

function kullaniciOgesiOlustur(u, listeElemani, odaIciMi = false) {
    const li = document.createElement('li');
    li.className = 'user-item';
    if (okunmamisMesajlar.has(u)) {
        li.classList.add('has-notification');
    }
    
    const divIcerik = document.createElement('div');
    divIcerik.className = 'user-item-content';
    
    const isimEtiketi = document.createElement('span');
    isimEtiketi.textContent = u;
    isimEtiketi.onclick = () => ozelSohbetiAc(u);
    
    const aksiyonlar = document.createElement('div');
    aksiyonlar.className = 'user-actions';
    
    const aramaButonu = document.createElement('button');
    aramaButonu.innerHTML = '&#128249;';
    aramaButonu.className = 'call-icon';
    aramaButonu.title = 'Goruntulu Ara';
    aramaButonu.onclick = (e) => {
        e.stopPropagation();
        goruntuluAra(u);
    };

    aksiyonlar.appendChild(aramaButonu);

    if (odaIciMi && gecerliOdaKurucuMu && gecerliOda !== "Ana Oda") {
        const engelleButonu = document.createElement('button');
        engelleButonu.innerHTML = '&#128683;'; 
        engelleButonu.className = 'call-icon';
        engelleButonu.style.color = '#ef4444';
        engelleButonu.title = 'Odadan At ve Engelle';
        engelleButonu.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`${u} adli kullaniciyi odadan atmak ve bu odaya girisini kalici engellemek istediginize emin misiniz?`)) {
                webSoket.send(JSON.stringify({ aksiyon: "kullaniciEngelle", kullaniciAdi: kullaniciAdi, hedef: u, odaAdi: gecerliOda }));
            }
        };
        aksiyonlar.appendChild(engelleButonu);
    }

    const bildirimNoktasi = document.createElement('span');
    bildirimNoktasi.className = 'notification-dot';
    aksiyonlar.appendChild(bildirimNoktasi);

    divIcerik.appendChild(isimEtiketi);
    divIcerik.appendChild(aksiyonlar);
    li.appendChild(divIcerik);
    
    listeElemani.appendChild(li);
}

function kullaniciListesiGuncelle(kullanicilarVerisi) {
    kullaniciListesi.innerHTML = "";
    kullanicilarVerisi.forEach(u => {
        if (u !== kullaniciAdi) {
            kullaniciOgesiOlustur(u, kullaniciListesi);
        }
    });
}

async function baglantiBaslat(hedef) {
    if (baglantilar[hedef]) {
        baglantilar[hedef].close();
        delete baglantilar[hedef];
    }

    const baglanti = new RTCPeerConnection(baglantiAyar);

    const veriKanali = baglanti.createDataChannel('sohbet');
    veriKanaliKur(veriKanali, hedef);
    veriKanallari[hedef] = veriKanali;

    baglanti.ondatachannel = (olay) => {
        veriKanaliKur(olay.channel, hedef);
        veriKanallari[hedef] = olay.channel;
    };

    if (yerelYayin) {
        yerelYayin.getTracks().forEach(iz => {
            const sender = baglanti.addTrack(iz, yerelYayin);
            
            if (iz.kind === 'video' && !kameraAcik) {
                sender.replaceTrack(null);
            }
        });
    }

    baglanti.onicecandidate = (olay) => {
        if (olay.candidate) {
            webSoket.send(JSON.stringify({
                aksiyon: "aday",
                gonderen: kullaniciAdi,
                hedef: hedef,
                aday: olay.candidate,
                odaAdi: gecerliOda
            }));
        }
    };

    baglanti.ontrack = (olay) => {
        if (olay.streams && olay.streams[0]) {
            const video = videoUgesiAlVeyaOlustur(hedef);
            video.srcObject = olay.streams[0];
            video.play().catch(h => console.error("Video oynatma hatasi:", h));
        }
    };

    baglanti.onconnectionstatechange = () => {
        if (baglanti.connectionState === 'connected') {
            medyaDurumGuncellemesiBildir('kameraDurumu', kameraAcik);
            medyaDurumGuncellemesiBildir('sesDurumu', sesAcik);
        } else if (baglanti.connectionState === 'disconnected' || baglanti.connectionState === 'failed') {
            uzakVideoyuKaldir(hedef);
            delete baglantilar[hedef];
        }
    };

    baglantilar[hedef] = baglanti;
    return baglanti;
}

function veriKanaliKur(kanal, hedef) {
    kanal.onopen = () => console.log(`Veri kanali acildi: ${hedef}`);
    kanal.onclose = () => console.log(`Veri kanali kapandi: ${hedef}`);
    kanal.onmessage = (olay) => {
        ozelMesajiIsleGelen({
            gonderen: hedef,
            metin: olay.data
        });
    };
}

async function odayaKatil(odaAdi) {
    if (gecerliOda === odaAdi) return;

    aktifOdaButonunuGuncelle(odaAdi);
    mevcutOdadanAyril();

    gecerliOda = odaAdi;
    if (!yerelYayin) await yerelYayiniBaslat();

    webSoket.send(JSON.stringify({
        aksiyon: "odayaKatil",
        kullaniciAdi: kullaniciAdi,
        odaAdi: odaAdi
    }));

    odaMesajlariniYukle();
}

function mevcutOdadanAyril() {
    if (!gecerliOda) return;

    Object.keys(baglantilar).forEach(k => {
        baglantilar[k].close();
        uzakVideoyuKaldir(k);
    });
    baglantilar = {};
    veriKanallari = {};

    webSoket.send(JSON.stringify({
        aksiyon: "odadanAyril",
        kullaniciAdi: kullaniciAdi,
        odaAdi: gecerliOda
    }));
}

function odaMesajlariniYukle() {
    mesajlarDiv.innerHTML = '';
    if (odaMesajlari[gecerliOda]) {
        odaMesajlari[gecerliOda].forEach(m => sohbeteMesajEkle(m));
    }
}

function videoUgesiAlVeyaOlustur(kullaniciId) {
    let sarici = document.getElementById('sarici_' + kullaniciId);
    if (!sarici) {
        sarici = document.createElement('div');
        sarici.id = 'sarici_' + kullaniciId;
        sarici.className = 'video-wrapper';

        const video = document.createElement('video');
        video.id = 'video_' + kullaniciId;
        video.autoplay = true;
        video.playsInline = true;

        const profil = document.createElement('div');
        profil.id = 'profil_' + kullaniciId;
        profil.className = 'profile-icon';
        profil.innerHTML = '&#128100;'; 
        profil.style.display = 'none';

        const etiket = document.createElement('div');
        etiket.className = 'video-label';
        etiket.textContent = kullaniciId;

        const kapatButonu = document.createElement('button');
        kapatButonu.className = 'hangup-btn';
        kapatButonu.innerHTML = '&#128473;'; 
        kapatButonu.title = 'Gorusmeyi Sonlandir';
        kapatButonu.onclick = (e) => {
            e.stopPropagation();
            gorusmeyiSonlandir(kullaniciId);
        };

        sarici.appendChild(video);
        sarici.appendChild(profil);
        sarici.appendChild(etiket);
        sarici.appendChild(kapatButonu);
        document.getElementById('videolar').appendChild(sarici);
    }
    return document.getElementById('video_' + kullaniciId);
}

function gorusmeyiSonlandir(hedef) {
    if (baglantilar[hedef]) {
        baglantilar[hedef].close();
        delete baglantilar[hedef];
    }
    uzakVideoyuKaldir(hedef);
    sohbeteMesajEkle(`[Sistem]: ${hedef} ile gorusmeyi sonlandirdiniz.`);
    
    webSoket.send(JSON.stringify({
        aksiyon: "gorusmeSonlandi",
        gonderen: kullaniciAdi,
        hedef: hedef,
        odaAdi: gecerliOda
    }));
}

function uzakVideoyuKaldir(kullaniciId) {
    const sarici = document.getElementById('sarici_' + kullaniciId);
    if (sarici) {
        const video = document.getElementById('video_' + kullaniciId);
        if (video && video.srcObject) {
            video.srcObject.getTracks().forEach(iz => iz.stop());
        }
        if (video) video.srcObject = null;
        sarici.remove();
    }
}

function kullaniciKameraDurumuGuncelle(hedefAdi, acikMi) {
    console.log(`Kamera durumu guncellendi: ${hedefAdi}, acikMi: ${acikMi}`);
    const video = document.getElementById('video_' + hedefAdi);
    const profil = document.getElementById('profil_' + hedefAdi);
    if (video && profil) {
        if (acikMi) {
            video.style.display = 'block';
            profil.style.display = 'none';
        } else {
            video.style.display = 'none';
            profil.style.display = 'flex';
        }
    } else if (video) {
        video.style.display = acikMi ? 'block' : 'none';
    } else {
        console.warn(`Video elementi bulunamadi: video_${hedefAdi}`);
    }
}

function kullaniciSesDurumuGuncelle(hedefAdi, acikMi) {
    const video = document.getElementById('video_' + hedefAdi);
    if (video) {
        video.style.border = acikMi ? '2px solid var(--border-color)' : '2px solid var(--primary)';
    }
}

function aktifOdaButonunuGuncelle(aktifOdaAdi) {
    const odaButonlari = document.querySelectorAll('#odaListesi li');
    odaButonlari.forEach(buton => {
        if (buton.textContent.includes(aktifOdaAdi) && aktifOdaAdi !== "") {
            buton.classList.add('active-room');
        } else {
            buton.classList.remove('active-room');
        }
    });
}

function odalarListesiniGuncelle(odalarVerisi) {
    odaListesi.innerHTML = '';
    gecerliOdaKurucuMu = false; 
    odalarVerisi.forEach(oda => {
        if (oda.ad === gecerliOda) {
            gecerliOdaKurucuMu = (oda.kurucuAdi === kullaniciAdi);
        }
        const li = document.createElement('li');
        li.textContent = oda.ad;
        li.onclick = (e) => {
            if(e.target === li) odayaKatil(oda.ad);
        };
        
        if (oda.kurucuAdi === kullaniciAdi && oda.ad !== "Ana Oda") {
            const silButonu = document.createElement('span');
            silButonu.className = 'delete-room-icon';
            silButonu.title = 'Odayi Sil';
            silButonu.innerHTML = '&times;';
            silButonu.onclick = (e) => {
                e.stopPropagation();
                if(confirm(`${oda.ad} odasini silmek istediginize emin misiniz?`)) {
                    odaSil(oda.ad);
                }
            };
            li.appendChild(silButonu);
        }
        
        if (oda.ad === gecerliOda) {
            li.classList.add('active-room');
        }
        odaListesi.appendChild(li);
    });
}

function yeniOdaOlustur() {
    const girdi = document.getElementById('yeniOdaGirdisi');
    const odaAdi = girdi.value.trim();
    if (odaAdi && odaAdi.length <= 15) {
        webSoket.send(JSON.stringify({
            aksiyon: "odaKur",
            kullaniciAdi: kullaniciAdi,
            odaAdi: odaAdi
        }));
        girdi.value = "";
    } else {
        alert("Gecerli bir oda adi girin (maks 15 karakter).");
    }
}

function odaSil(odaAdi) {
    webSoket.send(JSON.stringify({
        aksiyon: "odaSil",
        kullaniciAdi: kullaniciAdi,
        odaAdi: odaAdi
    }));
}

async function teklifIsle(veri) {
    if (veri.odaAdi !== gecerliOda) return;

    try {
        if (!yerelYayin) {
            await yerelYayiniBaslat();
        }

        const baglanti = await baglantiBaslat(veri.gonderen);
        await baglanti.setRemoteDescription(new RTCSessionDescription(veri.teklif));
        
        if (beklemedekiAdaylar[veri.gonderen]) {
            for (let aday of beklemedekiAdaylar[veri.gonderen]) {
                await baglanti.addIceCandidate(new RTCIceCandidate(aday));
            }
            delete beklemedekiAdaylar[veri.gonderen];
        }

        const cevap = await baglanti.createAnswer();
        await baglanti.setLocalDescription(cevap);

        webSoket.send(JSON.stringify({
            aksiyon: "cevap",
            gonderen: kullaniciAdi,
            hedef: veri.gonderen,
            cevap: cevap,
            odaAdi: gecerliOda
        }));
    } catch (hata) {
        console.error("Teklif isleme hatasi:", hata);
    }
}

async function cevapIsle(veri) {
    if (baglantilar[veri.gonderen] && veri.odaAdi === gecerliOda) {
        try {
            await baglantilar[veri.gonderen].setRemoteDescription(new RTCSessionDescription(veri.cevap));
            
            if (beklemedekiAdaylar[veri.gonderen]) {
                for (let aday of beklemedekiAdaylar[veri.gonderen]) {
                    await baglantilar[veri.gonderen].addIceCandidate(new RTCIceCandidate(aday));
                }
                delete beklemedekiAdaylar[veri.gonderen];
            }
        } catch (hata) {
            console.error("Cevap isleme hatasi:", hata);
        }
    }
}

async function adayIsle(veri) {
    if (!beklemedekiAdaylar[veri.gonderen]) {
        beklemedekiAdaylar[veri.gonderen] = [];
    }

    if (baglantilar[veri.gonderen] && baglantilar[veri.gonderen].remoteDescription) {
        try {
            await baglantilar[veri.gonderen].addIceCandidate(new RTCIceCandidate(veri.aday));
        } catch (hata) {
            console.error("ICE adayi ekleme hatasi:", hata);
        }
    } else {
        beklemedekiAdaylar[veri.gonderen].push(veri.aday);
    }
}

async function goruntuluAra(hedef) {
    if(!gecerliOda) {
        alert("Arama yapmak icin bir odaya katilmalisiniz.");
        return;
    }
    webSoket.send(JSON.stringify({
        aksiyon: "aramaDaveti",
        gonderen: kullaniciAdi,
        hedef: hedef,
        odaAdi: gecerliOda
    }));
    sohbeteMesajEkle(`[Sistem]: ${hedef} kullanicisina arama daveti gonderildi.`);
}

function aramaDavetiGeldi(veri) {
    const kabulEdildi = confirm(`${veri.gonderen} sizi goruntulu ariyor. Kabul ediyor musunuz?`);
    if (kabulEdildi) {
        webSoket.send(JSON.stringify({
            aksiyon: "davetKabul",
            gonderen: kullaniciAdi,
            hedef: veri.gonderen,
            odaAdi: veri.odaAdi
        }));
    } else {
        webSoket.send(JSON.stringify({
            aksiyon: "davetRed",
            gonderen: kullaniciAdi,
            hedef: veri.gonderen,
            odaAdi: veri.odaAdi
        }));
    }
}

async function davetKabulEdildi(veri) {
    sohbeteMesajEkle(`[Sistem]: ${veri.gonderen} aramanizi kabul etti.`);
    if (!yerelYayin) {
        await yerelYayiniBaslat();
    }
    const baglanti = await baglantiBaslat(veri.gonderen);
    const teklif = await baglanti.createOffer();
    await baglanti.setLocalDescription(teklif);

    webSoket.send(JSON.stringify({
        aksiyon: "teklif",
        gonderen: kullaniciAdi,
        hedef: veri.gonderen,
        teklif: teklif,
        odaAdi: gecerliOda
    }));
}

function davetReddedildi(veri) {
    sohbeteMesajEkle(`[Sistem]: ${veri.gonderen} aramanizi reddetti.`);
    alert(`${veri.gonderen} aramanizi reddetti.`);
}

function odadanCikisYap() {
    if (!gecerliOda) return;
    
    mevcutOdadanAyril();
    gecerliOda = "";
    mesajlarDiv.innerHTML = '';
    aktifOdaButonunuGuncelle("");
    odadakiKullaniciListesi.innerHTML = '';
    
    if (yerelYayin) {
        yerelYayin.getTracks().forEach(iz => iz.stop());
        yerelYayin = null;
        yerelVideo.srcObject = null;
    }
}

function odaKullanicilariGuncelle(kullaniciDizisi) {
    odadakiKullaniciListesi.innerHTML = "";
    kullaniciDizisi.forEach(u => {
        if (u !== kullaniciAdi) {
            kullaniciOgesiOlustur(u, odadakiKullaniciListesi, true);
        }
    });
}

function ozelSohbetiAc(hedefAdi) {
    seciliKullanici = hedefAdi;
    ozelSohbetBasligi.textContent = `Ozel Sohbet - ${hedefAdi}`;
    ozelSohbetKutusu.style.display = 'flex';
    
    okunmamisMesajlar.delete(hedefAdi);
    kullaniciListesiGuncelle(Array.from(new Set([...kullaniciListesi.querySelectorAll('.user-item')]
        .map(li => li.querySelector('span').textContent))));
    odaKullanicilariGuncelle(Array.from(new Set([...odadakiKullaniciListesi.querySelectorAll('.user-item')]
        .map(li => li.querySelector('span').textContent))));
    
    ozelMesajlariYukle(hedefAdi);
    ozelMesajGirdisi.focus();
}

function ozelSohbetiKapat() {
    ozelSohbetKutusu.style.display = 'none';
    seciliKullanici = null;
}

function ozelMesajlariYukle(hedefAdi) {
    ozelMesajlarDiv.innerHTML = '';
    if (ozelSohbetMesajlari[hedefAdi]) {
        ozelSohbetMesajlari[hedefAdi].forEach(m => {
            const mesajElemani = document.createElement('div');
            mesajElemani.textContent = m;
            mesajElemani.className = 'private-message';
            ozelMesajlarDiv.appendChild(mesajElemani);
        });
    }
    ozelMesajlarDiv.scrollTop = ozelMesajlarDiv.scrollHeight;
}

function ozelMesajGonder() {
    const metin = ozelMesajGirdisi.value.trim();
    if (!metin || !seciliKullanici) return;

    const suAn = new Date();
    const zamanDamgasi = `[${suAn.getHours().toString().padStart(2, '0')}:${suAn.getMinutes().toString().padStart(2, '0')}]`;

    if (veriKanallari[seciliKullanici] && veriKanallari[seciliKullanici].readyState === 'open') {
        veriKanallari[seciliKullanici].send(metin);
    } else {
        webSoket.send(JSON.stringify({
            aksiyon: "ozelMesaj",
            gonderen: kullaniciAdi,
            alici: seciliKullanici,
            metin: metin
        }));
    }

    ozelSohbeteEkle(`${zamanDamgasi} Ben -> ${seciliKullanici}: ${metin}`, seciliKullanici);
    
    ozelMesajGirdisi.value = '';
    ozelMesajGirdisi.focus();
}

function ozelMesajiIsleGelen(veri) {
    const suAn = new Date();
    const zamanDamgasi = `[${suAn.getHours().toString().padStart(2, '0')}:${suAn.getMinutes().toString().padStart(2, '0')}]`;
    const gosterilecekMesaj = `${zamanDamgasi} ${veri.gonderen} -> Ben: ${veri.metin}`;
    
    if (seciliKullanici !== veri.gonderen) {
        okunmamisMesajlar.add(veri.gonderen);
        kullaniciListesiGuncelle(Array.from(new Set([...kullaniciListesi.querySelectorAll('.user-item')]
            .map(li => li.querySelector('span').textContent))));
        odaKullanicilariGuncelle(Array.from(new Set([...odadakiKullaniciListesi.querySelectorAll('.user-item')]
            .map(li => li.querySelector('span').textContent))));
    }
    
    ozelSohbeteEkle(gosterilecekMesaj, veri.gonderen);
    bildirimSesiCal();
    
    if (seciliKullanici === veri.gonderen) {
        ozelSohbetiAc(veri.gonderen);
    }
}

function ozelSohbeteEkle(mesaj, kullanici) {
    if (!ozelSohbetMesajlari[kullanici]) {
        ozelSohbetMesajlari[kullanici] = [];
    }
    ozelSohbetMesajlari[kullanici].push(mesaj);

    const mesajElemani = document.createElement('div');
    mesajElemani.className = 'private-message';
    mesajIcerigiOlustur(mesajElemani, mesaj);
    ozelMesajlarDiv.appendChild(mesajElemani);
    ozelMesajlarDiv.scrollTop = ozelMesajlarDiv.scrollHeight;
}

ozelGonderButonu.addEventListener('click', ozelMesajGonder);
ozelMesajGirdisi.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        ozelMesajGonder();
    }
});

function yerelVideoyuSuruklenebilirYap() {
    const sarici = document.getElementById('yerelVideoSarici');
    const baslik = document.querySelector('#yerelVideoSarici .floating-header');
    
    let isDragging = false;
    let baslangicX, baslangicY, sariciBaslangicSol, sariciBaslangicUst;

    baslik.addEventListener('mousedown', suruklemeyiBaslat);
    baslik.addEventListener('touchstart', suruklemeyiBaslat, {passive: false});

    function suruklemeyiBaslat(e) {
        if (e.target.tagName.toLowerCase() === 'button') return;
        
        isDragging = true;
        
        const isTouch = e.type === 'touchstart';
        if (isTouch) {
            if (e.touches.length > 1) return;
        }

        const rectLeft = sarici.offsetLeft;
        const rectTop = sarici.offsetTop;
        
        sarici.style.right = 'auto';
        sarici.style.bottom = 'auto';
        sarici.style.left = rectLeft + 'px';
        sarici.style.top = rectTop + 'px';
        
        sariciBaslangicSol = rectLeft;
        sariciBaslangicUst = rectTop;
        
        baslangicX = isTouch ? e.touches[0].clientX : e.clientX;
        baslangicY = isTouch ? e.touches[0].clientY : e.clientY;
        
        sarici.style.transition = 'none';

        if (isTouch) {
            document.addEventListener('touchmove', surukle, {passive: false});
            document.addEventListener('touchend', suruklemeyiBirak);
            document.addEventListener('touchcancel', suruklemeyiBirak);
        } else {
            document.addEventListener('mousemove', surukle);
            document.addEventListener('mouseup', suruklemeyiBirak);
        }
    }

    function surukle(e) {
        if (!isDragging) return;
        
        const isTouch = e.type === 'touchmove';
        if (isTouch && e.cancelable) e.preventDefault();
        
        const guncelX = isTouch ? e.touches[0].clientX : e.clientX;
        const guncelY = isTouch ? e.touches[0].clientY : e.clientY;
        
        const dx = guncelX - baslangicX;
        const dy = guncelY - baslangicY;
        
        let yeniSol = sariciBaslangicSol + dx;
        let yeniUst = sariciBaslangicUst + dy;
        
        const maxSol = window.innerWidth - sarici.offsetWidth;
        const maxUst = window.innerHeight - sarici.offsetHeight;
        
        yeniSol = Math.max(0, Math.min(yeniSol, maxSol));
        yeniUst = Math.max(0, Math.min(yeniUst, maxUst));
        
        sarici.style.left = yeniSol + 'px';
        sarici.style.top = yeniUst + 'px';
    }

    function suruklemeyiBirak(e) {
        if (!isDragging) return;
        isDragging = false;
        sarici.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.3s, border-color 0.3s';
        
        const isTouch = e.type === 'touchend' || e.type === 'touchcancel';
        if (isTouch) {
            document.removeEventListener('touchmove', surukle);
            document.removeEventListener('touchend', suruklemeyiBirak);
            document.removeEventListener('touchcancel', suruklemeyiBirak);
        } else {
            document.removeEventListener('mousemove', surukle);
            document.removeEventListener('mouseup', suruklemeyiBirak);
        }
    }
}

function bildirimSesiCal() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.setValueAtTime(800, t + 0.1);
        
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.1, t + 0.05);
        gain.gain.linearRampToValueAtTime(0, t + 0.2);
        
        osc.start(t);
        osc.stop(t + 0.2);
    } catch (e) {
        console.error("Bildirim sesi calinamadi:", e);
    }
}

async function dosyaYukle(inputElement, sohbetTuru) {
    const dosya = inputElement.files[0];
    if (!dosya) return;
    
    if (!gecerliOda && sohbetTuru === 'oda') return;
    if (!seciliKullanici && sohbetTuru === 'ozel') return;

    const formData = new FormData();
    formData.append('dosya', dosya);

    try {
        const yanit = await fetch(API_URL + '/api/upload', {
            method: 'POST',
            body: formData
        });
        const sonuc = await yanit.json();

        if (sonuc.basarili) {
            const mesajGövdesi = `[DOSYA]${sonuc.url}|${sonuc.ad}`;
            const suAn = new Date();
            const zamanDamgasi = `[${suAn.getHours().toString().padStart(2, '0')}:${suAn.getMinutes().toString().padStart(2, '0')}]`;

            if (sohbetTuru === 'oda') {
                webSoket.send(JSON.stringify({
                    aksiyon: "yeniMesaj",
                    kullaniciAdi: kullaniciAdi,
                    odaAdi: gecerliOda,
                    metin: mesajGövdesi
                }));
            } else if (sohbetTuru === 'ozel') {
                webSoket.send(JSON.stringify({
                    aksiyon: "ozelMesaj",
                    gonderen: kullaniciAdi,
                    alici: seciliKullanici,
                    metin: mesajGövdesi
                }));
                ozelSohbeteEkle(`${zamanDamgasi} Ben -> ${seciliKullanici}: ${mesajGövdesi}`, seciliKullanici);
            }
        } else {
            alert("Dosya yuklenemedi: " + sonuc.mesaj);
        }
    } catch (hata) {
        console.error("Dosya yukleme hatasi:", hata);
        alert("Dosya yuklenirken bir hata olustu.");
    }
    inputElement.value = ''; 
}

function odayiAra() {
    const kullanicilar = Array.from(new Set([...odadakiKullaniciListesi.querySelectorAll('.user-item')]
            .map(li => li.querySelector('span').textContent)));
            
    if (kullanicilar.length === 0) {
        alert("Odada aranacak kimse yok!");
        return;
    }
    
    if (!kameraAcik) {
        alert("Toplu arama baslatmadan once kameranizi acmalisiniz!");
        return;
    }
    
    kullanicilar.forEach(hedef => {
        webSoket.send(JSON.stringify({
            aksiyon: "aramaDaveti",
            gonderen: kullaniciAdi,
            hedef: hedef,
            odaAdi: gecerliOda
        }));
    });
    alert(`Odada bulunan ${kullanicilar.length} kisiye arama daveti gonderildi!`);
}

uygulamayiBaslat();
yerelVideoyuSuruklenebilirYap();