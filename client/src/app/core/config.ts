import { isDevMode } from '@angular/core';

// After deploying the backend on Render, paste its URL here (no trailing slash).
export const PROD_API_URL = 'https://iem-lost-found-system.onrender.com';

// In `npm start` (dev) requests go through proxy.conf.json, so the base is empty.
export const API_URL = isDevMode() ? '' : PROD_API_URL;
export const fileUrl = (p?: string) => (p ? API_URL + p : '');