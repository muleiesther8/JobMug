```markdown
# JobMug Client (React + Vite)

Quick start:

1. From repository root:
   cd client
   npm install
   npm run dev

2. Start dev server:
   npm run dev

3. Dev server runs at http://localhost:5173 and proxies /api to http://localhost:3000 (see vite.config.js).

Notes:
- The client uses localStorage to persist authentication in a key `jobmug_auth` with shape { token, user }.
- Protected actions require a recruiter/seeker user with a valid JWT returned from your backend (register/login endpoints).
- If you prefer the client to talk to a different API host, set VITE_API_BASE_URL in a .env file (e.g., VITE_API_BASE_URL=http://api.example.com).
```
