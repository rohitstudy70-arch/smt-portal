# SMT Portal - Production Deployment Checklist

## 📋 Pre-Deployment Verification

### Backend (Render)

- [x] MongoDB Atlas cluster created
- [x] MongoDB connection string added to backend `.env`
- [x] CORS configured with frontend URL
- [x] JWT_SECRET set in environment
- [x] Backend deployed and running: https://smt-portal.onrender.com

### Frontend (Vercel)

- [ ] VITE_API_URL environment variable set in Vercel
- [ ] Value: `https://smt-portal.onrender.com/api`
- [ ] .env.example created with documentation
- [ ] api.js configured with debug logging
- [ ] No hardcoded URLs in codebase
- [ ] Build passes locally: `npm run build`

### Environment Files

- [x] .gitignore excludes node_modules, .env, etc.
- [x] .env.example created for reference
- [x] Backend .env configured with all required variables
- [x] No sensitive data in git

---

## 🚀 Deployment Steps

### Step 1: Verify Backend is Live

```bash
curl https://smt-portal.onrender.com/api/health
# Expected response: {"status":"OK","timestamp":"..."}
```

### Step 2: Set Frontend Environment Variable on Vercel

1. Go to: https://vercel.com
2. Select project: `smt-portal`
3. Settings → Environment Variables
4. Add new variable:
   - Name: `VITE_API_URL`
   - Value: `https://smt-portal.onrender.com/api`
   - Environments: Production, Preview, Development
5. Click "Add"

### Step 3: Redeploy Frontend with Clear Cache

1. Go to Deployments tab
2. Select latest deployment
3. Click "Redeploy"
4. Check "Clear Build Cache"
5. Click "Redeploy" again
6. Wait 2-3 minutes for build to complete

### Step 4: Verify Frontend is Live

1. Open: https://smt-portal-teal.vercel.app
2. Open browser console (F12)
3. Look for: `🔗 API Configuration: { env: 'production', final_api_base_url: 'https://smt-portal.onrender.com/api', ... }`
4. Try logging in with:
   - Username: `admin`
   - Password: `admin123`

### Step 5: Monitor API Calls

1. Open browser DevTools (F12)
2. Go to Network tab
3. Try any action in the app
4. Verify requests go to `https://smt-portal.onrender.com/api/...`
5. Check console for: `📤 API Request: GET /api/auth/me`

---

## ⚙️ Backend Configuration Reference

### MongoDB Atlas

- Cluster: cluster0.egh9cim.mongodb.net
- Database: smt_portal
- IP Whitelist: 0.0.0.0/0 (all IPs allowed - for testing only)

### Environment Variables (on Render)

```
MONGO_URI=mongodb+srv://rohitstudy70_db_user:UkTQ7NsQChvV6b2q@cluster0.egh9cim.mongodb.net/?appName=Cluster0
JWT_SECRET=smt_portal_secret_key_2024
PORT=5000
FRONTEND_URL=https://smt-portal-teal.vercel.app
```

### CORS Configuration

Allowed origins:

- `http://localhost:3000` (local dev)
- `http://localhost:5173` (Vite dev)
- `https://smt-portal-teal.vercel.app` (production)
- Any value in `process.env.FRONTEND_URL`

---

## 🧪 Testing Scenarios

### Test 1: Login Flow

1. Visit frontend URL
2. Login as admin/admin123
3. Check Network tab for `/api/auth/login` request
4. Verify response contains token
5. Token should be stored in localStorage

### Test 2: API Call (Dashboard)

1. After login, navigate to Dashboard
2. Check Network tab for `/api/dashboard` requests
3. Verify requests include `Authorization: Bearer <token>`
4. Check response contains dashboard data

### Test 3: JWT Expiry

1. Clear localStorage token manually
2. Try accessing protected route
3. Should automatically redirect to /login
4. Check console for: `⚠️ Unauthorized (401)`

---

## 🔧 Troubleshooting

### Issue: "API Connection Failed"

**Solution:**

1. Check browser console (F12) for API URL being used
2. Verify VITE_API_URL is set in Vercel
3. Verify backend is running: `curl https://smt-portal.onrender.com/api/health`
4. Check Network tab for CORS errors

### Issue: "CORS Error"

**Solution:**

1. Verify `FRONTEND_URL` is set on Render backend
2. Update CORS allowed origins in backend/server.js
3. Redeploy backend: Render dashboard → Manual Deploy
4. Wait 1-2 minutes for redeploy to complete

### Issue: "401 Unauthorized"

**Solution:**

1. Clear localStorage: `localStorage.clear()` in console
2. Login again
3. Check Network tab for login response token
4. Verify Authorization header is sent: `Authorization: Bearer <token>`

### Issue: "Build fails on Vercel"

**Solution:**

1. Check build logs in Vercel dashboard
2. Verify `build` script in package.json: `"build": "node node_modules/vite/bin/vite.js build"`
3. Ensure vite.config.js exists and is valid
4. Clear build cache and redeploy

---

## 📊 Production URLs

| Service     | URL                                             | Status       |
| ----------- | ----------------------------------------------- | ------------ |
| Backend API | https://smt-portal.onrender.com                 | ✅ Live      |
| Frontend    | https://smt-portal-teal.vercel.app              | ✅ Live      |
| MongoDB     | MongoDB Atlas (Private)                         | ✅ Connected |
| GitHub      | https://github.com/rohitstudy70-arch/smt-portal | ✅ Synced    |

---

## 🔐 Security Notes

**Development:**

- API logs all requests in console
- Debug information visible in browser console

**Production:**

- Remove sensitive logging before final release
- Change JWT_SECRET to a secure random value
- Restrict MongoDB IP whitelist to specific IPs
- Use HTTPS everywhere (Vercel/Render handle this)
- Implement rate limiting on backend
- Add request validation and sanitization

---

## 📝 Documentation Files

- **api.js**: Frontend API configuration with Vite env variables
- **.env.example**: Environment variable reference
- **vite.config.js**: Vite build configuration for Vercel
- **vercel.json**: Vercel-specific settings
- **server.js**: Backend Express + CORS configuration

---

## ✅ Final Checklist Before Launch

- [ ] Backend health check passes
- [ ] Frontend environment variable set on Vercel
- [ ] Frontend redeploy completed successfully
- [ ] Admin login works end-to-end
- [ ] API calls visible in Network tab
- [ ] Console shows correct API URL
- [ ] No CORS errors in console
- [ ] No hardcoded URLs in frontend code
- [ ] GitHub repo has all latest commits
- [ ] .env files are gitignored (not in repo)
- [ ] Render backend monitoring is enabled
- [ ] Vercel analytics are enabled

---

Last Updated: 2026-06-13
