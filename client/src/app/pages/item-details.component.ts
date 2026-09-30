import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UpperCasePipe } from '@angular/common';
import { Api, Item, MatchRow, ago } from '../core/api';
import { fileUrl } from '../core/config';

@Component({
  standalone: true, imports: [RouterLink, FormsModule, UpperCasePipe],
  styles: [`.why{display:block;margin:6px 0 2px;line-height:1.35}.match{margin-bottom:10px}.match .row{border:0;padding:0 0 4px}`],
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
    }

    @if (question) {
      <div class="label">VERIFICATION QUESTION</div>
      <div class="box">{{ question }}</div>
      <input class="f" style="margin-top:10px" [(ngModel)]="answer" placeholder="Your answer">
      <button class="btn" style="margin-top:10px" (click)="submitClaim()">Submit Claim</button>
    }
    @if (msg) { <div [class]="ok ? 'ok' : 'err'">{{ msg }}</div> }

    @if (item.isOwner) {
      @if (item.status === 'open') {
        <div class="btns">
          <button class="btn ghost sm" [disabled]="finding" (click)="rematch()">{{ finding ? 'Checking…' : 'Find matches again' }}</button>
          <button class="btn ghost sm" (click)="toggleManual()">Match manually</button>
          <button class="btn ghost sm" (click)="cancel()">Cancel report</button>
        </div>
      }

      @if (manualOpen) {
        <div class="box" style="margin-bottom:10px">
          <div class="search"><span>⌕</span><input [(ngModel)]="manualQ" (ngModelChange)="searchManual()" [placeholder]="'Search ' + (item.type === 'lost' ? 'found' : 'lost') + ' items...'"></div>
          @for (o of manualResults; track o._id) {
            <div class="row"><div class="grow"><b>{{ o.name }}</b><small>{{ o.location }} · {{ ago(o.createdAt) }}</small></div>
              <button class="btn sm ghost" style="width:auto;padding:8px 14px" (click)="link(o)">Link</button></div>
          } @empty { <p class="muted">No open items to link.</p> }
        </div>
      }

      <div class="label">POSSIBLE MATCHES</div>
      @for (m of matches; track m._id) {
        <div class="box match">
          <a class="row" [routerLink]="['/item', m.other._id]">
            <div class="thumb">@if (m.other.photo) { <img [src]="fileUrl(m.other.photo)"> } @else { IMG }</div>
            <div class="grow"><b>{{ m.other.name }}</b><small>{{ m.other.type === 'found' ? 'Found' : 'Lost' }} · {{ m.other.location }}</small></div>
            <span class="badge">{{ m.score }}%</span>
          </a>
          <small class="why">{{ why(m) }}</small>

          @if (m.status === 'claimed') {
            <small class="ok">Claim submitted. Both items are out of the queue while an admin reviews.</small>
          } @else if (item.status === 'open') {
            @if (claimingId === m._id) {
              @if (m.side === 'owner') {
                <div class="label">VERIFICATION QUESTION</div>
                <div class="box">{{ claimQuestion || 'Loading…' }}</div>
                <input class="f" style="margin-top:8px" [(ngModel)]="claimAnswer" placeholder="Your answer">
              } @else {
                <textarea class="f" rows="2" [(ngModel)]="claimNote" placeholder="Note for the admin (optional), e.g. where the item is kept"></textarea>
              }
              <div class="btns" style="margin:10px 0 0">
                <button class="btn sm" (click)="submitMatchClaim(m)">Submit</button>
                <button class="btn sm ghost" (click)="claimingId = ''">Cancel</button>
              </div>
            } @else {
              <div class="btns" style="margin:8px 0 0">
                <button class="btn sm" (click)="startMatchClaim(m)">{{ m.side === 'owner' ? 'This is mine: claim' : 'Hand over to owner' }}</button>
                <button class="btn sm ghost" (click)="dismiss(m)">Not a match</button>
              </div>
            }
          }
        </div>
      } @empty { <p class="muted">No matches yet. New reports are checked automatically, or link one manually.</p> }
    }
  </div>}`,
})
export class ItemDetailsComponent implements OnInit {
  private api = inject(Api); private route = inject(ActivatedRoute); private router = inject(Router);
  ago = ago; fileUrl = fileUrl;
  item: Item | null = null; matches: MatchRow[] = [];
  question = ''; answer = ''; msg = ''; ok = false;                                  // claim by browsing
  claimingId = ''; claimQuestion = ''; claimAnswer = ''; claimNote = '';              // claim from a match
  finding = false;
  manualOpen = false; manualQ = ''; manualResults: Item[] = [];

  ngOnInit() { this.route.paramMap.subscribe(() => this.load()); }
  load() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.question = ''; this.claimingId = ''; this.manualOpen = false;
    this.api.item(id).subscribe((i) => { this.item = i; if (i.isOwner) this.loadMatches(); else this.matches = []; });
  }
  loadMatches() { this.api.matches(this.item!._id).subscribe((m) => (this.matches = m)); }

  why(m: MatchRow) {
    const how = m.method === 'ai' ? `AI match (${m.photos === 2 ? 'text + both photos' : m.photos === 1 ? 'text + 1 photo' : 'text only'})`
      : m.method === 'manual' ? 'Linked manually' : 'Keyword match';
    return m.reason ? `${how}: ${m.reason}` : how;
  }

  // ---- claim by browsing
  openClaim() { this.api.question(this.item!._id).subscribe({ next: (r) => { this.question = r.question; this.msg = ''; }, error: (e) => this.fail(e) }); }
  submitClaim() {
    this.api.claim(this.item!._id, this.answer).subscribe({
      next: () => { this.question = ''; this.answer = ''; this.succeed('Answer verified! Your claim is now pending admin review.'); },
      error: (e) => { this.question = ''; this.fail(e); },
    });
  }

  // ---- claim from a match (owner answers the question, finder offers a hand-over)
  startMatchClaim(m: MatchRow) {
    this.claimingId = m._id; this.claimAnswer = ''; this.claimNote = ''; this.claimQuestion = ''; this.msg = '';
    if (m.side === 'owner') this.api.question(m.other._id).subscribe({ next: (r) => (this.claimQuestion = r.question), error: (e) => { this.claimingId = ''; this.fail(e); } });
  }
  submitMatchClaim(m: MatchRow) {
    this.api.claimMatch(m._id, this.claimAnswer, this.claimNote).subscribe({
      next: () => this.succeed('Claim submitted. Both items are out of the queue and waiting for admin review.'),
      error: (e) => { this.claimingId = ''; this.fail(e); this.load(); },
    });
  }
  dismiss(m: MatchRow) { this.api.dismissMatch(m._id).subscribe(() => this.loadMatches()); }

  // ---- re-run matching / manual matching
  rematch() {
    this.finding = true; this.msg = '';
    this.api.rematch(this.item!._id).subscribe({
      next: () => { this.finding = false; this.loadMatches(); this.succeed('Matching finished. New matches (if any) are listed below.', false); },
      error: (e) => { this.finding = false; this.fail(e); },
    });
  }
  toggleManual() { this.manualOpen = !this.manualOpen; if (this.manualOpen) this.searchManual(); }
  searchManual() {
    const wanted = this.item!.type === 'lost' ? 'found' : 'lost';
    this.api.items({ type: wanted, q: this.manualQ }).subscribe((r) => (this.manualResults = r.filter((x) => x.reporter?._id !== this.item!.reporter._id)));
  }
  link(other: Item) {
    const [lostId, foundId] = this.item!.type === 'lost' ? [this.item!._id, other._id] : [other._id, this.item!._id];
    this.api.createMatch(lostId, foundId).subscribe({
      next: () => { this.manualOpen = false; this.loadMatches(); this.succeed('Linked. The other reporter was notified, and you can now claim the match below.', false); },
      error: (e) => this.fail(e),
    });
  }

  cancel() { this.api.cancel(this.item!._id).subscribe(() => this.router.navigate(['/my-items'])); }
  private succeed(text: string, reload = true) { this.ok = true; this.msg = text; if (reload) this.load(); }
  private fail(e: any) { this.ok = false; this.msg = e.error?.message || 'Something went wrong'; }
}