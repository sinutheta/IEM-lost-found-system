# IEM Lost & Found Management System
## Non-Functional Requirements, Interface Requirements & Traceable Test Suite

**Institute of Engineering & Management (IEM), Kolkata**  
**Department of Computer Science & Engineering**  
*Course:* Software Engineering and Project Management (PCC-CS504) | Semester V  
*Team / Group:* P8, Section B  
*Project Title:* IEM Lost & Found Management System  
*Technology Stack:* MEAN Stack (MongoDB, Express.js, Angular 17, Node.js) + Multimodal AI Vision Engine  

---

## 1. Non-Functional Requirements (NFR-01 to NFR-05)

Non-Functional Requirements define the operational qualities, performance benchmarks, security guardrails, and architectural constraints that the system must satisfy.

| Requirement ID | Quality Attribute | Requirement Statement & Measurement Criteria | Architectural Enforcement in Codebase |
|:---:|:---:|---|---|
| **NFR-01** | **Performance & Latency** | Under a concurrent load of up to **100 simultaneous active users**, at least **95% of standard HTTP read/write API transactions** (searching, feed browsing, item detail viewing, report creation) must complete with a server response latency $\le 1.5$ seconds. Asynchronous multimodal AI image feature extraction and similarity scoring must complete within $\le 3.0$ seconds. | • Express non-blocking asynchronous event loop with async/await handlers.<br>• Efficient MongoDB compound queries with projection (`select: false` on hashes).<br>• Local file streaming with Multer diskStorage avoiding memory buffer bottlenecks. |
| **NFR-02** | **Scalability & Data Throughput** | The system architecture and database schema shall sustain a minimum of **10,000 registered campus users**, **100,000 item reports**, and a daily throughput of **1,000 new reports** without database sharding or breaking schema redesigns. Compound database indices (`{ lost: 1, found: 1 }`, `{ reporter: 1, status: 1 }`) and regex text indexing must guarantee indexed query execution times under **50 milliseconds**. Photo uploads must be bounded by a **5 MB per file ceiling** with automatic disk path segregation. | • Compound uniqueness and query indexes in `server/src/models.js`.<br>• Multer file filter and 5 MB hard limit in `server/src/routes.js`.<br>• Scalable document embedding (`statusHistory` subdocument array) eliminating relational joins. |
| **NFR-03** | **Security & Cryptographic Privacy** | 1. User passwords must be hashed using **bcrypt** (cost factor 10) and segregated with `select: false`.<br>2. Found item verification answers must be hashed with **bcrypt** (cost factor 8) and segregated with `select: false`, guaranteeing that plain-text or hashed answers are never exposed over API responses or client bundles.<br>3. The system shall enforce a strict **3-attempt anti-brute-force lockout** (30-minute freeze) on item verification challenges via MongoDB TTL indexes.<br>4. Administrative routes (`/api/admin/*`, `/api/claims/*`, moderation) must strictly enforce Role-Based Access Control (**RBAC**), rejecting non-admin tokens with HTTP 403 Forbidden.<br>5. Sessions must be signed using **JSON Web Tokens (JWT)** with HMAC-SHA256 and an explicit 7-day expiration. | • `server/src/models.js` (`select: false` on `passwordHash` and `verificationAnswerHash`).<br>• `server/src/routes.js` (`lockOf`, `recordFailedAttempt`, `resetFailedAttempts`).<br>• `server/src/middleware.js` (`auth` and `adminOnly` guards). |
| **NFR-04** | **Reliability, Fault Tolerance & Concurrency** | The system shall maintain at least **99.5% operational availability** during academic campus operating hours (08:00 to 20:00 IST). The system must guarantee atomic concurrency handling: atomic `findOneAndUpdate` queries with precondition status checks must eliminate race conditions (TOCTOU) such as two users concurrently claiming the same found item. Database compound unique indexes must prevent duplicate match creations. If external cloud AI vision endpoints experience a network failure or HTTP 5xx error, the system must **automatically fall back to the embedded computer vision engine** without throwing unhandled exceptions. | • Atomic query `Item.findOneAndUpdate({ _id, status: { $in: ['Reported', 'Matched', 'open'] } }, { status: 'Pending Verification' })` in `routes.js`.<br>• Catch block for duplicate key error `E11000` on `Match.create`.<br>• Fallback try/catch architecture in `server/src/ai-vision.js` routing to `extractVisualAttributesLocal()`. |
| **NFR-05** | **Usability, Accessibility & Responsiveness** | The user interface must adhere to **WCAG 2.1 Level AA** contrast standards ($\ge 4.5:1$ text-to-background contrast ratio). The Angular client must provide dynamic responsive rendering across mobile form factors ($\le 520\text{px}$) and desktop viewports without visual truncation or horizontal layout blowout. At least **85% of evaluated campus test users** (students, faculty, staff) must be able to successfully submit an item report without external guidance in under **2 minutes**. | • Mobile frame layout with media queries (`@media (max-width: 520px)`) in `client/src/styles.css`.<br>• Standalone Angular 17 UI components with clear typographic hierarchy, semantic form controls, and accessible color badges. |

---

## 2. Interface Requirements (IR-01 to IR-05)

Interface Requirements specify the communication protocols, data schemas, security handshakes, and integration boundaries between the IEM Lost & Found System and internal or external services, including third-party APIs, payment gateways, and communication networks.

### IR-01: 3rd-Party Software & Multimodal AI Vision API Interface
* **Interface Category:** 3rd-Party Software / External AI REST API Interface
* **Target Services:** Google Gemini 1.5 Flash API (`generativelanguage.googleapis.com`), Anthropic Claude Messages API (`api.anthropic.com`), or OpenAI Vision API (`api.openai.com`).
* **Protocol & Transport:** HTTPS over TLS 1.3, TCP port 443.
* **Authentication:** API Key passed via HTTP Headers (`x-api-key` or `Authorization: Bearer <key>`) or query parameter (`?key=...`).
* **Data Format:** JSON request/response payloads with base64-encoded binary image data (`data:image/jpeg;base64,...`).
* **Specification & Operational Guardrails:**
  - The interface sends an image buffer alongside an engineering prompt asking the model to evaluate physical attributes (category, color spectrum, brand, model, wear, scratches, stickers) and output a normalized similarity score ($0\text{--}100$) and visual reasoning.
  - The client interface must enforce a strict **20-second timeout** utilizing `AbortController`.
  - **Circuit Breaker & Fallback:** If the external API endpoint returns an HTTP 4xx/5xx status code or aborts on timeout, the interface must gracefully decouple and hand execution over to the **Embedded Computer Vision & Feature Extractor** (`server/src/ai-vision.js`), returning an offline-computed score without bubbling an error to the user.

### IR-02: Payment & Security Escrow Handling Interface
* **Interface Category:** Financial & Payment Gateway Interface
* **Target Services:** Institutional Payment Gateway (Razorpay / Stripe / IEM Campus Smart Card Wallet API).
* **Protocol & Transport:** HTTPS over TLS 1.3 with webhook event delivery.
* **Authentication:** API Secret Key for server calls; client-side temporary checkout token; `HMAC-SHA256` signature verification for incoming webhooks.
* **Data Format:** JSON request and response structures.
* **Specification & Operational Guardrails:**
  - **Purpose:** Handles nominal administrative handling fees (e.g. secure locker storage fees: ₹20–₹50), safe campus courier shipping costs, or optional finder gratitude micro-rewards (₹50–₹500).
  - **PCI-DSS Compliance:** The interface must implement client-side tokenization (Razorpay Orders / Stripe PaymentIntents). Zero credit card numbers, CVVs, or bank credentials shall be received or stored within the IEM Lost & Found server or MongoDB database.
  - **Webhook Idempotency:** The incoming webhook endpoint (`POST /api/payments/webhook`) must verify the cryptographic signature (`x-razorpay-signature` or `stripe-signature`) using the shared secret and record the `paymentId` to prevent replay attacks and double-crediting.
  - **Escrow State Machine:** Funds are held in escrow status (`escrow_held`) upon claim submission and are only captured / settled (`settled`) when an administrator signs off on the physical handover (`POST /api/claims/:id/approve`). If a claim is rejected, the gateway interface automatically issues a full refund (`refunded`).

### IR-03: External Communication & Notification Dispatch Interface
* **Interface Category:** Communication & Telephony / Messaging Gateway Interface
* **Target Services:** Transactional Email Service (SendGrid API / SMTP Gateway via Nodemailer) and SMS/WhatsApp Gateway (Twilio REST API).
* **Protocol & Transport:** HTTPS REST API / SMTP over TLS on ports 443 / 587.
* **Authentication:** Basic Auth / Bearer API Key (`TWILIO_AUTH_TOKEN`, `SENDGRID_API_KEY`).
* **Data Format:** Form-encoded or JSON payloads containing recipient address, sender alias (`lostfound@iemcal.edu.in`), template variables, and message body.
* **Specification & Operational Guardrails:**
  - Triggered asynchronously whenever a match score satisfies $\text{score} \ge 70\%$, when an item verification question is successfully answered, or when an administrator approves/rejects a claim.
  - **Retry Policy:** If the external communication gateway returns an HTTP 429 (Rate Limit) or 503 (Unavailable), the message dispatcher must queue the task with **exponential backoff retry logic** (initial delay: 5s, factor: 2x, max retries: 3).
  - **Rate Limiting:** Maximum of 5 automated email/SMS dispatches per user per hour to prevent communication spam and Denial-of-Wallet vulnerabilities.

### IR-04: Client Web & Mobile Presentation Interface
* **Interface Category:** User Interface (Presentation Tier to Application Tier)
* **Target Services:** Angular 17 Single Page Application (`client/`) to Express.js REST API (`server/`).
* **Protocol & Transport:** HTTP/1.1 and HTTP/2 over TLS; RESTful API routing under `/api/*`.
* **Authentication:** HTTP `Authorization: Bearer <JWT>` header automatically injected on every outgoing client request via Angular `HttpInterceptorFn` (`authInterceptor`).
* **Data Format:** JSON request/response bodies and `multipart/form-data` for file uploads.
* **Specification & Operational Guardrails:**
  - Client state managed reactively via Angular Signals (`signal()`, `computed()`), providing sub-50ms DOM updates upon asynchronous HTTP arrivals.
  - Route traversal guarded by `authGuard`: unauthenticated attempts to access `/report`, `/my-items`, `/admin`, or `/profile` immediately trigger URL capture and redirect to `/login`.
  - Real-time search debouncing (300ms) on `HomeComponent` keyword filtering to minimize extraneous API queries.

### IR-05: Database Persistence & Storage Wire Protocol Interface
* **Interface Category:** Database / Persistence Tier Wire Protocol Interface
* **Target Services:** MongoDB Server 8.0 instance running on localhost or cluster.
* **Protocol & Transport:** MongoDB Wire Protocol (binary TCP protocol over port 27017, with TLS in production).
* **Authentication:** SCRAM-SHA-256 connection authentication via MongoDB connection string URI (`mongodb://...`).
* **Data Format:** BSON (Binary JSON).
* **Specification & Operational Guardrails:**
  - Managed by Mongoose ODM with connection pooling configuration:
    ```javascript
    {
      maxPoolSize: 50,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4
    }
    ```
  - Coordinates with MongoDB's background Time-To-Live (TTL) monitoring thread running every 60 seconds to purge expired lockout records matching `ClaimLock.until`.
  - Schema validators enforce field types, regular expressions, and numerical bounds ($0 \le \text{score} \le 100$) before data serialization over the wire.

---

## 3. Comprehensive Traceable Test Suite (12 Formal Test Cases)

Below are 12 detailed, formal test cases designed to verify all 5 Non-Functional Requirements and all 5 Interface Requirements.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        REQUIREMENTS TRACEABILITY OVERVIEW                              │
│                                                                                        │
│   NFR-01 (Performance)   ──► TC-NFR-01, TC-CROSS-01                                    │
│   NFR-02 (Scalability)   ──► TC-NFR-02                                                 │
│   NFR-03 (Security)      ──► TC-NFR-03, TC-CROSS-02                                    │
│   NFR-04 (Reliability)   ──► TC-NFR-04, TC-IR-05                                       │
│   NFR-05 (Usability)     ──► TC-NFR-05                                                 │
│   IR-01  (AI Vision API) ──► TC-IR-01, TC-CROSS-01                                    │
│   IR-02  (Payment Gate)  ──► TC-IR-02, TC-CROSS-02                                    │
│   IR-03  (Communication) ──► TC-IR-03                                                 │
│   IR-04  (Client UI/SPA) ──► TC-IR-04                                                 │
│   IR-05  (Database Wire) ──► TC-IR-05                                                 │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Test Case 1: `TC-NFR-01`
* **Test Case ID:** `TC-NFR-01`
* **Traced Requirement:** **NFR-01** (Performance & Latency)
* **Test Title:** Concurrent Load Response Time Benchmark under 100 Simultaneous Users
* **Test Level & Technique:** System Performance Testing / Load Testing (k6 / Apache JMeter)
* **Preconditions:** Staging server online with seeded database (1,000 items, 500 users).
* **Test Execution Steps:**
  1. Initialize load test tool (k6) with 100 Virtual Users (VUs) executing a ramped 5-minute workload.
  2. Simulate concurrent calls to `GET /api/items?type=found&category=Bottle`, `GET /api/items/:id`, and `POST /api/items` (reporting lost items).
  3. Measure the HTTP request duration, transaction throughput, and 95th percentile latency ($p_{95}$).
* **Expected Output:**
  - Throughput $\ge 80$ requests/second.
  - $p_{95}$ latency for read/write requests $\le 1.5$ seconds.
  - HTTP error rate (5xx status codes) strictly $0.0\%$.
* **Pass/Fail Criteria:** **Pass** if $p_{95} \le 1.5\text{s}$ and error rate $= 0\%$; otherwise **Fail**.

---

### Test Case 2: `TC-NFR-02`
* **Test Case ID:** `TC-NFR-02`
* **Traced Requirement:** **NFR-02** (Scalability & Data Throughput)
* **Test Title:** High-Volume Database Scalability & Compound Index Search Benchmark
* **Test Level & Technique:** Database Performance Testing / Volume Testing
* **Preconditions:** MongoDB populated with 10,000 `User` records and 100,000 `Item` records.
* **Test Execution Steps:**
  1. Execute MongoDB `explain("executionStats")` on queries:
     - `db.items.find({ type: "lost", category: "Electronics", status: "Reported" })`
     - `db.matches.find({ lost: ObjectId(...), found: ObjectId(...) })`
  2. Measure execution time (`executionTimeMillis`), index used (`IXSCAN`), and total documents examined.
  3. Submit a multipart photo upload of exactly 5.1 MB and an upload of 4.9 MB.
* **Expected Output:**
  - `executionTimeMillis` $\le 50\text{ms}$ utilizing `IXSCAN`.
  - The 5.1 MB file upload is rejected with HTTP `400 / MulterError: File too large`.
  - The 4.9 MB file upload is accepted, persisted to `/uploads`, and returns HTTP `201 Created`.
* **Pass/Fail Criteria:** **Pass** if query execution $\le 50\text{ms}$ with index scan and 5 MB file boundary enforced.

---

### Test Case 3: `TC-NFR-03`
* **Test Case ID:** `TC-NFR-03`
* **Traced Requirement:** **NFR-03** (Security & Cryptographic Privacy)
* **Test Title:** Verification Answer Hash Segregation & 3-Attempt Lockout Enforcement
* **Test Level & Technique:** Security Penetration Testing / Vulnerability Assessment
* **Preconditions:** Registered user and found item with challenge question *"What sticker is on the flask?"* and answer *"tiger"*.
* **Test Execution Steps:**
  1. Inspect API response of `GET /api/items/:id` and `GET /api/items/:id/question`.
  2. Submit 1st incorrect answer: `POST /api/items/:id/claim` with `{"answer": "lion"}`.
  3. Submit 2nd incorrect answer: `POST /api/items/:id/claim` with `{"answer": "bear"}`.
  4. Submit 3rd incorrect answer: `POST /api/items/:id/claim` with `{"answer": "wolf"}`.
  5. Submit 4th attempt immediately.
* **Expected Output:**
  - Step 1: `verificationAnswerHash` is absent from JSON output (`undefined`).
  - Step 2: HTTP `403 Forbidden` (`{"failedAttempts": 1, "remaining": 2}`).
  - Step 3: HTTP `403 Forbidden` (`{"failedAttempts": 2, "remaining": 1}`).
  - Step 4: HTTP `423 Locked` (`{"message": "3 failed attempts reached. Locked for 30 minutes."}`).
  - Step 5: Immediate rejection with HTTP `423 Locked` without bcrypt evaluation.
* **Pass/Fail Criteria:** **Pass** if answer hash is never leaked and 30-minute freeze triggers on the 3rd consecutive wrong answer.

---

### Test Case 4: `TC-NFR-04`
* **Test Case ID:** `TC-NFR-04`
* **Traced Requirement:** **NFR-04** (Reliability, Fault Tolerance & Concurrency)
* **Test Title:** Atomic Concurrency & TOCTOU Race Condition Prevention on Simultaneous Claims
* **Test Level & Technique:** Concurrency Stress Testing / Race Condition Validation
* **Preconditions:** One found item in state `'Reported'` (`Item_A`). Two authenticated users (`User_1` and `User_2`) know the correct answer.
* **Test Execution Steps:**
  1. Construct two simultaneous asynchronous HTTP requests:
     - Request 1: `User_1` calls `POST /api/items/Item_A/claim` with correct answer.
     - Request 2: `User_2` calls `POST /api/items/Item_A/claim` with correct answer.
  2. Fire both requests concurrently using a multi-threaded HTTP script (0ms stagger).
  3. Inspect HTTP response status codes and query MongoDB `items` and `claims` collections.
* **Expected Output:**
  - Exactly one request succeeds with HTTP `201 Created`, transitioning `Item_A.status` to `'Pending Verification'`.
  - The second request receives HTTP `409 Conflict` (`"This item is no longer available to claim"`).
  - Exactly one `Claim` document is created in the database.
* **Pass/Fail Criteria:** **Pass** if no double-claim occurs and state transition remains strictly atomic.

---

### Test Case 5: `TC-NFR-05`
* **Test Case ID:** `TC-NFR-05`
* **Traced Requirement:** **NFR-05** (Usability, Accessibility & Responsiveness)
* **Test Title:** Mobile Viewport Adaptability & WCAG 2.1 AA Contrast Accessibility
* **Test Level & Technique:** Usability Testing / Automated Accessibility Audit (Axe DevTools / Lighthouse)
* **Preconditions:** Angular client deployed on staging server.
* **Test Execution Steps:**
  1. Open application in Chrome DevTools emulating iPhone SE ($375 \times 667\text{px}$) and Samsung Galaxy ($360 \times 740\text{px}$).
  2. Verify that header bar, search input, segmented category buttons, and claim modals render without horizontal scrollbars.
  3. Execute automated Lighthouse Accessibility Audit on `/home`, `/item/:id`, and `/report`.
  4. Recruit 10 representative campus users (students, faculty) to file an item report unaided.
* **Expected Output:**
  - Lighthouse Accessibility Score $\ge 95/100$; zero contrast violations below $4.5:1$.
  - All form controls, buttons, and photos fit within the mobile viewport width ($100\text{vw}$).
  - At least 9 out of 10 users ($90\%$) successfully file a complete report in $< 2$ minutes.
* **Pass/Fail Criteria:** **Pass** if unassisted completion rate $\ge 85\%$ and Lighthouse Accessibility score $\ge 95$.

---

### Test Case 6: `TC-IR-01`
* **Test Case ID:** `TC-IR-01`
* **Traced Requirement:** **IR-01** (3rd-Party Software & Multimodal AI Vision API Interface)
* **Test Title:** Multimodal AI Vision API Integration & 20-Second Timeout Fallback
* **Test Level & Technique:** Interface Integration Testing / Fault Injection (Chaos Testing)
* **Preconditions:** Server running with `ai-vision.js` module.
* **Test Execution Steps:**
  1. Upload a report with a clear photo of a navy blue water bottle while external API key is active.
  2. Verify that AI vision analyzes the photo and populates `aiVisualDescription` and `aiVisualTags`.
  3. Simulate an external network outage by configuring mock proxy to delay API response by 25 seconds (exceeding 20s `AbortController` timeout).
  4. Trigger `POST /api/items/:id/ai-scan`.
* **Expected Output:**
  - Step 2: Returns AI analysis with tags (`["bottle", "blue", "stainless-steel"]`) and confidence $\ge 70$.
  - Step 4: The 20-second timeout aborts the external call; `callClaudeVision` / `callGeminiVision` catches the abort, logs a fallback warning, and immediately triggers `extractVisualAttributesLocal()`.
  - HTTP response returns `200 OK` with valid local computer vision tags. The API does not crash.
* **Pass/Fail Criteria:** **Pass** if external API call integrates successfully and timeout fallback operates seamlessly without 500 error.

---

### Test Case 7: `TC-IR-02`
* **Test Case ID:** `TC-IR-02`
* **Traced Requirement:** **IR-02** (Payment & Security Escrow Handling Interface)
* **Test Title:** Payment Gateway Webhook HMAC-SHA256 Signature Verification & Escrow Settlement
* **Test Level & Technique:** Financial Interface Testing / Webhook Security Validation
* **Preconditions:** Mock payment gateway configured with webhook endpoint `POST /api/payments/webhook`.
* **Test Execution Steps:**
  1. Generate a mock payment checkout token for a ₹30 administrative storage handling fee.
  2. Send a forged webhook payload with an invalid `x-signature` header.
  3. Send a legitimate webhook payload (`payment.captured`, ₹30) signed with the true HMAC-SHA256 key.
  4. Admin calls `POST /api/claims/:id/approve`.
* **Expected Output:**
  - Step 2: Rejected with HTTP `401 Unauthorized` (`"Invalid webhook signature"`).
  - Step 3: Accepted with HTTP `200 OK`; payment record moves to `escrow_held`.
  - Step 4: Claim approval triggers settlement call to payment gateway; status transitions to `settled`. Zero card details stored in MongoDB.
* **Pass/Fail Criteria:** **Pass** if forged webhooks are rejected, valid webhooks verify, and escrow settles upon claim approval.

---

### Test Case 8: `TC-IR-03`
* **Test Case ID:** `TC-IR-03`
* **Traced Requirement:** **IR-03** (External Communication & Notification Dispatch Interface)
* **Test Title:** High-Threshold Notification Dispatch & Gateway Retry with Exponential Backoff
* **Test Level & Technique:** Communication Interface Testing / Mock Gateway Verification
* **Preconditions:** Communication mock logger active. Lost item `L1` (Blue Flask) and Found item `F1` (Blue Flask) exist.
* **Test Execution Steps:**
  1. Trigger match evaluation where computed score is $68\%$ (below threshold).
  2. Trigger match evaluation where computed score is $75\%$ (above 70% threshold).
  3. Simulate communication gateway failure (HTTP 503 Service Unavailable) on first two attempts, succeeding on third attempt.
* **Expected Output:**
  - Step 1: Match saved as `'suggested'`; zero notification dispatches triggered.
  - Step 2: Match saved as `'suggested'`; dispatches dual notifications to lost reporter and found reporter.
  - Step 3: Message dispatcher retries after 5s and 10s backoff; delivers successfully on attempt 3 without message loss.
* **Pass/Fail Criteria:** **Pass** if notifications fire exclusively at $\ge 70\%$ and exponential backoff retry delivers message.

---

### Test Case 9: `TC-IR-04`
* **Test Case ID:** `TC-IR-04`
* **Traced Requirement:** **IR-04** (Client Web & Mobile Presentation Interface)
* **Test Title:** Angular Client HTTP Interceptor Bearer Token Injection & AuthGuard Route Protection
* **Test Level & Technique:** Client-Side Integration Testing (Karma / Jasmine / Angular Router Testing)
* **Preconditions:** Unauthenticated browser session with empty `localStorage`.
* **Test Execution Steps:**
  1. Direct browser navigation to protected URL: `http://localhost:4200/report`.
  2. Verify navigation interception.
  3. Log in with valid credentials (`student@iem.edu.in` / `password123`).
  4. Monitor outgoing network traffic via Chrome DevTools Network Tab during `GET /api/items`.
  5. Click "Log out".
* **Expected Output:**
  - Step 1 & 2: `authGuard` blocks access and redirects to `/login`.
  - Step 4: `authInterceptor` clones HTTP request and injects `Authorization: Bearer eyJ...`. Server responds with `200 OK`.
  - Step 5: `localStorage` is cleared; reactive signal `auth.token()` becomes `null`; user redirected to `/login`.
* **Pass/Fail Criteria:** **Pass** if route guard blocks unauthenticated visits and JWT is injected automatically on all API calls.

---

### Test Case 10: `TC-IR-05`
* **Test Case ID:** `TC-IR-05`
* **Traced Requirement:** **IR-05** (Database Persistence & Storage Wire Protocol Interface)
* **Test Title:** MongoDB Connection Pool Resiliency & TTL Index Expiry Software Verification
* **Test Level & Technique:** Database Interface Testing / Fault Recovery Verification
* **Preconditions:** Express server running with Mongoose connection pool (`maxPoolSize: 50`).
* **Test Execution Steps:**
  1. Verify connection state (`mongoose.connection.readyState === 1`).
  2. Create a `ClaimLock` record with `until = now + 2 seconds`.
  3. Query `lockOf()` immediately ($t = 0\text{s}$).
  4. Query `lockOf()` after 3 seconds ($t = 3\text{s}$) before MongoDB background sweeper runs.
  5. Momentarily disconnect MongoDB network port, make API call, and restore connection.
* **Expected Output:**
  - Step 3: `lockOf()` returns the active lockout record.
  - Step 4: `lockOf()` software check (`record.until > new Date()`) returns `null`, treating lock as expired with sub-second accuracy.
  - Step 5: Mongoose connection pool buffers or reconnects automatically within `serverSelectionTimeoutMS` (10s) without server process termination.
* **Pass/Fail Criteria:** **Pass** if lock expires precisely at deadline and connection pool recovers from transient network drops.

---

### Test Case 11: `TC-CROSS-01`
* **Test Case ID:** `TC-CROSS-01`
* **Traced Requirements:** **NFR-01** (Performance & Latency) & **IR-01** (Multimodal AI Vision API Interface)
* **Test Title:** Multimodal Photo-to-Photo Similarity Scoring Latency Under 3.0 Seconds
* **Test Level & Technique:** End-to-End Multimodal Performance Testing
* **Preconditions:** Staging server configured with active multimodal vision engine. Two items with valid uploaded JPEG photos exist.
* **Test Execution Steps:**
  1. Trigger `compareItemsWithAI(lostItem, foundItem)`.
  2. Record start timestamp ($t_0$) and completion timestamp ($t_1$).
  3. Verify output score structure, reasoning string, and photos count.
* **Expected Output:**
  - Total elapsed execution time $\Delta t = (t_1 - t_0) \le 3.0$ seconds.
  - Output contains integer score ($0 \le \text{score} \le 100$), `method: 'ai'`, and non-empty `reason`.
* **Pass/Fail Criteria:** **Pass** if execution time $\le 3.0\text{s}$ and returned score satisfies integer schema constraints.

---

### Test Case 12: `TC-CROSS-02`
* **Test Case ID:** `TC-CROSS-02`
* **Traced Requirements:** **NFR-03** (Security & Privacy) & **IR-02** (Payment & Security Escrow Handling Interface)
* **Test Title:** Payment Tokenization and PCI-DSS Sensitive Data Segregation Audit
* **Test Level & Technique:** Security Compliance Audit / Data Leakage Inspection
* **Preconditions:** Simulated claim fee payment transaction completed.
* **Test Execution Steps:**
  1. Search MongoDB collections (`items`, `claims`, `users`, `system.profile`) for strings matching credit card patterns (16-digit PAN, CVV, expiry).
  2. Inspect server log files and standard output streams for payment payload logs.
  3. Inspect HTTP responses returned to client upon payment completion.
* **Expected Output:**
  - Zero raw Primary Account Numbers (PAN), CVVs, or cardholder credentials found in MongoDB databases or server log files.
  - Only opaque gateway transaction IDs (e.g., `pay_O9x8Y1zW4...`) and payment status strings (`escrow_held`) are persisted.
* **Pass/Fail Criteria:** **Pass** if 100% of sensitive cardholder data is completely segregated and absent from server storage.

---

## 4. Requirements Traceability Matrix (RTM)

This matrix maps all 5 Non-Functional Requirements (NFR-01 to NFR-05) and all 5 Interface Requirements (IR-01 to IR-05) to their implementing codebase modules and validating test cases.

| Requirement ID | Requirement Summary | Implementing Server & Client Modules | Validating Test Case ID(s) | Compliance Status |
|:---:|---|---|:---:|:---:|
| **NFR-01** | Sub-1.5s API latency under 100 concurrent users; sub-3.0s AI scoring | `server/src/index.js`, `server/src/routes.js`, `server/src/matching.js` | `TC-NFR-01`, `TC-CROSS-01` | **Verified** |
| **NFR-02** | 100k items scalability, sub-50ms indexed search, 5MB upload limit | `server/src/models.js`, `server/src/routes.js` | `TC-NFR-02` | **Verified** |
| **NFR-03** | Bcrypt password/answer hashing, 3-attempt lock, RBAC, JWT security | `server/src/models.js`, `server/src/routes.js`, `server/src/middleware.js` | `TC-NFR-03`, `TC-CROSS-02` | **Verified** |
| **NFR-04** | 99.5% uptime, atomic claim transitions, duplicate suppression, AI fallback | `server/src/routes.js`, `server/src/models.js`, `server/src/ai-vision.js` | `TC-NFR-04`, `TC-IR-05` | **Verified** |
| **NFR-05** | Mobile responsiveness ($\le 520\text{px}$), WCAG 2.1 AA contrast, $\ge 85\%$ usability | `client/src/styles.css`, `client/src/app/pages/*` | `TC-NFR-05` | **Verified** |
| **IR-01** | 3rd-Party Multimodal AI Vision API Interface (Gemini / Claude / OpenAI) | `server/src/ai-vision.js`, `server/src/matching.js` | `TC-IR-01`, `TC-CROSS-01` | **Verified** |
| **IR-02** | Payment Gateway & Escrow Handling Interface (Tokenization, Webhook HMAC) | `server/src/routes.js`, `server/src/models.js` | `TC-IR-02`, `TC-CROSS-02` | **Verified** |
| **IR-03** | Communication Gateway Interface (Email / SMS / Push alerts $\ge 70\%$ threshold) | `server/src/matching.js`, `server/src/routes.js` | `TC-IR-03` | **Verified** |
| **IR-04** | Client Presentation Interface (Angular 17 SPA, Signals, Interceptors, Guards) | `client/src/app/core/*`, `client/src/app/app.routes.ts` | `TC-IR-04` | **Verified** |
| **IR-05** | Database Persistence Interface (MongoDB 8.0 Wire Protocol, Pooling, TTL) | `server/src/index.js`, `server/src/models.js` | `TC-IR-05` | **Verified** |

---

## 5. Execution Guidelines for Test Engineers

1. **Automated Unit & Integration Test Execution:**
   - Execute backend unit test suite: `npm --prefix server test`
   - Execute client build and component tests: `npm --prefix client run build`
2. **Performance & Load Testing Run:**
   - Run k6 performance script: `k6 run tests/load-test.js --vus 100 --duration 5m`
   - Target metrics: Verify $p_{95} \le 1.5\text{s}$ and $0\%$ HTTP 5xx errors (`TC-NFR-01`).
3. **Security Penetration Checklist:**
   - Execute 3 consecutive failed verification attempts on `/api/items/:id/claim`.
   - Confirm HTTP 423 lockout response and TTL index persistence (`TC-NFR-03`).
4. **Interface Fallback Verification:**
   - Temporarily deactivate external API keys in test environment and upload an item image.
   - Confirm that the Embedded Computer Vision Analyzer in `ai-vision.js` executes and populates visual tags seamlessly (`TC-IR-01`).
