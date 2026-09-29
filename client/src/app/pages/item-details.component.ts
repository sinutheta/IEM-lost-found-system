import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UpperCasePipe } from '@angular/common';
import { Api, Item, ago } from '../core/api';
import { fileUrl } from '../core/config';

@Component({
  standalone: true, imports: [RouterLink, FormsModule, UpperCasePipe],
  template: `<header class="bar"><a routerLink="/home" class="back">←</a><h2>Item Details</h2></header>
  @if (item) {
  <div class="pad">
    <div class="photo">@if (item.photo) { <img [src]="fileUrl(item.photo)"> } @else { ITEM PHOTO }</div>
    <div class="title"><h3>{{ item.name }}</h3><span class="badge">{{ item.type | uppercase }}</span></div>
    <small>Reported {{ ago(item.createdAt) }} · {{ item.location }} · Status: {{ item.status.replace('_', ' ') }}</small>
    <div class="label">DESCRIPTION</div><div class="box">{{ item.description || 'No description provided.' }}</div>
    <div class="label">REPORTED BY</div>
    <div class="box who"><div class="avatar"></div><div><b>{{ item.reporter.name }}</b><small>{{ item.reporter.userType }} · {{ item.reporter.department }}</small></div></div>

    @if (!item.isOwner) {
      <div class="btns">
        <a class="btn ghost" [href]="'mailto:' + item.reporter.email">Contact Reporter</a>
        @if (item.type === 'found' && item.status === 'open') { <button class="btn" (click)="openClaim()">Claim This Item</button> }
      </div>
    } @else if (item.status === 'open') {
      <div class="btns"><button class="btn ghost" (click)="cancel()">Cancel this report</button></div>
    }

    @if (question) {
      <div class="label">VERIFICATION QUESTION</div>
      <div class="box">{{ question }}</div>
      <input class="f" style="margin-top:10px" [(ngModel)]="answer" placeholder="Your answer">
      <button class="btn" style="margin-top:10px" (click)="submitClaim()">Submit Claim</button>
    }
    @if (msg) { <div [class]="ok ? 'ok' : 'err'">{{ msg }}</div> }

    @if (matches.length) {
      <div class="label">POSSIBLE MATCHES</div>
      @for (m of matches; track m._id) {
        <a class="row" [routerLink]="['/item', m.other._id]"><div class="grow"><b>{{ m.other.name }}</b><small>{{ m.other.location }}</small></div><span class="badge">{{ m.score }}%</span></a>
      }
    }
  </div>}`,
})
export class ItemDetailsComponent implements OnInit {
  private api = inject(Api); private route = inject(ActivatedRoute); private router = inject(Router);
  ago = ago; fileUrl = fileUrl; item: Item | null = null; matches: any[] = []; question = ''; answer = ''; msg = ''; ok = false;
  ngOnInit() { this.route.paramMap.subscribe(() => this.load()); }
  load() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.question = ''; this.msg = '';
    this.api.item(id).subscribe((i) => { this.item = i; if (i.isOwner) this.api.matches(id).subscribe((m) => (this.matches = m)); else this.matches = []; });
  }
  openClaim() { this.api.question(this.item!._id).subscribe({ next: (r) => { this.question = r.question; this.msg = ''; }, error: (e) => this.fail(e) }); }
  submitClaim() {
    this.api.claim(this.item!._id, this.answer).subscribe({
      next: () => { this.question = ''; this.answer = ''; this.ok = true; this.msg = 'Answer verified! Your claim is now pending admin review.'; this.load(); },
      error: (e) => { this.question = ''; this.fail(e); },
    });
  }
  cancel() { this.api.cancel(this.item!._id).subscribe(() => this.router.navigate(['/my-items'])); }
  private fail(e: any) { this.ok = false; this.msg = e.error?.message || 'Something went wrong'; }
}
