/**
 * M-06: Token store en memoria (no localStorage).
 * El access_token vive solo en memoria de la aplicación React.
 * Al recargar la página se pierde, pero se restaura automáticamente
 * desde la HttpOnly cookie del refresh token via el endpoint /api/auth/token/refresh/.
 *
 * Ventaja: un script XSS no puede robar el access_token desde localStorage.
 * El refresh_token nunca es accesible por JavaScript (HttpOnly cookie).
 */

let _accessToken = null;

export const getAccessToken  = ()      => _accessToken;
export const setAccessToken  = (token) => { _accessToken = token; };
export const clearAccessToken = ()     => { _accessToken = null; };
