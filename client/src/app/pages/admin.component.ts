import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Auth } from '../core/auth';
import { Api, Item, CATEGORIES, ago } from '../core/api';
import { fileUrl } from '../core/config';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, UpperCasePipe],
  styles: [`
    .admin-nav { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--line); }
    .admin-nav button { padding: 8px 12px; border-radius: 18px; border: 1px solid var(--line); background: #fff; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
    .admin-nav button.active { background: var(--ink); color: #fff; border-color: var(--ink); }
    .stat-card { background: #fff; padding: 10px; border-radius: 8px; border: 1px solid var(--line); text-align: center; }
    .stat-card .val { font-size: 22px; font-weight: 800; color: var(--ink); }
    .stat-card small { display: block; margin-top: 2px; color: var(--mut); }
    .db-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
    .db-table th { text-align: left; padding: 8px 6px; border-bottom: 2px solid var(--line); font-size: 11px; color: var(--mut); }
    .db-table td { padding: 8px 6px; border-bottom: 1px solid var(--line); vertical-align: middle; }
    .ai-pill { display: inline-block; padding: 2px 6px; border-radius: 10px; font-size: 10px; font-weight: 600; background: #e9d8fd; color: #553c9a; margin-right: 4px; }
    .status-sel { font-size: 11px; padding: 4px; border-radius: 4px; border: 1px solid var(--line); background: #fff; }
    .item-card { background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 10px; margin-bottom: 10px; }
  `],
  template: `
    <header class="bar">
      <a routerLink="/profile" class="back">←</a>
      <h2>Admin Console & Database</h2>
    </header>

    <div class="pad">
      <!-- Admin Sub-Navigation -->
      <div class="admin-nav">
        <button [class.active]="tab === 'dash'" (click)="tab = 'dash'">📊 Dashboard</button>
        <button [class.active]="tab === 'items'" (click)="tab = 'items'; loadItems()">📦 Items DB ({{ allItemsTotal }})</button>
        <button [class.active]="tab === 'users'" (click)="tab = 'users'; loadUsers()">👥 Users DB ({{ users.length }})</button>
        <button [class.active]="tab === 'claims'" (click)="tab = 'claims'; loadClaims()">📝 Claims ({{ claims.length }})</button>
        <button [class.active]="tab === 'matches'" (click)="tab = 'matches'; loadMatches()">🤖 AI Matches ({{ matches.length }})</button>
      </div>

      @if (msg) { <div [class]="ok ? 'ok' : 'err'" style="margin-bottom:12px">{{ msg }}</div> }

      <!-- TAB 1: DASHBOARD & STATS -->
      @if (tab === 'dash') {
        <div class="label" style="margin-top:0">SYSTEM METRICS & KPI</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
          <div class="stat-card"><div class="val">{{ stats?.totalReports ?? 0 }}</div><small>Total Reports</small></div>
          <div class="stat-card"><div class="val">{{ stats?.activeReports ?? 0 }}</div><small>Active Reports</small></div>
          <div class="stat-card"><div class="val">{{ stats?.matchedItems ?? 0 }}</div><small>Matched Items</small></div>
          <div class="stat-card"><div class="val">{{ stats?.pendingClaims ?? 0 }}</div><small>Pending Claims</small></div>
          <div class="stat-card"><div class="val">{{ stats?.returnedItemsThisMonth ?? 0 }}</div><small>Returned This Month</small></div>
          <div class="stat-card"><div class="val">{{ stats?.avgTimeToMatch ?? 'N/A' }}</div><small>Avg Time to Match</small></div>
        </div>

        <div class="label">AI VISION & MATCHING ENGINE STATUS</div>
        <div class="box" style="margin-bottom:14px;background:#f8f4ff;border:1px solid #d6bcfa">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#38a169"></span>
            <b>Active Provider:</b> <span>{{ aiEngine?.provider || 'Embedded Vision & Multimodal Engine' }}</span>
          </div>
          <small style="display:block;margin-bottom:8px">Visual feature extraction, photo-to-photo similarity scoring, and cross-modal inspection are actively operational.</small>
          <button class="btn sm" style="background:#553c9a;border-color:#553c9a" [disabled]="scanning" (click)="triggerGlobalAiScan()">
            {{ scanning ? 'Scanning Database with AI…' : '⚡ Run Global AI Visual Re-Match' }}
          </button>
        </div>

        <div class="label">DATABASE MANAGEMENT SHORTCUTS</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn sm ghost" (click)="tab = 'items'; loadItems()">Explore All Items ({{ allItemsTotal }})</button>
          <button class="btn sm ghost" (click)="tab = 'users'; loadUsers()">Manage Campus Users</button>
        </div>
      }

      <!-- TAB 2: ITEMS DATABASE (ALL REPORTS) -->
      @if (tab === 'items') {
        <div class="title" style="margin-bottom:8px">
          <b>Items Database</b>
          <span class="badge">{{ allItemsTotal }} Records</span>
        </div>

        <!-- Filter bar -->
        <div class="search" style="margin-bottom:8px">
          <span>⌕</span>
          <input [(ngModel)]="itemFilter.q" (ngModelChange)="loadItems()" placeholder="Search item, location, reporter...">
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
          <select class="f" style="padding:6px;font-size:12px" [(ngModel)]="itemFilter.type" (ngModelChange)="loadItems()">
            <option value="">All Types (Lost & Found)</option>
            <option value="lost">Lost Only</option>
            <option value="found">Found Only</option>
          </select>
          <select class="f" style="padding:6px;font-size:12px" [(ngModel)]="itemFilter.status" (ngModelChange)="loadItems()">
            <option value="">All Statuses</option>
            <option value="Reported">Reported</option>
            <option value="Matched">Matched</option>
            <option value="Pending Verification">Pending Verification</option>
            <option value="Returned">Returned</option>
            <option value="Cancelled">Cancelled</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>

        @for (item of itemsList; track item._id) {
          <div class="item-card">
            <div style="display:flex;gap:10px;align-items:flex-start">
              <div class="thumb" style="width:50px;height:50px;flex:none">
                @if (item.photo) { <img [src]="fileUrl(item.photo)"> } @else { IMG }
              </div>
              <div style="flex:1;min-width:0">
                <div style="display:flex;justify-content:space-between;align-items:flex-start">
                  <a [routerLink]="['/item', item._id]" style="font-weight:700;color:var(--ink);text-decoration:none">
                    {{ item.name }}
                  </a>
                  <span class="badge" [class.found]="item.type === 'found'" style="font-size:10px;padding:1px 6px">
                    {{ item.type | uppercase }}
                  </span>
                </div>
                <small style="display:block">{{ item.category }} · {{ item.location }}</small>
                <small style="display:block;color:#555">Reporter: {{ item.reporter?.name }} ({{ item.reporter?.userType }})</small>
                @if (item.aiVisualTags && item.aiVisualTags.length > 0) {
                  <div style="margin-top:4px">
                    @for (t of item.aiVisualTags.slice(0, 4); track t) {
                      <span class="ai-pill">{{ t }}</span>
                    }
                  </div>
                }
              </div>
            </div>

            <!-- Controls row -->
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--line)">
              <div style="display:flex;align-items:center;gap:4px">
                <small>Status:</small>
                <select class="status-sel" [ngModel]="item.status" (ngModelChange)="changeItemStatus(item, $event)">
                  <option value="Reported">Reported</option>
                  <option value="Matched">Matched</option>
                  <option value="Pending Verification">Pending Verification</option>
                  <option value="Returned">Returned</option>
                  <option value="Cancelled">Cancelled</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
              <div style="display:flex;gap:6px">
                <button class="btn sm ghost" style="padding:4px 8px;font-size:11px" (click)="reScanItem(item._id)">AI Scan</button>
                <button class="btn sm" style="padding:4px 8px;font-size:11px;background:#c53030;border-color:#c53030" (click)="deleteItem(item._id)">Delete</button>
              </div>
            </div>
          </div>
        } @empty {
          <p class="muted">No items found matching criteria.</p>
        }
      }

      <!-- TAB 3: USERS DATABASE -->
      @if (tab === 'users') {
        <div class="title" style="margin-bottom:8px">
          <b>Campus Users Directory</b>
          <span class="badge">{{ users.length }} Users</span>
        </div>

        <div class="search" style="margin-bottom:10px">
          <span>⌕</span>
          <input [(ngModel)]="userSearch" (ngModelChange)="loadUsers()" placeholder="Search user by name, email, department...">
        </div>

        @for (u of users; track u._id) {
          <div class="item-card">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <b>{{ u.name }}</b>
                <small style="display:block">{{ u.email }}</small>
                <small style="display:block">{{ u.department }} · Joined {{ ago(u.createdAt) }}</small>
                <small style="display:block;color:#555">Reports: {{ u.reportCount }} · Claims: {{ u.claimCount }}</small>
              </div>
              <div style="text-align:right">
                <span class="badge" style="display:inline-block;margin-bottom:6px">{{ u.userType | uppercase }}</span>
                <div>
                  <select class="status-sel" [ngModel]="u.userType" (ngModelChange)="changeUserRole(u._id, $event)">
                    <option value="student">Student</option>
                    <option value="faculty">Faculty</option>
                    <option value="staff">Staff</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        } @empty {
          <p class="muted">No users found.</p>
        }
      }

      <!-- TAB 4: CLAIMS AUDIT DATABASE -->
      @if (tab === 'claims') {
        <div class="title" style="margin-bottom:8px">
          <b>Claims & Verification Audit</b>
          <span class="badge">{{ claims.length }} Claims</span>
        </div>

        <div style="display:flex;gap:6px;margin-bottom:10px">
          <button class="btn sm" [class.ghost]="claimStatusFilter !== ''" (click)="claimStatusFilter = ''; loadClaims()">All</button>
          <button class="btn sm" [class.ghost]="claimStatusFilter !== 'pending_review'" (click)="claimStatusFilter = 'pending_review'; loadClaims()">Pending</button>
          <button class="btn sm" [class.ghost]="claimStatusFilter !== 'approved'" (click)="claimStatusFilter = 'approved'; loadClaims()">Approved</button>
          <button class="btn sm" [class.ghost]="claimStatusFilter !== 'rejected'" (click)="claimStatusFilter = 'rejected'; loadClaims()">Rejected</button>
        </div>

        @for (c of claims; track c._id) {
          <div class="item-card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <b>{{ c.item?.name }}</b>
              <span class="badge" style="font-size:10px;padding:2px 6px">{{ c.status | uppercase }}</span>
            </div>
            <small style="display:block">Item Location: {{ c.item?.location }}</small>
            <small style="display:block">Claimant: {{ c.claimant?.name }} ({{ c.claimant?.email }})</small>
            @if (c.item?.verificationQuestion) {
              <small style="display:block;margin-top:2px"><b>Challenge:</b> {{ c.item.verificationQuestion }}</small>
            }
            @if (c.answer) {
              <small style="display:block;color:#2b6cb0"><b>Submitted Answer:</b> {{ c.answer }}</small>
            }
            @if (c.note) {
              <small style="display:block"><b>Claimant Note:</b> {{ c.note }}</small>
            }
            @if (c.reviewedBy) {
              <small style="display:block;color:#718096">Reviewed by: {{ c.reviewedBy?.name }}</small>
            }

            @if (c.status === 'pending_review') {
              <div class="btns" style="margin:10px 0 0">
                <button class="btn sm" (click)="reviewClaim(c._id, 'approve')">Approve Handover</button>
                <button class="btn sm ghost" (click)="reviewClaim(c._id, 'reject')">Reject</button>
              </div>
            }
          </div>
        } @empty {
          <p class="muted">No claims in this category.</p>
        }
      }

      <!-- TAB 5: AI MATCHES QUEUE & LINKER -->
      @if (tab === 'matches') {
        <div class="title" style="margin-bottom:8px">
          <b>AI Match Queue & Manual Linker</b>
          <span class="badge">{{ matches.length }} Matches</span>
        </div>

        <div class="label" style="margin-top:0">MANUAL MATCH LINKER</div>
        <div class="box" style="margin-bottom:14px">
          <select class="f" [(ngModel)]="lostId">
            <option value="">Select a lost report</option>
            @for (i of lostItems; track i._id) { <option [value]="i._id">{{ i.name }} · {{ i.location }}</option> }
          </select>
          <select class="f" style="margin-top:8px" [(ngModel)]="foundId">
            <option value="">Select a found item</option>
            @for (i of foundItems; track i._id) { <option [value]="i._id">{{ i.name }} · {{ i.location }}</option> }
          </select>
          <button class="btn sm" style="margin-top:10px" [disabled]="!lostId || !foundId" (click)="linkItems()">
            Link Items & Dispatch Alerts
          </button>
        </div>

        <div class="label">DETECTED MATCHES</div>
        @for (m of matches; track m._id) {
          <div class="item-card">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <b>{{ m.lost?.name }} ↔ {{ m.found?.name }}</b>
              <span class="badge" style="background:#553c9a;color:#fff;border-color:#553c9a">{{ m.score }}%</span>
            </div>
            <small style="display:block">{{ m.method === 'ai' ? '🤖 AI Multimodal' : m.method === 'manual' ? 'Manual' : 'Keyword' }} Match · Status: {{ m.status }}</small>
            @if (m.reason) {
              <small style="display:block;margin-top:3px;color:#4a5568">{{ m.reason }}</small>
            }
            @if (m.status === 'suggested') {
              <div class="btns" style="margin:8px 0 0">
                <button class="btn sm ghost" (click)="dismissMatch(m._id)">Dismiss False Match</button>
              </div>
            }
          </div>
        } @empty {
          <p class="muted">No matches in queue.</p>
        }
      }
    </div>
  `
})
export class AdminComponent implements OnInit {
  auth = inject(Auth);
  private api = inject(Api);
  fileUrl = fileUrl;
  ago = ago;

  tab: 'dash' | 'items' | 'users' | 'claims' | 'matches' = 'dash';
  msg = '';
  ok = false;
  scanning = false;

  stats: any = null;
  aiEngine: any = null;

  // Items DB
  itemsList: Item[] = [];
  allItemsTotal = 0;
  itemFilter = { q: '', type: '', status: '' };

  // Users DB
  users: any[] = [];
  userSearch = '';

  // Claims DB
  claims: any[] = [];
  claimStatusFilter = '';

  // Matches
  matches: any[] = [];
  lostItems: Item[] = [];
  foundItems: Item[] = [];
  lostId = '';
  foundId = '';

  ngOnInit() {
    this.refreshAll();
  }

  refreshAll() {
    if (this.auth.user()?.userType !== 'admin') return;
    this.api.stats().subscribe((s) => (this.stats = s));
    this.api.adminEngine().subscribe((e) => (this.aiEngine = e));
    this.loadItems();
    this.loadUsers();
    this.loadClaims();
    this.loadMatches();
  }

  loadItems() {
    this.api.adminItems(this.itemFilter).subscribe((res) => {
      this.itemsList = res.items || [];
      this.allItemsTotal = res.total || 0;
    });
  }

  loadUsers() {
    this.api.adminUsers({ q: this.userSearch }).subscribe((res) => {
      this.users = res || [];
    });
  }

  loadClaims() {
    this.api.adminClaims(this.claimStatusFilter).subscribe((res) => {
      this.claims = res || [];
    });
  }

  loadMatches() {
    this.api.adminMatches().subscribe((res) => {
      this.matches = res || [];
    });
    this.api.items({ type: 'lost' }).subscribe((r) => (this.lostItems = r));
    this.api.items({ type: 'found' }).subscribe((r) => (this.foundItems = r));
  }

  changeItemStatus(item: Item, newStatus: string) {
    this.api.adminUpdateStatus(item._id, newStatus).subscribe({
      next: () => {
        item.status = newStatus;
        this.showMsg('Status updated to ' + newStatus, true);
        this.api.stats().subscribe((s) => (this.stats = s));
      },
      error: (e) => this.showMsg(e.error?.message || 'Could not update status', false)
    });
  }

  deleteItem(id: string) {
    if (!confirm('Are you sure you want to permanently delete this report?')) return;
    this.api.deleteItem(id).subscribe({
      next: () => {
        this.showMsg('Item permanently deleted', true);
        this.loadItems();
        this.api.stats().subscribe((s) => (this.stats = s));
      },
      error: (e) => this.showMsg(e.error?.message || 'Could not delete item', false)
    });
  }

  reScanItem(id: string) {
    this.api.aiScan(id).subscribe({
      next: (res) => {
        this.showMsg(res.message, true);
        this.loadItems();
        this.loadMatches();
      },
      error: (e) => this.showMsg(e.error?.message || 'Scan failed', false)
    });
  }

  changeUserRole(userId: string, newRole: string) {
    this.api.adminUpdateRole(userId, newRole).subscribe({
      next: () => {
        this.showMsg(`User role updated to ${newRole}`, true);
        this.loadUsers();
      },
      error: (e) => this.showMsg(e.error?.message || 'Could not update role', false)
    });
  }

  reviewClaim(claimId: string, action: 'approve' | 'reject') {
    this.api.review(claimId, action).subscribe({
      next: () => {
        this.showMsg(`Claim ${action}d successfully`, true);
        this.loadClaims();
        this.loadItems();
        this.api.stats().subscribe((s) => (this.stats = s));
      },
      error: (e) => this.showMsg(e.error?.message || 'Could not review claim', false)
    });
  }

  dismissMatch(id: string) {
    this.api.dismissMatch(id).subscribe(() => this.loadMatches());
  }

  linkItems() {
    this.api.createMatch(this.lostId, this.foundId).subscribe({
      next: () => {
        this.showMsg('Items linked and reporters notified', true);
        this.lostId = '';
        this.foundId = '';
        this.loadMatches();
      },
      error: (e) => this.showMsg(e.error?.message || 'Could not link items', false)
    });
  }

  triggerGlobalAiScan() {
    this.scanning = true;
    this.api.adminScanAll().subscribe({
      next: (res) => {
        this.scanning = false;
        this.showMsg(res.message, true);
        this.refreshAll();
      },
      error: (e) => {
        this.scanning = false;
        this.showMsg(e.error?.message || 'Global scan failed', false);
      }
    });
  }

  private showMsg(m: string, ok: boolean) {
    this.msg = m;
    this.ok = ok;
    setTimeout(() => { if (this.msg === m) this.msg = ''; }, 4000);
  }
}
