import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Api, CATEGORIES } from '../core/api';

@Component({
  standalone: true, imports: [FormsModule, RouterLink],
  template: `<header class="bar"><a routerLink="/home" class="back">←</a><h2>Report an Item</h2></header>
  <div class="pad">
    <div class="seg"><button [class.on]="m.type === 'lost'" (click)="m.type = 'lost'">I Lost Something</button><button [class.on]="m.type === 'found'" (click)="m.type = 'found'">I Found Something</button></div>
    <label>ITEM NAME</label><input class="f" [(ngModel)]="m.name" placeholder="e.g. Black Leather Wallet">
    <label>CATEGORY</label><select class="f" [(ngModel)]="m.category"><option value="">Select category</option>@for (c of cats; track c) { <option [value]="c">{{ c }}</option> }</select>
    <label>DESCRIPTION</label><textarea class="f" rows="3" [(ngModel)]="m.description" placeholder="Brief details about the item..."></textarea>
    <label>LOCATION (WHERE LOST / FOUND)</label><input class="f" [(ngModel)]="m.location" placeholder="e.g. Main Library, 1st floor">
    <label>DATE</label><input class="f" type="date" [(ngModel)]="m.date">
    @if (m.type === 'found') {
      <label>VERIFICATION QUESTION</label><input class="f" [(ngModel)]="m.verificationQuestion" placeholder="Something only the owner would know">
      <label>CORRECT ANSWER</label><input class="f" [(ngModel)]="m.verificationAnswer" placeholder="Answer (hidden from claimants)">
    }
    <label>UPLOAD PHOTO (OPTIONAL)</label><input type="file" accept="image/*" (change)="photo = $any($event.target).files[0]">
    @if (err) { <div class="err">{{ err }}</div> }
    <button class="btn" style="margin-top:18px" (click)="submit()">SUBMIT REPORT</button>
  </div>`,
})
export class ReportComponent {
  private api = inject(Api); private router = inject(Router);
  cats = CATEGORIES; photo: File | null = null; err = '';
  m: any = { type: 'lost', name: '', category: '', description: '', location: '', date: new Date().toISOString().slice(0, 10), verificationQuestion: '', verificationAnswer: '' };
  submit() {
    const fd = new FormData();
    Object.entries(this.m).forEach(([k, v]) => v && fd.append(k, v as string));
    if (this.photo) fd.append('photo', this.photo);
    this.api.createItem(fd).subscribe({ next: () => this.router.navigate(['/my-items']), error: (e) => (this.err = e.error?.message || 'Could not submit') });
  }
}
