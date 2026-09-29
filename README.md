# IEM Lost & Found — MEAN stack
MongoDB + Express + Angular 17 + Node. UI follows the four wireframes (Login, Home, Item Details, Report).

## Run
```bash
# 1) MongoDB running locally, then:
cd server && npm install && cp .env.example .env && npm run seed && npm run dev   # API :3000
cd client && npm install && npm start                                              # UI  :4200
```
Seed logins (password `password123`): student@iem.edu.in, admin@iem.edu.in, security@iem.edu.in

## Flow (from your Activity/Sequence diagrams)
Report item -> matching engine scores 0-100 (>=70 stores a match + notifies both reporters) -> claimant answers the
verification question (wrong answer = 30 min lock via TTL index) -> admin approves in Profile -> item marked returned.
