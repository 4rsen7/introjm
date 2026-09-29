const { defineConfig, devices } = require('@playwright/test');
const port = Number(process.env.RESEARCH_UI_PORT || 5174);

module.exports = defineConfig({
    testDir: './research/tests',
    timeout: 30_000,
    workers: 1,
    reporter: 'list',
    use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        command: `npm run dev --workspace=research -- --host 127.0.0.1 --port ${port} --strictPort`,
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: false,
        env: {
            VITE_SUPABASE_URL: 'http://127.0.0.1:5399',
            VITE_SUPABASE_ANON_KEY: 'research-local-test-public-key',
            VITE_API_BASE_URL: '/api',
        },
    },
});
