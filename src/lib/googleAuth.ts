import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
] as const;

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of GOOGLE_OAUTH_SCOPES) {
  provider.addScope(scope);
}

let isSigningIn = false;
// Keep any transient OAuth access token strictly in JS memory, never in localStorage
let cachedGoogleAccessToken: string | null = null;

export const initGoogleLinkAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthState?: (user: User | null) => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedGoogleAccessToken) {
        onAuthSuccess?.(user, cachedGoogleAccessToken);
      } else if (!isSigningIn) {
        cachedGoogleAccessToken = null;
        onAuthState?.(user);
      }
    } else {
      cachedGoogleAccessToken = null;
      onAuthState?.(null);
    }
  });
};

export const signInWithGoogleLink = async (): Promise<{
  user: User;
  accessToken: string | null;
}> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedGoogleAccessToken = credential?.accessToken || null;
    return { user: result.user, accessToken: cachedGoogleAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getCurrentGoogleUser = (): User | null => auth.currentUser;

export const signOutGoogleLink = async (): Promise<void> => {
  cachedGoogleAccessToken = null;
  await auth.signOut();
};
