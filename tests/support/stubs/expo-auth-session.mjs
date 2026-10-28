// Stand-in for expo-auth-session: plays Microsoft's part of the sign-in. The real sign-in sheet and its redirect cannot
// run under Node (they need a device build), so a test decides what Microsoft "returns" and this module records exactly
// what the app asked for: the AuthRequest settings, the endpoints, the sheet's options and the code-for-token exchange.
export const ResponseType = { Code: 'code', Token: 'token', IdToken: 'id_token' };
export const Prompt = { None: 'none', Login: 'login', Consent: 'consent', SelectAccount: 'select_account' };
export const CodeChallengeMethod = { S256: 'S256', Plain: 'plain' };

export class TokenError extends Error {
  constructor(code, description) {
    super(code);
    this.code = code;
    this.description = description;
  }
}

const calls = { requests: [], prompts: [], promptOptions: [], exchanges: [] };
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
  calls.promptOptions.length = 0;
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

  async promptAsync(discovery, options) {
    calls.prompts.push(discovery);
    calls.promptOptions.push(options);
    return behaviour.promptResult(this);
  }
}

export async function exchangeCodeAsync(config, discovery) {
  calls.exchanges.push({ config, discovery });
  return behaviour.exchange(config);
}
