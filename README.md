# 🌐 ChimeVerse - P2P WebRTC Video Konferans ve İletişim Platformu

Bu proje, merkeziyetsiz (Mesh Topoloji) ağ mimarisi üzerine inşa edilmiş, askeri düzeyde şifrelemeye sahip, anlık video konferans ve uçtan uca güvenli mesajlaşma sistemidir. Masaüstü ve mobil platformlarda (Mobile-First) tam uyumlu, batarya dostu ve yüksek performanslı çalışacak şekilde tasarlanmıştır.

## 🚀 Öne Çıkan Özellikler
- **WebRTC P2P Medya Aktarımı:** Görüntü ve ses verileri sunucuya uğramadan, kullanıcılar arasında doğrudan ve şifreli akar.
- **Dinamik Batarya Tasarrufu:** Mobil cihazlardan (Akıllı Telefon/Tablet) bağlanan kullanıcılar otomatik tespit edilir ve batarya sağlığı için HD yerine "480p-15FPS" akıllı tasarruf moduna geçirilir. Sayfa arka plana atıldığında kamera uyku moduna geçer.
- **Yıkılmaz Güvenlik Kalesi:** No-Log (Sıfır Kayıt) politikası, JWT ile kimlik doğrulama, OTP (Tek Kullanımlık Şifre) mail onayı ve SQLite veri zırhı ile donatılmıştır. 
- **Anti-DoS ve Dosya Güvenliği:** Yüklenen dosyalar sıkı uzantı filtresinden geçer, 50MB sınırıyla sunucu şişmesi (Disk Exhaustion) engellenir. RAM sızıntılarına karşı 15 dakikada bir çalışan Otonom Çöp Toplayıcı (Garbage Collector) mevcuttur.

---

## 🛠️ Kurulum (Installation)

Sistemi kendi bilgisayarınızda (veya bir sanal sunucuda) çalıştırmak için aşağıdaki adımları sırasıyla uygulayın.

### Gereksinimler:
- Bilgisayarınızda **Node.js** (v18 veya üzeri) yüklü olmalıdır. ([Buradan indirebilirsiniz](https://nodejs.org/))
- Proje dosyalarını barındıran bu klasör.

### 1. Adım: Bağımlılıkları Yükleyin
Projeyi indirdikten sonra, komut satırını (Terminal / CMD) `NodeSunucu` klasörü içerisinde açın ve gerekli tüm paketleri kurmak için şu komutu çalıştırın:
```bash
cd NodeSunucu
npm install
```

### 2. Adım: Sunucuyu Başlatın
Paketler başarıyla yüklendikten sonra, sistemi ayağa kaldırmak için aynı terminalde şu komutu girin:
```bash
node server.js
```
Ekranda **"Sunucu 8080 portunda dinleniyor..."** yazısını gördüğünüzde sisteminiz başarıyla ayağa kalkmış demektir!

---

## 💻 Kullanım Kılavuzu (Usage)

Sunucu çalışmaya başladıktan sonra, sistemi kullanmak çok basittir:

1. **Uygulamaya Giriş:** 
   Herhangi bir web tarayıcısını (Chrome, Safari, Edge) açın ve adres çubuğuna şunu yazın:
   `http://localhost:8080/giris.html`
2. **Hesap Oluşturma:** 
   Sisteme ilk kez giriyorsanız "Kayıt Ol" sekmesinden e-posta adresinizle kayıt olun. (E-postanıza gelecek 6 haneli OTP kodu ile hesabınızı doğrulamanız gerekmektedir).
3. **Odalar ve İletişim:** 
   Giriş yaptıktan sonra Ana Panele yönlendirileceksiniz. 
   - Yeni bir görüşme başlatmak için sol menüden "+" butonuna basarak bir **Oda Oluşturun**.
   - Odanın ismini arkadaşlarınıza vererek onların da size katılmasını sağlayın.
   - Odadayken mesajlaşabilir, 50MB'a kadar dosya/resim gönderebilir ve alttaki **Kamera/Mikrofon** ikonlarına tıklayarak P2P Görüntülü görüşmeyi anında başlatabilirsiniz!

---

## 📂 Klasör Yapısı
* `/NodeSunucu` : Sistemin kalbi. SQLite veritabanı, WebSockets (Sinyalleşme) ve Express.js (HTTP) API'leri burada çalışır.
* `/Istemci` : Kullanıcının gördüğü HTML, CSS ve JavaScript (WebRTC medya yönetimi) dosyaları.
* `/docs` : Projenin akademik mimari raporları, OWASP güvenlik testleri ve detaylı UML/Mermaid sistem analiz belgeleri bu klasörde yer almaktadır.

---
*Bu sistem Recep Tayyip Yanık tarafından bitirme/dönem projesi kapsamında yüksek güvenlik ve performans standartlarıyla geliştirilmiştir.*
