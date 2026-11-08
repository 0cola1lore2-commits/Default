// Etichete în limba română folosite în catalog, în pagini și în panoul de administrare.

/** Alergeni (Regulamentul UE 1169/2011). Cheia se folosește în config/catalog.json. */
export const ALLERGENS = Object.freeze({
  gluten: 'Gluten',
  oua: 'Ouă',
  lapte: 'Lapte',
  'fructe-cu-coaja': 'Fructe cu coajă',
  arahide: 'Arahide',
  soia: 'Soia',
  susan: 'Susan',
});

export const ORDER_STATUSES = Object.freeze({
  new: 'Nouă',
  confirmed: 'Confirmată',
  preparing: 'În pregătire',
  ready: 'Gata',
  completed: 'Finalizată',
  cancelled: 'Anulată',
});

export const FULFILMENT_METHODS = Object.freeze({
  pickup: 'Ridicare din cofetărie',
  delivery: 'Livrare la adresă',
});
