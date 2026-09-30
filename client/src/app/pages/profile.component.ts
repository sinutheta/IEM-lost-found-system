import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth } from '../core/auth';
import { Api, Item } from '../core/api';

@Component({
  standalone: true, imports: [FormsModule],
  template: `<header class="bar"><h2>Profile</h2></header>
  <div class="pad">
    <div class="box who"><div class="avatar"></div><div><b>{{ auth.user()?.name }}</b><small>{{ auth.user()?.email }}</small><small>{{ auth.user()?.userType }} · {{ auth.user()?.department }}</small></div></div>

    @if (auth.user()?.userType === 'admin') {
      <div class="label">MANUAL MATCH</div>
      <div class="box">
        <select class="f" [(ngModel)]="lostId"><option value="">Select a lost report</option>@for (i of lostItems; track i._id) { <option [value]="i._id">{{ i.name }} · {{ i.location }}</option> }</select>
        <select class="f" style="margin-top:8px" [(ngModel)]="foundId"><option value="">Select a found item</option>@for (i of foundItems; track i._id) { <option [value]="i._id">{{ i.name }} · {{ i.location }}</option> }</select>
        <button class="btn sm" style="margin-top:10px" [disabled]="!lostId || !foundId" (click)="link()">Link items</button>
        @if (msg) { <div [class]="ok ? 'ok' : 'err'">{{ msg }}</div> }
      </div>

      <div class="label">MATCH QUEUE</div>
      @for (m of queue; track m._id) {
        <div class="box" style="margin-bottom:10px">
          <div class="title"><b>{{ m.lost?.name }} ↔ {{ m.found?.name }}</b><span class="badge">{{ m.score }}%</span></div>
          <small style="display:block">{{ m.method === 'ai' ? 'AI' : m.method === 'manual' ? 'Manual' : 'Keyword' }} match · {{ m.status }}</small>
          @if (m.reason) { <small style="display:block">{{ m.reason }}</small> }
          @if (m.status === 'suggested') { <div class="btns" style="margin:8px 0 0"><button class="btn sm ghost" (click)="dismiss(m._id)">Dismiss</button></div> }
        </div>
      } @empty { <p class="muted">No active matches.</p> }

      <div class="label">PENDING CLAIMS</div>
      @for (c of claims; track c._id) {
        <div class="box" style="margin-bottom:10px">
          <div class="title"><b>{{ c.item?.name }}</b><span class="badge">{{ c.side === 'finder' ? 'HAND-OVER' : 'OWNER CLAIM' }}</span></div>
          <small style="display:block">Found at: {{ c.item?.location }}</small>
          @if (c.match?.lost) { <small style="display:block">Matched lost report: {{ c.match.lost.name }} ({{ c.match.lost.location }})</small> }
          <small style="display:block">Claimant: {{ c.claimant?.name }} ({{ c.claimant?.email }})</small>
          @if (c.note) { <small style="display:block">Note: {{ c.note }}</small> }
          <div class="btns" style="margin:10px 0 0"><button class="btn sm" (click)="act(c._id, 'approve')">Approve</button><button class="btn sm ghost" (click)="act(c._id, 'reject')">Reject</button></div>
        </div>
      } @empty { <p class="muted">No claims awaiting review.</p> }
    }
    <button class="btn ghost" style="margin-top:20px" (click)="auth.logout()">Log out</button>
  </div>`,
})
export class ProfileComponent implements OnInit {
  auth = inject(Auth); private api = inject(Api);
  claims: any[] = []; queue: any[] = []; lostItems: Item[] = []; foundItems: Item[] = [];
  lostId = ''; foundId = ''; msg = ''; ok = false;
  ngOnInit() { this.refresh(); }
  refresh() {
    if (this.auth.user()?.userType !== 'admin') return;
    this.api.claims().subscribe((r) => (this.claims = r));
    this.api.matchQueue().subscribe((r) => (this.queue = r));
    this.api.items({ type: 'lost' }).subscribe((r) => (this.lostItems = r));
    this.api.items({ type: 'found' }).subscribe((r) => (this.foundItems = r));
  }
  act(id: string, a: 'approve' | 'reject') { this.api.review(id, a).subscribe(() => this.refresh()); }
  dismiss(id: string) { this.api.dismissMatch(id).subscribe(() => this.refresh()); }
  link() {
    this.api.createMatch(this.lostId, this.foundId).subscribe({
      next: () => { this.ok = true; this.msg = 'Linked. Both reporters were notified.'; this.lostId = ''; this.foundId = ''; this.refresh(); },
      error: (e) => { this.ok = false; this.msg = e.error?.message || 'Could not link these items'; },
    });
  }
}