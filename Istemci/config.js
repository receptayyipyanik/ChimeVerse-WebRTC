// config.js
// Sunucu ayarları (Node.js backend)

const hostname = window.location.hostname;
const port = 8080;

const IS_LOCALHOST = hostname === 'localhost' || hostname === '127.0.0.1';

// HTTP API istekleri için kullanılacak URL (Giriş, Kayıt, Upload)
const API_URL = IS_LOCALHOST ? `http://${hostname}:${port}` : window.location.origin;

// WebSocket için kullanılacak URL
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = IS_LOCALHOST ? `ws://${hostname}:${port}` : `${wsProtocol}//${hostname}`; 
// Not: Tünel üzerinden bağlanırken otomatik olarak wss:// ve uygun portu kullanır.

window.API_URL = API_URL;
window.WS_URL = WS_URL;