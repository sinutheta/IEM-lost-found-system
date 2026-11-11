# IEM Lost & Found Management System – HLD, UML and UI Prototype

**Institute of Engineering & Management, Kolkata – Department of Computer Science**
Software Engineering and Project Management | PCC-CS504 | Semester V
Lab 3 – System Modeling (UML/DFD) and UI Prototyping (Assignment 3)

- **Team / Group No.:** P8
- **Project Title:** IEM Lost & Found Management System
- **Section / Batch:** B / C4
- **Team members (name – roll no.):** Sinjini Datta – 139; Arpan Samanta – 143; Bandhan Mukherjee – 128; Aditya Narayan – 137

> Diagrams are images in `hld-media/media/`. A text description of each is given below the image so the content can be read without opening it.

## 3. Activity Diagram

![Activity diagram](hld-media/media/image1.png)

Flow: Start → **Register & report item** (category, description, location, date) → **System generates matches** (score 0–100, ≥ 70% triggers notification) → decision **Match ≥ 70%?** — No: item stays listed (end of that branch); Yes: → **Submit claim** (answer verification question) → decision **Answer correct?** — No: claim locked for 30 minutes; Yes: → **Admin approves claim** (marks item as returned) → End.

## 4. Sequence Diagram

![Sequence diagram](hld-media/media/image2.png)

Participants: User, System, Database, Admin. Messages in order:

1. User → System: Submit claim
2. System → Database: Fetch question
3. Database → System: Return question
4. System → User: Show question
5. User → System: Submit answer
6. System → Database: Validate answer
7. Database → System: Match result
8. System → Admin: Notify pending review
9. Admin → System: Approve claim
10. System → Database: Update status: returned
11. System → User: Claim approved

## 5. Design Diagram – UML Class Diagram

![UML class diagram](hld-media/media/image3.png)

| Class | Attributes | Methods |
|---|---|---|
| User | userId: string, name: string, userType: enum | register(), reportItem() |
| ItemReport | reportId: string, category: string, status: enum | edit(), cancel() |
| Match | matchId: string, score: int (0–100), status: enum | notify(), rank() |
| Claim | claimId: string, answer: string, status: enum | submit(), verifyAnswer() |
| Administrator | adminId: string, role: string, department: string | approveClaim(), updateStatus() |

Relationships: User **creates** 1..* ItemReport; ItemReport **generates** 0..* Match; Match is **claimed via** 0..1 Claim; Claim is **reviewed by** 1 Administrator.

## 5b. HLD / Architecture Diagram

![HLD architecture diagram](hld-media/media/image4.png)

- **Client (browser)** talks to the **Lost & Found system**.
- **Application layer:** Auth service (login, sessions), Matching engine (scores lost/found), Notifications (match alerts).
- Notifications sends alerts to an external **Email/SMS gateway**.
- The application layer reads and writes the **Data layer**: Database (users, reports, claims).

## 6. UI Wireframes (Figma)

![Wireframe 1](hld-media/media/image5.png) ![Wireframe 2](hld-media/media/image6.png)

![Wireframe 3](hld-media/media/image7.png) ![Wireframe 4](hld-media/media/image8.png)

Figma "Share prototype" link: https://www.figma.com/make/rHyCeCLdFA1furXKY9XyQM/IEM-Lost-and-Found-UI?t=r2hE8WM89jhHOCii-20&fullscreen=1
