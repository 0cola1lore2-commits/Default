# Cofetărie online

Magazin online complet pentru o cofetărie, în limba română: meniu cu filtre, coș, comandă cu ridicare sau livrare
(dată + interval orar, cu timp minim de pregătire), confirmare și **panou de administrare** pentru comenzi.

- fără baze de date și **fără nicio dependență externă** (doar Node.js)
- prețurile și totalurile se calculează **mereu pe server**; browserul nu poate „negocia” un preț
- 31 de produse de exemplu, cu ilustrații desenate din cod (fără poze cu drepturi de autor) — le poți înlocui cu poze reale
- peste 70 de teste automate, inclusiv teste în browser real și audit de accesibilitate

> **Datele din proiect sunt de exemplu.** „Cofetăria Vanilia”, adresa, telefonul `0700 000 000`, emailul `.example`,
> datele firmei din `[paranteze]` și textele juridice trebuie înlocuite înainte de lansare (vezi [Înainte de lansare](#înainte-de-lansare)).

## Pornire rapidă

Ai nevoie de [Node.js](https://nodejs.org) **22.9 sau mai nou**.

```bash
npm start
```

Deschide <http://localhost:3000>. Panoul de administrare este la <http://localhost:3000/admin> (utilizator `admin`);
parola se generează la fiecare pornire și apare în consolă. Pentru o parolă fixă:

```bash
cp .env.example .env     # apoi editează .env și setează ADMIN_PASSWORD (minim 8 caractere)
npm start
```

`npm run dev` repornește serverul automat când modifici codul sau fișierele din `config/`. `npm test` rulează testele.
Fișierul `.env` se citește din rădăcina proiectului (dacă există); o variabilă setată deja în mediu are prioritate.

### Testare pe telefon

Dacă rulezi proiectul pe calculatorul tău, îl poți încerca de pe telefon, **în aceeași rețea Wi‑Fi**: adaugă `HOST=0.0.0.0`
în `.env`, pornește cu `npm start`, află adresa IP a calculatorului (de ex. `192.168.1.20`) și deschide pe telefon
`http://192.168.1.20:3000`. Este HTTP simplu, bun pentru testare în rețeaua de acasă — nu expune așa serverul pe internet
(pentru acces public vezi [Publicare](#publicare-deploy)).

## Ce poți personaliza (fără să programezi)

| Ce | Unde |
| --- | --- |
| Nume, slogan, adresă, telefon, email, program, taxă de livrare, comandă minimă, intervale orare, zile închise | `config/shop.json` |
| Produse, prețuri, variante, alergeni, timp de pregătire, mesaj pe tort | `config/catalog.json` |
| Textele de pe prima pagină („Despre noi”, comenzi speciale) | `public/index.html` |
| Termeni și condiții, confidențialitate | `public/termeni.html`, `public/confidentialitate.html` |
| Culori și fonturi | începutul fișierului `public/assets/css/style.css` (variabilele `--berry`, `--cream`…) |
| Imaginea de la partajarea pe rețele sociale | `public/assets/img/og-image.png` (1200×630) |

Dacă o configurare este greșită (un preț lipsă, un id duplicat…), serverul **nu pornește** și îți spune exact ce să corectezi.

### Un produs în `config/catalog.json`

```jsonc
{
  "id": "tort-ciocolata",                // litere mici, cifre, cratime; unic
  "category": "torturi",                 // un id din lista „categories”
  "name": "Tort Ciocolată",
  "tagline": "Scurt, pe card.",
  "description": "Descrierea completă, din fereastra produsului.",
  "ingredients": "Făină, ouă, unt…",
  "allergens": ["gluten", "oua", "lapte"],   // gluten, oua, lapte, fructe-cu-coaja, arahide, soia, susan
  "badges": ["Nou"],                     // opțional, cel mult 2
  "leadTimeHours": 48,                   // cu cât timp înainte se poate comanda
  "maxQuantity": 5,                      // opțional (implicit 50)
  "available": true,                     // false = apare „Indisponibil” și nu se mai poate comanda
  "customText": { "label": "Mesaj pe tort (opțional)", "maxLength": 40 },   // opțional
  "variants": [                          // prețurile sunt în lei
    { "id": "1kg", "name": "1 kg · 8 porții", "price": 175 },
    { "id": "felie", "name": "1 felie", "price": 17, "leadTimeHours": 6 }     // varianta poate avea alt timp de pregătire
  ],
  "art": { "kind": "cake", "palette": "chocolate", "style": "drip", "topping": "curls", "theme": "peach" }
}
```

**Poze reale în loc de ilustrații:** pune fișierul în `public/media/` (creează directorul; numele fără spații sau diacritice) și în
produs înlocuiește `art` cu `"image": { "src": "/media/tort-ciocolata.jpg", "alt": "Tort cu ciocolată" }`. Folosește poze
înălțime/lățime 4:3 (ex. 960×720), ca să încapă bine în carduri.

**Ilustrațiile desenate din cod** (`art`) au tipurile `cake`, `slice`, `eclair`, `tart`, `macarons`, `cupcake`, `cookie`, `loaf`,
`berliner`, `profiterol`, `platter`, `giftbox`; câmpurile permise pentru fiecare se văd în `src/art/index.js` (la `KINDS`), iar
exemple găsești în produsele deja existente.

### Program, livrare și ora

În `config/shop.json`, secțiunea `schedule`: `slots` (intervalele alese de clienți), `closedWeekdays` (0 = duminică … 6 = sâmbătă),
`closedDates` (sărbători), `maxAdvanceDays`. Timpul minim de pregătire este cel mai mare dintre produsele din coș și se
calculează în fusul orar al cofetăriei (`timezone`), indiferent unde rulează serverul.

## Cum arată fluxul unei comenzi

1. Clientul alege produse (variantă, cantitate, eventual mesajul de pe tort) → coșul se păstrează în browser.
2. La finalizare alege ridicare sau livrare, data și intervalul; formularul se validează imediat, cu aceleași reguli ca pe server.
3. Serverul **recalculează tot** (prețuri, taxă de livrare, termen minim, zile închise), apoi salvează comanda cu un număr de
   forma `CV-20261108-001` și îi arată clientului confirmarea.
4. Tu vezi comanda în `/admin` (și, opțional, primești o notificare), o confirmi, o pregătești și o marchezi finalizată.
   Plata se face la primirea comenzii.

## Panoul de administrare (`/admin`)

- listă de comenzi cu filtre (status, dată, căutare după număr / nume / telefon) și sortare după data livrării
- detalii complete: produse, **mesajul de pe tort evidențiat**, adresă, observații, istoric al statusurilor
- butoane pentru pasul următor (Confirmă → Pregătire → Gata → Finalizată), anulare cu confirmare, „Tipărește fișa” pentru bucătărie
- se reîmprospătează singur la 30 de secunde și marchează comenzile noi (și în titlul filei)
- accesul se face cu utilizator și parolă (HTTP Basic); închide browserul ca să te deconectezi

**Notificare la comandă nouă:** setează `NOTIFY_WEBHOOK_URL` în `.env` cu adresa unui webhook de tip „incoming webhook”
(Slack, Mattermost, Discord…). Mesajul conține numărul, totalul, data și prenumele — telefonul și adresa rămân doar în panou.

## Unde sunt datele

Comenzile se salvează în `data/orders.json` (director în afara `public/`, deci nu se poate descărca de pe site).
Scrierea este atomică, iar fișierul corupt nu este niciodată suprascris. **Fă backup periodic acestui director** — conține
date personale ale clienților, deci păstrează-l doar cât ai nevoie și protejează-l (vezi și politica de confidențialitate).
Rulează o singură instanță a aplicației pe același director.

## Publicare (deploy)

Merge pe orice găzduire care rulează Node.js ≥ 22.9 (un VPS, Render, Railway, Fly.io etc.).

1. Setează variabilele din `.env.example`, cel puțin: `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT`, `ADMIN_PASSWORD` (lungă, unică),
   `PUBLIC_URL=https://domeniul-tau.ro`, `DATA_DIR` (pe un disc care **se păstrează** între reporniri).
2. Pune în fața aplicației un server cu **HTTPS** (Caddy, nginx + Let’s Encrypt sau cel al platformei). Fără HTTPS, parola
   de administrare ar circula necriptat. Acolo poți adăuga și antetul `Strict-Transport-Security`.
3. Dacă ești în spatele unui proxy, setează `TRUST_PROXY` la numărul de proxy-uri (de obicei `1`) ca limitarea pe IP să vadă
   clientul real, și lasă proxy-ul să trimită antetul `Host` original (nginx: `proxy_set_header Host $host;`).
4. Rulează aplicația sub un supervizor care o repornește la nevoie (systemd, pm2, restart-ul platformei).

## Securitate — ce este inclus

- validare pe server pentru tot ce trimite clientul; prețurile nu se iau niciodată din browser
- antete de securitate și o politică CSP strictă (fără scripturi/stiluri externe sau inline); fonturile sunt găzduite local
- tot textul introdus de clienți este „escapat” la afișare (panou, coș, confirmare); caracterele de control și cele care răstoarnă textul sunt eliminate
- `/admin` cere parolă, comparată în timp constant; încercările greșite repetate sunt blocate temporar; calea se normalizează înainte de verificare
- limită de cereri pe IP la comenzi, limită de mărime a cererilor, protecție împotriva cererilor de pe alte site-uri (CSRF)
- fișierele statice se servesc fără posibilitatea de a ieși din director (`../`, link-uri simbolice, fișiere ascunse)

## Ce NU este inclus (încă)

- **plata online cu cardul** (Netopia, Stripe…) — comenzile se plătesc la primire
- **email / SMS către client** — confirmarea apare pe ecran; tu poți suna clientul. Notificarea către tine merge prin webhook
- conturi de client, istoric de comenzi, stocuri, mai multe locații sau mai multe limbi
- încadrarea magazinului în alt site (iframe): este blocată intenționat; dacă ai nevoie, modifică `frame-ancestors` și `X-Frame-Options` în `src/http-utils.js`
- protecție anti-spam avansată (CAPTCHA) — există doar limitarea pe IP; dacă primești comenzi false, adaugă una (de ex. Cloudflare Turnstile)
- `sitemap.xml`; scalare pe mai multe instanțe (comenzile stau într-un fișier local)

## Înainte de lansare

- [ ] înlocuiește datele fictive din `config/shop.json` (nume, adresă, telefon, email, **datele firmei**: denumire, CUI, Reg. Com., sediu)
- [ ] pune prețurile, produsele, programul, taxele și zilele închise reale; încarcă pozele tale dacă vrei să înlocuiești ilustrațiile
- [ ] **cere unui jurist să verifice** `termeni.html` și `confidentialitate.html` — sunt șabloane generale, nu consultanță juridică;
      verifică și cerințele aplicabile magazinelor online din România (informații obligatorii, soluționarea alternativă a litigiilor)
- [ ] setează o parolă de administrare puternică și `PUBLIC_URL`; activează HTTPS
- [ ] înlocuiește `public/assets/img/og-image.png` (conține numele de exemplu) și, dacă vrei, logoul din `public/partials/header.html` și `public/favicon.svg`
- [ ] fă o comandă de probă de pe telefon, apoi confirm-o și finalizeaz-o din `/admin`; verifică notificarea, dacă o folosești

## Teste

```bash
npm test
```

Rulează fără nicio instalare: logica de comandă, programul și fusurile orare, catalogul, ilustrațiile, stocarea, API-ul (inclusiv
autentificare, CSRF, limitare, path traversal), paginile (CSP, id-uri, linkuri) și serverul de fișiere.

Testele din browser se rulează automat dacă ai Playwright (`npm i -D playwright && npx playwright install chromium`); dacă mai
adaugi `axe-core` (`npm i -D axe-core`), se face și un audit de accesibilitate. Fără ele, aceste teste sunt omise.

## Structura proiectului

```
config/            shop.json (datele cofetăriei), catalog.json (produsele)
public/            site-ul: pagini HTML, partials/ (antet, subsol…), assets/ (css, js, fonturi), admin/
src/               serverul (fără dependențe)
  shared/          cod comun serverului și browserului: bani, program, validarea comenzii
  art/             ilustrațiile desenate din cod
test/              teste (node:test)
data/              comenzile (generat; nu intră în Git)
```

## Note

Fonturile (Fraunces, DM Sans) și iconițele au licențe proprii — vezi [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
Pentru codul și ilustrațiile din acest proiect nu este atașată o licență; alege-o pe cea potrivită proiectului tău.
