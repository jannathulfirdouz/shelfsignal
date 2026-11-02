// Who did something is shown as a role, never as an email address: several pages
// are open to demo visitors, and no visitor should ever see a user's email.
const ROLE_LABELS = {
  owner: "Owner",
  analyst: "Analyst",
  store_manager: "Store manager",
  viewer: "Viewer",
};

export function roleLabel(role) {
  return ROLE_LABELS[role] || "Viewer";
}

// Maps stored user emails (a forecast run's created_by, a recommendation's
// decided_by) to their role label with one service-role read of the users behind
// them. The emails themselves never leave the server.
export async function roleLabelsForEmails(b, emails) {
  const out = new Map();
  const wanted = [...new Set((emails || []).filter(Boolean))];
  if (!wanted.length) return out;
  let users = [];
  try {
    users = await b.asServiceRole.entities.User.list("-created_date", 200);
  } catch {
    users = [];
  }
  for (const u of users) {
    if (!u?.email) continue;
    out.set(u.email, roleLabel(u.app_role || u.data?.app_role));
  }
  return out;
}