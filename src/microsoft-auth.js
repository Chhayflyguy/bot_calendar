/**
 * Microsoft Authentication Module — OAuth2 Device Code Flow.
 *
 * Uses MSAL (Microsoft Authentication Library) to authenticate users
 * via the device code flow. This is ideal for bots and CLI tools where
 * there's no browser available directly.
 *
 * Flow:
 *   1. Bot requests a device code from Microsoft
 *   2. User goes to https://microsoft.com/devicelogin and enters the code
 *   3. User signs in with their Microsoft account
 *   4. Bot receives an access token + refresh token
 *   5. Tokens are cached to disk for persistence across restarts
 */

const msal = require('@azure/msal-node');
const fs = require('fs');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────────────────────

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const AUTHORITY = 'https://login.microsoftonline.com/common';
const SCOPES = ['Calendars.ReadWrite', 'User.Read', 'offline_access'];

// Token cache file path (stored next to the project)
const TOKEN_CACHE_PATH = path.join(__dirname, '..', 'tokens.json');

// ─── MSAL Client Setup ──────────────────────────────────────────────────────

let msalClient = null;

/**
 * Get or create the MSAL PublicClientApplication instance.
 */
function getMsalClient() {
  if (!CLIENT_ID || CLIENT_ID === 'your_client_id_here') {
    return null;
  }

  if (!msalClient) {
    const config = {
      auth: {
        clientId: CLIENT_ID,
        authority: AUTHORITY,
      },
      cache: {
        // We'll handle cache serialization manually
      },
    };

    msalClient = new msal.PublicClientApplication(config);

    // Load cached tokens if they exist
    loadTokenCache();
  }

  return msalClient;
}

// ─── Token Cache Persistence ─────────────────────────────────────────────────

/**
 * Load token cache from disk.
 */
function loadTokenCache() {
  try {
    if (fs.existsSync(TOKEN_CACHE_PATH)) {
      const cacheData = fs.readFileSync(TOKEN_CACHE_PATH, 'utf-8');
      msalClient.getTokenCache().deserialize(cacheData);
      console.log('📦 Loaded saved Microsoft tokens');
    }
  } catch (err) {
    console.error('⚠️ Could not load token cache:', err.message);
  }
}

/**
 * Save token cache to disk.
 */
function saveTokenCache() {
  try {
    const cacheData = msalClient.getTokenCache().serialize();
    fs.writeFileSync(TOKEN_CACHE_PATH, cacheData, 'utf-8');
  } catch (err) {
    console.error('⚠️ Could not save token cache:', err.message);
  }
}

// ─── Authentication Functions ────────────────────────────────────────────────

/**
 * Start device code authentication flow.
 *
 * @param {function} onUserCode - Callback with { userCode, verificationUri, message }
 *   so the bot can send the code to the user on Telegram.
 * @returns {Promise<object>} - The authentication result with accessToken
 */
async function startDeviceCodeAuth(onUserCode) {
  const client = getMsalClient();
  if (!client) {
    throw new Error('MICROSOFT_CLIENT_ID is not configured in .env');
  }

  const deviceCodeRequest = {
    scopes: SCOPES,
    deviceCodeCallback: (response) => {
      // This callback is called when Microsoft provides the device code.
      // We pass it to the bot so it can show it to the user.
      onUserCode({
        userCode: response.userCode,
        verificationUri: response.verificationUri,
        message: response.message,
      });
    },
  };

  try {
    const result = await client.acquireTokenByDeviceCode(deviceCodeRequest);
    // Save the token cache after successful auth
    saveTokenCache();
    return result;
  } catch (err) {
    if (err.errorCode === 'authorization_pending') {
      throw new Error('Authentication timed out. Please try /login again.');
    }
    throw err;
  }
}

/**
 * Get a valid access token (silently, using cached refresh token).
 * Returns null if not authenticated.
 *
 * @returns {Promise<string|null>} - Access token string, or null
 */
async function getAccessToken() {
  const client = getMsalClient();
  if (!client) return null;

  try {
    const accounts = await client.getTokenCache().getAllAccounts();
    if (accounts.length === 0) return null;

    const silentRequest = {
      scopes: SCOPES,
      account: accounts[0],
    };

    const result = await client.acquireTokenSilent(silentRequest);
    // Save updated cache (refresh token may have been renewed)
    saveTokenCache();
    return result.accessToken;
  } catch (err) {
    console.error('⚠️ Silent token acquisition failed:', err.message);
    return null;
  }
}

/**
 * Get the currently logged-in user's info.
 *
 * @returns {Promise<object|null>} - { username, name } or null
 */
async function getLoggedInUser() {
  const client = getMsalClient();
  if (!client) return null;

  try {
    const accounts = await client.getTokenCache().getAllAccounts();
    if (accounts.length === 0) return null;

    return {
      username: accounts[0].username,
      name: accounts[0].name || accounts[0].username,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Check if Microsoft auth is configured (CLIENT_ID is set).
 */
function isMicrosoftConfigured() {
  return CLIENT_ID && CLIENT_ID !== 'your_client_id_here';
}

/**
 * Check if a user is currently logged in (has cached tokens).
 */
async function isLoggedIn() {
  const client = getMsalClient();
  if (!client) return false;

  try {
    const accounts = await client.getTokenCache().getAllAccounts();
    return accounts.length > 0;
  } catch {
    return false;
  }
}

/**
 * Logout — clear all cached tokens.
 */
async function logout() {
  const client = getMsalClient();
  if (!client) return;

  try {
    const accounts = await client.getTokenCache().getAllAccounts();
    for (const account of accounts) {
      await client.getTokenCache().removeAccount(account);
    }
    // Delete the cache file
    if (fs.existsSync(TOKEN_CACHE_PATH)) {
      fs.unlinkSync(TOKEN_CACHE_PATH);
    }
  } catch (err) {
    console.error('⚠️ Error during logout:', err.message);
  }
}

module.exports = {
  startDeviceCodeAuth,
  getAccessToken,
  getLoggedInUser,
  isMicrosoftConfigured,
  isLoggedIn,
  logout,
};
