import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../core/auth';

@Component({
  standalone: true, imports: [FormsModule],
  template: `<div class="login">
    <img src="assets/iem-logo.png" class="logo" alt="IEM">
    <h1>IEM LOST &amp; FOUND</h1>
    <small>Institute of Engineering &amp; Management<br>Department of Computer Science</small>
    <form (ngSubmit)="submit()" style="margin-top:24px">
      <label>{{ reg ? 'CREATE ACCOUNT' : 'STUDENT LOGIN' }}</label>
      @if (reg) {
        <input class="f" name="name" [(ngModel)]="name" placeholder="Full name" style="margin-bottom:10px">
        <input class="f" name="dep" [(ngModel)]="department" placeholder="Department" style="margin-bottom:10px">
      }
      <label>EMAIL ID</label> 
      <input class="f" type="email" name="email" [(ngModel)]="email" placeholder="name@iem.edu.in">
      <label>PASSWORD</label>
      <input class="f" type="password" name="pw" [(ngModel)]="password" placeholder="••••••••">
      @if (err) { <div class="err">{{ err }}</div> }
      <button class="btn" style="margin-top:18px">{{ reg ? 'CREATE ACCOUNT' : 'LOG IN' }}</button>
    </form>
    <p class="muted">or</p>
    <button class="btn ghost" (click)="err = 'Google Workspace login is not configured yet'">Log in with Google Workspace</button>
    <p class="muted">{{ reg ? 'Already registered?' : 'New student?' }}
      <button class="link" (click)="reg = !reg; err = ''">{{ reg ? 'Log in' : 'Create account' }}</button></p>
  </div>`,
})
export class LoginComponent {
  private auth = inject(Auth); private router = inject(Router);
  reg = false; name = ''; department = 'Computer Science'; email = ''; password = ''; err = '';
  submit() {
    const req = this.reg ? this.auth.register({ name: this.name, department: this.department, email: this.email, password: this.password }) : this.auth.login(this.email, this.password);
    req.subscribe({ next: () => this.router.navigate(['/home']), error: (e) => (this.err = e.error?.message || 'Something went wrong') });
  }
}
