import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UpperCasePipe } from '@angular/common';
import { Api, Item, CATEGORIES, ago } from '../core/api';
import { fileUrl } from '../core/config';

@Component({
  standalone: true, imports: [RouterLink, FormsModule, UpperCasePipe],
  template: `<header class="bar"><h2>IEM Lost &amp; Found</h2></header>
  <div class="pad">
    <div class="search"><span>⌕</span><input [(ngModel)]="q" (ngModelChange)="load()" placeholder="Search by item name or keyword..."></div>
    <div class="pills">@for (f of filters; track f.v) { <button [class.on]="type === f.v" (click)="type = f.v; load()">{{ f.l }}</button> }</div>
    
    <div class="box" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" (click)="showFilters = !showFilters">
        <b>Filters {{ filterCount ? '(' + filterCount + ' active)' : '' }}</b>
        <small class="link">{{ showFilters ? 'Hide ▲' : 'Show Filters ▼' }}</small>
      </div>
      @if (showFilters) {
        <div style="margin-top:10px">
          <label style="margin:4px 0 2px">CATEGORY</label>
          <select class="f" [(ngModel)]="category" (ngModelChange)="load()">
            <option value="">All Categories</option>
            @for (c of cats; track c) { <option [value]="c">{{ c }}</option> }
          </select>

          <label style="margin:8px 0 2px">LOCATION</label>
          <input class="f" [(ngModel)]="location" (ngModelChange)="load()" placeholder="e.g. Library, Canteen, Main Gate">

          <div style="display:flex;gap:8px;margin-top:8px">
            <div style="flex:1">
              <label style="margin:0 0 2px">FROM DATE</label>
              <input class="f" type="date" [(ngModel)]="fromDate" (ngModelChange)="load()">
            </div>
            <div style="flex:1">
              <label style="margin:0 0 2px">TO DATE</label>
              <input class="f" type="date" [(ngModel)]="toDate" (ngModelChange)="load()">
            </div>
          </div>

          @if (hasCustomFilters) {
            <button class="btn ghost sm" style="margin-top:10px" (click)="resetFilters()">Clear Filters</button>
          }
        </div>
      }
    </div>

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
  cats = CATEGORIES;
  showFilters = false;
  category = '';
  location = '';
  fromDate = '';
  toDate = '';
  filters = [{ l: 'All', v: '' }, { l: 'Lost', v: 'lost' }, { l: 'Found', v: 'found' }];

  get filterCount() {
    let c = 0;
    if (this.category) c++;
    if (this.location) c++;
    if (this.fromDate || this.toDate) c++;
    return c;
  }

  get hasCustomFilters() {
    return !!(this.category || this.location || this.fromDate || this.toDate);
  }

  resetFilters() {
    this.category = '';
    this.location = '';
    this.fromDate = '';
    this.toDate = '';
    this.load();
  }

  ngOnInit() { this.load(); }
  load() {
    this.api.items({
      type: this.type,
      q: this.q,
      category: this.category,
      location: this.location,
      fromDate: this.fromDate,
      toDate: this.toDate,
    }).subscribe((r) => (this.items = r));
  }
}
