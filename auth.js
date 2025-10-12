// Google OAuth Configuration
const CLIENT_ID = '856828042385-77s8aigmq798rp3puhcj02mp3pib8js7.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';

let tokenClient;
let accessToken = null;
let tokenExpiry = null;

// Initialize Google Identity Services
function initializeGoogleAuth() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        prompt: 'consent',
        callback: (response) => {
            if (response.access_token) {
                accessToken = response.access_token;
                // Store token with expiry (default 3600 seconds = 1 hour)
                tokenExpiry = Date.now() + (response.expires_in || 3600) * 1000;
                localStorage.setItem('accessToken', accessToken);
                localStorage.setItem('tokenExpiry', tokenExpiry.toString());
                onSignIn();
            }
        },
    });
}

function handleSignIn() {
    tokenClient.requestAccessToken();
    setInterval(saveTasksToSheet, 10000);
}

function handleSignOut() {
    // Clear tokens from memory and localStorage
    accessToken = null;
    tokenExpiry = null;
    spreadsheetId = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('tokenExpiry');

    // Revoke token with Google
    if (accessToken) {
        google.accounts.oauth2.revoke(accessToken);
    }

    document.getElementById('signedOut').style.display = 'block';
    document.getElementById('signedIn').style.display = 'none';
    document.getElementById('appContent').classList.add('disabled');
    document.getElementById('userEmail').textContent = '';
    renderTasks();
}

// Check if token is expired or about to expire (within 5 minutes)
function isTokenExpired() {
    if (!tokenExpiry) return true;
    return Date.now() >= (tokenExpiry - 5 * 60 * 1000);
}

// Refresh the access token
function refreshAccessToken() {
    return new Promise((resolve, reject) => {
        if (!tokenClient) {
            reject(new Error('Token client not initialized'));
            return;
        }

        tokenClient.requestAccessToken({
            prompt: '', // Empty prompt for silent refresh
        });

        // The callback in initializeGoogleAuth will handle storing the new token
        resolve();
    });
}

// Ensure we have a valid token before making API calls
async function ensureValidToken() {
    if (!accessToken || isTokenExpired()) {
        await refreshAccessToken();
    }
}

async function onSignIn() {
    document.getElementById('signedOut').style.display = 'none';
    document.getElementById('signedIn').style.display = 'block';
    document.getElementById('appContent').classList.remove('disabled');

    try {
        await ensureValidToken();

        // Get user info
        const userInfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
        }).then(r => r.json());

        document.getElementById('userEmail').textContent = userInfo.email;

        // Create or find spreadsheet
        await initDataService();

        // Load tasks
        await loadTasksFromSheet();
    } catch (error) {
        console.error('Error during sign in:', error);
        handleSignOut();
    }
}

// Restore session from localStorage
async function restoreSession() {
    const storedToken = localStorage.getItem('accessToken');
    const storedExpiry = localStorage.getItem('tokenExpiry');

    if (storedToken && storedExpiry) {
        accessToken = storedToken;
        tokenExpiry = parseInt(storedExpiry);

        // Check if token is still valid
        if (!isTokenExpired()) {
            // Token is still valid, sign in automatically
            await onSignIn();
        } else {
            // Token expired, try to refresh
            try {
                await refreshAccessToken();
            } catch (error) {
                console.log('Could not refresh token, user needs to sign in again');
                // Clear invalid tokens
                localStorage.removeItem('accessToken');
                localStorage.removeItem('tokenExpiry');
                accessToken = null;
                tokenExpiry = null;
            }
        }
    }
}

// Get the current access token
function getAccessToken() {
    return accessToken;
}
