/**
 * Backend API Configuration
 *
 * Reads backend API base URL from Vite environment variables:
 * - VITE_API_URL (primary)
 * - VITE_API_BASE_URL (fallback)
 *
 * Defaults to 'http://localhost:8000' for local development.
 */

export const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:8000'
).replace(/\/+$/, '');

export const PREDICT_API_URL = `${API_BASE_URL}/predict`;

export const HEALTH_API_URL = `${API_BASE_URL}/health`;
