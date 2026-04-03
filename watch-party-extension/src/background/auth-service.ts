// Google Auth Service for Chrome Extension

export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture: string;
}

const STORAGE_KEY = 'watchparty_google_user';

class AuthService {
  private cachedUser: GoogleUser | null = null;

  /**
   * Sign in with Google using Chrome Identity API
   */
  async signIn(): Promise<GoogleUser> {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, async (token) => {
        if (chrome.runtime.lastError) {
          console.error('[Auth] Sign in error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!token) {
          reject(new Error('No token received'));
          return;
        }

        try {
          // Fetch user info from Google
          const response = await fetch(
            'https://www.googleapis.com/oauth2/v2/userinfo',
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (!response.ok) {
            throw new Error('Failed to fetch user info');
          }

          const data = await response.json();
          
          const user: GoogleUser = {
            id: data.id,
            email: data.email,
            name: data.name,
            picture: data.picture,
          };

          // Cache and store user
          this.cachedUser = user;
          await chrome.storage.sync.set({ [STORAGE_KEY]: user });
          
          console.log('[Auth] Signed in as:', user.name);
          resolve(user);
        } catch (error) {
          // Revoke token on error
          chrome.identity.removeCachedAuthToken({ token }, () => {});
          reject(error);
        }
      });
    });
  }

  /**
   * Sign out and clear cached credentials
   */
  async signOut(): Promise<void> {
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (token) {
          // Revoke the token
          chrome.identity.removeCachedAuthToken({ token }, () => {
            // Also revoke from Google
            fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
          });
        }
        
        // Clear stored user
        this.cachedUser = null;
        chrome.storage.sync.remove(STORAGE_KEY, () => {
          console.log('[Auth] Signed out');
          resolve();
        });
      });
    });
  }

  /**
   * Get current signed-in user (from cache or storage)
   */
  async getCurrentUser(): Promise<GoogleUser | null> {
    if (this.cachedUser) {
      return this.cachedUser;
    }

    const result = await chrome.storage.sync.get(STORAGE_KEY);
    this.cachedUser = result[STORAGE_KEY] || null;
    return this.cachedUser;
  }

  /**
   * Check if user is signed in
   */
  async isSignedIn(): Promise<boolean> {
    const user = await this.getCurrentUser();
    return user !== null;
  }

  /**
   * Get display name for chat (Google name or fallback)
   */
  async getDisplayName(): Promise<string> {
    const user = await this.getCurrentUser();
    if (user) {
      // Use first name or full name
      return user.name.split(' ')[0] || user.name;
    }
    return null as unknown as string;
  }
}

export const authService = new AuthService();
