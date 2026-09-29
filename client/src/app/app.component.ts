import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { Auth } from './core/auth';

@Component({
  selector: 'app-root', standalone: true, imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `<div class="phone"><main><router-outlet /></main>
  @if (auth.token()) {
    <nav class="tabs">
      <a routerLink="/home" routerLinkActive="on"><i>⊞</i>Home</a>
      <a routerLink="/report" routerLinkActive="on"><i>+</i>Report</a>
      <a routerLink="/my-items" routerLinkActive="on"><i>☰</i>My Items</a>
      <a routerLink="/profile" routerLinkActive="on"><i>○</i>Profile</a>
    </nav>
  }</div>`,
})
export class AppComponent { auth = inject(Auth); }
