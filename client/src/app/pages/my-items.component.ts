import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UpperCasePipe } from '@angular/common';
import { Api, Item, ago } from '../core/api';

@Component({
  standalone: true, imports: [RouterLink, UpperCasePipe],
  template: `<header class="bar"><h2>My Items</h2></header>
  <div class="pad">
    <div class="label">NOTIFICATIONS</div>
    @for (n of notes; track n._id) { <div class="note"><span class="dot">{{ n.read ? '○' : '●' }}</span><div>{{ n.message }}<br><small>{{ ago(n.createdAt) }}</small></div></div> }
    @empty { <p class="muted">No notifications yet.</p> }
    <div class="label">MY REPORTS</div>
    @for (i of items; track i._id) {
      <a class="row" [routerLink]="['/item', i._id]">
        <div class="grow"><b>{{ i.name }}</b><small>{{ i.type | uppercase }} · {{ i.location }} · {{ i.status.replace('_', ' ') }}</small></div>
      </a>
    } @empty { <p class="muted">You haven't reported anything yet.</p> }
  </div>`,
})
export class MyItemsComponent implements OnInit {
  private api = inject(Api);
  ago = ago; items: Item[] = []; notes: any[] = [];
  ngOnInit() {
    this.api.items({ mine: true }).subscribe((r) => (this.items = r));
    this.api.notifications().subscribe((r) => { this.notes = r; this.api.markRead().subscribe(); });
  }
}
