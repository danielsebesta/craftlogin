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
      createdLabel: 'Added',
      developerRole: 'Developer',
      empty: 'No developer accounts have been registered yet.',
      heading: 'Access registry',
      intro:
        'Grant console access by canonical Minecraft UUID. Role changes take effect on the next request.',
      lastAdminNotice: 'The final administrator cannot be demoted or removed.',
      removeAction: 'Remove',
      roleLabel: 'Access level',
      saveRoleAction: 'Save role',
      title: 'Administration',
      uuidLabel: 'Minecraft UUID',
      adminRole: 'Administrator',
      sectionLabel: '03 / Administration',
      uuidPlaceholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    },
    app: {
      confidentialHelp: 'For server-side applications that can protect a secret.',
      confidentialLabel: 'Confidential client',
      createAction: 'Create application',
      createdHeading: 'Application created.',
      createdIntro: 'Copy these credentials now and store secrets outside source control.',
      createdTitle: 'New OAuth application',
      deleteAction: 'Delete application',
      empty: 'No OAuth applications are assigned to this account.',
      heading: 'OAuth applications',
      nameLabel: 'Application name',
      namePlaceholder: 'Community map',
      newHeading: 'Register an application',
      ownerLabel: 'Owner UUID',
      publicHelp: 'For browser, desktop, mobile, or other clients that cannot keep a secret.',
      publicLabel: 'Public client',
      redirectHelp: 'One exact URI per line. HTTPS is required except on localhost.',
      redirectLabel: 'Redirect URIs',
      secretLabel: 'Client secret · shown once',
      typeLabel: 'Client type',
      clientIdLabel: 'Client ID',
      clientsSectionLabel: '02 / Clients',
      redirectPlaceholder: 'https://example.com/oauth/callback',
      registerSectionLabel: '01 / Register',
      unassignedOwner: 'Unassigned',
    },
    dashboard: {
      adminBadge: 'Administrator',
      developerBadge: 'Developer',
      eyebrow: 'Developer operations',
      heading: 'Build with Minecraft identity.',
      intro:
        'Register OAuth clients, inspect exact redirect URIs, and keep ownership tied to a verified Minecraft UUID.',
      logout: 'Sign out',
      uuidLabel: 'Signed in UUID',
    },
    footer:
      'Developer access is verified by Minecraft online mode. No Microsoft password is collected.',
    login: {
      addressPending: 'Preparing secure address…',
      eyebrow: 'Restricted developer console',
      heading: 'Identify yourself in-game.',
      intro: 'Only pre-registered Minecraft UUIDs can enter the developer console.',
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
    example: {
      address: 'K7MPQ4RX.craftlogin.com',
      addressLabel: 'Temporary Minecraft address',
      ariaLabel: 'Example CraftLogin identity exchange',
      claimLabel: 'OIDC profile',
      claimValue: '{ sub: "minecraft-uuid", preferred_username: "Player" }',
    },
    footer: {
      license: 'MIT licensed',
    },
    hero: {
      documentationAction: 'Read the API docs',
      eyebrow: 'Open-source Minecraft identity provider',
      githubAction: 'View on GitHub',
      heading: 'Sign in with Minecraft.',
      lead: 'CraftLogin verifies a Minecraft Java account through an online-mode server and returns the player identity using standard OAuth 2.0 and OpenID Connect.',
    },
    navigation: {
      ariaLabel: 'Primary navigation',
      brand: 'CraftLogin',
      documentation: 'Documentation',
      github: 'GitHub',
      developers: 'Developer Console',
    },
    protocol: 'OAuth 2.0 / OpenID Connect',
    steps: {
      heading: 'How it works',
      items: [
        {
          detail:
            'Your application redirects the user to CraftLogin with a normal OAuth authorization request and S256 PKCE.',
          title: 'Start OAuth',
        },
        {
          detail:
            'CraftLogin shows a short-lived server address. The player joins it using Minecraft Java Edition.',
          title: 'Join Minecraft',
        },
        {
          detail:
            'Minecraft online mode authenticates the account. Your application receives the UUID and current username.',
          title: 'Receive identity',
        },
      ],
    },
    summary: {
      heading: 'Small identity surface',
      text: 'CraftLogin stores no email address or password—only the Minecraft UUID, username, and verification timestamps.',
    },
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
