# alg-helper

Algoritmika cavab köməkçisi (obfuscated build).

## İstifadə

1. `https://learn.algoritmika.az` saytını aç və daxil ol.
2. `F12` → **Console**.
3. Aşağıdakı kodu yapışdır və `Enter` bas:

```js
document.head.appendChild(Object.assign(document.createElement('script'), {
  src: 'https://cdn.jsdelivr.net/gh/USERNAME/alg-helper@main/demo2.min.js'
}));
```

`USERNAME` yerinə GitHub istifadəçi adını yaz.

## Hotkey-lər

- `Alt+X` — cavab panelini aç/bağla
- `Alt+S` — parametrlər (hotkey, ölçü, düzülüş, şərt)

## Qeyd

- Panel başlıqdan tutub sürüşdürülə bilər; sağ-alt küncdən ölçüsü dəyişilir.
- Ayarlar, mövqe və ölçü `localStorage`-də saxlanılır.
- Bu fayl obfuscate olunub; oxunaqlı mənbə repoda yoxdur.
