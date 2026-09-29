import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UpperCasePipe } from '@angular/common';
import { Api, Item, ago } from '../core/api';
import { fileUrl } from '../core/config';

@Component({
  standalone: true, imports: [RouterLink, FormsModule, UpperCasePipe],
  template: `<header class="bar"><h2>IEM Lost &amp; Found</h2></header>
  <div class="pad">
    <div class="search"><span>⌕</span><input [(ngModel)]="q" (ngModelChange)="load()" placeholder="Search by item name or location..."></div>
    <div class="pills">@for (f of filters; track f.v) { <button [class.on]="type === f.v" (click)="type = f.v; load()">{{ f.l }}</button> }</div>
    <div class="label">RECENT REPORTS</div>
    @for (i of items; track i._id) {
      <a class="row" [routerLink]="['/item', i._id]">
        <div class="thumb">@if (i.photo) { <img [src]="fileUrl(i.photo)"> } @else { IMG }</div>
        <div class="grow"><b>{{ i.name }}</b><small>{{ i.type === 'found' ? 'Found' : 'Lost' }} · {{ i.location }} · {{ ago(i.createdAt) }}</small></div>
        <span class="badge" [class.found]="i.type === 'found'">{{ i.type | uppercase }}</span>
      </a>
    } @empty { <p class="muted">No reports found.</p> }
  </div>`,
})
export class HomeComponent implements OnInit {
  private api = inject(Api);
  ago = ago; fileUrl = fileUrl; items: Item[] = []; q = ''; type = '';
  filters = [{ l: 'All', v: '' }, { l: 'Lost', v: 'lost' }, { l: 'Found', v: 'found' }];
  ngOnInit() { this.load(); }
  load() { this.api.items({ type: this.type, q: this.q }).subscribe((r) => (this.items = r)); }
}
