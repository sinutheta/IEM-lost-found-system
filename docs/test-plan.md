# Software Test Strategy and Test Plan

IEM Lost & Found Management System  |  Team P8, Section B  |  PCCCS504 – Software Engineering and Project Management, Semester V

# PART A — SOFTWARE TEST STRATEGY DOCUMENT

## A.1  Introduction and Objectives

This document defines how the IEM Lost & Found Management System will be verified and validated. Verification asks “are we building the system right?”: code, design and interfaces are checked against the SRS and the HLD (Auth service, Matching engine, Notifications, Database). Validation asks “are we building the right system?”: the finished web application is checked against the real needs of IEM students, faculty, staff and administrators.

The objectives of testing are to: (1) show that every functional requirement (FR-01 to FR-20) and non-functional requirement (NFR-01 to NFR-05) in the SRS is implemented and testable; (2) find and remove defects as early as possible, especially in the matching logic and claim-verification logic, where a defect could return an item to the wrong person; (3) confirm the measurable targets in the SRS (3-second response for 95% of requests with 100 concurrent users, at least 85% matching accuracy on a 100-pair dataset, at least 80% unassisted report submissions); and (4) give the team and the Faculty In-Charge objective evidence that the system is ready for release.

## A.2  Scope

This strategy applies to the whole web application built on the MEAN stack (MongoDB, Express, Node.js, Angular) and to the following modules: (1) User Management and Authentication – registration, login, logout, sessions; (2) Item Reporting – lost/found reports, predefined categories, edit and cancel; (3) Search and Filter – keyword search, filters by category, location, date and type, report details and status; (4) Matching Engine – comparison of lost and found reports, 0–100% scoring and ranking; (5) Notifications – match alerts via the Email/SMS gateway and in-app; (6) Claim and Verification – claim submission, item-specific verification question, 3-attempt lockout; (7) Administration – dashboard statistics, review of reports and claims, approve/reject, status updates; (8) Item Status Tracking – Reported → Matched → Pending Verification → Returned, plus Cancelled and Rejected; and (9) the Angular user interface (Login, Home, Item Details, Report an Item screens).

## A.3  Levels of Testing

### A.3.1  Unit Testing

Each developer unit-tests their own module in isolation before it is merged. Backend services (auth, matching score calculation, notification service, claim verification, status transitions) are tested with Jest, with MongoDB replaced by an in-memory test database and the Email/SMS gateway replaced by a mock. Angular components, forms and services are tested with Jasmine/Karma. Every function with business logic needs at least one passing, one failing and one boundary-value test. Target: at least 80% statement coverage for the Matching engine, Claim verification and Auth modules, and at least 70% overall.

### A.3.2  Integration Testing

Bottom-up integration will be used, because the lowest-level components (database models and services) are built first and the higher layers depend on them. Order: Database models → Auth, Matching, Notification and Claim services → REST API (Express routes) → Angular UI. Test drivers (Jest + Supertest scripts) call services and API routes that have no caller yet. Stubs replace components that are unavailable or external: a stub Email/SMS gateway that records the alerts it receives (and can be told to fail), and a stub that returns fixed match scores when the Notification service is tested alone. Each new component is added only after the previous level passes its interface tests.

### A.3.3  System Testing

The fully integrated system will be deployed to a staging environment and tested as a black box against the SRS. Functional testing covers every FR-01 to FR-20 using end-to-end scenarios (Cypress for the UI, Postman/Newman for the REST API). Non-functional testing covers performance and scalability (NFR-01, NFR-02) with k6 or Apache JMeter, security (NFR-03), reliability (NFR-04), and matching accuracy and usability (NFR-05). A requirements traceability matrix (FR/NFR → test case ID) will be kept so that no requirement is left untested.

### A.3.4  Acceptance Testing

Alpha testing: conducted by the project team, internally, on the staging server with seeded test data, using the use-case diagram in the SRS as the checklist. Beta testing: a small group of real users (at least 10 IEM students, faculty and staff, plus one person acting as administrator) uses the system without assistance for a fixed period on realistic lost/found cases. Acceptance is decided by the Faculty In-Charge and the end-user representatives. Acceptance requires that the SRS acceptance targets are met (at least 80% of users submit a report unaided) and that no Severity-1 or Severity-2 defect is open.

## A.4  Testing Techniques Used for Test-Case Design

### A.4.1  Black-box techniques

- Equivalence Class Partitioning – applied to registration inputs (institutional vs non-institutional email, user type, empty/valid password), report forms (valid category from the predefined list vs invalid, date in the past vs future), filters, and the match score (below range, 0–69, 70–100, above range, non-numeric). See B.6.
- Boundary Value Analysis – applied to the notification threshold (scores 69, 70, 71), the score range (−1, 0, 100, 101), failed verification attempts (2, 3, 4), failed logins (4, 5, 6), the 30-minute claim lock and 15-minute login block (just before and after expiry), and the 100-concurrent-user limit. See B.6.
- Decision Table Testing – applied to claim verification, where authentication, answer correctness and lock state combine to decide the outcome (FR-12, FR-17, FR-19), and to admin approve/reject decisions (FR-16). See B.7.
- State Transition Testing – applied to the item status life cycle Reported → Matched → Pending Verification → Returned, with Cancelled and Rejected states (FR-14), and to the claim lock state. Valid transitions are executed, and invalid ones (for example Returned → Reported, or editing a cancelled report) must be refused.
- Use-Case / Scenario Testing – each use case in the SRS use-case diagram (report lost item, report found item, search, claim, verify ownership, admin review) is turned into an end-to-end scenario. See B.10.

### A.4.2  White-box techniques

- Statement Coverage – every executable statement in the Matching engine, Claim verification and Auth modules should be executed at least once by the unit tests (target ≥ 80%), measured with the Jest/Istanbul coverage report.
- Branch/Decision Coverage – every true/false outcome of decisions such as score ≥ 70, answer correct/incorrect, claim locked/unlocked, failed attempts ≥ 3 and failed logins ≥ 5 must be exercised (target ≥ 70% overall, 100% of the decisions listed here).
- Path Coverage / Basis Path Testing – applied to the claim-verification function verifyClaimAnswer() (cyclomatic complexity 4, four independent paths). See B.8. The same method will be reused for the match-score calculation function.

## A.5  Testing Types

- Functional testing – all FR-01 to FR-20 are tested at unit, integration and system level. Every requirement must map to at least one test case, and High-priority requirements to at least one positive and one negative case.
- Regression testing – the automated unit tests and an API smoke suite run on every merge to the main branch, and the full regression suite runs before every release to staging. It is triggered by any change to matching/scoring, status transitions, claim verification or authentication, and by every defect fix.
- Performance/load testing – NFR-01 and NFR-02: simulate 100 concurrent users and check that at least 95% of normal requests return within 3 seconds; test with seeded data of 10,000 users and 100,000 reports, and a load of 1,000 new reports per day.
- Security testing – NFR-03: passwords are stored hashed (never in plain text); protected endpoints and admin routes reject unauthenticated or unauthorised requests; verification answers are never returned to other users; login is blocked for 15 minutes after 5 failed attempts; basic injection (NoSQL) and cross-site scripting checks on all input fields; scan with OWASP ZAP.
- Usability testing – NFR-05: at least 80% of test users must submit a report without assistance; the Login, Home, Item Details and Report an Item screens are checked on desktop and mobile browsers for clarity, error messages and consistency with the Figma wireframes.
- Reliability and accuracy testing – NFR-04 and NFR-05: incomplete or invalid report submissions must not create database records; the matching engine must identify at least 85% of the known valid lost–found pairs in a 100-pair test dataset.

## A.6  Debugging Approach

Defects are debugged mainly by cause elimination: the defect is reproduced, the possible causes are listed from the symptom (UI, API request, service, database), and each cause is ruled out with logs, the Node.js/VS Code debugger, Chrome DevTools and MongoDB Compass until one remains. Backtracking is used when the failure point is clear (for example a wrong status in the database), by tracing the code backwards from that point. Brute force (inserting log statements everywhere) is used only as a last resort. Process: (1) the tester logs the defect with steps, expected and actual result and severity; (2) the developer reproduces and fixes it on a separate branch; (3) a unit test that would have caught the defect is added; (4) the tester re-tests the fix and re-runs the related regression tests; (5) the defect is closed only after the fix passes, or re-opened if it does not.

## A.7  Entry and Exit Criteria

| Testing Level | Entry Criteria | Exit Criteria |
|---|---|---|
| Unit Testing | Module code is complete and compiles/lints without errors; unit test cases are written and reviewed; Node, Angular and in-memory MongoDB test environment is ready; requirements for the module are understood (SRS). | All planned unit tests are executed; all Critical/High unit tests pass; coverage targets are met (≥ 80% for matching, claim and auth modules); no open Severity-1/2 defect in the module. |
| Integration Testing | Exit criteria of unit testing are met for all modules being integrated; integration build runs; drivers and stubs (Email/SMS gateway stub) are ready; integration test cases are reviewed. | All planned interface test cases are executed and at least 95% pass; every failure is logged and fixed or accepted by the Test Lead; no open Severity-1/2 defect; data passes correctly between Auth, Matching, Notification, Claim and Database. |
| System Testing | Integration exit criteria are met; the complete build is deployed on the staging server with seeded test data; traceability matrix (FR/NFR → test case) is ready; system test cases are reviewed. | All High-priority FR test cases pass; NFR-01 to NFR-05 targets are met; no open Severity-1/2 defects and no more than 3 open Severity-3 defects, each with an agreed workaround; test summary report is written. |
| Acceptance Testing | System testing exit criteria are met; stable release candidate is deployed; beta users, an administrator account and demo data are available; acceptance criteria are agreed with the Faculty In-Charge. | Beta users complete the main scenarios (report, search, claim); at least 80% submit a report without assistance; no open Severity-1 defect; Faculty In-Charge signs off. |

## A.8  Roles and Responsibilities

| Role | Responsibility |
|---|---|
| Developer | Aditya Narayan (backend), Sinjini Datta (frontend and UI), Arpan Samanta (matching logic and notifications): write and run unit tests for their own modules, fix defects found at any level, prepare stubs/drivers for integration, and support debugging. |
| Test Engineer | Team members cross-testing modules they did not develop (for example the frontend developer tests the backend API and the backend developer tests the UI): design and execute integration and system test cases, record actual results, log defects with severity, and run regression tests after each fix. |
| Test Lead | Bandhan Mukherjee (Documentation and Integration): prepares and maintains this strategy and plan, keeps the traceability matrix, controls integration builds, tracks defects to closure, decides on suspension/resumption, and writes the test summary report. |
| Client / End-user Rep. | Faculty In-Charge, together with a few IEM students, faculty and staff and one administrator-role user: take part in beta testing, confirm that the system meets real needs, and give the final acceptance sign-off. |

## A.9  Test Tools and Environment

Defect tracking: GitHub Issues with labels for severity (1–4) and status (New, Open, Fixed, Re-test, Closed). Unit testing: Jest (backend) and Jasmine/Karma (Angular), with Istanbul for coverage. API and integration testing: Postman/Newman and Jest + Supertest. End-to-end UI testing: Cypress. Performance/load testing: k6 or Apache JMeter. Security: OWASP ZAP and manual checks. Environment: Node.js LTS, Express, Angular, MongoDB (mongodb-memory-server for unit tests, a separate test database for integration/system tests), Chrome, Firefox and Edge on desktop plus a mobile browser, a sandbox/mock Email–SMS gateway, and an automated build/test pipeline on every push. Test data: seeded student, faculty, staff and admin accounts; a dataset of 100 lost–found pairs (with known correct matches) for NFR-05; and a bulk dataset of 10,000 users and 100,000 reports for scalability tests.

## A.10  Risk-Based Considerations

- Matching accuracy and threshold – the score and the 70% notification threshold decide whether owners are alerted, and the SRS requires at least 85% accuracy. Descriptions are free text, so false matches and missed matches are likely; extra effort goes to boundary tests around 70, the 100-pair dataset, and tests with similar items in the same location and time.
- Claim verification and ownership fraud – a defect here could hand an item to the wrong person or expose a verification answer. The 3-attempt lockout, the 30-minute lock, role checks and answer confidentiality get decision-table, path and security testing, plus negative tests.
- Dependence on the Email/SMS gateway – notifications rely on an external service that may be slow or down. Failure and timeout cases are tested with the stub gateway to confirm that reporting and matching still work and that an in-app notification is still stored.
- Tight 6-week schedule and 100-concurrent-user target – performance and integration problems found late are expensive to fix. Load tests and integration tests start as soon as the first end-to-end flow (report → match → notify) works, not at the end.

# PART B — SOFTWARE TEST PLAN

## B.1  Test Plan Identifier

TP-P8-LF-01  (Team P8 – IEM Lost & Found Management System – Test Plan 01: Matching, Notification and Claim Verification)

## B.2  Objective

To verify that the Matching engine, Match Notification and Claim Verification features work as specified in the SRS: that lost and found reports are scored and ranked correctly (FR-10, FR-18), that a notification is generated only when the score is at least 70% (FR-15), and that ownership of an item is verified correctly, with the lockout rule, before a claim can be approved (FR-12, FR-17, FR-19, FR-16, FR-14).

## B.3  Features to be Tested

- Match scoring and ranking – scores from 0% to 100% based on category, description, location, date/time and identifying features; higher scores shown first (FR-10, FR-18)
- Match notification – notification generated when the score is at least 70% (FR-15)
- Claim submission for a found item by identifying the relevant lost-item report (FR-17)
- Item-specific verification question and answer checking (FR-19), including confidentiality of the answer (NFR-03)
- Claim lockout – claim locked for 30 minutes after 3 consecutive failed attempts (FR-12)
- Admin approval or rejection of claims and the resulting status changes: Pending Verification → Returned, or Rejected (FR-16, FR-14)
- Integration of Report service → Matching engine → Notification service → Claim service → Admin, and the end-to-end flow

## B.4  Features Not to be Tested (Out of Scope)

- Registration, login and logout (FR-01, FR-02, FR-09) – belong to the Authentication module and are tested in a separate test plan; here they are only used as preconditions.
- Search, filters, categories, report details, edit and cancel of reports (FR-03 to FR-08) – covered by the Item Reporting and Search test plan.
- Administrator dashboard statistics and user management (FR-13) – reporting features that do not affect matching or claim decisions; covered separately.
- Load and scalability testing (NFR-01, NFR-02) and usability testing (NFR-05) – executed under the strategy in Part A, not in this feature-level plan.
- Internal behaviour of the Email/SMS gateway – a third-party service; only the interface to it is tested, using a stub.
- Native mobile apps – the SRS specifies a web application only (desktop and mobile browsers).

## B.5  Business Rule(s) / Feature Under Test

Rule 1 – Match score and notification: the system compares each lost and found report using category, description, location, date/time and identifying features and gives the pair an integer score from 0 to 100. Possible matches are shown with the highest score first. A match notification is generated only when the score is 70 or more; a pair scoring 0–69 is still stored and shown in the match suggestions, but nobody is notified. Scores outside 0–100 are invalid and must be rejected.

Rule 2 – Claim verification: an authenticated user can claim a found item by identifying the matching lost-item report. The claimant must correctly answer the item-specific verification question before the claim can be approved. An incorrect answer is rejected, and after 3 consecutive incorrect attempts the claim is locked for 30 minutes. Only the administrator can approve or reject a claim and mark the item as Returned, and verification answers are never visible to other users.

## B.6  Black-Box Test Design — Equivalence Partitioning & Boundary Value Analysis

Input under test: match score (integer), valid range 0–100; a notification is generated for scores ≥ 70. Equivalence classes and boundary values are listed below.

| Class Type | Description | Representative Value(s) |
|---|---|---|
| Invalid – below range (EC1) | Score < 0 | −1, −25 |
| Valid – no notification (EC2) | 0 ≤ score ≤ 69: match stored and listed in suggestions, no notification | 0, 35, 69 |
| Valid – notification (EC3) | 70 ≤ score ≤ 100: match stored and notification generated | 70, 85, 100 |
| Invalid – above range (EC4) | Score > 100 | 101, 150 |
| Invalid – not a number (EC5) | Score missing, empty or non-numeric | null, empty, “abc” |

Boundary values selected (BVA): −1, 0, 1, 69, 70, 71, 99, 100, 101. The test cases below combine these boundaries with one representative value from each equivalence class.

| TC ID | Description | Input (Match Score) | Expected Output | Actual Output | Pass/ Fail |
|---|---|---|---|---|---|
| MS-01 | BVA – just below minimum | −1 | Rejected with validation error; no match record saved |  |  |
| MS-02 | BVA – minimum valid | 0 | Match stored; no notification; listed in suggestions |  |  |
| MS-03 | BVA – just above minimum | 1 | Match stored; no notification; listed in suggestions |  |  |
| MS-04 | EC2 representative (mid value) | 35 | Match stored; no notification; listed in suggestions |  |  |
| MS-05 | BVA – just below threshold | 69 | Match stored; no notification; listed in suggestions |  |  |
| MS-06 | BVA – at threshold | 70 | Match stored; notification generated |  |  |
| MS-07 | BVA – just above threshold | 71 | Match stored; notification generated |  |  |
| MS-08 | EC3 representative / ranking check | 85 | Match stored; notification generated; ranked above lower scores |  |  |
| MS-09 | BVA – maximum valid | 100 | Match stored; notification generated |  |  |
| MS-10 | BVA – just above maximum | 101 | Rejected with validation error; no match record saved |  |  |
| MS-11 | EC5 – non-numeric input | “abc” | Rejected with validation error; no match record saved |  |  |

## B.7  Black-Box Test Design — Decision Table Testing

Conditions: C1 = claimant is authenticated (logged in); C2 = verification answer is correct; C3 = claim is not locked (no active 30-minute lock). Action: forward the claim to the administrator, or reject it (and, for a wrong answer, count the failed attempt).

| Rule | C1 – Authenticated | C2 – Answer correct | C3 – Not locked | Action |
|---|---|---|---|---|
| R1 | T | T | T | Forward to admin |
| R2 | T | T | F | Reject – locked |
| R3 | T | F | T | Reject; count failure |
| R4 | T | F | F | Reject – locked |
| R5 | F | T | T | Deny – log in |
| R6 | F | T | F | Deny – log in |
| R7 | F | F | T | Deny – log in |
| R8 | F | F | F | Deny – log in |
| TC ID | Input Set 1 (C1) | Input Set 2 (C2) | Input Set 3 (C3) | Expected Result |
| DT-01 | Logged-in student with valid session | Answer = “Blue” (stored answer “Blue”) | failedAttempts = 0, no lock | Answer accepted; claim forwarded to admin; status Pending Verification |
| DT-02 | Logged-in student | Answer = “Blue” (correct) | Claim locked until now + 10 min | Rejected: claim locked; message shows remaining time; answer not evaluated |
| DT-03 | Logged-in student | Answer = “Red” (stored “Blue”) | failedAttempts = 0, no lock | Rejected: wrong answer; failedAttempts becomes 1; claim not locked |
| DT-04 | Logged-in student | Answer = “Red” (wrong) | Claim locked until now + 20 min | Rejected: claim locked; failedAttempts unchanged |
| DT-05 | No token / session expired | Answer = “Blue” (correct) | No lock | Request refused (401); user redirected to login; no claim change |
| DT-06 | No token / session expired | Answer = “Blue” (correct) | Claim locked | Request refused (401); user redirected to login |
| DT-07 | No token / session expired | Answer = “Red” (wrong) | No lock | Request refused (401); failedAttempts not changed |
| DT-08 | No token / session expired | Answer = “Red” (wrong) | Claim locked | Request refused (401); user redirected to login |

## B.8  White-Box Test Design — Basis Path Testing

Module under test: verifyClaimAnswer(claim, submittedAnswer, now) – claim service function that checks the claimant’s answer against the stored answer, counts consecutive failures and locks the claim for 30 minutes after the 3rd failure (FR-12, FR-19). The listing below is the reference logic for the test; align line numbers with the final code.

```js
function verifyClaimAnswer(claim, submittedAnswer, now) {
  if (isLocked(claim, now)) {                // Node 1 (decision)
    return { status: 'LOCKED' };             // Node 2
  }
  if (answerMatches(submittedAnswer, claim.answer)) {  // Node 3 (decision)
    claim.failedAttempts = 0;                // Node 4
    claim.status = 'VERIFIED';               //   (Node 4)
    return { status: 'VERIFIED' };           //   (Node 4)
  }
  claim.failedAttempts += 1;                 // Node 5
  if (claim.failedAttempts >= 3) {           // Node 6 (decision)
    claim.lockedUntil = now + 30 * 60 * 1000;  // Node 7
    claim.failedAttempts = 0;                //   (Node 7)
    return { status: 'LOCKED' };             //   (Node 7)
  }
  return { status: 'REJECTED' };             // Node 8
}                                            // Node 9 (exit)
```

Control flow graph: Nodes = {1, 2, 3, 4, 5, 6, 7, 8, 9}; Edges: 1→2, 1→3, 2→9, 3→4, 3→5, 4→9, 5→6, 6→7, 6→8, 7→9, 8→9. Cyclomatic complexity V(G) = E − N + 2 = 11 − 9 + 2 = 4 (or decision nodes + 1 = 3 + 1 = 4). Number of independent paths to cover = 4.

| Path # | Path Description | Input Values | Expected Result |
|---|---|---|---|
| P1 | 1 → 2 → 9: claim is already locked; the answer is not checked. | claim.lockedUntil = now + 10 min; submittedAnswer = “Blue” (correct) | Returns LOCKED; failedAttempts and status unchanged |
| P2 | 1 → 3 → 4 → 9: not locked and the answer is correct. | failedAttempts = 1; submittedAnswer = “Blue”; stored answer = “Blue” | Returns VERIFIED; failedAttempts reset to 0; status = VERIFIED |
| P3 | 1 → 3 → 5 → 6 → 8 → 9: wrong answer, fewer than 3 failures. | failedAttempts = 0; submittedAnswer = “Red”; stored answer = “Blue” | Returns REJECTED; failedAttempts = 1; no lock set |
| P4 | 1 → 3 → 5 → 6 → 7 → 9: wrong answer that is the 3rd consecutive failure. | failedAttempts = 2; submittedAnswer = “Red”; stored answer = “Blue” | Returns LOCKED; lockedUntil = now + 30 min; failedAttempts reset to 0 |

## B.9  Integration Test Cases

Integration strategy: bottom-up (Database → Auth, Matching, Notification and Claim services → REST API → Angular UI). Stubs/drivers used: stub Email/SMS gateway (records alerts and can return an error); stub that returns fixed match scores; Jest + Supertest drivers that call the services and API routes directly.

| TC ID | Integration Step | Description | Expected Result |
|---|---|---|---|
| IT-01 | Auth middleware ↔ Claim API | Submit a claim without a valid token, then with a valid token. | Without token: 401 and no claim created. With token: claim created (FR-17). |
| IT-02 | Report service → Matching engine | Save a new found report that resembles an active lost report. | Matching engine is called automatically and a Match record is created for the pair (FR-10). |
| IT-03 | Matching engine ↔ Database | Create matches with scores 40, 72 and 95 and fetch the match list. | Scores are saved as integers 0–100 and returned highest first: 95, 72, 40 (FR-18). |
| IT-04 | Matching engine → Notification service → gateway stub | Generate a match with score 70. | One notification is created and the stub gateway receives exactly one alert; item status becomes Matched (FR-15, FR-14). |
| IT-05 | Matching engine → Notification service | Generate a match with score 69. | Match is stored but no notification is created and the stub gateway receives nothing (FR-15). |
| IT-06 | Notification service → gateway stub (failure) | Make the stub gateway return an error, then generate a match with score 85. | In-app notification is still saved, the error is logged, and the report/match flow is not blocked. |
| IT-07 | Claim service ↔ Report/Match data | Submit a claim for a found item that has a match. | Claim is stored and linked to the lost-item report; item status becomes Pending Verification (FR-14, FR-17). |
| IT-08 | Claim service ↔ Database (lockout) | Send 3 wrong answers, then a 4th (correct) one within 30 minutes. | Failure count and lock are saved; 4th attempt is rejected as locked (FR-12); correct answer works after the lock expires. |
| IT-09 | Claim service ↔ Admin service ↔ Database | Submit the correct answer; then the admin approves one claim and rejects another. | Approved: status Returned. Rejected: status Rejected. Both changes are stored (FR-16, FR-19). |
| IT-10 | Angular claim form ↔ REST API | Enter 3 wrong answers in the UI, then try again. | UI shows the “try again” message each time, then a lock message with the remaining time (FR-12). |

## B.10  System Test Cases (End-to-End, Black-Box)

| TC ID | Scenario | Steps | Expected Result |
|---|---|---|---|
| ST-01 | Full recovery flow (happy path) | 1. Student A reports a lost black backpack.<br>2. Student B reports a found black backpack (same place, same day).<br>3. Student A opens the notification and the match.<br>4. Student A submits a claim and answers the verification question correctly.<br>5. Admin approves the claim. | Match score ≥ 70 and notification sent to A; claim goes to Pending Verification; after approval the status is Returned and A can track it (FR-10, 15, 17, 19, 16, 14). |
| ST-02 | Lost item with no similar found item | 1. User reports a lost item of a category with no found reports.<br>2. Open match suggestions. | Report is saved with status Reported; no match and no notification are shown. |
| ST-03 | Weak match below the threshold | 1. Report a lost item and a found item with a different category and location but a similar name.<br>2. Check match suggestions and notifications. | Score is below 70: pair is listed in suggestions but no notification is generated (FR-15, FR-18). |
| ST-04 | Ranking of several possible matches | 1. Report one lost item.<br>2. Report three found items of varying similarity.<br>3. Open match suggestions. | Matches are shown from the highest score to the lowest, each with a score between 0% and 100% (FR-18). |
| ST-05 | Wrong answers lock the claim | 1. Open a valid claim.<br>2. Enter a wrong answer 3 times in a row.<br>3. Try a 4th time (correct answer).<br>4. Wait 30 minutes and try again. | 3rd wrong answer locks the claim; 4th attempt is refused with the remaining time; after 30 minutes the correct answer is accepted (FR-12). |
| ST-06 | Admin rejects a claim | 1. Claimant passes verification.<br>2. Admin opens the claim and clicks Reject. | Claim status is Rejected; the claimant sees the result; the found item is available for other claims (FR-16, FR-14). |
| ST-07 | Unauthenticated access | 1. Log out.<br>2. Open the claim page and the match page by direct URL. | User is redirected to login; no match or claim data is shown (constraint: only authenticated users submit claims). |
| ST-08 | Confidentiality of the verification answer | 1. User A creates a verification answer.<br>2. User B opens the same item, its API response and the page source. | The stored answer does not appear in any page or response seen by User B (NFR-03). |
| ST-09 | Matching accuracy on test dataset | 1. Load 100 known lost–found pairs.<br>2. Run the matching engine.<br>3. Count the valid pairs found. | At least 85 of the 100 valid pairs are identified (NFR-05). |

## B.11  Test Deliverables

- Test plan document
- Test case documents
- Test execution/results log
- Defect reports
- Test summary report

## B.12  Suspension and Resumption Criteria

Testing will be suspended when: (1) the smoke test fails, so that login, reporting or search cannot be used; (2) a Severity-1 defect (crash, data loss, wrong item status or answer exposure) blocks 30% or more of the remaining test cases; (3) the staging server, test database or gateway stub is unavailable for more than one working day; or (4) the test data is corrupted. Testing will resume when the Test Lead confirms that: the defect is fixed and a new build is deployed; the smoke test passes; the environment and data are restored; and the blocked test cases and the related regression tests have been re-run from the point of suspension.

## B.13  Approval

| Name | Role | Signature | Date |
|---|---|---|---|
| Sinjini Datta | Tech Lead |  |  |
| Bandhan Mukherjee | Project Manager |  |  |
| Aditya Narayan | Test Lead |  |  |
| Arpan Samanta | Tech Co-Lead |  |  |
