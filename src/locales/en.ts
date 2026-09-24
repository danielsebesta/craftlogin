export const english = {
  authorizationError: {
    codeLabel: 'Protocol error',
    footer: 'No account information was shared.',
    heading: 'This sign-in request cannot continue.',
    message: 'Return to the app that sent you here and start sign-in again.',
    title: 'Sign-in request failed',
  },
  common: {
    legalDisclaimer: [
      'NOT AN OFFICIAL MINECRAFT SERVICE.',
      'NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.',
    ],
    legalLinks: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
    legalLinksLabel: 'Legal',
    operator: 'Operated independently by Daniel Šebesta. Contact: contact@craftlogin.com.',
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
        appIcon: {
          description:
            'Return the application icon as a 64x64 PNG. Icons are uploaded by the client owner in the Developer Console and are used on the sign-in screen.',
          summary: 'Get an application icon',
        },
        appList: { summary: 'List manageable OAuth clients' },
        avatarBack: {
          description:
            'Render a flat back view of the full player, including the worn cape when the account has one.',
          summary: 'Render a Minecraft back view',
        },
        avatarBody: {
          description: 'Render a flat front view of the full player from its current signed skin.',
          summary: 'Render a Minecraft body',
        },
        avatarBust: {
          description: 'Render a flat front view of the head, torso, and arms.',
          summary: 'Render a Minecraft bust',
        },
        avatarCape: {
          description:
            "Return the account's current cape texture from Mojang or modloaders (OptiFine, LabyMod, MinecraftCapes, 5zig, SkinMC).",
          summary: 'Get a Minecraft cape',
        },
        avatarCapes: {
          description:
            'List available capes across supported providers (Mojang, OptiFine, LabyMod, MinecraftCapes, 5zig, SkinMC).',
          summary: 'List available Minecraft capes',
        },
        avatarDuo: {
          description:
            'Render the flat front and back views of the full player side by side in one image, including the worn cape when the account has one.',
          summary: 'Render a Minecraft front and back pair',
        },
        avatarElytra: {
          description:
            'Return the elytra wing texture, matching the worn cape texture across supported providers.',
          summary: 'Get a Minecraft elytra texture',
        },
        avatarFace: {
          description:
            'Render the front eight-by-eight face with its transparent Minecraft head overlay.',
          summary: 'Render a Minecraft face',
        },
        avatarProcessedSkin: {
          description:
            'Return the normalized 64x64 skin: legacy layouts converted, base layers opaque, fully-opaque overlays cleared.',
          summary: 'Get a normalized Minecraft skin',
        },
        avatarSide: {
          description: 'Render a flat left-side profile of the full player.',
          summary: 'Render a Minecraft side profile',
        },
        avatarWings: {
          description:
            'Render a flat back view of the full player with deployed elytra wings, drawn from the wing region of the worn cape texture.',
          summary: 'Render Minecraft elytra wings',
        },
        avatarSkin: {
          description: 'Return the current signed skin for a Minecraft player or texture hash.',
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
            'Resolve a Minecraft Java username or UUID. Unknown usernames return an offline-mode UUID with a deterministic default skin; that synthetic profile is never a verified identity.',
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
        logout: {
          description: 'End the CraftLogin provider session using RP-initiated logout.',
          summary: 'End the provider session',
        },
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
        offlineAccess: 'Maintain delegated access with refresh-token rotation.',
        openid: 'Authenticate the Minecraft account.',
        profile: 'Read the current Minecraft username and avatar.',
      },
      tags: {
        applications:
          'Manage OAuth clients as an authenticated developer and fetch public application icons.',
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
  docs: {
    title: 'CraftLogin developer documentation',
    description: 'Integrate Minecraft Java Edition sign-in with standard OpenID Connect.',
    tableOfContents: {
      heading: 'On this page',
      items: [
        { href: '#quickstart', label: 'Quickstart' },
        { href: '#flow', label: 'Authorization flow' },
        { href: '#claims', label: 'Scopes and claims' },
        { href: '#sessions', label: 'Tokens and logout' },
        { href: '#api', label: 'API reference' },
        { href: '#avatars', label: 'Avatars' },
        { href: '#security', label: 'Security checklist' },
      ],
    },
    quickstart: {
      heading: 'Quickstart',
      intro:
        'Register the exact callback URI in the Developer Console, then configure your OIDC library with discovery. Both public and confidential clients must use Authorization Code Flow with PKCE S256.',
      steps: [
        {
          title: 'Register the client',
          detail:
            'Choose a public client for browser, desktop, mobile, or distributed software. Choose confidential only when a trusted server can protect the client secret.',
        },
        {
          title: 'Configure discovery',
          detail:
            'Use the issuer URL below. Your library discovers the authorization, token, UserInfo, JWKS, revocation, introspection, and logout endpoints automatically.',
        },
        {
          title: 'Map the account',
          detail:
            'Persist the sub (UUID) claim as the account key. The Minecraft UUID remains stable when the player changes username.',
        },
      ],
      configurationHeading: 'Suggested configuration',
      configurationCode:
        'CRAFTLOGIN_ISSUER=https://craftlogin.com\nCRAFTLOGIN_CLIENT_ID=cl_replace_me\nCRAFTLOGIN_CLIENT_SECRET=\nCRAFTLOGIN_REDIRECT_URI=https://example.com/auth/craftlogin/callback\nCRAFTLOGIN_POST_LOGOUT_REDIRECT_URI=https://example.com/',
      libraryNotice:
        'Do not implement OAuth, token exchange, or ID token validation yourself. Use a maintained OpenID Connect library for your framework.',
    },
    flow: {
      heading: 'Authorization Code Flow',
      intro:
        'Create a fresh state value, PKCE verifier, and S256 challenge for every attempt. Bind them to the initiating browser and consume them once in the callback.',
      authorizeHeading: '1. Redirect to authorization',
      authorizeCode:
        'GET https://craftlogin.com/oauth2/authorize\n  ?response_type=code\n  &client_id=cl_replace_me\n  &redirect_uri=https%3A%2F%2Fexample.com%2Fauth%2Fcraftlogin%2Fcallback\n  &scope=openid%20profile\n  &state=<random-value>\n  &code_challenge=<s256-challenge>\n  &code_challenge_method=S256',
      callbackHeading: '2. Validate the callback',
      callbackText:
        'Require the returned state to match the browser-bound, short-lived transaction. Reject missing, changed, expired, or replayed state before exchanging the code.',
      tokenHeading: '3. Exchange the code',
      tokenCode:
        'POST /oauth2/token\nContent-Type: application/x-www-form-urlencoded\n\ngrant_type=authorization_code\n&client_id=cl_replace_me\n&code=<one-time-code>\n&redirect_uri=https%3A%2F%2Fexample.com%2Fauth%2Fcraftlogin%2Fcallback\n&code_verifier=<original-verifier>',
      confidentialNote:
        'Confidential clients authenticate at the token endpoint with client_secret_basic. Never put a client secret in browser code, mobile software, logs, or source control.',
    },
    claims: {
      heading: 'Scopes and claims',
      intro:
        'Request only the permissions the application needs. The openid scope is required for sign-in.',
      scopeHeading: 'Scope',
      purposeHeading: 'Purpose',
      scopes: [
        { name: 'openid', detail: 'Authenticate the Minecraft identity and receive an ID token.' },
        { name: 'profile', detail: 'Receive the current username and avatar URL.' },
        {
          name: 'offline_access',
          detail: 'Receive a refresh token for justified persistent access.',
        },
      ],
      claimHeading: 'Claim',
      valueHeading: 'Meaning',
      claims: [
        {
          name: 'sub (UUID)',
          detail: 'Permanent canonical Minecraft UUID. Use it as the account key.',
        },
        { name: 'preferred_username', detail: 'Current Minecraft username. It can change.' },
        { name: 'picture', detail: 'Current CraftLogin avatar URL.' },
        { name: 'acr', detail: 'Authentication context used to verify the account.' },
        { name: 'amr', detail: 'Authentication method used for this sign-in.' },
      ],
      exampleHeading: 'UserInfo example',
      exampleCode:
        '{\n  "sub": "4a11ca60-63b6-451f-82eb-50119d8e5052",\n  "preferred_username": "Dastcz",\n  "picture": "https://craftlogin.com/avatar/4a11ca60-63b6-451f-82eb-50119d8e5052"\n}',
    },
    sessions: {
      heading: 'Tokens and logout',
      intro:
        'Treat authorization codes, access tokens, refresh tokens, PKCE verifiers, and session cookies as credentials. Keep them out of URLs, browser storage, logs, errors, and analytics.',
      items: [
        {
          title: 'Access tokens',
          detail:
            'Send the token as Authorization: Bearer to UserInfo or /api/users/@me. Validate tokens through your OIDC library or the introspection endpoint.',
        },
        {
          title: 'Refresh tokens',
          detail:
            'Request offline_access only when needed. Store refresh tokens on a trusted server and replace the stored value after every successful rotation.',
        },
        {
          title: 'Logout',
          detail:
            "Always destroy the application's local session. For provider logout, use the end_session_endpoint returned by discovery and only a registered post-logout URI.",
        },
      ],
    },
    api: {
      heading: 'Integration API',
      intro:
        'These are the public endpoints an integrating application may need. Prefer discovery over hardcoding OAuth endpoint URLs.',
      methodHeading: 'Method',
      endpointHeading: 'Endpoint',
      purposeHeading: 'Purpose',
      groups: [
        {
          heading: 'OpenID Connect',
          endpoints: [
            {
              method: 'GET',
              path: '/.well-known/openid-configuration',
              detail: 'Discover provider metadata and capabilities.',
            },
            { method: 'GET', path: '/oauth2/authorize', detail: 'Start Authorization Code Flow.' },
            {
              method: 'POST',
              path: '/oauth2/token',
              detail: 'Exchange a code or rotate a refresh token.',
            },
            {
              method: 'GET / POST',
              path: '/oauth2/userinfo',
              detail: 'Read standard claims for the signed-in player.',
            },
            { method: 'GET', path: '/oauth2/jwks', detail: 'Read public ID-token signing keys.' },
            {
              method: 'POST',
              path: '/oauth2/introspect',
              detail: 'Inspect a token issued to the authenticated client.',
            },
            {
              method: 'POST',
              path: '/oauth2/revoke',
              detail: 'Revoke an access or refresh token.',
            },
            {
              method: 'GET / POST',
              path: '/oauth2/logout',
              detail: 'End the CraftLogin provider session.',
            },
          ],
        },
        {
          heading: 'Identity',
          endpoints: [
            {
              method: 'GET',
              path: '/api/users/@me',
              detail: 'Read the UUID and username represented by an access token.',
            },
            {
              method: 'GET',
              path: '/api/users/{identifier}',
              detail: 'Resolve a public Minecraft username or UUID.',
            },
          ],
        },
      ],
      openApiText:
        'Machine-readable request and response schemas are available in the public OpenAPI 3.1 document.',
      openApiAction: 'Open openapi.yaml',
    },
    avatars: {
      heading: 'Avatar and texture API',
      intro:
        'Avatar endpoints are public, CORS-enabled, and suitable for images in profiles, member lists, and leaderboards. Identify a player by Minecraft UUID (dashed or compact), username, or a Mojang texture hash. Prefer UUIDs; username lookups are slower and rate-limited by Mojang. Offline-mode UUIDs and players without a Mojang texture receive a deterministic default skin.',
      template: '/api/avatars/{identifier}/{view}?size=128&layers=all',
      parameters: [
        {
          name: 'view',
          detail: 'face, bust, body, back, side, duo, wings, skin, processed-skin, cape, or elytra',
        },
        { name: 'size', detail: '32, 64, 128, or 256 for rendered views' },
        { name: 'layers', detail: 'all or base for rendered views' },
        { name: 'model', detail: 'classic or slim, texture-hash renders only' },
        {
          name: 'provider',
          detail:
            'mojang, optifine, labymod, minecraftcapes, 5zig, skinmc, or any; the cape source for back, duo, wings, cape, and elytra (defaults to any)',
        },
      ],
      exampleAlt: 'Example Minecraft avatar rendered by CraftLogin',
      showcaseCaption: 'Showcase skin by {player}.',
    },
    security: {
      heading: 'Integration checklist',
      intro: 'Before shipping, verify each property in code and automated tests.',
      items: [
        'Use discovery and a maintained OIDC library.',
        'Require Authorization Code Flow, state, and PKCE S256.',
        'Bind state, nonce, and the PKCE verifier to one short-lived browser transaction.',
        'Accept only exact, preconfigured callback and post-logout URIs.',
        'Validate issuer, signature, audience, expiry, nonce, and protocol errors.',
        'Use sub (UUID), not username, as the permanent account key.',
        'Rotate the local session after login and invalidate it during logout.',
        'Keep secrets, codes, tokens, and callback URLs out of logs and browser storage.',
      ],
    },
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
      identifierPlaceholder: 'Dastcz or 4a11ca60-63b6-451f-82eb-50119d8e5052',
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
        "Approve, reject, or withdraw a verification. Verification is a trust label only: it never grants access and it does not change an application's redirect URIs or credentials.",
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
      iconCurrentLabel: 'Current icon',
      iconDeleteAction: 'Remove icon',
      iconErrors: {
        invalidImage: 'That PNG could not be read. Export it again and retry.',
        missingFile: 'Choose a PNG file to upload.',
        notPng: 'The icon must be a PNG file.',
        tooLargeBytes: 'The icon file is too large. Keep it under 16 KB.',
        tooLargeDimensions: 'The icon must be at most 64x64 pixels.',
      },
      iconFileLabel: 'PNG file, up to 64x64 pixels',
      iconHeading: 'Application icon',
      iconHint:
        'Use the same 64x64 PNG as your Minecraft server icon. Smaller images are centered at their original size, never stretched, and the background stays transparent.',
      iconIntro: 'The icon appears next to your application name on the sign-in screen.',
      iconLinkLabel: 'Icon',
      iconNone: 'No icon uploaded yet.',
      iconRemovedNotice: 'Application icon removed.',
      iconSavedNotice: 'Application icon updated.',
      iconTitle: 'Application icon',
      iconUploadAction: 'Upload icon',
      nameLabel: 'Application name',
      namePlaceholder: 'Example app',
      newHeading: 'New application',
      ownerLabel: 'Owner',
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
    aiPrompt: {
      copied: 'Copied',
      copy: 'Copy prompt',
      heading: 'Let your agent do it',
      preview: 'Show the prompt',
      prompt:
        'Implement "Sign in with CraftLogin" in this project.\n\nFirst inspect the existing framework, routing, authentication, session, environment, and test conventions. Then read https://craftlogin.com/llms-full.txt and treat it as the integration contract.\n\nAsk me only for the client ID, whether the client is public or confidential, and the exact redirect and post-logout URIs if they are not already configured. Never ask me to paste a client secret; use the server-side CRAFTLOGIN_CLIENT_SECRET environment variable when a confidential client requires one.\n\nUse a maintained OpenID Connect library and discovery from https://craftlogin.com/.well-known/openid-configuration. Implement the login action, callback, stable account mapping by sub (the Minecraft UUID), local session, logout, configuration validation, accessible UI, documentation, and tests while preserving the project\'s existing architecture. Do not implement OAuth or token validation manually.\n\nBefore editing, summarize the plan. After editing, run the project\'s formatter, type checker, linter, and tests, then report changed files, required environment variables, the exact URI to register in CraftLogin, and any remaining manual steps. Do not claim completion while checks fail.',
      text: 'Paste a ready-made prompt into Claude Code, Codex, Cursor, or Copilot and let it wire up the standard flow for you.',
    },
    claims: {
      heading: 'What your app receives',
      rows: [
        {
          claim: 'sub',
          detail: 'Their Minecraft UUID. It stays the same even if they rename.',
        },
        {
          claim: 'preferred_username',
          detail: 'The name they play under right now.',
        },
        {
          claim: 'picture',
          detail: 'A live render of their skin, ready to show on your site.',
        },
      ],
      scopes: [
        { detail: 'Sign the player in.', name: 'openid' },
        { detail: 'Show their name and face.', name: 'profile' },
      ],
      scopesHeading: 'Permissions',
      text: 'Three simple facts on every login. The UUID never changes, so roles and purchases stay attached to the right player.',
      verifiedLabel: 'Verified Minecraft account',
    },
    avatars: {
      heading: 'Free avatars included',
      text: "Every login can also show the player's face, rendered live from their actual current skin. Use them in comments, member lists, or leaderboards. No keys, no extra calls, ready to hotlink.",
      back: 'Back',
      bust: 'Bust',
      body: 'Body',
      duo: 'Front + back',
      face: 'Face',
      processedSkin: 'Processed skin',
      side: 'Side',
      wings: 'Elytra wings',
      cape: 'Cape / Elytra',
      exampleAlt: 'Example Minecraft avatar render',
      showcaseCaption: 'Showcase skin by {player}.',
      lookupAction: 'Render',
      lookupEmpty: 'No avatar could be rendered for that name.',
      lookupLabel: 'Try any player name or UUID',
    },
    flow: {
      heading: 'From click to known player in seconds',
      items: [
        {
          detail:
            'Add a login button that sends the player to CraftLogin. No passwords or forms on your side.',
          title: 'You send the player our way',
        },
        {
          detail:
            'They join a one-time server address, verify with their skin, or sign in with Microsoft. It takes seconds and works once.',
          title: 'They prove it in Minecraft',
        },
        {
          detail:
            'Your site gets back their Minecraft UUID and current username. Now you reliably know who they are.',
          title: 'You know exactly who they are',
        },
      ],
    },
    getStarted: {
      console: {
        action: 'Open the Console',
        detail: 'Create a client in the Developer Console and get your client ID.',
        title: 'Create a client',
      },
      docs: {
        action: 'Read the docs',
        detail: 'Every endpoint and claim, with copy-paste examples for each step.',
        title: 'Follow the guide',
      },
      heading: 'Get started',
      intro: 'Create a client, follow the guide, or hand the whole wiring to your coding agent.',
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
      consoleAction: 'Set up login',
      documentationAction: 'Read the API docs',
      githubAction: 'View source',
      heading: 'Let your users log in with Minecraft',
      lead: 'No one wants to register for another server forum. Let them log in with the game they already have open. Zero emails to collect, zero passwords to hash. Open-source, secure, and built for Minecraft.',
    },
    navigation: {
      ariaLabel: 'Primary navigation',
      brand: 'CraftLogin',
      developers: 'Console',
      documentation: 'Docs',
      github: 'GitHub',
    },
    security: {
      heading: 'Safe by design',
      text: 'There are no CraftLogin passwords to steal. Players never type a password on our pages, and we store no emails. Logins are short-lived and single-use, return addresses must match exactly, and everything is open source, so anyone can check our work.',
    },
  },
  legal: {
    lastUpdated: 'Last updated: September 24, 2026',
    privacy: {
      description:
        'What CraftLogin stores, what it never stores, and how to have your data removed.',
      intro:
        'This page describes the data CraftLogin handles when you sign in, what it deliberately never stores, and how to have it removed.',
      sections: [
        {
          heading: 'Who operates CraftLogin',
          paragraphs: [
            'CraftLogin is an independent, open-source OpenID Connect provider for Minecraft: Java Edition identities. The data controller is Daniel Šebesta, reachable at contact@craftlogin.com. CraftLogin is not affiliated with, approved by, or associated with Mojang or Microsoft.',
          ],
        },
        {
          heading: 'Data CraftLogin stores',
          items: [
            'Your Minecraft UUID, your current Minecraft username, and the time of your first and last verification.',
            'If you use the Developer Console: your allowlisted Minecraft UUID, your role, and the OAuth clients you create.',
            'For every registered application: its client ID, display name, exact redirect URIs, owner, and manual verification labels.',
            'Refresh tokens only as one-way hashes, together with the client ID, your Minecraft UUID, and an expiry time.',
            'Short-lived verification records in Redis, which expire after about five minutes.',
          ],
          paragraphs: [
            'Confidential client secrets are hashed with Argon2 before they are stored. CraftLogin cannot recover the original secret from that hash.',
          ],
        },
        {
          heading: 'Data CraftLogin never stores',
          items: [
            'Your email address, your password, or any other account credential.',
            'Microsoft access or refresh tokens, Xbox Live tokens, XSTS tokens, Minecraft access tokens, Xbox user hashes, or Microsoft account identifiers. These exist only in memory while a single verification request is processed.',
            'Verification codes, authorization codes, access tokens, raw refresh tokens, or client secrets in application logs.',
          ],
        },
        {
          heading: 'Cookies and sessions',
          paragraphs: [
            'CraftLogin sets signed cookies that are HttpOnly, Secure, and SameSite=Lax. The sign-in flow uses a short-lived interaction cookie and a five-minute Microsoft PKCE transaction cookie. The Developer Console uses an opaque server-side session with sliding expiry and an absolute lifetime.',
            'CraftLogin runs no analytics, no advertising, and no third-party tracking scripts.',
          ],
        },
        {
          heading: 'Logs and security signals',
          paragraphs: [
            'The service writes structured operational logs without verification codes, tokens, secrets, or cookie values. IP address and user agent are recorded only as session anomaly signals, and an IP change alone never invalidates a session.',
          ],
        },
        {
          heading: 'Retention',
          paragraphs: [
            'Verification records disappear automatically after about five minutes. Refresh tokens stop working when they expire, when you sign out, or when the application you signed in to revokes them.',
            'Your account record is kept while you use CraftLogin. You can ask for it to be deleted at any time.',
          ],
        },
        {
          heading: 'Your rights',
          paragraphs: [
            'You can request access to, correction of, or deletion of the personal data CraftLogin holds about you, and you can object to its processing. Write to contact@craftlogin.com and include your Minecraft username or UUID.',
          ],
        },
        {
          heading: 'Changes to this policy',
          paragraphs: [
            'Material changes appear on this page with a new date. Continued use after a change means you accept the updated policy.',
          ],
        },
      ],
      title: 'Privacy policy',
    },
    terms: {
      description: 'Terms of service and acceptable use for the CraftLogin OIDC provider.',
      intro:
        'These terms cover the use of CraftLogin as a player and as an integrating application. CraftLogin is not affiliated with, approved by, or associated with Mojang or Microsoft.',
      sections: [
        {
          heading: 'The service',
          paragraphs: [
            'CraftLogin verifies that you control a Minecraft: Java Edition account and returns the resulting Minecraft UUID and current username to applications you approve. Verification confirms account control only. It does not transfer any Mojang or Microsoft rights, and it is not a license, entitlement, or ownership check beyond what it reports.',
          ],
        },
        {
          heading: 'What you must not do',
          items: [
            'Impersonate Mojang or Microsoft, or imply that CraftLogin is approved or endorsed by them.',
            'Bypass authentication, license, or entitlement checks with CraftLogin.',
            'Phish users, distribute malware, or run gambling or other unlawful, deceptive, harmful, or abusive services.',
            'Use CraftLogin to mislead people about who controls a Minecraft account.',
          ],
        },
        {
          heading: 'Integrating applications',
          items: [
            'Keep confidential client secrets on your server. Never ship a client secret in browser, mobile, or desktop code.',
            'Register exact redirect URIs. Wildcards are not accepted.',
            'Publish your own privacy notice and disclosures. You are responsible for how your application uses the identity data it receives.',
            'Follow the Minecraft EULA and the Minecraft Usage Guidelines.',
          ],
        },
        {
          heading: 'Availability and changes',
          paragraphs: [
            'CraftLogin is under active development and provided on an as-is and as-available basis, without warranties of any kind. Features, limits, and endpoints may change or be discontinued.',
          ],
        },
        {
          heading: 'Suspension',
          paragraphs: [
            'We may suspend or revoke developer access or client credentials that violate these terms or put the service or its users at risk.',
          ],
        },
        {
          heading: 'Liability',
          paragraphs: [
            'To the maximum extent permitted by law, CraftLogin and its operator are not liable for indirect, incidental, or consequential damages arising from the use of the service. Nothing in these terms limits liability that cannot be limited by law. The CraftLogin source code is licensed under the MIT License and is provided without warranty.',
          ],
        },
        {
          heading: 'Governing law',
          paragraphs: ['These terms are governed by the laws of the Czech Republic.'],
        },
        {
          heading: 'Changes to these terms',
          paragraphs: [
            'Material changes appear on this page with a new date. Continued use after a change means you accept the updated terms.',
          ],
        },
        {
          heading: 'Contact',
          paragraphs: ['Questions about these terms: contact@craftlogin.com.'],
        },
      ],
      title: 'Terms of service',
    },
  },
  interaction: {
    addressLabel: 'Minecraft server address',
    allowsHeading: 'This app will receive:',
    disallowedHeading: 'This app will never receive:',
    disallowed: [
      'Your Microsoft or Minecraft password',
      'Your email address or billing details',
      'What servers you play on or multiplayer activity',
    ],
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
    scopeIdentity: 'Your Minecraft identity (username, skin, cape, UUID)',
    scopeIdentityCombined: 'Your Minecraft identity (username, skin, cape, UUID)',
    scopeOffline: 'Stay signed in between visits',
    scopeProfile: 'Your current username, skin, and cape',
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
