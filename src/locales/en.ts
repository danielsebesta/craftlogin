export const english = {
  authorizationError: {
    codeLabel: 'Protocol error',
    footer: 'No account information was shared.',
    heading: 'This sign-in request cannot continue.',
    message: 'Return to the app that sent you here and start sign-in again.',
    title: 'Sign-in request failed',
  },
  common: {
    legalDisclaimer:
      'NOT AN OFFICIAL MINECRAFT SERVICE. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.',
    operator: 'Operated independently by Daniel Šebesta. Contact: contact@craftlogin.com.',
    skipToContent: 'Skip to main content',
  },
  integration: {
    affiliation:
      'CraftLogin is independent software and is not approved by or associated with Mojang or Microsoft.',
    copied: 'Copied',
    copyPrompt: 'Copy prompt',
    fields: {
      clientId: 'Client ID',
      clientIdHint: 'This is safe to include. Never paste the client secret into an AI tool.',
      clientType: 'Client type',
      confidential: 'Confidential server application',
      framework: 'Framework',
      issuer: 'Issuer',
      postLogoutRedirectUri: 'Post-logout redirect URI',
      public: 'Public client',
      redirectUri: 'Exact callback URI',
      stacks: {
        generic: 'Generic OpenID Connect',
        nextjs: 'Next.js with Auth.js',
        node: 'Node.js server',
        php: 'PHP',
        python: 'Python',
        spa: 'Browser-only SPA',
      },
    },
    footer: 'Use OpenID Connect discovery. Never share your client secret with an AI tool.',
    generate: 'Generate prompt',
    heading: 'Implement CraftLogin with AI',
    intro:
      'Generate a security-focused prompt for Claude Code, Codex, Cursor, Copilot, or another coding agent. The agent will adapt the integration to your existing project.',
    navigation: {
      discovery: 'OIDC discovery',
      llmGuide: 'LLM guide',
    },
    navigationLabel: 'Integration navigation',
    promptHeading: 'Your implementation prompt',
    promptHint:
      'Review the values, copy the complete prompt, and run it from the root of your application project.',
    securityHeading: 'Before you start',
    securityItems: [
      'Create an application in the Developer Console and register the callback URI exactly.',
      'Use a confidential client only when a trusted backend can protect its secret.',
      'Provide only the secret environment-variable name to the agent, never the secret value.',
    ],
    prompt: {
      labels: {
        clientId: 'Client ID',
        clientType: 'Client type',
        configuration: 'Configuration',
        discovery: 'Discovery document',
        issuer: 'OIDC issuer',
        postLogoutRedirectUri: 'Post-logout redirect URI',
        protocolRequirements: 'Protocol and security requirements',
        redirectUri: 'Exact redirect URI',
        secretRule: 'Secret rule',
        stackRequirements: 'Stack-specific requirements',
      },
      opening: 'Implement “Sign in with CraftLogin” in this project.',
      inspect:
        'First inspect the application framework, routing, session management, environment conventions, tests, and authentication dependencies. Reuse established patterns and do not replace unrelated authentication code. Before editing, summarize the architecture and implementation plan. If a required input or framework fact is missing, stop and ask instead of guessing.',
      secret: {
        confidential:
          'Read the secret only from the server-side CRAFTLOGIN_CLIENT_SECRET environment variable. Never ask me to paste its value.',
        public: 'This is a public client. Do not configure, request, or invent a client secret.',
      },
      requirements: [
        'Use a maintained OpenID Connect library appropriate for this project. Do not implement OAuth, token exchange, discovery, or JWT validation manually.',
        'Use Authorization Code Flow and request “openid profile”. Request “offline_access” only if persistent delegated access is genuinely required.',
        'Generate a cryptographically random state for each attempt, bind it to the initiating browser session, validate it, and consume it exactly once.',
        'Always use PKCE S256, including for confidential clients. Generate a fresh secure verifier for each attempt.',
        'Use a nonce when the selected OIDC library supports or requires one.',
        'Keep state, nonce, and verifier server-side or in Secure, HttpOnly, SameSite=Lax, short-lived cookies. Never store them or provider tokens in localStorage.',
        'Use the exact registered redirect URI. Do not use wildcards or derive security-critical URLs from untrusted Host, forwarded headers, or query parameters.',
        'Let the OIDC library validate issuer, signature, audience, expiry, nonce, and authorization errors. Read endpoint URLs from discovery.',
        'Use “sub” as the stable local account key; it is the canonical Minecraft UUID. Treat “preferred_username” as a changeable display name and “picture” as the avatar. Preserve “acr” and “amr” if useful to policy.',
        "Rotate the local session identifier after login and retain the application's cookie and CSRF protections.",
        'Prevent open redirects by allowing only local or explicitly configured return destinations.',
        'End the local session on logout and use the discovered “end_session_endpoint” when supported. Never accept arbitrary post-logout destinations.',
        'Never log or expose client secrets, authorization codes, access or refresh tokens, state, nonce, PKCE verifiers, cookies, or complete callback URLs.',
        'Return useful but non-sensitive callback errors and fail closed when configuration is missing.',
      ],
      implement:
        'Implement the login action, callback, create-or-find user by “sub”, display-data update, local authenticated session, current-user access, logout, configuration validation, environment documentation, and accessible “Sign in with Minecraft” UI.',
      tests:
        'Add tests for successful login, provider denial, invalid or missing state, replayed state, and missing configuration. Include a test proving the username is not used as the persistent identity key.',
      finish:
        "After editing, run the project's formatter, type checker, linter, and tests. Report changed files, environment variables, the exact callback URI to register in CraftLogin, commands run, and remaining manual setup. Do not claim completion if checks fail.",
      stackSupplements: {
        generic:
          'Choose the maintained OIDC client recommended by the existing framework. Explain the choice before adding a dependency.',
        nextjs:
          "Determine the installed Next.js and Auth.js versions and whether App Router or Pages Router is used. Follow those exact APIs. Configure a generic OIDC provider through discovery and use Auth.js's built-in state and PKCE checks. Keep provider configuration server-only, preserve existing adapters and callbacks, and expose only the minimum identity fields to Client Components.",
        node: 'Detect the existing Node.js framework, module system, session middleware, and package manager. Prefer its established OIDC adapter or a maintained standards-focused client such as openid-client. Keep token operations server-side, integrate with the existing error and proxy configuration, and do not add a second web framework or session store.',
        php: 'Detect Laravel, Symfony, or the existing PHP framework and reuse its authentication, session, configuration, CSRF, and test conventions. Choose a maintained OIDC-capable package with discovery, state, PKCE S256, and ID-token validation; a generic OAuth profile response alone is not validated OIDC identity. Regenerate the PHP session ID after login.',
        python:
          'Detect Django, Flask, FastAPI, or the existing Python framework and reuse its authentication, session, CSRF, and test conventions. Prefer a maintained OIDC integration or Authlib-based framework client. Do not decode a JWT as a substitute for validation, and do not block an async server with synchronous HTTP calls.',
        spa: 'This must be a public client with no client secret. Prefer an existing backend-for-frontend and server-managed session if this repository has a server component. If it is genuinely browser-only, use a maintained browser OIDC client and keep tokens in memory rather than localStorage or other long-lived script-readable storage. Explain the residual XSS and token-exposure risk.',
      },
    },
    title: 'AI integration prompt',
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
          description: 'Render a flat front view of the full player from its current signed skin.',
          summary: 'Render a Minecraft body',
        },
        avatarBust: {
          description: 'Render a flat front view of the head, torso, and arms.',
          summary: 'Render a Minecraft bust',
        },
        avatarCape: {
          description: "Return the account's current cape texture, if the player wears one.",
          summary: 'Get a Minecraft cape',
        },
        avatarElytra: {
          description: 'Return the elytra wing texture, which matches the worn cape texture.',
          summary: 'Get a Minecraft elytra texture',
        },
        avatarFace: {
          description:
            'Render the front eight-by-eight face with its transparent Minecraft head overlay.',
          summary: 'Render a Minecraft face',
        },
        avatarHead: {
          description: 'Render a flat front-facing head from its current signed skin.',
          summary: 'Render a Minecraft head',
        },
        avatarProcessedSkin: {
          description:
            'Return the normalized 64x64 skin: legacy layouts converted, base layers opaque, fully-opaque overlays cleared.',
          summary: 'Get a normalized Minecraft skin',
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
        microsoftOAuthCallback: {
          description:
            'Complete one-shot Microsoft, Xbox Live, and Minecraft Services verification without persisting Microsoft-side tokens or account data.',
          summary: 'Complete Microsoft verification',
        },
        microsoftOAuthStart: {
          description:
            'Begin one-shot Microsoft OAuth verification with S256 PKCE and only the XboxLive.signin scope.',
          summary: 'Start Microsoft verification',
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
      microsoftSignInRejected: 'Microsoft sign-in could not continue. Start again and retry.',
      microsoftSignInUnavailable:
        'Microsoft account verification is temporarily unavailable. Try again shortly.',
      microsoftStateInvalid: 'This Microsoft sign-in attempt expired or is invalid. Start again.',
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
      approveAction: 'Approve',
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
      noNote: 'No note was provided.',
      notFoundNotice: 'That developer account was not found.',
      rejectAction: 'Reject',
      removeAction: 'Remove',
      requestedLabel: 'Requested',
      revokeAction: 'Remove verification',
      roleLabel: 'Access level',
      saveRoleAction: 'Save role',
      summary: 'Administration',
      unverifyAction: 'Remove verification',
      uuidLabel: 'Minecraft UUID',
      verificationDeveloperNotice: 'Developer verification updated.',
      verificationHeading: 'Verification requests',
      verificationIntro:
        'Approve, reject, or withdraw a verification. Verification is a trust label only: it never grants access and it does not change an application’s redirect URIs or credentials.',
      verificationApprovedNotice: 'Application verified.',
      verificationEmpty: 'No applications are waiting for review.',
      verificationRejectedNotice: 'Verification request rejected.',
      verificationRequestedNotice: 'Verification requested. An administrator will review it.',
      verificationRevokedNotice: 'Application verification removed.',
      verificationUnavailableNotice:
        'That decision no longer applies. Reload and check the current verification status.',
      verifyAction: 'Verify',
    },
    app: {
      avatarLabel: 'Avatar',
      clientIdLabel: 'Client ID',
      requestAction: 'Request verification',
      requestCancel: 'Cancel',
      requestHeading: 'Request application verification?',
      requestIntro:
        'Verification is a manual review by a CraftLogin administrator. It shows a verified label wherever users review your application. It never grants extra access or changes your redirect URIs.',
      requestNoteHint:
        'Tell the reviewer what the application does and where it is published. Up to 500 characters.',
      requestNoteLabel: 'Note for the reviewer (optional)',
      requestTitle: 'Request verification',
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
      namePlaceholder: 'Example app',
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
      verificationColumnLabel: 'Verification',
      verifiedDeveloperBadge: 'Verified developer',
      docsLink: 'API docs',
      heading: 'Developer Console',
      lead: 'Register OAuth clients and manage exact redirect URIs tied to your Minecraft UUID.',
      logout: 'Sign out',
      signedInAs: 'Signed in as',
      uuidLabel: 'Signed in UUID',
    },
    footer: 'Developer access is restricted to administrator-approved Minecraft UUIDs.',
    navigation: {
      ariaLabel: 'Developer navigation',
      brand: 'CraftLogin',
      console: 'Developer Console',
      home: 'Project home',
    },
    verification: {
      badgePending: 'Review pending',
      badgeVerified: 'Verified',
      notVerified: 'Not verified',
    },
    cli: {
      adminGranted: 'Administrator access granted to',
      invalidUuid: 'Provide one Minecraft name or canonical UUID.',
      usage: 'Usage: npm run admin:grant -- <minecraft-name-or-uuid>',
    },
  },
  landing: {
    affiliation:
      'NOT AN OFFICIAL MINECRAFT SERVICE. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.',
    claims: {
      claimHeading: 'Claim',
      detailHeading: 'Detail',
      heading: 'What your app receives',
      rows: [
        {
          claim: 'sub',
          detail: 'A permanent player ID. It stays the same even if they rename.',
          value: '123e4567-e89b-42d3-a456-426614174000',
        },
        {
          claim: 'preferred_username',
          detail: 'The name they play under right now.',
          value: 'Player',
        },
        {
          claim: 'picture',
          detail: 'Their current face at `/avatar/{uuid}`, ready to show on your site.',
          value: '/avatar/123e4567-e89b-42d3-a456-426614174000',
        },
      ],
      scopes: [
        { detail: 'Permission to sign the player in.', name: 'openid' },
        { detail: 'Permission to show their name and face.', name: 'profile' },
      ],
      scopesHeading: 'Permissions',
      valueHeading: 'Example',
      text: 'Three simple facts on every login. The ID never changes, so roles and purchases stay attached to the right player.',
    },
    avatars: {
      heading: 'Free avatars included',
      text: 'Every login can also show the player\u2019s face, rendered live from their actual current skin. Use them in comments, member lists, or leaderboards. No keys, no extra calls, ready to hotlink.',
      bust: 'Bust',
      body: 'Body',
      face: 'Face',
      head: 'Head',
      exampleAlt: 'Example Minecraft avatar render',
    },
    endpoints: {
      heading: 'Endpoints',
      items: [
        { detail: 'Where the login starts.', path: '/oauth2/authorize' },
        { detail: 'Where your server swaps the one-time code for tokens.', path: '/oauth2/token' },
        { detail: 'Where you read who just logged in.', path: '/oauth2/userinfo' },
        { detail: 'Where your backend double-checks a token.', path: '/oauth2/introspect' },
        { detail: 'Where the player signs out of CraftLogin.', path: '/oauth2/logout' },
        { detail: 'The public keys your backend uses to trust our tokens.', path: '/oauth2/jwks' },
        { detail: 'Where a token gets cancelled.', path: '/oauth2/revoke' },
      ],
    },
    flow: {
      claimLabel: 'Your site receives',
      claimValue: '{ sub: "minecraft-uuid", preferred_username: "Player" }',
      exampleAddress: 'K7MPQ4RX.craftlogin.com',
      exampleLabel: 'The player connects to',
      heading: 'From click to known player in seconds',
      items: [
        {
          detail:
            'Add a login button that sends the player to CraftLogin. No passwords or forms on your side.',
          title: 'You send the player our way',
        },
        {
          detail:
            'They join a one-time server address, verify with their skin, or sign in with Microsoft. It takes seconds, works once, and expires after five minutes.',
          title: 'They prove it in Minecraft',
        },
        {
          detail:
            'Your site gets back their permanent player ID and current username. Now you reliably know who they are.',
          title: 'You know exactly who they are',
        },
      ],
    },
    useCases: {
      heading: 'Made for community sites',
      items: [
        {
          detail:
            'Give members forum or game roles tied to a real Minecraft account, not a nickname anyone can claim.',
          title: 'Hand out roles',
        },
        {
          detail:
            'Deliver ranks and perks to the right player automatically after checkout. No manual whitelisting.',
          title: 'Sell VIP',
        },
        {
          detail:
            'Let players comment and build a profile with their name and face, without yet another password.',
          title: 'Comments and profiles',
        },
      ],
    },
    footer: {
      license: 'MIT licensed',
    },
    hero: {
      codeLabel: 'It starts with one redirect',
      consoleAction: 'Set up login',
      documentationAction: 'Read the API docs',
      githubAction: 'View source',
      heading: 'Log in with Minecraft',
      lead: 'Add a \u201cSign in with Minecraft\u201d button to your website. Players prove they own their Java Edition account in seconds, with no passwords and no emails, and you reliably know who they are.',
      request:
        'GET /oauth2/authorize\n  ?response_type=code\n  &client_id=cl_your_client\n  &redirect_uri=https%3A%2F%2Fexample.com%2Fcallback\n  &scope=openid%20profile\n  &state=<random>\n  &code_challenge=<S256>\n  &code_challenge_method=S256',
    },
    navigation: {
      ariaLabel: 'Primary navigation',
      brand: 'CraftLogin',
      developers: 'Console',
      documentation: 'Docs',
      integration: 'Implement with AI',
      github: 'GitHub',
    },
    quickstart: {
      exchangeCode:
        'POST /oauth2/token\n  grant_type=authorization_code\n  &code=<code>\n  &redirect_uri=https%3A%2F%2Fexample.com%2Fcallback\n  &client_id=cl_your_client\n  &code_verifier=<verifier>',
      exchangeHeading: 'Then trade the code for tokens',
      heading: 'Up and running in minutes',
      text: 'Create a client in the Console to get your client ID. Send the player to the login page, then swap the one-time code you get back for their identity.',
    },
    security: {
      heading: 'Safe by design',
      text: 'There are no CraftLogin passwords to steal. Players never type a password on our pages, and we store no emails. Logins are short-lived and single-use, return addresses must match exactly, and everything is open source, so anyone can check our work.',
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
    forwardAction: 'Continue',
    forwardHeading: 'Continuing…',
    forwardHint: 'If you are not redirected automatically, continue manually.',
    forwardTitle: 'Continuing',
    expiredHeading: 'This sign-in request expired',
    goBack: 'Go back',
    heading: 'Sign in to',
    scopeIdentity: 'Your Minecraft identity (stable UUID)',
    scopeOffline: 'Stay signed in between visits',
    scopeProfile: 'Your current username and avatar',
    interactionRequired: 'Minecraft account verification is required',
    lead: 'Confirm your Minecraft account below to continue.',
    methodHeading: 'Choose how to verify',
    methods: {
      microsoft: {
        detail: 'Confirm ownership through Microsoft without opening Minecraft.',
        label: 'Sign in with Microsoft',
      },
      online: {
        detail: 'Join a short-lived server address in Minecraft Java Edition.',
        label: 'Join Minecraft server',
      },
      skin: {
        detail: 'Change your skin briefly, then change it back when verification finishes.',
        label: 'Verify with a skin',
      },
    },
    signedInAs: 'Signed in as',
    consentLead: 'Review what this application is requesting.',
    noJavaScript:
      'Automatic status checks need JavaScript. You can still connect in Minecraft, then use the continue button.',
    ownerBy: 'by',
    ownerLabel: 'Application publisher',
    securityNote:
      'Verify through Minecraft online mode, a fresh Mojang-signed skin, or one-shot Microsoft sign-in. CraftLogin never receives your Microsoft password or stores Microsoft tokens.',
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
    verifiedAppBadge: 'Verified by CraftLogin',
    microsoft: {
      continueButton: 'Continue',
      editionLabel: 'Ownership',
      expiredHeading: 'This sign-in attempt expired',
      expiredTitle: 'Sign-in attempt expired',
      heading: 'Or sign in with Microsoft',
      hint: 'Use Microsoft, Xbox Live, and Minecraft Services to confirm Java Edition ownership without opening the game. CraftLogin stores none of the Microsoft-side tokens or account data.',
      javaEdition: 'Java Edition owner',
      otherMethodButton: 'Use another method',
      ownershipHeading: 'Java Edition ownership not found',
      ownershipLead:
        'This Microsoft account did not provide a qualifying Minecraft Java Edition entitlement.',
      ownershipTitle: 'Java Edition required',
      privacyNote:
        'Microsoft, Xbox Live, XSTS, and Minecraft access tokens were used only for this verification request and were not stored.',
      homeButton: 'Back to CraftLogin start',
      rejectedHeading: 'Microsoft sign-in could not continue',
      rejectedTitle: 'Microsoft sign-in failed',
      retryButton: 'Try Microsoft sign-in again',
      startButton: 'Sign in with Microsoft',
      successHeading: 'Minecraft account verified',
      successLead: 'Microsoft sign-in confirmed this Minecraft Java Edition profile.',
      successTitle: 'Minecraft account verified',
      unavailableHeading: 'Microsoft verification is unavailable right now',
      unavailableTitle: 'Verification unavailable',
      usernameLabel: 'Minecraft username',
    },
    skin: {
      accountLabel: 'Minecraft Java username',
      accountPlaceholder: 'Player',
      changeSkinButton: 'Open Minecraft skin settings',
      changeSkinUrl: 'https://www.minecraft.net/en-us/msaprofile/mygames/editskin',
      downloadButton: 'Download verification skin',
      formatLegacy: 'legacy 64×32',
      formatModern: 'modern 64×64',
      formatLabel: 'Skin format',
      heading: 'Or verify by changing your skin',
      headingAlternative: 'Verify by changing your skin',
      lookupFound: 'Account found. Checking its current skin…',
      lookupNotFound: 'No Minecraft account was found with that username.',
      lookupSkin: 'Account found. A current skin is available.',
      lookupUnavailable: 'Minecraft lookup is temporarily unavailable. Try again shortly.',
      modelClassic: 'classic / wide arms',
      modelSlim: 'slim arms',
      modelLabel: 'Arm model',
      originalDownloadButton: 'Download current skin backup',
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
    success: 'Verification complete.\nYou can return to your browser.',
    unavailable:
      'This verification code is invalid or has expired.\nReturn to your browser and try again.',
    temporaryFailure:
      'Verification is temporarily unavailable.\nReturn to your browser and try again.',
    shutdown: 'CraftLogin is restarting.\nReturn to your browser and try again.',
    lobbyWelcome: 'Start sign-in in your browser, then type your verification code here in chat.',
    lobbyTitle: 'ᴄʀᴀꜰᴛʟᴏɢɪɴ',
    lobbySubtitle: 'Start sign-in in your browser',
    lobbyCountdownLabel: 'You will be kicked in ',
    lobbyHint: 'Type the code from your browser here in chat, or use /verify <code>.',
    lobbyInvalidCode: 'That code did not work. Check the code in your browser and try again.',
    lobbyTimeout: 'You have been disconnected from the CraftLogin lobby.\nReconnect to continue.',
    lobbyFull: 'The CraftLogin lobby is at capacity.\nPlease try again shortly.',
    listVersion: 'CraftLogin',
    listHover: ['Sign in with Minecraft', 'No passwords, no emails'],
    unsupportedVersion:
      'This Minecraft version is not supported yet.\nPlease connect with version 26.1 or older to verify, then you can switch back.',
  },
};
