// Persistență tolerantă la browsere care blochează stocarea (mod privat strict, WebView-uri restrictive,
// aplicații care încadrează pagina). Ordinea: localStorage / sessionStorage → altfel `window.name`, care
// supraviețuiește navigării între pagini în aceeași filă. `kind` este 'local' sau 'session'.

const area = (kind) => (kind === 'session' ? window.sessionStorage : window.localStorage);

function readBag() {
  try {
    const bag = JSON.parse(window.name);
    return bag !== null && typeof bag === 'object' && !Array.isArray(bag) ? bag : {};
  } catch {
    return {}; // window.name gol sau folosit de altceva
  }
}

export function readStored(kind, key) {
  try {
    return area(kind).getItem(key);
  } catch {
    return readBag()[`${kind}:${key}`] ?? null;
  }
}

/** `value === null` șterge cheia. Nu aruncă niciodată: fără nicio stocare, datele rămân doar în pagină. */
export function writeStored(kind, key, value) {
  try {
    if (value === null) area(kind).removeItem(key);
    else area(kind).setItem(key, value);
    return;
  } catch {
    // stocarea este blocată sau plină: trecem la window.name
  }
  try {
    const bag = readBag();
    if (value === null) delete bag[`${kind}:${key}`];
    else bag[`${kind}:${key}`] = value;
    window.name = JSON.stringify(bag);
  } catch {
    // nimic de făcut
  }
}
