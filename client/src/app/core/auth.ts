import { Injectable, signal, inject } from '@angular/core';
import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { Router, CanActivateFn } from '@angular/router';
import { tap } from 'rxjs';
import { API_URL } from './config';

export interface User { id: string; name: string; email: string; userType: 'student' | 'staff' | 'admin'; department: string; }
type AuthRes = { token: string; user: User };

@Injectable({ providedIn: 'root' })
export class Auth {
  private http = inject(HttpClient);
  private router = inject(Router);
  token = signal<string | null>(localStorage.getItem('token'));
  user = signal<User | null>(JSON.parse(localStorage.getItem('user') || 'null'));
  login(email: string, password: string) { return this.http.post<AuthRes>('/api/auth/login', { email, password }).pipe(tap((r) => this.save(r))); }
  register(body: any) { return this.http.post<AuthRes>('/api/auth/register', body).pipe(tap((r) => this.save(r))); }
  private save(r: AuthRes) { localStorage.setItem('token', r.token); localStorage.setItem('user', JSON.stringify(r.user)); this.token.set(r.token); this.user.set(r.user); }
  logout() { localStorage.clear(); this.token.set(null); this.user.set(null); this.router.navigate(['/login']); }
}
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const t = inject(Auth).token();
  const url = req.url.startsWith('/api') ? API_URL + req.url : req.url;
  return next(req.clone({ url, setHeaders: t ? { Authorization: `Bearer ${t}` } : {} }));
};
export const authGuard: CanActivateFn = () => (inject(Auth).token() ? true : inject(Router).parseUrl('/login'));
