import { Component, inject, OnInit } from '@angular/core';
import { Auth } from '../core/auth';
import { Api } from '../core/api';

@Component({
  standalone: true,
  template: `<header class="bar"><h2>Profile</h2></header>
  <div class="pad">
    <div class="box who"><div class="avatar"></div><div><b>{{ auth.user()?.name }}</b><small>{{ auth.user()?.email }}</small><small>{{ auth.user()?.userType }} · {{ auth.user()?.department }}</small></div></div>
    @if (auth.user()?.userType === 'admin') {
      <div class="label">PENDING CLAIMS</div>
      @for (c of claims; track c._id) {
        <div class="box" style="margin-bottom:10px">
          <b>{{ c.item?.name }}</b><small style="display:block">{{ c.item?.location }}</small>
          <small style="display:block">Claimant: {{ c.claimant?.name }} ({{ c.claimant?.email }})</small>
          <div class="btns" style="margin:10px 0 0"><button class="btn sm" (click)="act(c._id, 'approve')">Approve</button><button class="btn sm ghost" (click)="act(c._id, 'reject')">Reject</button></div>
        </div>
      } @empty { <p class="muted">No claims awaiting review.</p> }
    }
    <button class="btn ghost" style="margin-top:20px" (click)="auth.logout()">Log out</button>
  </div>`,
})
export class ProfileComponent implements OnInit {
  auth = inject(Auth); private api = inject(Api);
  claims: any[] = [];
  ngOnInit() { this.refresh(); }
  refresh() { if (this.auth.user()?.userType === 'admin') this.api.claims().subscribe((r) => (this.claims = r)); }
  act(id: string, a: 'approve' | 'reject') { this.api.review(id, a).subscribe(() => this.refresh()); }
}
