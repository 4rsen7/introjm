function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function hasWorkspaceSwitchConfig() {
  return Boolean(
    process.env.E2E_MEMBER_EMAIL &&
    process.env.E2E_MEMBER_PASSWORD &&
    process.env.E2E_MEMBER_SHARED_WORKSPACE &&
    process.env.E2E_MEMBER_PERSONAL_WORKSPACE &&
    process.env.E2E_SHARED_INTERVIEW_TITLE
  );
}

module.exports = {
  requiredEnv,
  hasWorkspaceSwitchConfig,
};
