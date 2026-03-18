# Solar Blessing — Full-Stack Astro Website

Holistic health e-commerce/content site with React + Tailwind frontend, SSR admin portal, and AWS REST API backend.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Astro 4 (SSR) + React + Tailwind CSS |
| Auth | JWT (HS256 via `jose`) + bcrypt passwords |
| Security | CSRF tokens, XSS sanitization, rate limiting, CSP headers |
| Backend | AWS Lambda (Node.js) + API Gateway |
| Database | AWS DynamoDB (single-table design) |

---

## Project Structure

```
src/
├── components/
│   ├── Nav.astro          — Single sticky navigation
│   ├── ReviewForm.tsx     — Validated review submission form
│   └── StarRating.tsx     — Interactive/readonly star widget
├── layouts/
│   ├── BaseLayout.astro   — Shell with nav + footer
│   └── ProductLayout.astro — Reusable product page template
├── lib/
│   ├── security.ts        — Sanitization, JWT, CSRF, rate limit, headers
│   ├── adminAuth.ts       — Reusable admin route guard
│   ├── api.ts             — Typed API client (frontend → AWS)
│   └── lambda-handler.ts  — AWS Lambda function (deploy to AWS)
├── pages/
│   ├── index.astro        — Home
│   ├── about.astro        — About
│   ├── kombucha.astro     — Kombucha product page
│   ├── sobolo.astro       — Sobolo product page
│   ├── salve.astro        — Hand Salve product page
│   ├── updates.astro      — Blog posts, events, testimonials
│   ├── admin/
│   │   ├── index.astro    — Login page (/admin)
│   │   └── dashboard.astro — Admin dashboard (/admin/dashboard)
│   └── api/
│       ├── reviews.ts     — POST /api/reviews (public)
│       └── admin/
│           ├── login.ts   — POST /api/admin/login
│           ├── logout.ts  — POST /api/admin/logout
│           ├── stats.ts   — GET  /api/admin/stats
│           ├── reviews/   — GET + PATCH/DELETE
│           ├── posts/     — GET + POST + PATCH/DELETE
│           └── events/    — GET + POST + PATCH/DELETE
└── styles/
    └── global.css         — Tailwind layers + component classes
```

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```

Fill in these critical values in `.env`:

**Generate JWT secret:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Hash your admin password (cost 12):**
```bash
node -e "require('bcryptjs').hash('YourPassword123!', 12).then(console.log)"
```

### 3. Run dev server
```bash
npm run dev
# → http://localhost:4321
# → Admin: http://localhost:4321/admin
```

---

## Admin Portal

- **URL:** `/admin` (not linked anywhere on the public site)
- **Robots:** `noindex, nofollow` — won't appear in search engines
- Login with the username/password set in `.env`
- Dashboard tabs: **Reviews** | **Blog Posts** | **Events**

### Review moderation flow
1. Customer submits review → saved as `status: pending`
2. Admin sees it in **Reviews → Pending** tab
3. Admin clicks **Approve** → goes live on product page
4. Admin clicks **Reject** or **Delete** → never shown publicly

### Creating blog posts & events
- Use the form at the bottom of the **Blog Posts** or **Events** tab
- Admin-created content is auto-approved (goes live immediately)

---

## AWS Setup

### DynamoDB Table
Create a table named `SolarBlessingContent` with:
- **Partition key:** `PK` (String)
- **Sort key:** `SK` (String)
- **GSI:** `status-createdAt-index` with PK=`entityType`, SK=`statusCreatedAt`

### Lambda
1. Copy `src/lib/lambda-handler.ts` to your Lambda project
2. Compile to JS: `tsc lambda-handler.ts`
3. Set environment variables: `AWS_REGION`, `DYNAMODB_TABLE`, `FRONTEND_ORIGIN`
4. Attach IAM role with DynamoDB access (least privilege — see below)

### IAM Policy (Lambda role)
```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:GetItem",
    "dynamodb:PutItem",
    "dynamodb:UpdateItem",
    "dynamodb:DeleteItem",
    "dynamodb:Query"
  ],
  "Resource": [
    "arn:aws:dynamodb:REGION:ACCOUNT:table/SolarBlessingContent",
    "arn:aws:dynamodb:REGION:ACCOUNT:table/SolarBlessingContent/index/*"
  ]
}
```

### API Gateway
- Create a **REST API** with proxy integration to your Lambda
- Enable **API key required** on all routes
- Add the key value to `API_KEY` in your `.env`
- Enable **CORS** with `Access-Control-Allow-Credentials: true`

### Secrets Management (production)
Store these in **AWS Secrets Manager** or **SSM Parameter Store**, not in `.env`:
- `JWT_SECRET`
- `ADMIN_PASSWORD_HASH`
- `API_KEY`

---

## Security Features

| Feature | Implementation |
|---|---|
| XSS prevention | `sanitizeText()` escapes all HTML entities on every input |
| SQL/NoSQL injection | Parameterized DynamoDB commands (no string interpolation) |
| CSRF protection | Double-submit cookie pattern with constant-time comparison |
| Auth | HttpOnly + Secure + SameSite=Strict JWT cookie |
| Rate limiting | 5 login attempts / 15 min, 10 reviews / hour per IP |
| Password storage | bcrypt with cost factor 12 |
| Security headers | CSP, X-Frame-Options, HSTS, X-Content-Type-Options |
| Admin route | Unlisted URL, noindex meta, redirects if unauthenticated |
| Timing attacks | Constant-time CSRF comparison; password always checked |

---

## Deployment

```bash
npm run build
# Deploy .output/ to your Node.js host (EC2, ECS, Fly.io, etc.)
# or use @astrojs/node adapter for a standalone server
```

For serverless deployment, add `@astrojs/vercel` or `@astrojs/netlify` adapter.
