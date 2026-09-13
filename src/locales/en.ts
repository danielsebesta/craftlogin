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
        avatarBody: {
          description: 'Render the full Minecraft player model from its current signed skin.',
          summary: 'Render a Minecraft body',
        },
        avatarBust: {
          description: 'Render the Minecraft head, torso, and arms from its current signed skin.',
          summary: 'Render a Minecraft bust',
        },
        avatarFace: {
          description:
            'Render the front eight-by-eight face with its transparent Minecraft head overlay.',
          summary: 'Render a Minecraft face',
        },
        avatarHead: {
          description: 'Render a three-dimensional Minecraft head from its current signed skin.',
          summary: 'Render a Minecraft head',
        },
        avatarSkin: {
          description: 'Return the current signed Mojang skin for a Minecraft UUID.',
          summary: 'Get a Minecraft skin',
        },
        authorize: {
          description: 'Begin or resume an OAuth 2.0 authorization-code flow.',
          summary: 'Authorize',
        },
        abortInteraction: {
          description:
            'Deny the pending request and return a standard access_denied error to the client.',
          summary: 'Deny Minecraft verification',
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
        playerProfile: {
          description:
            'Resolve a current Minecraft Java username or UUID to its canonical UUID and username.',
          summary: 'Resolve a Minecraft player',
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
        skinVerificationDownload: { summary: 'Download the marked Minecraft skin' },
        skinVerificationStart: {
          description:
            'Create a short-lived marked skin for a Minecraft Java player in the active interaction.',
          summary: 'Start skin verification',
        },
        skinVerificationStatus: {
          description: 'Check a fresh signed Minecraft profile for the short-lived skin marker.',
          summary: 'Check skin verification',
        },
        introspection: {
          description: 'Inspect an access or refresh token issued to the authenticated client.',
          summary: 'Introspect a token',
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
        profile: 'Read the current Minecraft username and avatar.',
      },
      tags: {
        applications: 'Manage public and confidential OAuth clients as an authenticated developer.',
        avatars: 'Fetch and render signed Minecraft skins without authentication.',
        identity:
          'Resolve public Minecraft identities or read the identity represented by a token.',
        interactions: 'Complete Minecraft account verification.',
        oauth: 'Standards-based OAuth 2.0 and OpenID Connect endpoints.',
      },
      title: 'CraftLogin API',
    },
    errors: {
      administratorRequired: 'Administrator access is required.',
      appNotFound: 'The OAuth application was not found.',
      avatarNotFound: 'The Minecraft skin was not found.',
      avatarUnavailable: 'The Minecraft skin service is temporarily unavailable.',
      badRequest: 'The request is invalid.',
      csrfInvalid: 'This form expired or came from an untrusted page. Refresh and try again.',
      developerAuthenticationRequired: 'Sign in as a registered developer to continue.',
      developerNotFound: 'The developer account was not found.',
      forbidden: 'You do not have permission to perform this action.',
      internal: 'Something went wrong. Please try again.',
      interactionExpired: 'This verification request has expired. Return to the app and try again.',
      interactionInvalid: 'This verification request is no longer valid.',
      minecraftPlayerNotFound: 'That Minecraft Java player could not be found.',
      minecraftProfileUnavailable: 'The Minecraft profile service is temporarily unavailable.',
      minecraftSkinUnavailable: 'The Minecraft skin service is temporarily unavailable.',
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
      identifierLabel: 'Minecraft name or UUID',
      identifierPlaceholder: 'Notch or 069a79f4-44e9-4726-a5be-fca90e38aaf5',
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
    },
    app: {
      avatarLabel: 'Avatar',
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
      signedInAs: 'Signed in as',
      uuidLabel: 'Signed in UUID',
    },
    footer:
      'Developer access is verified by Minecraft online mode. No Microsoft password is collected.',
    login: {
      addressPending: 'Preparing secure address…',
      appName: 'Developer Console',
      permission: 'Access the Developer Console and manage your applications.',
      verifiedAddress: 'Minecraft verification complete',
      skinNotFound: 'That Minecraft Java player could not be found. Check the username.',
      skinUnavailable: 'Minecraft skin verification is temporarily unavailable. Try again shortly.',
    },
    navigation: {
      ariaLabel: 'Developer navigation',
      brand: 'CraftLogin',
      console: 'Developer Console',
      home: 'Project home',
    },
    cli: {
      adminGranted: 'Administrator access granted to',
      invalidUuid: 'Provide one Minecraft name or canonical UUID.',
      usage: 'Usage: npm run admin:grant -- <minecraft-name-or-uuid>',
    },
  },
  landing: {
    affiliation: 'Not affiliated with Mojang or Microsoft.',
    callToAction: {
      heading: 'Ready to add it?',
      text: 'Register a client in the Console, then send your first authorization request.',
    },
    claims: {
      claimHeading: 'Claim',
      detailHeading: 'Detail',
      heading: 'What your app receives',
      rows: [
        {
          claim: 'sub',
          detail: 'The Minecraft UUID. It survives a username change.',
          value: '123e4567-e89b-42d3-a456-426614174000',
        },
        {
          claim: 'preferred_username',
          detail: 'The username the account has right now.',
          value: 'Player',
        },
        {
          claim: 'picture',
          detail: 'A head rendered from the current Mojang skin.',
          value: 'https://craftlogin.com/avatar/123e4567-e89b-42d3-a456-426614174000',
        },
      ],
      scopes: [
        { detail: 'Sign in to the Minecraft account.', name: 'openid' },
        { detail: 'Read the username and avatar.', name: 'profile' },
      ],
      scopesHeading: 'Scopes',
      valueHeading: 'Example',
      text: 'Every sign-in returns the same three values, whatever the player is called now.',
    },
    endpoints: {
      heading: 'Endpoints',
      items: [
        { detail: 'Start the sign-in. Requires S256 PKCE.', path: '/oauth2/authorize' },
        { detail: 'Exchange a code, or rotate a refresh token.', path: '/oauth2/token' },
        { detail: 'Read the OpenID Connect claims.', path: '/oauth2/userinfo' },
        { detail: 'Check a token from a resource server.', path: '/oauth2/introspect' },
        { detail: 'End the session at the provider.', path: '/oauth2/logout' },
        { detail: 'Public keys that verify our tokens.', path: '/oauth2/jwks' },
        { detail: 'Invalidate a token.', path: '/oauth2/revoke' },
      ],
    },
    flow: {
      claimLabel: 'Your callback receives',
      claimValue: '{ sub: "minecraft-uuid", preferred_username: "Player" }',
      exampleAddress: 'K7MPQ4RX.craftlogin.com',
      exampleLabel: 'The player connects to',
      heading: 'How it works',
      items: [
        {
          detail:
            'Send a normal authorization request with S256 PKCE. CraftLogin answers with one server address to show the player.',
          title: 'Your app starts the sign-in',
        },
        {
          detail:
            'The player pastes that address into Minecraft Java Edition and joins. It works once, then expires after five minutes.',
          title: 'The player joins the server',
        },
        {
          detail:
            'Online mode proves the account is theirs. CraftLogin returns the UUID and the current username.',
          title: 'You receive the identity',
        },
      ],
    },
    footer: {
      license: 'MIT licensed',
    },
    hero: {
      codeLabel: 'Your app sends',
      consoleAction: 'Open the Console',
      documentationAction: 'Read the API docs',
      githubAction: 'View source',
      heading: 'Add Minecraft login to your app',
      lead: 'An OpenID Connect provider for Minecraft Java Edition. The player joins a short server address to prove the account is theirs, and your app receives the UUID and username.',
      request:
        'GET /oauth2/authorize\n  ?response_type=code\n  &client_id=cl_your_client\n  &redirect_uri=https%3A%2F%2Fexample.com%2Fcallback\n  &scope=openid%20profile\n  &state=<random>\n  &code_challenge=<S256>\n  &code_challenge_method=S256',
    },
    navigation: {
      ariaLabel: 'Primary navigation',
      brand: 'CraftLogin',
      developers: 'Console',
      documentation: 'Docs',
      github: 'GitHub',
    },
    quickstart: {
      exchangeCode:
        'POST /oauth2/token\n  grant_type=authorization_code\n  &code=<code>\n  &redirect_uri=https%3A%2F%2Fexample.com%2Fcallback\n  &client_id=cl_your_client\n  &code_verifier=<verifier>',
      exchangeHeading: 'Then exchange the code',
      heading: 'Quickstart',
      text: 'Register a client in the Console to get a client ID. Redirect the player to the authorization endpoint, then trade the single-use code from your callback for tokens.',
    },
    security: {
      heading: 'Security',
      text: 'No Microsoft password ever reaches CraftLogin, so there is no password or email address to leak. Every client must use PKCE, redirect URIs are matched exactly, and each authorization code works once.',
    },
  },
  interaction: {
    addressLabel: 'Minecraft server address',
    allowsHeading: 'This app will receive:',
    brand: 'CraftLogin',
    cancelButton: 'Cancel',
    changeAccount: 'Use a different account',
    continueButton: 'Allow',
    copied: 'Copied',
    copyAddress: 'Copy address',
    footer: 'CraftLogin verifies only the Minecraft UUID and username.',
    heading: 'Sign in to',
    scopeIdentity: 'Your Minecraft identity (stable UUID)',
    scopeOffline: 'Stay signed in between visits',
    scopeProfile: 'Your current username and avatar',
    interactionRequired: 'Minecraft account verification is required',
    lead: 'Confirm your Minecraft account below to continue.',
    signedInAs: 'Signed in as',
    consentLead: 'Review what this application is requesting.',
    noJavaScript:
      'Automatic status checks need JavaScript. You can still connect in Minecraft, then use the continue button.',
    securityNote:
      'Minecraft online mode or a fresh Mojang-signed skin profile verifies the account. CraftLogin never asks for a Microsoft password.',
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
    skin: {
      accountLabel: 'Minecraft Java username',
      accountPlaceholder: 'Player',
      downloadButton: 'Download verification skin',
      formatLegacy: 'legacy 64×32',
      formatModern: 'modern 64×64',
      formatLabel: 'Skin format',
      heading: 'Or verify by changing your skin',
      headingAlternative: 'Verify by changing your skin',
      modelClassic: 'classic / wide arms',
      modelSlim: 'slim arms',
      modelLabel: 'Arm model',
      startButton: 'Create verification skin',
      startHint:
        'CraftLogin adds a one-time marker to an unused 8×8 area. Existing custom skins keep every visible base and overlay pixel; accounts using only a default skin receive a temporary template.',
      statusPending: 'Waiting for the marked skin to appear on your Minecraft profile.',
      steps: [
        'Download the marked PNG below.',
        'Upload it as your skin in the Minecraft Launcher or on Minecraft.net. Keep the shown arm model.',
        'Wait here while CraftLogin checks the signed Minecraft profile.',
      ],
      usernameLabel: 'Minecraft username',
    },
  },
  logout: {
    body: 'You will be signed out of this browser session.',
    confirm: 'Sign out',
    decline: 'Stay signed in',
    heading: 'Sign out of CraftLogin?',
    title: 'Sign out',
  },
  logoutSuccess: {
    body: 'You can close this page or return to the application.',
    heading: 'You are signed out.',
    returnAction: 'Return to CraftLogin',
    title: 'Signed out',
  },
  minecraft: {
    motd: 'CraftLogin verification',
    motdDetail: 'Join with the code shown in your browser',
    success: 'Verification complete. You can return to your browser.',
    unavailable:
      'This verification code is invalid or has expired. Return to your browser and try again.',
    temporaryFailure:
      'Verification is temporarily unavailable. Return to your browser and try again.',
    shutdown: 'CraftLogin is restarting. Return to your browser and try again.',
    lobbyWelcome: 'Welcome to CraftLogin. This server verifies Minecraft accounts for sign-in.',
    lobbyHint:
      'Start signing in from the application, then join the server address it shows in your browser.',
    lobbyTimeout: 'You have been disconnected from the CraftLogin lobby. Reconnect to continue.',
    lobbyFull: 'The CraftLogin lobby is at capacity. Please try again shortly.',
  },
};
