const BACKEND_URL = 'https://email-monitoringbackend.vercel.app';

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
$('configBtn').addEventListener('click', () => {
  const rawInput = $('domainInput').value;
  const domains = rawInput.split('\n').map(d => d.trim()).filter(d => d !== '');
  if (domains.length === 0) { $('gateMsg').textContent = 'Paste at least one domain.'; return; }

  const dynamicLeadParam = {
    company_domain: domains,
    email_status: ['validated'],
    fetch_count: 100,
    file_name: 'Dynamic Lead Export',
    seniority_level: ['c_suite', 'founder', 'owner', 'director', 'vp', 'head'],
    contact_location: ['india']
  };

  chrome.storage.local.set({ activeLeadParams: dynamicLeadParam }, () => {
    chrome.tabs.create({ url: 'https://console.apify.com/actors/IoSHqwTR9YGhzccez/input' });
  });
});

$('extractBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'OPEN_RESULTS_TAB' });
});
