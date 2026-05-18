import { OAuthProvider } from 'appwrite';
import { appwriteAccount } from '@shared/api-client';
import { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID } from '@shared/constants';

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
   * Make sure there is some Appwrite session attached to this client.
   * On first use we create an anonymous session so the extension can
   * read/write without forcing the user through Google sign-in.
   */
  async ensureSession(): Promise<void> {
    try {
      await appwriteAccount.get();
      return;
    } catch {
      // No active session — create one.
    }
    try {
      await appwriteAccount.createAnonymousSession();
      console.log('[Auth] Anonymous Appwrite session created');
    } catch (err) {
      console.error('[Auth] Failed to create anonymous session:', err);
      throw err;
    }
  }

  /**
   * Sign in with Google via Appwrite OAuth2.
   *
   * We can't use Appwrite's `createOAuth2Session` directly inside an
   * extension because it expects a same-origin browser redirect.
   * Instead, we drive the flow ourselves with
   * `chrome.identity.launchWebAuthFlow` pointed at Appwrite's OAuth
   * endpoint, then capture the cookie/JWT from the redirect target.
   *
   * Wiring this up end-to-end requires the user to:
   *   1. Add `chrome-extension://<EXT_ID>/callback.html` to the
   *      Appwrite project's allowed platforms / OAuth redirect list.
   *   2. Configure the Google OAuth provider inside Appwrite.
   *
   * Both are documented in docs/PLAN.md §11 (M1 spike).
   */
  async signInWithGoogle(): Promise<GoogleUser> {
    await this.ensureSession();

    const redirectUrl = chrome.identity.getRedirectURL('callback');
    const authUrl = new URL(`${APPWRITE_ENDPOINT}/account/sessions/oauth2/${OAuthProvider.Google}`);
    authUrl.searchParams.set('project', APPWRITE_PROJECT_ID);
    authUrl.searchParams.set('success', redirectUrl);
    authUrl.searchParams.set('failure', redirectUrl + '?status=failure');

    const responseUrl = await new Promise<string>((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl.toString(), interactive: true },
        (callbackUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!callbackUrl) {
            reject(new Error('OAuth flow returned no callback URL'));
            return;
          }
          resolve(callbackUrl);
        }
      );
    });

    if (responseUrl.includes('status=failure')) {
      throw new Error('Google sign-in was cancelled or failed');
    }

    // Appwrite drops a session cookie on success. After the redirect,
    // a fresh `account.get()` will return the upgraded user.
    const account = await appwriteAccount.get();
    const user: GoogleUser = {
      id: account.$id,
      email: account.email,
      name: account.name,
      picture: '',
    };

    this.cachedUser = user;
    await chrome.storage.sync.set({ [STORAGE_KEY]: user });
    return user;
  }

  async signOut(): Promise<void> {
    try {
      await appwriteAccount.deleteSession('current');
    } catch (err) {
      console.warn('[Auth] deleteSession failed:', err);
    }
    this.cachedUser = null;
    await chrome.storage.sync.remove(STORAGE_KEY);

    // Re-create an anonymous session so the extension keeps working.
    await this.ensureSession();
  }

  async getCurrentUser(): Promise<GoogleUser | null> {
    if (this.cachedUser) return this.cachedUser;
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    this.cachedUser = result[STORAGE_KEY] || null;
    return this.cachedUser;
  }

  async isSignedIn(): Promise<boolean> {
    const user = await this.getCurrentUser();
    return user !== null;
  }

  async getDisplayName(): Promise<string | null> {
    const user = await this.getCurrentUser();
    if (!user) return null;
    return user.name.split(' ')[0] || user.name;
  }

  /**
   * Return the Appwrite account `$id` for the current session. Used to
   * build document permissions — Appwrite's `Role.user(...)` only
   * accepts the canonical account id, not our client-side
   * `user_xxxxx` identifier in `chrome.storage`.
   */
  async getAppwriteUserId(): Promise<string> {
    await this.ensureSession();
    const account = await appwriteAccount.get();
    return account.$id;
  }
}

export const authService = new AuthService();
