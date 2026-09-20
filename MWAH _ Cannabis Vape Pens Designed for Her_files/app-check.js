/* =========================================================================
   app-check.js — Firebase App Check (reCAPTCHA v3) initialization for
   the homepage signup form.

   What it does:
   - Initializes a Firebase web app pointed at the gimmemwah-consumer project
     (the project that owns signupWrite and the `signups` Firestore — App
     Check tokens must be issued by the same project that validates them).
   - Wires App Check to a reCAPTCHA v3 site key registered in the Firebase
     console (App Check → Apps → reCAPTCHA provider).
   - Exposes MW.getAppCheckToken() — an async function that mints (or returns
     a cached) App Check token. The signup-form handler awaits this and sends
     the token in the X-Firebase-AppCheck header. signupWrite verifies it.

   Why this is loaded as an ES module (vs the rest of /assets/js/):
   - Firebase v10+ ships a modular SDK distributed as ES modules from
     www.gstatic.com. There is no UMD bundle anymore. Loading via
     `type="module"` keeps us aligned with the SDK's intended consumption
     pattern AND lets us avoid pulling 200KB+ of unused Firebase code into
     the legacy `var`-style bundle. The export surface (MW.getAppCheckToken)
     is set on window.MW so the existing non-module form handler can call it.

   Public values, safe to ship in client code:
   - apiKey: client identifier, NOT a secret (Firebase-by-design — auth /
     security is enforced by rules + App Check, not by hiding the apiKey).
   - reCAPTCHA SITE key: also public-by-design. The SECRET key lives only in
     the Firebase console attached to the App Check provider config.

   Failure mode:
   - If reCAPTCHA fails to load (network, ad-blocker), getAppCheckToken()
     returns null. The form handler still makes the request so the server
     owns the security decision, but signupWrite now rejects missing/invalid
     tokens with 401 and the client shows a refresh-and-retry message.
   ========================================================================= */
var firebaseConfig = {
  apiKey: "AIzaSyC_OEOs7vnPS3WRh5QEDkQCIoofOMLp4bQ",
  authDomain: "gimmemwah-consumer.firebaseapp.com",
  projectId: "gimmemwah-consumer",
  storageBucket: "gimmemwah-consumer.firebasestorage.app",
  messagingSenderId: "1066438627218",
  appId: "1:1066438627218:web:9add102fc622fec38b3b4b",
};

// Site key for reCAPTCHA v3 — registered against the gimmemwah-consumer GCP
// project (matching the Firebase project that validates App Check tokens).
// Allowed domains on the key: gimmemwah.com, gimmemwah-website.web.app,
// localhost. If you add a new host (e.g. a custom preview domain), update
// the key's allowed-domains list in the reCAPTCHA admin console.
var RECAPTCHA_SITE_KEY = "6LfaNsosAAAAAI0C5Bag6Fv8nr26QbQitxATk_-J";

var appCheckPromise = null;

// Load Firebase + reCAPTCHA only after the visitor shows intent to use a
// protected form. This keeps the third-party cookie, ~400 KB reCAPTCHA bundle,
// and token refresh work off the age gate and ordinary browsing path.
function prepareAppCheck() {
  if (appCheckPromise) return appCheckPromise;
  appCheckPromise = Promise.all([
    import("https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-check.js"),
  ]).then(function (modules) {
    var firebaseApp = modules[0].initializeApp(firebaseConfig);
    return modules[1].initializeAppCheck(firebaseApp, {
      provider: new modules[1].ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  }).catch(function (err) {
    console.warn("App Check init failed", err);
    return null;
  });
  return appCheckPromise;
}

window.MW = window.MW || {};
window.MW.prepareAppCheck = prepareAppCheck;
window.MW.getAppCheckToken = async function () {
  var appCheck = await prepareAppCheck();
  if (!appCheck) return null;
  try {
    var appCheckModule = await import("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-check.js");
    var result = await appCheckModule.getToken(appCheck, /* forceRefresh */ false);
    return result && result.token ? result.token : null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("App Check getToken failed", err);
    return null;
  }
};
