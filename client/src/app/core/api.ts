import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export interface Item { _id: string; type: 'lost' | 'found'; name: string; category: string; description?: string; location: string; date: string; photo?: string; status: string; createdAt: string; reporter: any; isOwner?: boolean; }
export interface MatchRow { _id: string; score: number; method: 'keyword' | 'ai' | 'manual'; reason?: string; photos?: number; status: string; side: 'owner' | 'finder'; other: any; }
export const CATEGORIES = ['Wallet', 'ID Card', 'Electronics', 'Bottle', 'Books & Stationery', 'Keys', 'Bag', 'Clothing', 'Other'];
export const ago = (d: string) => {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
};

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  items(p: { type?: string; q?: string; mine?: boolean } = {}) {
    let params = new HttpParams();
    if (p.type) params = params.set('type', p.type);
    if (p.q) params = params.set('q', p.q);
    if (p.mine) params = params.set('mine', '1');
    return this.http.get<Item[]>('/api/items', { params });
  }
  item(id: string) { return this.http.get<Item>(`/api/items/${id}`); }
  createItem(fd: FormData) { return this.http.post<Item>('/api/items', fd); }
  cancel(id: string) { return this.http.post(`/api/items/${id}/cancel`, {}); }
  question(id: string) { return this.http.get<{ question: string }>(`/api/items/${id}/question`); }
  claim(id: string, answer: string) { return this.http.post(`/api/items/${id}/claim`, { answer }); }

  // matching
  matches(id: string) { return this.http.get<MatchRow[]>(`/api/items/${id}/matches`); }
  rematch(id: string) { return this.http.post(`/api/items/${id}/rematch`, {}); }
  createMatch(lostId: string, foundId: string) { return this.http.post('/api/matches', { lostId, foundId }); }
  dismissMatch(id: string) { return this.http.post(`/api/matches/${id}/dismiss`, {}); }
  claimMatch(id: string, answer = '', note = '') { return this.http.post(`/api/matches/${id}/claim`, { answer, note }); }
  matchQueue() { return this.http.get<any[]>('/api/matches'); }

  // admin + notifications
  claims() { return this.http.get<any[]>('/api/claims'); }
  review(id: string, action: 'approve' | 'reject') { return this.http.post(`/api/claims/${id}/${action}`, {}); }
  notifications() { return this.http.get<any[]>('/api/notifications'); }
  markRead() { return this.http.post('/api/notifications/read', {}); }
}