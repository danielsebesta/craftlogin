export const english = {
  authorizationError: {
    codeLabel: 'Protocol error',
    footer: 'No account information was shared.',
    heading: 'This sign-in request cannot continue.',
    message: 'Return to the app that sent you here and start sign-in again.',
    title: 'Sign-in request failed',
  },
  common: {
    skipToContent: 'Skip to main content',
  },
  api: {
    documentation: {
      description: 'OAuth 2.0 and OpenID Connect identity for Minecraft Java Edition accounts.',
      operations: {
        appRegistration: {
          description:
            'Register an OAuth client owned by the authenticated developer. Confidential client secrets are returned once and stored only as an Argon2id hash.',
          summary: 'Register an OAuth client',
        },
        appDelete: { summary: 'Delete an owned OAuth client' },
        appList: { summary: 'List manageable OAuth clients' },
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
        applications: 'Manage public and confidential OAuth clients as an authenticated developer.',
        identity: 'Read the Minecraft identity represented by an access token.',
        interactions: 'Complete Minecraft account verification.',
        oauth: 'Standards-based OAuth 2.0 and OpenID Connect endpoints.',
      },
      title: 'CraftLogin API',
    },
    errors: {
      administratorRequired: 'Administrator access is required.',
      appNotFound: 'The OAuth application was not found.',
      badRequest: 'The request is invalid.',
      csrfInvalid: 'This form expired or came from an untrusted page. Refresh and try again.',
      developerAuthenticationRequired: 'Sign in as a registered developer to continue.',
      developerNotFound: 'The developer account was not found.',
      forbidden: 'You do not have permission to perform this action.',
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
  developer: {
    accessDenied: {
      detail:
        'Your Minecraft identity was verified, but its UUID is not registered for developer access.',
      heading: 'This account is not on the list.',
      retry: 'Try another Minecraft account',
      title: 'Developer access denied',
    },
    admin: {
      addAction: 'Grant access',
      adminRole: 'Administrator',
      createdLabel: 'Added',
      developerRole: 'Developer',
      empty: 'No developer accounts have been registered yet.',
      heading: 'Access registry',
      intro:
        'Grant console access by Minecraft UUID. Role changes take effect on the next request.',
      invalidFormNotice: 'Check the Minecraft UUID and access level, then try again.',
      lastAdminNotice: 'The final administrator cannot be demoted or removed.',
      notFoundNotice: 'That developer account was not found.',
      removeAction: 'Remove',
      roleLabel: 'Access level',
      saveRoleAction: 'Save role',
      summary: 'Administration',
      uuidLabel: 'Minecraft UUID',
      uuidPlaceholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    },
    app: {
      clientIdLabel: 'Client ID',
      confidentialHelp: 'For server-side applications that can protect a secret.',
      confidentialLabel: 'Confidential client',
      createAction: 'Create application',
      createdHeading: 'Application created.',
      createdIntro:
        'Copy the client ID and secret now. The secret is shown once and stored only as a hash.',
      createdTitle: 'New OAuth application',
      deleteAction: 'Delete',
      empty: 'No applications yet. Register one to get a client ID.',
      formErrorNotice: 'Check the application name and redirect URIs, then try again.',
      nameLabel: 'Application name',
      namePlaceholder: 'Community map',
      newHeading: 'New application',
      ownerLabel: 'Owner UUID',
      publicHelp: 'For browser, desktop, mobile, or other clients that cannot keep a secret.',
      publicLabel: 'Public client',
      redirectHelp: 'One exact URI per line. HTTPS is required except on localhost.',
      redirectLabel: 'Redirect URIs',
      redirectPlaceholder: 'https://example.com/oauth/callback',
      secretLabel: 'Client secret, shown once',
      copyLabel: 'Copy',
      typeLabel: 'Client type',
      unassignedOwner: 'Unassigned',
    },
    confirm: {
      appAction: 'Delete application',
      appBody: 'The client ID and secret stop working immediately. This cannot be undone.',
      appHeading: 'Delete this application?',
      appTitle: 'Delete application',
      cancel: 'Cancel',
      developerBody: 'The account loses console access immediately. This cannot be undone.',
      developerHeading: 'Remove this developer?',
      developerTitle: 'Remove developer',
      removeAction: 'Remove access',
    },
    dashboard: {
      adminBadge: 'Administrator',
      applicationsHeading: 'Applications',
      developerBadge: 'Developer',
      docsLink: 'API docs',
      heading: 'Developer Console',
      lead: 'Register OAuth clients and manage exact redirect URIs tied to your Minecraft UUID.',
      logout: 'Sign out',
      uuidLabel: 'Signed in UUID',
    },
    footer:
      'Developer access is verified by Minecraft online mode. No Microsoft password is collected.',
    login: {
      addressPending: 'Preparing secure address…',
      appName: 'Developer Console',
      verifiedAddress: 'Minecraft verification complete',
    },
    navigation: {
      ariaLabel: 'Developer navigation',
      brand: 'CraftLogin',
      console: 'Developer Console',
      home: 'Project home',
    },
    cli: {
      adminGranted: 'Administrator access granted to',
      invalidUuid: 'Provide one canonical Minecraft UUID.',
      usage: 'Usage: npm run admin:grant -- <minecraft-uuid>',
    },
  },
  landing: {
    affiliation: 'Not affiliated with Mojang or Microsoft.',
    claims: {
      heading: 'Claims and scopes',
      rows: [
        {
          claim: 'sub',
          detail: 'Stable Minecraft UUID of the verified account.',
          value: '123e4567-e89b-42d3-a456-426614174000',
        },
        {
          claim: 'preferred_username',
          detail: 'Current Minecraft username at verification time.',
          value: 'Player',
        },
      ],
      scopesHeading: 'Scopes',
      scopes: [
        { detail: 'Authenticate the Minecraft account.', name: 'openid' },
        { detail: 'Read the current Minecraft username.', name: 'profile' },
      ],
      claimHeading: 'Claim',
      detailHeading: 'Detail',
      valueHeading: 'Example',
    },
    endpoints: {
      heading: 'Endpoints',
      items: [
        { detail: 'Authorization code flow with S256 PKCE.', path: '/oauth2/authorize' },
        { detail: 'Code exchange and refresh token rotation.', path: '/oauth2/token' },
        { detail: 'OpenID Connect UserInfo.', path: '/oauth2/userinfo' },
        { detail: 'Signing keys.', path: '/oauth2/jwks' },
        { detail: 'Token revocation.', path: '/oauth2/revoke' },
      ],
    },
    flow: {
      claimLabel: 'Returned identity',
      claimValue: '{ sub: "minecraft-uuid", preferred_username: "Player" }',
      exampleAddress: 'K7MPQ4RX.craftlogin.com',
      exampleLabel: 'Temporary Minecraft address',
      heading: 'How verification works',
      items: [
        {
          detail:
            'Your application redirects the user with a standard authorization request and S256 PKCE.',
          title: 'Start OAuth',
        },
        {
          detail:
            'CraftLogin shows a single-use Minecraft address that stays valid for five minutes.',
          title: 'User joins Minecraft',
        },
        {
          detail:
            'Online mode authenticates the account, and your callback receives the UUID and username.',
          title: 'Receive identity',
        },
      ],
    },
    footer: {
      license: 'MIT licensed',
    },
    hero: {
      consoleAction: 'Open Developer Console',
      documentationAction: 'Read the API docs',
      githubAction: 'View on GitHub',
      heading: 'OIDC identity for Minecraft Java accounts',
      lead: 'CraftLogin verifies a Minecraft Java account through a short-lived online-mode server and returns the player UUID and current username using standard OAuth 2.0 and OpenID Connect.',
    },
    navigation: {
      ariaLabel: 'Primary navigation',
      brand: 'CraftLogin',
      documentation: 'Docs',
      developers: 'Console',
      github: 'GitHub',
    },
    quickstart: {
      code: 'GET /oauth2/authorize\n  ?response_type=code\n  &client_id=cl_your_client\n  &redirect_uri=https%3A%2F%2Fexample.com%2Fcallback\n  &scope=openid%20profile\n  &state=<random>\n  &code_challenge=<S256>\n  &code_challenge_method=S256',
      exchangeHeading: 'Exchange the code',
      exchangeCode:
        'POST /oauth2/token\n  grant_type=authorization_code\n  &code=<code>\n  &redirect_uri=https%3A%2F%2Fexample.com%2Fcallback\n  &client_id=cl_your_client\n  &code_verifier=<verifier>',
      heading: 'Quickstart',
      text: 'Register a client in the Developer Console, then send a standard authorization request with S256 PKCE. Your callback receives a single-use code that you exchange for tokens.',
    },
    security: {
      heading: 'Security model',
      text: 'Minecraft online mode is the identity boundary. CraftLogin stores no email address or password, requires PKCE on every client, and matches redirect URIs exactly.',
    },
  },
  interaction: {
    addressLabel: 'Minecraft server address',
    brand: 'CraftLogin',
    continueButton: 'I connected, continue',
    copied: 'Copied',
    copyAddress: 'Copy address',
    footer: 'CraftLogin verifies only the Minecraft UUID and username.',
    heading: 'Sign in to',
    interactionRequired: 'Minecraft account verification is required',
    lead: 'Join this temporary Minecraft server to confirm your account. This page updates automatically.',
    noJavaScript:
      'Automatic status checks need JavaScript. You can still connect in Minecraft, then use the continue button.',
    securityNote:
      'Minecraft online mode verifies the account. CraftLogin never asks for a Microsoft password.',
    status: {
      expired: 'This code expired. Return to the app and start again.',
      networkError: 'The status check was interrupted. Retrying shortly.',
      pending: 'Waiting for your Minecraft connection.',
      stopped: 'Automatic checks stopped. Use the continue button after connecting.',
      verified: 'Minecraft account verified. Returning to the app.',
    },
    steps: [
      'Open Minecraft: Java Edition.',
      'Choose Multiplayer, then Direct Connection.',
      'Connect to the exact address below.',
    ],
    stepsHeading: 'How to connect',
    title: 'Verify with Minecraft',
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
