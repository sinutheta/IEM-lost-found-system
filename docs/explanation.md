# IEM Lost & Found Management System
## Server Architecture, API Specification, Inter-Service Interactions & Edge-Case Analysis

**Institute of Engineering & Management (IEM), Kolkata**  
**Department of Computer Science & Engineering**  
*Course:* Software Engineering and Project Management (PCC-CS504)  
*Component:* Backend Server Service (`server/`)  
*Stack:* Node.js (v20+) · Express.js · MongoDB (Mongoose ODM) · Multimodal AI Vision Engine  

---

## 1. High-Level Architectural Overview of `server/`

The backend service is structured as a modular, stateless, RESTful application running on Node.js and Express.js, interfacing with a MongoDB document database via the Mongoose Object Data Modeling (ODM) library. It serves both the JSON API endpoints (`/api/*`) and static uploaded media files (`/uploads/*`).

```
server/
├── package.json          # Node dependencies, runtime scripts (start, dev, seed)
├── src/
│   ├── index.js          # Server bootstrap, Express setup, Mongo connection & migration hook
│   ├── models.js         # Mongoose schemas, compound indexes, TTL rules, and data validation
│   ├── middleware.js     # JWT Bearer token authentication & adminOnly authorization guards
│   ├── routes.js         # Complete REST routing table (Auth, Items, Matches, Claims, Admin)
│   ├── ai-vision.js      # Multimodal AI vision engine (Cloud API + Embedded Computer Vision)
│   ├── matching.js       # Heuristic & multimodal scoring, notifications, and global scan pipeline
│   ├── migrate.js        # Automated status lifecycle & history audit log database migrator
│   └── seed.js           # Deterministic database seeding for development & testing
└── uploads/              # Local disk storage for uploaded item images (created on boot)
```

### Module Responsibilities:

1. **`index.js` (Entrypoint & Lifecycle Controller):**
   - Loads environment variables (`require('dotenv').config()`).
   - Ensures the `/uploads` directory exists on disk synchronously (`fs.mkdirSync`).
   - Configures global Express middleware (`cors()`, `express.json()`, `express.static('/uploads')`).
   - Mounts the unified API router (`/api`).
   - Establishes the database connection to MongoDB (`mongoose.connect`).
   - Triggers the idempotent schema migrator (`migrate.js`) before opening the HTTP port (default `3000`).
2. **`models.js` (Domain Schemas & Data Constraints):**
   - Defines Mongoose models: `User`, `Item`, `Match`, `Claim`, `ClaimLock`, `Notification`.
   - Enforces field-level access control: sensitive fields (`passwordHash`, `verificationAnswerHash`) are configured with `select: false` so they are never returned in queries unless explicitly requested.
   - Implements performance and uniqueness compound indexes (e.g. `{ lost: 1, found: 1 }` on `Match`, `{ user: 1, item: 1 }` on `ClaimLock`).
   - Configures a MongoDB Time-To-Live (TTL) index on `ClaimLock.until` for automatic expiration of temporary lockouts.
3. **`middleware.js` (Security & Role-Based Access Control):**
   - `auth`: Extracts and verifies JSON Web Tokens (`jwt.verify`) from the `Authorization: Bearer <token>` header, injecting `req.user = { id, userType }` into the request lifecycle.
   - `adminOnly`: Rejects requests with HTTP 403 Forbidden if `req.user.userType !== 'admin'`.
4. **`routes.js` (API Gateway & Controllers):**
   - Implements all 25+ REST endpoints across 6 functional controllers.
   - Uses `multer` disk storage with MIME-type filtering and a 5 MB payload limit for photo uploads.
   - Wraps asynchronous handlers in a `wrap()` higher-order function to route unhandled Promise rejections to the Express global error middleware.
5. **`ai-vision.js` (Computer Vision & Multimodal Inspection Engine):**
   - Provides multimodal visual inspection supporting **Google Gemini 1.5 Flash**, **Anthropic Claude**, and **OpenAI GPT-4o-mini** via API keys.
   - Features an **Embedded Computer Vision & Feature Extractor** fallback that inspects image buffers, samples color histograms, detects dominant hues, extracts material/structural tags, and compares images without external API dependencies.
6. **`matching.js` (Matching Engine & Dispatcher):**
   - Computes deterministic heuristic scores ($0\text{--}100$) using token Jaccard overlap, category matching, and exponential date decay.
   - Orchestrates photo-to-photo and photo-to-text cross-modal AI comparisons.
   - Enforces the 70% threshold rule: when a match reaches $\ge 70\%$, it updates item statuses to `Matched` and dispatches in-app notifications.
7. **`migrate.js` (Idempotent Schema Migration):**
   - Runs on startup; scans the `items` collection to convert legacy statuses (`open`, `claim_pending`, `returned`, `cancelled`) to the canonical 6 statuses (`Reported`, `Matched`, `Pending Verification`, `Returned`, `Cancelled`, `Rejected`).
   - Backfills the `statusHistory` array for older records.
8. **`seed.js` (Development Test Harness):**
   - Purges all collections and inserts sample users (`Admin`, `Security Desk`, `Demo Student`) and test items with bcrypt-hashed passwords (`password123`) and verification challenges.

---

## 2. Exhaustive API Endpoint Reference: Request & Response Schemas

### 2.1 Authentication & Session Management (`/api/auth`)

#### 1. Register Account — `POST /api/auth/register`
* **Access:** Public (Unauthenticated)
* **Description:** Registers a new campus user. Enforces institutional email domain validation (`@iemcal.edu.in` or custom domain configured in `ALLOWED_EMAIL_DOMAIN`).
* **Request Body Schema (`application/json`):**
  ```json
  {
    "name": "string (required, min 1 char)",
    "email": "string (required, valid email ending in @iemcal.edu.in)",
    "password": "string (required, min 6 chars)",
    "department": "string (optional, defaults to 'Computer Science')",
    "userType": "string (optional: 'student' | 'faculty' | 'staff', defaults to 'student')"
  }
  ```
* **Success Response (`201 Created`):**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "6737bc44958f0cb18da63a01",
      "name": "Rohan Das",
      "email": "rohan.das@iemcal.edu.in",
      "userType": "student",
      "department": "Computer Science"
    }
  }
  ```
* **Error Responses:**
  - `400 Bad Request`: `{"message": "Name, email and a 6+ character password are required"}` or `{"message": "Please use your @iemcal.edu.in email"}`
  - `409 Conflict`: `{"message": "Email already registered"}`

#### 2. User Login — `POST /api/auth/login`
* **Access:** Public (Unauthenticated)
* **Description:** Authenticates credentials via bcrypt comparison against the hidden `passwordHash` field and issues a 7-day signed JWT.
* **Request Body Schema (`application/json`):**
  ```json
  {
    "email": "string (required)",
    "password": "string (required)"
  }
  ```
* **Success Response (`200 OK`):**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "6737bc44958f0cb18da63a01",
      "name": "Rohan Das",
      "email": "rohan.das@iemcal.edu.in",
      "userType": "student",
      "department": "Computer Science"
    }
  }
  ```
* **Error Response:**
  - `401 Unauthorized`: `{"message": "Invalid email or password"}`

#### 3. Current User Profile — `GET /api/auth/me`
* **Access:** Authenticated (`Authorization: Bearer <token>`)
* **Success Response (`200 OK`):**
  ```json
  {
    "id": "6737bc44958f0cb18da63a01",
    "name": "Rohan Das",
    "email": "rohan.das@iemcal.edu.in",
    "userType": "student",
    "department": "Computer Science"
  }
  ```
* **Error Response:**
  - `401 Unauthorized`: `{"message": "Please log in"}`

#### 4. Predefined Taxonomy — `GET /api/categories`
* **Access:** Public
* **Success Response (`200 OK`):**
  ```json
  [
    "Wallet", "ID Card", "Electronics", "Bottle", "Books & Stationery",
    "Keys", "Bag", "Clothing", "Other"
  ]
  ```

---

### 2.2 Item Reporting & Management (`/api/items`)

#### 5. List Items & Filter Feed — `GET /api/items`
* **Access:** Authenticated (`Bearer <token>`)
* **Query Parameters:**
  - `type` (`string`, optional): `'lost'` | `'found'`
  - `q` (`string`, optional): Case-insensitive keyword search regex against `name`, `location`, and `description`.
  - `mine` (`string`, optional): If `'1'` or `'true'`, filters items where `reporter == req.user.id` (returns all statuses). Otherwise, returns public active items (`Reported`, `Matched`, `open`).
  - `category` (`string`, optional): Specific category filter.
  - `location` (`string`, optional): Regex location filter.
  - `fromDate` (`string`, optional): ISO date string (`$gte`).
  - `toDate` (`string`, optional): ISO date string (`$lte` end of day).
* **Success Response (`200 OK`):**
  ```json
  [
    {
      "_id": "6737bd89958f0cb18da63a15",
      "type": "found",
      "name": "Blue Water Bottle",
      "category": "Bottle",
      "description": "Milton stainless steel bottle found in Canteen",
      "location": "College Canteen",
      "date": "2026-11-17T00:00:00.000Z",
      "photo": "/uploads/1731871234567.jpg",
      "status": "Reported",
      "reporter": {
        "_id": "6737bc44958f0cb18da63a01",
        "name": "Security Desk",
        "userType": "staff",
        "department": "Administration"
      },
      "aiVisualDescription": "AI Visual Analysis: Detected blue bottle object. Visual features: bottle, blue, stainless-steel, cylindrical.",
      "aiVisualTags": ["bottle", "blue", "stainless-steel", "cylindrical"],
      "createdAt": "2026-11-17T10:15:00.000Z"
    }
  ]
  ```

#### 6. Get Item Details — `GET /api/items/:id`
* **Access:** Authenticated (`Bearer <token>`)
* **Path Parameter:** `id` (MongoDB `ObjectId`)
* **Success Response (`200 OK`):**
  Returns complete item document, populated reporter info, `statusHistory` array, and an injected computed boolean `isOwner: true | false`.
  *(Note: `verificationAnswerHash` is strictly excluded via `select: false`).*

#### 7. Submit Item Report — `POST /api/items`
* **Access:** Authenticated (`Bearer <token>`)
* **Content-Type:** `multipart/form-data`
* **Form Fields:**
  - `type` (`string`, required): `'lost'` | `'found'`
  - `name` (`string`, required): Name of item.
  - `location` (`string`, required): Where lost or found.
  - `category` (`string`, optional): One of the 9 categories (defaults to `'Other'`).
  - `description` (`string`, optional): Free-form details.
  - `date` (`string`, optional): Date of incident (defaults to `Date.now()`).
  - `photo` (`file`, optional): Image file (JPEG/PNG/WEBP/GIF, max 5 MB).
  - *If `type === 'found'` (Mandatory Verification Challenge):*
    - `verificationQuestion` (`string`, required): Secret question only owner knows.
    - `verificationAnswer` (`string`, required): Plain-text answer (hashed via bcrypt before saving).
* **Processing Logic:**
  1. Validates inputs; hashes `verificationAnswer` with bcrypt (cost factor 8).
  2. Saves document with initial status `'Reported'` and appends to `statusHistory`.
  3. Returns `201 Created` immediately.
  4. Triggers `runMatching(item)` asynchronously in the background.

#### 8. Edit Active Report — `PUT /api/items/:id`
* **Access:** Authenticated (Original Reporter Only)
* **Condition:** Item must be in an active state (`Reported`, `Matched`, `open`).
* **Content-Type:** `multipart/form-data`
* **Form Fields:** `name`, `category`, `description`, `location`, `date`, `photo` (optional new file), `verificationQuestion`, `verificationAnswer` (re-hashed if updated).
* **Side Effects:** Logs change in `statusHistory`; re-runs matching in background.
* **Error Response:**
  - `403 Forbidden`: `{"message": "Only the original reporter can edit this item"}`
  - `400 Bad Request`: `{"message": "Only active/open reports can be edited"}`

#### 9. Cancel Report — `POST /api/items/:id/cancel`
* **Access:** Authenticated (Original Reporter Only)
* **Behavior:** Transitions status to `'Cancelled'`, logs audit entry, and automatically dismisses all pending matches (`Match.updateMany({ status: 'dismissed' })`).

#### 10. Re-trigger Matching — `POST /api/items/:id/rematch`
* **Access:** Authenticated (Original Reporter Only)
* **Behavior:** Re-executes heuristic and multimodal matching across active complementary items.

#### 11. Run AI Photo Inspection on Item — `POST /api/items/:id/ai-scan`
* **Access:** Authenticated
* **Behavior:** Re-reads the item's uploaded image buffer, executes visual feature extraction via `ai-vision.js`, updates `aiVisualDescription` and `aiVisualTags`, and triggers a fresh cross-matching cycle.
* **Success Response (`200 OK`):**
  ```json
  {
    "ok": true,
    "message": "AI photo analysis complete and matches updated.",
    "item": { ... },
    "matchesCount": 2
  }
  ```

#### 12. Delete Report Permanently (Admin) — `DELETE /api/items/:id`
* **Access:** Administrator Only (`adminOnly` guard)
* **Behavior:** Dismisses all associated matches, rejects linked pending claims, and permanently deletes the item record from the database.

#### 13. Moderate Inappropriate Report (Admin) — `POST /api/items/:id/moderate`
* **Access:** Administrator Only
* **Request Body:**
  ```json
  {
    "action": "remove",
    "reason": "Contains inappropriate campus content"
  }
  ```
* **Behavior:** Sets status to `'Cancelled'`, logs admin note in `statusHistory`, and dismisses suggested matches.

---

### 2.3 Matching Engine Endpoints (`/api/matches`)

#### 14. Get Matches for Item — `GET /api/items/:id/matches`
* **Access:** Authenticated (Item Reporter or Admin only)
* **Behavior:** Queries `matches` collection where item is either `lost` or `found` and `status` is `'suggested'` or `'claimed'`.
* **Success Response (`200 OK`):**
  ```json
  [
    {
      "_id": "6737be11958f0cb18da63a22",
      "score": 88,
      "method": "ai",
      "reason": "AI Photo-to-Photo Analysis: Both images feature matching blue stainless steel bottle...",
      "photos": 2,
      "visualSimilarity": 88,
      "status": "suggested",
      "side": "owner",
      "other": {
        "_id": "6737bd89958f0cb18da63a15",
        "name": "Blue Water Bottle",
        "type": "found",
        "location": "College Canteen",
        "photo": "/uploads/1731871234567.jpg"
      }
    }
  ]
  ```

#### 15. Create Manual Match Link — `POST /api/matches`
* **Access:** Authenticated (Must own one of the items or be Admin)
* **Request Body:**
  ```json
  {
    "lostId": "6737bd11958f0cb18da63a10",
    "foundId": "6737bd89958f0cb18da63a15",
    "score": 100
  }
  ```
* **Validation:** Both items must be active; cannot be reported by the same user; score must be integer $0\text{--}100$.
* **Side Effects:** Upserts `Match` with `method: 'manual'`; transitions both items to `'Matched'`; dispatches notifications to both reporters.

#### 16. Dismiss Match — `POST /api/matches/:id/dismiss`
* **Access:** Authenticated (Owner of either item or Admin)
* **Behavior:** Sets `match.status = 'dismissed'`.

---

### 2.4 Verification Challenges & Claims (`/api/items` & `/api/claims`)

#### 17. Fetch Verification Question — `GET /api/items/:id/question`
* **Access:** Authenticated
* **Behavior:** Checks if the claimant has an active lockout (`lockOf`). If locked, returns `423 Locked`. Otherwise, returns the plain-text `verificationQuestion`. The secret answer hash is strictly withheld.
* **Success Response (`200 OK`):**
  ```json
  { "question": "What sticker is on the bottle?" }
  ```
* **Lockout Response (`423 Locked`):**
  ```json
  {
    "message": "Too many wrong attempts. Try again later.",
    "until": "2026-11-18T02:22:49.000Z"
  }
  ```

#### 18. Submit Ownership Claim (Direct) — `POST /api/items/:id/claim`
* **Access:** Authenticated (Claimant cannot be the reporter of the found item)
* **Request Body:**
  ```json
  { "answer": "cat sticker" }
  ```
* **Processing Flow:**
  1. Checks active 30-minute lock in `ClaimLock`. If active $\to$ returns `423 Locked`.
  2. Compares normalized answer (`trim().toLowerCase()`) with stored bcrypt hash.
  3. **If Incorrect:**
     - Increments `failedAttempts`.
     - If `failedAttempts < 3`: Returns `403 Forbidden` with remaining attempts countdown.
     - If `failedAttempts >= 3`: Sets `until = now + 30 min`, resets counter, and returns `423 Locked`.
  4. **If Correct:**
     - Deletes `ClaimLock` record.
     - Atomically transitions found item (and linked lost report if exists) to `'Pending Verification'`.
     - Creates `Claim` document with `status: 'pending_review'`.
     - Alerts all campus administrators.

#### 19. Submit Claim From Match Suggestion — `POST /api/matches/:id/claim`
* **Access:** Authenticated (One of the two reporters)
* **Request Body:**
  ```json
  {
    "answer": "cat sticker",
    "note": "Can pick up from security office around 3 PM"
  }
  ```
* **Behavior:** If submitted by the owner (lost reporter), verifies answer against found item's challenge. If submitted by finder (hand-over offer), no answer required. Transitions items to `'Pending Verification'`, marks match `'claimed'`, and opens claim for admin review.

#### 20. List Pending Claims — `GET /api/claims`
* **Access:** Administrator Only
* **Query Parameter:** `status` (defaults to `'pending_review'`)
* **Success Response (`200 OK`):** Array of claims populated with item details, claimant profile, and linked lost report.

#### 21. Approve Claim Handover — `POST /api/claims/:id/approve`
* **Access:** Administrator Only
* **Behavior:**
  1. Sets `claim.status = 'approved'`, records `reviewedBy` and `reviewedAt`.
  2. Updates found item (and linked lost report) to `'Returned'`.
  3. Sets matched record to `'resolved'`.
  4. **Cascading Dismissal:** Dismisses all competing matches involving either item (`Match.updateMany({ status: 'dismissed' })`).
  5. Dispatches handover confirmation notifications to both parties.

#### 22. Reject Claim — `POST /api/claims/:id/reject`
* **Access:** Administrator Only
* **Behavior:** Sets `claim.status = 'rejected'`; returns item to active state or logs rejection in `statusHistory`; notifies claimant.

---

### 2.5 Admin Console & Full Database API (`/api/admin`)

#### 23. Aggregated Dashboard Statistics — `GET /api/admin/stats`
* **Access:** Administrator Only
* **Success Response (`200 OK`):**
  ```json
  {
    "totalReports": 48,
    "activeReports": 12,
    "matchedItems": 18,
    "pendingClaims": 3,
    "returnedItemsThisMonth": 7,
    "avgTimeToMatch": "4.2 hrs"
  }
  ```

#### 24. AI Engine Telemetry — `GET /api/admin/engine`
* **Access:** Administrator Only
* **Success Response (`200 OK`):**
  ```json
  {
    "provider": "Embedded Computer Vision & Heuristic Multimodal Engine",
    "isCloud": false,
    "multimodal": true,
    "capabilities": [
      "Image feature & object extraction",
      "Photo-to-photo visual similarity scoring (0-100%)",
      "Photo-to-text cross-modal semantic matching",
      "Automatic color, brand, and material tagging"
    ]
  }
  ```

#### 25. Global AI Re-Match Scan — `POST /api/admin/ai/scan-all`
* **Access:** Administrator Only
* **Behavior:** Loops over all active lost items and executes full multimodal matching against all active found items.
* **Success Response (`200 OK`):**
  ```json
  {
    "ok": true,
    "message": "AI visual scan complete: scanned 12 active items and produced 5 matches.",
    "scannedItems": 12,
    "totalMatches": 5
  }
  ```

#### 26. Items Database (Full Explorer) — `GET /api/admin/items`
* **Access:** Administrator Only
* **Query Parameters:** `type`, `status`, `category`, `q` (keyword regex across name/location/reporter)
* **Success Response (`200 OK`):**
  ```json
  {
    "total": 48,
    "items": [ /* array of all item records with populated reporters */ ]
  }
  ```

#### 27. Force Item Status Change — `PUT /api/admin/items/:id/status`
* **Access:** Administrator Only
* **Request Body:**
  ```json
  {
    "status": "Returned",
    "note": "Physical handover confirmed at Main Campus Security Desk"
  }
  ```

#### 28. Users Directory Database — `GET /api/admin/users`
* **Access:** Administrator Only
* **Query Parameters:** `q` (name/email/department), `userType`
* **Success Response (`200 OK`):**
  ```json
  [
    {
      "_id": "6737bc44958f0cb18da63a01",
      "name": "Rohan Das",
      "email": "rohan.das@iemcal.edu.in",
      "userType": "student",
      "department": "Computer Science",
      "createdAt": "2026-11-15T08:30:00.000Z",
      "reportCount": 2,
      "claimCount": 1
    }
  ]
  ```

#### 29. Modify User Role — `PUT /api/admin/users/:id/role`
* **Access:** Administrator Only
* **Request Body:**
  ```json
  { "userType": "admin" }
  ```

#### 30. Complete Claims Audit Log — `GET /api/admin/claims`
* **Access:** Administrator Only
* **Query Parameter:** `status` (optional filter: `'pending_review'`, `'approved'`, `'rejected'`)
* **Behavior:** Returns all claims with populated items, claimants, reviewers, and linked lost reports.

#### 31. Complete Matches Audit Log — `GET /api/admin/matches`
* **Access:** Administrator Only
* **Query Parameter:** `status` (optional: `'suggested'`, `'claimed'`, `'resolved'`, `'dismissed'`)

---

### 2.6 Notification Services (`/api/notifications`)

#### 32. Get In-App Notifications — `GET /api/notifications`
* **Access:** Authenticated
* **Behavior:** Returns the most recent 30 notifications for `req.user.id`, sorted by `-createdAt`.

#### 33. Acknowledge Notifications — `POST /api/notifications/read`
* **Access:** Authenticated
* **Behavior:** Sets `read: true` for all notifications belonging to the current user.

---

## 3. Inter-Service Call Interactions & Operational Workflows

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          INTER-SERVICE WORKFLOW TOPOLOGY                               │
└────────────────────────────────────────────────────────────────────────────────────────┘

 [Reporter] ──(POST /api/items + photo)──► [Express Routes] ────► [Save in Mongo: 'Reported']
                                                 │
                                                 ▼ (Async Background Trigger)
                                         [matching.js]
                                                 │
                   ┌─────────────────────────────┴─────────────────────────────┐
                   ▼                                                           ▼
       [ai-vision.js: Analyze Photo]                               [Query Opposite Active Items]
         - Read Buffer from /uploads/                                          │
         - Extract Color, Object, Tags                                         ▼
         - Save on Item Document                                   [Multimodal AI Comparison]
                   │                                                 - Photo-to-Photo
                   └─────────────────────────────┬───────────────────- Photo-to-Text
                                                 │
                                                 ▼
                                     [Score >= 70% Threshold?]
                                      ├── No: Stored as sub-threshold suggestion
                                      └── Yes:
                                           ├── Create Match in MongoDB
                                           ├── Transition Items to 'Matched'
                                           └── Dispatch In-App / Email Alerts
                                                 │
 [Claimant] ◄──(Notification Dot / Search)───────┘
     │
     ├──(1. GET /api/items/:id/question)────────► [Check ClaimLock] ──► [Return Question]
     │
     └──(2. POST /api/items/:id/claim)──────────► [Verify bcrypt Hash]
                                                        │
                         ┌──────────────────────────────┴──────────────────────────────┐
                         ▼ (Incorrect Answer)                                          ▼ (Correct Answer)
               [Record in ClaimLock]                                         [Delete ClaimLock]
                 - Attempts < 3: Return 403 (Attempts left)                   [Atomically set Item: 'Pending Verification']
                 - Attempts >= 3: Set until = now + 30m, Return 423           [Create Claim: 'pending_review']
                                                                              [Notify Campus Administrators]
                                                                                       │
 [Admin Console] ◄─────────────────────────────────────────────────────────────────────┘
     │
     ├──(GET /api/admin/stats & /api/admin/claims)
     │
     └──(POST /api/claims/:id/approve)──────────► [Set Claim: 'approved']
                                                  [Set Items: 'Returned']
                                                  [Dismiss All Competing Matches]
                                                  [Notify Owner & Finder: Handover Ready]
```

---

## 4. Race Conditions, Concurrency Vulnerabilities & Edge Cases

### 4.1 Race Conditions & Concurrency Vulnerabilities

#### 1. Concurrent Claim Submissions on the Same Found Item (TOCTOU Race)
* **Vulnerability:** Two claimants answer the verification question at the exact same millisecond. If the system uses a standard `Item.findById` followed by an `item.save()`, both might read `status === 'Reported'` and both claims would be marked pending, causing an inconsistent double-claim state.
* **Current Mitigation in Code (`server/src/routes.js#openClaim`):**
  ```javascript
  const locked = await Item.findOneAndUpdate(
    { _id: found._id, status: { $in: ['Reported', 'Matched', 'open'] } },
    { status: 'Pending Verification', $push: { statusHistory: ... } },
    { new: true }
  );
  if (!locked) return null; // Second caller receives null and HTTP 409 Conflict
  ```
  The atomic MongoDB `findOneAndUpdate` with a status precondition ensures that **only one request** can atomically transition the item from `Reported` to `Pending Verification`. The second concurrent thread fails to match the query condition and is immediately rejected with HTTP 409.

#### 2. Duplicate Match Creation Race Condition
* **Vulnerability:** If user A reports a lost item while user B simultaneously reports the complementary found item, both background `runMatching` threads could execute concurrently, potentially creating duplicate match suggestions.
* **Current Mitigation (`server/src/models.js` & `matching.js`):**
  - Compound unique index: `matchSchema.index({ lost: 1, found: 1 }, { unique: true })`.
  - Caught in `saveMatch`:
    ```javascript
    try { m = await Match.create({ lost: lost._id, found: found._id, ...data }); }
    catch (e) { if (e.code === 11000) return null; throw e; }
    ```
    If both runs race, the MongoDB driver rejects the second with error code `11000` (E11000 duplicate key error), which the server swallows gracefully without crashing.

#### 3. Concurrent Brute-Force Verification Attack
* **Vulnerability:** An attacker uses a multi-threaded script to fire 10 incorrect answers simultaneously.
* **Analysis:** `recordFailedAttempt` reads `ClaimLock.findOne`, increments `failedAttempts`, and calls `record.save()`. In high concurrency, non-atomic increments can cause multiple threads to read `failedAttempts = 0`, potentially allowing 5–7 attempts before the lock triggers.
* **Hardening Recommendation:** Replace the read-modify-write pattern with an atomic MongoDB update:
  ```javascript
  await ClaimLock.findOneAndUpdate(
    { user, item },
    { $inc: { failedAttempts: 1 } },
    { upsert: true, new: true }
  );
  ```

#### 4. Concurrent Admin Approval vs. Reporter Cancellation
* **Vulnerability:** A reporter clicks "Cancel Report" at the exact instant an administrator clicks "Approve Claim".
* **Current State:**
  - If cancellation executes first: Item status becomes `'Cancelled'`.
  - If admin approval executes immediately after: It updates `c.item.status = 'Returned'`.
* **Edge-Case Safeguard:** `review('approved')` should verify that `c.item.status === 'Pending Verification'` before executing the handover to prevent resurrecting cancelled or deleted reports.

---

### 4.2 Critical Edge Cases & Boundary Handling

#### 1. Uploaded Image Missing or Purged from Disk
* **Scenario:** An item has `photo: '/uploads/abc.jpg'`, but the underlying file was deleted by an OS cleaner or disk corruption.
* **Handling:** In `ai-vision.js#readImageBase64`:
  ```javascript
  const fullPath = path.join(__dirname, '../uploads', filename);
  if (!fs.existsSync(fullPath)) return null;
  ```
  The check fails safely, returning `null`. The matching engine gracefully switches from photo-to-photo matching to semantic text-token matching without throwing an uncaught exception.

#### 2. Case Sensitivity & Whitespace in Verification Answers
* **Scenario:** Founder sets answer as `"Blue Cat"`. Claimant types `"  blue cat   "`.
* **Handling:** In `routes.js`:
  ```javascript
  const normAns = (s) => String(s || '').trim().toLowerCase();
  ```
  Both the seed hash generation and claimant comparison normalize the input string to lowercase and strip leading/trailing whitespace, eliminating false rejections from mobile keyboard autocorrect.

#### 3. Self-Claiming & Circular Linking
* **Scenario:** A user tries to claim an item they reported themselves, or links a lost report to a found report they both filed.
* **Handling:**
  - `POST /api/items/:id/claim`: `if (same(item.reporter, req.user.id)) return res.status(400).json({ message: 'You reported this item' });`
  - `POST /api/matches`: `if (same(lost.reporter, found.reporter)) return res.status(400).json({ message: 'Both reports belong to the same person' });`

#### 4. Out-of-Bounds & Malformed AI Scores
* **Scenario:** An external AI returns an invalid score (e.g. `105%`, `-10%`, `"high"`, or `NaN`).
* **Handling:** Both `parseAI()` in `matching.js` and Mongoose's `matchSchema.score` validator enforce strict numerical bounds:
  ```javascript
  validate: {
    validator: (v) => typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 0 && v <= 100,
    message: 'Validation error: match score must be an integer between 0 and 100'
  }
  ```
  Any out-of-range value is caught and rejected before database persistence.

#### 5. MongoDB TTL Lockout Delay Drift
* **Scenario:** A user is locked out until `12:30:00`. MongoDB's background TTL index sweeper runs once every 60 seconds, meaning the document might still physically exist in the database at `12:30:45`.
* **Handling:** The application does not rely solely on MongoDB physical deletion. `lockOf()` performs an explicit software comparison:
  ```javascript
  if (record && record.until && record.until > new Date()) return record;
  return null;
  ```
  If `now > until`, the lock is immediately treated as expired, guaranteeing sub-millisecond precision regardless of when the Mongo background thread runs.

#### 6. Cascading Competing Match Invalidation
* **Scenario:** Item A is suggested as a match for Item B (85%) and Item C (75%). An administrator approves the claim between Item A and Item B.
* **Handling:** If Item C remains active, it could still display an invalid match to an already returned item.
* **Mitigation (`server/src/routes.js#review`):**
  ```javascript
  await Match.updateMany(
    { _id: { $ne: m._id }, status: { $in: ['suggested', 'claimed'] }, $or: [{ lost: m.lost }, { found: m.found }] },
    { status: 'dismissed' }
  );
  ```
  Upon approval, all competing matches involving either item are automatically dismissed, immediately cleaning up claimant queues across the campus.

---

## 5. Summary Table of Server Status Codes

| HTTP Status Code | Meaning in IEM Lost & Found API | Examples / Scenarios |
|:---:|---|---|
| **200 OK** | Successful retrieval, update, or claim review. | `GET /api/items`, `PUT /api/items/:id`, `POST /api/claims/:id/approve` |
| **201 Created** | New resource successfully persisted. | `POST /api/auth/register`, `POST /api/items`, `POST /api/matches` |
| **400 Bad Request** | Missing required fields, invalid domain, score out of bounds. | Password < 6 chars, email not ending in `@iemcal.edu.in`, self-claiming. |
| **401 Unauthorized** | Missing, invalid, or expired JWT Bearer token. | Calling protected routes without `Authorization: Bearer <token>`. |
| **403 Forbidden** | Role mismatch or wrong answer under attempt limit. | Non-admin accessing `/api/admin/*`, 1st/2nd failed verification attempt. |
| **404 Not Found** | Target resource does not exist. | Item, Claim, or Match ID not found in database. |
| **409 Conflict** | State conflict or resource contention. | Email already registered, item already claimed by another user (`status != Reported`). |
| **423 Locked** | Security freeze active on item claim. | 3 consecutive failed verification answers; locked for 30 minutes. |
| **500 Server Error** | Unhandled internal exception. | Database connection drops or unhandled filesystem crash. |
