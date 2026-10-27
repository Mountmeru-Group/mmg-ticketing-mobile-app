// Stand-in for expo-auth-session: plays Microsoft's part of the sign-in. The real system-browser redirect cannot run
// under Node (it needs an Android build), so a test decides what Microsoft "returns" and this module records exactly
// what the app asked for: the AuthRequest settings, the endpoints, and the code-for-token exchange.
export const ResponseType = { Code: 'code', Token: 'token', IdToken: 'id_token' };
export const Prompt = { None: 'none', Login: 'login', Consent: 'consent', SelectAccount: 'select_account' };

export class TokenError extends Error {
  constructor(code, description) {
    super(code);
    this.code = code;
    this.description = description;
  }
}

/** Not used by the app: getAuthRedirectUri() returns a fixed URI (src/config/auth.config.ts). */
export function makeRedirectUri() {
  return 'unused://stub';
}

const calls = { requests: [], prompts: [], exchanges: [] };
let behaviour = null;

/** What Microsoft does next: `promptResult(request)` for the browser step, `exchange(config)` for the token step. */
export function __setMicrosoft(next) {
  behaviour = next;
}

/** What the app asked Microsoft for, in order. */
export function __calls() {
  return calls;
}

export function __reset() {
  calls.requests.length = 0;
  calls.prompts.length = 0;
  calls.exchanges.length = 0;
  behaviour = null;
}

export class AuthRequest {
  constructor(config) {
    this.config = config;
    // The real library generates a random S256 verifier; a fixed fake one lets the test follow it to the exchange.
    this.codeVerifier = config.usePKCE ? 'fake-pkce-verifier' : undefined;
    calls.requests.push(this);
  }

  async promptAsync(discovery) {
    calls.prompts.push(discovery);
    return behaviour.promptResult(this);
  }
}

export async function exchangeCodeAsync(config, discovery) {
  calls.exchanges.push({ config, discovery });
  return behaviour.exchange(config);
}
