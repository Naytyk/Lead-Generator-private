const BACKEND_URL = 'https://email-monitoringbackend.vercel.app';

// Fallback recipe — used ONLY if the backend is unreachable, so a run never dies
// on a network blip. Source of truth is GET /api/extension/lead-params.
const DEFAULT_LEAD_PARAMS = {
  email_status: ['validated'],
  fetch_count: 100,
  file_name: 'Dynamic Lead Export',
  seniority_level: ['c_suite', 'founder', 'owner', 'director', 'vp', 'head'],
  contact_location: ['india']
};

async function fetchLeadParams() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/extension/lead-params`);
    if (!res.ok) throw new Error('bad status');
    return await res.json();
  } catch {
    return DEFAULT_LEAD_PARAMS;
  }
}

const $ = (id) => document.getElementById(id);

function renderLogin(errorMsg) {
  $('loginView').style.display = 'flex';
  $('mainView').style.display = 'none';
  $('loginError').textContent = errorMsg || '';
}

function renderMain(auth) {
  $('loginView').style.display = 'none';
  $('mainView').style.display = 'flex';
  $('whoami').textContent = `${auth.name || auth.email} (${auth.userId})`;
  $('gateMsg').textContent = '';
}

// Read-only activation check (does not count as a "use").
async function isStillActive(userId) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/script/status/${userId}`);
    const data = await res.json();
    return !!data.isActive;
  } catch { return true; } // network blip → don't lock out; dispatch re-checks anyway
}

document.addEventListener('DOMContentLoaded', async () => {
  const { shareAuth } = await chrome.storage.local.get('shareAuth');
  if (shareAuth && shareAuth.token) {
    if (await isStillActive(shareAuth.userId)) {
      renderMain(shareAuth);
    } else {
      await chrome.storage.local.remove('shareAuth');
      renderLogin('Your account was deactivated. Contact the admin.');
    }
  } else {
    renderLogin();
  }
});

// ----- LOGIN -----
$('loginBtn').addEventListener('click', async () => {
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  if (!email || !password) return ($('loginError').textContent = 'Enter email and password.');

  $('loginError').textContent = 'Logging in...';
  try {
    const res = await fetch(`${BACKEND_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      // 403 => inactive, 401 => bad credentials
      return ($('loginError').textContent = data.error || 'Login failed.');
    }
    const auth = { token: data.token, userId: data.user.id, name: data.user.name, email: data.user.email };
    await chrome.storage.local.set({ shareAuth: auth });
    renderMain(auth);
  } catch {
    $('loginError').textContent = 'Network error connecting to backend.';
  }
});

// ----- LOGOUT -----
$('logoutBtn').addEventListener('click', async (e) => {
  e.preventDefault();
  await chrome.storage.local.remove('shareAuth');
  $('loginEmail').value = '';
  $('loginPassword').value = '';
  renderLogin();
});

// ----- EXTRACTION (unchanged logic, only reachable when logged in) -----
$('configBtn').addEventListener('click', async () => {
  const rawInput = $('domainInput').value;
  const domains = rawInput.split('\n').map(d => d.trim()).filter(d => d !== '');
  if (domains.length === 0) { $('gateMsg').textContent = 'Paste at least one domain.'; return; }

  // Pull the targeting recipe from the backend (falls back to a bundled default),
  // then add the user's domains at runtime.
  $('gateMsg').textContent = 'Preparing run…';
  const recipe = await fetchLeadParams();
  const dynamicLeadParam = { ...recipe, company_domain: domains };

  // autoExtract: tells content.js to poll the run, then auto-dispatch the leads.
  // The run happens in a hidden off-screen window; results/success open on-screen.
  chrome.storage.local.set({ activeLeadParams: dynamicLeadParam, autoExtract: true }, () => {
    chrome.runtime.sendMessage({ type: 'START_OFFSCREEN_RUN' });
    $('gateMsg').textContent = 'Running in the background — results will open automatically.';
  });
});

$('extractBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'OPEN_RESULTS_TAB' });
});
