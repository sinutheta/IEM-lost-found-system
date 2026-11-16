# IEM Lost & Found Management System
## Technology Stack, Architecture Implementation & Engineering Guide

**Institute of Engineering & Management (IEM), Kolkata**  
**Department of Computer Science & Engineering**  
*Course:* Software Engineering and Project Management (PCC-CS504)  
*Team / Group:* P8, Section B  
*Project Title:* IEM Lost & Found Management System  

---

## 1. Executive Summary & Tech Stack Identification

### MEAN vs. MERN: What Stack Is Being Used?

The **IEM Lost & Found Management System** is built on the **MEAN Stack** (MongoDB, Express.js, Angular 17, Node.js), augmented with an asynchronous multimodal Artificial Intelligence matching engine.

| Letter | Technology | Version | Architectural Role | Key Implementation Files |
|:---:|---|:---:|---|---|
| **M** | **MongoDB** (with Mongoose ODM) | `8.0` / Mongoose `8.4.0` | **Document Database & Persistence Tier**<br>Stores unstructured/semi-structured documents, manages TTL indexes, compound indexes, and audit trails. | `server/src/models.js`<br>`server/src/migrate.js`<br>`server/src/seed.js` |
| **E** | **Express.js** | `4.19.2` | **Backend REST API Framework**<br>Handles HTTP routing, JWT authentication, RBAC authorization, multipart file uploads, and business controllers. | `server/src/routes.js`<br>`server/src/middleware.js`<br>`server/src/index.js` |
| **A** | **Angular** | `17.3.0` | **Client Presentation Tier (SPA)**<br>Single Page Application built with standalone components, reactive signals, typed forms, and route guards. | `client/src/app/pages/*`<br>`client/src/app/core/*`<br>`client/src/app/app.routes.ts` |
| **N** | **Node.js** | `20+` | **Runtime Environment & Engine**<br>Asynchronous event-driven JavaScript engine running backend services, cron scripts, and heuristic/AI matchers. | `server/src/index.js`<br>`server/src/matching.js` |

> [!NOTE]
> **Why MEAN over MERN for this SWE Project?**
> While MERN uses React (a minimalist view library requiring third-party selections for routing, state, and forms), **MEAN uses Angular**, an enterprise-grade, "batteries-included" framework. Angular provides:
> 1. **Strict TypeScript Typing:** Eliminates runtime contract mismatches between client and server.
> 2. **Built-in Dependency Injection & HttpClient:** Clean separation of concerns between presentation and HTTP network calls (`client/src/app/core/api.ts`).
> 3. **Built-in Route Guards & HTTP Interceptors:** Out-of-the-box security pipeline preventing unauthorized route traversal (`authGuard`) and automating JWT Bearer token injection (`authInterceptor`).
> 4. **Signals (Angular 17+):** Fine-grained reactive state management without the overhead of heavy third-party state stores like Redux.

---

## 2. Layer-by-Layer Architecture & Implementation

```
┌────────────────────────────────────────────────────────────────────────┐
│                   PRESENTATION TIER (Angular 17 SPA)                   │
│  [Home / Search]  [Report Item]  [Item Details]  [My Items]  [Profile] │
│      Signals State  •  authGuard  •  authInterceptor  •  Api Service   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP REST + JSON (Bearer JWT)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   APPLICATION TIER (Node.js & Express)                 │
│  Middleware Pipeline: CORS -> Multer File Handler -> JWT Auth -> RBAC  │
│  REST API Endpoints: /api/auth • /api/items • /api/matches • /claims   │
│  Domain Engines: Heuristic Scorer (0-100%) + Claude AI Multimodal      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Mongoose ODM / Driver (Port 27017)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   PERSISTENCE TIER (MongoDB 8.0)                       │
│  Collections: users • items • matches • claims • claimlocks • notes    │
│  Features: Compound Indexes • TTL Expiration • Status History Audits   │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1 The "M" Layer — MongoDB & Mongoose ODM

* **File Location:** `server/src/models.js`
* **Connection String:** Configured in `server/src/index.js` via `mongoose.connect(process.env.MONGODB_URI)`.

#### Data Modeling & Key Collections:
1. **`User` Collection (`users`):**
   - Stores user profiles: `name`, `email` (indexed, unique), `passwordHash` (bcrypt, `select: false`), `userType` (`student`, `faculty`, `staff`, `admin`), `department`.
   - Security rule: `passwordHash` is never selected by default, preventing accidental credential leakage over the API.
2. **`Item` Collection (`items`):**
   - Stores lost and found posts: `type` (`lost` | `found`), `name`, `category` (predefined 9-item taxonomy), `description`, `location`, `date`, `photo` (stored filename), `status`.
   - **Verification Challenge Fields:** `verificationQuestion` (plain text prompt) and `verificationAnswerHash` (bcrypt hash, `select: false`).
   - **Status History Audit Trail:** Subdocument array `statusHistory: [{ status, changedAt, changedBy, note }]` logging every lifecycle mutation.
3. **`Match` Collection (`matches`):**
   - Stores lost-found pairings with a compound unique index on `{ lost: 1, found: 1 }`.
   - Fields: `score` (strictly bounded integer $0 \le \text{score} \le 100$), `keywordScore`, `aiScore`, `method` (`heuristic` | `ai` | `manual`), `status` (`suggested` | `confirmed` | `dismissed`).
4. **`Claim` Collection (`claims`):**
   - Links claimant to found item and optional match: `item`, `claimant`, `answer`, `status` (`pending_review`, `approved`, `rejected`), `reviewedBy`, `reviewedAt`.
5. **`ClaimLock` Collection (`claimlocks`):**
   - Anti-brute-force tracking: `user`, `item`, `failedAttempts` (integer counter).
   - **TTL Auto-Expiry Index:** `until: { type: Date, index: { expires: 0 } }`. When `failedAttempts` reaches 3, `until` is set to 30 minutes in the future; MongoDB's background thread automatically removes the lock when expired.
6. **`Notification` Collection (`notifications`):**
   - In-app notification center: `user`, `message`, `item`, `kind` (`match`, `claim`, `status_update`), `read` (boolean).

---

### 2.2 The "E" Layer — Express.js REST Framework

* **File Locations:** `server/src/routes.js`, `server/src/middleware.js`, `server/src/index.js`

#### Middleware Pipeline:
1. **`cors()`:** Enables cross-origin requests from the Angular development server (`http://localhost:4200`) and production origins.
2. **`express.json()`:** Parses incoming JSON request payloads.
3. **`express.static('/uploads')` & `express.static('client/dist/client')`:** Serves uploaded item images and the compiled Angular SPA production build.
4. **`multer` Upload Middleware:** Configured with `diskStorage` to write files to `/uploads/` with unique, cryptographically safe names (`timestamp-random.ext`).
5. **`auth` Middleware:**
   - Extracts JWT Bearer token from the `Authorization` header.
   - Decodes and verifies the signature using `jwt.verify(token, JWT_SECRET)`.
   - Attaches `req.user = { id, email, role, userType }` to the Express request object.
6. **`adminOnly` Middleware:**
   - Evaluates `req.user.role === 'admin'`. Rejects non-administrative users with HTTP 403 Forbidden.

#### Routing Endpoints (`/api`):
* `/api/auth`: `POST /register`, `POST /login`, `GET /me`.
* `/api/items`:
  * `GET /`: Search and multi-criteria filtering (`type`, `category`, `location`, `fromDate`, `toDate`, `q`).
  * `POST /`: Create lost/found report (multipart with photo).
  * `GET /:id`: Detailed item view with populated reporter info.
  * `PUT /:id`: Reporter-only edit of active reports (`Reported` or `Matched`).
  * `POST /:id/cancel`: Reporter-only cancellation of active reports.
  * `POST /:id/moderate` & `DELETE /:id`: Admin-only moderation and deletion.
  * `GET /:id/question`: Public retrieval of found item verification challenge.
  * `POST /:id/claim`: Answer submission with 3-attempt lockout logic.
* `/api/matches`: Ranked matches query and manual link creation.
* `/api/claims`: `GET /` (admin review queue), `POST /:id/approve`, `POST /:id/reject`.
* `/api/admin/stats`: 6-metric analytics aggregation for the dashboard.
* `/api/notifications`: Feed retrieval and `POST /:id/read` acknowledgment.

---

### 2.3 The "A" Layer — Angular 17 Presentation Client

* **File Locations:** `client/src/app/`

#### Key Architectural Patterns:
1. **Standalone Components:** All pages are declared with `standalone: true`, removing legacy `NgModule` boilerplate and drastically improving tree-shaking and bundle size (~329 KB initial total).
2. **Angular Signals (`signal()`, `computed()`):**
   - Located in `client/src/app/core/auth.ts`.
   - Manages reactive state for `currentUser = signal<User | null>(...)` and `token = signal<string | null>(...)`. Any component referencing `auth.user()` updates automatically when login state changes without RxJS subscription memory leaks.
3. **HTTP Interceptor (`authInterceptor`):**
   - Intercepts every outgoing HTTP call from `HttpClient`.
   - If an auth token exists in `localStorage`, clones the request and injects `Authorization: Bearer <token>`.
4. **Route Protection (`authGuard`):**
   - Declared in `client/src/app/app.routes.ts`.
   - Evaluates `auth.isLoggedIn()`. Unauthenticated users attempting to access `/report`, `/my-items`, or `/profile` are immediately redirected to `/login` with the return URL preserved.
5. **Component Views:**
   - `HomeComponent`: Responsive search bar with debounce, category pill filter, location text filter, date range picker, and dynamic cards.
   - `ReportComponent`: Multipart form with drag-and-drop / file input, reactive validation, category dropdown, and conditional challenge prompt.
   - `ItemDetailsComponent`: Rich status badge, timeline history display, edit modal (`PUT`), cancellation button, anti-brute-force challenge submission modal, and admin moderation controls.
   - `MyItemsComponent`: Tabs for *My Reports*, *Suggested Matches* (ranked with similarity badges), and *Notifications* with blue unread indicators.
   - `ProfileComponent`: User profile details, sign out, and full **Admin Command Center** (6 dashboard statistic widgets, claim review queue, and manual match linker).

---

### 2.4 The "N" Layer — Node.js & Domain Business Engines

* **File Locations:** `server/src/index.js`, `server/src/matching.js`

#### Heuristic + AI Multimodal Matching Engine:
When an item is reported or edited, Node.js triggers `runMatchingForItem(item)` in the background:
1. **Deterministic Similarity Scorer:**
   - Evaluates complementary pool (lost items compared against found items, and vice versa).
   - **Weight Distribution:**
     - Category Match: 30%
     - Name Token Overlap (Jaccard Index): 30%
     - Description Token Overlap: 15%
     - Campus Location Proximity: 15%
     - Date Proximity (Exponential decay over days difference): 10%
   - Formula: $\text{Score} = \text{round}\left(\sum w_i \cdot s_i\right)$, strictly constrained to $[0, 100]$.
2. **Multimodal AI Vision Evaluator (Anthropic Claude API):**
   - If an API key is configured and both items have uploaded images, reads the image buffers from `/uploads/` and sends an image-comparison prompt to Claude (`claude-3-haiku` / `claude-3-5-sonnet`).
   - Claude evaluates visual features (color, brand, wear and tear, model) and returns an AI similarity score and explanation.
3. **Threshold Alert Trigger (70%):**
   - If computed `score >= 70`:
     - Creates/updates `Match` record with status `suggested`.
     - Transitions items from `Reported` to `Matched`.
     - Automatically creates two `Notification` records (one for the lost reporter, one for the found reporter).

---

## 3. Simplified Working Procedure (End-to-End Walkthrough)

To explain the working procedure easily in a Software Engineering viva or project review, the system follows a 5-step operational lifecycle:

```
[1. User Registration & Login]
         │ (Institutional Email Check & JWT Session)
         ▼
[2. Item Ingestion]
   ├── Lost Item: Name, Category, Description, Location, Date, Photo
   └── Found Item: Above + Verification Question & Secret Answer (bcrypt)
         │
         ▼
[3. Automated Dual-Layer Matching]
   ├── Token & Proximity Scorer (0-100%)
   ├── Optional Multimodal AI Image Comparator
   └── Score >= 70% ──► Match Alert Created & Status updated to "Matched"
         │
         ▼
[4. Claim & Verification Challenge]
   ├── Claimant reviews suggested match or finds item in search
   ├── Claimant enters answer to found item's challenge question
   ├── 3-Attempt Anti-Brute-Force Guard (Wrong answer -> Attempt counter; 3rd wrong -> 30-min Lock)
   └── Correct Answer ──► Status becomes "Pending Verification"
         │
         ▼
[5. Administrative Handover Resolution]
   ├── Admin reviews claim in Dashboard
   ├── Admin Clicks "Approve Claim"
   └── System marks item "Returned", dismisses competing matches, alerts parties
```

---

## 4. Everything Completed So Far (SWE Milestones)

All 20 Functional Requirements (FR-01 to FR-20), Non-Functional Requirements (NFR-01 to NFR-05), and Interface Requirements (IR-01 to IR-05) are 100% complete and fully verified.

### Summary of Completed Milestones:
1. **Core MEAN Stack Infrastructure:** Express server with MongoDB connection, Angular 17 client with routing, auth guards, interceptors, and local file storage for photo uploads.
2. **FR-01 & FR-02 (Authentication & Role Management):**
   - Institutional domain restriction (`@iemcal.edu.in`, `@iem.edu.in`).
   - Role and UserType classification: `student`, `faculty`, `staff`, `admin`.
   - Bcrypt password hashing (10 rounds) and 7-day signed JWT tokens.
3. **FR-03, FR-04 & FR-05 (Search, Filtering & Categorization):**
   - Case-insensitive regex search on name, description, and location.
   - Collapsible multi-criteria filter bar: Category dropdown, campus location input, date range pickers (`fromDate`, `toDate`), and type pills (*All*, *Lost*, *Found*).
   - Strict 9-item category taxonomy.
4. **FR-06, FR-07 & FR-08 (Lifecycle Controls & Reporter Self-Service):**
   - Item details view with reporter details and photo modal.
   - `PUT /api/items/:id`: Original reporter can edit active reports before handover.
   - `POST /api/items/:id/cancel`: Original reporter can withdraw active reports.
5. **FR-10, FR-15 & FR-18 (Automated Matching & Scorer Bounds):**
   - Heuristic scoring engine with tokenization and proximity decay.
   - Multimodal Claude AI integration for visual comparison.
   - Strict $[0, 100]$ score range validation rejecting non-numeric or out-of-bounds values.
   - Automated notification generation when score reaches or exceeds 70%.
6. **FR-12, FR-19 & FR-20 (Anti-Brute-Force Claim Verification):**
   - Found item reporter specifies secret verification challenge and answer.
   - Answer hashed with bcrypt (8 rounds) and stored with `select: false`.
   - `ClaimLock` mechanism: Tracks `failedAttempts`; enforces a strict 30-minute freeze after 3 consecutive wrong answers; resets counter upon correct answer.
7. **FR-13 & FR-16 (Admin Command Center & Moderation):**
   - `GET /api/admin/stats`: Aggregates 6 key operational metrics (Total Reports, Active Reports, Matched Items, Pending Claims, Returned This Month, Avg Time-to-Match in hours).
   - Admin review panel with one-click claim approval and rejection.
   - Admin moderation endpoints to flag inappropriate reports (`POST /moderate`) or hard delete records (`DELETE`).
8. **FR-14 (Standardized Status Lifecycle & Database Migration):**
   - Standardized 6 statuses: `Reported`, `Matched`, `Pending Verification`, `Returned`, `Cancelled`, `Rejected`.
   - Immutable audit trail in `statusHistory` array.
   - Automated database migration runner (`server/src/migrate.js`) ensuring legacy records conform to the schema.
9. **Formal Engineering Documentation:**
   - High-Level Design document (`docs/hld.md`).
   - Software Test Plan (`docs/test-plan.md`).
   - Requirements Traceability Matrix (`docs/traceability-matrix.md`).
   - Comprehensive System Specification and Design Document (`docs/system-specification-and-design.md`) featuring 6 Mermaid diagrams (Use Case, DFD L0 & L1, Activity, Sequence, UML Class, Multi-tier Architecture) and Black-Box/White-Box test design suites.

---

## 5. Future Enhancements & Scope (SWE Roadmap)

For subsequent iterations, final-year capstone extensions, or production deployment across multiple university campuses, the following upgrades are recommended:

### 5.1 Real-Time Communication & WebSockets (Socket.IO)
* **Current State:** Notification retrieval is currently REST-polled on navigation.
* **Proposed Enhancement:** Integrate **Socket.IO** between the Node.js server and Angular client to enable instantaneous in-app toast alerts when a match reaches ≥ 70%, and support anonymous real-time chat between claimant and finder under administrator oversight.

### 5.2 External Notification Gateways (Email & SMS)
* **Current State:** Notifications are logged in the database and simulated in console.
* **Proposed Enhancement:** Connect **Nodemailer / SendGrid API** for sending automated institutional emails and **Twilio API** for SMS text alerts when an item match is detected or when an administrator approves a claim.

### 5.3 Interactive Campus Geospatial Map (Leaflet / Google Maps Platform)
* **Current State:** Campus locations are currently string tags (e.g., "Gurukul Campus - Lab 3", "Management House - 2nd Floor").
* **Proposed Enhancement:** Integrate an interactive SVG or Leaflet/Google Map of the IEM Kolkata campuses. Users can drop a pin on the exact building or outdoor lawn where the item was lost/found, allowing spatial distance radius queries in MongoDB (`$nearSphere` with 2dsphere indexing).

### 5.4 Vector Embeddings & Similarity Search (Vector AI Engine)
* **Current State:** AI scoring calls an external multimodal API sequentially.
* **Proposed Enhancement:** Use an image embedding model (e.g., CLIP / MobileNet) to generate 512-dimensional vector embeddings of item photos upon upload. Store embeddings in MongoDB Atlas Vector Search or a vector index to perform sub-100ms k-Nearest Neighbor ($k$-NN) visual similarity queries at scale.

### 5.5 Progressive Web App (PWA) & Mobile Native Camera
* **Current State:** Responsive web application optimized for mobile viewports.
* **Proposed Enhancement:** Configure `@angular/pwa` with a Service Worker and `manifest.webmanifest`. This enables students to install the application directly onto Android/iOS home screens, receive Web Push notifications, access cached reports offline, and use native device cameras directly.

### 5.6 Automated CI/CD & Automated End-to-End Testing Suite
* **Current State:** Manual test scripts, Angular build validation, and node syntax checks.
* **Proposed Enhancement:**
  - Implement unit and integration tests using **Jest** and **Supertest** on the Express API (`server/tests/`).
  - Implement end-to-end (E2E) component and workflow tests using **Playwright** or **Cypress** on the Angular client.
  - Setup a **GitHub Actions CI/CD Pipeline** that automatically runs linters, unit tests, and builds Docker containers on every pull request.

### 5.7 Digital Handover QR Code / Cryptographic Token
* **Current State:** Admin clicks "Approve Claim" in the web dashboard.
* **Proposed Enhancement:** Upon claim approval, generate a time-limited cryptographic QR code sent to the claimant's mobile app. When visiting campus security for physical item handover, the security officer scans the QR code to verify identity and record physical item release cryptographically.
