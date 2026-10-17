import type {
  CredentialResponse,
  GsiButtonConfiguration,
  IdConfiguration,
} from "@react-oauth/google";

type GoogleAccountsId = {
  initialize: (config: IdConfiguration) => void;
  renderButton: (parent: HTMLElement, options: GsiButtonConfiguration) => void;
  prompt: () => void;
  cancel: () => void;
};

type GoogleIdentityWindow = Window & {
  google?: {
    accounts?: {
      id?: Partial<GoogleAccountsId>;
    };
  };
};

type CredentialHandler = (response: CredentialResponse) => void;

// GSI keeps a single client per page and warns when initialize() runs again, so the button and
// One Tap share one initialization. Credentials route through whichever handler is current.
let initializedClient: { api: Partial<GoogleAccountsId>; clientId: string } | null = null;
let credentialHandler: CredentialHandler | null = null;

function getGoogleAccountsId() {
  if (typeof window === "undefined") {
    return undefined;
  }
  return (window as GoogleIdentityWindow).google?.accounts?.id;
}

export function initializeGoogleIdentity(clientId: string) {
  const api = getGoogleAccountsId();
  if (!api?.initialize) {
    return null;
  }
  if (initializedClient?.api !== api || initializedClient.clientId !== clientId) {
    api.initialize({
      client_id: clientId,
      callback: (response) => credentialHandler?.(response),
      auto_select: true,
      cancel_on_tap_outside: false,
      itp_support: true,
      use_fedcm_for_prompt: true,
      use_fedcm_for_button: true,
    });
    initializedClient = { api, clientId };
  }
  return api;
}

export function setGoogleCredentialHandler(handler: CredentialHandler) {
  credentialHandler = handler;
  return () => {
    if (credentialHandler === handler) {
      credentialHandler = null;
    }
  };
}

export function cancelGoogleIdentityPrompt() {
  try {
    getGoogleAccountsId()?.cancel?.();
  } catch {
    // Ignore Google Identity cleanup failures; the next render will reinitialize it.
  }
}
