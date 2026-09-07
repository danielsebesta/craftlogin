export const english = {
  authorizationError: {
    codeLabel: 'Protocol error',
    footer: 'No account information was shared.',
    heading: 'This sign-in request cannot continue.',
    message: 'Return to the app that sent you here and start sign-in again.',
    title: 'Sign-in request failed',
  },
  api: {
    documentation: {
      description: 'OAuth 2.0 and OpenID Connect identity for Minecraft Java Edition accounts.',
      operations: {
        appRegistration: {
          description:
            'Register an OAuth client. Confidential client secrets are returned once and stored only as an Argon2id hash.',
          summary: 'Register an OAuth client',
        },
        authorize: {
          description: 'Begin or resume an OAuth 2.0 authorization-code flow.',
          summary: 'Authorize',
        },
        completeInteraction: {
          description:
            'Claim a verified Minecraft identity and resume the OIDC authorization flow.',
          summary: 'Complete Minecraft verification',
        },
        currentUser: {
          description:
            'Return the Minecraft UUID and current username represented by the access token.',
          summary: 'Get the current Minecraft user',
        },
        discovery: { summary: 'Get authorization server metadata' },
        interactionPage: {
          description: 'Render the Minecraft account verification interaction.',
          response: 'Accessible Minecraft verification page.',
          summary: 'Show Minecraft verification',
        },
        interactionStatus: {
          description: 'Read verification state for the active signed OIDC interaction.',
          summary: 'Check Minecraft verification',
        },
        jwks: { summary: 'Get signing keys' },
        revoke: { summary: 'Revoke a token' },
        token: {
          description: 'Redeem a single-use authorization code or rotate a refresh token.',
          summary: 'Exchange a token',
        },
        userInfo: {
          description: 'Return standard OIDC claims for an OpenID-scoped access token.',
          summary: 'Get OIDC UserInfo',
        },
        webfinger: { summary: 'Resolve issuer metadata' },
      },
      scopes: {
        openid: 'Authenticate the Minecraft account.',
        profile: 'Read the current Minecraft username.',
      },
      tags: {
        applications: 'Register public and confidential OAuth clients.',
        identity: 'Read the Minecraft identity represented by an access token.',
        interactions: 'Complete Minecraft account verification.',
        oauth: 'Standards-based OAuth 2.0 and OpenID Connect endpoints.',
      },
      title: 'CraftLogin API',
    },
    errors: {
      badRequest: 'The request is invalid.',
      internal: 'Something went wrong. Please try again.',
      interactionExpired: 'This verification request has expired. Return to the app and try again.',
      interactionInvalid: 'This verification request is no longer valid.',
      insufficientScope: 'The access token does not grant access to the requested identity.',
      notFound: 'The requested resource was not found.',
      rateLimited: 'Too many requests. Wait a moment and try again.',
      unauthorized: 'A valid access token is required.',
    },
    oauthServerError: 'The authorization server could not complete the request.',
    oauthArtifactUnavailable: 'The token is missing, expired, or has already been used.',
    oauthStateRequired: 'state parameter is required and must be at most 1024 characters',
  },
  interaction: {
    addressLabel: 'Minecraft server address',
    appLead: 'Continue to the Minecraft server below to sign in to',
    brand: 'CraftLogin',
    continueButton: 'I connected — continue',
    eyebrow: 'Secure account handoff',
    footer: 'CraftLogin verifies only your Minecraft UUID and username.',
    heading: 'Prove it in-game.',
    instructionsHeading: 'Three quick steps',
    noJavaScript:
      'Automatic status checks need JavaScript. You can still connect in Minecraft, then use the continue button.',
    securityNote:
      'Authentication is completed by Minecraft online mode. CraftLogin never asks for your Microsoft password.',
    statusLabel: 'Status',
    interactionRequired: 'Minecraft account verification is required',
    status: {
      expired: 'This code expired. Return to the app and start again.',
      networkError: 'The status check was interrupted. Retrying shortly…',
      pending: 'Waiting for your Minecraft connection…',
      stopped: 'Automatic checks stopped. Use the continue button after connecting.',
      verified: 'Minecraft account verified. Returning to the app…',
    },
    steps: [
      'Open Minecraft: Java Edition.',
      'Choose Multiplayer, then Direct Connection.',
      'Connect to the exact server address shown here.',
    ],
    title: 'Verify with Minecraft',
    protocolLabel: 'OAuth 2.0 / OpenID Connect',
  },
  minecraft: {
    motd: 'CraftLogin Minecraft verification',
    success: 'Verification complete. You can return to your browser.',
    unavailable:
      'This verification code is invalid or has expired. Return to your browser and try again.',
    temporaryFailure:
      'Verification is temporarily unavailable. Return to your browser and try again.',
    shutdown: 'CraftLogin is restarting. Return to your browser and try again.',
  },
};
