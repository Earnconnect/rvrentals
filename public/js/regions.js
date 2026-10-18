// US states and the business's operating locations. Shared by the browser (window.RFRegions) and the server (globalThis.RFRegions).
(function (root) {
  const STATES = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
    FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
    MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
    NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
    PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
    WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
  };
  const PHOTOS = { FL: 'resort-palms', AZ: 'state-arizona', UT: 'state-utah', CO: 'state-colorado' };
  const ROLES = ['Headquarters', 'Location', 'Branch'];
  const slugOf = code => (STATES[code] || '').toLowerCase().replace(/[^a-z]+/g, '-');
  const codeFromSlug = slug => Object.keys(STATES).find(c => slugOf(c) === slug) || '';
  // "Kissimmee, FL", "Moab, Utah 84532" or "Utah" → state code
  function stateOf(text) {
    const t = String(text || '');
    const m = t.match(/(?:^|,|\s)([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/) || t.match(/,\s*([A-Z]{2})\b/);
    if (m && STATES[m[1]]) return m[1];
    const lower = t.toLowerCase();
    return Object.keys(STATES).find(c => new RegExp(`\\b${STATES[c].toLowerCase()}\\b`).test(lower)) || '';
  }
  function locationsFrom(settings) {
    const list = (settings && Array.isArray(settings.locations) ? settings.locations : []).filter(l => STATES[l.state]);
    const hqIdx = Math.max(0, list.findIndex(l => l.role === 'Headquarters'));
    return list.map((l, i) => ({ ...l, code: l.state, name: STATES[l.state], slug: slugOf(l.state), hq: i === hqIdx, photo: PHOTOS[l.state] || 'resort-palms' }));
  }
  const hqCode = settings => (locationsFrom(settings).find(l => l.hq) || {}).code || stateOf(settings && settings.address) || '';
  const rvState = (rv, settings) => stateOf(rv && rv.pickup_location) || hqCode(settings);
  const campState = c => stateOf(c && (c.location || c.address));
  function joinNames(names) { return names.length < 2 ? (names[0] || '') : names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1]; }
  const regionsLabel = (settings, short = false) => joinNames(locationsFrom(settings).map(l => short ? l.code : l.name));
  const api = { STATES, ROLES, PHOTOS, slugOf, codeFromSlug, stateOf, locationsFrom, hqCode, rvState, campState, regionsLabel };
  root.RFRegions = api;
})(typeof window !== 'undefined' ? window : globalThis);
