import { Component, inject, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { UpperCasePipe } from '@angular/common';
import { Api, Item, ago } from '../core/api';
import { fileUrl } from '../core/config';

@Component({
  standalone: true, imports: [RouterLink, UpperCasePipe],
  template: `<header class="bar"><h2>My Items</h2></header>
  <div class="pad">
    <div class="label">NOTIFICATIONS</div>
    @for (n of notes; track n._id) { <div class="note" style="cursor:pointer" (click)="open(n)"><span class="dot">{{ n.read ? '○' : '●' }}</span><div>{{ n.message }}<br><small>{{ ago(n.createdAt) }}</small></div></div> }
    @empty { <p class="muted">No notifications yet.</p> }
    <div class="label">MY REPORTS</div>
    @for (i of items; track i._id) {
      <a class="row" [routerLink]="['/item', i._id]">
        <div class="thumb" style="width:44px;height:44px;flex:none">
          @if (i.photo) { <img [src]="fileUrl(i.photo)"> } @else { IMG }
        </div>
        <div class="grow">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <b>{{ i.name }}</b>
            <span class="badge" [class.found]="i.type === 'found'" style="font-size:10px;padding:1px 6px">{{ i.type | uppercase }}</span>
          </div>
          <small>{{ i.location }} · {{ ago(i.createdAt) }} · <span class="badge" style="padding:0 5px;font-size:10px">{{ i.status }}</span></small>
        </div>
      </a>
    } @empty { <p class="muted">You haven't reported anything yet.</p> }
  </div>`,
})
export class MyItemsComponent implements OnInit {
  private api = inject(Api); private router = inject(Router);
  ago = ago; fileUrl = fileUrl; items: Item[] = []; notes: any[] = [];
  ngOnInit() {
    this.api.items({ mine: true }).subscribe((r) => (this.items = r));
    this.api.notifications().subscribe((r) => { this.notes = r; this.api.markRead().subscribe(); });
  }
  open(n: any) { if (n.item) this.router.navigate(['/item', n.item]); }
}